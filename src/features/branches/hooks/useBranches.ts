import { useAsyncResource } from "@/hooks/useAsyncResource"
import type { CreateBranchInput, UpdateBranchInput } from "@/types"
import { branchesService } from "../services/branches.service"

export function useBranches(organizationId: string) {
  const resource = useAsyncResource(
    () => branchesService.getBranches(organizationId),
    [organizationId],
  )

  const createBranch = async (input: CreateBranchInput) => {
    const branch = await branchesService.createBranch(organizationId, input)
    resource.refresh()
    return branch
  }
  const updateBranch = async (id: string, input: UpdateBranchInput) => {
    const branch = await branchesService.updateBranch(organizationId, id, input)
    resource.refresh()
    return branch
  }
  const archiveBranch = async (id: string) => {
    await branchesService.archiveBranch(organizationId, id)
    resource.refresh()
  }
  const activateBranch = async (id: string) => {
    await branchesService.activateBranch(organizationId, id)
    resource.refresh()
  }

  return {
    ...resource,
    branches: resource.data ?? [],
    createBranch,
    updateBranch,
    archiveBranch,
    activateBranch,
  }
}

export function useBranch(organizationId: string, branchId: string) {
  const branch = useAsyncResource(
    () => branchesService.getBranch(organizationId, branchId),
    [organizationId, branchId],
  )
  const members = useAsyncResource(
    () => branchesService.getBranchMembers(organizationId, branchId),
    [organizationId, branchId],
  )
  const groups = useAsyncResource(
    () => branchesService.getBranchGroups(organizationId, branchId),
    [organizationId, branchId],
  )
  const administrators = useAsyncResource(
    () => branchesService.getBranchAdministrators(organizationId, branchId),
    [organizationId, branchId],
  )

  const addMember = async (memberId: string) => {
    await branchesService.addBranchMember(organizationId, branchId, memberId)
    members.refresh()
    branch.refresh()
  }

  const removeMember = async (memberId: string) => {
    await branchesService.removeBranchMember(organizationId, branchId, memberId)
    members.refresh()
    branch.refresh()
  }

  return {
    branch: branch.data,
    members: members.data ?? [],
    groups: groups.data ?? [],
    administrators: administrators.data ?? [],
    addMember,
    removeMember,
    status: [branch, members, groups, administrators].some(
      (resource) => resource.status === "error",
    )
      ? "error"
      : [branch, members, groups, administrators].some(
            (resource) => resource.status === "loading",
          )
        ? "loading"
        : "success",
    error:
      branch.error ?? members.error ?? groups.error ?? administrators.error,
    retry: () => {
      branch.retry()
      members.retry()
      groups.retry()
      administrators.retry()
    },
  }
}
