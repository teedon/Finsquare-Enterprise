import { useState, type ReactNode } from "react"
import { Button, Field } from "@/components/ui"
import { cloneStep, customStep, doc, fieldFromLibrary, libraryCategories, mockId, qf, renumber } from "../domain/forms"
import { Panel, TextArea } from "@/features/loans/components/LoanUi"
import { FormFieldEditor } from "./FormFieldEditor"
import { FormRenderer, type FormSubject, type LoanFormConfig } from "./FormRenderer"
import { FormStepEditor } from "./FormStepEditor"
import { FormStepList } from "./FormStepList"
import { LibraryPicker, type QuestionLibraryApi } from "./QuestionLibrary"
import type { FormField, FormStep, FormVersion } from "../types/form.types"

/** What the built form is rendered with, minus the version the builder already owns. */
export interface FormPreviewConfig {
  members?: FormSubject[]
  loan?: LoanFormConfig
  guarantorDocFields?: FormField[]
}

interface Props {
  version: FormVersion
  /** Audiences the preview can switch between. A single audience hides the switcher. */
  audiences?: readonly ("Internal" | "External")[]
  preview: FormPreviewConfig
  library: QuestionLibraryApi
  onChange: (v: FormVersion) => void
  onSave?: () => void
  onPublish?: () => void
  /** Extra sentence for the settings rail, for rules that come from elsewhere in the product. */
  stepNote?: (step: FormStep) => ReactNode
}

/**
 * The form builder shared by loan application forms and member application forms. Everything
 * that differs between the two arrives as props: the steps in `version`, the audiences, the
 * preview config and the question library.
 */
export function FormBuilder({ version, audiences = ["External"], preview, library, onChange, onSave, onPublish, stepNote }: Props) {
  const [mode, setMode] = useState<"edit" | "preview">("edit")
  const [stepId, setStepId] = useState(version.steps[0].id)
  const [fieldId, setFieldId] = useState<string | null>(null)
  const [picker, setPicker] = useState(false)
  const [audience, setAudience] = useState<"Internal" | "External">(audiences[0])
  const steps = version.steps
  const step = steps.find((s) => s.id === stepId) ?? steps[0]
  const field = step.fields.find((f) => f.id === fieldId)
  const setSteps = (next: FormStep[]) => onChange({ ...version, steps: renumber(next) })
  const setStep = (s: FormStep) => setSteps(steps.map((x) => (x.id === s.id ? s : x)))
  const addFields = (fs: FormField[]) => { setStep({ ...step, fields: [...step.fields, ...fs] }); setFieldId(fs[fs.length - 1].id) }
  const setField = (f: FormField) => setStep({ ...step, fields: step.fields.map((x) => (x.id === f.id ? f : x)) })
  const addStep = () => {
    const s = customStep("New step", [])
    const at = steps.findIndex((x) => x.kind === "documents")
    setSteps([...steps.slice(0, at), s, ...steps.slice(at)])
    setStepId(s.id); setFieldId(null)
  }
  const removeFieldById = (id: string) => {
    setStep({ ...step, fields: step.fields.filter((x) => x.id !== id) })
    if (fieldId === id) setFieldId(null)
  }
  const removeField = () => { if (field) removeFieldById(field.id) }

  return (
    <Panel flush={false}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <div><b>Application Form</b> <span style={{ color: "var(--muted)" }}>· Version {version.version} · {version.status}</span></div>
        <div style={{ display: "flex", gap: 8 }}>
          <Button variant={mode === "edit" ? "primary" : "secondary"} onClick={() => setMode("edit")}>Edit</Button>
          <Button variant={mode === "preview" ? "primary" : "secondary"} onClick={() => setMode("preview")}>Preview</Button>
          {onSave && <Button variant="secondary" onClick={onSave}>Save</Button>}
          {onPublish && <Button onClick={onPublish}>Publish…</Button>}
        </div>
      </div>
      {mode === "preview" ? (
        <div style={{ border: "2px dashed var(--line-strong)", borderRadius: 12, padding: 16, background: "var(--surface-soft)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <b>Preview — this is what the applicant sees</b>
            {audiences.length > 1 && (
              <div style={{ display: "flex", gap: 6 }}>
                {audiences.map((a) => <Button key={a} variant={audience === a ? "primary" : "secondary"} onClick={() => setAudience(a)}>{a} applicant</Button>)}
              </div>
            )}
          </div>
          <div style={{ background: "var(--surface)", borderRadius: 10, padding: 20, maxWidth: 720, margin: "0 auto" }}>
            <FormRenderer key={audience} version={version} audience={audience} {...preview} />
          </div>
        </div>
      ) : (
        <div className="form-canvas">
          <div className="form-builder-grid">
            <FormStepList steps={steps} selectedId={step.id} onSelect={(id) => { setStepId(id); setFieldId(null) }} onChange={setSteps} onAdd={addStep} />
            <FormStepEditor step={step} selectedFieldId={fieldId} onSelectField={setFieldId} onChange={setStep}
              onAddQuestion={() => addFields([qf("Untitled question", "short_text", false)])}
              onAddFromLibrary={() => setPicker(true)}
              onAddDocument={() => addFields([doc("New document", false)])}
              onDeleteField={removeFieldById} />
            <div className="form-builder-settings">
              <b>{field ? "Question settings" : "Step settings"}</b>
              {field ? (
                <FormFieldEditor key={field.id} field={field} categories={libraryCategories(library.items)} onChange={setField} onDelete={removeField}
                  onDuplicate={() => addFields([{ ...field, id: mockId("q"), label: `${field.label} (copy)` }])}
                  onSaveToLibrary={async (category) => {
                    await library.save({ id: mockId("ql"), label: field.label, type: field.type, category, description: field.description, required: field.required, options: field.options, createdAt: new Date().toISOString().slice(0, 10), archived: false })
                    library.notify?.("Saved to question library")
                  }} />
              ) : step.type === "custom" ? (
                <div style={{ display: "grid", gap: 10 }}>
                  <Field label="Step name" value={step.title} onChange={(title) => setStep({ ...step, title })} />
                  <TextArea label="Description" value={step.description ?? ""} onChange={(description) => setStep({ ...step, description })} />
                  <div style={{ display: "flex", gap: 6 }}>
                    <Button variant="ghost" onClick={() => { const c = cloneStep(step); setSteps([...steps.slice(0, steps.indexOf(step) + 1), c, ...steps.slice(steps.indexOf(step) + 1)]); setStepId(c.id) }}>Duplicate step</Button>
                    <Button variant="ghost" onClick={() => { setSteps(steps.filter((s) => s.id !== step.id)); setStepId(steps[0].id) }}>Delete step</Button>
                  </div>
                </div>
              ) : (
                <div style={{ color: "var(--muted)" }}>This step comes with the form. You can move it and change its questions, but not its name.</div>
              )}
              {!field && stepNote?.(step)}
            </div>
          </div>
        </div>
      )}
      {picker && <LibraryPicker items={library.items} onClose={() => setPicker(false)} onAdd={(items) => addFields(items.map(fieldFromLibrary))} />}
    </Panel>
  )
}
