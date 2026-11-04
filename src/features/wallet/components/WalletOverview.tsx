import { useState } from "react"
import { Badge, Button, SectionHeader } from "@/components/ui"
import { ChevronRight } from "@/icons"
import { PagedTable, Panel, compactMoney, fmtDate } from "@/features/loans/components/LoanUi"
import FundWallet from "./FundWallet"
import TransferModal from "./TransferModal"
import { TxStatusBadge, WalletStatusBadge, balanceOf, money, type WalletCtx } from "./WalletShell"
import { isMemberWallet } from "../domain/wallet.rules"

export default function WalletOverview({ ctx }: { ctx: WalletCtx }) {
  const { data, wallets, navigate } = ctx
  const [modal, setModal] = useState<"fund" | "transfer" | null>(null)
  const main = wallets.find((w) => w.type === "Main Organization") ?? wallets[0]
  const branchWallets = wallets.filter((w) => !isMemberWallet(w) && w.id !== main?.id)
  const memberWalletCount = wallets.filter(isMemberWallet).length
  if (!main)
    return (
      <>
        <SectionHeader eyebrow="WALLET" title="Wallet" description="Your organization's main account. All payments are made from here." />
        <div className="tab-empty"><b>No wallet available</b><span>You have not been granted access to a wallet. Ask a Finance Manager to grant access.</span></div>
      </>
    )

  const txs = data.transactions.filter((t) => t.walletId === main.id && ctx.canOn(main, "wallet.view_transactions"))
  const thirty = Date.now() - 30 * 864e5
  const recent = txs.filter((t) => t.status === "Completed" && new Date(t.date).getTime() >= thirty)
  const moneyIn = recent.filter((t) => t.direction === "credit").reduce((s, t) => s + t.amount, 0)
  const moneyOut = recent.filter((t) => t.direction === "debit").reduce((s, t) => s + t.amount, 0)
  const pending = data.approvals.filter((a) => a.status === "Pending" && a.walletId === main.id)

  return (
    <>
      <SectionHeader eyebrow="WALLET" title="Wallet" description="Your organization's main account. All payments are made from here."
        actions={<>
          {ctx.canOn(main, "wallet.fund") && <Button variant="secondary" onClick={() => setModal("fund")}>Fund wallet</Button>}
          {ctx.canOn(main, "wallet.transfer") && <Button onClick={() => setModal("transfer")}>Transfer</Button>}
        </>} />

      <section className="wallet-main">
        <div className="wallet-main-top">
          <div>
            <span className="wallet-main-label">Available balance</span>
            <div className="wallet-main-balance">{balanceOf(ctx, main)}</div>
          </div>
          <WalletStatusBadge status={main.status} />
        </div>
        <div className="wallet-main-account">
          <div><small>Account number</small><b>{main.accountNumber}</b></div>
          <div><small>Bank</small><b>{main.bankName}</b></div>
          <div><small>Account name</small><b>{data.account.accountName}</b></div>
        </div>
        <div className="wallet-main-stats">
          <div><small>Pending</small><b>{ctx.canOn(main, "wallet.view_balance") ? compactMoney(main.pendingBalance) : "Hidden"}</b></div>
          <div><small>In · 30 days</small><b>{compactMoney(moneyIn)}</b></div>
          <div><small>Out · 30 days</small><b>{compactMoney(moneyOut)}</b></div>
        </div>
      </section>

      <div className="dashboard-grid" style={{ gridTemplateColumns: "minmax(0,1.8fr) minmax(0,1fr)", marginTop: 16 }}>
        <Panel title="Recent transactions" actions={<Button variant="ghost" onClick={() => navigate("wallet-transactions")}>View all</Button>}>
          <PagedTable rows={txs.slice(0, 5)} rowKey={(t) => t.id} pageSize={5} emptyText="No transactions yet." onRowClick={(t) => navigate("wallet-transactions", t.id)}
            columns={[
              { id: "d", header: "Date", render: (t) => fmtDate(t.date) },
              { id: "x", header: "Description", render: (t) => <b>{t.description}</b> },
              { id: "a", header: "Amount", render: (t) => <b style={{ color: t.direction === "credit" ? "var(--green-text)" : "var(--ink)" }}>{t.direction === "credit" ? "+" : "−"}{money(t.amount)}</b> },
              { id: "s", header: "Status", render: (t) => <TxStatusBadge status={t.status} /> },
            ]} />
        </Panel>
        <div className="wallet-links">
          {pending.length > 0 && (
            <button type="button" className="wallet-link" data-tone="amber" onClick={() => navigate("loan-disbursements")}>
              <div><b>{pending.length} disbursement{pending.length > 1 ? "s" : ""} awaiting approval</b><small>Review in Loans</small></div>
              <ChevronRight size={15} />
            </button>
          )}
          {branchWallets.length > 0 && (
            <button type="button" className="wallet-link" onClick={() => navigate("wallets")}>
              <div><b>Branch wallets</b><small>{branchWallets.length} wallet{branchWallets.length > 1 ? "s" : ""}</small></div>
              <ChevronRight size={15} />
            </button>
          )}
          {memberWalletCount > 0 && (
            <button type="button" className="wallet-link" onClick={() => navigate("members")}>
              <div><b>Member wallets</b><small>{memberWalletCount} member{memberWalletCount > 1 ? "s" : ""} holding their own balance — open a member</small></div>
              <ChevronRight size={15} />
            </button>
          )}
          <button type="button" className="wallet-link" onClick={() => navigate("wallet-access")}>
            <div><b>Access &amp; controls</b><small>Who can use the wallet, limits, approvals</small></div>
            <ChevronRight size={15} />
          </button>
          {main.status !== "active" && <Badge tone="amber">Wallet is {main.status}</Badge>}
        </div>
      </div>
      {modal === "fund" && <FundWallet ctx={ctx} walletId={main.id} onClose={() => setModal(null)} />}
      {modal === "transfer" && <TransferModal ctx={ctx} fromId={main.id} onClose={() => setModal(null)} />}
    </>
  )
}
