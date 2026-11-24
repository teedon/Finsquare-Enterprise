import { useAsyncResource } from "@/hooks/useAsyncResource"
import type {
  InviteAdministratorInput,
  Member,
  Role,
  UpdateAdministratorInput,
} from "@/types"
import { administratorsService } from "../services/administrators.service"

export function useAdministrators(organizationId: string) {
  const administrators = useAsyncResource(
    () => administratorsService.getAdministrators(organizationId),
    [organizationId],
  )
  const roles = useAsyncResource(
    () => administratorsService.getRoles(organizationId),
    [organizationId],
  )

  const refresh = () => {
    administrators.refresh()
    roles.refresh()
  }

  return {
    administrators: administrators.data ?? [],
    roles: roles.data ?? [],
    status:
      administrators.status === "error" || roles.status === "error"
        ? "error"
        : administrators.status === "loading" || roles.status === "loading"
          ? "loading"
          : "success",
    error: administrators.error ?? roles.error,
    retry: refresh,
    invite: async (input: InviteAdministratorInput) => {
      const administrator = await administratorsService.inviteAdministrator(
        organizationId,
        input,
      )
      administrators.refresh()
      return administrator
    },
    promoteMember: async (member: Member, roleId: string) => {
      const administrator = await administratorsService.promoteMember(organizationId, member, roleId)
      administrators.refresh()
      return administrator
    },
    update: async (id: string, input: UpdateAdministratorInput) => {
      const administrator = await administratorsService.updateAdministrator(
        organizationId,
        id,
        input,
      )
      administrators.refresh()
      return administrator
    },
    suspend: async (id: string) => {
      await administratorsService.suspendAdministrator(organizationId, id)
      administrators.refresh()
    },
    reactivate: async (id: string) => {
      await administratorsService.reactivateAdministrator(organizationId, id)
      administrators.refresh()
    },
    deactivate: async (id: string) => {
      await administratorsService.deactivateAdministrator(organizationId, id)
      administrators.refresh()
    },
    resendInvitation: async (id: string) => {
      await administratorsService.resendInvitation(organizationId, id)
      administrators.refresh()
    },
    updateRole: async (role: Role) => {
      await administratorsService.updateRole(organizationId, role)
      roles.refresh()
    },
    createRole: async (
      input: Pick<Role, "name" | "description" | "scope" | "permissions">,
    ) => {
      const role = await administratorsService.createRole(organizationId, input)
      roles.refresh()
      return role
    },
  }
}

export function useAdministrator(
  organizationId: string,
  administratorId: string,
) {
  return useAsyncResource(
    () =>
      administratorsService.getAdministrator(organizationId, administratorId),
    [organizationId, administratorId],
  )
}
