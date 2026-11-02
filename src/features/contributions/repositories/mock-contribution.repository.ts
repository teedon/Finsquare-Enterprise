import { createTenantStore } from "@/lib/tenancy/tenant-store"
import { SEED_ORGANIZATION_ID } from "@/lib/tenancy/seed-tenant"
import { memberWalletFor } from "@/features/wallet/domain/wallet.rules"
import { walletServiceFor } from "@/features/wallet/services/wallet.service"
import { publicLinkAvailable } from "../domain/contribution.rules"
import { buildContributionDataset } from "../mocks/contributions.mock"
import type {
  Contribution,
  ContributionCommission,
  ContributionDataset,
  ContributionParticipant,
  ContributionPeriod,
  ContributionPublicLink,
  ContributionStatus,
  ContributionTransaction,
  ContributionWithdrawal,
  PublicContributionInput,
  PublicContributionReceipt,
} from "../types/contribution.types"
import type {
  ContributionPlanPatch,
  ContributionPayoutRelease,
  ContributionRepository,
  ContributionSettlement,
  ContributionWithdrawalPatch,
  PublicContributionView,
} from "./contribution.repository"

const emptyDataset = (): ContributionDataset => ({
  contributions: [],
  participants: [],
  transactions: [],
  withdrawals: [],
  periods: [],
})

const now = () => new Date().toISOString()
let sequence = 0
const nextId = (prefix: string) => `${prefix}-${Date.now().toString(36)}${(sequence += 1).toString(36)}`
const round2 = (value: number) => Math.round(value * 100) / 100

/**
 * In-memory repository. Stands in for the backend during frontend development and keeps the
 * same shape a real API would return, so swapping in `ApiContributionRepository` is the only
 * change needed to go live.
 *
 * Each community has its own dataset: the seeded community starts with the seeded plans and every
 * other community starts empty, so a plan created in one community can never replace another's rows.
 */
export class MockContributionRepository implements ContributionRepository {
  private stores: ReturnType<typeof createTenantStore<ContributionDataset>>
  private listeners = new Set<() => void>()

  constructor(initial?: ContributionDataset) {
    this.stores = createTenantStore<ContributionDataset>({
      seed: () => initial ?? buildContributionDataset(),
      empty: emptyDataset,
    })
  }

  async load(organizationId: string): Promise<ContributionDataset> {
    return this.scopeTo(organizationId)
  }

  async createPlan(
    organizationId: string,
    plan: Contribution,
    participants: ContributionParticipant[],
    periods: ContributionPeriod[],
  ): Promise<void> {
    this.update(organizationId, (current) => ({
      ...current,
      contributions: [plan, ...current.contributions],
      participants: [...participants, ...current.participants],
      periods: [...periods, ...current.periods],
    }))
  }

  async updatePlan(
    organizationId: string,
    planId: string,
    patch: ContributionPlanPatch,
  ): Promise<void> {
    this.update(organizationId, (current) => ({
      ...current,
      contributions: current.contributions.map((c) =>
        c.id === planId ? { ...c, ...patch } : c,
      ),
    }))
  }

  async setPlanStatus(
    organizationId: string,
    planId: string,
    status: ContributionStatus,
  ): Promise<void> {
    this.update(organizationId, (current) => ({
      ...current,
      contributions: current.contributions.map((c) =>
        c.id === planId ? { ...c, status } : c,
      ),
    }))
  }

  async updatePlanCommission(
    organizationId: string,
    planId: string,
    commission: ContributionCommission,
  ): Promise<void> {
    this.update(organizationId, (current) => ({
      ...current,
      contributions: current.contributions.map((c) =>
        c.id === planId ? { ...c, commission } : c,
      ),
    }))
  }

  async setPlanPublicLink(
    organizationId: string,
    planId: string,
    publicLink: ContributionPublicLink | null,
  ): Promise<void> {
    this.update(organizationId, (current) => ({
      ...current,
      contributions: current.contributions.map((c) =>
        c.id === planId ? { ...c, publicLink: publicLink ?? undefined } : c,
      ),
    }))
  }

