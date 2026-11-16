import { useMemo, useState } from "react"
import { Button, Field, SelectField } from "@/components/ui"
import { ArrowLeft, ArrowRight, Check, Upload } from "@/icons"
import { documentConfigOf, isEmpty, num, slotKey, str } from "../domain/forms"
import { TextArea, money } from "@/features/loans/components/LoanUi"
import { ResponseSections } from "./ResponseSections"
import type { FormField, FormResponseValue, FormVersion } from "../types/form.types"

type Values = Record<string, FormResponseValue>

/** A person the renderer can offer on an internal application. `Borrower` satisfies this. */
export interface FormSubject {
  id: string
  name: string
  phone: string
  email?: string
  address?: string
  type?: string
}

/**
 * Only the product facts the renderer actually needs. `LoanProduct` satisfies this, so a loan
 * form passes its product straight through and member forms simply omit it.
 */
export interface LoanFormConfig {
  name: string
  minAmount: number
  maxAmount: number
  minDuration: number
  maxDuration: number
  durationUnit: string
  interestType: string
  interestRate: number
  requiresGuarantor: boolean
  guarantorsRequired: number
  requireGuarantorDocuments: boolean
  allowExternalGuarantors: boolean
  requireGuarantorVerification: boolean
}

export function FieldInput({ field, value, onChange, options }: { field: FormField; value: FormResponseValue | undefined; onChange: (v: FormResponseValue) => void; options?: string[] }) {
  const label = field.label + (field.required ? " *" : "")
  const opts = options ?? field.options?.map((o) => o.label) ?? []
  const help = field.description && <small style={{ color: "var(--muted)" }}>{field.description}</small>
  const choice = (kind: "radio" | "checkbox") => (
    <div className="field span-2">
      <span>{label}</span>
      {opts.map((o) => {
        const arr = Array.isArray(value) ? value : []
        return (
          <label key={o} style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 400 }}>
            <input type={kind} name={field.id} checked={kind === "radio" ? value === o : arr.includes(o)}
              onChange={() => onChange(kind === "radio" ? o : arr.includes(o) ? arr.filter((x) => x !== o) : [...arr, o])} />{o}
          </label>
        )
      })}
      {help}
    </div>
  )
  switch (field.type) {
    case "long_text": case "address": return <TextArea label={label} value={str(value)} onChange={onChange} placeholder={field.description} />
    case "dropdown": return <SelectField label={label} value={str(value)} options={["", ...opts]} onChange={onChange} />
    case "radio": return choice("radio")
    case "checkboxes": return choice("checkbox")
    case "yes_no": return (
      <div className="field span-2"><span>{label}</span>
        <div style={{ display: "flex", gap: 14 }}>{["Yes", "No"].map((o) => <label key={o} style={{ display: "flex", gap: 6, fontWeight: 400 }}><input type="radio" name={field.id} checked={value === o} onChange={() => onChange(o)} />{o}</label>)}</div>
      </div>
    )
    case "file": {
      const c = documentConfigOf(field)
      const up = typeof value === "object" && !Array.isArray(value) ? value : null
      return (
        <div className="field span-2">
          <span>{c.name || field.label}{field.required ? " *" : " (optional)"}</span>
          <small style={{ color: "var(--muted)" }}>{c.description ? `${c.description} ` : ""}Accepted: {c.fileTypes.join(", ")} · max {c.maxSizeMb} MB.</small>
          <label style={{ display: "flex", gap: 8, alignItems: "center", border: "1px dashed var(--line-strong)", borderRadius: 8, padding: "10px 12px", cursor: "pointer" }}>
            <Upload size={16} /> {up ? <b>{up.fileName}</b> : "Choose file"}
            <input type="file" hidden onChange={(e) => { const file = e.target.files?.[0]; if (file) onChange({ fileName: file.name, uploadedAt: new Date().toISOString().slice(0, 10) }) }} />
          </label>
        </div>
      )
    }
    default: {
      const type = ({ number: "number", currency: "number", date: "date", email: "email", phone: "tel" } as Record<string, string>)[field.type] ?? "text"
      return (
        <div className="field-with-help">
          <Field label={label} type={type} value={str(value)} placeholder={field.type === "currency" ? "₦" : field.description} onChange={(v) => onChange(field.type === "number" || field.type === "currency" ? (v === "" ? "" : Number(v)) : v)} />
          {help}
        </div>
      )
    }
  }
}

interface RendererProps {
  version: FormVersion
  audience: "Internal" | "External"
  /** Existing members an internal application can be filed for. */
  members?: FormSubject[]
  /** Present only for a loan application form: enables the loan step, its limits and guarantors. */
  loan?: LoanFormConfig
  /** Extra fields collected once per guarantor. */
  guarantorDocFields?: FormField[]
  /** Omit for preview mode: nothing is submitted. */
  onSubmit?: (values: Values) => Promise<void> | void
  submittedBody?: string
}

