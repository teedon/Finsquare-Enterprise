import { createTenantStore } from "@/lib/tenancy/tenant-store"
import { memberWalletFor } from "@/features/wallet/domain/wallet.rules"
import { walletServiceFor } from "@/features/wallet/services/wallet.service"
import { buildDuesDataset } from "../mocks/dues.mock"
import { generateCharges, round2, toISODate } from "../domain/schedule"
import { lienRecoverable, outstandingOf, recoveryAllocation, syncCharges } from "../domain/dues.rules"
import type {
  CreateDuesPlanInput,
  DuesCharge,
  DuesDataset,
  DuesLienRules,
  DuesParticipant,
  DuesPlan,
  DuesPlanStatus,
  DuesRecoveryResult,
  DuesTransaction,
  MutationContext,
  RecordDuesPaymentInput,
} from "../types/dues.types"
import type {
  DuesPaymentCommandResult,
  DuesPlanCommandResult,
  DuesRecoveryCommandResult,
  DuesRepository,
} from "./dues.repository"

const emptyDataset = (): DuesDataset => ({
  plans: [],
  participants: [],
  charges: [],
  transactions: [],
})

let sequence = 0
const nextId = (prefix: string) => `${prefix}-${Date.now().toString(36)}${(sequence += 1).toString(36)}`
const reference = (prefix = "DSQ") =>
  `${prefix}-${Math.floor(100000 + Math.random() * 899999)}`
const now = () => new Date().toISOString()
const isSimulated = (ctx: MutationContext) => ctx.mode !== "live"

/**
 * In-memory repository. It stands in for the backend during frontend development and implements
 * the same command contract, so swapping in `ApiDuesRepository` is the only change needed to go
 * live. The rules here mirror the server's: the wallet is debited before a charge is marked paid,
 * oldest charge first, never more than what is owed or what the wallet holds.
 *
 * Each community has its own dataset: the seeded community starts with the seeded plans and every
 * other community starts empty, so a plan created in one community can never replace another's rows.
 */
export class MockDuesRepository implements DuesRepository {
  private stores: ReturnType<typeof createTenantStore<DuesDataset>>
  private listeners = new Set<() => void>()

  constructor(initial?: DuesDataset) {
    this.stores = createTenantStore<DuesDataset>({
      seed: () => initial ?? buildDuesDataset(),
      empty: emptyDataset,
    })
  }

  async load(organizationId: string): Promise<DuesDataset> {
    return this.scopeTo(organizationId)
  }

  async commit(organizationId: string, next: Partial<DuesDataset>): Promise<void> {
    this.stores.set(organizationId, { ...this.stores.of(organizationId), ...next })
    this.notify()
  }

  async createPlan(
    organizationId: string,
    input: CreateDuesPlanInput,
    ctx: MutationContext,
  ): Promise<DuesPlanCommandResult> {
    const today = toISODate(new Date())
    const plan: DuesPlan = {
      id: nextId("dues"),
      organizationId,
      name: input.name.trim(),
      description: input.description?.trim() || undefined,
      amount: round2(input.amount),
      currency: "NGN",
      frequency: input.frequency,
      customFrequency: input.customFrequency,
      startDate: input.startDate,
      endDate: input.endDate || undefined,
      scope: input.scope,
      groupId: input.groupId,
      groupName: input.groupName,
      branchId: input.branchId,
      branchName: input.branchName,
      lien: input.lien,
      status: "Active",
      createdAt: now(),
      createdBy: ctx.actor.name,
    }
    const participants: DuesParticipant[] = input.roster.map((entry) => ({
      id: `${plan.id}:${entry.memberId}`,
      organizationId,
      duesPlanId: plan.id,
      memberId: entry.memberId,
      memberName: entry.memberName,
      memberCode: entry.memberCode,
      branchId: entry.branchId,
      branchName: entry.branchName,
      phone: entry.phone,
      joinedAt: plan.startDate,
    }))
    const charges = syncCharges(
      generateCharges(
        plan,
        participants.map((participant) => ({ id: participant.id, memberId: participant.memberId })),
        today,
      ),
      [plan],
      today,
    )
    const current = await this.load(organizationId)
    await this.commit(organizationId, {
      plans: [plan, ...current.plans],
      participants: [...participants, ...current.participants],
      charges: [...charges, ...current.charges],
    })
    return { plan, dataset: await this.load(organizationId) }
  }

