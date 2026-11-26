/** The obligation a cash receipt settled. */
export type CashReceiptItemKind = "Dues" | "Contribution" | "Loan"

export interface CashReceiptItem {
  kind: CashReceiptItemKind
  /** The obligation's own record: the dues plan, contribution plan or loan. */
  id: string
  /** The member's row on that obligation — the participant for dues and contributions. */
  participantId?: string
  periodKey?: string
  /** What the payment screen called it, kept so the receipt reads the same way later. */
  label: string
  amount: number
}

/**
 * Money taken at the counter.
 *
 * `amount` is what the member handed over and `items` is what it paid. Anything left over stays in
 * the member's wallet, so `settled` is stored beside them rather than derived: the receipt is a
 * historical record and must not change when the obligation is read back later.
 */
export interface CashReceipt {
  id: string
  organizationId: string
  reference: string
  at: string
  memberId: string
  memberName: string
  amount: number
  settled: number
  items: CashReceiptItem[]
  /** Who took the cash. The audit trail names this administrator for every movement it caused. */
  receivedById: string
  receivedBy: string
  note?: string
  cashWalletId: string
  cashTransactionId: string
  memberTransactionIds: string[]
  simulated?: boolean
}

export interface CashReceiptInput {
  memberId: string
  memberName: string
  amount: number
  items: CashReceiptItem[]
  note?: string
}

/** Banking cash that was received at the counter. */
export interface CashDepositInput {
  amount: number
  /** The bank's own reference for the deposit, so it can be matched on a statement. */
  bankReference: string
  note?: string
}
