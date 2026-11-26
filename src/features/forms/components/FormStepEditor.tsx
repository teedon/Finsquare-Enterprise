import { GripVertical, Plus, X } from "@/icons"
import { Badge, Button } from "@/components/ui"
import { moveItem, typeLabel } from "../domain/forms"
import { dragProps } from "./dragProps"
import type { FormField, FormStep } from "../types/form.types"

interface Props {
  step: FormStep
  selectedFieldId: string | null
  onSelectField: (id: string) => void
  onChange: (step: FormStep) => void
  onAddQuestion: () => void
  onAddFromLibrary: () => void
  onAddDocument: () => void
  onDeleteField: (id: string) => void
}

/** How a question reads in the builder: locked, supplied-but-optional, or the organization's own. */
const fieldStanding = (field: FormField) => (field.locked ? "Required" : field.systemField ? "Suggested" : "Custom")

export function FormStepEditor({ step, selectedFieldId, onSelectField, onChange, onAddQuestion, onAddFromLibrary, onAddDocument, onDeleteField }: Props) {
  const drop = (from: string, to: string) => {
    const a = step.fields.findIndex((f) => f.id === from), b = step.fields.findIndex((f) => f.id === to)
    onChange({ ...step, fields: moveItem(step.fields, a, b).map((f, i) => ({ ...f, order: i })) })
  }
  const canAdd = step.kind !== "review" && step.kind !== "guarantors"
  return (
    <div style={{ display: "grid", gap: 8, alignContent: "start" }}>
      <div>
        <h3 style={{ margin: 0 }}>{step.title}</h3>
        {step.description && <div style={{ color: "var(--muted)" }}>{step.description}</div>}
      </div>
      {step.kind === "review" && <div style={{ color: "var(--muted)" }}>Applicants review a summary of all answers before submitting. Nothing to configure.</div>}
      {step.kind === "guarantors" && <div style={{ color: "var(--muted)" }}>Collected once per required guarantor. Count and verification rules come from the product’s Guarantors settings. You can change which optional details are required below.</div>}
      {step.fields.map((f) => (
        <div key={f.id} {...dragProps("field", f.id, drop)} onClick={() => onSelectField(f.id)}
          style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: 8, cursor: "pointer", background: "var(--surface)", border: `1px solid ${f.id === selectedFieldId ? "var(--blue)" : "var(--line)"}` }}>
          {/* Every question can be reordered now, including the required ones, so all show a handle;
              the badge is what says a question cannot be deleted. */}
          <GripVertical size={14} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <b>{f.label}{f.required && <span style={{ color: "var(--red-text)" }}> *</span>}</b>
            <div style={{ color: "var(--muted)", fontSize: 12 }}>
              {f.systemField === "duration" ? "Dropdown · from the loan type" : typeLabel(f.type)}
              {f.type === "file" && f.documentConfig ? ` · ${f.documentConfig.fileTypes.join("/")} · ${f.documentConfig.maxSizeMb} MB` : ""}
            </div>
          </div>
          <Badge tone={f.locked ? "blue" : f.systemField ? "purple" : "neutral"}>{fieldStanding(f)}</Badge>
          {!f.locked && (
            <button
              type="button"
              aria-label={`Delete ${f.label}`}
              title="Delete question"
              onClick={(event) => { event.stopPropagation(); onDeleteField(f.id) }}
              style={{ display: "flex", alignItems: "center", padding: 4, border: 0, background: "transparent", color: "var(--muted)", cursor: "pointer" }}
            >
              <X size={15} />
            </button>
          )}
        </div>
      ))}
      {canAdd && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
          {step.kind === "documents"
            ? <Button variant="secondary" icon={Plus} onClick={onAddDocument}>Add document</Button>
            : <>
                <Button variant="secondary" icon={Plus} onClick={onAddQuestion}>Add question</Button>
                <Button variant="secondary" onClick={onAddFromLibrary}>Add from library</Button>
              </>}
        </div>
      )}
    </div>
  )
}
