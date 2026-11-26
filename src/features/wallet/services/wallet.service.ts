import { walletId } from "../mocks/wallet.mock"
import { createMockWalletRepository } from "../repositories/mock-wallet.repository"
import { ApiWalletRepository } from "../repositories/api-wallet.repository"
import type { WalletRepository } from "../repositories/wallet.repository"
import { env } from "@/app/config/env"
import { BANK_CODES } from "../constants/banks"
import { SEED_ORGANIZATION_ID } from "@/lib/tenancy/seed-tenant"
import { checkOutflow, money, requiredApprovals } from "../domain/wallet.rules"
import { CASH_WALLET_NAME, cashReference, cashWalletOf, round2, settledOf } from "../domain/cash.rules"
import type { CashDepositInput, CashReceipt, CashReceiptInput, CashReceiptItem } from "../types/cash.types"
import type {
  Actor, ApprovalRule, DisbursementItem, RelatedRecords, Wallet, WalletAccess, WalletApproval, WalletAuditLog, WalletDataset,
  WalletLimits, WalletStatus, WalletTransaction, WalletType,
} from "../types/wallet.types"

export type Mode = "live" | "simulated" | "blocked"
const now = () => new Date().toISOString()
const num = (prefix: string) => `${prefix}-${Math.floor(10000 + Math.random() * 89999)}`
const acctNo = () => `98${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`

/** The ledger entry a settled cash receipt writes, taken from what it paid. */
const settlementType = (items: CashReceiptItem[]): WalletTransaction["type"] => {
  const kinds = new Set(items.map((item) => item.kind))
  if (kinds.size !== 1) return "Payment"
  return kinds.has("Dues") ? "Dues" : kinds.has("Contribution") ? "Contribution" : "Loan Repayment"
}

/** The module record the settlement points back at, so the statement can open what was paid. */
const settlementRelated = (items: CashReceiptItem[], memberName: string): RelatedRecords => {
  const only = items.length === 1 ? items[0] : undefined
  if (!only) return { memberName }
  if (only.kind === "Contribution") return { memberName, contributionId: only.id, contributionName: only.label }
  if (only.kind === "Dues") return { memberName, duesId: only.id, duesName: only.label }
  return { memberName, loanReference: only.label }
}

/**
 * Mock-backed service. Every method documents what the real backend must enforce:
 * the server is the only source of truth for balances, limits, approvals and audit records.
 */
export class WalletService {
  constructor(private repo: WalletRepository = createMockWalletRepository()) {}
  load = () => this.repo.load()
  subscribe = (l: () => void) => this.repo.subscribe(l)

  /**
   * Listeners told when money lands in a wallet.
   *
   * A wallet must not know who claims its balance, so it does not know about dues: it simply
   * announces that funds arrived and a module that holds a claim on the balance acts on it. The
   * backend replaces this with a scheduled recovery job and an event consumer.
   */
  private creditListeners = new Set<(wallets: Wallet[]) => void>()

  onWalletsCredited(listener: (wallets: Wallet[]) => void): () => void {
    this.creditListeners.add(listener)
    return () => {
      this.creditListeners.delete(listener)
    }
  }

  /** Announces credited wallets. A listener must never be able to break a money movement. */
  private notifyCredited(wallets: (Wallet | undefined)[]) {
    if (this.creditListeners.size === 0) return
    const credited = wallets.filter((wallet): wallet is Wallet => Boolean(wallet))
    if (credited.length === 0) return
    for (const listener of this.creditListeners) {
      try {
        listener(credited)
      } catch {
        /* a failed claim may not fail the payment that funded it */
      }
    }
  }

  private audit(d: WalletDataset, a: Omit<WalletAuditLog, "id" | "at">): WalletAuditLog[] {
    return [{ id: walletId("aud"), at: now(), ...a }, ...d.audit]
  }
  private guard(mode: Mode) {
    if (mode === "blocked") throw new Error("Money movement is disabled in this environment.")
  }
  private patchWallet(d: WalletDataset, id: string, fn: (w: Wallet) => Wallet) {
    return d.wallets.map((w) => (w.id === id ? fn(w) : w))
  }
  private syncAccount(d: WalletDataset, wallets: Wallet[]) {
    // Cash in the drawer is not bank money: it raises the bank balance only when it is deposited.
    const banked = wallets.filter((w) => w.type !== "Cash")
    const available = banked.reduce((t, w) => t + w.availableBalance, 0)
    return { ...d.account, availableBalance: available, ledgerBalance: available + banked.reduce((t, w) => t + w.pendingBalance, 0), walletIds: wallets.map((w) => w.id) }
  }

  async createWallet(input: { name: string; type: WalletType; branchId?: string; branchName?: string; description: string; openingBalance: number }, actor: Actor) {
    const d = await this.repo.load()
    const wallet: Wallet = {
      id: walletId("w"), organizationId: d.account.organizationId, accountId: d.account.id, name: input.name, description: input.description, type: input.type,
      scope: input.type === "Branch" ? "branch" : "organization", branchId: input.branchId, branchName: input.branchName, accountNumber: acctNo(), bankName: d.account.bankName,
      currency: d.account.currency, status: "active", availableBalance: input.openingBalance, pendingBalance: 0, createdAt: now(),
      limits: { singleTransaction: 1_000_000, dailyTransfer: 2_000_000, dailyDisbursement: 2_000_000, dailyFunding: 10_000_000, dailyWithdrawal: 500_000 },
    }
    const wallets = [...d.wallets, wallet]
    await this.repo.commit({ wallets, account: this.syncAccount(d, wallets), audit: this.audit(d, { actor: actor.name, action: "Wallet created", walletId: wallet.id, walletName: wallet.name, newState: wallet.status }) })
    return wallet
  }

