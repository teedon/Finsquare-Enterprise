import { apiClient, ApiError, endpoints } from "@/services/api"
import type {
  Borrower,
  DisbursementMethod,
  Disbursement,
  Guarantor,
  GuarantorRequest,
  GuarantorStatus,
  Loan,
  LoanApplication,
  LoanDataset,
  LoanProduct,
  LoanRepayment,
  NewApplicationInput,
  RecordRepaymentInput,
  RecoveryCase,
  RecoverySettings,
  RecoveryStatus,
  SubmitFormApplicationInput,
  FormResponse,
  LoanApplicationForm,
} from "../types/loan.types"
import type { LoanRepository } from "./loan.repository"
import { extractSubmission } from "../domain/loan-forms"
import { buildPublicPayload } from "../domain/public-application"
import type { FormResponseValue, FormVersion } from "../types/form.types"

// ── Backend DTO shapes (after the API client unwraps `{ success, data }`) ─────

interface LoanTypeDTO {
  id: string
  name: string
  description?: string | null
  isActive: boolean
  minAmount: number
  maxAmount: number
  minDuration: number
  maxDuration: number
  durationUnit: string
  interestType: string
  interestRate: number
  hasApplicationFee?: boolean
  applicationFeeType?: string
  applicationFeeValue?: number
  deductFeeAtDisbursement?: boolean
  repaymentFrequency: string
  enableAutoDebit?: boolean
  minMembershipDurationMonths?: number
  requireSavingsHistory?: boolean
  maxActiveLoans?: number
  gracePeriodDays?: number
  requiresGuarantor?: boolean
  guarantorCount?: number
  guarantorType?: "INTERNAL" | "EXTERNAL"
  requireAdminApproval?: boolean
  requiredCustomFieldNames?: string[]
  createdAt?: string
  updatedAt?: string
  applicationFeePct?: number
  deductionModel?: "None" | "Fees at disbursement" | "Interest & fees at disbursement"
  requiresApproval?: boolean
  allowExternalGuarantors?: boolean
  requireGuarantorVerification?: boolean
  requireGuarantorDocuments?: boolean
  applicationType?: "Internal" | "External" | "Both"
  eligibility?: {
    minMembershipMonths: number
    minSavingsBalance: number
    blockIfOverdueLoan: boolean
    requireKyc: boolean
  }
}

interface EnterpriseCustomerDTO {
  id: string
  fullName?: string | null
  email?: string | null
  phoneNumber?: string | null
  address?: string | null
  bvn?: string | null
  nin?: string | null
  kycStatus?: string | null
  joinedAt?: string | null
  createdAt?: string | null
  mfiMeta?: { branchName?: string | null } | null
}

interface LoanApplicationDTO {
  id: string
  amount: number
  purpose: string
  status: string
  appliedAt: string
  reviewedAt: string | null
  reviewNote: string | null
  user: {
    id: string
    firstName: string
    lastName: string
    email: string
    phoneNumber?: string | null
    walletTier?: string | null
    address?: string | null
    dob?: string | null
    gender?: string | null
  }
  bankAccount?: unknown
  customFields?: Record<string, unknown>
  membershipJoinedAt?: string | null
  loanType?: {
    id: string
    name: string
    interestRate: number
    interestType: string
    minAmount: number
    maxAmount: number
    durationUnit: string
    minDuration: number
    maxDuration: number
    repaymentFrequency: string
    requiresGuarantor?: boolean
    guarantorCount?: number
    guarantorType?: string
  }
  interestAmount?: number
  totalRepayment?: number
  monthlyPayment?: number
  duration?: number
  durationUnit?: string
  creditScore?: number | null
  creditScoreBucket?: string | null
  riskLevel?: string | null
  guarantors?: Array<{ id?: string; userId: string; name: string; status: string; guaranteeAmount?: number | null }>
  externalGuarantors?: Array<{
    id: string
    name: string
    phone?: string
    email?: string | null
    relationship?: string | null
    address?: string | null
    occupation?: string | null
    isVerified?: boolean
    guaranteeAmount?: number | null
    verifiedBy?: string | null
    verifiedAt?: string | null
    note?: string | null
  }>
  applicationFee?: number
  documents?: Array<unknown>
  eligibilityChecks?: Array<unknown>
  revisedOffer?: { amount: number; duration: number; note?: string | null } | null
  formVersion?: FormVersion
  formResponse?: Record<string, FormResponseValue> | null
}

