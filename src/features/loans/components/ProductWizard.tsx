import { useState } from "react"
import { Button, Field, SectionHeader, SelectField, Toggle } from "@/components/ui"
import { loanProductSchema } from "../schemas/loan-product.schema"
import { mockId } from "../mocks/loans.mock"
import { newForm, systemSteps, GUARANTOR_DOC_FIELDS } from "../domain/loan-forms"
import { publishedVersion, workingVersion } from "@/features/forms/domain/forms"
import { FormBuilder } from "@/features/forms/components/FormBuilder"
import { useQuestionLibrary } from "@/features/forms/hooks/useQuestionLibrary"
import { useOrganizationId } from "@/hooks/useOrganizationId"
import { KV, NumField, Panel, TextArea, money, type LoanCtx } from "./LoanUi"
import type { ApplicationType, FormVersion, LoanApplicationForm } from "../types/form.types"
import type { DeductionModel, DurationUnit, InterestType, LoanProduct, RepaymentFrequency } from "../types/loan.types"

export const blankProduct = (): LoanProduct => ({
  id: mockId("lp"), name: "", description: "", minAmount: 10_000, maxAmount: 500_000, minDuration: 1, maxDuration: 12, durationUnit: "Months",
  interestType: "Reducing balance", interestRate: 24, applicationFeePct: 1, deductionModel: "Fees at disbursement", frequency: "Monthly", maxActiveLoans: 1,
  graceDays: 0, requiresApproval: true, requiresGuarantor: false, guarantorsRequired: 0, applicationType: "Both", allowExternalGuarantors: true,
  requireGuarantorVerification: true, requireGuarantorDocuments: false,
  eligibility: { minMembershipMonths: 3, minSavingsBalance: 0, blockIfOverdueLoan: true, requireKyc: true }, status: "Active", updatedAt: "",
})

const STEPS = ["Basic information", "Loan rules", "Eligibility", "Guarantors", "Application form", "Review & publish"]
const TYPES: [ApplicationType, string][] = [
  ["Internal", "Only members/customers already registered with the organization."],
  ["External", "Applicants can apply using a public application form."],
  ["Both", "Existing members and external applicants can apply."],
]