  /**
   * Opens the wallet that holds one member's own money, or returns the one they already have.
   * Idempotent, so any module can call it before moving a member's money.
   * The backend must do the same inside the transaction that needs the wallet.
   */
  async ensureMemberWallet(input: { memberId: string; memberName: string; openingBalance?: number }, actor: Actor) {
    const d = await this.repo.load()
    const existing = d.wallets.find((w) => w.scope === "member" && w.memberId === input.memberId)
    if (existing) return existing
    const wallet: Wallet = {
      id: walletId("w"), organizationId: d.account.organizationId, accountId: d.account.id,
      name: `${input.memberName} · member wallet`, description: "Holds this member's own money — contributions, repayments and refunds.",
      type: "Member", scope: "member", memberId: input.memberId, memberName: input.memberName,
      accountNumber: acctNo(), bankName: d.account.bankName, currency: d.account.currency, status: "active",
      availableBalance: input.openingBalance ?? 0, pendingBalance: 0, createdAt: now(),
      // A member wallet receives money and pays contributions and repayments. It is not a
      // treasury account, so transfers and disbursements are closed off at zero.
      limits: { singleTransaction: 500_000, dailyTransfer: 0, dailyDisbursement: 0, dailyFunding: 5_000_000, dailyWithdrawal: 500_000 },
    }
    const wallets = [...d.wallets, wallet]
    await this.repo.commit({ wallets, account: this.syncAccount(d, wallets), audit: this.audit(d, { actor: actor.name, action: "Member wallet opened", walletId: wallet.id, walletName: wallet.name, newState: wallet.status }) })
    return wallet
  }

  /**
   * The organization's cash drawer, or the one it already has. Idempotent, for the same reason as a
   * member wallet: whoever takes cash first also opens the drawer. The backend creates it with the
   * community instead, so this never runs there.
   */
  async ensureCashWallet(actor: Actor) {
    const d = await this.repo.load()
    const existing = cashWalletOf(d.wallets)
    if (existing) return existing
    const wallet: Wallet = {
      id: walletId("w"), organizationId: d.account.organizationId, accountId: d.account.id,
      name: CASH_WALLET_NAME, description: "Money received in cash at the counter, before it is banked.",
      type: "Cash", scope: "organization", accountNumber: "—", bankName: "Cash",
      currency: d.account.currency, status: "active", availableBalance: 0, pendingBalance: 0, createdAt: now(),
      // Cash leaves the drawer as a bank deposit, so a transfer limit applies; it never disburses.
      limits: { singleTransaction: 5_000_000, dailyTransfer: 10_000_000, dailyDisbursement: 0, dailyFunding: 10_000_000, dailyWithdrawal: 5_000_000 },
    }
    const wallets = [...d.wallets, wallet]
    await this.repo.commit({ wallets, account: this.syncAccount(d, wallets), audit: this.audit(d, { actor: actor.name, action: "Cash wallet opened", walletId: wallet.id, walletName: wallet.name, newState: wallet.status }) })
    return wallet
  }

