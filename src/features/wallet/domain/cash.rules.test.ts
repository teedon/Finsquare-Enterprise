import { describe, expect, it } from "vitest"
import { cashReference, changeOf, cashWalletOf, receivedOn, settledOf } from "./cash.rules"
import type { CashReceipt, CashReceiptItem } from "../types/cash.types"
import type { Wallet } from "../types/wallet.types"

const item = (over: Partial<CashReceiptItem> = {}): CashReceiptItem => ({
  kind: "Dues",
  id: "plan-1",
  label: "Weekly dues",
  amount: 2_000,
  ...over,
})

const wallet = (over: Partial<Wallet>): Wallet =>
  ({
    id: "w1",
    organizationId: "org-1",
    accountId: "acct-1",
    name: "Wallet",
    description: "",
    type: "Operational",
    scope: "organization",
    accountNumber: "—",
    bankName: "9PSB",
    currency: "NGN",
    status: "active",
    availableBalance: 0,
    pendingBalance: 0,
    limits: { singleTransaction: 0, dailyTransfer: 0, dailyDisbursement: 0, dailyFunding: 0, dailyWithdrawal: 0 },
    createdAt: "2026-01-01",
    ...over,
  }) as Wallet

const receipt = (over: Partial<CashReceipt> = {}): CashReceipt => ({
  id: "csh-1",
  organizationId: "org-1",
  reference: "CSH-ABC123",
  at: "2026-11-26T10:00:00.000Z",
  memberId: "m-1",
  memberName: "Ada Obi",
  amount: 5_000,
  settled: 2_000,
  items: [item()],
  receivedById: "admin-1",
  receivedBy: "Taiwo Akinyemi",
  cashWalletId: "w-cash",
  cashTransactionId: "tx-cash",
  memberTransactionIds: [],
  ...over,
})

describe("cash rules", () => {
  it("finds the cash drawer and ignores every other wallet", () => {
    const wallets = [wallet({ id: "w-main", type: "Main Organization" }), wallet({ id: "w-cash", type: "Cash" })]

    expect(cashWalletOf(wallets)?.id).toBe("w-cash")
    expect(cashWalletOf([wallet({ id: "w-main", type: "Main Organization" })])).toBeUndefined()
  })

  it("adds up what a receipt settled", () => {
    expect(settledOf([item(), item({ id: "plan-2", amount: 1_500 })])).toBe(3_500)
  })

  it("treats what is left over as the member's change", () => {
    expect(changeOf(5_000, [item()])).toBe(3_000)
    expect(changeOf(2_000, [item()])).toBe(0)
  })

  it("mints a reference the receipt can be found by", () => {
    expect(cashReference(1_700_000_000_000)).toMatch(/^CSH-[A-Z0-9]{2,6}$/)
  })

  it("only counts the receipts taken on the day", () => {
    const receipts = [receipt(), receipt({ id: "csh-2", at: "2026-11-25T10:00:00.000Z", amount: 9_000 })]

    expect(receivedOn(receipts, "2026-11-26")).toBe(5_000)
  })
})
