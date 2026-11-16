import { applyDraft, applyPublish } from "@/features/forms/domain/forms"
import { extractSubmission } from "../domain/loan-forms"
import {
  allocateRepayment,
  calculateLoan,
  checkEligibility,
  deriveLoanState,
  todayISO,
} from "../domain/calculations"
import { createLoanDataset, mockId } from "../mocks/loans.mock"
import type {
  ApplicationStatus,
  Disbursement,
  Loan,
  LoanActivity,
  LoanApplication,
  LoanApplicationForm,
  LoanDataset,
  LoanRepayment,
  NewApplicationInput,
  SubmitFormApplicationInput,
} from "../types/loan.types"
import type { LoanRepository } from "./loan.repository"

const ACTOR = "Admin User"

function act(action: string, detail?: string, actor = ACTOR): LoanActivity {
  return { id: mockId("act"), at: todayISO(), actor, action, detail }
}

function note(type: string, text: string, by = ACTOR) {
  return { id: mockId("n"), at: todayISO(), type, text, by }
}

function upsert<T extends { id: string }>(list: T[], item: T, front = false): T[] {
  return list.some((x) => x.id === item.id)
    ? list.map((x) => (x.id === item.id ? item : x))
    : front
      ? [item, ...list]
      : [...list, item]
}

/**
 * The mock loan source. It implements the same commands the API repository does, so switching
 * between them never changes what the service (or a page) can call — only where the state lives.
 */
