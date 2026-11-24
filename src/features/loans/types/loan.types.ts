import type {
  ApplicationType,
  FormResponse,
  FormResponseValue,
  FormVersion,
  LoanApplicationForm,
} from "./form.types"
export type InterestType = "Flat" | "Reducing balance" | "Zero interest"
export type DurationUnit = "Days" | "Weeks" | "Months"
export type RepaymentFrequency = "Daily" | "Weekly" | "Biweekly" | "Monthly"
export type DeductionModel =
  | "None"
  | "Fees at disbursement"
  | "Interest & fees at disbursement"
export type RepaymentMethod =
  | "Bank transfer"
  | "Wallet debit"
  | "Cash"
  | "Direct debit"
  | "POS/manual"
export type DisbursementMethod = "Bank transfer" | "Wallet credit" | "Cash pickup"

export interface EligibilityRules {
  minMembershipMonths: number
  minSavingsBalance: number
  blockIfOverdueLoan: boolean
  requireKyc: boolean
}

export interface LoanProduct {
  id: string
  name: string
  description: string
  minAmount: number
  maxAmount: number
  minDuration: number
  maxDuration: number
  durationUnit: DurationUnit
  interestType: InterestType
  interestRate: number
  applicationFeePct: number
  deductionModel: DeductionModel
  frequency: RepaymentFrequency
  maxActiveLoans: number
  graceDays: number
  requiresApproval: boolean
  requiresGuarantor: boolean
  guarantorsRequired: number
  applicationType: ApplicationType
  allowExternalGuarantors: boolean
  requireGuarantorVerification: boolean
  requireGuarantorDocuments: boolean
  eligibility: EligibilityRules
  status: "Active" | "Inactive"
  updatedAt: string
}

export interface Borrower {
  id: string
  name: string
  phone: string
  email?: string
  type: "Member" | "External"
  memberId?: string
  branch: string
  address: string
  occupation: string
  membershipMonths: number
  savingsBalance: number
  kycVerified: boolean
}

export interface LoanTerms {
  amount: number
  duration: number
  durationUnit: DurationUnit
  interestType: InterestType
  interestRate: number
  applicationFeePct: number
  deductionModel: DeductionModel
  frequency: RepaymentFrequency
  graceDays: number
  firstRepaymentDate?: string
}

export type ApplicationStatus =
  | "Draft"
  | "Submitted"
  | "Under Review"
  | "Guarantor Pending"
  | "Approved"
  | "Offer Sent"
  | "Offer Accepted"
  | "Rejected"
  | "Disbursed"
  | "Cancelled"

export interface LoanDocument {
  id: string
  name: string
  type: string
  uploadedAt: string
  review: "Pending review" | "Accepted" | "Rejected"
}

export interface LoanActivity {
  id: string
  at: string
  actor: string
  action: string
  detail?: string
}

export interface EligibilityCheck {
  rule: string
  expected: string
  actual: string
  result: "pass" | "fail" | "review"
}

export interface LoanEligibilityResult {
  outcome: "Eligible" | "Not Eligible" | "Needs Review"
  checks: EligibilityCheck[]
}

export interface RevisedOffer {
  amount: number
  duration: number
  note: string
}

export interface LoanApplication {
  id: string
  reference: string
  applicant: Borrower
  productId: string
  productName: string
  terms: LoanTerms
  purpose: string
  source: "Internal" | "Public link" | "Admin created"
  status: ApplicationStatus
  approvedAmount?: number
  revisedOffer?: RevisedOffer
  rejectionReason?: string
  infoRequest?: string
  officer: string
  submittedAt: string
  employment: string
  monthlyIncome: number
  documents: LoanDocument[]
  eligibility: LoanEligibilityResult
  activity: LoanActivity[]
}

export type GuarantorStatus = "Pending" | "Verified" | "Accepted" | "Rejected"

export interface Guarantor {
  id: string
  name: string
  phone: string
  email?: string
  relationship: string
  type: "Member" | "External"
  memberId?: string
  address?: string
  occupation: string
}

export interface GuarantorRequest {
  id: string
  applicationId?: string
  loanId?: string
  guarantor: Guarantor
  amount: number
  status: GuarantorStatus
  verificationMethod?: "Phone verification" | "Signed guarantee form" | "Other"
  notes: string
  documents: LoanDocument[]
  updatedAt: string
}