interface ActiveLoanDTO {
  id: string
  applicationId: string
  loanType: string
  interestRate: number
  interestType: string
  repaymentFrequency: string
  purpose: string
  borrower: { id: string; fullName: string; firstName: string; lastName: string; email: string; phoneNumber: string | null }
  principalAmount: number
  totalRepaid: number
  outstandingBalance: number
  totalLoanAmount: number
  repaidPercent: number
  duration: number
  durationUnit: string
  disbursementDate: string | null
  disbursementMethod: string
  gracePeriodDays: number
  status: string
  autoDebitEnabled: boolean
  schedule: {
    completed: number
    total: number
    nextPaymentDate: string | null
    nextPaymentAmount: number
    items: Array<{ number: number; amount: number; dueDate: string | null; isPaid: boolean; paidAt: string | null; status?: string; balance?: number }>
  }
  recentRepayments: Array<{ id: string; amount: number; paidAt: string; reference: string }>
  netDisbursed?: number
  applicationFee?: number
  deduction?: number
  daysOverdue?: number
  overdueAmount?: number
  endDate?: string | null
  officerId?: string | null
}

interface RepaymentDTO {
  id: string
  amount: number
  paidAt: string
  reference: string
  loanId: string
  loanTypeName: string
  purpose: string
  borrower: { id: string; name: string; email: string }
  scheduleItem: { number: number; amount: number; dueDate: string | null } | null
  loan: { principalAmount: number; outstandingBalance: number; totalRepaid: number; totalLoanAmount: number }
}

interface DisbursementLogDTO {
  id: string
  applicationId: string
  applicant: { id: string; fullName: string; email: string; phoneNumber: string } | null
  loanType: string
  purpose: string
  amount: number
  status: string
  attempts: number
  lastError: string | null
  lastAttemptAt: string | null
  reference: string | null
  destinationType?: "BANK_ACCOUNT" | "CUSTOMER_WALLET"
  createdAt: string
}

interface RecoveryCaseDTO {
  id: string
  loanId: string
  status: string
  assignedTo: string | null
  openedAt: string
  notes: Array<{ id: string; at: string; type: string; text: string; by: string }>
}

interface EnterpriseLoansDTO {
  loans: ActiveLoanDTO[]
  recoveryCases: RecoveryCaseDTO[]
  settings: { defaultAfterDays: number; reminderAfterDays: number }
}

// ── Mapping helpers ───────────────────────────────────────────────────────────

const durUnit = (v: string): "Days" | "Weeks" | "Months" =>
  v.toLowerCase().startsWith("day") ? "Days" : v.toLowerCase().startsWith("week") ? "Weeks" : "Months"

const interestType = (v: string): "Flat" | "Reducing balance" | "Zero interest" =>
  v.toLowerCase().includes("reduc") ? "Reducing balance" : "Flat"

const freq = (v: string): "Daily" | "Weekly" | "Biweekly" | "Monthly" =>
  v.toLowerCase().startsWith("day") ? "Daily" : v.toLowerCase().startsWith("week") ? "Weekly" : "Monthly"

const appStatus = (v: string): LoanApplication["status"] => {
  switch (v) {
    case "APPROVED": return "Approved"
    case "REJECTED": return "Rejected"
    case "ACTIVE":
    case "AWAITING_DISBURSEMENT":
    case "DISBURSED": return "Disbursed"
    case "COMPLETED": return "Disbursed"
    case "DEFAULTED": return "Rejected"
    case "RESTRUCTURED": return "Approved"
    case "INFO_REQUESTED": return "Under Review"
    case "UNDER_REVIEW": return "Under Review"
    case "CANCELLED": return "Cancelled"
    case "OFFER_SENT": return "Offer Sent"
    case "OFFER_ACCEPTED": return "Offer Accepted"
    case "PENDING":
    default: return "Submitted"
  }
}

