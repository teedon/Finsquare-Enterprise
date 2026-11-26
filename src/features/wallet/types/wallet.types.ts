import type { Permission } from "@/types"
import type { CashReceipt } from "./cash.types"

export type WalletPermission = Extract<Permission, `wallet.${string}`>
export const WALLET_PERMISSIONS: { id: WalletPermission; label: string }[] = [
  { id: "wallet.view", label: "View wallet" },
  { id: "wallet.view_balance", label: "View balance" },
  { id: "wallet.view_transactions", label: "View transactions" },
  { id: "wallet.fund", label: "Fund" },
  { id: "wallet.transfer", label: "Transfer" },
  { id: "wallet.withdraw", label: "Withdraw" },
  { id: "wallet.disburse", label: "Disburse" },
  { id: "wallet.approve_disbursement", label: "Approve disbursement" },
  { id: "wallet.approve_transfer", label: "Approve transfer" },
  { id: "wallet.reverse", label: "Reverse transactions" },
  { id: "wallet.export", label: "Export" },
]

export type WalletType = "Main Organization" | "Branch" | "Operational" | "Loan" | "Member" | "Cash" | "Custom"
/** Selectable when an administrator creates a wallet. `Member` and `Cash` wallets are opened by the app. */
export const WALLET_TYPES: WalletType[] = ["Main Organization", "Branch", "Operational", "Loan", "Custom"]
/**
 * Organization wallets are scoped to the organization or a branch. `member` wallets hold one
 * member's own money — contributions, repayments and anything else they owe or are owed.
 * They are still ordinary wallets: same ledger, same limits, same access model.
 */
export type WalletScope = "organization" | "branch" | "member"
export type WalletStatus = "active" | "restricted" | "suspended" | "closed"

export interface OrganizationAccount {
  id: string
  organizationId: string
  organizationName: string
  verificationStatus: "Verified" | "Pending" | "Unverified"
  accountNumber: string
  accountName: string
  accountType: string
  currency: string
  status: "Active" | "Pending" | "Frozen"
  availableBalance: number
  ledgerBalance: number
  provider: { id: string; name: string }
  bankName: string
  createdAt: string
  walletIds: string[]
}

export interface WalletLimits {
  singleTransaction: number
  dailyTransfer: number
  dailyDisbursement: number
  dailyFunding: number
  dailyWithdrawal: number
}

export interface Wallet {
  id: string
  organizationId: string
  accountId: string
  name: string
  description: string
  type: WalletType
  scope: WalletScope
  branchId?: string
  branchName?: string
  /** Set when `scope` is `member` — the member who owns the balance. */
  memberId?: string
  memberName?: string
  accountNumber: string
  bankName: string
  currency: string
  status: WalletStatus
  availableBalance: number
  pendingBalance: number
  limits: WalletLimits
  createdAt: string
}

export type AccessSubject = "user" | "role"
export interface WalletAccess {
  id: string
  /** "*" grants the listed permissions on every wallet (organization-wide grant). */
  walletId: string
  subjectType: AccessSubject
  subjectId: string
  subjectName: string
  permissions: WalletPermission[]
}

export type TransactionType = "Funding" | "Loan Disbursement" | "Loan Repayment" | "Transfer" | "Withdrawal" | "Contribution" | "Dues" | "Payment" | "Adjustment" | "Fee" | "Refund" | "Cash Receipt" | "Cash Deposit"
export const TRANSACTION_TYPES: TransactionType[] = ["Funding", "Loan Disbursement", "Loan Repayment", "Transfer", "Withdrawal", "Contribution", "Dues", "Payment", "Adjustment", "Fee", "Refund", "Cash Receipt", "Cash Deposit"]
export type TransactionStatus = "Pending" | "Processing" | "Completed" | "Failed" | "Reversed" | "Cancelled"
export const TRANSACTION_STATUSES: TransactionStatus[] = ["Pending", "Processing", "Completed", "Failed", "Reversed", "Cancelled"]

export interface RelatedRecords {
  memberName?: string
  applicationId?: string
  loanReference?: string
  productName?: string
  /** Set when the movement is part of a contribution plan. */
  contributionId?: string
  contributionName?: string
  /** Set when the movement is a dues payment or a dues wallet recovery. */
  duesId?: string
  duesName?: string
  branchId?: string
  branchName?: string
  counterpartWalletId?: string
  accountNumber?: string
}

export interface WalletTransaction {
  id: string
  reference: string
  date: string
  description: string
  type: TransactionType
  walletId: string
  walletName: string
  amount: number
  direction: "credit" | "debit"
  status: TransactionStatus
  fee: number
  initiatedBy: string
  approvedBy?: string
  sender: string
  recipient: string
  related: RelatedRecords
  metadata: Record<string, string>
  approvalId?: string
  simulated?: boolean
}

export interface WalletTransfer {
  id: string
  reference: string
  fromWalletId: string
  toWalletId: string
  amount: number
  reason: string
  status: "Completed" | "Pending approval" | "Rejected"
  createdBy: string
  createdAt: string
  approvalId?: string
}

export type ApprovalKind = "Transfer" | "Disbursement" | "Withdrawal"
export interface DisbursementItem {
  applicationId: string
  borrowerName: string
  productName: string
  amount: number
  loanReference?: string
}
export interface WalletApproval {
  id: string
  kind: ApprovalKind
  reference: string
  walletId: string
  targetWalletId?: string
  amount: number
  reason: string
  requestedBy: string
  requestedById: string
  requestedAt: string
  required: number
  approvals: { by: string; byId: string; at: string }[]
  status: "Pending" | "Approved" | "Rejected"
  decisionNote?: string
  items?: DisbursementItem[]
  transactionIds: string[]
}

export interface ApprovalRule {
  id: string
  kind: ApprovalKind
  label: string
  minAmount: number
  maxAmount?: number
  approvalsRequired: number
  approverPermission: WalletPermission
  separationOfDuties: boolean
}

export interface WalletAuditLog {
  id: string
  at: string
  actor: string
  action: string
  walletId?: string
  walletName?: string
  amount?: number
  previousState?: string
  newState?: string
  reference?: string
  transactionId?: string
  approval?: string
}

export interface FundingMethod {
  id: string
  label: string
  enabled: boolean
  description: string
}

export interface WalletDataset {
  account: OrganizationAccount
  wallets: Wallet[]
  access: WalletAccess[]
  transactions: WalletTransaction[]
  transfers: WalletTransfer[]
  approvals: WalletApproval[]
  rules: ApprovalRule[]
  audit: WalletAuditLog[]
  fundingMethods: FundingMethod[]
  /** Cash taken at the counter, newest first. Held here because a receipt is part of the ledger. */
  receipts: CashReceipt[]
}

export interface Actor {
  id: string
  name: string
}