  async setPlanStatus(
    organizationId: string,
    planId: string,
    status: DuesPlanStatus,
    ctx: MutationContext,
  ): Promise<DuesPlanCommandResult> {
    void ctx;
    const dataset = await this.load(organizationId)
    const plan = dataset.plans.find((candidate) => candidate.id === planId)
    if (!plan) return { dataset }
    const today = toISODate(new Date())
    const next: DuesPlan = { ...plan, status }
    // A closed plan must not keep demanding money; nothing already owed is removed.
    const charges =
      status === "Closed"
        ? dataset.charges.filter((charge) => charge.duesPlanId !== planId || charge.dueDate <= today)
        : syncCharges(dataset.charges, [next], today)
    await this.commit(organizationId, {
      plans: dataset.plans.map((candidate) => (candidate.id === planId ? next : candidate)),
      charges,
    })
    return { plan: next, dataset: await this.load(organizationId) }
  }

  async updateLienRules(
    organizationId: string,
    planId: string,
    lien: DuesLienRules,
    ctx: MutationContext,
  ): Promise<DuesPlanCommandResult> {
    void ctx;
    const dataset = await this.load(organizationId)
    const plan = dataset.plans.find((candidate) => candidate.id === planId)
    if (!plan) return { dataset }
    const today = toISODate(new Date())
    const next: DuesPlan = { ...plan, lien }
    await this.commit(organizationId, {
      plans: dataset.plans.map((candidate) => (candidate.id === planId ? next : candidate)),
      charges: syncCharges(dataset.charges, [next], today),
    })
    return { plan: next, dataset: await this.load(organizationId) }
  }

  async recordPayment(
    organizationId: string,
    input: RecordDuesPaymentInput,
    ctx: MutationContext,
  ): Promise<DuesPaymentCommandResult> {
    const dataset = await this.load(organizationId)
    const plan = dataset.plans.find((candidate) => candidate.id === input.duesPlanId)
    const participant = dataset.participants.find((candidate) => candidate.id === input.participantId)
    if (!plan || !participant) return { dataset }

    const amount = round2(input.amount)
    if (amount <= 0) return { dataset }

    const today = toISODate(new Date())
    const owed = this.dueCharges(dataset, plan, participant.id, today, input.chargeId)
    const owedTotal = round2(owed.reduce((sum, charge) => sum + outstandingOf(charge), 0))
    if (owedTotal <= 0) return { dataset }
    if (amount > owedTotal) {
      throw new Error(`That is more than this member owes (${owedTotal.toLocaleString("en-NG")}).`)
    }

    // The wallet pays first: dues are only recorded once the money has actually moved.
    if (input.method === "wallet") {
      await this.debitMemberWallet(organizationId, plan, participant, amount, ctx)
    }

    const distributed = this.distribute(dataset.charges, owed, amount)
    const transaction: DuesTransaction = {
      id: nextId("dtx"),
      organizationId,
      reference: reference(),
      duesPlanId: plan.id,
      participantId: participant.id,
      memberId: participant.memberId,
      memberName: participant.memberName,
      chargeId: input.chargeId,
      periodKey: owed[0]?.periodKey,
      type: "Payment",
      method: input.method,
      amount,
      direction: "credit",
      status: "Completed",
      date: now(),
      recordedBy: ctx.actor.name,
      note: input.note,
      simulated: isSimulated(ctx),
    }
    await this.commit(organizationId, {
      charges: syncCharges(distributed, [plan], today),
      transactions: [transaction, ...dataset.transactions],
    })
    return { transaction, dataset: await this.load(organizationId) }
  }

