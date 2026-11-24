import { useState, type ReactNode } from "react"
import { ErrorState, LoadingState } from "@/components/feedback/AsyncState"
import { EnvironmentNotice } from "@/components/feedback/EnvironmentNotice"
import { Badge, IconButton } from "@/components/ui"
import { X } from "@/icons"
import type { View } from "@/types"
import { useWallet } from "../hooks/useWallet"
import type { Wallet, WalletStatus, TransactionStatus } from "../types/wallet.types"

export { money } from "../domain/wallet.rules"
export { fmtDate } from "@/features/loans/components/LoanUi"

export interface WalletPageProps {
  navigate: (view: View, id?: string) => void
  notify: (message: string) => void
  id?: string
}
export type WalletCtx = WalletPageProps &
  Omit<ReturnType<typeof useWallet>, "data" | "error"> & { data: NonNullable<ReturnType<typeof useWallet>["data"]> }

export const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })

export function WalletPage({
  children,
  bare,
  ...props
}: WalletPageProps & { children: (ctx: WalletCtx) => ReactNode; bare?: boolean }) {
  const w = useWallet()
  const { data, error, ...rest } = w
  if (error) return <ErrorState message={error} retry={w.retry} />
  if (!w.data) return <LoadingState label="Loading wallets…" />
  const ctx = { ...props, ...rest, data } as WalletCtx
  if (bare) return <>{children(ctx)}</>
  return (
    <div className="page">
      <EnvironmentNotice mode={ctx.mode} />
      {children(ctx)}
    </div>
  )
}

const walletTones: Record<WalletStatus, "green" | "amber" | "red" | "neutral"> = {
  active: "green",
  restricted: "amber",
  suspended: "red",
  closed: "neutral",
}
export const WalletStatusBadge = ({ status }: { status: WalletStatus }) => (
  <Badge tone={walletTones[status]}>{status[0].toUpperCase() + status.slice(1)}</Badge>
)

const txTones: Record<TransactionStatus, "green" | "amber" | "red" | "neutral" | "blue" | "purple"> = {
  Completed: "green",
  Pending: "amber",
  Processing: "blue",
  Failed: "red",
  Reversed: "purple",
  Cancelled: "neutral",
}
export const TxStatusBadge = ({ status }: { status: TransactionStatus }) => (
  <Badge tone={txTones[status]}>{status}</Badge>
)

export function Drawer({
  title,
  subtitle,
  onClose,
  children,
  wide,
}: {
  title: string
  subtitle?: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
}) {
  return (
    <div className="sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside
        className="sheet wallet-drawer"
        style={{ width: wide ? "min(640px,100%)" : "min(500px,100%)", overflow: "auto" }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-header">
          <div>
            <div className="modal-title">{title}</div>
            {subtitle && <span className="sheet-sub">{subtitle}</span>}
          </div>
          <IconButton icon={X} label="Close" onClick={onClose} />
        </div>
        <div style={{ padding: 16 }}>{children}</div>
      </aside>
    </div>
  )
}

export function CheckList({ checks }: { checks: { label: string; ok: boolean; detail?: string }[] }) {
  return (
    <ul className="wallet-checks">
      {checks.map((c) => (
        <li key={c.label} data-ok={c.ok}>
          <span aria-hidden>{c.ok ? "✓" : "✕"}</span>
          <div>
            <b>{c.label}</b>
            {c.detail && <small>{c.detail}</small>}
          </div>
        </li>
      ))}
    </ul>
  )
}

export function useWalletSelect(wallets: Wallet[], initial?: string) {
  const [id, setId] = useState(initial && wallets.some((w) => w.id === initial) ? initial : (wallets[0]?.id ?? ""))
  return [id, setId, wallets.find((w) => w.id === id)] as const
}

export function WalletSelect({
  label,
  value,
  onChange,
  wallets,
  showBalance = true,
}: {
  label: string
  value: string
  onChange: (id: string) => void
  wallets: Wallet[]
  showBalance?: boolean
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Select wallet…</option>
        {wallets.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name}
            {showBalance ? ` — ₦${Math.round(w.availableBalance).toLocaleString("en-NG")}` : ""}
          </option>
        ))}
      </select>
    </label>
  )
}

export const balanceOf = (ctx: Pick<WalletCtx, "canOn">, w: Wallet, value: number = w.availableBalance) =>
  ctx.canOn(w, "wallet.view_balance") ? `₦${Math.round(value).toLocaleString("en-NG")}` : "Hidden"

export function ValueSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (e: { target: { value: string } }) => void
  options: { value: string; label: string }[]
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={onChange}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}
