import type {
  FormField, FormFieldType, FormResponseValue, FormStep, FormVersion, QuestionLibraryItem, VersionedForm,
} from "../types/form.types"

let seq = 1000
export const mockId = (p: string) => `${p}-f${++seq}`

export const FIELD_TYPES: { id: FormFieldType; label: string }[] = [
  { id: "short_text", label: "Short text" }, { id: "long_text", label: "Long text" }, { id: "number", label: "Number" }, { id: "currency", label: "Currency" },
  { id: "date", label: "Date" }, { id: "dropdown", label: "Dropdown" }, { id: "radio", label: "Radio buttons" }, { id: "checkboxes", label: "Checkboxes" },
  { id: "yes_no", label: "Yes / No" }, { id: "phone", label: "Phone number" }, { id: "email", label: "Email" }, { id: "address", label: "Address" }, { id: "file", label: "File upload" },
]
export const typeLabel = (t: FormFieldType) => FIELD_TYPES.find((x) => x.id === t)?.label ?? t
export const hasOptions = (t: FormFieldType) => t === "dropdown" || t === "radio" || t === "checkboxes"
export const ID_TYPES = ["National ID (NIN)", "Voter's card", "Driver's licence", "International passport"]

/** A field the workflow depends on. A `locked` field cannot be deleted or made optional. */
export const systemField = (systemField: string, label: string, type: FormFieldType, required = true, locked = false, options?: string[]): FormField => ({
  id: `sys-${systemField}`, systemField, label, type, required, locked, order: 0,
  options: options?.map((o) => ({ id: o, label: o })),
})
export const systemStep = (kind: FormStep["kind"], title: string, fields: FormField[], description?: string): FormStep => ({
  id: `step-${kind}`, kind, title, description, order: 0, type: "system", fields: fields.map((x, i) => ({ ...x, order: i })),
})
export const doc = (name: string, required: boolean, description = "", fileTypes = ["PDF", "JPG", "PNG"], maxSizeMb = 5): FormField => ({
  id: mockId("doc"), type: "file", label: name, required, order: 0, documentConfig: { name, description, required, fileTypes, maxSizeMb },
})
export const qf = (label: string, type: FormFieldType, required = true, options?: string[], description?: string): FormField => ({
  id: mockId("q"), type, label, required, description, order: 0, options: options?.map((o) => ({ id: mockId("o"), label: o })),
})
export const customStep = (title: string, fields: FormField[], description?: string): FormStep => ({
  id: mockId("step"), kind: "custom", type: "custom", title, description, order: 0, fields: fields.map((x, i) => ({ ...x, order: i })),
})

export const renumber = (steps: FormStep[]) => steps.map((s, i) => ({ ...s, order: i, fields: s.fields.map((x, j) => ({ ...x, order: j })) }))

export function newVersion(version: number, status: FormVersion["status"], steps: FormStep[]): FormVersion {
  return { id: mockId("fv"), version, status, steps, createdAt: new Date().toISOString().slice(0, 10) }
}

export const cloneStep = (s: FormStep): FormStep => ({ ...s, id: mockId("step"), type: "custom", kind: "custom", title: `${s.title} (copy)`, fields: s.fields.map((x) => ({ ...x, id: mockId("q"), systemField: undefined, locked: false })) })
export const cloneVersion = (v: FormVersion, version: number): FormVersion => ({ ...v, id: mockId("fv"), version, status: "Draft", createdAt: new Date().toISOString().slice(0, 10), publishedAt: undefined })

export const publishedVersion = (form?: VersionedForm) => form?.versions.find((v) => v.id === form.publishedVersionId)
export const draftVersion = (form: VersionedForm) => form.versions.find((v) => v.status === "Draft")
export const workingVersion = (form: VersionedForm): FormVersion => draftVersion(form) ?? cloneVersion(publishedVersion(form) ?? form.versions[form.versions.length - 1], Math.max(...form.versions.map((v) => v.version)) + 1)

export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || to >= list.length) return list
  const next = list.slice()
  next.splice(to, 0, next.splice(from, 1)[0])
  return next
}

/**
 * The whole numbers from `min` to `max`, as strings, for a generated dropdown. A loan type stores
 * its duration as a range, so the application form offers exactly the values it permits.
 */
export const rangeStrings = (min: number, max: number): string[] =>
  max < min ? [] : Array.from({ length: Math.floor(max) - Math.ceil(min) + 1 }, (_, i) => String(Math.ceil(min) + i))

export const fieldFromLibrary = (q: QuestionLibraryItem): FormField => ({
  id: mockId("q"), type: q.type, label: q.label, description: q.description, required: q.required, questionLibraryId: q.id, order: 0,
  options: q.options?.map((o) => ({ ...o, id: mockId("o") })),
})

export const documentConfigOf = (x: FormField) => x.documentConfig ?? { name: x.label, required: x.required, fileTypes: ["PDF", "JPG", "PNG"], maxSizeMb: 5 }

/** The distinct categories currently in use, for the library filter and the save-to-library picker. */
export const libraryCategories = (items: QuestionLibraryItem[]) => [...new Set(items.map((item) => item.category))]

export const isEmpty = (v: FormResponseValue | undefined) => v === undefined || v === "" || (Array.isArray(v) && !v.length)
export const slotKey = (id: string, slot: number) => `${id}#${slot}`
export const num = (v: FormResponseValue | undefined) => (typeof v === "number" ? v : Number(v) || 0)
export const str = (v: FormResponseValue | undefined) => (typeof v === "string" ? v : v === undefined ? "" : String(v))

export function showValue(field: FormField, v: FormResponseValue | undefined): string {
  if (isEmpty(v)) return "—"
  if (typeof v === "object" && !Array.isArray(v)) return v.fileName
  if (Array.isArray(v)) return v.join(", ")
  if (field.type === "currency") return `₦${num(v).toLocaleString("en-NG")}`
  if (typeof v === "boolean") return v ? "Yes" : "No"
  return String(v)
}

const upsertVersion = <T extends VersionedForm>(form: T, v: FormVersion): FormVersion[] =>
  form.versions.some((x) => x.id === v.id) ? form.versions.map((x) => (x.id === v.id ? v : x)) : [...form.versions, v]

export function applyDraft<T extends VersionedForm>(form: T, v: FormVersion): T {
  return { ...form, versions: upsertVersion(form, { ...v, status: "Draft" }) }
}

/** Publishing archives the previous published version; submitted responses keep pointing at their own version. */
export function applyPublish<T extends VersionedForm>(form: T, v: FormVersion): T {
  const today = new Date().toISOString().slice(0, 10)
  const published: FormVersion = { ...v, status: "Published", publishedAt: today }
  const versions = upsertVersion(form, published).map((x) => (x.id !== v.id && x.status === "Published" ? { ...x, status: "Archived" as const } : x))
  return { ...form, status: "Published", publishedVersionId: v.id, versions }
}
