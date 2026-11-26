import { useState } from "react"
import { Field } from "@/components/ui"
import { ActionModal, NumField, money } from "@/features/loans/components/LoanUi"
import { cashService } from "../services/cash.service"
import type { WalletCtx } from "./WalletShell"

/**
 * Banking cash that is already in the drawer. The bank reference is what ties the recorded deposit
 * to the slip, so it is required — the amount alone cannot be reconciled later.
 */
export default function CashDepositModal({
  ctx,
  cashBalance,
  onClose,
  onDone,
}: {
  ctx: WalletCtx
  cashBalance: number
  onClose: () => void
  onDone: (reference: string) => void
}) {
  const [amount, setAmount] = useState(NaN)
  const [bankReference, setBankReference] = useState("")
  const [error, setError] = useState<string | null>(null)
  const blocked = ctx.mode === "blocked"
  const valid = Number.isFinite(amount) && amount > 0 && amount <= cashBalance && bankReference.trim().length > 0

  return (
    <ActionModal
      title="Deposit cash to bank"
      submitLabel="Record deposit"
      onClose={onClose}
      disabled={!valid || blocked}
      onSubmit={async () => {
        try {
          const result = await cashService.depositToBank(
            ctx.organizationId,
            { amount, bankReference },
            ctx.actor,
            ctx.mode,
          )
          onDone(result.reference)
        } catch (cause) {
          const message = cause instanceof Error ? cause.message : "The deposit could not be recorded."
          setError(message)
          throw new Error(message, { cause })
        }
      }}
    >
      <p className="contribution-hint" style={{ margin: "0 0 12px" }}>
        {money(cashBalance)} is held as cash. A deposit moves it into the community&apos;s bank wallet; it does not create
        or remove money.
      </p>
      <div className="form-grid">
        <NumField label="Amount deposited (₦)" value={amount} onChange={setAmount} />
        <Field label="Bank reference" value={bankReference} onChange={setBankReference} />
      </div>
      {error && <p className="contribution-hint" style={{ color: "var(--red-text)" }}>{error}</p>}
      {blocked && (
        <p className="contribution-hint" style={{ color: "var(--red-text)" }}>
          Money movement is unavailable in this workspace.
        </p>
      )}
    </ActionModal>
  )
}
