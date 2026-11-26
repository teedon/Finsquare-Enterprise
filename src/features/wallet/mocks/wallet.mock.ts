import { membersMock } from "@/features/members/mocks/members.mock"
import { SEED_ORGANIZATION_ID } from "@/lib/tenancy/seed-tenant"
import type {
  ApprovalRule, FundingMethod, OrganizationAccount, Wallet, WalletAccess, WalletApproval, WalletAuditLog,
  WalletDataset, WalletLimits, WalletPermission, WalletTransaction, TransactionStatus, TransactionType,
} from "../types/wallet.types"

const orgId = SEED_ORGANIZATION_ID
const daysAgo = (d: number, h = 10) => {
  const x = new Date()
  x.setDate(x.getDate() - d)
  x.setHours(h, (d * 7) % 60, 0, 0)
  return x.toISOString()
}
let seq = 0
export const walletId = (p: string) => `${p}-${Date.now().toString(36)}${(++seq).toString(36)}`

const limits = (single: number, transfer: number, disb: number, fund: number, wd: number): WalletLimits => ({
  singleTransaction: single, dailyTransfer: transfer, dailyDisbursement: disb, dailyFunding: fund, dailyWithdrawal: wd,
})

const wallet = (w: Partial<Wallet> & Pick<Wallet, "id" | "name" | "type" | "accountNumber" | "availableBalance">): Wallet => ({
  organizationId: orgId, accountId: "acct-main", description: "", scope: "organization", bankName: "9PSB", currency: "NGN",
  status: "active", pendingBalance: 0, limits: limits(5_000_000, 10_000_000, 10_000_000, 50_000_000, 2_000_000), createdAt: daysAgo(400), ...w,
})

/**
 * A member wallet holds one member's own money. It receives funds and pays what the member owes,
 * so transfers and disbursements are closed off at zero — it is not a treasury account.
 */
const memberWallet = (memberId: string, availableBalance: number): Wallet => {
  const name = membersMock.find((m) => m.id === memberId)?.name ?? memberId
  return wallet({
    id: `w-member-${memberId}`, name: `${name} · member wallet`, type: "Member", scope: "member",
    memberId, memberName: name, accountNumber: `9830016${memberId.slice(-3)}`,
    description: "Holds this member's own money — contributions, repayments and refunds.",
    availableBalance, limits: limits(500_000, 0, 0, 5_000_000, 500_000),
  })
}

/** Seeded for the members that already appear in contribution and repayment data. */
export const memberWalletsMock: Wallet[] = [
  memberWallet("LFC-002479", 84_500),
  memberWallet("LFC-002481", 32_000),
  memberWallet("LFC-002462", 15_750),
  memberWallet("LFC-002451", 9_200),
  memberWallet("LFC-002438", 4_800),
  memberWallet("LFC-002426", 26_400),
]

export const walletsMock: Wallet[] = [
  wallet({ id: "w-main", name: "Main Organization Wallet", type: "Main Organization", accountNumber: "9830015501", availableBalance: 48_620_000, pendingBalance: 1_250_000, description: "Primary treasury wallet for the organization.", limits: limits(10_000_000, 20_000_000, 20_000_000, 100_000_000, 5_000_000) }),
  // Cash taken at the counter. It is a real account with its own ledger, but it is not bank money:
  // it moves to the main wallet only when it is deposited.
  wallet({ id: "w-cash", name: "Cash on hand", type: "Cash", accountNumber: "—", bankName: "Cash", availableBalance: 0, description: "Money received in cash at the counter, before it is banked.", limits: limits(5_000_000, 10_000_000, 0, 10_000_000, 5_000_000) }),
  wallet({ id: "w-lagos", name: "Lagos Branch Wallet", type: "Branch", scope: "branch", branchId: "branch-lagos", branchName: "Lagos Branch", accountNumber: "9830015503", availableBalance: 6_840_000, description: "Operating wallet for the Lagos Branch.", limits: limits(1_500_000, 3_000_000, 3_000_000, 10_000_000, 500_000) }),
  wallet({ id: "w-ikeja", name: "Ikeja Unit Wallet", type: "Branch", scope: "branch", branchId: "branch-ikeja", branchName: "Ikeja Unit", accountNumber: "9830015504", availableBalance: 3_215_000, description: "Operating wallet for the Ikeja Unit.", limits: limits(1_000_000, 2_000_000, 2_000_000, 8_000_000, 300_000) }),
  wallet({ id: "w-epe", name: "Epe Branch Wallet", type: "Branch", scope: "branch", branchId: "branch-epe", branchName: "Epe Branch", accountNumber: "9830015505", availableBalance: 1_790_000, status: "restricted", description: "Operating wallet for the Epe Branch.", limits: limits(750_000, 1_500_000, 1_500_000, 5_000_000, 250_000) }),
  ...memberWalletsMock,
]

