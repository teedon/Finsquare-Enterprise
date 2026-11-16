import { customStep, num, renumber, slotKey, str } from "@/features/forms/domain/forms"
import type { FormField, FormFieldType, FormResponseValue, FormVersion } from "@/features/forms/types/form.types"
import type { LoanApplicationForm } from "../types/form.types"
import type { DurationUnit, LoanProduct } from "../types/loan.types"
import { systemSteps } from "./loan-forms"

/**
 * The backend's public application form (`GET /public/forms/:token`) and the translation between it
 * and the form renderer. The backend only knows custom fields and fixed system fields, so the form
 * is assembled here from `systemSteps` plus the lender's custom steps.
 */

export interface PublicFormFieldDTO {
  name: string
  label: string
  type: string
  required: boolean
  options?: string[]
}

export interface PublicFormDTO {
  id: string
  name: string
  shareToken: string
  enterpriseForm?: { form: LoanApplicationForm; version: FormVersion } | null
  mfiName: string
  mfiLogo: string | null
  loanType?: {
    id: string
    name: string
    description: string | null
    minAmount: number
    maxAmount: number
    minDuration: number
    maxDuration: number
    durationUnit: string
    interestRate: number
    requiresConsent?: boolean
    consentText?: string | null
    requiresGuarantor?: boolean
    guarantorCount?: number
    guarantorType?: string
  }
  steps: { id: string; name: string; description: string | null; sortOrder: number; fields: PublicFormFieldDTO[] }[]
}

export interface PublicApplicationPayload {
  systemFields: {
    firstName: string
    lastName: string
    email?: string
    phoneNumber: string
    dob?: string
    gender?: string
    address?: string
    nin?: string
  }
  customFields: Record<string, FormResponseValue>
  amount: number
  duration: number
  purpose: string
  externalGuarantors: { name: string; phone: string; email?: string; relationship?: string; address?: string; occupation?: string }[]
  consentAccepted: boolean
  formVersion: FormVersion
  formResponse: Record<string, FormResponseValue>
}

export const durUnit = (v: string): DurationUnit =>
  v.toLowerCase().startsWith("day") ? "Days" : v.toLowerCase().startsWith("week") ? "Weeks" : "Months"

const CUSTOM_FIELD_PREFIX = "cf-"
const CONSENT_FIELD_ID = "sys-consent"
const NIN_ID_TYPE = "National ID (NIN)"

/** Backend custom-field types onto the renderer's. File uploads have nowhere to go on this endpoint. */
const FIELD_TYPES: Record<string, FormFieldType | undefined> = {
  TEXT: "short_text",
  NUMBER: "number",
  LONG_TEXT: "long_text",
  SELECT: "dropdown",
  MULTI_SELECT: "checkboxes",
  DATE: "date",
  BOOLEAN: "yes_no",
}

function toField(dto: PublicFormFieldDTO, order: number): FormField | null {
  const type = FIELD_TYPES[dto.type]
  if (!type) return null
  return {
    id: `${CUSTOM_FIELD_PREFIX}${dto.name}`,
    type,
    label: dto.label,
    required: dto.required,
    order,
    options: dto.options?.map((o) => ({ id: o, label: o })),
  }
}

/** Splits a full name; the backend needs both parts, so a single name is used for each. */
export function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  const firstName = parts[0] ?? ""
  return { firstName, lastName: parts.slice(1).join(" ") || firstName }
}