  /**
   * Cash taken at the counter for money a member owes.
   *
   * What the member handed over is **credited** to their wallet and what the receipt settled is
   * **debited** from it, so their statement shows both halves and the change stays as their balance.
   * The cash wallet — never the bank balance — is credited with the full amount. Every entry carries
   * the same reference and names the administrator who took the money, which is what the audit trail
   * reads. One commit, so the two wallets and the receipt can never disagree.
   *
   * The backend performs this as a single transaction; `repo.receiveCash` is that call.
   */
  async receiveCash(input: CashReceiptInput, actor: Actor, mode: Mode): Promise<CashReceipt> {
    this.guard(mode)
    if (!(input.amount > 0)) throw new Error("Enter the amount of cash received.")
    const settled = settledOf(input.items)
    if (settled > input.amount) throw new Error("The receipt cannot settle more than the cash received.")
    if (this.repo.receiveCash) return this.repo.receiveCash(input, actor, mode)

    let d = await this.repo.load()
    let cash = cashWalletOf(d.wallets)
    if (!cash) {
      await this.ensureCashWallet(actor)
      d = await this.repo.load()
      cash = cashWalletOf(d.wallets)
    }
    if (!cash) throw new Error("This organization has no cash wallet yet.")
    if (cash.status !== "active") throw new Error(`The cash wallet is ${cash.status}.`)
    let memberWallet = d.wallets.find((w) => w.scope === "member" && w.memberId === input.memberId)
    if (!memberWallet) {
      await this.ensureMemberWallet({ memberId: input.memberId, memberName: input.memberName }, actor)
      d = await this.repo.load()
      cash = cashWalletOf(d.wallets) ?? cash
      memberWallet = d.wallets.find((w) => w.scope === "member" && w.memberId === input.memberId)
    }
    if (!memberWallet) throw new Error("This member has no wallet to receive the cash.")

    const simulated = mode === "simulated"
    const reference = cashReference()
    const receiptId = walletId("csh")
    const labels = input.items.map((item) => item.label).join(" · ")
    const meta = { reference, receiptId, channel: "cash", ...(simulated ? { simulated: "true" } : {}) }

    const received = this.baseTx(memberWallet, {
      type: "Cash Receipt", amount: input.amount, direction: "credit", description: `Cash received from ${input.memberName}`,
      status: "Completed", initiatedBy: actor.name, sender: actor.name, related: { memberName: input.memberName }, metadata: meta, simulated,
    })
    const payment = settled > 0
      ? this.baseTx(memberWallet, {
          type: settlementType(input.items), amount: settled, direction: "debit", description: labels || "Payment from cash received",
          status: "Completed", initiatedBy: actor.name, recipient: input.memberName, related: settlementRelated(input.items, input.memberName), metadata: meta, simulated,
        })
      : null
    const cashTx = this.baseTx(cash, {
      type: "Cash Receipt", amount: input.amount, direction: "credit", description: `Cash received from ${input.memberName}`,
      status: "Completed", initiatedBy: actor.name, sender: input.memberName, related: { memberName: input.memberName }, metadata: meta, simulated,
    })

    const wallets = d.wallets.map((w) =>
      w.id === cash.id
        ? { ...w, availableBalance: round2(w.availableBalance + input.amount) }
        : w.id === memberWallet.id
          ? { ...w, availableBalance: round2(w.availableBalance + input.amount - settled) }
          : w,
    )
    const receipt: CashReceipt = {
      id: receiptId, organizationId: d.account.organizationId, reference, at: now(),
      memberId: input.memberId, memberName: input.memberName, amount: input.amount, settled, items: input.items,
      receivedById: actor.id, receivedBy: actor.name, note: input.note,
      cashWalletId: cash.id, cashTransactionId: cashTx.id, memberTransactionIds: payment ? [received.id, payment.id] : [received.id], simulated,
    }
    const at = now()
    const entries: WalletAuditLog[] = [
      { id: walletId("aud"), at, actor: actor.name, action: "Cash received", walletId: cash.id, walletName: cash.name, amount: input.amount, reference, transactionId: cashTx.id, previousState: cash.availableBalance.toString(), newState: round2(cash.availableBalance + input.amount).toString() },
      { id: walletId("aud"), at, actor: actor.name, action: `Cash credited to member wallet`, walletId: memberWallet.id, walletName: memberWallet.name, amount: input.amount, reference, transactionId: received.id, previousState: memberWallet.availableBalance.toString(), newState: round2(memberWallet.availableBalance + input.amount).toString() },
      ...(payment
        ? [{ id: walletId("aud"), at, actor: actor.name, action: `Payment settled from member wallet`, walletId: memberWallet.id, walletName: memberWallet.name, amount: settled, reference, transactionId: payment.id, previousState: round2(memberWallet.availableBalance + input.amount).toString(), newState: round2(memberWallet.availableBalance + input.amount - settled).toString() } as WalletAuditLog]
        : []),
    ]

    await this.repo.commit({
      wallets,
      account: this.syncAccount(d, wallets),
      transactions: [cashTx, ...(payment ? [payment] : []), received, ...d.transactions],
      audit: [...entries, ...d.audit],
      receipts: [receipt, ...d.receipts],
    })
    return receipt
  }

  /**
   * Banks cash that was taken at the counter: the drawer falls, the bank rises. A deposit records
   * something that already happened, so it does not wait for approval — the bank reference is what
   * ties it to the deposit slip.
   */
  async depositCash(input: CashDepositInput, actor: Actor, mode: Mode): Promise<{ reference: string }> {
    this.guard(mode)
    if (!(input.amount > 0)) throw new Error("Enter the amount deposited.")
    if (!input.bankReference.trim()) throw new Error("Enter the bank's reference for the deposit.")
    if (this.repo.depositCash) return this.repo.depositCash(input, actor, mode)

    const d = await this.repo.load()
    const cash = cashWalletOf(d.wallets)
    if (!cash) throw new Error("This organization has no cash wallet yet.")
    const bank = d.wallets.find((w) => w.type === "Main Organization")
    if (!bank) throw new Error("The organization has no main wallet to deposit into.")
    if (input.amount > cash.availableBalance) throw new Error(`Only ${money(cash.availableBalance)} is held as cash.`)

    const simulated = mode === "simulated"
    const reference = num("DEP")
    const moved = this.move(d, cash, bank, input.amount, actor.name, undefined, reference, input.note || "Cash deposit", simulated)
    const txs = moved.txs.map((t) => ({
      ...t,
      type: "Cash Deposit" as const,
      description: t.direction === "debit" ? `Cash deposited to ${bank.name} · ${input.bankReference}` : `Cash deposited from the counter · ${input.bankReference}`,
      metadata: { ...t.metadata, bankReference: input.bankReference, ...(input.note ? { note: input.note } : {}) },
    }))
    const at = now()
    const entries: WalletAuditLog[] = [
      { id: walletId("aud"), at, actor: actor.name, action: "Cash deposited to bank", walletId: cash.id, walletName: cash.name, amount: input.amount, reference, transactionId: txs[0].id, previousState: cash.availableBalance.toString(), newState: round2(cash.availableBalance - input.amount).toString() },
      { id: walletId("aud"), at, actor: actor.name, action: "Bank credited from cash deposit", walletId: bank.id, walletName: bank.name, amount: input.amount, reference, transactionId: txs[1].id, previousState: bank.availableBalance.toString(), newState: round2(bank.availableBalance + input.amount).toString() },
    ]
    await this.repo.commit({
      wallets: moved.wallets,
      account: this.syncAccount(d, moved.wallets),
      transactions: [...txs, ...d.transactions],
      audit: [...entries, ...d.audit],
    })
    return { reference }
  }

