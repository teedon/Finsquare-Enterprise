/**
 * Loan-facing form types. The generic vocabulary (fields, steps, versions, the question library)
 * lives in `@/features/forms` and is re-exported here so loan modules keep one import site; only
 * the loan-specific containers are declared below.
 */
export * from "@/features/forms/types/form.types"

import type { ApplicationType, FormResponseValue, FormStatus, FormVersion } from "@/features/forms/types/form.types"

export interface LoanApplicationForm {
  id: string
  name: string
  productId: string
  applicationType?: ApplicationType
  slug: string
  status: FormStatus
  publishedVersionId?: string
  versions: FormVersion[]
  submissions: number
}

export interface FormResponse {
  id: string
  applicationId: string
  formId: string
  versionId: string
  versionNumber: number
  applicantType: "Internal" | "External"
  submittedAt: string
  /** Keyed by field id; guarantor fields use `${fieldId}#${slotIndex}`. */
  values: Record<string, FormResponseValue>
}