  async recordPayment(
    organizationId: string,
    transaction: ContributionTransaction,
    participant?: ContributionParticipant,
    period?: ContributionPeriod,
  ): Promise<void> {
    this.update(organizationId, (current) => {
      const participants = participant
        ? current.participants.map((p) => (p.id === participant.id ? participant : p))
        : current.participants
      const periods = period
        ? current.periods.some((p) => p.id === period.id)
          ? current.periods.map((p) => (p.id === period.id ? period : p))
          : [period, ...current.periods]
        : current.periods
      return {
        ...current,
        transactions: [transaction, ...current.transactions],
        participants,
        periods,
      }
    })
  }

  async requestWithdrawal(
    organizationId: string,
    withdrawal: ContributionWithdrawal,
    settlement?: ContributionSettlement,
  ): Promise<void> {
    this.update(organizationId, (current) => {
      const next: ContributionDataset = {
        ...current,
        withdrawals: [withdrawal, ...current.withdrawals],
      }
      if (!settlement) return next
      return {
        ...next,
        transactions: settlement.transaction
          ? [settlement.transaction, ...next.transactions]
          : next.transactions,
        contributions: this.mergeContributions(next.contributions, settlement.contribution ? [settlement.contribution] : []),
        participants: this.mergeParticipants(next.participants, settlement.participants),
      }
    })
  }

  async approveWithdrawal(
    organizationId: string,
    withdrawalId: string,
    patch: ContributionWithdrawalPatch,
    settlement?: ContributionSettlement,
  ): Promise<void> {
    this.update(organizationId, (current) => {
      const next: ContributionDataset = {
        ...current,
        withdrawals: current.withdrawals.map((w) =>
          w.id === withdrawalId ? { ...w, ...patch } : w,
        ),
      }
      if (!settlement) return next
      return {
        ...next,
        transactions: settlement.transaction
          ? [settlement.transaction, ...next.transactions]
          : next.transactions,
        contributions: this.mergeContributions(next.contributions, settlement.contribution ? [settlement.contribution] : []),
        participants: this.mergeParticipants(next.participants, settlement.participants),
      }
    })
  }

  async rejectWithdrawal(
    organizationId: string,
    withdrawalId: string,
    note?: string,
  ): Promise<void> {
    this.update(organizationId, (current) => ({
      ...current,
      withdrawals: current.withdrawals.map((w) =>
        w.id === withdrawalId ? { ...w, status: "Rejected", note: note ?? w.note } : w,
      ),
    }))
  }

  async releasePayouts(
    organizationId: string,
    _today: string,
    release: ContributionPayoutRelease,
  ): Promise<void> {
    this.update(organizationId, (current) => ({
      ...current,
      withdrawals: this.mergeWithdrawals(current.withdrawals, release.withdrawals),
      transactions: [...release.transactions, ...current.transactions],
      contributions: this.mergeContributions(current.contributions, release.contributions),
      participants: this.mergeParticipants(current.participants, release.participants),
    }))
  }

  async loadPublicContribution(
    slug: string,
    memberId?: string,
  ): Promise<PublicContributionView | undefined> {
    const dataset = this.stores.of(SEED_ORGANIZATION_ID)
    const contribution = dataset.contributions.find((c) => c.publicLink?.slug === slug)
    if (!contribution) return undefined

    const participant = memberId
      ? dataset.participants.find((p) => p.contributionId === contribution.id && p.memberId === memberId)
      : undefined

    let memberWallet: { id: string; availableBalance: number } | undefined
    if (participant?.memberId) {
      const wallets = await walletServiceFor(SEED_ORGANIZATION_ID).load()
      const wallet = memberWalletFor(wallets.wallets, participant.memberId)
      memberWallet = wallet ? { id: wallet.id, availableBalance: wallet.availableBalance } : undefined
    }

    return { contribution, participant, memberWallet }
  }