/** Everything the page needs to render a public form, or `null` when the link is not an active form. */
export function buildPublicForm(dto: PublicFormDTO | null): { form: LoanApplicationForm; version: FormVersion; product: LoanProduct } | null {
  const lt = dto?.loanType
  if (!dto || !lt) return null

  const custom = [...dto.steps]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((s) => customStep(s.name, s.fields.map(toField).filter((f): f is FormField => f !== null), s.description ?? undefined))
    .filter((s) => s.fields.length > 0)

  if (lt.requiresConsent) {
    custom.push(customStep("Consent", [{
      id: CONSENT_FIELD_ID, type: "yes_no", label: "I accept the terms and conditions", description: lt.consentText ?? undefined, required: true, order: 0,
    }]))
  }

  // The public endpoint accepts no uploads, so the document step is left out rather than collecting files it would discard.
  const steps = renumber(systemSteps({ custom }).filter((s) => s.kind !== "documents"))
  const version: FormVersion = dto.enterpriseForm?.version ?? { id: `fv-${lt.id}`, version: 1, status: "Published", steps, createdAt: "", publishedAt: "" }
  const form: LoanApplicationForm = dto.enterpriseForm?.form ?? {
    id: dto.id, name: dto.name, productId: lt.id, slug: dto.shareToken, status: "Published", publishedVersionId: version.id, versions: [version], submissions: 0,
  }

  // The backend keeps guarantors only for external-guarantor loan types.
  const requiresGuarantor = !!lt.requiresGuarantor && lt.guarantorType === "EXTERNAL"
  const product: LoanProduct = {
    id: lt.id,
    name: lt.name,
    description: lt.description ?? "",
    minAmount: lt.minAmount,
    maxAmount: lt.maxAmount,
    minDuration: lt.minDuration,
    maxDuration: lt.maxDuration,
    durationUnit: durUnit(lt.durationUnit),
    interestType: "Flat",
    interestRate: lt.interestRate,
    applicationFeePct: 0,
    deductionModel: "None",
    frequency: "Monthly",
    maxActiveLoans: 1,
    graceDays: 0,
    requiresApproval: true,
    requiresGuarantor,
    guarantorsRequired: requiresGuarantor ? lt.guarantorCount ?? 0 : 0,
    applicationType: "External",
    allowExternalGuarantors: true,
    requireGuarantorVerification: false,
    requireGuarantorDocuments: false,
    eligibility: { minMembershipMonths: 0, minSavingsBalance: 0, blockIfOverdueLoan: false, requireKyc: false },
    status: "Active",
    updatedAt: "",
  }
  return { form, version, product }
}

/** Turns the renderer's answers into the body `POST /public/forms/:token/submit` expects. */
export function buildPublicPayload(version: FormVersion, product: LoanProduct, values: Record<string, FormResponseValue>): PublicApplicationPayload {
  const sys = (k: string) => str(values[`sys-${k}`]).trim()
  const { firstName, lastName } = splitName(sys("fullName"))

  const customFields: Record<string, FormResponseValue> = {}
  for (const field of version.steps.filter((s) => s.kind === "custom").flatMap((s) => s.fields)) {
    if (!field.id.startsWith(CUSTOM_FIELD_PREFIX)) continue
    const value = values[field.id]
    if (value !== undefined && value !== "") customFields[field.id.slice(CUSTOM_FIELD_PREFIX.length)] = field.type === "yes_no" ? value === "Yes" : value
  }

  const externalGuarantors = product.requiresGuarantor
    ? Array.from({ length: product.guarantorsRequired }, (_, i) => {
        const g = (k: string) => str(values[slotKey(`sys-${k}`, i)]).trim()
        return {
          name: g("g_name"),
          phone: g("g_phone"),
          email: g("g_email") || undefined,
          relationship: g("g_relationship") || undefined,
          address: g("g_address") || undefined,
          occupation: g("g_occupation") || undefined,
        }
      })
    : []

  return {
    systemFields: {
      firstName,
      lastName,
      email: sys("email") || undefined,
      phoneNumber: sys("phone"),
      dob: sys("dob") || undefined,
      gender: sys("gender") || undefined,
      address: sys("address") || undefined,
      nin: sys("idType") === NIN_ID_TYPE ? sys("idNumber") || undefined : undefined,
    },
    customFields,
    amount: num(values["sys-loanAmount"]),
    duration: num(values["sys-duration"]),
    purpose: sys("loanPurpose"),
    externalGuarantors,
    consentAccepted: values[CONSENT_FIELD_ID] === "Yes",
    formVersion: version,
    formResponse: values,
  }
}
