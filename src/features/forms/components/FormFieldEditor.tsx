import { useState } from "react"
import { Button, Field, SelectField, Toggle } from "@/components/ui"
import { X, Plus } from "@/icons"
import { FIELD_TYPES, hasOptions, mockId, typeLabel } from "../domain/forms"
import { TextArea } from "@/features/loans/components/LoanUi"
import { DocumentRequirementEditor } from "./DocumentRequirement"
import type { FormField, FormFieldType, FormOption } from "../types/form.types"

export function OptionsEditor({ options, onChange }: { options: FormOption[]; onChange: (o: FormOption[]) => void }) {
  return (
    <div className="field">
      <span>Options</span>
      {options.map((o) => (
        <div key={o.id} style={{ display: "flex", gap: 6 }}>
          <input value={o.label} onChange={(e) => onChange(options.map((x) => (x.id === o.id ? { ...x, label: e.target.value } : x)))} style={{ flex: 1 }} />
          <Button variant="ghost" icon={X} onClick={() => onChange(options.filter((x) => x.id !== o.id))}>{""}</Button>
        </div>
      ))}
      <Button variant="ghost" icon={Plus} onClick={() => onChange([...options, { id: mockId("o"), label: `Option ${options.length + 1}` }])}>Add option</Button>
    </div>
  )
}

interface Props {
  field: FormField
  onChange: (f: FormField) => void
  onDelete: () => void
  onDuplicate: () => void
  onSaveToLibrary?: (category: string) => Promise<void>
  categories: string[]
}

export function FormFieldEditor({ field, onChange, onDelete, onDuplicate, onSaveToLibrary, categories }: Props) {
  const [cat, setCat] = useState(categories[0] ?? "General")
  const [saved, setSaved] = useState(false)
  if (field.type === "file" && field.documentConfig) {
    return (
      <div style={{ display: "grid", gap: 10 }}>
        <b>Document request</b>
        <DocumentRequirementEditor field={field} onChange={onChange} />
        <Button variant="ghost" onClick={onDelete}>Remove document</Button>
      </div>
    )
  }
  const sys = !!field.systemField
  const setType = (t: string) => {
    const type = t as FormFieldType
    onChange({ ...field, type, options: hasOptions(type) ? field.options?.length ? field.options : [{ id: mockId("o"), label: "Option 1" }, { id: mockId("o"), label: "Option 2" }] : undefined })
  }
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <span style={{ fontSize: 12, color: field.locked ? "var(--blue-text)" : sys ? "var(--purple-text)" : "var(--muted)" }}>{field.locked ? "Required" : sys ? "Suggested" : "Custom"}{field.questionLibraryId ? " · from library" : ""}</span>
      <Field label="Question" value={field.label} onChange={(label) => onChange({ ...field, label })} />
      {sys ? (
        <div style={{ color: "var(--muted)" }}>Field type: {field.systemField === "duration" ? "Dropdown (from the loan type)" : `${typeLabel(field.type)} (fixed)`}</div>
      ) : (
        <SelectField label="Field type" value={typeLabel(field.type)} options={FIELD_TYPES.map((t) => t.label)} onChange={(l) => setType(FIELD_TYPES.find((t) => t.label === l)!.id)} />
      )}
      <div className="field">
        <span>Required</span>
        <Toggle value={field.required} onChange={() => !field.locked && onChange({ ...field, required: !field.required })} />
      </div>
      <TextArea label="Description / helper text" value={field.description ?? ""} onChange={(description) => onChange({ ...field, description })} placeholder="Optional" />
      {hasOptions(field.type) && !sys && <OptionsEditor options={field.options ?? []} onChange={(options) => onChange({ ...field, options })} />}
      {!sys && onSaveToLibrary && (
        <div style={{ display: "grid", gap: 6, borderTop: "1px solid var(--line)", paddingTop: 10 }}>
          <SelectField label="Save to question library" value={cat} options={[...categories, "General"].filter((c, i, a) => a.indexOf(c) === i)} onChange={setCat} />
          <Button variant="secondary" onClick={async () => { await onSaveToLibrary(cat); setSaved(true) }}>{saved ? "Saved to library" : "Save to library"}</Button>
        </div>
      )}
      {!field.locked && <div style={{ display: "flex", gap: 6 }}><Button variant="ghost" onClick={onDuplicate}>Duplicate</Button><Button variant="ghost" onClick={onDelete}>Delete</Button></div>}
    </div>
  )
}
