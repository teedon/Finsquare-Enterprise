import { beforeEach, describe, expect, it, vi } from "vitest"

const { get, post, patch } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
}))

vi.mock("@/services/api", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@/services/api")
  return {
    endpoints: actual.endpoints,
    apiClient: { get, post, patch, put: vi.fn(), delete: vi.fn() },
  }
})

import { ApiDuesRepository } from "./api-dues.repository"
import type { CreateDuesPlanInput, DuesDataset, MutationContext } from "../types/dues.types"

const dataset: DuesDataset = { plans: [], participants: [], charges: [], transactions: [] }
const ctx: MutationContext = { actor: { id: "admin-1", name: "Ada Obi" }, mode: "live" }

const planInput: CreateDuesPlanInput = {
  name: "Welfare Dues",
  amount: 1000,
  frequency: "Monthly",
  startDate: "2026-01-01",
  scope: "Selected",
  roster: [{ memberId: "member-1", memberName: "Amina Yusuf", phone: "08000000000" }],
  lien: { enabled: true, graceDays: 5, autoRecover: true },
}

describe("ApiDuesRepository", () => {
  const repository = new ApiDuesRepository()

  beforeEach(() => {
    get.mockReset()
    post.mockReset()
    patch.mockReset()
  })

  it("loads the workspace dataset", async () => {
    get.mockResolvedValue(dataset)
    await expect(repository.load("org-1")).resolves.toBe(dataset)
    expect(get).toHaveBeenCalledWith("/organizations/org-1/dues")
  })

  it("creates a plan through the named command endpoint", async () => {
    post.mockResolvedValue({ plan: { id: "dues-1", name: "Welfare Dues" }, dataset })
    const result = await repository.createPlan("org-1", planInput, ctx)

    expect(post).toHaveBeenCalledWith(
      "/organizations/org-1/dues/plans",
      expect.objectContaining({
        name: "Welfare Dues",
        amount: 1000,
        roster: [{ memberId: "member-1", memberName: "Amina Yusuf", phone: "08000000000" }],
      }),
    )
    expect(result.plan?.id).toBe("dues-1")
    expect(result.dataset).toBe(dataset)
  })

  it("changes a plan's status and lien rules through their own endpoints", async () => {
    patch.mockResolvedValue({ plan: { id: "dues-1" }, dataset })

    await repository.setPlanStatus("org-1", "dues-1", "Paused", ctx)
    expect(patch).toHaveBeenCalledWith("/organizations/org-1/dues/plans/dues-1/status", {
      status: "Paused",
    })

    const lien = { enabled: false, graceDays: 0, autoRecover: false }
    await repository.updateLienRules("org-1", "dues-1", lien, ctx)
    expect(patch).toHaveBeenCalledWith("/organizations/org-1/dues/plans/dues-1/lien", lien)
  })

  it("records a payment and forwards the money-movement mode", async () => {
    post.mockResolvedValue({ transaction: { id: "dtx-1" }, dataset })
    const result = await repository.recordPayment(
      "org-1",
      { duesPlanId: "dues-1", participantId: "p-1", amount: 500, method: "wallet" },
      { ...ctx, mode: "simulated" },
    )

    expect(post).toHaveBeenCalledWith("/organizations/org-1/dues/plans/dues-1/payments", {
      participantId: "p-1",
      amount: 500,
      method: "wallet",
      chargeId: undefined,
      note: undefined,
      mode: "simulated",
    })
    expect(result.transaction?.id).toBe("dtx-1")
  })

  it("runs recovery for one plan and member", async () => {
    post.mockResolvedValue({
      result: { recovered: 500, chargesSettled: 1, membersTouched: 1, skipped: 0 },
      dataset,
    })
    const result = await repository.runRecovery(
      "org-1",
      { planId: "dues-1", memberId: "member-1" },
      ctx,
    )

    expect(post).toHaveBeenCalledWith("/organizations/org-1/dues/recover", {
      planId: "dues-1",
      memberId: "member-1",
      mode: "live",
    })
    expect(result.result.recovered).toBe(500)
  })
})
