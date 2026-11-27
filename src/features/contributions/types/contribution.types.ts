import type { EntityId } from "@/types"

/**
 * Contributions model Ajo/savings collections and general fundraising.
 * Each contribution is an independent, configurable plan — there is no "cycle" concept:
 * a Personal contribution simply keeps running after a payout.
 */

export const CONTRIBUTION_TYPES = ["Fixed", "Flexible", "Target"] as const
export type ContributionType = typeof CONTRIBUTION_TYPES[number]

/**
 * How the money is held.
 *
 * - `General` — everyone contributes into one pooled balance held for the recipient.
 * - `Personal` — each member has their own balance, tracked and withdrawn separately.
 *
 * The form decides which view the plan gets, so it is set at creation and never inferred.
 */
export const CONTRIBUTION_FORMS = ["General", "Personal"] as const
export type ContributionForm = typeof CONTRIBUTION_FORMS[number]

export const CONTRIBUTION_FREQUENCIES = ["Daily", "Weekly", "Monthly", "Custom", "None"] as const
export type ContributionFrequency = typeof CONTRIBUTION_FREQUENCIES[number]

export const CONTRIBUTION_STATUSES = ["Active", "Paused", "Completed", "Closed"] as const
export type ContributionStatus = typeof CONTRIBUTION_STATUSES[number]

/**
 * Who may join. `Open` is the only scope that mints a public link, so the audience and the
 * link can no longer disagree.
 */
export const PARTICIPANT_SCOPES = ["All", "Selected", "Open"] as const
export type ParticipantScope = typeof PARTICIPANT_SCOPES[number]

export const COMMISSION_MODELS = ["none", "percentage", "fixed"] as const
export type CommissionModel = typeof COMMISSION_MODELS[number]

export const CONTRIBUTION_PAYMENT_METHOD_IDS = [
  "wallet",
  "bank_transfer",
  "payment_link",
  "cash",
  "bank_account",
] as const
export type ContributionPaymentMethodId = typeof CONTRIBUTION_PAYMENT_METHOD_IDS[number]

export const PERIOD_STATES = ["Expected", "Paid", "Missed", "Late", "Partially Paid"] as const
export type PeriodState = typeof PERIOD_STATES[number]

export const CONTRIBUTION_TRANSACTION_TYPES = ["Contribution", "Withdrawal", "Commission", "Fee", "Adjustment", "Reversal"] as const
export type ContributionTransactionType = typeof CONTRIBUTION_TRANSACTION_TYPES[number]

export const CONTRIBUTION_TRANSACTION_STATUSES = ["Completed", "Pending", "Failed", "Reversed"] as const
export type ContributionTransactionStatus = typeof CONTRIBUTION_TRANSACTION_STATUSES[number]

export const WITHDRAWAL_KINDS = ["Full", "Partial", "Scheduled"] as const
export type WithdrawalKind = typeof WITHDRAWAL_KINDS[number]

export const WITHDRAWAL_STATUSES = ["Pending approval", "Approved", "Scheduled", "Completed", "Rejected", "Failed"] as const
export type WithdrawalStatus = typeof WITHDRAWAL_STATUSES[number]

/**
 * Where the money is held or sent.
 *
 * - `organization` — the organization's own wallet/account
 * - `member` / `customer` — held for one named person
 * - `contributor` — each contributor's own account, so a Personal plan pays every member back
 */
export type ContributionRecipientKind = "organization" | "member" | "customer" | "contributor"

/** Where collected money is held or ultimately sent. Configurable per contribution. */
export interface ContributionRecipient {
  kind: ContributionRecipientKind
  /** Organization wallet/account id, when `kind` is `organization`. */
  accountId?: EntityId
  accountName?: string
  /** Member ledger key, when `kind` is `member` or `customer`. */
  memberId?: EntityId
  memberName?: string
  /** Display label, e.g. "Customer Account: John Doe". */
  label: string
}

export interface ContributionCommission {
  model: CommissionModel
  /** 0–100, used when `model` is `percentage`. */
  percentage?: number
  /** Used when `model` is `fixed`. */
  fixedAmount?: number
}