  async setStatus(id: string, status: WalletStatus, actor: Actor) {
    const d = await this.repo.load()
    const w = d.wallets.find((x) => x.id === id)
    if (!w || w.status === status) return
    await this.repo.commit({ wallets: this.patchWallet(d, id, (x) => ({ ...x, status })), audit: this.audit(d, { actor: actor.name, action: `Wallet ${status}`, walletId: id, walletName: w.name, previousState: w.status, newState: status }) })
  }

  async setLimits(id: string, limits: WalletLimits, actor: Actor) {
    const d = await this.repo.load()
    const w = d.wallets.find((x) => x.id === id)
    if (!w) return
    const prev = Object.entries(w.limits).filter(([k, v]) => limits[k as keyof WalletLimits] !== v).map(([k, v]) => `${k}: ${v}`).join(", ")
    const next = Object.entries(limits).filter(([k, v]) => w.limits[k as keyof WalletLimits] !== v).map(([k, v]) => `${k}: ${v}`).join(", ")
    await this.repo.commit({ wallets: this.patchWallet(d, id, (x) => ({ ...x, limits })), audit: this.audit(d, { actor: actor.name, action: "Limits changed", walletId: id, walletName: w.name, previousState: prev || "—", newState: next || "—" }) })
  }

  async saveAccess(entry: WalletAccess, actor: Actor) {
    const d = await this.repo.load()
    const exists = d.access.some((a) => a.id === entry.id)
    const w = d.wallets.find((x) => x.id === entry.walletId)
    await this.repo.commit({
      access: exists ? d.access.map((a) => (a.id === entry.id ? entry : a)) : [...d.access, entry],
      audit: this.audit(d, { actor: actor.name, action: exists ? "Access updated" : "Access granted", walletId: entry.walletId, walletName: w?.name ?? "All wallets", newState: `${entry.subjectName}: ${entry.permissions.length} permissions` }),
    })
  }
  async removeAccess(id: string, actor: Actor) {
    const d = await this.repo.load()
    const a = d.access.find((x) => x.id === id)
    if (!a) return
    await this.repo.commit({ access: d.access.filter((x) => x.id !== id), audit: this.audit(d, { actor: actor.name, action: "Access revoked", walletId: a.walletId, walletName: d.wallets.find((w) => w.id === a.walletId)?.name ?? "All wallets", previousState: a.subjectName }) })
  }

  async saveRule(rule: ApprovalRule, actor: Actor) {
    const d = await this.repo.load()
    const exists = d.rules.some((r) => r.id === rule.id)
    await this.repo.commit({ rules: exists ? d.rules.map((r) => (r.id === rule.id ? rule : r)) : [...d.rules, rule], audit: this.audit(d, { actor: actor.name, action: exists ? "Approval rule updated" : "Approval rule created", newState: `${rule.kind}: ${rule.label} → ${rule.approvalsRequired} approval(s)` }) })
  }
  async removeRule(id: string, actor: Actor) {
    const d = await this.repo.load()
    const r = d.rules.find((x) => x.id === id)
    if (!r) return
    await this.repo.commit({ rules: d.rules.filter((x) => x.id !== id), audit: this.audit(d, { actor: actor.name, action: "Approval rule removed", previousState: `${r.kind}: ${r.label}` }) })
  }

  private baseTx(w: Wallet, o: Partial<WalletTransaction> & Pick<WalletTransaction, "type" | "amount" | "direction" | "description" | "status" | "initiatedBy">): WalletTransaction {
    return { id: walletId("tx"), reference: num("WTX"), date: now(), walletId: w.id, walletName: w.name, fee: 0, sender: o.direction === "credit" ? "External sender" : w.name, recipient: o.direction === "debit" ? "Beneficiary" : w.name, related: { branchId: w.branchId, branchName: w.branchName }, metadata: {}, ...o }
  }

