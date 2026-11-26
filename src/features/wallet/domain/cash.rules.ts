import type { CashReceipt, CashReceiptItem } from "../types/cash.types"
import type { Wallet } from "../types/wallet.types"

/** Money that has been taken at the counter and is held by the organization, not in the bank. */
export const CASH_WALLET_NAME = "Cash on hand"

export const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

export const isCashWallet = (wallet: Wallet) => wallet.type === "Cash"

/** The organization's cash drawer, if it has one. One per community. */
export const cashWalletOf = (wallets: Wallet[]) => wallets.find(isCashWallet)

/** What the receipt paid. */
export const settledOf = (items: CashReceiptItem[]) => round2(items.reduce((total, item) => total + item.amount, 0))

/** What the member handed over beyond what they owed — it stays in their wallet. */
export const changeOf = (amount: number, items: CashReceiptItem[]) => round2(amount - settledOf(items))

/** `CSH-` plus a short stamp; the backend allocates the authoritative reference. */
export const cashReference = (stamp = Date.now()) => `CSH-${stamp.toString(36).toUpperCase().slice(-6)}`

/** Cash taken today, for the "today" figure on the cash panel. */
export const receivedOn = (receipts: CashReceipt[], day = new Date().toISOString().slice(0, 10)) =>
  round2(receipts.filter((receipt) => receipt.at.slice(0, 10) === day).reduce((total, receipt) => total + receipt.amount, 0))
