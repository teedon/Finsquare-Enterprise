import { useState } from "react"
import { Badge, Button, Field } from "@/components/ui"
import { HandCoins, Landmark } from "@/icons"
import { PublicFormPage } from "@/components/layout/PublicFormPage"
import { RecipientChip } from "./PublicContributionParts"
import { publicContributionSchema } from "../schemas/contribution.schema"
import { usePublicContribution } from "../hooks/useContributions"
import { publicLinkAvailable, frequencyLabel } from "../domain/contribution.rules"
import { money } from "@/features/loans/components/LoanUi"
import type { ContributionPaymentMethodId, PublicContributionReceipt } from "../types/contribution.types"

/**
 * Public contribution page. Anyone with the link can contribute — no FinSquare account, no
 * membership. A member's own link also names them and can pay from their wallet balance.
 * Rendered outside the app shell, like the public loan application page.
 */
export default function PublicContributionPage({ slug, memberId }: { slug: string; memberId?: string }) {
  const { contribution, participant, memberWallet, status, service } = usePublicContribution(slug, memberId)
  const [receipt, setReceipt] = useState<PublicContributionReceipt | null>(null)
  const [form, setForm] = useState({ contributorName: "", phone: "", email: "", amount: 0, method: "bank_transfer" as ContributionPaymentMethodId })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // An organisation-held pool is published by that organisation, so its account name is the only
  // identity the public payload carries. Anything else (a member or contributor recipient) names a
  // person, not the community, so it is left out rather than shown as the wrong thing.
  const community =
    contribution?.recipient.kind === "organization" && contribution.recipient.accountName
      ? { name: contribution.recipient.accountName }
      : undefined
  const page = (title: string, description?: string, body?: React.ReactNode) => (
    <PublicFormPage community={community} purpose="Contribution" title={title} description={description}>
      {body}
    </PublicFormPage>
  )

  if (status === "loading") return page("Loading…", "Fetching the contribution details.")

  // A member link works while the member is on the plan; the pool link needs the plan to be open.
  const memberLink = Boolean(participant)
  const openLink = contribution ? publicLinkAvailable(contribution) : false

  if (status === "error" || !contribution || (!memberLink && !openLink)) {
    return page(
      "This link is not active",
      "The contribution is closed or the link is incomplete. Ask the organization for a current one.",
    )
  }

  if (receipt) {
    return page(
      "Contribution recorded",
      `Your reference is ${receipt.reference} — ${money(receipt.amount)} towards ${receipt.contributionName}.`,
      <>
        <div className="public-receipt">
          <HandCoins size={22} />
          <span>
            Funds are held in <b>{receipt.recipientLabel}</b>. The organization confirms the payment once it settles.
          </span>
        </div>
        <p className="contribution-hint">Keep the reference above for your records.</p>
      </>,
    )
  }

  const submit = async () => {
    // A member link already knows who is paying, so their name comes from the plan, not the form.
    const payload = { ...form, contributorName: participant?.memberName ?? form.contributorName, slug, memberId }
    const parsed = publicContributionSchema.safeParse(payload)
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Check the details above.")
    if (form.method === "wallet" && memberWallet && form.amount > memberWallet.availableBalance) {
      return setError(`Your wallet holds ${money(memberWallet.availableBalance)}.`)
    }
    setError(null)
    setBusy(true)
    try {
      const result = await service.submitPublicContribution(payload)
      if (!result) {
        setError("This contribution is no longer accepting payments.")
        return
      }
      setReceipt(result)
    } catch {
      setError("Your contribution could not be submitted. Please try again.")
    } finally {
      setBusy(false)
    }
  }

  // A member link pays from a wallet balance, so the wallet method is offered there and only there.
  const methods = contribution.paymentMethods.filter((method) =>
    method.id === "wallet" ? memberLink && Boolean(memberWallet) : true,
  )

  return page(
    contribution.name,
    contribution.description,
    <>
      <div className="public-badges">
        <Badge tone="blue">{contribution.type}</Badge>
        <Badge tone="neutral">{frequencyLabel(contribution)}</Badge>
        {contribution.targetAmount && <Badge tone="amber">Target {money(contribution.targetAmount)}</Badge>}
      </div>

      {participant && (
        <p className="contribution-hint" style={{ marginTop: 0 }}>
          Contributing as <b>{participant.memberName}</b>
          {participant.availableBalance > 0 ? ` · ${money(participant.availableBalance)} already saved` : ""}.
        </p>
      )}

      <RecipientChip recipient={contribution.recipient} />

      <div className="form-grid">
        {participant ? (
          <Field label="Your name" value={participant.memberName} onChange={() => undefined} />
        ) : (
          <Field label="Your name" value={form.contributorName} onChange={(value) => setForm({ ...form, contributorName: value })} />
        )}
        <Field label="Phone (optional)" value={form.phone} onChange={(value) => setForm({ ...form, phone: value })} />
        <Field label="Email (optional)" value={form.email} onChange={(value) => setForm({ ...form, email: value })} />
        <label className="field">
          <span>Amount</span>
          <input type="number" min={0} value={form.amount || ""} onChange={(event) => setForm({ ...form, amount: Number(event.target.value) })} />
        </label>
        <label className="field span-2">
          <span>Payment method</span>
          <select value={form.method} onChange={(event) => setForm({ ...form, method: event.target.value as ContributionPaymentMethodId })}>
            {methods.map((method) => (
              <option key={method.id} value={method.id}>
                {method.label}
                {method.id === "wallet" && memberWallet ? ` — ${money(memberWallet.availableBalance)} available` : ""}
              </option>
            ))}
          </select>
        </label>
      </div>
      {contribution.minimumAmount ? <p className="contribution-hint">Minimum contribution {money(contribution.minimumAmount)}.</p> : null}
      {error && <p className="field-error">{error}</p>}
      <p className="contribution-hint">
        <Landmark size={13} />{" "}
        {form.method === "wallet"
          ? "Paid from your wallet balance, so it is recorded immediately."
          : "No FinSquare account is needed. The organization verifies the payment before it is credited."}
      </p>
      <div className="public-actions">
        <Button onClick={submit} disabled={busy}>{busy ? "Submitting…" : "Contribute"}</Button>
      </div>
    </>,
  )
}