function mapProduct(dto: LoanTypeDTO, savedApplicationType?: unknown): LoanProduct {
  const applicationType =
    savedApplicationType === "Internal" || savedApplicationType === "External" || savedApplicationType === "Both"
      ? savedApplicationType
      : dto.applicationType ?? (dto.guarantorType === "EXTERNAL" ? "External" : "Both")
  return {
    id: dto.id,
    name: dto.name,
    description: dto.description ?? "",
    minAmount: dto.minAmount,
    maxAmount: dto.maxAmount,
    minDuration: dto.minDuration,
    maxDuration: dto.maxDuration,
    durationUnit: durUnit(dto.durationUnit),
    interestType: dto.interestRate === 0 ? "Zero interest" : interestType(dto.interestType),
    interestRate: dto.interestRate,
    applicationFeePct: dto.applicationFeePct ?? (dto.hasApplicationFee && dto.applicationFeeType === "percentage" ? dto.applicationFeeValue ?? 0 : 0),
    deductionModel: dto.deductionModel ?? (dto.deductFeeAtDisbursement ? "Fees at disbursement" : "None"),
    frequency: freq(dto.repaymentFrequency),
    maxActiveLoans: dto.maxActiveLoans ?? 1,
    graceDays: dto.gracePeriodDays ?? 0,
    requiresApproval: dto.requiresApproval ?? dto.requireAdminApproval ?? true,
    requiresGuarantor: dto.requiresGuarantor ?? false,
    guarantorsRequired: dto.guarantorCount ?? 0,
    applicationType,
    allowExternalGuarantors: dto.allowExternalGuarantors ?? dto.guarantorType === "EXTERNAL",
    requireGuarantorVerification: dto.requireGuarantorVerification ?? false,
    requireGuarantorDocuments: dto.requireGuarantorDocuments ?? false,
    eligibility: dto.eligibility ?? {
      minMembershipMonths: dto.minMembershipDurationMonths ?? 0,
      minSavingsBalance: 0,
      blockIfOverdueLoan: false,
      requireKyc: false,
    },
    status: dto.isActive ? "Active" : "Inactive",
    updatedAt: dto.updatedAt ?? dto.createdAt ?? "",
  }
}