  /** Funding: the backend credits the wallet only once the bank confirms the inbound transfer. */
  async fund(input: { walletId: string; amount: number; method: string; reference: string; senderName: string }, actor: Actor, mode: Mode) {
    this.guard(mode)
    const d = await this.repo.load()
    const w = d.wallets.find((x) => x.id === input.walletId)
    if (!w) throw new Error("Wallet not found")
    if (w.status === "closed" || w.status === "suspended") throw new Error(`Wallet is ${w.status}.`)
    const simulated = mode === "simulated"
    const t = this.baseTx(w, { type: "Funding", amount: input.amount, direction: "credit", description: input.reference || "Wallet funding", status: simulated ? "Completed" : "Processing", initiatedBy: actor.name, sender: input.senderName || "External sender", metadata: { channel: input.method, ...(simulated ? { simulated: "true" } : {}) }, simulated })
    const wallets = simulated ? this.patchWallet(d, w.id, (x) => ({ ...x, availableBalance: x.availableBalance + input.amount })) : this.patchWallet(d, w.id, (x) => ({ ...x, pendingBalance: x.pendingBalance + input.amount }))
    await this.repo.commit({ wallets, account: this.syncAccount(d, wallets), transactions: [t, ...d.transactions], audit: this.audit(d, { actor: actor.name, action: simulated ? "Funding simulated" : "Funding initiated", walletId: w.id, walletName: w.name, amount: input.amount, reference: t.reference, transactionId: t.id, newState: t.status }) })
    // Only money that has actually landed is available to claim; a pending bank transfer is not.
    if (simulated) this.notifyCredited(wallets.filter((x) => x.id === w.id))
    return t
  }

  /**
   * The transaction PIN is verified by the backend, which also rate-limits attempts and locks the
   * account after repeated failures. There is no stored PIN to check against here, so any four
   * digits are accepted and the field on the form is what enforces the format.
   */
  private verifyPin(pin: string) {
    if (!/^\d{4}$/.test(pin)) throw new Error("Enter your 4-digit transaction PIN.")
  }

  /** Bank transfer out of a wallet. Authorized by transaction PIN; limits and balance are re-validated by the backend. */
  async transferOut(input: { fromId: string; accountNumber: string; bankName: string; accountName: string; amount: number; narration: string; pin: string }, actor: Actor, mode: Mode) {
    this.guard(mode)
    this.verifyPin(input.pin)
    const d = await this.repo.load()
    const from = d.wallets.find((x) => x.id === input.fromId)
    if (!from) throw new Error("Source wallet not found")
    const internal = d.wallets.find((x) => x.accountNumber === input.accountNumber && input.bankName === x.bankName && x.id !== from.id)
    const failed = checkOutflow({ data: d, source: from, amount: input.amount, kind: "Transfer", allowed: true, mode }).find((c) => !c.ok)
    if (failed) throw new Error(`${failed.label}${failed.detail ? ` (${failed.detail})` : ""}`)
    const simulated = mode === "simulated"
    const ref = num("TRF")
    if (internal) {
      const { wallets, txs } = this.move(d, from, internal, input.amount, actor.name, undefined, ref, input.narration, simulated)
      await this.repo.commit({ wallets, account: this.syncAccount(d, wallets), transactions: [...txs, ...d.transactions], audit: this.audit(d, { actor: actor.name, action: simulated ? "Transfer simulated" : "Transfer completed", walletId: from.id, walletName: from.name, amount: input.amount, reference: ref, transactionId: txs[0].id }) })
      this.notifyCredited(wallets.filter((x) => x.id === internal.id))
      return { reference: ref }
    }
    // External bank transfer. A live workspace authorizes the real backend withdrawal; a demo
    // workspace keeps the local simulation below.
    if (mode === "live") {
      const bankCode = BANK_CODES[input.bankName]
      if (!bankCode) throw new Error(`Unsupported bank: ${input.bankName}`)
      return this.repo.withdraw({
        walletId: from.id,
        amount: input.amount,
        accountNumber: input.accountNumber,
        bankCode,
        accountName: input.accountName,
        narration: input.narration,
        pin: input.pin,
      })
    }
    const t = this.baseTx(from, { type: "Transfer", amount: input.amount, direction: "debit", description: input.narration, status: simulated ? "Completed" : "Processing", initiatedBy: actor.name, recipient: `${input.accountName} · ${input.bankName}`, related: { branchId: from.branchId, branchName: from.branchName, accountNumber: input.accountNumber }, metadata: { reference: ref, bank: input.bankName, narration: input.narration, ...(simulated ? { simulated: "true" } : {}) }, simulated })
    const wallets = d.wallets.map((w) => (w.id === from.id ? { ...w, availableBalance: w.availableBalance - input.amount } : w))
    await this.repo.commit({ wallets, account: this.syncAccount(d, wallets), transactions: [t, ...d.transactions], audit: this.audit(d, { actor: actor.name, action: simulated ? "Transfer simulated" : "Transfer initiated", walletId: from.id, walletName: from.name, amount: input.amount, reference: ref, transactionId: t.id }) })
    return { reference: ref }
  }

