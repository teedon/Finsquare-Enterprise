import type { EntityId } from "@/types"
/**
 * Dues are fixed, recurring membership obligations. Unlike contributions they never hold money and
 * never pay out: a plan states what each member owes and when, and each expected payment becomes a
 * `DuesCharge` that is settled through a wallet, cash or a bank transfer.
 *
 * There is no flexible or target dues — the amount per scheduled payment is always fixed.
 */
export const DUES_FREQUENCIES = ["One-time", "Daily", "Weekly", "Monthly", "Quarterly", "Yearly", "Custom"] as const
export type DuesFrequency = (typeof DUES_FREQUENCIES)[number]
/** Who the plan demands payment from. A group or branch is resolved to its members at creation. */
export const DUES_SCOPES = ["All", "Selected", "Group", "Branch"] as const
export type DuesScope = (typeof DUES_SCOPES)[number]
export const DUES_PLAN_STATUSES = ["Active", "Paused", "Closed"] as const
export type DuesPlanStatus = (typeof DUES_PLAN_STATUSES)[number]
/** How much of one charge has been paid, judged against its due date. */
export const DUES_CHARGE_STATES = ["Pending", "Partially Paid", "Paid", "Overdue"] as const
export type DuesChargeState = (typeof DUES_CHARGE_STATES)[number]
/**
 * Whether the member's wallet carries a lien for this charge.
 *
 * A lien is the organization's claim on the member's wallet balance: once a charge is unpaid past
 * its grace period the claim is `Pending`, and recovery settles it — partially or in full.
 */
export const DUES_LIEN_STATES = ["None", "Pending", "Partially recovered", "Recovered", "Cancelled"] as const
export type DuesLienState = (typeof DUES_LIEN_STATES)[number]
/**
 * The five things an administrator has to tell apart, in the order they demand attention.
 * Derived from the charge and its lien — never stored, so the two can never disagree.
 */
export const DUES_PAYMENT_STATUSES = [
  "Awaiting wallet recovery",
  "Overdue",
  "Partially paid",
  "Paid",
  "Pending",
] as const
export type DuesPaymentStatus = (typeof DUES_PAYMENT_STATUSES)[number]
export const DUES_PAYMENT_METHODS = ["wallet", "cash", "bank_transfer"] as const
export type DuesPaymentMethod = (typeof DUES_PAYMENT_METHODS)[number]
export const DUES_PAYMENT_METHOD_LABELS: Record<DuesPaymentMethod, string> = {
  wallet: "Member wallet",
  cash: "Cash",
  bank_transfer: "Bank transfer",
}
export const DUES_TRANSACTION_TYPES = ["Payment", "Wallet recovery", "Adjustment", "Reversal"] as const
export type DuesTransactionType = (typeof DUES_TRANSACTION_TYPES)[number]
export const DUES_TRANSACTION_STATUSES = ["Completed", "Pending", "Failed", "Reversed"] as const
export type DuesTransactionStatus = (typeof DUES_TRANSACTION_STATUSES)[number]
/** How a plan enforces an unpaid charge. Configured when the plan is created (Advanced). */
export interface DuesLienRules {
  /** Apply a wallet lien once a charge is unpaid past its due date plus `graceDays`. */
  enabled: boolean
  /** Days after the due date before the lien applies. */
  graceDays: number
  /** Deduct from the member's wallet automatically once funds are available. */
  autoRecover: boolean
}
export interface DuesPlan {
  id: EntityId
  organizationId: EntityId
  name: string
  description?: string
  /** The fixed amount each participant owes per scheduled payment. */
  amount: number
  currency: string
  frequency: DuesFrequency
  /** Set when `frequency` is `Custom`, e.g. every 10 days. */
  customFrequency?: {
    label: string
    days: number
  }
  startDate: string
  /** Omitted means the plan runs until it is paused or closed. */
  endDate?: string
  scope: DuesScope
  /** Set when the roster came from a group, kept so lists can name its origin. */
  groupId?: EntityId
  groupName?: string
  /** Set when the roster came from a branch. */
  branchId?: EntityId
  branchName?: string
  lien: DuesLienRules
  status: DuesPlanStatus
  createdAt: string
  createdBy: string
}
/**
 * One participant on a plan. Identity and roster facts only — every money figure is derived from
 * the charge ledger so a total can never go stale (see `dues.rules.ts`).
 */
export interface DuesParticipant {
  id: EntityId
  organizationId: EntityId
  duesPlanId: EntityId
  memberId: EntityId
  memberName: string
  memberCode?: string
  branchId?: EntityId
  branchName?: string
  phone?: string
  joinedAt: string
}
/**
 * One expected payment: a participant, for one period of the plan's schedule.
 * `outstanding` is `expectedAmount - paidAmount` and is always derived.
 */
