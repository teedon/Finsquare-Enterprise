import { ID_TYPES, doc, mockId, newVersion, num, renumber, slotKey, str, systemField as f, systemStep as step } from "@/features/forms/domain/forms"
import type { FormField, FormResponseValue, FormStep, FormVersion } from "@/features/forms/types/form.types"
import type { LoanApplicationForm } from "../types/form.types"
import type { Borrower, LoanProduct, LoanTerms } from "../types/loan.types"

export const GUARANTOR_FIELDS: FormField[] = [
  f("g_type", "Guarantor type", "dropdown", true, true, ["Existing member", "External person"]),
  f("g_name", "Full name", "short_text", true, true), f("g_phone", "Phone number", "phone", true, true), f("g_email", "Email", "email", false),
  f("g_address", "Address", "address", false), f("g_relationship", "Relationship to applicant", "short_text", true, true),
  f("g_occupation", "Occupation / business", "short_text", false), f("g_idType", "Identification type", "dropdown", false, false, ID_TYPES),
  f("g_idNumber", "Identification number", "short_text", false),
].map((x, i) => ({ ...x, order: i }))

export const GUARANTOR_DOC_FIELDS: FormField[] = [
  doc("Guarantor ID", true, "A clear copy of the guarantor's identification."),
  doc("Signed guarantee form", false, "Signed and dated by the guarantor."),
]

export function systemSteps(extra: { custom?: FormStep[]; docs?: FormField[] } = {}): FormStep[] {
  const steps = [
    step("personal", "Personal Information", [
      f("firstName", "First name", "short_text", true, true), f("lastName", "Last name", "short_text", true, true),
      f("phone", "Phone number", "phone", true, true), f("dob", "Date of birth", "date", true, true),
      f("street", "Street address", "short_text", true, true), f("city", "City", "short_text", true, true),
      f("lga", "LGA", "short_text", true, true), f("state", "State", "short_text", true, true),
      f("email", "Email", "email", false), f("gender", "Gender", "dropdown", false, false, ["Male", "Female", "Other"]),
    ], "The details needed to process a loan application."),
    step("loan", "Loan Information", [
      f("loanAmount", "Loan amount", "currency", true, true), f("loanPurpose", "Loan purpose", "long_text", true, true), f("duration", "Requested duration", "number", true, true),
    ]),
    ...(extra.custom ?? []),
    step("documents", "Documents", extra.docs ?? [doc("National ID", true, "Government-issued photo ID."), doc("Proof of address", true, "Utility bill or tenancy agreement from the last 3 months."), doc("Bank statement", false, "Last 3 months.", ["PDF"], 10)], "Upload the documents requested for this loan."),
    step("guarantors", "Guarantors", GUARANTOR_FIELDS, "Guarantors do not need a FinSquare account."),
    step("review", "Review & Submit", []),
  ]
  return renumber(steps)
}

export function newForm(product: Pick<LoanProduct, "id" | "name">): LoanApplicationForm {
  return {
    id: mockId("frm"), name: `${product.name || "Loan"} application form`, productId: product.id,
    slug: (product.name || "loan").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "loan",
    status: "Draft", versions: [newVersion(1, "Draft", systemSteps())], submissions: 0,
  }
}

/**
 * The applicant's name from its two parts, falling back to a single legacy `fullName` answer so a
 * form published before the split still maps correctly.
 */
export function applicantName(values: Record<string, FormResponseValue>): { firstName: string; lastName: string } {
  const firstName = str(values["sys-firstName"]).trim()
  const lastName = str(values["sys-lastName"]).trim()
  if (firstName || lastName) return { firstName, lastName }
  const parts = str(values["sys-fullName"]).trim().split(/\s+/).filter(Boolean)
  return { firstName: parts[0] ?? "", lastName: parts.slice(1).join(" ") }
}

/**
 * The applicant's address, from its parts, in the order a postal address reads. Falls back to the
 * legacy single `address` answer.
 */
export function composeAddress(values: Record<string, FormResponseValue>): string {
  const parts = ["sys-street", "sys-city", "sys-lga", "sys-state"].map((key) => str(values[key]).trim())
  return parts.filter(Boolean).join(", ") || str(values["sys-address"]).trim()
}

/** Turns a submitted form into the data the loan service needs. */
export function extractSubmission(version: FormVersion, values: Record<string, FormResponseValue>, product: LoanProduct, members: Borrower[]) {
  const sys = (k: string) => values[`sys-${k}`]
  const member = members.find((m) => m.id === values.__member)
  const custom = version.steps.filter((s) => s.kind === "custom").flatMap((s) => s.fields)
  const occupation = str(values[custom.find((x) => x.type === "short_text" && values[x.id])?.id ?? ""]) || "—"
  const name = applicantName(values)
  const applicant: Borrower = member ?? {
    id: mockId("b"), name: [name.firstName, name.lastName].filter(Boolean).join(" "), phone: str(sys("phone")), email: str(sys("email")) || undefined, type: "External", branch: "Online",
    address: composeAddress(values) || "—", occupation, membershipMonths: 0, savingsBalance: 0, kycVerified: false,
  }
  const terms: LoanTerms = {
    amount: num(sys("loanAmount")), duration: num(sys("duration")), durationUnit: product.durationUnit, interestType: product.interestType, interestRate: product.interestRate,
    applicationFeePct: product.applicationFeePct, deductionModel: product.deductionModel, frequency: product.frequency, graceDays: product.graceDays,
  }
  const gStep = version.steps.find((s) => s.kind === "guarantors")
  // The form no longer asks for an amount: a guarantor stands behind the whole loan.
  const guarantors = product.requiresGuarantor && gStep
    ? Array.from({ length: product.guarantorsRequired }, (_, i) => {
        const g = (k: string) => values[slotKey(`sys-${k}`, i)]
        return {
          guarantor: { id: mockId("g"), name: str(g("g_name")), phone: str(g("g_phone")), relationship: str(g("g_relationship")), type: (g("g_type") === "Existing member" ? "Member" : "External") as "Member" | "External", occupation: str(g("g_occupation")) || "—" },
          amount: terms.amount,
        }
      })
    : []
  const docs = version.steps.filter((s) => s.kind === "documents").flatMap((s) => s.fields).filter((x) => typeof values[x.id] === "object" && !Array.isArray(values[x.id])).map((x) => x.label)
  const incomeField = custom.find((x) => x.type === "currency" && /income|revenue|salary/i.test(x.label))
  return {
    applicant, terms, purpose: str(sys("loanPurpose")), guarantors, documents: docs,
    employment: applicant.occupation, monthlyIncome: incomeField ? num(values[incomeField.id]) : 0,
  }
}