  /** Transfers: destination access, limits, balance and approvals are re-validated server-side. */
  async transfer(input: { fromId: string; toId: string; amount: number; reason: string; reference: string }, actor: Actor, mode: Mode) {
    this.guard(mode)
    const d = await this.repo.load()
    const from = d.wallets.find((x) => x.id === input.fromId)
    const to = d.wallets.find((x) => x.id === input.toId)
    if (!from || !to || from.organizationId !== to.organizationId) throw new Error("Transfers are only allowed between wallets in the same organization.")
    if (input.amount <= 0 || input.amount > from.availableBalance) throw new Error("Insufficient available balance.")
    const { count } = requiredApprovals(d.rules, "Transfer", input.amount)
    const ref = input.reference || num("TRF")
    const simulated = mode === "simulated"
    const transfer = { id: walletId("trf"), reference: ref, fromWalletId: from.id, toWalletId: to.id, amount: input.amount, reason: input.reason, status: (count === 0 ? "Completed" : "Pending approval") as "Completed" | "Pending approval", createdBy: actor.name, createdAt: now() }
    if (count > 0) {
      const apr: WalletApproval = { id: walletId("apr"), kind: "Transfer", reference: num("APR"), walletId: from.id, targetWalletId: to.id, amount: input.amount, reason: input.reason, requestedBy: actor.name, requestedById: actor.id, requestedAt: now(), required: count, approvals: [], status: "Pending", transactionIds: [] }
      const t = this.baseTx(from, { type: "Transfer", amount: input.amount, direction: "debit", description: `Transfer to ${to.name}`, status: "Pending", initiatedBy: actor.name, recipient: to.name, approvalId: apr.id, related: { branchId: from.branchId, branchName: from.branchName, counterpartWalletId: to.id, accountNumber: to.accountNumber }, metadata: { reason: input.reason, reference: ref }, simulated })
      apr.transactionIds = [t.id]
      await this.repo.commit({ approvals: [apr, ...d.approvals], transactions: [t, ...d.transactions], transfers: [{ ...transfer, approvalId: apr.id }, ...d.transfers], audit: this.audit(d, { actor: actor.name, action: "Transfer requested", walletId: from.id, walletName: from.name, amount: input.amount, reference: apr.reference, newState: `Pending ${count} approval(s)` }) })
      return { status: "pending" as const, approval: apr }
    }
    const { wallets, txs } = this.move(d, from, to, input.amount, actor.name, undefined, ref, input.reason, simulated)
    await this.repo.commit({ wallets, account: this.syncAccount(d, wallets), transactions: [...txs, ...d.transactions], transfers: [transfer, ...d.transfers], audit: this.audit(d, { actor: actor.name, action: simulated ? "Transfer simulated" : "Transfer completed", walletId: from.id, walletName: from.name, amount: input.amount, reference: ref, transactionId: txs[0].id, previousState: from.availableBalance.toString(), newState: (from.availableBalance - input.amount).toString() }) })
    this.notifyCredited(wallets.filter((x) => x.id === to.id))
    return { status: "completed" as const }
  }

  /**
   * Debits a wallet for something the holder owes or has chosen to pay for — a contribution,
   * a loan repayment, a payment. Limits, balance and status are re-validated by the backend.
   */
  async spend(
    input: {
      walletId: string
      amount: number
      /** The ledger entry this writes. */
      type: Extract<WalletTransaction["type"], "Contribution" | "Dues" | "Loan Repayment" | "Payment" | "Withdrawal">
      /** The limit bucket it draws on. */
      kind: "Contribution" | "Withdrawal"
      description: string
      reference: string
      counterparty: string
      related?: RelatedRecords
      allowed?: boolean
    },
    actor: Actor,
    mode: Mode,
  ) {
    this.guard(mode)
    const d = await this.repo.load()
    const from = d.wallets.find((x) => x.id === input.walletId)
    if (!from) throw new Error("Wallet not found")
    const failed = checkOutflow({ data: d, source: from, amount: input.amount, kind: input.kind, allowed: input.allowed ?? true, mode }).find((c) => !c.ok)
    if (failed) throw new Error(`${failed.label}${failed.detail ? ` (${failed.detail})` : ""}`)
    const simulated = mode === "simulated"
    const t = this.baseTx(from, {
      type: input.type, amount: input.amount, direction: "debit", description: input.description,
      status: "Completed", initiatedBy: actor.name, recipient: input.counterparty, simulated,
      related: { branchId: from.branchId, branchName: from.branchName, memberName: from.memberName, ...input.related },
      metadata: { reference: input.reference, ...(simulated ? { simulated: "true" } : {}) },
    })
    const wallets = this.patchWallet(d, from.id, (x) => ({ ...x, availableBalance: round2(x.availableBalance - input.amount) }))
    await this.repo.commit({ wallets, account: this.syncAccount(d, wallets), transactions: [t, ...d.transactions], audit: this.audit(d, { actor: actor.name, action: `${input.type} paid`, walletId: from.id, walletName: from.name, amount: input.amount, reference: input.reference, transactionId: t.id, previousState: from.availableBalance.toString(), newState: (from.availableBalance - input.amount).toString() }) })
    return t
  }

  /** Credits a wallet — a payout, a refund or money received on someone's behalf. */
  async credit(
    input: {
      walletId: string
      amount: number
      type: Extract<WalletTransaction["type"], "Contribution" | "Payment" | "Refund" | "Cash Receipt">
      description: string
      reference: string
      sender: string
      related?: RelatedRecords
    },
    actor: Actor,
    mode: Mode,
  ) {
    this.guard(mode)
    const d = await this.repo.load()
    const to = d.wallets.find((x) => x.id === input.walletId)
    if (!to) throw new Error("Wallet not found")
    if (to.status === "closed" || to.status === "suspended") throw new Error(`Wallet is ${to.status}.`)
    const simulated = mode === "simulated"
    const t = this.baseTx(to, {
      type: input.type, amount: input.amount, direction: "credit", description: input.description,
      status: "Completed", initiatedBy: actor.name, sender: input.sender, simulated,
      related: { branchId: to.branchId, branchName: to.branchName, memberName: to.memberName, ...input.related },
      metadata: { reference: input.reference, ...(simulated ? { simulated: "true" } : {}) },
    })
    const wallets = this.patchWallet(d, to.id, (x) => ({ ...x, availableBalance: round2(x.availableBalance + input.amount) }))
    await this.repo.commit({ wallets, account: this.syncAccount(d, wallets), transactions: [t, ...d.transactions], audit: this.audit(d, { actor: actor.name, action: `${input.type} received`, walletId: to.id, walletName: to.name, amount: input.amount, reference: input.reference, transactionId: t.id, previousState: to.availableBalance.toString(), newState: (to.availableBalance + input.amount).toString() }) })
    this.notifyCredited(wallets.filter((x) => x.id === to.id))
    return t
  }

