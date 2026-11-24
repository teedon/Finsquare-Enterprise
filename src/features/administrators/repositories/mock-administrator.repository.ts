import type {
  Administrator,
  InviteAdministratorInput,
  Member,
  Role,
  UpdateAdministratorInput,
} from "@/types"
import { systemRolesFor } from "@/lib/permissions/system-roles"
import { createTenantStore } from "@/lib/tenancy/tenant-store"
import { administratorsMock } from "../mocks/administrators.mock"
import type { AdministratorRepository } from "./administrator.repository"

export class MockAdministratorRepository implements AdministratorRepository {
  /** One entry per community: the seeded community has its administrators, every other one none. */
  private administrators = createTenantStore<Administrator[]>({
    seed: () => structuredClone(administratorsMock),
    empty: () => [],
  })
  /** Only the roles a community created itself; the system roles are resolved per tenant. */
  private customRoles: Role[] = []

  async getAdministrators(organizationId: string) {
    return structuredClone(
      this.administrators.of(organizationId).filter(
        (administrator) => administrator.organizationId === organizationId,
      ),
    )
  }

  async getAdministrator(organizationId: string, id: string) {
    return structuredClone(
      this.administrators.of(organizationId).find(
        (administrator) =>
          administrator.organizationId === organizationId &&
          administrator.id === id,
      ) ?? null,
    )
  }

  async inviteAdministrator(
    organizationId: string,
    input: InviteAdministratorInput,
  ) {
    if (
      this.administrators.of(organizationId).some(
        (administrator) =>
          administrator.organizationId === organizationId &&
          administrator.email.toLowerCase() === input.email.toLowerCase(),
      )
    ) {
      throw new Error("An administrator with this email already exists.")
    }
    this.assertRoles(organizationId, input.roleIds)
    if (
      input.accessScope.type === "branch" &&
      !input.accessScope.branchIds?.length
    ) {
      throw new Error("Branch-scoped access requires at least one branch.")
    }
    const now = new Date().toISOString()
    const administrator: Administrator = {
      id: `admin-${crypto.randomUUID()}`,
      organizationId,
      userId: `invited-user-${crypto.randomUUID()}`,
      name: `${input.firstName} ${input.lastName}`,
      email: input.email,
      phone: input.phone,
      roleIds: input.roleIds,
      status: "invited",
      accessScope: input.accessScope,
      invitedAt: now,
      createdAt: now,
      updatedAt: now,
    }
    this.administrators.of(organizationId).unshift(administrator)
    return structuredClone(administrator)
  }

  async promoteMember(organizationId: string, member: Member, roleId: string) {
    if (this.administrators.of(organizationId).some((administrator) => administrator.id === member.id)) {
      throw new Error("This member is already an administrator.")
    }
    this.assertRoles(organizationId, [roleId])
    const now = new Date().toISOString()
    const administrator: Administrator = {
      id: member.id,
      organizationId,
      userId: member.id,
      name: member.name,
      email: member.email ?? "",
      phone: member.phone,
      roleIds: [roleId],
      status: "active",
      accessScope: { type: "organization", organizationId },
      createdAt: now,
      updatedAt: now,
    }
    this.administrators.of(organizationId).unshift(administrator)
    return structuredClone(administrator)
  }

  async updateAdministrator(
    organizationId: string,
    id: string,
    input: UpdateAdministratorInput,
  ) {
    const administrator = this.requireAdministrator(organizationId, id)
    if (input.roleIds) this.assertRoles(organizationId, input.roleIds)
    if (
      input.accessScope?.type === "branch" &&
      !input.accessScope.branchIds?.length
    ) {
      throw new Error("Branch-scoped access requires at least one branch.")
    }
    Object.assign(administrator, input, {
      updatedAt: new Date().toISOString(),
    })
    return structuredClone(administrator)
  }

  async suspendAdministrator(organizationId: string, id: string) {
    return this.setStatus(organizationId, id, "suspended")
  }

  async reactivateAdministrator(organizationId: string, id: string) {
    return this.setStatus(organizationId, id, "active")
  }

  async deactivateAdministrator(organizationId: string, id: string) {
    return this.setStatus(organizationId, id, "deactivated")
  }

  async resendInvitation(organizationId: string, id: string) {
    const administrator = this.requireAdministrator(organizationId, id)
    if (administrator.status !== "invited") {
      throw new Error("Only pending invitations can be resent.")
    }
    administrator.invitedAt = new Date().toISOString()
    administrator.updatedAt = administrator.invitedAt
  }

  /**
   * A community's roles are its own system roles plus anything it created. The system roles exist in
   * every community, so a membership recorded against `role-super-admin` resolves wherever it is used.
   */
  async getRoles(organizationId: string) {
    return structuredClone([
      ...systemRolesFor(organizationId),
      ...this.customRoles.filter((role) => role.organizationId === organizationId),
    ])
  }

  async createRole(
    organizationId: string,
    input: Pick<Role, "name" | "description" | "scope" | "permissions">,
  ) {
    const now = new Date().toISOString()
    const role: Role = {
      ...input,
      id: `role-${crypto.randomUUID()}`,
      organizationId,
      isSystemRole: false,
      createdAt: now,
      updatedAt: now,
    }
    this.customRoles.push(role)
    return structuredClone(role)
  }

  async updateRole(organizationId: string, role: Role) {
    if (role.isSystemRole) throw new Error("System roles cannot be changed.")
    const index = this.customRoles.findIndex(
      (item) => item.organizationId === organizationId && item.id === role.id,
    )
    if (index < 0) throw new Error("Role not found.")
    this.customRoles[index] = {
      ...role,
      updatedAt: new Date().toISOString(),
    }
    return structuredClone(this.customRoles[index])
  }

  private async setStatus(
    organizationId: string,
    id: string,
    status: Administrator["status"],
  ) {
    const administrator = this.requireAdministrator(organizationId, id)
    administrator.status = status
    administrator.updatedAt = new Date().toISOString()
    return structuredClone(administrator)
  }

  private requireAdministrator(organizationId: string, id: string) {
    const administrator = this.administrators.of(organizationId).find(
      (item) => item.organizationId === organizationId && item.id === id,
    )
    if (!administrator) throw new Error("Administrator not found.")
    return administrator
  }

  private assertRoles(organizationId: string, roleIds: string[]) {
    const available = [
      ...systemRolesFor(organizationId),
      ...this.customRoles.filter((role) => role.organizationId === organizationId),
    ]
    if (roleIds.some((roleId) => !available.some((role) => role.id === roleId))) {
      throw new Error("One or more selected roles are invalid.")
    }
  }
}
