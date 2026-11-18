import type {
  Administrator,
  Branch,
  CreateBranchInput,
  Group,
  Member,
  UpdateBranchInput,
} from "@/types"

export interface BranchRepository {
  getBranches(organizationId: string): Promise<Branch[]>
  getBranch(organizationId: string, id: string): Promise<Branch | null>
  createBranch(
    organizationId: string,
    input: CreateBranchInput,
  ): Promise<Branch>
  updateBranch(
    organizationId: string,
    id: string,
    input: UpdateBranchInput,
  ): Promise<Branch>
  deleteBranch(organizationId: string, id: string): Promise<void>
  archiveBranch(organizationId: string, id: string): Promise<Branch>
  activateBranch(organizationId: string, id: string): Promise<Branch>
  getBranchMembers(organizationId: string, id: string): Promise<Member[]>
  addBranchMember(organizationId: string, id: string, memberId: string): Promise<void>
  removeBranchMember(
    organizationId: string,
    id: string,
    memberId: string,
  ): Promise<void>
  getBranchGroups(organizationId: string, id: string): Promise<Group[]>
  getBranchAdministrators(
    organizationId: string,
    id: string,
  ): Promise<Administrator[]>
}