export const accountMock: OrganizationAccount = {
  id: "acct-main", organizationId: orgId, organizationName: "Lagos Farmers Cooperative", verificationStatus: "Verified",
  accountNumber: "9830015500", accountName: "FINSQ/LAGOS FARMERS COOPERATIVE", accountType: "Corporate collection account", currency: "NGN",
  status: "Active", availableBalance: walletsMock.reduce((t, w) => t + w.availableBalance, 0), ledgerBalance: walletsMock.reduce((t, w) => t + w.availableBalance + w.pendingBalance, 0),
  provider: { id: "provider-9psb", name: "9PSB (via banking partner)" }, bankName: "9PSB", createdAt: daysAgo(400), walletIds: walletsMock.map((w) => w.id),
}

const all: WalletPermission[] = ["wallet.view", "wallet.view_balance", "wallet.view_transactions", "wallet.fund", "wallet.transfer", "wallet.withdraw", "wallet.disburse", "wallet.approve_disbursement", "wallet.approve_transfer", "wallet.reverse", "wallet.export", "wallet.cash"]
const read: WalletPermission[] = ["wallet.view", "wallet.view_balance", "wallet.view_transactions"]
export const accessMock: WalletAccess[] = [
  { id: "acc-1", walletId: "*", subjectType: "role", subjectId: "role-super-admin", subjectName: "Super Admin", permissions: all },
  { id: "acc-2", walletId: "*", subjectType: "role", subjectId: "role-finance-manager", subjectName: "Finance Manager", permissions: all.filter((p) => p !== "wallet.withdraw") },
  { id: "acc-3", walletId: "w-main", subjectType: "role", subjectId: "role-finance", subjectName: "Finance Officer", permissions: [...read, "wallet.fund", "wallet.transfer"] },
  { id: "acc-6", walletId: "w-ikeja", subjectType: "user", subjectId: "admin-bola", subjectName: "Bola Ajayi", permissions: [...read, "wallet.fund"] },
  { id: "acc-7", walletId: "*", subjectType: "role", subjectId: "role-auditor", subjectName: "Auditor", permissions: [...read, "wallet.export"] },
]

export const rulesMock: ApprovalRule[] = [
  { id: "rule-t1", kind: "Transfer", label: "Under ₦100,000", minAmount: 0, maxAmount: 99_999, approvalsRequired: 0, approverPermission: "wallet.approve_transfer", separationOfDuties: false },
  { id: "rule-t2", kind: "Transfer", label: "₦100,000 – ₦500,000", minAmount: 100_000, maxAmount: 500_000, approvalsRequired: 1, approverPermission: "wallet.approve_transfer", separationOfDuties: true },
  { id: "rule-t3", kind: "Transfer", label: "Above ₦500,000", minAmount: 500_001, approvalsRequired: 2, approverPermission: "wallet.approve_transfer", separationOfDuties: true },
  { id: "rule-d1", kind: "Disbursement", label: "Loan disbursement", minAmount: 0, maxAmount: 1_999_999, approvalsRequired: 1, approverPermission: "wallet.approve_disbursement", separationOfDuties: true },
  { id: "rule-d2", kind: "Disbursement", label: "Large loan disbursement", minAmount: 2_000_000, approvalsRequired: 2, approverPermission: "wallet.approve_disbursement", separationOfDuties: true },
]