export function FormRenderer({ version, audience, members, loan, guarantorDocFields, onSubmit, submittedBody }: RendererProps) {
  const steps = useMemo(() => version.steps.filter((s) => s.kind !== "guarantors" || (loan?.requiresGuarantor ?? false)), [version, loan?.requiresGuarantor])
  const [i, setI] = useState(0)
  const [values, setValues] = useState<Values>({})
  const [error, setError] = useState("")
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)
  const step = steps[Math.min(i, steps.length - 1)]
  const set = (id: string, v: FormResponseValue) => setValues((x) => ({ ...x, [id]: v }))
  const slots = loan?.requiresGuarantor ? loan.guarantorsRequired : 0
  const gFields = (s = step) => [...s.fields, ...(loan?.requireGuarantorDocuments ? guarantorDocFields ?? [] : [])]

  const pickMember = (name: string) => {
    const m = (members ?? []).find((x) => x.name === name)
    if (!m) return setValues((x) => ({ ...x, __member: "" }))
    setValues((x) => ({ ...x, __member: m.id, "sys-fullName": m.name, "sys-phone": m.phone, "sys-email": m.email ?? "", "sys-address": m.address ?? "" }))
  }

  const missing = (s = step): string => {
    if (s.kind === "personal" && audience === "Internal" && !values.__member) return "Select the existing member applying"
    if (s.kind === "guarantors") {
      for (let g = 0; g < slots; g++) for (const x of gFields(s)) if (x.required && isEmpty(values[slotKey(x.id, g)])) return `Guarantor ${g + 1}: ${x.label} is required`
      return ""
    }
    const bad = s.fields.find((x) => x.required && isEmpty(values[x.id]))
    if (bad) return `${bad.label} is required`
    if (loan && s.kind === "loan") {
      const a = num(values["sys-loanAmount"]), d = num(values["sys-duration"])
      if (a < loan.minAmount || a > loan.maxAmount) return `Amount must be between ${money(loan.minAmount)} and ${money(loan.maxAmount)}`
      if (d < loan.minDuration || d > loan.maxDuration) return `Duration must be ${loan.minDuration}–${loan.maxDuration} ${loan.durationUnit.toLowerCase()}`
    }
    return ""
  }
  const next = () => { const m = missing(); setError(m); if (!m) setI(i + 1) }
  const submit = async () => {
    const m = steps.map((s) => missing(s)).find(Boolean)
    if (m) return setError(m)
    setBusy(true)
    try { await onSubmit?.(values); setDone(true) } catch (e) { setError(e instanceof Error ? e.message : "The application could not be submitted. Please try again.") } finally { setBusy(false) }
  }

  if (done) {
    return (
      <div style={{ textAlign: "center", padding: 32 }}>
        <Check size={28} />
        <h2>{onSubmit ? "Application submitted" : "Preview complete"}</h2>
        <p style={{ color: "var(--muted)" }}>{onSubmit ? submittedBody ?? "Thank you. The lender will review your application and contact you." : "Nothing was submitted — this was a preview."}</p>
        <Button variant="secondary" onClick={() => { setDone(false); setI(0); setValues({}) }}>{onSubmit ? "Start another" : "Restart preview"}</Button>
      </div>
    )
  }

  return (
    <div>
      <ol style={{ display: "flex", flexWrap: "wrap", gap: 6, listStyle: "none", padding: 0, margin: "0 0 14px" }}>
        {steps.map((s, n) => (
          <li key={s.id} style={{ fontSize: 12, padding: "4px 10px", borderRadius: 99, background: n === i ? "var(--blue)" : n < i ? "var(--green-soft)" : "var(--surface-soft)", color: n === i ? "var(--on-accent)" : "var(--ink)" }}>
            {n + 1}. {s.title}
          </li>
        ))}
      </ol>
      <h3 style={{ margin: "0 0 4px" }}>{step.title}</h3>
      {step.description && <p style={{ color: "var(--muted)", marginTop: 0 }}>{step.description}</p>}
      <div className="form-grid">
        {step.kind === "personal" && audience === "Internal" && (
          <SelectField label="Applying as (existing member) *" value={(members ?? []).find((m) => m.id === values.__member)?.name ?? ""} options={["", ...(members ?? []).filter((m) => m.type === "Member").map((m) => m.name)]} onChange={pickMember} />
        )}
        {step.kind === "personal" && audience === "External" && <div className="span-2" style={{ color: "var(--muted)" }}>No account needed — just fill in your details.</div>}
        {step.kind === "loan" && loan && <div className="span-2" style={{ color: "var(--muted)" }}>Product: <b>{loan.name}</b> · {money(loan.minAmount)} – {money(loan.maxAmount)} · {loan.minDuration}–{loan.maxDuration} {loan.durationUnit.toLowerCase()} · {loan.interestType === "Zero interest" ? "0%" : `${loan.interestRate}% p.a.`}</div>}
        {step.kind === "guarantors" ? (
          Array.from({ length: slots }, (_, g) => (
            <div key={g} className="span-2" style={{ display: "contents" }}>
              <div className="form-section-title span-2">Guarantor {g + 1}</div>
              {gFields().map((x) => <FieldInput key={x.id} field={x} value={values[slotKey(x.id, g)]} onChange={(v) => set(slotKey(x.id, g), v)}
                options={x.systemField === "g_type" && !loan?.allowExternalGuarantors ? ["Existing member"] : undefined} />)}
            </div>
          ))
        ) : step.kind === "review" ? (
          <div className="span-2"><ResponseSections version={version} values={values} guarantorDocFields={guarantorDocFields} /></div>
        ) : (
          step.fields.map((x) => <FieldInput key={x.id} field={x} value={values[x.id]} onChange={(v) => set(x.id, v)} />)
        )}
      </div>
      {step.kind === "guarantors" && <p style={{ color: "var(--muted)" }}>Guarantors don’t need a FinSquare account. {loan?.requireGuarantorVerification ? "Each guarantor will be contacted and verified before approval." : ""}</p>}
      {error && <div className="form-error" role="alert">{error}</div>}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16 }}>
        <Button variant="ghost" icon={ArrowLeft} disabled={i === 0} onClick={() => { setError(""); setI(i - 1) }}>Back</Button>
        {i < steps.length - 1 ? <Button icon={ArrowRight} onClick={next}>Continue</Button> : <Button disabled={busy} onClick={submit}>{onSubmit ? "Submit application" : "Submit (preview)"}</Button>}
      </div>
    </div>
  )
}
