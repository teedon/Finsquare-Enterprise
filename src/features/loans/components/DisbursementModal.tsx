import { useState } from "react"
import { Field } from "@/components/ui"
import { calculateLoan } from "../domain/calculations"
import { ActionModal, PagedTable, money, type LoanCtx } from "./LoanUi"
import type { DisbursementMethod, LoanApplication } from "../types/loan.types"

export function DisbursementModal({ apps, ctx, onClose, onDone }: { apps: LoanApplication[]; ctx: LoanCtx; onClose: () => void; onDone?: (loanIds: string[]) => void }) {
  const method: DisbursementMethod = "Bank transfer"
  const [pin, setPin] = useState("")
  const rows = apps.map((a) => {
    const s = calculateLoan({ ...a.terms, amount: a.approvedAmount ?? a.terms.amount })
    return { a, s, dest: "Verified bank account" }
  })
  const net = rows.reduce((t, r) => t + r.s.netDisbursed, 0)
  const approved = apps.every((a) => ["Approved", "Offer Accepted"].includes(a.status))
  return (
    <ActionModal wide title={apps.length > 1 ? `Bulk disbursement (${apps.length} loans)` : "Disburse loan"} onClose={onClose} submitLabel={`Disburse ${money(net)}`}
      disabled={!approved || !/^\d{4}$/.test(pin)}
      onSubmit={async () => {
        const loans = await ctx.service.disburse(apps.map((a) => a.id), method, pin)
        ctx.notify(`${loans.length} loan(s) disbursed — repayment schedules are now active`)
        onDone?.(loans.map((l) => l.id))
      }}>
      <div className="form-grid" style={{ marginBottom: 14 }}>
        <div className="field"><span>Disbursement method</span><b>Bank transfer to the customer’s verified bank account</b></div>
        <Field label="Transaction PIN" type="password" value={pin} placeholder="4-digit transaction PIN" onChange={setPin} />
      </div>
      <div className="table-panel">
        <PagedTable rows={rows} rowKey={(r) => r.a.id} pageSize={6}
          columns={[
            { id: "b", header: "Borrower", render: (r) => <b>{r.a.applicant.name}</b> },
            { id: "m", header: "Approved", render: (r) => money(r.s.principal) },
            { id: "f", header: "Fees", render: (r) => money(r.s.fees) },
            { id: "d", header: "Deductions", render: (r) => money(r.s.deduction) },
            { id: "n", header: "Net amount", render: (r) => <b>{money(r.s.netDisbursed)}</b> },
            { id: "t", header: "Destination", render: (r) => r.dest },
          ]} />
      </div>
      <div style={{ marginTop: 12, color: "var(--muted)", fontSize: 12 }}>The backend verifies your PIN, borrower bank details and loan status before disbursing.</div>
    </ActionModal>
  )
}