export const fundingMethodsMock: FundingMethod[] = [
  { id: "bank_transfer", label: "Bank transfer", enabled: true, description: "Transfer to the wallet account number from any bank." },
  { id: "card", label: "Card payment", enabled: false, description: "Not enabled for this organization." },
  { id: "ussd", label: "USSD", enabled: false, description: "Not enabled for this organization." },
]

const people = ["Taiwo Akinyemi", "Funmi Adeyemi", "Adesola Ogunleye", "Bola Ajayi"]
const members = ["Chioma Eze", "Tunde Bakare", "Ngozi Obi", "Ibrahim Musa", "Kemi Alabi", "Sade Coker", "Yusuf Lawal"]
const tx = (n: number, d: number, type: TransactionType, w: string, amount: number, dir: "credit" | "debit", status: TransactionStatus, description: string, extra: Partial<WalletTransaction> = {}): WalletTransaction => {
  const wl = walletsMock.find((x) => x.id === w)!
  const by = people[n % people.length]
  return {
    ...extra,
    id: `tx-${n}`, reference: `WTX-${48000 + n}`, date: daysAgo(d, 8 + (n % 9)), description, type, walletId: w, walletName: wl.name, amount, direction: dir, status,
    fee: type === "Withdrawal" ? 50 : type === "Funding" ? 0 : 0, initiatedBy: extra.initiatedBy ?? by, approvedBy: status === "Completed" && amount >= 100_000 && type !== "Funding" ? "Funmi Adeyemi" : undefined,
    sender: dir === "credit" ? extra.sender ?? "External sender" : wl.name, recipient: dir === "debit" ? extra.recipient ?? "Beneficiary" : wl.name,
    related: { branchId: wl.branchId, branchName: wl.branchName, ...extra.related }, metadata: { channel: "Bank transfer", ...extra.metadata },
  }
}
const loanItems: [string, string, string, number][] = [
  ["Chioma Eze", "Business Loan", "branch-lagos", 600_000], ["Tunde Bakare", "Personal Loan", "branch-ikeja", 180_000], ["Ngozi Obi", "Emergency Loan", "branch-epe", 90_000],
  ["Ibrahim Musa", "Education Loan", "branch-lagos", 350_000], ["Kemi Alabi", "Salary Loan", "branch-ikeja", 220_000], ["Sade Coker", "Business Loan", "branch-lagos", 900_000],
]
const txs: WalletTransaction[] = []
let n = 1
for (let d = 58; d >= 1; d -= 3) {
  txs.push(tx(n++, d, "Funding", d % 2 ? "w-main" : "w-main", 1_000_000 + (d % 7) * 450_000, "credit", "Completed", "Wallet funding via bank transfer", { sender: members[d % 7], metadata: { channel: "Bank transfer", bank: "GTBank" } }))
  const li = loanItems[d % loanItems.length]
  txs.push(tx(n++, d - 1 < 1 ? 1 : d - 1, "Loan Disbursement", "w-main", li[3], "debit", "Completed", `Loan disbursement to ${li[0]}`, { recipient: li[0], related: { memberName: li[0], productName: li[1], branchId: li[2], branchName: walletsMock.find((w) => w.branchId === li[2])?.branchName, loanReference: `LN-${5000 + n}` }, metadata: { channel: "Bank transfer", product: li[1] } }))
  if (d % 2 === 0) txs.push(tx(n++, d, "Loan Repayment", "w-main", 80_000 + (d % 5) * 15_000, "credit", "Completed", `Loan repayment from ${members[d % 7]}`, { sender: members[d % 7], related: { memberName: members[d % 7] } }))
  if (d % 3 === 1) txs.push(tx(n++, d, "Contribution", "w-main", 25_000 + (d % 4) * 5_000, "credit", "Completed", "Monthly contribution", { sender: members[(d + 2) % 7] }))
  if (d % 4 === 0) txs.push(tx(n++, d, "Transfer", d % 8 === 0 ? "w-lagos" : "w-ikeja", 500_000, "credit", "Completed", "Branch float from Main Wallet", { sender: "Main Organization Wallet", related: { counterpartWalletId: "w-main" } }))
  if (d % 5 === 0) txs.push(tx(n++, d, "Payment", "w-main", 150_000 + (d % 3) * 30_000, "debit", "Completed", "Vendor payment — office utilities", { recipient: "Ikeja Electric" }))
  if (d % 9 === 0) txs.push(tx(n++, d, "Fee", "w-main", 5_250, "debit", "Completed", "Platform processing fee", { recipient: "FinSquare" }))
}
txs.push(tx(n++, 0, "Funding", "w-main", 1_250_000, "credit", "Processing", "Funding awaiting bank confirmation", { sender: "Emeka Nwosu" }))
txs.push(tx(n++, 1, "Funding", "w-lagos", 400_000, "credit", "Failed", "Funding rejected by sending bank", { sender: "Halima Sani", metadata: { channel: "Bank transfer", failure: "Insufficient funds at source" } }))
txs.push(tx(n++, 2, "Refund", "w-main", 35_000, "debit", "Reversed", "Refund of duplicate contribution", { recipient: "Ngozi Obi" }))
txs.push(tx(n++, 0, "Loan Disbursement", "w-main", 250_000, "debit", "Pending", "Loan disbursement to Adaeze Obi", { recipient: "Adaeze Obi", approvalId: "apr-1", initiatedBy: "Taiwo Akinyemi", related: { applicationId: "app-14", memberName: "Adaeze Obi", productName: "Personal Loan" }, metadata: { product: "Personal Loan" } }))
txs.sort((a, b) => b.date.localeCompare(a.date))
export const transactionsMock = txs

