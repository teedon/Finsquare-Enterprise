import { describe, expect, it, vi } from "vitest"
import { MemberPaymentsService } from "./member-payments.service"
import type { MemberObligation } from "../domain/member-obligations"
import type { CashReceipt } from "@/features/wallet/types/cash.types"

const ctx = { actor: { id: "admin-1", name: "Taiwo Akinyemi" }, mode: "live" as const }

const duesObligation: MemberObligation = {
  id: "dues-plan-1",
  kind: "Dues",
  title: "Weekly dues",
  detail: "Week of 20 Nov",
  dueDate: "2026-11-20",
  amount: 2_000,
  paid: 0,
  outstanding: 2_000,
  overdue: false,
  participantId: "participant-1",
  duesPlanId: "plan-1",
  duesChargeId: "charge-1",
}

const receipt = (over: Partial<CashReceipt> = {}): CashReceipt => ({
  id: "csh-1",
  organizationId: "org-1",
  reference: "CSH-1",
  at: "2026-11-26T10:00:00.000Z",
  memberId: "member-1",
  memberName: "Ada Obi",
  amount: 5_000,
  settled: 2_000,
  items: [{ kind: "Dues", id: "plan-1", participantId: "participant-1", label: "Weekly dues", amount: 2_000 }],
  receivedById: "admin-1",
  receivedBy: "Taiwo Akinyemi",
  cashWalletId: "w-cash",
  cashTransactionId: "tx-cash",
  memberTransactionIds: [],
  ...over,
})

function build(cash: { receive: ReturnType<typeof vi.fn> }) {
  const contributions = { recordPayment: vi.fn(async () => ({ id: "tx-contribution" })) }
  const dues = { recordPayment: vi.fn(async () => ({ id: "tx-dues" })) }
  const loans = { recordRepayment: vi.fn(async () => ({})) }
  const service = new MemberPaymentsService(
    contributions as never,
    loans as never,
    dues as never,
    cash as never,
  )
  return { service, contributions, dues, loans }
}

describe("recording a cash payment", () => {
  it("records the obligation, then hands the cash to the cash service", async () => {
    const cash = { receive: vi.fn(async () => receipt()) }
    const { service, dues } = build(cash)

    const result = await service.recordPayment(
      "org-1",
      { memberId: "member-1", memberName: "Ada Obi", method: "cash", items: [{ obligation: duesObligation, amount: 2_000 }] },
      ctx,
    )

    expect(dues.recordPayment).toHaveBeenCalledWith(
      "org-1",
      expect.objectContaining({ duesPlanId: "plan-1", amount: 2_000, method: "cash" }),
      ctx,
    )
    expect(cash.receive).toHaveBeenCalledWith(
      "org-1",
      expect.objectContaining({
        memberId: "member-1",
        amount: 2_000,
        items: [expect.objectContaining({ kind: "Dues", id: "plan-1", participantId: "participant-1", amount: 2_000 })],
      }),
      ctx.actor,
      "live",
    )
    expect(result.cashTracked).toBe(true)
    expect(result.cashReceipt?.reference).toBe("CSH-1")
  })

  it("keeps the payment when the backend has no cash ledger, and says so", async () => {
    const cash = { receive: vi.fn(async () => Promise.reject(new Error("Receiving cash is not available on the MFI backend yet."))) }
    const { service } = build(cash)

    const result = await service.recordPayment(
      "org-1",
      { memberId: "member-1", memberName: "Ada Obi", method: "cash", items: [{ obligation: duesObligation, amount: 2_000 }] },
      ctx,
    )

    expect(result.recorded).toBe(1)
    expect(result.total).toBe(2_000)
    expect(result.cashTracked).toBe(false)
    expect(result.cashError).toMatch(/not available/i)
  })

  it("does not involve the cash drawer when the money came from the wallet", async () => {
    const cash = { receive: vi.fn(async () => receipt()) }
    const { service } = build(cash)

    const result = await service.recordPayment(
      "org-1",
      { memberId: "member-1", memberName: "Ada Obi", method: "bank_transfer", items: [{ obligation: duesObligation, amount: 2_000 }] },
      ctx,
    )

    expect(cash.receive).not.toHaveBeenCalled()
    expect(result.cashTracked).toBe(true)
    expect(result.cashReceipt).toBeUndefined()
  })
})
