import { describe, expect, it } from "vitest"
import { SEED_ORGANIZATION_ID } from "@/lib/tenancy/seed-tenant"
import { createMockWalletRepository } from "../repositories/mock-wallet.repository"
import { walletServiceFor, WalletService } from "./wallet.service"
import { CashService } from "./cash.service"

const actor = { id: "admin-taiwo", name: "Taiwo Akinyemi" }
const MEMBER = "LFC-002479"

function build(organizationId = SEED_ORGANIZATION_ID) {
  const repo = createMockWalletRepository(organizationId)
  const wallets = new WalletService(repo)
  const cash = new CashService(() => wallets)
  return { repo, wallets, cash }
}

const due = { kind: "Dues" as const, id: "plan-1", label: "Weekly dues", amount: 2_000 }

describe("receiving cash", () => {
  it("credits the member with what they handed over and debits what they owed", async () => {
    const { wallets, cash } = build()
    const before = (await wallets.load()).wallets.find((w) => w.scope === "member" && w.memberId === MEMBER)!

    const receipt = await cash.receive(
      SEED_ORGANIZATION_ID,
      { memberId: MEMBER, memberName: "Taiwo Akinyemi", amount: 5_000, items: [due] },
      actor,
      "live",
    )

    const after = await wallets.load()
    const member = after.wallets.find((w) => w.id === before.id)!
    // 5,000 in, 2,000 paid, 3,000 kept as the member's balance.
    expect(member.availableBalance).toBe(before.availableBalance + 3_000)
    expect(receipt.amount).toBe(5_000)
    expect(receipt.settled).toBe(2_000)
    expect(receipt.receivedBy).toBe("Taiwo Akinyemi")
  })

  it("holds the cash in the drawer, never in the bank wallet", async () => {
    const { wallets, cash } = build()
    const before = await wallets.load()
    const mainBefore = before.wallets.find((w) => w.type === "Main Organization")!
    const cashBefore = before.wallets.find((w) => w.type === "Cash")!

    await cash.receive(
      SEED_ORGANIZATION_ID,
      { memberId: MEMBER, memberName: "Taiwo Akinyemi", amount: 5_000, items: [due] },
      actor,
      "live",
    )

    const after = await wallets.load()
    expect(after.wallets.find((w) => w.id === mainBefore.id)!.availableBalance).toBe(mainBefore.availableBalance)
    expect(after.wallets.find((w) => w.id === cashBefore.id)!.availableBalance).toBe(cashBefore.availableBalance + 5_000)
  })

  it("writes the receipt and names who took the cash in the audit trail", async () => {
    const { wallets, cash } = build()
    const receipt = await cash.receive(
      SEED_ORGANIZATION_ID,
      { memberId: MEMBER, memberName: "Taiwo Akinyemi", amount: 5_000, items: [due], note: "Counter 2" },
      actor,
      "live",
    )

    const data = await wallets.load()
    expect(data.receipts[0].reference).toBe(receipt.reference)
    expect(data.receipts[0].note).toBe("Counter 2")
    const entries = data.audit.filter((entry) => entry.reference === receipt.reference)
    expect(entries.map((entry) => entry.action)).toEqual([
      "Cash received",
      "Cash credited to member wallet",
      "Payment settled from member wallet",
    ])
    expect(entries.every((entry) => entry.actor === "Taiwo Akinyemi")).toBe(true)
  })

  it("writes the two halves of the member's statement and the drawer's credit", async () => {
    const { wallets, cash } = build()
    const receipt = await cash.receive(
      SEED_ORGANIZATION_ID,
      { memberId: MEMBER, memberName: "Taiwo Akinyemi", amount: 5_000, items: [due] },
      actor,
      "live",
    )

    const data = await wallets.load()
    const mine = data.transactions.filter((tx) => tx.metadata.receiptId === receipt.id)
    expect(mine).toHaveLength(3)
    expect(mine.filter((tx) => tx.type === "Cash Receipt")).toHaveLength(2)
    expect(mine.filter((tx) => tx.type === "Dues" && tx.direction === "debit")).toHaveLength(1)
  })

  it("opens the drawer the first time cash is received", async () => {
    const { repo, wallets, cash } = build()
    const seeded = await wallets.load()
    await repo.commit({ wallets: seeded.wallets.filter((w) => w.type !== "Cash") })

    await cash.receive(
      SEED_ORGANIZATION_ID,
      { memberId: MEMBER, memberName: "Taiwo Akinyemi", amount: 1_000, items: [] },
      actor,
      "live",
    )

    const data = await wallets.load()
    expect(data.wallets.some((w) => w.type === "Cash")).toBe(true)
    expect(data.wallets.find((w) => w.type === "Cash")!.availableBalance).toBe(1_000)
  })

  it("refuses a receipt that settles more than the cash received", async () => {
    const { cash } = build()
    await expect(
      cash.receive(SEED_ORGANIZATION_ID, { memberId: MEMBER, memberName: "Taiwo Akinyemi", amount: 1_000, items: [due] }, actor, "live"),
    ).rejects.toThrow(/more than the cash received/i)
  })

  it("refuses to move money in a blocked environment", async () => {
    const { cash } = build()
    await expect(
      cash.receive(SEED_ORGANIZATION_ID, { memberId: MEMBER, memberName: "Taiwo Akinyemi", amount: 5_000, items: [due] }, actor, "blocked"),
    ).rejects.toThrow(/disabled/i)
  })
})

describe("depositing cash", () => {
  it("moves the money from the drawer into the bank wallet", async () => {
    const { wallets, cash } = build()
    await cash.receive(
      SEED_ORGANIZATION_ID,
      { memberId: MEMBER, memberName: "Taiwo Akinyemi", amount: 5_000, items: [due] },
      actor,
      "live",
    )
    const before = await wallets.load()
    const mainBefore = before.wallets.find((w) => w.type === "Main Organization")!.availableBalance
    const cashBefore = before.wallets.find((w) => w.type === "Cash")!.availableBalance

    const { reference } = await cash.depositToBank(
      SEED_ORGANIZATION_ID,
      { amount: 4_000, bankReference: "DEP-7781" },
      actor,
      "live",
    )

    const after = await wallets.load()
    expect(after.wallets.find((w) => w.type === "Main Organization")!.availableBalance).toBe(mainBefore + 4_000)
    expect(after.wallets.find((w) => w.type === "Cash")!.availableBalance).toBe(cashBefore - 4_000)
    expect(after.transactions.filter((tx) => tx.type === "Cash Deposit")).toHaveLength(2)
    expect(after.audit.some((entry) => entry.action === "Cash deposited to bank" && entry.reference === reference)).toBe(true)
  })

  it("will not bank more than the drawer holds", async () => {
    const { cash } = build()
    await expect(
      cash.depositToBank(SEED_ORGANIZATION_ID, { amount: 5_000, bankReference: "DEP-1" }, actor, "live"),
    ).rejects.toThrow(/held as cash/i)
  })

  it("asks for the bank's own reference", async () => {
    const { cash } = build()
    await expect(
      cash.depositToBank(SEED_ORGANIZATION_ID, { amount: 100, bankReference: "  " }, actor, "live"),
    ).rejects.toThrow(/reference/i)
  })
})

describe("cash service routing", () => {
  it("uses the tenant's wallet service", () => {
    const service = walletServiceFor(SEED_ORGANIZATION_ID)
    expect(service).toBe(walletServiceFor(SEED_ORGANIZATION_ID))
  })
})
