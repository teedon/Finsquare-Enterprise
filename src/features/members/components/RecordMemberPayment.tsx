import { useMemo, useState } from "react"
import { Badge } from "@/components/ui"
import { ActionModal, KV, TextArea, fmtDate, money } from "@/features/loans/components/LoanUi"
import type { MemberObligation } from "../domain/member-obligations"
import type { MemberPaymentMethod, MemberPaymentResult } from "../services/member-payments.service"

const METHODS: { id: MemberPaymentMethod; label: string; hint: string }[] = [
  { id: "wallet", label: "Member wallet", hint: "Debits the member's own balance" },
  { id: "cash", label: "Cash", hint: "Received at the counter — kept as cash on hand" },
  { id: "bank_transfer", label: "Bank transfer", hint: "Confirmed in the bank account" },
]

const round2 = (value: number) => Math.round(value * 100) / 100

/** Paying everything outstanding is a real collection workflow, so it is one option in the same list. */
const SETTLE_ALL = "*"

/**
 * Takes money from a member against one thing they owe.
 *
 * The member can have dozens of outstanding periods, so listing them all with an input each buried
 * the two real decisions — what is being paid, and how — under a wall of identical rows. One
 * selector chooses the target and shows its detail, then a single amount is confirmed. Everything
 * outstanding stays reachable as the last option rather than as thirty rows.
 */
