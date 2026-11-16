import { env } from "@/app/config/env"
import { SEED_ORGANIZATION_ID, isSeedTenant } from "@/lib/tenancy/seed-tenant"
import { createEmptyLoanDataset } from "../mocks/loans.mock"
import { ApiLoanRepository } from "../repositories/api-loan.repository"
import { createMockLoanRepository } from "../repositories/mock-loan.repository"
import type { LoanRepository } from "../repositories/loan.repository"
import type {
  DisbursementMethod,
  Guarantor,
  GuarantorRequest,
  GuarantorStatus,
  Loan,
  LoanApplication,
  LoanApplicationForm,
  LoanDataset,
  LoanProduct,
  LoanRepayment,
  NewApplicationInput,
  RecordRepaymentInput,
  RecoveryCase,
  RecoveryStatus,
  RecoverySettings,
  SubmitFormApplicationInput,
} from "../types/loan.types"
import type { FormVersion } from "../types/form.types"

export type { NewApplicationInput }

/**
 * The loan boundary every screen talks to. It is a thin delegate over a repository, so the mock and
 * the MFI backend present the same command surface: pages never know which source is behind it.
 */
export class LoansService {
  constructor(private repo: LoanRepository) {}

  load = () => this.repo.load()
  subscribe = (listener: () => void) => this.repo.subscribe(listener)

  saveProduct = (product: LoanProduct) => this.repo.saveProduct({ ...product, updatedAt: new Date().toISOString() })
  createApplication = (input: NewApplicationInput): Promise<LoanApplication> => this.repo.createApplication(input)
  startReview = (id: string) => this.repo.startReview(id)
  approve = (id: string, amount: number, note: string) => this.repo.approve(id, amount, note)
  reviseOffer = (id: string, amount: number, duration: number, note: string) => this.repo.reviseOffer(id, amount, duration, note)
  acceptOffer = (id: string) => this.repo.acceptOffer(id)
  reject = (id: string, reason: string) => this.repo.reject(id, reason)
  requestInfo = (id: string, message: string) => this.repo.requestInfo(id, message)
  cancel = (id: string) => this.repo.cancel(id)
  reviewDocument = (appId: string, docId: string, review: "Accepted" | "Rejected") => this.repo.reviewDocument(appId, docId, review)
  addGuarantor = (applicationId: string, guarantor: Guarantor, amount: number) => this.repo.addGuarantor(applicationId, guarantor, amount)
  updateGuarantor = (
    req: GuarantorRequest,
    status: GuarantorStatus,
    method: GuarantorRequest["verificationMethod"],
    notes: string,
    signedForm: boolean,
  ) => this.repo.updateGuarantor(req, status, method, notes, signedForm)
  disburse = (appIds: string[], method: DisbursementMethod, pin?: string): Promise<Loan[]> => this.repo.disburse(appIds, method, pin)
  recordRepayment = (input: RecordRepaymentInput): Promise<LoanRepayment> => this.repo.recordRepayment(input)
  startRecovery = (loanId: string) => this.repo.startRecovery(loanId)
  recoveryAction = (c: RecoveryCase, type: string, text: string, status?: RecoveryStatus) => this.repo.recoveryAction(c, type, text, status)
  markDefaulted = (loanId: string) => this.repo.markDefaulted(loanId)
  writeOff = (loanId: string) => this.repo.writeOff(loanId)
  saveSettings = (settings: RecoverySettings) => this.repo.saveSettings(settings)
  saveForm = (form: LoanApplicationForm) => this.repo.saveForm(form)
  saveProductWithForm = (product: LoanProduct, form: LoanApplicationForm, version: FormVersion, publish: boolean) =>
    this.repo.saveProductWithForm(product, form, version, publish)
  submitFormApplication = (a: SubmitFormApplicationInput): Promise<LoanApplication> => this.repo.submitFormApplication(a)
  publishForm = (form: LoanApplicationForm, version: FormVersion) => this.repo.publishForm(form, version)
  archiveForm = (form: LoanApplicationForm) => this.repo.archiveForm(form)
}

/**
 * One service — and therefore one dataset — per community.
 *
 * The tenant is bound when the service is resolved rather than passed to every one of its methods,
 * because the tenant is ambient: a loan screen always works inside the community the switcher has
 * active. The mock seeds only the demo tenant; the API backend takes the tenant from the
 * authenticated session, so the repository is the same instance for every community.
 */
const services = new Map<string, LoansService>()

export function loansServiceFor(organizationId: string): LoansService {
  let service = services.get(organizationId)
  if (!service) {
    const repo: LoanRepository = env.VITE_ENABLE_MOCKS
      ? createMockLoanRepository(isSeedTenant(organizationId) ? undefined : createEmptyLoanDataset())
      : new ApiLoanRepository()
    service = new LoansService(repo)
    services.set(organizationId, service)
  }
  return service
}

/** The seeded community's service, for the screens that run without a session (the public link). */
export const loansService = loansServiceFor(SEED_ORGANIZATION_ID)
export type { LoanDataset }
