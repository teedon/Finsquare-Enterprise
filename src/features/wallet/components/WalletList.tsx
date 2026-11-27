import { useState } from "react"
import { useWalletBranches } from "../hooks/useBranches"
import { Badge, Button, Field, SectionHeader, SelectField } from "@/components/ui"
import { ActionModal, KV, NumField, PagedTable, Panel, Tabs, fmtDate } from "@/features/loans/components/LoanUi"
import { createWalletSchema, firstError } from "../schemas/wallet.schema"
import { WALLET_TYPES, type Wallet, type WalletType } from "../types/wallet.types"
import FundWallet from "./FundWallet"
import TransferModal from "./TransferModal"
import WalletCard from "./WalletCard"
import { isMemberWallet } from "../domain/wallet.rules"
import { EntitySelectField } from "@/features/organization/components/EntitySelectField"
import { Drawer, TxStatusBadge, WalletStatusBadge, balanceOf, money, type WalletCtx } from "./WalletShell"

export function WalletList({ ctx }: { ctx: WalletCtx }) {
  const [create, setCreate] = useState(false)
  const [fund, setFund] = useState<string | null>(null)
  const [transfer, setTransfer] = useState<string | null>(null)
  const selected = ctx.wallets.find((w) => w.id === ctx.id)
  const canManage = ctx.can("wallet.manage")
  // Member wallets are a different kind of money (one member's own) and have their own screen.
  const branchWallets = ctx.wallets.filter((w) => !isMemberWallet(w) && w.type !== "Main Organization")
  return (
    <>
      <SectionHeader eyebrow="WALLET" title="Branch wallets" description="Each branch has its own wallet and account number. The main wallet is on the Wallet page."
        actions={canManage && <Button onClick={() => setCreate(true)}>Create wallet</Button>} />
      <div className="wallet-grid">
        {branchWallets.map((w) => <WalletCard key={w.id} wallet={w} ctx={ctx} onClick={() => ctx.navigate("wallets", w.id)} />)}
        {!branchWallets.length && <div className="tab-empty"><b>No wallets available</b><span>You have not been granted access to any wallet.</span></div>}
      </div>
      {selected && <WalletDrawer wallet={selected} ctx={ctx} onClose={() => ctx.navigate("wallets")} onFund={() => setFund(selected.id)} onTransfer={() => setTransfer(selected.id)} />}
      {create && <CreateWalletModal ctx={ctx} onClose={() => setCreate(false)} />}
      {fund && <FundWallet ctx={ctx} walletId={fund} onClose={() => setFund(null)} />}
      {transfer && <TransferModal ctx={ctx} fromId={transfer} onClose={() => setTransfer(null)} />}
    </>
  )
}