  private move(d: WalletDataset, from: Wallet, to: Wallet, amount: number, by: string, approvedBy: string | undefined, ref: string, reason: string, simulated: boolean) {
    const wallets = d.wallets.map((w) => (w.id === from.id ? { ...w, availableBalance: w.availableBalance - amount } : w.id === to.id ? { ...w, availableBalance: w.availableBalance + amount } : w))
    const debit = this.baseTx(from, { type: "Transfer", amount, direction: "debit", description: `Transfer to ${to.name}`, status: "Completed", initiatedBy: by, approvedBy, recipient: to.name, related: { branchId: from.branchId, branchName: from.branchName, counterpartWalletId: to.id, accountNumber: to.accountNumber }, metadata: { reason, reference: ref }, simulated })
    const credit = this.baseTx(to, { type: "Transfer", amount, direction: "credit", description: `Transfer from ${from.name}`, status: "Completed", initiatedBy: by, approvedBy, sender: from.name, related: { branchId: to.branchId, branchName: to.branchName, counterpartWalletId: from.id }, metadata: { reason, reference: ref }, simulated })
    return { wallets, txs: [debit, credit] }
  }

  /** Loan disbursement: debits the chosen wallet. The caller finalizes the loan only when status is "completed". */
  async disburse(input: { walletId: string; items: DisbursementItem[]; reason: string }, actor: Actor, mode: Mode) {
    this.guard(mode)
    const d = await this.repo.load()
    const w = d.wallets.find((x) => x.id === input.walletId)
    if (!w) throw new Error("Wallet not found")
    const total = input.items.reduce((s, i) => s + i.amount, 0)
    if (total > w.availableBalance) throw new Error("Insufficient available balance.")
    const { count } = requiredApprovals(d.rules, "Disbursement", total)
    const simulated = mode === "simulated"
    const mk = (i: DisbursementItem, status: WalletTransaction["status"], approvalId?: string, approvedBy?: string) =>
      this.baseTx(w, { type: "Loan Disbursement", amount: i.amount, direction: "debit", description: `Loan disbursement to ${i.borrowerName}`, status, initiatedBy: actor.name, approvedBy, recipient: i.borrowerName, approvalId, related: { branchId: w.branchId, branchName: w.branchName, applicationId: i.applicationId, memberName: i.borrowerName, productName: i.productName, loanReference: i.loanReference }, metadata: { product: i.productName }, simulated })
    if (count > 0) {
      const apr: WalletApproval = { id: walletId("apr"), kind: "Disbursement", reference: num("APR"), walletId: w.id, amount: total, reason: input.reason, requestedBy: actor.name, requestedById: actor.id, requestedAt: now(), required: count, approvals: [], status: "Pending", items: input.items, transactionIds: [] }
      const txs = input.items.map((i) => mk(i, "Pending", apr.id))
      apr.transactionIds = txs.map((t) => t.id)
      await this.repo.commit({ approvals: [apr, ...d.approvals], transactions: [...txs, ...d.transactions], audit: this.audit(d, { actor: actor.name, action: "Disbursement requested", walletId: w.id, walletName: w.name, amount: total, reference: apr.reference, newState: `Pending ${count} approval(s)` }) })
      return { status: "pending" as const, approval: apr }
    }
    const txs = input.items.map((i) => mk(i, "Completed"))
    const wallets = this.patchWallet(d, w.id, (x) => ({ ...x, availableBalance: x.availableBalance - total }))
    await this.repo.commit({ wallets, account: this.syncAccount(d, wallets), transactions: [...txs, ...d.transactions], audit: this.audit(d, { actor: actor.name, action: simulated ? "Disbursement simulated" : "Disbursement completed", walletId: w.id, walletName: w.name, amount: total, reference: txs[0]?.reference, previousState: w.availableBalance.toString(), newState: (w.availableBalance - total).toString() }) })
    return { status: "completed" as const, transactions: txs }
  }

