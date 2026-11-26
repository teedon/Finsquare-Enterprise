import { createQuestionLibrary } from "@/features/forms/mocks/question-library.mock"
import type { FormField, FormResponse, FormVersion, LoanApplicationForm } from "../types/form.types"
import type { GuarantorRequest, LoanApplication } from "../types/loan.types"
import { customStep, doc, newVersion, qf } from "@/features/forms/domain/forms"
import { systemSteps } from "../domain/loan-forms"
import { offsetDays } from "../domain/calculations"

/** The seed the shared question library starts from, so a form can reference a saved question by label. */
const questionLibraryMock = createQuestionLibrary()
const L = (label: string) => questionLibraryMock.find((q) => q.label === label)!
const fromLib = (label: string): FormField => {
  const q = L(label)
  return { ...qf(q.label, q.type, q.required, q.options?.map((o) => o.label), q.description), questionLibraryId: q.id }
}

function ver(n: number, status: FormVersion["status"], daysAgo: number, steps = systemSteps()): FormVersion {
  return { ...newVersion(n, status, steps), id: `fv-${n}-${steps.length}-${daysAgo}`, createdAt: offsetDays(-daysAgo), publishedAt: status === "Draft" ? undefined : offsetDays(-daysAgo) }
}
const form = (id: string, name: string, productId: string, slug: string, status: LoanApplicationForm["status"], versions: FormVersion[], submissions: number): LoanApplicationForm => ({
  id, name, productId, slug, status, versions, submissions, publishedVersionId: status === "Published" ? versions.find((v) => v.status === "Published")?.id : undefined,
})

export function createFormsMock(): LoanApplicationForm[] {
  const bizV1 = ver(1, "Archived", 400, systemSteps({ docs: [doc("National ID", true), doc("Proof of address", true)] }))
  const bizV2 = ver(2, "Published", 60, systemSteps({
    custom: [
      customStep("Business Information", [fromLib("Business name"), fromLib("Business address"), fromLib("What type of business do you operate?"), fromLib("Years in business"), fromLib("Average monthly revenue")]),
      customStep("Financial Information", [fromLib("Monthly income"), fromLib("Monthly expenses"), fromLib("Do you have existing loans?")]),
    ],
    docs: [doc("National ID", true), doc("Proof of address", true, "Utility bill from the last 3 months."), doc("Bank statement", false, "Last 3 months.", ["PDF"], 10), doc("Business registration", false, "CAC certificate if registered.")],
  }))
  const eduV1 = ver(1, "Published", 200, systemSteps({
    custom: [customStep("School Details", [qf("School / institution name", "short_text"), qf("Course or class", "short_text"), qf("Total fees payable", "currency"), qf("Term / session", "dropdown", true, ["First term", "Second term", "Third term", "Full session"])])],
    docs: [doc("National ID", true), doc("School admission letter", true, "Or most recent fee invoice.")],
  }))
  const emerV1 = ver(1, "Published", 300, systemSteps({ docs: [doc("National ID", true)] }))
  const salV1 = ver(1, "Published", 150, systemSteps({
    custom: [customStep("Employment", [fromLib("Employer name"), fromLib("Job title"), fromLib("Monthly salary"), fromLib("Years employed")])],
    docs: [doc("National ID", true), doc("Latest payslip", true, "Most recent month.", ["PDF", "JPG"], 5), doc("Employment letter", false)],
  }))
  const persV1 = ver(1, "Draft", 3, systemSteps({ custom: [customStep("Financial Information", [fromLib("Monthly income"), fromLib("Monthly expenses")])] }))
  const solV1 = ver(1, "Archived", 250, systemSteps({ docs: [doc("National ID", true)] }))
  return [
    form("frm-business", "Business Loan Application", "lp-business", "business-loan", "Published", [bizV1, bizV2], 38),
    form("frm-education", "Education Loan Application", "lp-education", "education-loan", "Published", [eduV1], 9),
    form("frm-emergency", "Emergency Loan Quick Form", "lp-emergency", "emergency-loan", "Published", [emerV1], 112),
    form("frm-salary", "Salary Loan Application", "lp-salary", "salary-loan", "Published", [salV1], 21),
    form("frm-personal", "Personal Loan Application", "lp-personal", "personal-loan", "Draft", [persV1], 0),
    form("frm-solidarity", "Solidarity Loan Application", "lp-solidarity", "solidarity-loan", "Archived", [solV1], 14),
  ]
}