  async runRecovery(
    organizationId: string,
    options: { memberId?: string; planId?: string },
    ctx: MutationContext,
  ): Promise<DuesRecoveryCommandResult> {
    const today = toISODate(new Date())
    const dataset = await this.load(organizationId)
    const plansById = new Map(dataset.plans.map((plan) => [plan.id, plan]))
    const walletData = await walletServiceFor(organizationId).load()

    const candidates = syncCharges(dataset.charges, dataset.plans, today).filter((charge) => {
      const plan = plansById.get(charge.duesPlanId)
      if (!plan) return false
      if (options.planId && charge.duesPlanId !== options.planId) return false
      if (options.memberId && charge.memberId !== options.memberId) return false
      return lienRecoverable(charge, plan, today)
    })

    const byMember = new Map<string, DuesCharge[]>()
    for (const charge of candidates) {
      byMember.set(charge.memberId, [...(byMember.get(charge.memberId) ?? []), charge])
    }

    const result: DuesRecoveryResult = {
      recovered: 0,
      chargesSettled: 0,
      membersTouched: 0,
      skipped: 0,
    }

    const updated = new Map(dataset.charges.map((charge) => [charge.id, charge]))
    const transactions: DuesTransaction[] = []

    for (const [memberId, memberCharges] of byMember) {
      const wallet = memberWalletFor(walletData.wallets, memberId)
      if (!wallet || wallet.status !== "active" || wallet.availableBalance <= 0) {
        result.skipped += memberCharges.length
        continue
      }
      const participant = dataset.participants.find(
        (candidate) => candidate.id === memberCharges[0].participantId,
      )
      const lines = recoveryAllocation(memberCharges, wallet.availableBalance, plansById, today)
      let touched = false
      for (const line of lines) {
        const plan = plansById.get(line.charge.duesPlanId)
        if (!plan) continue
        try {
          await walletServiceFor(organizationId).spend(
            {
              walletId: wallet.id,
              amount: line.amount,
              type: "Dues",
              kind: "Withdrawal",
              description: `${plan.name} — ${line.charge.periodKey}`,
              reference: `dues:${line.charge.id}`,
              counterparty: participant?.memberName ?? memberId,
              related: {
                duesId: plan.id,
                duesName: plan.name,
                memberName: participant?.memberName,
              },
            },
            ctx.actor,
            ctx.mode,
          )
        } catch (reason) {
          // Nothing was deducted. Stop rather than reaching past this charge for a later one, so
          // "oldest dues first" stays true; the reason is recorded and the next run retries.
          transactions.push(
            this.recoveryTransaction(
              dataset,
              line.charge,
              line.amount,
              ctx,
              "Failed",
              reason instanceof Error ? reason.message : "Recovery failed",
            ),
          )
          break
        }
        const current = updated.get(line.charge.id) ?? line.charge
        updated.set(line.charge.id, {
          ...current,
          paidAmount: round2(current.paidAmount + line.amount),
          lastRecoveryAt: today,
        })
        transactions.push(this.recoveryTransaction(dataset, line.charge, line.amount, ctx, "Completed"))
        result.recovered = round2(result.recovered + line.amount)
        if (round2(current.paidAmount + line.amount) >= current.expectedAmount) result.chargesSettled += 1
        touched = true
      }
      if (touched) result.membersTouched += 1
    }

    if (transactions.length > 0) {
      await this.commit(organizationId, {
        charges: syncCharges([...updated.values()], dataset.plans, today),
        transactions: [...transactions, ...dataset.transactions],
      })
    }
    return { result, dataset: await this.load(organizationId) }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private notify() {
    this.listeners.forEach((listener) => listener())
  }

  private dueCharges(
    dataset: DuesDataset,
    plan: DuesPlan,
    participantId: string,
    today: string,
    chargeId?: string,
  ): DuesCharge[] {
    const due = dataset.charges
      .filter((charge) => charge.duesPlanId === plan.id && charge.participantId === participantId)
      .map((charge) => syncCharges([charge], [plan], today)[0])
      .filter((charge) => charge.dueDate <= today && outstandingOf(charge) > 0)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.periodKey.localeCompare(b.periodKey))
    if (!chargeId) return due
    const chosen = due.find((charge) => charge.id === chargeId)
    if (!chosen) return due
    // Settle the charge the administrator named first, then the rest oldest first.
    return [chosen, ...due.filter((charge) => charge.id !== chosen.id)]
  }