  /** Records an approval vote. Separation of duties and approver permission are re-checked by the backend. */
  async decide(approvalId: string, decision: "approve" | "reject", actor: Actor, note: string, mode: Mode) {
    this.guard(mode)
    const d = await this.repo.load()
    const a = d.approvals.find((x) => x.id === approvalId)
    if (!a || a.status !== "Pending") throw new Error("This approval is no longer pending.")
    const rule = requiredApprovals(d.rules, a.kind, a.amount).rule
    if (rule?.separationOfDuties && a.requestedById === actor.id) throw new Error("The requester cannot approve their own request.")
    if (a.approvals.some((x) => x.byId === actor.id)) throw new Error("You have already approved this request.")
    const w = d.wallets.find((x) => x.id === a.walletId)!
    if (decision === "reject") {
      const txs = d.transactions.map((t) => (a.transactionIds.includes(t.id) ? { ...t, status: "Cancelled" as const } : t))
      await this.repo.commit({ approvals: d.approvals.map((x) => (x.id === a.id ? { ...x, status: "Rejected", decisionNote: note } : x)), transactions: txs, transfers: d.transfers.map((t) => (t.approvalId === a.id ? { ...t, status: "Rejected" } : t)), audit: this.audit(d, { actor: actor.name, action: `${a.kind} rejected`, walletId: w.id, walletName: w.name, amount: a.amount, reference: a.reference, previousState: "Pending", newState: "Rejected", approval: actor.name }) })
      return { final: true, approved: false }
    }
    const approvals = [...a.approvals, { by: actor.name, byId: actor.id, at: now() }]
    if (approvals.length < a.required) {
      await this.repo.commit({ approvals: d.approvals.map((x) => (x.id === a.id ? { ...x, approvals } : x)), audit: this.audit(d, { actor: actor.name, action: `${a.kind} approval (${approvals.length} of ${a.required})`, walletId: w.id, walletName: w.name, amount: a.amount, reference: a.reference, approval: actor.name }) })
      return { final: false, approved: true }
    }
    if (a.amount > w.availableBalance) throw new Error("Insufficient available balance to complete this request.")
    let wallets = d.wallets
    let txs = d.transactions.map((t) => (a.transactionIds.includes(t.id) ? { ...t, status: "Completed" as const, approvedBy: actor.name } : t))
    if (a.kind === "Transfer") {
      const to = d.wallets.find((x) => x.id === a.targetWalletId)!
      const moved = this.move(d, w, to, a.amount, a.requestedBy, actor.name, a.reference, a.reason, mode === "simulated")
      wallets = moved.wallets
      txs = [moved.txs[1], ...txs]
    } else {
      wallets = this.patchWallet(d, w.id, (x) => ({ ...x, availableBalance: x.availableBalance - a.amount }))
    }
    await this.repo.commit({
      wallets, account: this.syncAccount(d, wallets), transactions: txs,
      approvals: d.approvals.map((x) => (x.id === a.id ? { ...x, approvals, status: "Approved", decisionNote: note } : x)),
      transfers: d.transfers.map((t) => (t.approvalId === a.id ? { ...t, status: "Completed" } : t)),
      audit: this.audit(d, { actor: actor.name, action: `${a.kind} approved and completed`, walletId: w.id, walletName: w.name, amount: a.amount, reference: a.reference, previousState: w.availableBalance.toString(), newState: (w.availableBalance - a.amount).toString(), approval: actor.name }),
    })
    if (a.kind === "Transfer" && a.targetWalletId) {
      this.notifyCredited(wallets.filter((x) => x.id === a.targetWalletId))
    }
    return { final: true, approved: true }
  }

  /** Reversal is a correction entry, never a delete. */
  async reverse(txId: string, reason: string, actor: Actor, mode: Mode) {
    this.guard(mode)
    const d = await this.repo.load()
    const t = d.transactions.find((x) => x.id === txId)
    if (!t || t.status !== "Completed") throw new Error("Only completed transactions can be reversed.")
    const w = d.wallets.find((x) => x.id === t.walletId)!
    const delta = t.direction === "credit" ? -t.amount : t.amount
    if (w.availableBalance + delta < 0) throw new Error("Reversal would overdraw the wallet.")
    const entry = this.baseTx(w, { type: "Adjustment", amount: t.amount, direction: t.direction === "credit" ? "debit" : "credit", description: `Reversal of ${t.reference}`, status: "Completed", initiatedBy: actor.name, metadata: { reason, reverses: t.reference }, related: t.related })
    const wallets = this.patchWallet(d, w.id, (x) => ({ ...x, availableBalance: x.availableBalance + delta }))
    await this.repo.commit({ wallets, account: this.syncAccount(d, wallets), transactions: [entry, ...d.transactions.map((x) => (x.id === t.id ? { ...x, status: "Reversed" as const } : x))], audit: this.audit(d, { actor: actor.name, action: "Transaction reversed", walletId: w.id, walletName: w.name, amount: t.amount, reference: t.reference, transactionId: t.id, previousState: "Completed", newState: "Reversed" }) })
  }
}

const services = new Map<string, WalletService>()

/**
 * One service — and therefore one dataset — per community, for the same reason as the loans service:
 * the tenant is ambient, so it is bound where the service is resolved rather than repeated on every
 * call. Wallet screens work inside the community the switcher has active, and a call site that could
 * name another tenant would be a way to spend somebody else's balance.
 */
export function walletServiceFor(organizationId: string): WalletService {
  let service = services.get(organizationId)
  if (!service) {
    service = new WalletService(
      env.VITE_ENABLE_MOCKS ? createMockWalletRepository(organizationId) : new ApiWalletRepository(),
    )
    services.set(organizationId, service)
  }
  return service
}

/** The seeded community's service, for the screens that run without a session. */
export const walletService = walletServiceFor(SEED_ORGANIZATION_ID)