export type ScheduleStatus =
  | "Upcoming"
  | "Due"
  | "Paid"
  | "Partially Paid"
  | "Overdue"

export interface RepaymentScheduleItem {
  no: number
  dueDate: string
  amount: number
  principal: number
  interest: number
  paid: number
  balance: number
  status: ScheduleStatus
}

export type LoanStatus =
  | "Active"
  | "Current"
  | "Overdue"
  | "Defaulted"
  | "Completed"
  | "Written Off"

export interface VirtualAccount {
  accountNumber: string
  accountName: string
  bank: string
  reference: string
  status: "Active" | "Closed"
}

export interface Loan {
  id: string
  reference: string
  applicationId?: string
  borrower: Borrower
  productId: string
  productName: string
  terms: LoanTerms
  principal: number
  interest: number
  fees: number
  deduction: number
  netDisbursed: number
  totalRepayable: number
  installment: number
  disbursedAt: string
  endDate: string
  schedule: RepaymentScheduleItem[]
  virtualAccount: VirtualAccount
  officer: string
  documents: LoanDocument[]
  activity: LoanActivity[]
  writtenOff?: boolean
  defaulted?: boolean
  // derived
  status: LoanStatus
  paid: number
  outstanding: number
  overdueAmount: number
  daysOverdue: number
  nextDueDate?: string
  nextDueAmount: number
}

export interface LoanRepayment {
  id: string
  loanId: string
  loanReference: string
  borrowerName: string
  amount: number
  method: RepaymentMethod
  date: string
  reference: string
  status: "Confirmed" | "Pending" | "Failed"
  allocation: { no: number; amount: number }[]
  recordedBy: string
  note?: string
}

export interface Disbursement {
  id: string
  applicationId: string
  loanId: string
  borrowerName: string
  approvedAmount: number
  fees: number
  deductions: number
  netAmount: number
  destination: string
  method: DisbursementMethod
  date: string
  reference: string
}

export type RecoveryStatus =
  | "Open"
  | "Reminder Sent"
  | "Promise to Pay"
  | "Guarantor Contacted"
  | "Guarantor Recovery"
  | "Resolved"

export interface RecoveryNote {
  id: string
  at: string
  type: string
  text: string
  by: string
}

export interface RecoveryCase {
  id: string
  loanId: string
  status: RecoveryStatus
  assignedTo: string
  openedAt: string
  notes: RecoveryNote[]
}

export interface RecoverySettings {
  defaultAfterDays: number
  reminderAfterDays: number
}

export interface LoanDataset {
  products: LoanProduct[]
  applications: LoanApplication[]
  loans: Loan[]
  repayments: LoanRepayment[]
  guarantorRequests: GuarantorRequest[]
  disbursements: Disbursement[]
  recoveryCases: RecoveryCase[]
  forms: LoanApplicationForm[]
  responses: FormResponse[]
  settings: RecoverySettings
  borrowers: Borrower[]
  guarantors: Guarantor[]
}

export interface LoanSummary {
  principal: number
  interest: number
  fees: number
  deduction: number
  netDisbursed: number
  installment: number
  totalRepayable: number
  count: number
  startDate: string
  endDate: string
  schedule: RepaymentScheduleItem[]
}

/** What a caller supplies when creating an application on behalf of a borrower. */
export interface NewApplicationInput {
  applicant: Borrower
  product: LoanProduct
  terms: LoanTerms
  purpose: string
  employment: string
  monthlyIncome: number
  source: LoanApplication["source"]
  status?: ApplicationStatus
  guarantors?: { guarantor: Guarantor; amount: number }[]
  documents?: string[]
  response?: { form: LoanApplicationForm; version: FormVersion; values: Record<string, FormResponseValue> }
}

/** An applicant's answers submitted against a specific form version. */
export interface SubmitFormApplicationInput {
  form: LoanApplicationForm
  version: FormVersion
  product: LoanProduct
  values: Record<string, FormResponseValue>
  members: Borrower[]
  source: "Internal" | "Public link"
}

/** What a caller supplies when recording a manual repayment. */
export interface RecordRepaymentInput {
  loanId: string
  amount: number
  method: RepaymentMethod
  date: string
  reference: string
  note?: string
  /** Staff wallet transaction PIN; required when recording against the live backend. */
  pin?: string
}

export type { ApplicationType, FormResponse, LoanApplicationForm }