  /** Spreads an amount across charges, oldest first, capped at each charge's outstanding balance. */
  private distribute(charges: DuesCharge[], ordered: DuesCharge[], amount: number): DuesCharge[] {
    const byId = new Map(charges.map((charge) => [charge.id, { ...charge }]))
    let remaining = round2(amount)
    for (const target of ordered) {
      if (remaining <= 0) break
      const charge = byId.get(target.id)
      if (!charge) continue
      const owed = outstandingOf(charge)
      if (owed <= 0) continue
      const take = round2(Math.min(owed, remaining))
      byId.set(charge.id, { ...charge, paidAmount: round2(charge.paidAmount + take) })
      remaining = round2(remaining - take)
    }
    return [...byId.values()]
  }

  private async debitMemberWallet(
    organizationId: string,
    plan: DuesPlan,
    participant: DuesParticipant,
    amount: number,
    ctx: MutationContext,
  ): Promise<void> {
    const wallet = await walletServiceFor(organizationId).ensureMemberWallet(
      { memberId: participant.memberId, memberName: participant.memberName },
      ctx.actor,
    )
    await walletServiceFor(organizationId).spend(
      {
        walletId: wallet.id,
        amount,
        type: "Dues",
        kind: "Withdrawal",
        description: `${plan.name} — dues payment`,
        reference: `dues:${plan.id}:${participant.id}`,
        counterparty: participant.memberName,
        related: {
          duesId: plan.id,
          duesName: plan.name,
          memberName: participant.memberName,
        },
      },
      ctx.actor,
      ctx.mode,
    )
  }

  private recoveryTransaction(
    dataset: DuesDataset,
    charge: DuesCharge,
    amount: number,
    ctx: MutationContext,
    status: DuesTransaction["status"],
    note?: string,
  ): DuesTransaction {
    const participant = dataset.participants.find((candidate) => candidate.id === charge.participantId)
    const plan = dataset.plans.find((candidate) => candidate.id === charge.duesPlanId)
    return {
      id: nextId("dtx"),
      organizationId: charge.organizationId,
      reference: reference("DSR"),
      duesPlanId: charge.duesPlanId,
      participantId: charge.participantId,
      chargeId: charge.id,
      memberId: charge.memberId,
      memberName: participant?.memberName ?? charge.memberId,
      periodKey: charge.periodKey,
      type: "Wallet recovery",
      method: "wallet",
      amount,
      direction: "credit",
      status,
      date: now(),
      recordedBy: ctx.actor.name,
      note: note ?? plan?.name,
      simulated: isSimulated(ctx),
    }
  }

  private scopeTo(organizationId: string): DuesDataset {
    const belongs = <
      T extends {
        organizationId: string
      },
    >(
      row: T,
    ) => row.organizationId === organizationId
    const dataset = this.stores.of(organizationId)
    return {
      plans: dataset.plans.filter(belongs),
      participants: dataset.participants.filter(belongs),
      charges: dataset.charges.filter(belongs),
      transactions: dataset.transactions.filter(belongs),
    }
  }
}

export function createMockDuesRepository(initial?: DuesDataset): MockDuesRepository {
  return new MockDuesRepository(initial)
}
