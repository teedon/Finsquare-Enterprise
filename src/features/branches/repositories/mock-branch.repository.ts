import { administratorsMock } from "@/features/administrators/mocks/administrators.mock"
import { groupsMock } from "@/features/groups/mocks/groups.mock"
import { membersMock } from "@/features/members/mocks/members.mock"
import { createTenantStore } from "@/lib/tenancy/tenant-store"
import { isSeedTenant } from "@/lib/tenancy/seed-tenant"
import type { Branch, CreateBranchInput, UpdateBranchInput } from "@/types"
import { wouldCreateBranchCycle } from "../schemas/branch.schema"
import { branchesMock } from "../mocks/branches.mock"
import type { BranchRepository } from "./branch.repository"

/**
 * The seeded records a branch page joins to. They belong to the seeded community, so another
 * community gets nothing here rather than a branch list belonging to somebody else — a backend joins
 * across collections within the tenant it authenticated.
 */
const seededOnly = <T>(organizationId: string, rows: T[]): T[] =>
  isSeedTenant(organizationId) ? structuredClone(rows) : []

export class MockBranchRepository implements BranchRepository {
  /** One entry per community: the seeded community has its branches, every other one starts empty. */
  private branches = createTenantStore<Branch[]>({
    seed: () => structuredClone(branchesMock),
    empty: () => [],
  })
  private branchAdministratorIds = new Map<string, string[]>(
    administratorsMock
      .flatMap((administrator) =>
        (administrator.accessScope.branchIds ?? []).map(
          (branchId) => [branchId, administrator.id] as const,
        ),
      )
      .reduce((map, [branchId, administratorId]) => {
        map.set(branchId, [...(map.get(branchId) ?? []), administratorId])
        return map
      }, new Map<string, string[]>()),
  )

  async getBranches(organizationId: string) {
    return structuredClone(
      this.branches.of(organizationId).filter(
        (branch) => branch.organizationId === organizationId,
      ),
    )
  }

  async getBranch(organizationId: string, id: string) {
    return structuredClone(
      this.branches.of(organizationId).find(
        (branch) =>
          branch.organizationId === organizationId && branch.id === id,
      ) ?? null,
    )
  }

  async createBranch(organizationId: string, input: CreateBranchInput) {
    this.assertUniqueCode(organizationId, input.code)
    if (
      input.parentBranchId &&
      !this.branches.of(organizationId).some(
        (branch) =>
          branch.organizationId === organizationId &&
          branch.id === input.parentBranchId,
      )
    ) {
      throw new Error("Parent branch not found.")
    }
    const now = new Date().toISOString()
    const branch: Branch = {
      ...input,
      id: `branch-${crypto.randomUUID()}`,
      organizationId,
      memberCount: 0,
      groupCount: 0,
      administratorCount: input.administratorIds?.length ?? 0,
      createdAt: now,
      updatedAt: now,
    }
    this.branches.of(organizationId).unshift(branch)
    this.branchAdministratorIds.set(branch.id, input.administratorIds ?? [])
    return structuredClone(branch)
  }

  async updateBranch(
    organizationId: string,
    id: string,
    input: UpdateBranchInput,
  ) {
    const branch = this.requireBranch(organizationId, id)
    if (
      input.parentBranchId !== undefined &&
      wouldCreateBranchCycle(id, input.parentBranchId, this.branches.of(organizationId))
    ) {
      throw new Error(
        "This parent would create a circular branch relationship.",
      )
    }
    if (input.code !== undefined && input.code !== branch.code) {
      this.assertUniqueCode(organizationId, input.code)
    }
    Object.assign(branch, input, { updatedAt: new Date().toISOString() })
    if (input.administratorIds) {
      this.branchAdministratorIds.set(id, input.administratorIds)
      branch.administratorCount = input.administratorIds.length
    }
    return structuredClone(branch)
  }

  async deleteBranch(organizationId: string, id: string) {
    const branch = this.requireBranch(organizationId, id)
    if (
      branch.memberCount > 0 ||
      branch.groupCount > 0 ||
      this.branches.of(organizationId).some((item) => item.parentBranchId === id)
    ) {
      throw new Error(
        "This branch contains records or child branches and should be archived.",
      )
    }
    this.branches.set(
      organizationId,
      this.branches.of(organizationId).filter((item) => item.id !== id),
    )
  }

  async archiveBranch(organizationId: string, id: string) {
    return this.updateBranch(organizationId, id, { status: "archived" })
  }

  async activateBranch(organizationId: string, id: string) {
    return this.updateBranch(organizationId, id, { status: "active" })
  }

  async getBranchMembers(organizationId: string, id: string) {
    this.requireBranch(organizationId, id)
    const ids = this.memberAssignments(organizationId, id)
    return seededOnly(organizationId, membersMock.filter((member) => ids.has(member.id)))
  }

  async addBranchMember(organizationId: string, id: string, memberId: string) {
    this.requireBranch(organizationId, id)
    this.memberAssignments(organizationId, id).add(memberId)
  }

  async removeBranchMember(organizationId: string, id: string, memberId: string) {
    this.requireBranch(organizationId, id)
    this.memberAssignments(organizationId, id).delete(memberId)
  }

  /** Lazy per-branch member assignment, seeded from the static member list for the seed tenant. */
  private memberAssignments(organizationId: string, id: string) {
    const key = `${organizationId}:${id}`
    let set = this.branchMemberIds.get(key)
    if (!set) {
      set = new Set(membersMock.filter((member) => member.branchId === id).map((member) => member.id))
      this.branchMemberIds.set(key, set)
    }
    return set
  }

  private branchMemberIds = new Map<string, Set<string>>()

  async getBranchGroups(organizationId: string, id: string) {
    this.requireBranch(organizationId, id)
    return seededOnly(organizationId, groupsMock.filter((group) => group.branchId === id))
  }

  async getBranchAdministrators(organizationId: string, id: string) {
    this.requireBranch(organizationId, id)
    return seededOnly(
      organizationId,
      administratorsMock.filter((administrator) =>
        this.branchAdministratorIds.get(id)?.includes(administrator.id),
      ),
    )
  }

  private requireBranch(organizationId: string, id: string) {
    const branch = this.branches.of(organizationId).find(
      (item) => item.organizationId === organizationId && item.id === id,
    )
    if (!branch) throw new Error("Branch not found.")
    return branch
  }

  private assertUniqueCode(organizationId: string, code?: string) {
    if (
      code &&
      this.branches.of(organizationId).some(
        (branch) =>
          branch.organizationId === organizationId &&
          branch.code?.toLowerCase() === code.toLowerCase(),
      )
    ) {
      throw new Error("A branch with this code already exists.")
    }
  }
}
