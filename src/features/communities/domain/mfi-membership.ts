import type { CommunityMembership } from "../types"

export type MfiRole = "OWNER" | "LOAN_OFFICER" | "SUPPORT"

/** The community fields the MFI backend returns on login and in `GET /communities`. */
export interface MfiCommunityIdentity {
  id: string
  name: string
  logo?: string | null
  color?: string | null
  description?: string | null
  enabledFeatures?: string[]
  details?: { profile?: Record<string, unknown>; corporate?: Record<string, unknown> } | null
  mfiCustomRoleId?: string | null
  mfiCustomRoleName?: string | null
  mfiCustomRolePermissions?: string[]
  mfiCustomRoleScope?: string | null
}

/**
 * The backend exposes MFI roles (`OWNER`, `LOAN_OFFICER`, `SUPPORT`); the workspace resolves system
 * roles like `role-super-admin`. LOAN_OFFICER and SUPPORT are approximations until an MFI-specific
 * role exists in the Enterprise catalog.
 */
export function roleForMfiRole(mfiRole: MfiRole): {
  roleId: string
  roleName: string
  isOwner: boolean
} {
  switch (mfiRole) {
    case "OWNER":
      return { roleId: "role-super-admin", roleName: "Super Admin", isOwner: true }
    case "LOAN_OFFICER":
      return { roleId: "role-finance", roleName: "Finance Officer", isOwner: false }
    case "SUPPORT":
      return { roleId: "role-auditor", roleName: "Auditor", isOwner: false }
  }
}

/** Maps an MFI community + the staff member's role onto the workspace membership domain model. */
export function mapMfiMembership(community: MfiCommunityIdentity, mfiRole: MfiRole): CommunityMembership {
  const role = roleForMfiRole(mfiRole)
  const profile = community.details?.profile ?? {}
  const str = (v: unknown): string => (typeof v === "string" ? v : "")
  return {
    organizationId: community.id,
    name: community.name,
    type: str(profile.type) || "MFI",
    logo: community.logo ?? str(profile.logo),
    country: str(profile.country),
    legalName: str(profile.legalName),
    accent: community.color ?? (str(profile.secondaryColor) || "blue"),
    profile: Object.keys(profile).length ? profile : undefined,
    roleId: community.mfiCustomRoleId ?? role.roleId,
    roleName: community.mfiCustomRoleId ? (community.mfiCustomRoleName ?? "Custom role") : role.roleName,
    rolePermissions: community.mfiCustomRoleId
      ? (community.mfiCustomRolePermissions as CommunityMembership["rolePermissions"])
      : undefined,
    scope: community.mfiCustomRoleScope === "branch" ? "branch" : "organization",
    isOwner: role.isOwner,
  }
}
