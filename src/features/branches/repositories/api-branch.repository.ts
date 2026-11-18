import { apiClient, endpoints } from "@/services/api"
import { ApiError } from "@/services/api/types"
import type {
  Administrator,
  Branch,
  CreateBranchInput,
  Group,
  Member,
  UpdateBranchInput,
} from "@/types"
import { mapCustomerFields, type MfiCustomerListItem } from "../../members/domain/mfi-member"
import type { BranchRepository } from "./branch.repository"

/**
 * API-backed branch repository, wired to the MFI branch endpoints. The tenant is derived from the
 * JWT, so the organization id the repository is handed is ignored.
 */
export class ApiBranchRepository implements BranchRepository {
  async getBranches(): Promise<Branch[]> {
    return apiClient.get<Branch[]>(endpoints.branches.list)
  }

  async getBranch(_organizationId: string, id: string): Promise<Branch | null> {
    try {
      return await apiClient.get<Branch>(endpoints.branches.detail(id))
    } catch (error) {
      if (error instanceof ApiError && error.code === "not_found") return null
      throw error
    }
  }

  async createBranch(_organizationId: string, input: CreateBranchInput): Promise<Branch> {
    return apiClient.post<Branch>(endpoints.branches.list, input)
  }

  async updateBranch(
    _organizationId: string,
    id: string,
    input: UpdateBranchInput,
  ): Promise<Branch> {
    return apiClient.patch<Branch>(endpoints.branches.detail(id), input)
  }

  async deleteBranch(_organizationId: string, id: string): Promise<void> {
    await apiClient.delete(endpoints.branches.detail(id))
  }

  async archiveBranch(_organizationId: string, id: string): Promise<Branch> {
    return apiClient.post<Branch>(endpoints.branches.archive(id))
  }

  async activateBranch(_organizationId: string, id: string): Promise<Branch> {
    return apiClient.post<Branch>(endpoints.branches.activate(id))
  }

  async getBranchMembers(_organizationId: string, id: string): Promise<Member[]> {
    const items = await apiClient.get<MfiCustomerListItem[]>(endpoints.branches.members(id))
    return items.map(mapCustomerFields)
  }

  async addBranchMember(
    _organizationId: string,
    id: string,
    memberId: string,
  ): Promise<void> {
    await apiClient.post(endpoints.branches.members(id), { memberId })
  }

  async removeBranchMember(
    _organizationId: string,
    id: string,
    memberId: string,
  ): Promise<void> {
    await apiClient.delete(endpoints.branches.member(id, memberId))
  }

  async getBranchGroups(_organizationId: string, id: string): Promise<Group[]> {
    return apiClient.get<Group[]>(endpoints.branches.groups(id))
  }

  async getBranchAdministrators(_organizationId: string, id: string): Promise<Administrator[]> {
    return apiClient.get<Administrator[]>(endpoints.branches.administrators(id))
  }
}