function borrowerFromUser(u: LoanApplicationDTO["user"]): Borrower {
  return {
    id: u.id,
    name: [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || u.email,
    phone: u.phoneNumber ?? "",
    email: u.email,
    type: "Member",
    memberId: u.id,
    branch: "",
    address: u.address ?? "",
    occupation: "",
    membershipMonths: 0,
    savingsBalance: 0,
    kycVerified: !!u.walletTier,
  }
}

function mapApplication(dto: LoanApplicationDTO): LoanApplication {
  const applicant = borrowerFromUser(dto.user)
  return {
    id: dto.id,
    reference: dto.id,
    applicant,
    productId: dto.loanType?.id ?? "",
    productName: dto.loanType?.name ?? "",
    terms: {
      amount: dto.amount,
      duration: dto.duration ?? 1,
      durationUnit: durUnit(dto.durationUnit ?? dto.loanType?.durationUnit ?? "months"),
      interestType: interestType(dto.loanType?.interestType ?? "FLAT_RATE"),
      interestRate: dto.loanType?.interestRate ?? 0,
      applicationFeePct: 0,
      deductionModel: "None",
      frequency: freq(dto.loanType?.repaymentFrequency ?? "monthly"),
      graceDays: 0,
    },
    purpose: dto.purpose,
    source: "Public link",
    status: appStatus(dto.status),
    approvedAmount: dto.status === "APPROVED" ? dto.amount : undefined,
    rejectionReason: dto.status === "REJECTED" ? dto.reviewNote ?? undefined : undefined,
    infoRequest: dto.status === "INFO_REQUESTED" ? dto.reviewNote ?? undefined : undefined,
    revisedOffer: dto.revisedOffer
      ? { amount: dto.revisedOffer.amount, duration: dto.revisedOffer.duration, note: dto.revisedOffer.note ?? "" }
      : undefined,
    officer: "",
    submittedAt: dto.appliedAt,
    employment: "",
    monthlyIncome: 0,
    documents: (dto.documents ?? []).map((doc, index) => {
      const raw = doc as { id?: string; name?: string; type?: string; uploadedAt?: string; review?: string }
      const name = raw.name ?? (typeof doc === "string" ? doc : `Document ${index + 1}`)
      return {
        id: raw.id ?? `doc-${dto.id}-${index}`,
        name,
        type: raw.type ?? "Upload",
        uploadedAt: raw.uploadedAt ?? dto.appliedAt,
        review: (raw.review === "Accepted" || raw.review === "Rejected" ? raw.review : "Pending review") as LoanApplication["documents"][number]["review"],
      }
    }),
    eligibility: { outcome: "Eligible", checks: [] },
    activity: [],
  }
}

function mapFormResponse(dto: LoanApplicationDTO): FormResponse | null {
  if (!dto.formVersion || !dto.formResponse) return null
  const version = dto.formVersion
  return {
    id: `${dto.id}-${version.id}`,
    applicationId: dto.id,
    formId: dto.loanType?.id ?? "",
    versionId: version.id,
    versionNumber: version.version,
    applicantType: "External",
    submittedAt: dto.appliedAt,
    values: dto.formResponse,
  }
}

function mapLoan(dto: ActiveLoanDTO): Loan {
  return {
    id: dto.id,
    reference: dto.id,
    applicationId: dto.applicationId,
    borrower: {
      id: dto.borrower.id,
      name: dto.borrower.fullName,
      phone: dto.borrower.phoneNumber ?? "",
      email: dto.borrower.email,
      type: "Member",
      memberId: dto.borrower.id,
      branch: "",
      address: "",
      occupation: "",
      membershipMonths: 0,
      savingsBalance: 0,
      kycVerified: true,
    },
    productId: "",
    productName: dto.loanType,
    terms: {
      amount: dto.principalAmount,
      duration: dto.duration,
      durationUnit: durUnit(dto.durationUnit),
      interestType: interestType(dto.interestType),
      interestRate: dto.interestRate,
      applicationFeePct: 0,
      deductionModel: "None",
      frequency: freq(dto.repaymentFrequency),
      graceDays: dto.gracePeriodDays,
    },
    principal: dto.principalAmount,
    interest: 0,
    fees: dto.applicationFee ?? 0,
    deduction: dto.deduction ?? 0,
    netDisbursed: dto.netDisbursed ?? dto.principalAmount,
    totalRepayable: dto.totalLoanAmount,
    installment: dto.schedule.total > 0 ? Math.round(dto.totalLoanAmount / dto.schedule.total) : dto.totalLoanAmount,
    disbursedAt: dto.disbursementDate ?? "",
    endDate: dto.endDate ?? dto.schedule.items[dto.schedule.items.length - 1]?.dueDate ?? "",
    schedule: dto.schedule.items.map((item) => ({
      no: item.number,
      dueDate: item.dueDate ?? "",
      amount: item.amount,
      principal: item.amount,
      interest: 0,
      paid: item.isPaid ? item.amount : 0,
      balance: item.balance ?? (item.isPaid ? 0 : item.amount),
      status: item.status === "PAID" ? "Paid" : item.status === "OVERDUE" ? "Overdue" : item.isPaid ? "Paid" : "Upcoming",
    })),
    virtualAccount: { accountNumber: "", accountName: "", bank: "", reference: "", status: "Active" },
    officer: dto.officerId ?? "",
    documents: [],
    activity: [],
    status: dto.status === "DEFAULTED" ? "Defaulted" : dto.status === "WRITTEN_OFF" ? "Written Off" : dto.status === "COMPLETED" ? "Completed" : (dto.daysOverdue ?? 0) > 0 ? "Overdue" : "Active",
    defaulted: dto.status === "DEFAULTED",
    writtenOff: dto.status === "WRITTEN_OFF",
    paid: dto.totalRepaid,
    outstanding: dto.outstandingBalance,
    overdueAmount: dto.overdueAmount ?? 0,
    daysOverdue: dto.daysOverdue ?? 0,
    nextDueDate: dto.schedule.nextPaymentDate ?? undefined,
    nextDueAmount: dto.schedule.nextPaymentAmount,
  }
}

function mapRepayment(dto: RepaymentDTO): LoanRepayment {
  return {
    id: dto.id,
    loanId: dto.loanId,
    loanReference: dto.loanId,
    borrowerName: dto.borrower.name,
    amount: dto.amount,
    method: "Bank transfer",
    date: dto.paidAt,
    reference: dto.reference,
    status: "Confirmed",
    allocation: dto.scheduleItem ? [{ no: dto.scheduleItem.number, amount: dto.amount }] : [],
    recordedBy: "System",
  }
}

function mapDisbursement(dto: DisbursementLogDTO): Disbursement {
  return {
    id: dto.id,
    applicationId: dto.applicationId,
    loanId: "",
    borrowerName: dto.applicant?.fullName ?? "",
    approvedAmount: dto.amount,
    fees: 0,
    deductions: 0,
    netAmount: dto.amount,
    destination: dto.destinationType === "CUSTOMER_WALLET" ? "Customer internal wallet" : "Verified bank account",
    method: dto.destinationType === "CUSTOMER_WALLET" ? "Wallet credit" : "Bank transfer",
    date: dto.createdAt,
    reference: dto.reference ?? dto.id,
  }
}

const DEFAULT_SETTINGS: RecoverySettings = { defaultAfterDays: 60, reminderAfterDays: 3 }

function mapRecoveryCase(dto: RecoveryCaseDTO): RecoveryCase {
  return {
    id: dto.id,
    loanId: dto.loanId,
    status: dto.status as RecoveryStatus,
    assignedTo: dto.assignedTo ?? "",
    openedAt: dto.openedAt,
    notes: (dto.notes ?? []).map((note) => ({
      id: note.id,
      at: note.at,
      type: note.type,
      text: note.text,
      by: note.by,
    })),
  }
}

function notAvailable(feature: string): never {
  throw new ApiError(`${feature} is not available on the MFI backend yet.`, "not_found")
}

/**
 * API-backed loan repository, wired to the MFI staff endpoints.
 *
 * Reads assemble the same `LoanDataset` the mock produces; commands map onto the named backend
 * actions. Commands the backend does not expose yet throw a user-safe error rather than pretending.
 */
export class ApiLoanRepository implements LoanRepository {
  private listeners = new Set<() => void>()

  private notify() {
    this.listeners.forEach((listener) => listener())
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => void this.listeners.delete(listener)
  }

  async load(): Promise<LoanDataset> {
    const [types, applicationsPage, enterprise, repaymentsPage, logs, customersPage] = await Promise.all([
      apiClient.get<LoanTypeDTO[]>(endpoints.loans.enterpriseTypes),
      apiClient.get<{ applications: LoanApplicationDTO[] }>(endpoints.loans.applications),
      apiClient.get<EnterpriseLoansDTO>(endpoints.loans.enterpriseLoans),
      apiClient.get<{ repayments: RepaymentDTO[] }>(endpoints.loans.repayments),
      apiClient.get<DisbursementLogDTO[]>(endpoints.loans.disbursementLogs),
      apiClient.get<{ customers: EnterpriseCustomerDTO[] }>(endpoints.members.all),
    ])

    const formRecords = await Promise.all(types.map(async (type) => ({
      productId: type.id,
      saved: await apiClient.get<{ form: LoanApplicationForm; version: FormVersion } | null>(endpoints.loans.enterpriseTypeForm(type.id)),
    })))
    const products = types.map((type) => {
      const savedForm = formRecords.find((record) => record.productId === type.id)?.saved
      return mapProduct(type, savedForm?.form?.applicationType)
    })
    const applications = applicationsPage.applications.map(mapApplication)
    const loans = enterprise.loans.map(mapLoan)
    const repayments = repaymentsPage.repayments.map(mapRepayment)
    const disbursements = logs.map(mapDisbursement)
    const recoveryCases = enterprise.recoveryCases.map(mapRecoveryCase)
    const settings = enterprise.settings ?? DEFAULT_SETTINGS

    const guarantorRequests: GuarantorRequest[] = []
    const responses = applicationsPage.applications.map(mapFormResponse).filter((r): r is FormResponse => r !== null)
    const borrowers: Borrower[] = customersPage.customers.map((customer): Borrower => ({
      id: customer.id,
      name: customer.fullName || customer.email || customer.phoneNumber || "Member",
      phone: customer.phoneNumber ?? "",
      email: customer.email ?? undefined,
      type: "Member",
      memberId: customer.id,
      branch: customer.mfiMeta?.branchName ?? "",
      address: customer.address ?? "",
      occupation: "",
      membershipMonths: 0,
      savingsBalance: 0,
      kycVerified: customer.kycStatus === "VERIFIED" || Boolean(customer.bvn || customer.nin),
    }))
    const guarantors: Guarantor[] = []
    for (const dto of applicationsPage.applications) {
      for (const g of dto.guarantors ?? []) {
        guarantors.push({ id: g.userId, name: g.name, phone: "", relationship: "", type: "Member", memberId: g.userId, occupation: "" })
        guarantorRequests.push({ id: g.id ?? g.userId, applicationId: dto.id, guarantor: { id: g.userId, name: g.name, phone: "", relationship: "", type: "Member", memberId: g.userId, occupation: "" }, amount: g.guaranteeAmount ?? 0, status: g.status === "verified" || g.status === "accepted" ? "Verified" : "Pending", notes: "", documents: [], updatedAt: "" })
      }
      for (const g of dto.externalGuarantors ?? []) {
        const guarantor: Guarantor = { id: g.id, name: g.name, phone: g.phone ?? "", relationship: g.relationship ?? "", type: "External", occupation: g.occupation ?? "" }
        guarantors.push(guarantor)
        guarantorRequests.push({
          id: `ext-${g.id}`,
          applicationId: dto.id,
          guarantor,
          amount: g.guaranteeAmount ?? 0,
          status: g.isVerified ? "Verified" : "Pending",
          notes: g.note ?? "",
          documents: [],
          updatedAt: g.verifiedAt ?? "",
        })
      }
    }
    return {
      products,
      applications,
      loans,
      repayments,
      guarantorRequests,
      disbursements,
      recoveryCases,
      forms: formRecords.flatMap(({ saved }) => saved?.form ? [saved.form] : []),
      responses,
      settings,
      borrowers,
      guarantors,
    }
  }

  async saveProduct(product: LoanProduct): Promise<LoanProduct> {
    const payload = {
      name: product.name,
      description: product.description,
      isActive: product.status === "Active",
      minAmount: product.minAmount,
      maxAmount: product.maxAmount,
      minDuration: product.minDuration,
      maxDuration: product.maxDuration,
      durationUnit: product.durationUnit.toLowerCase(),
      interestType: product.interestType === "Reducing balance" ? "reducingBalance" : "flatRate",
      interestRate: product.interestRate,
      hasApplicationFee: product.applicationFeePct > 0,
      applicationFeeType: "percentage",
      applicationFeeValue: product.applicationFeePct,
      deductFeeAtDisbursement: product.deductionModel !== "None",
      repaymentFrequency: product.frequency === "Daily" ? "daily" : product.frequency === "Weekly" ? "weekly" : "monthly",
      maxActiveLoans: product.maxActiveLoans,
      gracePeriodDays: product.graceDays,
      requiresGuarantor: product.requiresGuarantor,
      guarantorCount: product.guarantorsRequired,
      guarantorType: product.allowExternalGuarantors ? "EXTERNAL" : "INTERNAL",
      requireAdminApproval: product.requiresApproval,
      minMembershipDurationMonths: product.eligibility.minMembershipMonths,
      requireSavingsHistory: product.eligibility.minSavingsBalance > 0,
    }
    let savedProduct = product
    // New products get a temporary `lp-*` ID in the wizard. Looking that up first returns 404
    // and prevents both product creation and saving the draft form.
    if (!product.id.startsWith("lp-")) {
      await apiClient.put(endpoints.loans.type(product.id), payload)
    } else {
      const created = await apiClient.post<{ id: string }>(endpoints.loans.types, payload)
      if (!created?.id) throw new ApiError("The backend did not return the new loan type ID", "server")
      savedProduct = { ...product, id: created.id }
    }
    this.notify()
    return savedProduct
  }

  async approve(id: string, amount: number, note: string): Promise<void> {
    const app = (await this.load()).applications.find((a) => a.id === id)
    if (!app) throw new ApiError("Application not found", "not_found")
    if (amount !== app.terms.amount) {
      await apiClient.post(endpoints.loans.offer(id), {
        amount,
        duration: app.terms.duration,
        note: note || undefined,
      })
    } else {
      await apiClient.post(endpoints.loans.approve(id), { note: note || undefined })
    }
    this.notify()
  }

  async reject(id: string, reason: string): Promise<void> {
    await apiClient.post(endpoints.loans.reject(id), { note: reason })
    this.notify()
  }

  async updateGuarantor(
    req: GuarantorRequest,
    status: GuarantorStatus,
    _method: GuarantorRequest["verificationMethod"],
    notes: string,
    _signedForm: boolean,
  ): Promise<void> {
    void _method
    void _signedForm
    if (!req.applicationId) return notAvailable("Guarantor verification")
    const verified = status === "Verified" || status === "Accepted"
    const guarantorId = req.guarantor.type === "Member" ? req.id : req.guarantor.id
    await apiClient.post(endpoints.loans.verifyGuarantor(req.applicationId, guarantorId), {
      isVerified: verified,
      note: notes || undefined,
    })
    this.notify()
  }

  async createApplication(input: NewApplicationInput): Promise<LoanApplication> {
    const response = await apiClient.post<{
      id: string
      status: string
      amount: number
      purpose: string
      loanTypeId: string
      applicantId: string
    }>(endpoints.loans.create, {
      userId: input.applicant.id,
      loanTypeId: input.product.id,
      amount: input.terms.amount,
      duration: input.terms.duration,
      purpose: input.purpose,
      externalGuarantors: (input.guarantors ?? []).filter((g) => g.guarantor.type === "External").map((g) => ({
        name: g.guarantor.name,
        phone: g.guarantor.phone,
        relationship: g.guarantor.relationship,
        occupation: g.guarantor.occupation,
      })),
      formVersion: input.response?.version,
      formResponse: input.response?.values,
    })
    this.notify()
    // The pages re-fetch the dataset after the notify; return a minimal application for the caller.
    return {
      id: response.id,
      reference: response.id,
      applicant: input.applicant,
      productId: response.loanTypeId,
      productName: input.product.name,
      terms: input.terms,
      purpose: response.purpose,
      source: input.source,
      status: appStatus(response.status),
      officer: "",
      submittedAt: new Date().toISOString(),
      employment: input.employment,
      monthlyIncome: input.monthlyIncome,
      documents: [],
      eligibility: { outcome: "Eligible", checks: [] },
      activity: [],
    }
  }
  async startReview(id: string): Promise<void> {
    await apiClient.post(endpoints.loans.startReview(id))
    this.notify()
  }
  async reviseOffer(id: string, amount: number, duration: number, note: string): Promise<void> {
    await apiClient.post(endpoints.loans.offer(id), {
      amount,
      duration,
      note: note || undefined,
    })
    this.notify()
  }
  async acceptOffer(id: string): Promise<void> {
    await apiClient.post(endpoints.loans.acceptOffer(id))
    this.notify()
  }
  async requestInfo(id: string, message: string): Promise<void> {
    await apiClient.post(endpoints.loans.requestInfo(id), { message })
    this.notify()
  }
  async cancel(id: string): Promise<void> {
    await apiClient.post(endpoints.loans.cancel(id))
    this.notify()
  }
  async reviewDocument(appId: string, docId: string, review: "Accepted" | "Rejected"): Promise<void> {
    await apiClient.patch(endpoints.loans.documentReview(appId, docId), { review })
    this.notify()
  }
  async addGuarantor(applicationId: string, guarantor: Guarantor, amount: number): Promise<void> {
    await apiClient.post(endpoints.loans.guarantors(applicationId), {
      type: guarantor.type === "Member" ? "Internal" : "External",
      userId: guarantor.type === "Member" ? guarantor.memberId ?? guarantor.id : undefined,
      name: guarantor.name,
      phone: guarantor.phone,
      email: guarantor.email,
      relationship: guarantor.relationship,
      address: guarantor.address,
      occupation: guarantor.occupation,
      amount,
    })
    this.notify()
  }
  async disburse(appIds: string[], method: DisbursementMethod, pin?: string): Promise<Loan[]> {
    if (!pin || !/^\d{4}$/.test(pin)) {
      throw new ApiError("Enter your 4-digit transaction PIN to disburse loans", "validation")
    }
    const result = await apiClient.post<{ results?: Array<{ id: string; success: boolean; error?: string }> }>(
      endpoints.loans.batchDisburse,
      {
        ids: appIds,
        pin,
        destination: method === "Wallet credit" ? "CUSTOMER_WALLET" : "BANK_ACCOUNT",
      },
    )
    this.notify()
    const dataset = await this.load()
    const failures = result.results?.filter((entry) => !entry.success) ?? []
    if (failures.length) {
      const message = failures.map((entry) => `${entry.id}: ${entry.error ?? "disbursement failed"}`).join("; ")
      throw new ApiError(`Some loans were not disbursed: ${message}`, "unknown")
    }
    return dataset.loans.filter((loan) => loan.applicationId && appIds.includes(loan.applicationId))
  }
  async recordRepayment(input: RecordRepaymentInput): Promise<LoanRepayment> {
    if (!input.pin) {
      throw new ApiError("A wallet PIN is required to record a repayment", "validation")
    }
    const response = await apiClient.post<{
      id: string
      amount: number
      paidAt: string
      reference: string
      loanId: string
      method: string | null
      note: string | null
      recordedByName: string | null
    }>(endpoints.loans.repay(input.loanId), {
      amount: input.amount,
      method: input.method,
      date: input.date,
      reference: input.reference || undefined,
      note: input.note || undefined,
      pin: input.pin,
    })
    this.notify()
    return {
      id: response.id,
      loanId: response.loanId,
      loanReference: response.loanId,
      borrowerName: "",
      amount: response.amount,
      method: input.method,
      date: response.paidAt,
      reference: response.reference,
      status: "Confirmed",
      allocation: [],
      recordedBy: response.recordedByName ?? "Staff",
      note: response.note ?? undefined,
    }
  }
  async startRecovery(loanId: string): Promise<void> {
    await apiClient.post(endpoints.loans.startRecovery(loanId))
    this.notify()
  }
  async recoveryAction(c: RecoveryCase, type: string, text: string, status?: RecoveryStatus): Promise<void> {
    await apiClient.post(endpoints.loans.recoveryActions(c.id), {
      type,
      text,
      status: status || undefined,
    })
    this.notify()
  }
  async markDefaulted(loanId: string): Promise<void> {
    await apiClient.post(endpoints.loans.markDefaulted(loanId))
    this.notify()
  }
  async writeOff(loanId: string): Promise<void> {
    await apiClient.post(endpoints.loans.writeOff(loanId))
    this.notify()
  }
  async saveSettings(s: RecoverySettings): Promise<void> {
    await apiClient.patch(endpoints.loans.recoverySettings, {
      defaultAfterDays: s.defaultAfterDays,
      reminderAfterDays: s.reminderAfterDays,
    })
    this.notify()
  }
  async saveForm(form: LoanApplicationForm): Promise<void> {
    const version = form.versions[form.versions.length - 1]
    if (!version) throw new ApiError("The application form has no version to save", "validation")
    await apiClient.put(endpoints.loans.enterpriseTypeForm(form.productId), { form, version, publish: false })
    this.notify()
  }
  async saveProductWithForm(product: LoanProduct, form: LoanApplicationForm, version: FormVersion, publish: boolean): Promise<void> {
    const savedProduct = await this.saveProduct(product)
    const persistedForm = { ...form, id: savedProduct.id, productId: savedProduct.id, applicationType: product.applicationType }
    await apiClient.put(endpoints.loans.enterpriseTypeForm(savedProduct.id), {
      form: persistedForm,
      version,
      publish,
    })
    this.notify()
  }
  async submitFormApplication(input: SubmitFormApplicationInput): Promise<LoanApplication> {
    const submission = extractSubmission(input.version, input.values, input.product, input.members)
    if (input.source === "Public link") {
      const result = await apiClient.post<{ applicationId: string }>(
        endpoints.loans.publicSubmit(input.form.slug),
        buildPublicPayload(input.version, input.product, input.values),
      )
      this.notify()
      return {
        id: result.applicationId,
        reference: result.applicationId,
        applicant: submission.applicant,
        productId: input.product.id,
        productName: input.product.name,
        terms: submission.terms,
        purpose: submission.purpose,
        source: input.source,
        status: "Submitted",
        officer: "",
        submittedAt: new Date().toISOString(),
        employment: "",
        monthlyIncome: 0,
        documents: [],
        eligibility: { outcome: "Eligible", checks: [] },
        activity: [],
      }
    }

    if (submission.applicant.type !== "Member") {
      throw new ApiError("Choose an existing customer for an internal application", "validation")
    }
    return this.createApplication({
      applicant: submission.applicant,
      product: input.product,
      terms: submission.terms,
      purpose: submission.purpose,
      source: input.source,
      employment: submission.employment,
      monthlyIncome: submission.monthlyIncome,
      guarantors: submission.guarantors,
      response: { form: input.form, version: input.version, values: input.values },
    })
  }
  async publishForm(form: LoanApplicationForm, version: FormVersion): Promise<void> {
    await apiClient.put(endpoints.loans.enterpriseTypeForm(form.productId), { form, version, publish: true })
    this.notify()
  }
  async archiveForm(form: LoanApplicationForm): Promise<void> {
    const version = form.versions.find((item) => item.id === form.publishedVersionId) ?? form.versions[form.versions.length - 1]
    if (!version) throw new ApiError("The application form has no version to archive", "validation")
    await apiClient.put(endpoints.loans.enterpriseTypeForm(form.productId), {
      form: { ...form, status: "Archived" },
      version,
      publish: false,
    })
    this.notify()
  }
}