function WalletDrawer({ wallet: w, ctx, onClose, onFund, onTransfer }: { wallet: Wallet; ctx: WalletCtx; onClose: () => void; onFund: () => void; onTransfer: () => void }) {
  const [tab, setTab] = useState<"details" | "limits" | "activity">("details")
  const canTx = ctx.canOn(w, "wallet.view_transactions")
  const txs = ctx.data.transactions.filter((t) => t.walletId === w.id).slice(0, 12)
  const grants = ctx.data.access.filter((a) => a.walletId === w.id || a.walletId === "*")
  const setStatus = (s: Wallet["status"]) => ctx.service.setStatus(w.id, s, ctx.actor).then(() => ctx.notify(`${w.name} is now ${s}`))
  return (
    <Drawer title={w.name} subtitle={`${w.type}${w.branchName ? ` · ${w.branchName}` : ""}`} onClose={onClose} wide>
      <div className="wallet-hero"><span>Available balance</span><b>{balanceOf(ctx, w)}</b><WalletStatusBadge status={w.status} /></div>
      <div style={{ display: "flex", gap: 8, margin: "12px 0" }}>
        {ctx.canOn(w, "wallet.fund") && <Button variant="secondary" onClick={onFund}>Fund</Button>}
        {ctx.canOn(w, "wallet.transfer") && <Button variant="secondary" onClick={onTransfer}>Transfer</Button>}
        {ctx.can("wallet.manage") && w.status !== "closed" && (w.status === "active"
          ? <Button variant="ghost" onClick={() => setStatus("restricted")}>Restrict</Button>
          : <Button variant="ghost" onClick={() => setStatus("active")}>Reactivate</Button>)}
        {ctx.can("wallet.manage") && w.status !== "closed" && w.status !== "suspended" && <Button variant="ghost" onClick={() => setStatus("suspended")}>Suspend</Button>}
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: "details", label: "Details" }, { id: "limits", label: "Limits" }, { id: "activity", label: "Activity" }]} />
      <div style={{ paddingTop: 12 }}>
        {tab === "details" && (
          <>
            <KV items={[["Account number", w.accountNumber], ["Bank", w.bankName], ["Scope", w.scope === "branch" ? `Branch — ${w.branchName ?? ""}` : "Organization"], ["Currency", w.currency], ["Pending", balanceOf(ctx, w, w.pendingBalance)], ["Created", fmtDate(w.createdAt)]]} />
            <p style={{ color: "var(--muted)", fontSize: 13 }}>{w.description || "No description."}</p>
            <h4 style={{ margin: "14px 0 6px", fontSize: 13 }}>Who has access</h4>
            {grants.map((g) => <div key={g.id} className="wallet-row"><div><b>{g.subjectName}</b><small>{g.subjectType} · {g.permissions.length} permissions{g.walletId === "*" ? " · all wallets" : ""}</small></div></div>)}
          </>
        )}
        {tab === "limits" && <KV items={[["Single transaction", money(w.limits.singleTransaction)], ["Daily transfer", money(w.limits.dailyTransfer)], ["Daily disbursement", money(w.limits.dailyDisbursement)], ["Daily funding", money(w.limits.dailyFunding)], ["Daily withdrawal", money(w.limits.dailyWithdrawal)]]} />}
        {tab === "activity" && (canTx
          ? <PagedTable rows={txs} rowKey={(t) => t.id} pageSize={6} onRowClick={(t) => ctx.navigate("wallet-transactions", t.id)} emptyText="No transactions on this wallet."
              columns={[{ id: "d", header: "Date", render: (t) => fmtDate(t.date) }, { id: "x", header: "Description", render: (t) => t.description }, { id: "a", header: "Amount", render: (t) => `${t.direction === "credit" ? "+" : "−"}${money(t.amount)}` }, { id: "s", header: "Status", render: (t) => <TxStatusBadge status={t.status} /> }]} />
          : <p style={{ color: "var(--muted)" }}>You do not have permission to view transactions on this wallet.</p>)}
      </div>
    </Drawer>
  )
}

function CreateWalletModal({ ctx, onClose }: { ctx: WalletCtx; onClose: () => void }) {
  const branches = useWalletBranches()
  const [name, setName] = useState("")
  const [type, setType] = useState<WalletType>("Operational")
  const [branchId, setBranchId] = useState(branches[0]?.id ?? "")
  const [opening, setOpening] = useState(0)
  const [description, setDescription] = useState("")
  const err = firstError(createWalletSchema.safeParse({ name, type, branchId: type === "Branch" ? branchId : undefined, openingBalance: Number.isNaN(opening) ? -1 : opening }))
  const simulatedOnly = ctx.mode !== "live"
  return (
    <ActionModal title="Create wallet" submitLabel="Create wallet" onClose={onClose} disabled={!!err}
      onSubmit={async () => {
        const branch = branches.find((b) => b.id === branchId)
        await ctx.service.createWallet({ name: name.trim(), type, branchId: type === "Branch" ? branchId : undefined, branchName: type === "Branch" ? branch?.name : undefined, description, openingBalance: simulatedOnly ? opening : 0 }, ctx.actor)
        ctx.notify(`${name} created with its own account number`)
      }}>
      <div className="form-grid">
        <Field label="Wallet name" value={name} onChange={setName} />
        <SelectField label="Type" value={type} options={WALLET_TYPES} onChange={(v) => setType(v as WalletType)} />
        {type === "Branch" && <EntitySelectField entity="branch" label="Branch" value={branchId} options={branches.map((branch) => ({ value: branch.id, label: branch.name }))} onChange={setBranchId} />}
        {simulatedOnly && <NumField label="Opening balance (₦)" value={opening} onChange={setOpening} />}
        <Field label="Description" value={description} onChange={setDescription} />
      </div>
      <p style={{ color: "var(--muted)", fontSize: 12, marginTop: 10 }}>A unique account number is issued automatically. {type === "Branch" ? "Branch wallets are scoped to their branch — administrators of other branches get no access." : "Access must be granted explicitly in Access & Controls."}{!simulatedOnly && " Live wallets start at ₦0 and are funded by bank transfer."}</p>
      {name && err && <p style={{ color: "var(--red-text)", fontSize: 12 }}>{err}</p>}
    </ActionModal>
  )
}
