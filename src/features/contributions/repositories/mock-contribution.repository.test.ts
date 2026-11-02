import { describe, expect, it, vi } from "vitest"
import { buildContributionDataset } from "../mocks/contributions.mock"
import { createMockContributionRepository } from "./mock-contribution.repository"

describe("mock contribution repository", () => {
  it("returns a dataset scoped to the requested organization", async () => {
    const repository = createMockContributionRepository(buildContributionDataset())
    const dataset = await repository.load("org-lagos-farmers")

    expect(dataset.contributions.length).toBeGreaterThan(0)
    expect(dataset.contributions.every((row) => row.organizationId === "org-lagos-farmers")).toBe(true)
    expect(dataset.transactions.every((row) => row.organizationId === "org-lagos-farmers")).toBe(true)
  })

  it("returns nothing for another organization", async () => {
    const repository = createMockContributionRepository()
    const dataset = await repository.load("org-somebody-else")

    expect(dataset.contributions).toEqual([])
    expect(dataset.participants).toEqual([])
    expect(dataset.transactions).toEqual([])
  })

  it("applies commands and notifies subscribers", async () => {
    const repository = createMockContributionRepository()
    const listener = vi.fn()
    const unsubscribe = repository.subscribe(listener)

    const before = await repository.load("org-lagos-farmers")
    const plan = { ...buildContributionDataset().contributions[0], id: "plan-test", name: "Test Plan" }
    await repository.createPlan("org-lagos-farmers", plan, [], [])

    expect(listener).toHaveBeenCalledTimes(1)
    const after = await repository.load("org-lagos-farmers")
    expect(after.contributions.some((c) => c.id === "plan-test")).toBe(true)
    // Collections not touched by the command are preserved.
    expect(after.transactions).toHaveLength(before.transactions.length)

    unsubscribe()
    await repository.setPlanStatus("org-lagos-farmers", "plan-test", "Paused")
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it("keeps instances isolated so tests do not leak state", async () => {
    const first = createMockContributionRepository()
    const second = createMockContributionRepository()

    const plan = { ...buildContributionDataset().contributions[0], id: "plan-isolated" }
    await first.createPlan("org-lagos-farmers", plan, [], [])

    const [a, b] = await Promise.all([first.load("org-lagos-farmers"), second.load("org-lagos-farmers")])
    expect(a.contributions.some((c) => c.id === "plan-isolated")).toBe(true)
    expect(b.contributions.some((c) => c.id === "plan-isolated")).toBe(false)
  })
})

