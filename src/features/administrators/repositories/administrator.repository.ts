import type {
  Administrator,
  InviteAdministratorInput,
  Member,
  Role,
  UpdateAdministratorInput,
} from "@/types"

export interface AdministratorRepository {
  getAdministrators(organizationId: string): Promise<Administrator[]>
  getAdministrator(
    organizationId: string,
    id: string,
  ): Promise<Administrator | null>
  inviteAdministrator(
    organizationId: string,
    input: InviteAdministratorInput,
  ): Promise<Administrator>
  promoteMember(organizationId: string, member: Member, roleId: string): Promise<Administrator>
  updateAdministrator(
    organizationId: string,
    id: string,
    input: UpdateAdministratorInput,
  ): Promise<Administrator>
  suspendAdministrator(
    organizationId: string,
    id: string,
  ): Promise<Administrator>
  reactivateAdministrator(
    organizationId: string,
    id: string,
  ): Promise<Administrator>
  deactivateAdministrator(
    organizationId: string,
    id: string,
  ): Promise<Administrator>
  resendInvitation(organizationId: string, id: string): Promise<void>
  getRoles(organizationId: string): Promise<Role[]>
  createRole(
    organizationId: string,
    input: Pick<Role, "name" | "description" | "scope" | "permissions">,
  ): Promise<Role>
  updateRole(organizationId: string, role: Role): Promise<Role>
}
