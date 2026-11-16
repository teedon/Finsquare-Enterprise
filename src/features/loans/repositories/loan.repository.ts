import type { FormVersion } from "../types/form.types"
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
  RecoverySettings,
  RecoveryStatus,
  SubmitFormApplicationInput,
} from "../types/loan.types"

/**
 * Contract for the loan data source.
 *
 * Reads stay dataset-shaped (`load`) so every page renders the same `LoanDataset` whether the source
 * is the mock or the backend; writes are commands, because the backend exposes named actions
 * (`approve`, `reject`, `disburse`, …) rather than whole-object persistence. The mock implements the
 * same commands against its local store, so the service stays a thin delegate over both.
 */
export interface LoanRepository {
  load(): Promise<LoanDataset>
  subscribe(listener: () => void): () => void

  saveProduct(product: LoanProduct): Promise<LoanProduct>
  createApplication(input: NewApplicationInput): Promise<LoanApplication>
  startReview(id: string): Promise<void>
  approve(id: string, amount: number, note: string): Promise<void>
  reviseOffer(id: string, amount: number, duration: number, note: string): Promise<void>
  acceptOffer(id: string): Promise<void>
  reject(id: string, reason: string): Promise<void>
  requestInfo(id: string, message: string): Promise<void>
  cancel(id: string): Promise<void>
  reviewDocument(appId: string, docId: string, review: "Accepted" | "Rejected"): Promise<void>
  addGuarantor(applicationId: string, guarantor: Guarantor, amount: number): Promise<void>
  updateGuarantor(
    req: GuarantorRequest,
    status: GuarantorStatus,
    method: GuarantorRequest["verificationMethod"],
    notes: string,
    signedForm: boolean,
  ): Promise<void>
  disburse(appIds: string[], method: DisbursementMethod, pin?: string): Promise<Loan[]>
  recordRepayment(input: RecordRepaymentInput): Promise<LoanRepayment>
  startRecovery(loanId: string): Promise<void>
  recoveryAction(c: RecoveryCase, type: string, text: string, status?: RecoveryStatus): Promise<void>
  markDefaulted(loanId: string): Promise<void>
  writeOff(loanId: string): Promise<void>
  saveSettings(s: RecoverySettings): Promise<void>
  saveForm(f: LoanApplicationForm): Promise<void>
  saveProductWithForm(
    product: LoanProduct,
    form: LoanApplicationForm,
    version: FormVersion,
    publish: boolean,
  ): Promise<void>
  submitFormApplication(a: SubmitFormApplicationInput): Promise<LoanApplication>
  publishForm(form: LoanApplicationForm, version: FormVersion): Promise<void>
  archiveForm(form: LoanApplicationForm): Promise<void>
}