export function createMockLoanRepository(initial?: LoanDataset): LoanRepository {
  let data: LoanDataset = initial ?? createLoanDataset()
  const listeners = new Set<() => void>()
  const commit = async (next: Partial<LoanDataset>) => {
    data = { ...data, ...next }
    listeners.forEach((l) => l())
  }
  const wait = () => new Promise((r) => setTimeout(r, 120))

  const app = async (id: string) => {
    const a = data.applications.find((x) => x.id === id)
    if (!a) throw new Error("Application not found")
    return a
  }
  const loan = async (id: string) => {
    const l = data.loans.find((x) => x.id === id)
    if (!l) throw new Error("Loan not found")
    return { loan: l, d: data }
  }
  const saveApp = async (
    a: LoanApplication,
    status: ApplicationStatus,
    entry: LoanActivity,
    patch: Partial<LoanApplication> = {},
  ) => {
    await commit({
      applications: upsert(
        data.applications,
        { ...a, status, activity: [...a.activity, entry], ...patch },
        true,
      ),
    })
  }
  const saveForm = (f: LoanApplicationForm) => commit({ forms: upsert(data.forms, f, true) })

  return {
    async load() {
      await wait()
      return data
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },

    async saveProduct(p) {
      await commit({ products: upsert(data.products, p, true) })
      return p
    },

    async createApplication(input: NewApplicationInput) {
      const active = data.loans.filter(
        (l) => l.borrower.id === input.applicant.id && !["Completed", "Written Off"].includes(l.status),
      )
      const eligibility = checkEligibility(
        input.product,
        input.applicant,
        input.terms.amount,
        active.length,
        active.some((l) => l.daysOverdue > 0),
      )
      const n = data.applications.length + 2600
      const id = mockId("app")
      const status = input.status ?? "Submitted"
      const created: LoanApplication = {
        id,
        reference: `LA-${n}`,
        applicant: input.applicant,
        productId: input.product.id,
        productName: input.product.name,
        terms: input.terms,
        purpose: input.purpose,
        source: input.source,
        status,
        approvedAmount: status === "Approved" ? input.terms.amount : undefined,
        officer: "Kemi Adebayo",
        submittedAt: todayISO(),
        employment: input.employment,
        monthlyIncome: input.monthlyIncome,
        documents: (input.documents ?? []).map((name) => ({
          id: mockId("doc"),
          name,
          type: "Upload",
          uploadedAt: todayISO(),
          review: "Pending review" as const,
        })),
        eligibility,
        activity: [
          act(
            input.source === "Admin created" ? "Loan created by administrator" : "Application submitted",
            undefined,
            input.source === "Admin created" ? ACTOR : input.applicant.name,
          ),
        ],
      }
      await commit({ applications: upsert(data.applications, created, true) })
      for (const g of input.guarantors ?? [])
        await commit({
          guarantorRequests: upsert(data.guarantorRequests, {
            id: mockId("gr"),
            applicationId: id,
            guarantor: g.guarantor,
            amount: g.amount,
            status: "Pending",
            notes: "",
            documents: [],
            updatedAt: todayISO(),
          }),
        })
      if (input.response) {
        const { form, version, values } = input.response
        await commit({
          responses: upsert(data.responses, {
            id: mockId("resp"),
            applicationId: id,
            formId: form.id,
            versionId: version.id,
            versionNumber: version.version,
            applicantType: input.applicant.type === "Member" ? "Internal" : "External",
            submittedAt: todayISO(),
            values,
          }),
        })
        await commit({
          forms: upsert(
            data.forms,
            { ...(data.forms.find((f) => f.id === form.id) ?? form), submissions: (data.forms.find((f) => f.id === form.id)?.submissions ?? 0) + 1 },
            false,
          ),
        })
      }
      return created
    },

    async startReview(id) {
      const a = await app(id)
      await saveApp(a, "Under Review", act("Review started"))
    },

    async approve(id, amount, noteText) {
      const a = await app(id)
      if (amount !== a.terms.amount) {
        await saveApp(a, "Offer Sent", act("Revised offer sent to applicant", `${amount.toLocaleString()} instead of ${a.terms.amount.toLocaleString()}`), {
          approvedAmount: amount,
          revisedOffer: { amount, duration: a.terms.duration, note: noteText },
        })
      } else {
        await saveApp(a, "Approved", act("Application approved", noteText), { approvedAmount: amount })
      }
    },

    async reviseOffer(id, amount, duration, noteText) {
      const a = await app(id)
      await saveApp(a, "Offer Sent", act("Revised offer sent to applicant", noteText), {
        approvedAmount: amount,
        revisedOffer: { amount, duration, note: noteText },
      })
    },

    async acceptOffer(id) {
      const a = await app(id)
      const o = a.revisedOffer
      await saveApp(a, "Offer Accepted", act("Applicant accepted the offer", undefined, a.applicant.name), {
        terms: o ? { ...a.terms, amount: o.amount, duration: o.duration } : a.terms,
      })
    },

    async reject(id, reason) {
      const a = await app(id)
      await saveApp(a, "Rejected", act("Application rejected", reason), { rejectionReason: reason })
    },

    async requestInfo(id, message) {
      const a = await app(id)
      await saveApp(a, "Under Review", act("Additional information requested", message), { infoRequest: message })
    },

    async cancel(id) {
      const a = await app(id)
      await saveApp(a, "Cancelled", act("Application cancelled"))
    },

    async reviewDocument(appId, docId, review) {
      const a = await app(appId)
      await commit({
        applications: upsert(
          data.applications,
          {
            ...a,
            documents: a.documents.map((d) => (d.id === docId ? { ...d, review } : d)),
            activity: [...a.activity, act(`Document ${review.toLowerCase()}`, a.documents.find((d) => d.id === docId)?.name)],
          },
          true,
        ),
      })
    },

    async addGuarantor(applicationId, guarantor, amount) {
      await commit({
        guarantorRequests: upsert(data.guarantorRequests, {
          id: mockId("gr"),
          applicationId,
          guarantor,
          amount,
          status: "Pending",
          notes: "",
          documents: [],
          updatedAt: todayISO(),
        }),
      })
    },

    async updateGuarantor(req, status, method, notes, signedForm) {
      await commit({
        guarantorRequests: upsert(data.guarantorRequests, {
          ...req,
          status,
          verificationMethod: method,
          notes,
          updatedAt: todayISO(),
          documents: signedForm && !req.documents.length
            ? [{ id: mockId("doc"), name: `Signed guarantee – ${req.guarantor.name}`, type: "Guarantee form", uploadedAt: todayISO(), review: "Accepted" as const }]
            : req.documents,
        }),
      })
      if (req.applicationId) {
        const a = data.applications.find((x) => x.id === req.applicationId)
        if (a && status === "Accepted") {
          const all = data.guarantorRequests
            .filter((g) => g.applicationId === a.id)
            .map((g) => (g.id === req.id ? status : g.status))
          if (a.status === "Guarantor Pending" && all.every((s) => s === "Accepted"))
            await saveApp(a, "Under Review", act("All guarantors accepted"))
        }
      }
    },

    async disburse(appIds, method) {
      const created: Loan[] = []
      for (const id of appIds) {
        const a = data.applications.find((x) => x.id === id)
        if (!a || !["Approved", "Offer Accepted"].includes(a.status)) continue
        const t = { ...a.terms, amount: a.approvedAmount ?? a.terms.amount }
        const sum = calculateLoan(t, todayISO())
        const n = data.loans.length + created.length + 5001
        const loanId = mockId("loan")
        const loan = deriveLoanState(
          {
            id: loanId,
            reference: `LN-${n}`,
            applicationId: a.id,
            borrower: a.applicant,
            productId: a.productId,
            productName: a.productName,
            terms: t,
            principal: sum.principal,
            interest: sum.interest,
            fees: sum.fees,
            deduction: sum.deduction,
            netDisbursed: sum.netDisbursed,
            totalRepayable: sum.totalRepayable,
            installment: sum.installment,
            disbursedAt: todayISO(),
            endDate: sum.endDate,
            schedule: sum.schedule,
            virtualAccount: {
              accountNumber: `98${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`,
              accountName: `FINSQ/${a.applicant.name.toUpperCase()}`,
              bank: "9PSB",
              reference: `RPY-${n}`,
              status: "Active",
            },
            officer: a.officer,
            documents: a.documents,
            activity: [act("Application approved", undefined, a.officer), act("Loan disbursed", `Net ${sum.netDisbursed.toLocaleString()} via ${method}`), act("Repayment schedule activated")],
            status: "Active",
            paid: 0,
            outstanding: 0,
            overdueAmount: 0,
            daysOverdue: 0,
            nextDueAmount: 0,
          },
          data.settings.defaultAfterDays,
        )
        const dsb: Disbursement = {
          id: mockId("dsb"),
          applicationId: a.id,
          loanId,
          borrowerName: a.applicant.name,
          approvedAmount: sum.principal,
          fees: sum.fees,
          deductions: sum.deduction,
          netAmount: sum.netDisbursed,
          destination: method === "Bank transfer" ? "Access Bank •••• 4471" : method === "Wallet credit" ? "Member wallet" : "Branch cash desk",
          method,
          date: todayISO(),
          reference: `DSB-${9200 + n}`,
        }
        await commit({ loans: upsert(data.loans, loan, true) })
        await commit({ disbursements: upsert(data.disbursements, dsb, true) })
        for (const g of data.guarantorRequests.filter((g) => g.applicationId === a.id))
          await commit({ guarantorRequests: upsert(data.guarantorRequests, { ...g, loanId }) })
        await saveApp(a, "Disbursed", act("Loan disbursed", `${loan.reference} is now active`))
        created.push(loan)
      }
      return created
    },

    async recordRepayment(input) {
      const { loan: l, d } = await loan(input.loanId)
      const { schedule, allocation } = allocateRepayment(l.schedule, input.amount)
      const repayment: LoanRepayment = {
        id: mockId("rp"),
        loanId: l.id,
        loanReference: l.reference,
        borrowerName: l.borrower.name,
        amount: input.amount,
        method: input.method,
        date: input.date,
        reference: input.reference || `RPY${Date.now().toString().slice(-8)}`,
        status: "Confirmed",
        allocation,
        recordedBy: ACTOR,
        note: input.note,
      }
      const next = deriveLoanState(
        { ...l, schedule, activity: [...l.activity, act("Repayment recorded", `${input.amount.toLocaleString()} via ${input.method}`)] },
        d.settings.defaultAfterDays,
      )
      await commit({ repayments: upsert(data.repayments, repayment, true) })
      await commit({ loans: upsert(data.loans, next) })
      const rc = d.recoveryCases.find((c) => c.loanId === l.id && c.status !== "Resolved")
      if (rc && next.daysOverdue === 0)
        await commit({ recoveryCases: upsert(data.recoveryCases, { ...rc, status: "Resolved", notes: [...rc.notes, note("Resolved", "Loan brought up to date by repayment.", "System")] }) })
      return repayment
    },

    async startRecovery(loanId) {
      if (data.recoveryCases.some((c) => c.loanId === loanId && c.status !== "Resolved")) return
      await commit({
        recoveryCases: upsert(data.recoveryCases, {
          id: mockId("rc"),
          loanId,
          status: "Open",
          assignedTo: "Kemi Adebayo",
          openedAt: todayISO(),
          notes: [],
        }),
      })
    },

    async recoveryAction(c, type, text, status) {
      await commit({ recoveryCases: upsert(data.recoveryCases, { ...c, status: status ?? c.status, notes: [...c.notes, note(type, text)] }) })
      const { loan: l } = await loan(c.loanId)
      await commit({ loans: upsert(data.loans, { ...l, activity: [...l.activity, act(`Recovery: ${type}`, text)] }) })
    },

    async markDefaulted(loanId) {
      const { loan: l, d } = await loan(loanId)
      await commit({ loans: upsert(data.loans, deriveLoanState({ ...l, defaulted: true, activity: [...l.activity, act("Loan marked as defaulted")] }, d.settings.defaultAfterDays)) })
    },

    async writeOff(loanId) {
      const { loan: l, d } = await loan(loanId)
      await commit({ loans: upsert(data.loans, deriveLoanState({ ...l, writtenOff: true, activity: [...l.activity, act("Loan written off")] }, d.settings.defaultAfterDays)) })
    },

    async saveSettings(s) {
      await commit({ settings: s })
      for (const l of data.loans)
        await commit({ loans: upsert(data.loans, deriveLoanState(l, s.defaultAfterDays)) })
    },

    saveForm,

    async saveProductWithForm(product, form, version, publish) {
      await this.saveProduct(product)
      await saveForm(publish ? applyPublish(form, version) : applyDraft(form, version))
    },

    async submitFormApplication(a: SubmitFormApplicationInput) {
      const x = extractSubmission(a.version, a.values, a.product, a.members)
      return this.createApplication({ ...x, product: a.product, source: a.source, response: { form: a.form, version: a.version, values: a.values } })
    },

    async publishForm(form, version) {
      await saveForm(applyPublish(form, version))
    },

    async archiveForm(form) {
      await saveForm({
        ...form,
        status: "Archived",
        publishedVersionId: undefined,
        versions: form.versions.map((v) => (v.status === "Published" ? { ...v, status: "Archived" as const } : v)),
      })
    },
  }
}