export type PayoutMode = "manual" | "scheduled"
export const SCHEDULED_PAYOUT_INTERVALS = ["Once", "Weekly", "Monthly"] as const
export type ScheduledPayoutInterval = typeof SCHEDULED_PAYOUT_INTERVALS[number]

/**
 * How money leaves the plan. Partial withdrawals are always allowed and a Personal plan always
 * stays active afterwards, so neither is configurable — see `contribution.rules.ts`.
 */
export interface ContributionPayoutConfig {
  mode: PayoutMode
  /** ISO date for the first/next scheduled disbursement. */
  scheduledDate?: string
  scheduledInterval?: ScheduledPayoutInterval
  /** Payouts above this amount need a second approver. 0 = every payout needs approval. */
  approvalThreshold: number
}

export interface ContributionPublicLink {
  slug: string
  enabled: boolean
  createdAt: string
  disabledAt?: string
}

export interface ContributionPaymentMethod {
  id: ContributionPaymentMethodId
  label: string
  enabled: boolean
  description: string
}

export interface Contribution {
  id: EntityId
  organizationId: EntityId
  name: string
  description?: string
  type: ContributionType
  form: ContributionForm
  participantScope: ParticipantScope
  /** Fixed contributions: the amount expected per contribution. */
  fixedAmount?: number
  /** Flexible contributions: optional floor. */
  minimumAmount?: number
  /** Target contributions: the amount being saved towards. */
  targetAmount?: number
  frequencyBased: boolean
  frequency: ContributionFrequency
  customFrequency?: { label: string; days: number }
  startDate: string
  endDate?: string
  /** Set when the roster came from a group, kept so lists can name its origin. */
  groupId?: EntityId
  groupName?: string
  recipient: ContributionRecipient
  commission: ContributionCommission
  payout: ContributionPayoutConfig
  paymentMethods: ContributionPaymentMethod[]
  publicLink?: ContributionPublicLink
  status: ContributionStatus
  currency: string
  createdAt: string
  createdBy: string
}

export interface ContributionContact {
  phone?: string
  email?: string
}

export type ParticipantState = "On track" | "Behind" | "Completed"

export interface ContributionParticipant {
  id: EntityId
  organizationId: EntityId
  contributionId: EntityId
  /** Absent for public/external contributors who are not FinSquare members. */
  memberId?: EntityId
  memberName: string
  memberCode?: string
  isExternal: boolean
  contact: ContributionContact
  branchId?: EntityId
  branchName?: string
  /** Expected amount per period; 0 when the contribution is not frequency-based. */
  expectedAmount: number
  totalContributed: number
  availableBalance: number
  missedCount: number
  lateCount: number
  state: ParticipantState
  joinedAt: string
}

export interface ContributionTransaction {
  id: EntityId
  organizationId: EntityId
  reference: string
  contributionId: EntityId
  participantId?: EntityId
  contributorName: string
  type: ContributionTransactionType
  method: ContributionPaymentMethodId
  amount: number
  fee: number
  commission: number
  netAmount: number
  direction: "credit" | "debit"
  status: ContributionTransactionStatus
  date: string
  recordedBy: string
  note?: string
  /** True when the money arrived through the public link. */
  external?: boolean
  simulated?: boolean
}

export interface ContributionWithdrawal {
  id: EntityId
  organizationId: EntityId
  reference: string
  contributionId: EntityId
  participantId?: EntityId
  kind: WithdrawalKind
  grossAmount: number
  commission: number
  fees: number
  netPayout: number
  status: WithdrawalStatus
  destination: string
  requestedBy: string
  requestedById: string
  requestedAt: string
  approvedBy?: string
  approvedAt?: string
  scheduledFor?: string
  completedAt?: string
  note?: string
  transactionId?: EntityId
}

export interface ContributionPeriod {
  id: string
  organizationId: EntityId
  contributionId: EntityId
  participantId: EntityId
  /** Calendar key for the period: `2026-10-04` (daily), `2026-W40` (weekly), `2026-10` (monthly). */
  periodKey: string
  dueDate: string
  expectedAmount: number
  paidAmount: number
  state: PeriodState
}

