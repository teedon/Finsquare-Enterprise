import { walletServiceFor, type Mode } from "./wallet.service"
import { round2, settledOf } from "../domain/cash.rules"
import type { CashDepositInput, CashReceipt, CashReceiptInput } from "../types/cash.types"
import type { Actor } from "../types/wallet.types"

/**
 * Cash at the counter.
 *
 * The only way cash enters or leaves the books, so the rules live here rather than in a payment
 * screen: what was received is credited to the member's wallet, what the receipt settles is debited
 * from it, and the difference is a cash balance the community holds until it is banked. The ledger
 * work itself is `WalletService` (member wallet, cash wallet, audit); this service validates the
 * command and is what a backend endpoint should replace one-for-one.
 */
export class CashService {
  constructor(private walletFor: typeof walletServiceFor = walletServiceFor) {}

  /** Takes cash for what a member owes. `amount` is what they handed over. */
  async receive(organizationId: string, input: CashReceiptInput, actor: Actor, mode: Mode): Promise<CashReceipt> {
    if (!(input.amount > 0)) throw new Error("Enter the amount of cash received.")
    const items = input.items
      .map((item) => ({ ...item, amount: round2(item.amount) }))
      .filter((item) => item.amount > 0)
    const settled = settledOf(items)
    if (settled > round2(input.amount)) throw new Error("The receipt cannot settle more than the cash received.")
    return this.walletFor(organizationId).receiveCash({ ...input, amount: round2(input.amount), items }, actor, mode)
  }

  /** Banks cash that is already in the drawer. */
  async depositToBank(organizationId: string, input: CashDepositInput, actor: Actor, mode: Mode) {
    if (!(input.amount > 0)) throw new Error("Enter the amount deposited.")
    if (!input.bankReference.trim()) throw new Error("Enter the bank's reference for the deposit.")
    return this.walletFor(organizationId).depositCash(
      { ...input, amount: round2(input.amount), bankReference: input.bankReference.trim() },
      actor,
      mode,
    )
  }
}

export const cashService = new CashService()