  async submitPublicContribution(
    slug: string,
    input: PublicContributionInput,
  ): Promise<PublicContributionReceipt | undefined> {
    const dataset = this.stores.of(SEED_ORGANIZATION_ID)
    const contribution = dataset.contributions.find((c) => c.publicLink?.slug === slug)
    if (!contribution) return undefined

    // A member's own link names them; the pool link needs the plan to be open.
    const onBehalfOf = input.memberId
      ? dataset.participants.find((p) => p.contributionId === contribution.id && p.memberId === input.memberId)
      : undefined
    const openToEveryone = publicLinkAvailable(contribution)
    if (input.memberId ? !onBehalfOf || contribution.status !== "Active" : !openToEveryone) return undefined

    const existing =
      onBehalfOf ??
      dataset.participants.find(
        (p) => p.contributionId === contribution.id && p.memberName.toLowerCase() === input.contributorName.toLowerCase(),
      )
    const participant: ContributionParticipant =
      existing ?? {
        id: nextId(`${contribution.id}:ext`),
        organizationId: SEED_ORGANIZATION_ID,
        contributionId: contribution.id,
        memberName: input.contributorName.trim(),
        isExternal: true,
        contact: { phone: input.phone, email: input.email },
        expectedAmount: 0,
        totalContributed: 0,
        availableBalance: 0,
        missedCount: 0,
        lateCount: 0,
        state: "On track",
        joinedAt: now(),
      }

    const amount = round2(input.amount)
    const reference = `PUB-${Math.floor(100_000 + Math.random() * 899_999)}`
    const transaction: ContributionTransaction = {
      id: nextId("cttx"),
      organizationId: SEED_ORGANIZATION_ID,
      reference,
      contributionId: contribution.id,
      participantId: participant.id,
      contributorName: participant.memberName,
      type: "Contribution",
      method: input.method,
      amount,
      fee: 0,
      commission: 0,
      netAmount: amount,
      direction: "credit",
      // Public payments are never settled here: an administrator confirms them later.
      status: "Pending",
      date: now(),
      recordedBy: onBehalfOf ? "Member link" : "Public link",
      external: !onBehalfOf,
      simulated: true,
    }

    this.update(SEED_ORGANIZATION_ID, (current) => ({
      ...current,
      participants: existing
        ? this.mergeParticipants(current.participants, [participant])
        : [participant, ...current.participants],
      transactions: [transaction, ...current.transactions],
    }))

    return {
      reference,
      contributionName: contribution.name,
      contributorName: participant.memberName,
      amount: transaction.amount,
      recipientLabel: contribution.recipient.label,
    }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private update(
    organizationId: string,
    next: (current: ContributionDataset) => ContributionDataset,
  ): void {
    this.stores.set(organizationId, next(this.stores.of(organizationId)))
    this.listeners.forEach((listener) => listener())
  }

  private mergeParticipants(
    current: ContributionParticipant[],
    updates: ContributionParticipant[],
  ): ContributionParticipant[] {
    const byId = new Map(updates.map((p) => [p.id, p]))
    return current.map((p) => byId.get(p.id) ?? p)
  }

  private mergeContributions(
    current: Contribution[],
    updates: Contribution[],
  ): Contribution[] {
    const byId = new Map(updates.map((c) => [c.id, c]))
    return current.map((c) => byId.get(c.id) ?? c)
  }

  private mergeWithdrawals(
    current: ContributionWithdrawal[],
    updates: ContributionWithdrawal[],
  ): ContributionWithdrawal[] {
    const byId = new Map(updates.map((w) => [w.id, w]))
    return current.map((w) => byId.get(w.id) ?? w)
  }

  private scopeTo(organizationId: string): ContributionDataset {
    const belongs = <T extends { organizationId: string }>(row: T) =>
      row.organizationId === organizationId
    const dataset = this.stores.of(organizationId)
    return {
      contributions: dataset.contributions.filter(belongs),
      participants: dataset.participants.filter(belongs),
      transactions: dataset.transactions.filter(belongs),
      withdrawals: dataset.withdrawals.filter(belongs),
      periods: dataset.periods.filter(belongs),
    }
  }
}

export function createMockContributionRepository(initial?: ContributionDataset): MockContributionRepository {
  return new MockContributionRepository(initial)
}