export const approvalsMock: WalletApproval[] = [
  { id: "apr-1", kind: "Disbursement", reference: "APR-1001", walletId: "w-main", amount: 250_000, reason: "Disburse 1 approved loan", requestedBy: "Taiwo Akinyemi", requestedById: "admin-taiwo", requestedAt: daysAgo(0, 9), required: 1, approvals: [], status: "Pending", transactionIds: [txs.find((t) => t.approvalId === "apr-1")!.id], items: [{ applicationId: "app-14", borrowerName: "Adaeze Obi", productName: "Personal Loan", amount: 250_000 }] },
]

export const auditMock: WalletAuditLog[] = [
  { id: "aud-3", at: daysAgo(0, 9), actor: "Taiwo Akinyemi", action: "Disbursement requested", walletId: "w-main", walletName: "Main Organization Wallet", amount: 250_000, reference: "APR-1001", newState: "Pending approval" },
  { id: "aud-4", at: daysAgo(4, 14), actor: "Adesola Ogunleye", action: "Wallet restricted", walletId: "w-epe", walletName: "Epe Branch Wallet", previousState: "active", newState: "restricted", reference: "WLT-ADM" },
  { id: "aud-5", at: daysAgo(9, 11), actor: "Funmi Adeyemi", action: "Limit changed", walletId: "w-main", walletName: "Main Organization Wallet", previousState: "Daily disbursement ₦10,000,000", newState: "Daily disbursement ₦15,000,000" },
]

export function createWalletDataset(): WalletDataset {
  return {
    account: { ...accountMock }, wallets: walletsMock.map((w) => ({ ...w })), access: [...accessMock], transactions: [...transactionsMock], transfers: [],
    approvals: approvalsMock.map((a) => ({ ...a })), rules: [...rulesMock], audit: [...auditMock], fundingMethods: [...fundingMethodsMock], receipts: [],
  }
}

