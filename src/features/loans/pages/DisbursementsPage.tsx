import { useState } from "react"
import { Button, SectionHeader } from "@/components/ui"
import { useAuthorization } from "@/features/administrators/hooks/useAuthorization"
import { loansService } from "../services/loans.service"
import { useLoans } from "../hooks/useLoans"
import { DisbursementModal } from "../components/DisbursementModal"
import { PagedTable, Panel, fmtDate } from "../components/LoanUi"
import ApprovalQueue from "@/features/wallet/components/ApprovalQueue"
import { TxStatusBadge, WalletPage, money, type WalletCtx } from "@/features/wallet/components/WalletShell"

export function DisbursementsPage(props: { navigate: WalletCtx["navigate"]; notify: WalletCtx["notify"] }) {
  return <WalletPage {...props}>{(ctx) => <Inner ctx={ctx} />}</WalletPage>
}

function Inner({ ctx }: { ctx: WalletCtx }) {
  const { data: loans } = useLoans()
  const { can } = useAuthorization()
  const [ids, setIds] = useState<string[] | null>(null)
  const ready = loans?.applications.filter((a) => ["Approved", "Offer Accepted"].includes(a.status)) ?? []
  const rows = ctx.data.transactions.filter((t) => t.type === "Loan Disbursement" && ctx.wallets.some((w) => w.id === t.walletId))
  const pendingApps = new Set(ctx.data.approvals.filter((a) => a.status === "Pending").flatMap((a) => a.items?.map((i) => i.applicationId) ?? []))
  return (
    <>
      <SectionHeader eyebrow="LOANS" title="Disbursements" description="Pay approved loans to a verified bank account or the customer’s internal wallet. Requests needing approval are completed here." />
      <Panel title="Ready to disburse" subtitle="Approved loans waiting for funds">
        <PagedTable rows={ready} rowKey={(a) => a.id} pageSize={5} emptyText="No approved loans are waiting."
          columns={[
            { id: "r", header: "Application", render: (a) => <b>{a.reference}</b> }, { id: "b", header: "Borrower", render: (a) => a.applicant.name },
            { id: "p", header: "Product", render: (a) => a.productName }, { id: "m", header: "Amount", render: (a) => money(a.approvedAmount ?? a.terms.amount) },
            { id: "x", header: "", render: (a) => pendingApps.has(a.id) ? <span style={{ color: "var(--amber-text)" }}>Awaiting approval</span> : <Button variant="secondary" disabled={!ctx.can("wallet.disburse")} onClick={() => setIds([a.id])}>Disburse</Button> },
          ]} />
      </Panel>
      <div style={{ height: 12 }} />
      <ApprovalQueue ctx={ctx} kind="Disbursement" />
      <div style={{ height: 12 }} />
      <Panel title="Disbursement transactions" subtitle="Payouts from the main wallet">
        <PagedTable rows={rows} rowKey={(t) => t.id} pageSize={6} onRowClick={(t) => ctx.navigate("wallet-transactions", t.id)}
          columns={[
            { id: "d", header: "Date", render: (t) => fmtDate(t.date) }, { id: "r", header: "Borrower", render: (t) => t.recipient },
            { id: "w", header: "Paid from", render: (t) => t.walletName }, { id: "a", header: "Amount", render: (t) => <b>{money(t.amount)}</b> },
            { id: "s", header: "Status", render: (t) => <TxStatusBadge status={t.status} /> },
          ]} />
      </Panel>
      {ids && loans && (
        <DisbursementModal apps={loans.applications.filter((a) => ids.includes(a.id))} onClose={() => setIds(null)}
          ctx={{ navigate: ctx.navigate, notify: ctx.notify, data: loans, service: loansService, can, organizationId: ctx.organizationId, actor: ctx.actor, mode: ctx.mode }} />
      )}
    </>
  )
}
