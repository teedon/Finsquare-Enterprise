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

/** The fields a plan edit may change. Balances and approval rules are always recomputed server-side. */
export interface ContributionPlanPatch {
  name?: string
  description?: string
  recipient?: Contribution["recipient"]
  payout?: Contribution["payout"]
  paymentMethods?: Contribution["paymentMethods"]
}

/** The fields an approval may set on a withdrawal, plus the records the release produces. */
export interface ContributionWithdrawalPatch {
  status?: ContributionWithdrawal["status"]
  approvedBy?: string
  approvedAt?: string
  scheduledFor?: string
  completedAt?: string
  transactionId?: string
  note?: string
}

/** The records a completed payout produces: the debit transaction, a possibly-closed plan and settled participants. */
export interface ContributionSettlement {
  transaction?: ContributionTransaction
  contribution?: Contribution
  participants: ContributionParticipant[]
}

/** The records `releaseDuePayouts` produced across every due withdrawal. */
export interface ContributionPayoutRelease {
  withdrawals: ContributionWithdrawal[]
  transactions: ContributionTransaction[]
  contributions: Contribution[]
  participants: ContributionParticipant[]
}

/**
 * The public-safe view of a contribution link: the plan, the member for a member's own link, and
 * that member's wallet when the backend can name it. Never the full dataset.
 */
export interface PublicContributionView {
  contribution: Contribution
  participant?: ContributionParticipant
  memberWallet?: { id: string; availableBalance: number }
}

/**
 * Persistence boundary for the contributions domain.
 *
 * `organizationId` is the tenant context and is the first argument on every method. The backend
 * exposes one command per mutation; each command re-validates and re-audits the change. Balances,
 * commission and approvals remain authoritative on the server, never here.
 */
export interface ContributionRepository {
  load(organizationId: string): Promise<ContributionDataset>

  createPlan(
    organizationId: string,
    plan: Contribution,
    participants: ContributionParticipant[],
    periods: ContributionPeriod[],
  ): Promise<void>

  updatePlan(
    organizationId: string,
    planId: string,
    patch: ContributionPlanPatch,
  ): Promise<void>

  setPlanStatus(
    organizationId: string,
    planId: string,
    status: ContributionStatus,
  ): Promise<void>

  updatePlanCommission(
    organizationId: string,
    planId: string,
    commission: ContributionCommission,
  ): Promise<void>

  setPlanPublicLink(
    organizationId: string,
    planId: string,
    publicLink: ContributionPublicLink | null,
  ): Promise<void>

  recordPayment(
    organizationId: string,
    transaction: ContributionTransaction,
    participant?: ContributionParticipant,
    period?: ContributionPeriod,
  ): Promise<void>

  requestWithdrawal(
    organizationId: string,
    withdrawal: ContributionWithdrawal,
    settlement?: ContributionSettlement,
  ): Promise<void>

  approveWithdrawal(
    organizationId: string,
    withdrawalId: string,
    patch: ContributionWithdrawalPatch,
    settlement?: ContributionSettlement,
  ): Promise<void>

  rejectWithdrawal(
    organizationId: string,
    withdrawalId: string,
    note?: string,
  ): Promise<void>

  releasePayouts(
    organizationId: string,
    today: string,
    release: ContributionPayoutRelease,
  ): Promise<void>

  /** Resolves a public link without an administrator session. */
  loadPublicContribution(
    slug: string,
    memberId?: string,
  ): Promise<PublicContributionView | undefined>

  /** Submits a public-link contribution. The backend mints the reference and records the payment. */
  submitPublicContribution(
    slug: string,
    input: PublicContributionInput,
  ): Promise<PublicContributionReceipt | undefined>

  subscribe(listener: () => void): () => void
}
