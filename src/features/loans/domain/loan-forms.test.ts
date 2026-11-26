import { describe, expect, it } from "vitest"
import { newVersion, rangeStrings, slotKey } from "@/features/forms/domain/forms"
import type { FormResponseValue } from "@/features/forms/types/form.types"
import type { Borrower, LoanProduct } from "../types/loan.types"
import {
  applicantName,
  composeAddress,
  extractSubmission,
  GUARANTOR_FIELDS,
  systemSteps,
} from "./loan-forms"
import { buildPublicPayload } from "./public-application"

const product: LoanProduct = {
  id: "lp-1",
  name: "Business Loan",
  description: "",
  minAmount: 10_000,
  maxAmount: 500_000,
  minDuration: 1,
  maxDuration: 12,
  durationUnit: "Months",
  interestType: "Flat",
  interestRate: 5,
  applicationFeePct: 0,
  deductionModel: "None",
  frequency: "Monthly",
  maxActiveLoans: 1,
  graceDays: 0,
  requiresApproval: true,
  requiresGuarantor: true,
  guarantorsRequired: 2,
  applicationType: "Both",
  allowExternalGuarantors: true,
  requireGuarantorVerification: false,
  requireGuarantorDocuments: false,
  eligibility: { minMembershipMonths: 0, minSavingsBalance: 0, blockIfOverdueLoan: false, requireKyc: false },
  status: "Active",
  updatedAt: "",
}

const personalFields = systemSteps().find((step) => step.kind === "personal")!.fields
const personal = (key: string) => personalFields.find((field) => field.systemField === key)

const requiredPersonal = {
  "sys-firstName": "Ada",
  "sys-lastName": "Nwosu",
  "sys-phone": "+2348032147780",
  "sys-dob": "1990-02-01",
  "sys-street": "12 Market Road",
  "sys-city": "Ikeja",
  "sys-lga": "Ikeja",
  "sys-state": "Lagos",
  "sys-loanAmount": 200_000,
  "sys-duration": "6",
  "sys-loanPurpose": "Stock for the shop",
} as Record<string, FormResponseValue>

describe("rangeStrings", () => {
  it("lists every whole value in the loan type's range", () => {
    const months = rangeStrings(1, 12)
    expect(months).toHaveLength(12)
    expect(months[0]).toBe("1")
    expect(months.at(-1)).toBe("12")
  })

  it("handles a single-value range", () => {
    expect(rangeStrings(6, 6)).toEqual(["6"])
  })

  it("returns nothing when the loan type has no valid range", () => {
    expect(rangeStrings(5, 1)).toEqual([])
  })
})

describe("applicantName", () => {
  it("reads the two parts", () => {
    expect(applicantName({ "sys-firstName": "Ada", "sys-lastName": "Nwosu" })).toEqual({ firstName: "Ada", lastName: "Nwosu" })
  })

  it("falls back to a legacy full name", () => {
    expect(applicantName({ "sys-fullName": "Ada Nwosu" })).toEqual({ firstName: "Ada", lastName: "Nwosu" })
  })

  it("returns empty parts when nothing was answered", () => {
    expect(applicantName({})).toEqual({ firstName: "", lastName: "" })
  })
})

describe("composeAddress", () => {
  it("reads street, city, LGA and state in order", () => {
    expect(
      composeAddress({ "sys-street": "12 Market Road", "sys-city": "Ikeja", "sys-lga": "Ikeja", "sys-state": "Lagos" }),
    ).toBe("12 Market Road, Ikeja, Ikeja, Lagos")
  })

  it("skips the parts left blank", () => {
    expect(composeAddress({ "sys-street": "12 Market Road", "sys-state": "Lagos" })).toBe("12 Market Road, Lagos")
  })

  it("falls back to a legacy single address", () => {
    expect(composeAddress({ "sys-address": "12 Market Road, Ikeja" })).toBe("12 Market Road, Ikeja")
  })
})

