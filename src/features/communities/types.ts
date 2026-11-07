import type { EntityId, Permission, RoleScope } from "@/types"

/**
 * One community the signed-in administrator belongs to, and the role they hold in it.
 *
 * The community *is* the tenant: `organizationId` is the same id every repository takes as its first
 * argument, so a membership is what tells the app which tenant it is working in and what the person
 * using it is allowed to do there.
 */
export interface CommunityMembership {
  organizationId: EntityId
  name: string
  type: string
  logo: string
  country: string
  /** Registered name, when the community has one. */
  legalName: string
  /** The community's primary colour; the workspace accent follows the active community. */
  accent: string
  /**
   * Optional richer organization details from the MFI backend (`community.details.profile`).
   * Used to seed the full workspace profile for newly-added communities.
   */
  profile?: Record<string, unknown>
  roleId: EntityId
  /** Display name of `roleId`, resolved by the backend so the UI never has to look a role up. */
  roleName: string
  /** Present for tenant-defined MFI roles, used to drive client-side permission checks. */
  rolePermissions?: Permission[]
  scope: RoleScope
  branchIds?: EntityId[]
  /** The administrator who created the community and therefore holds its Super Admin role. */
  isOwner: boolean
}

/** What the create form collects. Everything else about a new community starts empty. */
export interface CreateCommunityInput {
  name: string
  type: string
  legalName: string
  country: string
  logo: string
  accent: string
}
