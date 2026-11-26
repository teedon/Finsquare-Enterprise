import { useMemo, useState } from "react"
import { Modal, SectionHeader } from "@/components/ui"
import { SearchInput } from "@/components/data-display/ManagementPrimitives"
import { ExportButtons, KV, PagedTable, Panel, downloadCsv, fmtDate } from "@/features/loans/components/LoanUi"
import { printTable } from "../domain/export"
import { money, type WalletCtx } from "./WalletShell"
import type { WalletAuditLog } from "../types/wallet.types"

const auditRow = (entry: WalletAuditLog) => [
  entry.at,
  entry.actor,
  entry.action,
  entry.walletName ?? "",
  entry.amount ?? "",
  entry.reference ?? "",
  entry.previousState ?? "",
  entry.newState ?? "",
]
const auditHeaders = ["At", "Who", "Action", "Wallet", "Amount", "Reference", "Previous state", "New state"]

/**
 * What happened to the money, and who did it.
 *
 * Every wallet command already writes an audit entry — a receipt, a transfer, a limit change, a
 * wallet being opened — so this page is the readable form of that record rather than a second log.
 * Cash receipts open into the items they settled, because "who took the cash and what did it pay"
 * is the question an administrator actually asks.
 */
export function WalletActivity({ ctx }: { ctx: WalletCtx }) {
  const { data } = ctx
  const [q, setQ] = useState("")
  const [actor, setActor] = useState("All")
  const [action, setAction] = useState("All")
  const [wallet, setWallet] = useState("All")
  const [selected, setSelected] = useState<WalletAuditLog | null>(null)

  const visibleIds = useMemo(() => new Set(ctx.wallets.map((w) => w.id)), [ctx.wallets])
  const all = useMemo(
    () => data.audit.filter((entry) => !entry.walletId || visibleIds.has(entry.walletId)),
    [data.audit, visibleIds],
  )
  const actors = useMemo(() => [...new Set(all.map((entry) => entry.actor))].sort(), [all])
  const actions = useMemo(() => [...new Set(all.map((entry) => entry.action))].sort(), [all])

  const rows = all.filter(
    (entry) =>
      (actor === "All" || entry.actor === actor) &&
      (action === "All" || entry.action === action) &&
      (wallet === "All" || entry.walletId === wallet) &&
      (!q || [entry.actor, entry.action, entry.reference ?? "", entry.walletName ?? ""].some((value) => value.toLowerCase().includes(q.toLowerCase()))),
  )

  const receipt = selected ? data.receipts.find((item) => item.reference === selected.reference) : undefined
  const canExport = ctx.walletsWith("wallet.export").length > 0

  return (
    <>
      <SectionHeader
        eyebrow="WALLET"
        title="Activity"
        description="Who moved or received money, when, and what changed. Entries are never edited or deleted."
        actions={
          canExport && (
            <ExportButtons
              disabled={!rows.length}
              onCsv={() => {
                downloadCsv("wallet-activity", auditHeaders, rows.map(auditRow))
                ctx.notify("CSV exported")
              }}
              onPdf={() => printTable("Wallet activity", auditHeaders, rows.map(auditRow))}
            />
          )
        }
      />
      <Panel>
        <div className="table-toolbar management-filter-bar">
          <SearchInput value={q} onChange={setQ} placeholder="Search who, what or reference…" />
          <div className="toolbar-right" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <select aria-label="Who" value={actor} onChange={(event) => setActor(event.target.value)}>
              <option value="All">Anyone</option>
              {actors.map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
            <select aria-label="Action" value={action} onChange={(event) => setAction(event.target.value)}>
              <option value="All">Any action</option>
              {actions.map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
            <select aria-label="Wallet" value={wallet} onChange={(event) => setWallet(event.target.value)}>
              <option value="All">All wallets</option>
              {ctx.wallets.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <PagedTable
          rows={rows}
          rowKey={(entry) => entry.id}
          pageSize={12}
          onRowClick={setSelected}
          emptyText="No activity matches these filters."
          columns={[
            { id: "at", header: "When", render: (entry) => fmtDate(entry.at) },
            { id: "who", header: "Who", render: (entry) => <b>{entry.actor}</b> },
            { id: "what", header: "Action", render: (entry) => entry.action },
            { id: "wallet", header: "Wallet", render: (entry) => entry.walletName ?? "—" },
            { id: "amount", header: "Amount", render: (entry) => (entry.amount === undefined ? "—" : money(entry.amount)) },
            { id: "ref", header: "Reference", render: (entry) => entry.reference ?? "—" },
          ]}
        />
      </Panel>

      {selected && (
        <Modal title="Activity detail" onClose={() => setSelected(null)} wide>
          <KV
            cols={2}
            items={[
              ["When", new Date(selected.at).toLocaleString("en-GB")],
              ["Who", selected.actor],
              ["Action", selected.action],
              ["Wallet", selected.walletName ?? "—"],
              ["Amount", selected.amount === undefined ? "—" : money(selected.amount)],
              ["Reference", selected.reference ?? "—"],
              ["Before", selected.previousState ?? "—"],
              ["After", selected.newState ?? "—"],
            ]}
          />
          {receipt && (
            <div style={{ marginTop: 14 }}>
              <b style={{ fontSize: 13 }}>Cash receipt — {receipt.memberName}</b>
              <ul className="person-list" style={{ marginTop: 6 }}>
                {receipt.items.map((item) => (
                  <li key={`${item.kind}-${item.id}`}>
                    <div className="person-line">
                      <span className="person-name">{item.label}</span>
                      <span className="person-metric">{money(item.amount)}</span>
                    </div>
                  </li>
                ))}
              </ul>
              <p className="contribution-hint">
                {money(receipt.amount)} received by {receipt.receivedBy} · {money(receipt.settled)} settled
                {receipt.amount > receipt.settled ? ` · ${money(receipt.amount - receipt.settled)} kept as the member's change` : ""}.
              </p>
            </div>
          )}
        </Modal>
      )}
    </>
  )
}

export default WalletActivity
