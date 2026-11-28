import { useState, type CSSProperties, type ReactNode } from "react"
import { useAuthorization } from "@/features/administrators/hooks/useAuthorization"
import { useWorkspace } from "@/app/providers/WorkspaceProvider"
import { moneyMovementMode } from "@/lib/permissions/capabilities"
import { ErrorState, LoadingState } from "@/components/feedback/AsyncState"
import { DataTable, type DataTableColumn } from "@/components/data-display/DataTable"
import { Badge, Button, Modal, Tabs as UiTabs } from "@/components/ui"
import { Download } from "@/icons"
import type { Permission, View } from "@/types"
import type { Actor } from "@/features/wallet/types/wallet.types"
import type { Mode } from "@/features/wallet/services/wallet.service"
import { useLoans } from "../hooks/useLoans"
import type { LoansService } from "../services/loans.service"
import type {
  ApplicationStatus,
  GuarantorStatus,
  LoanDataset,
  LoanStatus,
  RecoveryStatus,
  ScheduleStatus,
} from "../types/loan.types"

export interface LoanPageProps {
  navigate: (view: View, id?: string) => void
  notify: (message: string) => void
  id?: string
}

export interface LoanCtx extends LoanPageProps {
  data: LoanDataset
  service: LoansService
  can: (permission: Permission) => boolean
  organizationId: string
  actor: Actor
  mode: Mode
}

export const money = (n: number) =>
  `₦${Math.round(n).toLocaleString("en-NG")}`