export function ProductWizard({ ctx, initial, startStep = 0, onClose, onCancel }: { ctx: LoanCtx; initial: LoanProduct | null; startStep?: number; onClose: () => void; onCancel?: () => void }) {
  const { data, service, notify, can } = ctx
  const organizationId = useOrganizationId()
  const questionLibrary = useQuestionLibrary(organizationId)
  const [p, setP] = useState<LoanProduct>(initial ?? blankProduct())
  const [form] = useState<LoanApplicationForm>(() => data.forms.find((f) => f.productId === p.id) ?? newForm(p))
  const [version, setVersion] = useState<FormVersion>(() => workingVersion(form))
  const [step, setStep] = useState(startStep)
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)
  const set = <K extends keyof LoanProduct>(k: K, v: LoanProduct[K]) => setP((x) => ({ ...x, [k]: v }))
  const setE = <K extends keyof LoanProduct["eligibility"]>(k: K, v: LoanProduct["eligibility"][K]) => setP((x) => ({ ...x, eligibility: { ...x.eligibility, [k]: v } }))
  const toggle = (label: string, v: boolean, on: (b: boolean) => void) => <div className="field"><span>{label}</span><Toggle value={v} onChange={() => on(!v)} /></div>

  const validate = () => {
    const r = loanProductSchema.safeParse(p)
    const msg = r.success ? "" : r.error.issues[0]?.message ?? "Check the product details"
    setError(msg)
    return !msg
  }
  const go = (n: number) => { if (n > step && step <= 1 && !validate()) return; setError(""); setStep(n) }

  const persist = async (publish: boolean) => {
    if (!validate()) return setStep(0)
    setSaving(true)
    setError("")
    try {
      const product = { ...p, interestRate: p.interestType === "Zero interest" ? 0 : p.interestRate, status: publish ? p.status : initial ? p.status : ("Inactive" as const) }
      const live = publishedVersion(form)
      const unchanged = !!live && JSON.stringify(live.steps) === JSON.stringify(version.steps)
      const applicationTypeChanged = !initial || initial.applicationType !== product.applicationType
      const named = { ...form, name: form.submissions || initial ? form.name : `${p.name} application form`, productId: product.id }
      if (publish && unchanged && !applicationTypeChanged) await service.saveProduct(product)
      else await service.saveProductWithForm(product, named, version, publish)
      notify(publish ? "Loan product published — new applications use the published form" : "Draft saved")
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The loan type could not be saved. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  const fromSaved = (name: string) => {
    const src = data.forms.find((f) => `${f.name} (v${(publishedVersion(f) ?? f.versions[f.versions.length - 1]).version})` === name)
    if (!src) return
    const v = publishedVersion(src) ?? src.versions[src.versions.length - 1]
    setVersion({ ...version, steps: JSON.parse(JSON.stringify(v.steps)) })
    notify(`Copied steps from ${src.name}`)
  }

  return (
    <>
      <SectionHeader eyebrow="LOANS" title={initial ? `Edit ${initial.name}` : "Create loan product"} description="Changes apply to new applications only. Existing applications keep the form version they were submitted with."
        actions={onCancel && <Button variant="secondary" onClick={onCancel}>Close</Button>} />
      <ol style={{ display: "flex", flexWrap: "wrap", gap: 6, listStyle: "none", padding: 0, margin: "0 0 14px" }}>
        {STEPS.map((s, i) => (
          <li key={s}><button type="button" onClick={() => go(i)} style={{ fontSize: 13, padding: "6px 12px", borderRadius: 99, border: "1px solid var(--line)", background: i === step ? "var(--blue)" : "var(--surface)", color: i === step ? "var(--on-accent)" : "var(--ink)", cursor: "pointer" }}>{i + 1}. {s}</button></li>
        ))}
      </ol>

      {step === 0 && (
        <Panel title="Basic information" flush={false}>
          <div className="form-grid">
            <Field label="Product name" value={p.name} onChange={(v) => set("name", v)} />
            <SelectField label="Status" value={p.status} options={["Active", "Inactive"]} onChange={(v) => set("status", v as LoanProduct["status"])} />
            <TextArea label="Description" value={p.description} onChange={(v) => set("description", v)} />
          </div>
          <div className="form-section-title">Application type</div>
          <div style={{ display: "grid", gap: 8 }}>
            {TYPES.map(([t, d]) => (
              <label key={t} style={{ display: "flex", gap: 10, padding: 12, borderRadius: 8, border: `1px solid ${p.applicationType === t ? "var(--blue)" : "var(--line)"}`, cursor: "pointer" }}>
                <input type="radio" name="apptype" checked={p.applicationType === t} onChange={() => set("applicationType", t)} />
                <span><b>{t}</b><br /><span style={{ color: "var(--muted)" }}>{d}</span></span>
              </label>
            ))}
            <small style={{ color: "var(--muted)" }}>External applicants never need a FinSquare account.</small>
          </div>
        </Panel>
      )}
      {step === 1 && (
        <Panel title="Loan rules" flush={false}>
          <div className="form-grid form-grid-3">
            <NumField label="Minimum amount (₦)" value={p.minAmount} onChange={(v) => set("minAmount", v)} />
            <NumField label="Maximum amount (₦)" value={p.maxAmount} onChange={(v) => set("maxAmount", v)} />
            <NumField label="Minimum duration" value={p.minDuration} onChange={(v) => set("minDuration", v)} />
            <NumField label="Maximum duration" value={p.maxDuration} onChange={(v) => set("maxDuration", v)} />
            <SelectField label="Duration unit" value={p.durationUnit} options={["Days", "Weeks", "Months"]} onChange={(v) => set("durationUnit", v as DurationUnit)} />
            <SelectField label="Repayment frequency" value={p.frequency} options={["Daily", "Weekly", "Monthly"]} onChange={(v) => set("frequency", v as RepaymentFrequency)} />
            <SelectField label="Interest type" value={p.interestType} options={["Flat", "Reducing balance", "Zero interest"]} onChange={(v) => set("interestType", v as InterestType)} />
            <NumField label="Interest rate (% per annum)" step={0.5} value={p.interestType === "Zero interest" ? 0 : p.interestRate} onChange={(v) => set("interestRate", v)} />
            <NumField label="Application fee (%)" step={0.25} value={p.applicationFeePct} onChange={(v) => set("applicationFeePct", v)} />
            <SelectField label="Deduction model" value={p.deductionModel} options={["None", "Fees at disbursement", "Interest & fees at disbursement"]} onChange={(v) => set("deductionModel", v as DeductionModel)} />
            <NumField label="Grace period (days)" value={p.graceDays} onChange={(v) => set("graceDays", v)} />
            <NumField label="Maximum active loans" value={p.maxActiveLoans} onChange={(v) => set("maxActiveLoans", v)} />
            {toggle("Requires admin approval", p.requiresApproval, (b) => set("requiresApproval", b))}
          </div>
        </Panel>
      )}
      {step === 2 && (
        <Panel title="Eligibility" subtitle="Evaluated for members. External applicants are reviewed manually." flush={false}>
          <div className="form-grid form-grid-3">
            <NumField label="Minimum membership / relationship (months)" value={p.eligibility.minMembershipMonths} onChange={(v) => setE("minMembershipMonths", v)} />
            <NumField label="Minimum savings balance (₦)" value={p.eligibility.minSavingsBalance} onChange={(v) => setE("minSavingsBalance", v)} />
            {toggle("Block borrowers with overdue loans", p.eligibility.blockIfOverdueLoan, (b) => setE("blockIfOverdueLoan", b))}
            {toggle("Require verified identity (KYC)", p.eligibility.requireKyc, (b) => setE("requireKyc", b))}
          </div>
        </Panel>
      )}
      {step === 3 && (
        <Panel title="Guarantors" subtitle="Guarantors do not need to be members or have a FinSquare account. They respond through a secure external flow once the backend is connected." flush={false}>
          <div className="form-grid">
            {toggle("Requires guarantor?", p.requiresGuarantor, (b) => setP((x) => ({ ...x, requiresGuarantor: b, guarantorsRequired: b ? Math.max(1, x.guarantorsRequired) : 0 })))}
            {p.requiresGuarantor && <>
              <NumField label="Number required" value={p.guarantorsRequired} onChange={(v) => set("guarantorsRequired", Math.max(1, Math.round(v)))} />
              {toggle("Allow external guarantors", p.allowExternalGuarantors, (b) => set("allowExternalGuarantors", b))}
              {toggle("Require guarantor verification", p.requireGuarantorVerification, (b) => set("requireGuarantorVerification", b))}
              {toggle("Require guarantor documents", p.requireGuarantorDocuments, (b) => set("requireGuarantorDocuments", b))}
            </>}
          </div>
        </Panel>
      )}
      {step === 4 && (
        <>
          <Panel flush={false}>
            <div style={{ display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap" }}>
              <Button variant="secondary" onClick={() => { setVersion({ ...version, steps: systemSteps() }); notify("Reset to the default FinSquare form") }}>Use default FinSquare form</Button>
              <div style={{ minWidth: 260 }}>
                <SelectField label="Start from a saved form" value="" options={["", ...data.forms.map((f) => `${f.name} (v${(publishedVersion(f) ?? f.versions[f.versions.length - 1]).version})`)]} onChange={fromSaved} />
              </div>
              <span style={{ color: "var(--muted)" }}>Or customize below — add steps, questions and documents.</span>
            </div>
          </Panel>
          <FormBuilder version={version} onChange={setVersion} onSave={() => void persist(false)} onPublish={() => go(5)}
            audiences={p.applicationType === "Both" ? (["Internal", "External"] as const) : ([p.applicationType] as const)}
            preview={{ members: data.borrowers, loan: p, guarantorDocFields: GUARANTOR_DOC_FIELDS }}
            library={questionLibrary.api(can("loan_products.update"), notify)}
            stepNote={(s) => s.kind !== "guarantors" ? null : (
              <div style={{ marginTop: 10, color: "var(--muted)" }}>
                {p.requiresGuarantor ? `${p.guarantorsRequired} guarantor(s) required · ${p.allowExternalGuarantors ? "external allowed" : "members only"} · ${p.requireGuarantorDocuments ? "documents required" : "no documents"}` : "This product does not require guarantors, so applicants will not see this step."}
              </div>
            )} />
        </>
      )}
      {step === 5 && (
        <Panel title="Review & publish" flush={false}>
          <KV cols={3} items={[
            ["Product", p.name || "—"], ["Application type", p.applicationType], ["Amount", `${money(p.minAmount)} – ${money(p.maxAmount)}`],
            ["Duration", `${p.minDuration}–${p.maxDuration} ${p.durationUnit.toLowerCase()}`], ["Interest", p.interestType === "Zero interest" ? "Zero interest" : `${p.interestRate}% ${p.interestType.toLowerCase()}`], ["Repayment", p.frequency],
            ["Guarantors", p.requiresGuarantor ? `${p.guarantorsRequired} required${p.allowExternalGuarantors ? " · external allowed" : ""}` : "Not required"],
            ["Form", `Version ${version.version} · ${version.steps.length} steps · ${version.steps.reduce((t, s) => t + s.fields.length, 0)} fields`],
            ["Public link", p.applicationType === "Internal" ? "Not available (internal only)" : `${window.location.origin}/apply/${form.slug}`],
          ]} />
          <p style={{ color: "var(--muted)" }}>Publishing makes this form version live for new applications. Applications already submitted keep the version they used.</p>
          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="secondary" disabled={saving} onClick={() => void persist(false)}>{saving ? "Saving…" : "Save as draft"}</Button>
            <Button disabled={saving} onClick={() => void persist(true)}>{saving ? "Saving…" : "Publish"}</Button>
          </div>
        </Panel>
      )}
      {error && <div className="form-error" role="alert">{error}</div>}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 14 }}>
        <Button variant="ghost" disabled={step === 0} onClick={() => go(step - 1)}>Back</Button>
        {step < 5 && <Button onClick={() => go(step + 1)}>Continue</Button>}
      </div>
    </>
  )
}