const SAMPLE: Record<string, string | number> = {
  "Business name": "Johnson Agro Supplies", "Business address": "14 Market Road, Ikeja, Lagos", "Years in business": 6, "Average monthly revenue": 850_000,
  "Monthly income": 420_000, "Monthly expenses": 260_000, "Employer name": "Lagos State Ministry of Education", "Job title": "Senior Teacher", "Monthly salary": 185_000, "Years employed": 8,
  "School / institution name": "Greenfield Secondary School", "Course or class": "SS2", "Total fees payable": 300_000,
}

export function createResponsesMock(apps: LoanApplication[], forms: LoanApplicationForm[], requests: GuarantorRequest[]): FormResponse[] {
  return apps.flatMap((app) => {
    const form = forms.find((x) => x.productId === app.productId)
    if (!form) return []
    const version = [...form.versions].reverse().find((v) => v.createdAt <= app.submittedAt) ?? form.versions[0]
    const a = app.applicant
    const values: FormResponse["values"] = {}
    const pending = app.status === "Draft"
    for (const s of version.steps) {
      s.fields.forEach((fl) => {
        const sf = fl.systemField
        let v: FormResponse["values"][string] | undefined
        if (sf === "firstName") v = a.name.split(" ")[0]
        else if (sf === "lastName") v = a.name.split(" ").slice(1).join(" ")
        else if (sf === "email") v = a.email ?? ""
        else if (sf === "phone") v = a.phone
        else if (sf === "dob") v = "1988-04-12"
        else if (sf === "gender") v = ["b-1", "b-2", "b-5", "b-7"].includes(a.id) ? "Male" : "Female"
        else if (sf === "street") v = a.address
        else if (sf === "city") v = "Ikeja"
        else if (sf === "lga") v = "Ikeja"
        else if (sf === "state") v = "Lagos"
        else if (sf === "loanAmount") v = app.terms.amount
        else if (sf === "loanPurpose") v = app.purpose
        else if (sf === "duration") v = app.terms.duration
        else if (fl.type === "file") v = pending ? undefined : { fileName: `${fl.label.toLowerCase().replace(/\s+/g, "-")}.pdf`, uploadedAt: app.submittedAt }
        else if (!sf && s.kind === "custom") {
          const base = SAMPLE[fl.label]
          v = base ?? (fl.type === "radio" || fl.type === "dropdown" ? fl.options?.[0]?.label : fl.type === "yes_no" ? "No" : fl.type === "address" ? a.address : fl.type === "currency" ? 150_000 : fl.type === "number" ? 3 : "Provided")
        }
        if (v !== undefined) values[fl.id] = v
      })
    }
    const gs = requests.filter((g) => g.applicationId === app.id)
    gs.forEach((r, i) => {
      const set = (k: string, v: string | number) => (values[`sys-${k}#${i}`] = v)
      set("g_type", r.guarantor.type === "Member" ? "Existing member" : "External person"); set("g_name", r.guarantor.name); set("g_phone", r.guarantor.phone)
      set("g_relationship", r.guarantor.relationship); set("g_occupation", r.guarantor.occupation)
    })
    if (a.type === "Member") values.__member = a.id
    return [{ id: `resp-${app.id}`, applicationId: app.id, formId: form.id, versionId: version.id, versionNumber: version.version, applicantType: a.type === "Member" ? "Internal" : "External", submittedAt: app.submittedAt, values } as FormResponse]
  })
}