export const compactMoney = (n: number) =>
  n >= 1e9 ? `₦${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `₦${(n / 1e6).toFixed(1)}M` : money(n)
export const fmtDate = (iso?: string) =>
  iso
    ? new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
    : "—"

type Tone = "neutral" | "blue" | "green" | "amber" | "red" | "purple"
const tones: Record<string, Tone> = {
  Draft: "neutral", Submitted: "blue", "Under Review": "purple", "Guarantor Pending": "amber", Approved: "green", "Offer Sent": "blue",
  "Offer Accepted": "green", Rejected: "red", Disbursed: "green", Cancelled: "neutral",
  Active: "blue", Current: "green", Overdue: "amber", Defaulted: "red", Completed: "neutral", "Written Off": "red",
  Upcoming: "neutral", Due: "blue", Paid: "green", "Partially Paid": "amber",
  Pending: "amber", Verified: "blue", Accepted: "green", "Pending review": "amber",
  Open: "amber", "Reminder Sent": "blue", "Promise to Pay": "purple", "Guarantor Contacted": "purple", "Guarantor Recovery": "red", Resolved: "green",
  Eligible: "green", "Not Eligible": "red", "Needs Review": "amber", Confirmed: "green", Failed: "red", Inactive: "neutral",
}
export function StatusBadge({
  status,
}: {
  status: ApplicationStatus | LoanStatus | ScheduleStatus | GuarantorStatus | RecoveryStatus | string
}) {
  return <Badge tone={tones[status] ?? "neutral"}>{status}</Badge>
}

export function LoanPage({
  children,
  bare,
  width,
  ...props
}: LoanPageProps & { children: (ctx: LoanCtx) => ReactNode; bare?: boolean; width?: "narrow" }) {
  const { data, error, retry, service } = useLoans()
  const { can, administrator } = useAuthorization()
  const { state } = useWorkspace()
  if (error) return <ErrorState message={error} retry={retry} />
  if (!data) return <LoadingState label="Loading loans…" />
  const body = children({
    ...props,
    data,
    service,
    can,
    organizationId: state.activeCommunityId,
    actor: { id: administrator.id, name: administrator.name },
    mode: moneyMovementMode(state.environment),
  })
  if (bare) return <>{body}</>
  return <div className={width === "narrow" ? "page page-narrow" : "page"}>{body}</div>
}

export function Panel({ title, subtitle, actions, children, flush = true }: { title?: string; subtitle?: string; actions?: ReactNode; children: ReactNode; flush?: boolean }) {
  return (
    <section className="panel" style={{ overflow: "hidden" }}>
      {title && (
        <div className="panel-head">
          <div>
            <b>{title}</b>
            {subtitle && <span>{subtitle}</span>}
          </div>
          {actions}
        </div>
      )}
      <div style={flush ? undefined : { padding: 14 }}>{children}</div>
    </section>
  )
}

export function Stats({ items }: { items: { label: string; value: string | number; detail?: string; tone?: Tone }[] }) {
  return (
    <div
      className="stat-grid"
      data-stats
      style={{ "--stat-cols": Math.min(items.length, 4), marginBottom: 12 } as CSSProperties}
    >
      {items.map((i) => (
        <div className="stat-card" key={i.label}>
          <div className="stat-top"><span>{i.label}</span></div>
          <div className="stat-value" style={i.tone === "red" ? { color: "var(--red-text)" } : i.tone === "amber" ? { color: "var(--amber-text)" } : undefined}>{i.value}</div>
          {i.detail && <div className="stat-sub">{i.detail}</div>}
        </div>
      ))}
    </div>
  )
}

export function KV({ items, cols = 2 }: { items: [string, ReactNode][]; cols?: number }) {
  return (
    // The column count travels as a custom property: an inline `grid-template-columns` would
    // beat `.detail-grid`'s media query and keep the grid multi-column on a phone.
    <div className="detail-grid" style={{ "--kv-cols": cols } as CSSProperties}>
      {items.map(([k, v]) => (
        <div key={k}>
          <span>{k}</span>
          <b>{v}</b>
        </div>
      ))}
    </div>
  )
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { id: T; label: string; count?: number }[]
  value: T
  onChange: (id: T) => void
}) {
  return <UiTabs tabs={tabs} value={value} onChange={onChange} />
}

export function ActionModal({
  title, onClose, onSubmit, submitLabel, children, danger, disabled, wide,
}: {
  title: string; onClose: () => void; onSubmit: () => Promise<void> | void; submitLabel: string; children: ReactNode; danger?: boolean; disabled?: boolean; wide?: boolean
}) {
  const [busy, setBusy] = useState(false)
  return (
    <Modal title={title} onClose={onClose} wide={wide}>
      <div className="wizard-body" style={{ minHeight: 0 }}>{children}</div>
      <div className="wizard-footer">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button
          variant={danger ? "danger" : "primary"}
          disabled={busy || disabled}
          onClick={async () => {
            setBusy(true)
            try {
              await onSubmit()
              onClose()
            } catch {
              /* validation errors are shown by the form */
            } finally {
              setBusy(false)
            }
          }}
        >
          {busy ? "Working…" : submitLabel}
        </Button>
      </div>
    </Modal>
  )
}

export const TextArea = ({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) => (
  <label className="field span-2">
    <span>{label}</span>
    <textarea value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
  </label>
)

export const NumField = ({ label, value, onChange, step }: { label: string; value: number; onChange: (v: number) => void; step?: number }) => (
  <label className="field">
    <span>{label}</span>
    <input type="number" min={0} step={step} value={Number.isNaN(value) ? "" : value} onChange={(e) => onChange(e.target.value === "" ? NaN : Number(e.target.value))} />
  </label>
)

export const PillSelect = ({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: string[] }) => (
  <select value={value} onChange={(e) => onChange(e.target.value)}>
    {options.map((o) => <option key={o}>{o}</option>)}
  </select>
)

export function downloadCsv(name: string, headers: string[], rows: (string | number)[][]) {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`
  const csv = [headers, ...rows].map((r) => r.map(esc).join(",")).join("\n")
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }))
  const a = document.createElement("a")
  a.href = url
  a.download = `${name}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export function ExportButtons({ onCsv, onPdf, disabled }: { onCsv: () => void; onPdf: () => void; disabled?: boolean }) {
  return (
    <>
      <Button variant="secondary" icon={Download} disabled={disabled} onClick={onCsv}>CSV / Excel</Button>
      <Button variant="secondary" icon={Download} disabled={disabled} onClick={onPdf}>PDF</Button>
    </>
  )
}

export function PagedTable<T>({
  rows, columns, rowKey, onRowClick, pageSize = 8, emptyText = "Nothing to show yet.", selectedKeys, onSelectionChange, showSerial,
}: {
  rows: T[]; columns: DataTableColumn<T>[]; rowKey: (r: T) => string; onRowClick?: (r: T) => void; pageSize?: number; emptyText?: string
  selectedKeys?: ReadonlySet<string>; onSelectionChange?: (k: Set<string>) => void; showSerial?: boolean
}) {
  const [page, setPage] = useState(1)
  const maxPage = Math.max(1, Math.ceil(rows.length / pageSize))
  const current = Math.min(page, maxPage)
  return (
    <DataTable
      rows={rows.slice((current - 1) * pageSize, current * pageSize)}
      columns={columns} rowKey={rowKey} onRowClick={onRowClick} page={current} pageSize={pageSize} total={rows.length}
      onPageChange={setPage} selectedKeys={selectedKeys} onSelectionChange={onSelectionChange} showSerial={showSerial}
      empty={<div className="tab-empty" style={{ border: 0 }}><b>{emptyText}</b></div>}
    />
  )
}