export interface ContributionSchedule {
  contributionId: EntityId
  frequency: ContributionFrequency
  periods: ContributionPeriod[]
  nextDueDate?: string
}

export interface ContributionBalance {
  contributionId: EntityId
  totalContributed: number
  availableBalance: number
  totalWithdrawn: number
  /** Remaining amount towards the target; `undefined` when the contribution has no target. */
  amountRemaining?: number
  targetAmount?: number
  pendingAmount: number
  commissionAccrued: number
  netPayout: number
}

export interface PayoutBreakdown {
  gross: number
  commission: number
  fees: number
  net: number
}

export interface ContributionReportRow {
  id: string
  label: string
  contributionId?: EntityId
  contributionName?: string
  groupName?: string
  period?: string
  contributors?: number
  collected: number
  withdrawn: number
  commission: number
  netPayout: number
  balance: number
  missed?: number
}

export interface ContributionReportFilters {
  participantId?: string
  groupId?: string
  contributionId?: string
  type?: ContributionType | "All"
  form?: ContributionForm | "All"
  recipientKind?: ContributionRecipientKind | "All"
  from?: string
  to?: string
  minAmount?: number
  maxAmount?: number
  transactionType?: ContributionTransactionType | "All"
  status?: ContributionTransactionStatus | "All"
  method?: ContributionPaymentMethodId | "All"
  branchId?: string
}

export interface ContributionDataset {
  contributions: Contribution[]
  participants: ContributionParticipant[]
  transactions: ContributionTransaction[]
  withdrawals: ContributionWithdrawal[]
  periods: ContributionPeriod[]
}

export interface ContributionSummary {
  totalContributions: number
  activeContributions: number
  totalCollected: number
  availableBalance: number
  totalWithdrawn: number
  pendingPayouts: number
  pendingPayoutCount: number
  totalCommission: number
  missedContributions: number
}

/** Someone who should be associated with a contribution when it is created (e.g. a group's members). */
export interface ContributionRosterEntry {
  memberId: EntityId
  memberName: string
  memberCode?: string
  contact?: ContributionContact
  branchId?: EntityId
  branchName?: string
}

export interface CreateContributionInput {
  name: string
  description?: string
  type: ContributionType
  form: ContributionForm
  participantScope: ParticipantScope
  fixedAmount?: number
  minimumAmount?: number
  targetAmount?: number
  frequencyBased: boolean
  frequency: ContributionFrequency
  customFrequency?: { label: string; days: number }
  startDate: string
  endDate?: string
  /** Set when the roster came from a group, kept so lists can name its origin. */
  groupId?: string
  /** Display name of the selected group, resolved by the caller so lists never show a raw id. */
  groupName?: string
  /** People associated with the contribution when it is created. */
  participants?: ContributionRosterEntry[]
  recipient: ContributionRecipient
  commission: ContributionCommission
  payout: ContributionPayoutConfig
  paymentMethods: ContributionPaymentMethodId[]
}

export interface RecordContributionPaymentInput {
  contributionId: string
  participantId: string
  amount: number
  method: ContributionPaymentMethodId
  /** Optional period key being settled; when omitted the oldest outstanding period is used. */
  periodKey?: string
  note?: string
}

export interface RequestContributionWithdrawalInput {
  contributionId: string
  participantId?: string
  kind: WithdrawalKind
  amount: number
  fees?: number
  scheduledFor?: string
  note?: string
}

export interface PublicContributionInput {
  slug: string
  /** Present when the payer used a member's own link, so the money lands on that member's balance. */
  memberId?: string
  contributorName: string
  phone?: string
  email?: string
  amount: number
  method: ContributionPaymentMethodId
}

export interface PublicContributionReceipt {
  reference: string
  contributionName: string
  contributorName: string
  amount: number
  recipientLabel: string
  status?: "Awaiting payment" | "Recorded"
  paymentInstructions?: {
    accountNumber: string
    accountName: string
    bankName: string
    expiresAt: string
  }
}