describe("the loan personal step", () => {
  it("asks only for the details a loan needs", () => {
    expect(personalFields.map((field) => field.systemField)).toEqual([
      "firstName",
      "lastName",
      "phone",
      "dob",
      "street",
      "city",
      "lga",
      "state",
      "email",
      "gender",
    ])
  })

  it("requires the identity and address it cannot do without", () => {
    expect(personalFields.filter((field) => field.locked).map((field) => field.systemField)).toEqual([
      "firstName",
      "lastName",
      "phone",
      "dob",
      "street",
      "city",
      "lga",
      "state",
    ])
  })

  it("leaves email and gender optional and removable", () => {
    for (const key of ["email", "gender"]) {
      expect(personal(key)?.required).toBe(false)
      expect(personal(key)?.locked).toBe(false)
    }
  })

  it("no longer asks for identification or emergency contacts", () => {
    const keys = personalFields.map((field) => field.systemField)
    expect(keys).not.toContain("idType")
    expect(keys).not.toContain("idNumber")
    expect(keys).not.toContain("emergencyName")
    expect(keys).not.toContain("emergencyPhone")
  })

  it("has no guarantee amount on the guarantor step", () => {
    expect(GUARANTOR_FIELDS.map((field) => field.systemField)).not.toContain("g_amount")
  })
})

describe("extractSubmission", () => {
  const version = newVersion(1, "Published", systemSteps())
  const guarantors = {
    [slotKey("sys-g_name", 0)]: "Ibrahim Sani",
    [slotKey("sys-g_phone", 0)]: "+2348030001122",
    [slotKey("sys-g_relationship", 0)]: "Brother",
    [slotKey("sys-g_type", 0)]: "External person",
    [slotKey("sys-g_name", 1)]: "Halima Bello",
    [slotKey("sys-g_phone", 1)]: "+2348030003344",
    [slotKey("sys-g_relationship", 1)]: "Colleague",
    [slotKey("sys-g_type", 1)]: "External person",
  } as Record<string, FormResponseValue>

  it("maps the split name and address parts onto the applicant", () => {
    const submission = extractSubmission(version, { ...requiredPersonal, ...guarantors }, product, [] as Borrower[])
    expect(submission.applicant.name).toBe("Ada Nwosu")
    expect(submission.applicant.address).toBe("12 Market Road, Ikeja, Ikeja, Lagos")
    expect(submission.terms.duration).toBe(6)
  })

  it("still maps a form published with one full name and one address", () => {
    const legacy = {
      ...requiredPersonal,
      "sys-fullName": "Ada Nwosu",
      "sys-address": "12 Market Road, Ikeja",
    } as Record<string, FormResponseValue>
    delete legacy["sys-firstName"]
    delete legacy["sys-lastName"]
    delete legacy["sys-street"]
    delete legacy["sys-city"]
    delete legacy["sys-lga"]
    delete legacy["sys-state"]
    const submission = extractSubmission(version, { ...legacy, ...guarantors }, product, [] as Borrower[])
    expect(submission.applicant.name).toBe("Ada Nwosu")
    expect(submission.applicant.address).toBe("12 Market Road, Ikeja")
  })

  it("makes every guarantor stand behind the whole loan", () => {
    const submission = extractSubmission(version, { ...requiredPersonal, ...guarantors }, product, [] as Borrower[])
    expect(submission.guarantors).toHaveLength(2)
    expect(submission.guarantors.map((entry) => entry.amount)).toEqual([200_000, 200_000])
  })
})

describe("buildPublicPayload", () => {
  const version = newVersion(1, "Published", systemSteps())

  it("sends the split name and the composed address", () => {
    const payload = buildPublicPayload(version, product, requiredPersonal)
    expect(payload.systemFields.firstName).toBe("Ada")
    expect(payload.systemFields.lastName).toBe("Nwosu")
    expect(payload.systemFields.address).toBe("12 Market Road, Ikeja, Ikeja, Lagos")
    expect(payload.systemFields.phoneNumber).toBe("+2348032147780")
    expect(payload.duration).toBe(6)
  })

  it("still splits a legacy full-name answer", () => {
    const legacy = { "sys-fullName": "Ada Nwosu", "sys-phone": "+2348032147780", "sys-address": "12 Market Road" } as Record<string, FormResponseValue>
    const payload = buildPublicPayload(version, product, legacy)
    expect(payload.systemFields.firstName).toBe("Ada")
    expect(payload.systemFields.lastName).toBe("Nwosu")
    expect(payload.systemFields.address).toBe("12 Market Road")
  })
})
