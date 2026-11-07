import { useMemo } from "react"
import { useWorkspace } from "@/app/providers/WorkspaceProvider"
import { canAccessBranch, hasAdministratorPermission } from "@/lib/permissions/permissions"
import { systemRolesFor } from "@/lib/permissions/system-roles"
import type { Administrator, Permission, Role } from "@/types"

/**
 * What the signed-in administrator may do **in the active community**.
 *
 * Both halves come from state rather than from a seeded record: the role is the one the membership
 * carries for this community, and the identity is the administrator account. That is what makes the
 * switcher real — the same person can be a Super Admin in one community and a Finance Officer in
 * another, and the navigation, the pages and the action buttons follow the role they hold there.
 *
 * This is a usability boundary, never a security one: the backend re-authorises every request
 * against the authenticated session.
 */
export function useAuthorization() {
  const { state } = useWorkspace()
  const organizationId = state.activeCommunityId
  const membership = state.communities.find((community) => community.id === organizationId)

  // System roles exist in every community, so the membership's role resolves wherever it is used.
  const roles = useMemo<Role[]>(() => {
    const systemRoles = systemRolesFor(organizationId)
    if (!membership?.rolePermissions) return systemRoles
    return [
      ...systemRoles,
      {
        id: membership.roleId,
        organizationId,
        name: membership.roleName,
        description: "Custom community role.",
        scope: membership.scope,
        permissions: membership.rolePermissions,
        isSystemRole: false,
        createdAt: "",
        updatedAt: "",
      },
    ]
  }, [organizationId, membership])

  const administrator = useMemo<Administrator>(() => {
    const name = state.session?.name || state.admin.name || "Admin User"
    const email = state.session?.email || state.admin.email
    return {
      id: "administrator-self",
      organizationId,
      userId: email || "administrator-self",
      name,
      email,
      roleIds: membership ? [membership.roleId] : [],
      status: "active",
      accessScope: {
        type: membership?.scope ?? "organization",
        organizationId,
        branchIds: membership?.branchIds,
      },
      createdAt: "",
      updatedAt: "",
    }
  }, [organizationId, membership, state.session, state.admin])

  return {
    administrator,
    roles,
    can: (permission: Permission, branchId?: string | null) =>
      hasAdministratorPermission(administrator, roles, permission, branchId),
    canAccessBranch: (branchId: string) => canAccessBranch(administrator, branchId),
  }
}
