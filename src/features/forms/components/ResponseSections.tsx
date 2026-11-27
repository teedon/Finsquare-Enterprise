import { useState } from "react"
import { Button, Modal } from "@/components/ui"
import { isEmpty, showValue, slotKey } from "../domain/forms"
import { KV, Panel, StatusBadge, fmtDate } from "@/features/loans/components/LoanUi"
import type { FormField, FormResponseValue, FormVersion } from "../types/form.types"

interface Props {
  version: FormVersion
  values: Record<string, FormResponseValue>
  docStatus?: (field: FormField) => string
  onFile?: (name: string) => void
  /** Extra fields collected once per guarantor, for forms that ask for guarantors. */
  guarantorDocFields?: FormField[]
}

const slotsIn = (values: Props["values"]) => 1 + Math.max(-1, ...Object.keys(values).filter((k) => k.includes("#")).map((k) => Number(k.split("#")[1])))

/** Responses grouped by the form step they were collected in. */
export function ResponseSections({ version, values, docStatus, onFile, guarantorDocFields = [] }: Props) {
  const [preview, setPreview] = useState<{ fileName: string; url?: string; mimeType?: string } | null>(null)
  const steps = version.steps.filter((s) => s.kind !== "review")
  return (
    <>
      {steps.map((s) => {
        if (s.kind === "documents") {
          return (
            <Panel key={s.id} title={s.title} subtitle="Uploaded files">
              <table className="data-table" style={{ width: "100%" }}>
                <thead><tr><th className="serial-cell">#</th><th>Document</th><th>Uploaded</th><th>Status</th><th /></tr></thead>
                <tbody>
                  {s.fields.map((x, index) => {
                    const v = values[x.id]
                    const up = typeof v === "object" && !Array.isArray(v) ? v : null
                    return (
                      <tr key={x.id}>
                        <td className="serial-cell">{index + 1}</td>
                        <td><b>{x.label}</b>{x.required && <span style={{ color: "var(--muted)" }}> · required</span>}</td>
                        <td>{up ? fmtDate(up.uploadedAt) : "—"}</td>
                        <td><StatusBadge status={up ? docStatus?.(x) ?? "Pending review" : x.required ? "Pending" : "Not provided"} /></td>
                        <td>{up && <span style={{ display: "flex", gap: 6 }}>
                          <Button variant="ghost" onClick={() => { onFile?.(up.fileName); setPreview({ fileName: up.fileName, url: up.url ?? up.fileUrl ?? up.downloadUrl, mimeType: up.mimeType }) }}>Preview</Button>
                          {(up.url ?? up.fileUrl ?? up.downloadUrl) ? <a className="btn btn-ghost" href={up.url ?? up.fileUrl ?? up.downloadUrl} download={up.fileName} target="_blank" rel="noreferrer">Download</a> : <Button variant="ghost" disabled title="No file URL is available">Download</Button>}
                        </span>}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </Panel>
          )
        }
        if (s.kind === "guarantors") {
          const n = slotsIn(values)
          if (n <= 0) return null
          const fields = [...s.fields, ...guarantorDocFields.filter((d) => Object.keys(values).some((k) => k.startsWith(`${d.id}#`)))]
          return Array.from({ length: n }, (_, i) => (
            <Panel key={`${s.id}${i}`} title={`${s.title} – Guarantor ${i + 1}`} flush={false}>
              <KV items={fields.map((x): [string, string] => [x.label, showValue(x, values[slotKey(x.id, i)])])} />
            </Panel>
          ))
        }
        const rows = s.fields.filter((x) => !isEmpty(values[x.id]) || x.required)
        if (!rows.length) return null
        return (
          <Panel key={s.id} title={s.title} flush={false}>
            <KV items={rows.map((x): [string, string] => [x.label, showValue(x, values[x.id])])} />
          </Panel>
        )
      })}
      {preview && <Modal title={preview.fileName} wide onClose={() => setPreview(null)}>
        <div style={{ padding: 16, minHeight: 240, display: "grid", placeItems: "center" }}>
          {preview.url && (preview.mimeType?.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg)$/i.test(preview.fileName)) ? <img src={preview.url} alt={preview.fileName} style={{ maxWidth: "100%", maxHeight: "70vh", objectFit: "contain" }} />
            : preview.url && (preview.mimeType === "application/pdf" || preview.fileName.toLowerCase().endsWith(".pdf")) ? <iframe title={`Preview ${preview.fileName}`} src={preview.url} style={{ width: "100%", height: "70vh", border: 0 }} />
              : preview.url ? <div>This file type can’t be previewed here. <a href={preview.url} target="_blank" rel="noreferrer">Open file</a></div>
                : <div style={{ color: "var(--muted)", textAlign: "center" }}>A preview isn’t available because the uploaded file URL was not provided.</div>}
        </div>
      </Modal>}
    </>
  )
}
