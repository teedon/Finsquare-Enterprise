import { HandCoins } from "@/icons"
import { recipientHoldsFunds, recipientLabel } from "../domain/contribution.rules"
import type { ContributionRecipient } from "../types/contribution.types"

/**
 * Where an anonymous contributor's money goes. The public page is a trust funnel,
 * so it keeps the full sentence the in-app surfaces do not need.
 */
export function RecipientChip({ recipient }: { recipient: ContributionRecipient }) {
  const held = recipientHoldsFunds(recipient)
  return (
    <div className="recipient-chip" data-held={held}>
      <HandCoins size={14} />
      <div>
        <b>{recipientLabel(recipient)}</b>
        <small>
          {held
            ? "Collected funds are held for this person and available for payout or withdrawal."
            : "Collected funds are held in the organization account."}
        </small>
      </div>
    </div>
  )
}
