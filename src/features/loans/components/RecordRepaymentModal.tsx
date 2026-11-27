import { useState } from "react"
import { Field, SelectField } from "@/components/ui"
import { allocateRepayment, todayISO } from "../domain/calculations"
import { ActionModal, NumField, TextArea, money, type LoanCtx } from "./LoanUi"
import type { RepaymentMethod } from "../types/loan.types"
import { cashService } from "@/features/wallet/services/cash.service"

export function RecordRepaymentModal({ ctx, loanId, onClose }: { ctx: LoanCtx; loanId?: string; onClose: () => void }) {
  const open = ctx.data.loans.filter((l) => l.outstanding > 0 && l.status !== "Written Off")
  const [id, setId] = useState(loanId ?? open[0]?.id ?? "")
  const loan = open.find((l) => l.id === id)
  const [amount, setAmount] = useState(loan ? Math.round(loan.overdueAmount || loan.nextDueAmount) : 0)
  const [method, setMethod] = useState<RepaymentMethod>("Bank transfer")
  const [date, setDate] = useState(todayISO())
  const [reference, setReference] = useState("")
  const [note, setNote] = useState("")
  const [pin, setPin] = useState("")
  const preview = loan && amount > 0 ? allocateRepayment(loan.schedule, amount) : null
  const label = (l: (typeof open)[number]) => `${l.reference} · ${l.borrower.name}`
  const over = loan && amount > loan.outstanding
  const pinValid = pin.trim().length === 4
  return (
    <ActionModal title="Record repayment" onClose={onClose} submitLabel="Record repayment" disabled={!loan || !(amount > 0) || !!over || !pinValid}
      onSubmit={async () => {
        await ctx.service.recordRepayment({ loanId: id, amount, method, date, reference, note, pin: pin.trim() })
        if (method === "Cash" && loan) {
          await cashService.receive(ctx.data.account.organizationId, {
            memberId: loan.borrower.id,
            memberName: loan.borrower.name,
            amount,
            items: [{ kind: "Loan", id: loan.id, label: `Loan repayment ${loan.reference}`, amount }],
            note: note || undefined,
          }, ctx.actor, ctx.mode)
        }
        ctx.notify(`${money(amount)} allocated to ${loan?.reference}`)
      }}>
      <div className="form-grid">
        <SelectField label="Loan" value={loan ? label(loan) : ""} options={open.map(label)} onChange={(v) => { const l = open.find((x) => label(x) === v)!; setId(l.id); setAmount(Math.round(l.overdueAmount || l.nextDueAmount)) }} />
        <NumField label="Amount (₦)" value={amount} onChange={setAmount} />
        <SelectField label="Method" value={method} options={["Bank transfer", "Wallet debit", "Cash", "Direct debit", "POS/manual"]} onChange={(v) => setMethod(v as RepaymentMethod)} />
        <Field label="Payment date" type="date" value={date} onChange={setDate} />
        <Field label="Reference (optional)" value={reference} onChange={setReference} />
        <Field label="Wallet PIN" type="password" value={pin} placeholder="4-digit transaction PIN" onChange={setPin} />
        <TextArea label="Note" value={note} onChange={setNote} />
      </div>
      {loan && (
        <div className="blocked-note" style={{ background: "var(--surface-soft)", borderColor: "var(--line)" }}>
          <span style={{ color: "var(--ink)" }}>
            Outstanding {money(loan.outstanding)} · Overdue {money(loan.overdueAmount)}.{" "}
            {over ? <b style={{ color: "var(--red-text)" }}>Amount exceeds the outstanding balance.</b> : preview && <>Allocation: {preview.allocation.map((a) => `#${a.no} ${money(a.amount)}`).join(", ") || "—"}</>}
          </span>
        </div>
      )}
    </ActionModal>
  )
}