export function RecordMemberPayment({
  memberName,
  obligations,
  walletBalance,
  hasWallet,
  mode,
  canTakeCash,
  pay,
  onClose,
  notify,
}: {
  memberName: string
  obligations: MemberObligation[]
  walletBalance: number
  hasWallet: boolean
  mode: "live" | "simulated" | "blocked"
  /** Cash is money the administrator keeps, so it needs `wallet.cash` on top of the payment permission. */
  canTakeCash: boolean
  pay: (payment: {
    memberName: string
    items: { obligation: MemberObligation; amount: number }[]
    method: MemberPaymentMethod
    cashReceived?: number
    pin?: string
    note?: string
  }) => Promise<MemberPaymentResult>
  onClose: () => void
  notify: (message: string) => void
}) {
  const totalDue = useMemo(() => round2(obligations.reduce((sum, item) => sum + item.outstanding, 0)), [obligations])
  const [targetId, setTargetId] = useState(() => obligations[0]?.id ?? SETTLE_ALL)
  const [amount, setAmount] = useState(() => round2(obligations[0]?.outstanding ?? 0))
  const [method, setMethod] = useState<MemberPaymentMethod>(
    hasWallet && walletBalance > 0 ? "wallet" : canTakeCash ? "cash" : "bank_transfer",
  )
  const [note, setNote] = useState("")
  const [cashInput, setCashInput] = useState("")
  const [pin, setPin] = useState("")
  const [error, setError] = useState<string | null>(null)

  const settlingAll = targetId === SETTLE_ALL
  const selected = obligations.find((item) => item.id === targetId)
  const unsettled = obligations.filter((item) => item.outstanding > 0)
  const total = settlingAll ? totalDue : round2(amount)
  // Cash is counted, not typed to match: the member may hand over more than the amount being applied,
  // and the difference becomes their balance rather than an adjustment to the obligation.
  const cashHanded = cashInput.trim() === "" ? total : round2(Number(cashInput) || 0)
  const change = method === "cash" ? round2(cashHanded - total) : 0
  const overWallet = method === "wallet" && total > walletBalance
  const blocked = mode === "blocked"

  const choose = (id: string) => {
    setTargetId(id)
    setAmount(id === SETTLE_ALL ? totalDue : round2(obligations.find((item) => item.id === id)?.outstanding ?? 0))
    setCashInput("")
    setError(null)
  }

  // `ActionModal` closes once `onSubmit` resolves, so a validation failure has to reject —
  // otherwise the error flashes and the modal disappears, taking the entered amount with it.
  const fail = (message: string): never => {
    setError(message)
    throw new Error(message)
  }

  const submit = async () => {
    if (total <= 0) fail("Enter an amount greater than zero.")
    if (overWallet) fail(`That is more than the ${money(walletBalance)} in the member's wallet.`)
    if (method === "cash" && cashHanded < total) {
      fail(`The member handed over ${money(cashHanded)} but ${money(total)} is being applied.`)
    }
    const items = settlingAll
      ? unsettled.map((item) => ({ obligation: item, amount: item.outstanding }))
      : selected
        ? [{ obligation: selected, amount: round2(amount) }]
        : []
    const includesLoan = items.some(({ obligation }) => obligation.kind === "Loan repayment")
    if (includesLoan && !/^\d{4}$/.test(pin.trim())) fail("Enter your 4-digit wallet PIN to record a loan repayment.")
    try {
      const result = await pay({
        memberName,
        items,
        method,
        cashReceived: method === "cash" ? cashHanded : undefined,
        pin: includesLoan ? pin.trim() : undefined,
        note: note || undefined,
      })
      if (result.cashReceipt) {
        const kept = round2(result.cashReceipt.amount - result.cashReceipt.settled)
        notify(
          `${money(result.cashReceipt.amount)} cash received by ${result.cashReceipt.receivedBy} — receipt ${result.cashReceipt.reference}` +
            (kept > 0 ? `. ${money(kept)} kept as the member's balance.` : ""),
        )
      } else if (method === "cash" && !result.cashTracked) {
        // The payment is recorded; the cash ledger is not connected. Say which half is missing
        // rather than implying the drawer and the books agree.
        notify(`${money(result.total)} recorded. Cash tracking is not connected to the backend yet.`)
      } else {
        notify(
          `${money(result.total)} recorded for ${memberName} across ${result.recorded} ${
            result.recorded === 1 ? "item" : "items"
          }`,
        )
      }
    } catch (reason) {
      fail(reason instanceof Error ? reason.message : "The payment could not be recorded.")
    }
  }

  const targetTitle = settlingAll ? "Everything outstanding" : selected?.title ?? ""
  const targetDetail = settlingAll
    ? `${unsettled.length} ${unsettled.length === 1 ? "item" : "items"} — each settled in full`
    : selected
      ? `${selected.detail} · due ${fmtDate(selected.dueDate)}${selected.paid > 0 ? ` · ${money(selected.paid)} already paid` : ""}`
      : ""

  return (
    <ActionModal
      title={`Record payment — ${memberName}`}
      onClose={onClose}
      onSubmit={submit}
      submitLabel={total > 0 ? `Record ${money(total)}` : "Record payment"}
      disabled={total <= 0 || blocked}
      wide
    >
      <KV
        cols={2}
        items={[
          ["Outstanding", money(totalDue)],
          ["Member wallet", hasWallet ? money(walletBalance) : "No wallet yet"],
        ]}
      />

      {obligations.length === 0 ? (
        <p className="contribution-hint">This member has nothing due. Contributions, dues and loan instalments appear here as they fall due.</p>
      ) : (
        <>
          <label className="field">
            <span>Which payment is this for?</span>
            <select value={targetId} onChange={(event) => choose(event.target.value)}>
              {obligations.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title} — {money(item.outstanding)} · due {fmtDate(item.dueDate)}
                  {item.overdue ? " · overdue" : ""}
                </option>
              ))}
              <option value={SETTLE_ALL}>Everything outstanding — {money(totalDue)}</option>
            </select>
          </label>

          <div className="payment-target">
            <span className="payment-target-what">
              <b>{targetTitle}</b>
              <small>{targetDetail}</small>
            </span>
            {selected?.overdue && <Badge tone="red">Overdue</Badge>}
          </div>

          <label className={settlingAll ? "field" : "field field-lead"}>
            <span>{settlingAll ? "Total being paid" : "Amount being paid"}</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={settlingAll ? totalDue : amount}
              disabled={settlingAll}
              onChange={(event) => setAmount(Number(event.target.value) || 0)}
            />
          </label>

          <div className="create-question">
            <span className="create-q">How was it paid?</span>
            <div className="create-methods">
              {METHODS.map((option) => (
                <label key={option.id}>
                  <input
                    type="radio"
                    name="member-payment-method"
                    checked={method === option.id}
                    disabled={
                      (option.id === "wallet" && (!hasWallet || walletBalance <= 0)) ||
                      (option.id === "cash" && !canTakeCash)
                    }
                    onChange={() => setMethod(option.id)}
                  />
                  {option.label}
                  <small>{option.id === "cash" && !canTakeCash ? "Your role cannot receive cash" : option.hint}</small>
                </label>
              ))}
            </div>
          </div>

          {method === "cash" && (
            <>
              <label className="field field-lead">
                <span>Cash received</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={cashInput}
                  placeholder={String(total)}
                  onChange={(event) => setCashInput(event.target.value)}
                />
              </label>
              <p className="contribution-hint">
                {change > 0
                  ? `${money(total)} settles this payment. ${money(change)} stays as the member's wallet balance.`
                  : change < 0
                    ? `That is ${money(Math.abs(change))} less than the amount being applied.`
                    : "Counted at the counter and held as cash on hand."}
              </p>
            </>
          )}

          {(settlingAll ? unsettled : selected ? [selected] : []).some((item) => item.kind === "Loan repayment") && (
            <label className="field">
              <span>Wallet PIN</span>
              <input type="password" inputMode="numeric" autoComplete="current-password" maxLength={4} value={pin}
                placeholder="4-digit transaction PIN" onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))} />
            </label>
          )}

          <TextArea
            label="Note (optional)"
            value={note}
            onChange={setNote}
            placeholder="e.g. cash received at the Ikeja branch"
          />
        </>
      )}

      {mode !== "live" && (
        <p className="contribution-hint">
          Money movement is not enabled yet. Connect your corporate account to settle payments from a wallet.
        </p>
      )}
      {error && <p className="contribution-hint" style={{ color: "var(--red-text)" }}>{error}</p>}
    </ActionModal>
  )
}