export interface DuesCharge {
  id: string
  organizationId: EntityId
  duesPlanId: EntityId
  participantId: EntityId
  memberId: EntityId
  /** Calendar key for the period: `2026-10-04` (daily), `2026-W40` (weekly), `2026-10` (monthly). */
  periodKey: string
  dueDate: string
  expectedAmount: number
  paidAmount: number
  state: DuesChargeState
  lienState: DuesLienState
  /** When the lien first applied, for the audit trail. */
  lienAppliedAt?: string
  lastRecoveryAt?: string
}
export interface DuesTransaction {
  id: EntityId
  organizationId: EntityId
  reference: string
  duesPlanId: EntityId
  participantId?: EntityId
  memberId?: EntityId
  memberName: string
  chargeId?: EntityId
  periodKey?: string
  type: DuesTransactionType
  method: DuesPaymentMethod
  amount: number
  direction: "credit"
  status: DuesTransactionStatus
  date: string
  recordedBy: string
  /** Why a recovery failed, when it did. */
  note?: string
  simulated?: boolean
}
export interface DuesDataset {
  plans: DuesPlan[]
  participants: DuesParticipant[]
  charges: DuesCharge[]
  transactions: DuesTransaction[]
}
/** Everything derived about one participant, from that participant's charges. */
export interface DuesParticipantTotals {
  participantId: EntityId
  expected: number
  paid: number
  /** Payable now: what is due and still unpaid. */
  outstanding: number
  /** Not yet demandable — charges whose due date is still ahead. */
  scheduled: number
  overdueAmount: number
  dueCount: number
  paidCount: number
  overdueCount: number
  /** Charges whose lien is waiting on the wallet. */
  awaitingRecoveryCount: number
  state: DuesParticipantState
}
export type DuesParticipantState = "Paid up" | "Partially paid" | "Behind" | "Awaiting wallet recovery"
export interface DuesPlanTotals {
  duesPlanId: EntityId
  expected: number
  collected: number
  /** Payable now: what is due and still unpaid. */
  outstanding: number
  /** Not yet demandable — charges whose due date is still ahead. */
  scheduled: number
  overdue: number
  participants: number
  paidParticipants: number
  unpaidParticipants: number
  awaitingRecovery: number
}
export interface DuesSummary {
  totalCollected: number
  outstandingAmount: number
  overdueAmount: number
  paidMembers: number
  unpaidMembers: number
  totalParticipants: number
  activePlans: number
  awaitingRecovery: number
}
/** Who performed a dues command. */
export interface DuesActor {
  id: string
  name: string
}

/** How the environment may move money. Mirrors the wallet module's mode. */
export type DuesMoneyMode = "live" | "simulated" | "blocked"

/** The actor and money-movement mode every dues command is executed under. */
export interface MutationContext {
  actor: DuesActor
  mode: DuesMoneyMode
}

/** What a recovery run did, so the administrator sees the result instead of a silent mutation. */
export interface DuesRecoveryResult {
  recovered: number
  chargesSettled: number
  membersTouched: number
  skipped: number
}
export interface DuesReportFilters {
  from?: string
  to?: string
  duesPlanId?: string
  memberId?: string
  groupId?: string
  branchId?: string
  status?: DuesPaymentStatus | "All"
  /** A charge must be at least this large to appear. */
  minAmount?: number
  maxAmount?: number
  method?: DuesPaymentMethod | "All"
  type?: DuesTransactionType | "All"
  transactionStatus?: DuesTransactionStatus | "All"
}
export interface DuesReportRow {
  id: string
  label: string
  duesPlanId?: EntityId
  duesPlanName?: string
  memberName?: string
  groupName?: string
  branchName?: string
  period?: string
  dueDate?: string
  /** The figure the row is about, given the report: collected, outstanding or recovered. */
  amount: number
  paid: number
  outstanding: number
  status?: string
  method?: string
  count?: number
}
/** Someone who should be on a plan when it is created. Resolved by the caller from the scope. */
export interface DuesRosterEntry {
  memberId: EntityId
  memberName: string
  memberCode?: string
  branchId?: EntityId
  branchName?: string
  phone?: string
}
/** What the create form has picked before the roster is resolved. */
export interface DuesParticipantSelection {
  scope: DuesScope
  memberIds: string[]
  groupId?: string
  branchId?: string
  /** `"All"` leaves the member registry unfiltered. */
  status: "All" | "Active" | "Pending" | "Suspended" | "Inactive"
}
export interface CreateDuesPlanInput {
  name: string
  description?: string
  amount: number
  frequency: DuesFrequency
  customFrequency?: {
    label: string
    days: number
  }
  startDate: string
  endDate?: string
  scope: DuesScope
  groupId?: string
  /** Display name of the selected group, resolved by the caller so lists never show a raw id. */
  groupName?: string
  branchId?: string
  branchName?: string
  /** People the plan covers, already resolved from the scope. */
  roster: DuesRosterEntry[]
  lien: DuesLienRules
}
export interface RecordDuesPaymentInput {
  duesPlanId: string
  participantId: string
  amount: number
  method: DuesPaymentMethod
  /** The charge being settled; when omitted the oldest outstanding charge is paid. */
  chargeId?: string
  note?: string
}
