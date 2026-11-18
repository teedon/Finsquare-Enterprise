import { useMemo, useState } from "react"
import { ActionModal, ChargeStatusBadge, NumField, TextArea } from "./DuesUi"
import { DUES_PAYMENT_METHODS, DUES_PAYMENT_METHOD_LABELS } from "../types/dues.types"
import { isAwaitingRecovery, outstandingOf } from "../domain/dues.rules"
import { fmtDate, money } from "@/features/loans/components/LoanUi"
import type { DuesCtx } from "./DuesUi"
import type { DuesLienRules, DuesPaymentMethod, DuesPlan } from "../types/dues.types"
interface ModalProps {
  ctx: DuesCtx
  plan: DuesPlan
  onClose: () => void
  notify: (message: string) => void
}
/**
 * Records a dues payment against what one participant owes.
 *
 * The amount is spread across that participant's due charges, oldest first, so a part payment and a
 * payment covering several periods both work; naming a specific charge starts there.
 */
export function RecordDuesPaymentModal({
  ctx,
  plan,
  onClose,
  notify,
  preselectedParticipantId,
  preselectedChargeId,
}: ModalProps & {
  preselectedParticipantId?: string
  preselectedChargeId?: string
}) {
  const participants = ctx.participantsFor(plan.id)
  const charges = ctx.syncedChargesFor(plan)
  const [participantId, setParticipantId] = useState(preselectedParticipantId ?? participants[0]?.id ?? "")
  const [target, setTarget] = useState(preselectedChargeId ?? "all")
  const [method, setMethod] = useState<DuesPaymentMethod>("cash")
  const [note, setNote] = useState("")
  const [error, setError] = useState<string | null>(null)
  const owed = useMemo(
    () =>
      charges
        .filter(
          (charge) =>
            charge.participantId === participantId && charge.dueDate <= ctx.today && outstandingOf(charge) > 0,
        )
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    [charges, participantId, ctx.today],
  )
  const owedTotal = owed.reduce((sum, charge) => sum + outstandingOf(charge), 0)
  const chosen = target === "all" ? undefined : owed.find((charge) => charge.id === target)
  const [amount, setAmount] = useState(() => owedTotal)
  const expected = chosen ? outstandingOf(chosen) : owedTotal
  const chooseTarget = (value: string) => {
    setTarget(value)
    const next = value === "all" ? owedTotal : outstandingOf(owed.find((charge) => charge.id === value) ?? owed[0])
    setAmount(next)
  }
  const submit = async () => {
    if (!participantId) return setError("Choose a participant.")
    if (!amount || amount <= 0) return setError("Enter an amount greater than zero.")
    try {
      const transaction = await ctx.service.recordPayment(
        ctx.organizationId,
        {
          duesPlanId: plan.id,
          participantId,
          amount,
          method,
          chargeId: chosen?.id,
          note: note || undefined,
        },
        ctx.ctx,
      )
      if (!transaction) return setError("This member has nothing due on this plan.")
      notify(`Payment of ${money(amount)} recorded for ${plan.name}`)
      ctx.retry()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The payment could not be recorded.")
    }
  }
  return (
    <ActionModal
      title="Record dues payment"
      onClose={onClose}
      onSubmit={submit}
      submitLabel="Record payment"
      disabled={!participantId || owedTotal <= 0}
    >
      <div className="form-grid">
        <label className="field span-2">
          <span>Participant</span>
          <select
            value={participantId}
            onChange={(event) => {
              setParticipantId(event.target.value)
              setTarget("all")
              setAmount(0)
            }}
          >
            <option value="">Select participant…</option>
            {participants.map((participant) => (
              <option key={participant.id} value={participant.id}>
                {participant.memberName} · {money(ctx.participantTotalsFor(participant).outstanding)} due
              </option>
            ))}
          </select>
        </label>
        <label className="field span-2">
          <span>Apply to</span>
          <select value={target} onChange={(event) => chooseTarget(event.target.value)}>
            <option value="all">All outstanding dues ({money(owedTotal)}) — oldest first</option>
            {owed.map((charge) => (
              <option key={charge.id} value={charge.id}>
                {charge.periodKey} · due {fmtDate(charge.dueDate)} · {money(outstandingOf(charge))}
              </option>
            ))}
          </select>
        </label>
        <NumField label={`Amount (up to ${money(expected)})`} value={amount} onChange={setAmount} />
        <label className="field">
          <span>Payment method</span>
          <select value={method} onChange={(event) => setMethod(event.target.value as DuesPaymentMethod)}>
            {DUES_PAYMENT_METHODS.map((option) => (
              <option key={option} value={option}>
                {DUES_PAYMENT_METHOD_LABELS[option]}
              </option>
            ))}
          </select>
        </label>
      </div>
      {owed.length > 0 && (
        <p className="contribution-hint">
          {owed.length} outstanding {owed.length === 1 ? "charge" : "charges"} · {money(owedTotal)} owed.
          {method === "wallet"
            ? " The member's wallet is debited before the payment is recorded."
            : " Recorded as received outside the system."}
        </p>
      )}
      <TextArea
        label="Note (optional)"
        value={note}
        onChange={setNote}
        placeholder="e.g. cash received at the Ikeja branch"
      />
      {ctx.mode !== "live" && (
        <p className="contribution-hint">Money movement is not enabled yet, so no money leaves the wallet.</p>
      )}
      {error && <p className="form-error">{error}</p>}
    </ActionModal>
  )
}
/** Confirms an explicit wallet recovery for the plan (or for one member of it). */
export function RecoveryConfirmModal({
  ctx,
  plan,
  onClose,
  notify,
  memberId,
  memberName,
}: ModalProps & {
  memberId?: string
  memberName?: string
}) {
  const [error, setError] = useState<string | null>(null)
  const charges = ctx.syncedChargesFor(plan)
  const recoverable = charges.filter(
    (charge) =>
      isAwaitingRecovery(charge.lienState) && outstandingOf(charge) > 0 && (!memberId || charge.memberId === memberId),
  )
  const total = recoverable.reduce((sum, charge) => sum + outstandingOf(charge), 0)
  const members = new Set(recoverable.map((charge) => charge.memberId)).size
  const submit = async () => {
    try {
      const result = await ctx.service.runLienRecovery(ctx.organizationId, ctx.ctx, {
        planId: plan.id,
        memberId,
      })
      notify(
        result.recovered > 0
          ? `${money(result.recovered)} recovered from ${result.membersTouched} wallet${result.membersTouched === 1 ? "" : "s"}`
          : "Nothing could be recovered — member wallets have no available funds.",
      )
      ctx.retry()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Recovery could not be completed.")
    }
  }
  return (
    <ActionModal
      title={memberName ? `Recover for ${memberName}` : "Recover outstanding dues"}
      onClose={onClose}
      onSubmit={submit}
      submitLabel="Recover now"
      disabled={recoverable.length === 0}
      wide
    >
      <p className="contribution-hint">
        {recoverable.length === 0
          ? "No charge is waiting on a wallet right now."
          : `${recoverable.length} ${recoverable.length === 1 ? "charge is" : "charges are"} awaiting recovery from ${members} member${members === 1 ? "" : "s"}, totalling ${money(total)}.`}
      </p>
      <p className="contribution-hint">
        Each member's wallet is debited oldest first, never more than the amount owed and never more than the wallet
        holds. Members whose wallet has no funds are left outstanding.
      </p>
      {recoverable.length > 0 && (
        <div className="rules-list">
          {recoverable.slice(0, 12).map((charge) => {
            const participant = ctx.data.participants.find((row) => row.id === charge.participantId)
            return (
              <div key={charge.id} className="person-line">
                <span>
                  <b>{participant?.memberName}</b> · {charge.periodKey} · due {fmtDate(charge.dueDate)}
                </span>
                <span>{money(outstandingOf(charge))}</span>
                <ChargeStatusBadge status={ctx.statusFor(charge, plan)} />
              </div>
            )
          })}
        </div>
      )}
      {recoverable.length > 12 && <p className="contribution-hint">{recoverable.length - 12} more not shown.</p>}
      {memberName && <p className="contribution-hint">Only {memberName}'s charges are recovered by this run.</p>}
      {error && <p className="form-error">{error}</p>}
    </ActionModal>
  )
}
/** Changes a plan's lien rules — organization-level money policy. */
export function LienRulesModal({ ctx, plan, onClose, notify }: ModalProps) {
  const [rules, setRules] = useState<DuesLienRules>(plan.lien)
  const [error, setError] = useState<string | null>(null)
  const submit = async () => {
    try {
      await ctx.service.updateLienRules(ctx.organizationId, plan.id, rules, ctx.ctx)
      notify(`Lien rules updated for ${plan.name}`)
      ctx.retry()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The rules could not be saved.")
    }
  }
  return (
    <ActionModal title="Wallet lien rules" onClose={onClose} onSubmit={submit} submitLabel="Save rules">
      <div className="form-grid">
        <label className="field span-2">
          <span>Apply a wallet lien when dues are unpaid</span>
          <select
            value={rules.enabled ? "yes" : "no"}
            onChange={(event) => setRules({ ...rules, enabled: event.target.value === "yes" })}
          >
            <option value="yes">Yes — claim the member's wallet balance</option>
            <option value="no">No — track outstanding dues only</option>
          </select>
        </label>
        <NumField
          label="Grace period (days after the due date)"
          value={rules.graceDays}
          onChange={(value) =>
            setRules({
              ...rules,
              graceDays: Math.max(0, Math.round(value || 0)),
            })
          }
        />
        <label className="field">
          <span>Collection</span>
          <select
            value={rules.autoRecover ? "auto" : "manual"}
            onChange={(event) => setRules({ ...rules, autoRecover: event.target.value === "auto" })}
          >
            <option value="auto">Automatic when the wallet has funds</option>
            <option value="manual">Only when an administrator recovers</option>
          </select>
        </label>
      </div>
      <p className="contribution-hint">
        A lien is a claim on the member's wallet, never a second ledger: money is only deducted when it is actually
        there.
      </p>
      {error && <p className="form-error">{error}</p>}
    </ActionModal>
  )
}
