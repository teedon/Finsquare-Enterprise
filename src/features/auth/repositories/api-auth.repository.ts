import { apiClient, endpoints } from "@/services/api"
import { mapMfiMembership, type MfiRole } from "@/features/communities/domain/mfi-membership"
import type { AuthRepository } from "./auth.repository"
import type { AuthOutcome, AuthResult, Session, SignInCredentials, SignUpInput } from "../types"

/** Backend response shape after the client unwraps `{ success, data }`. */
interface MfiLoginData {
  token: string
  mustChangePassword: boolean
  user: {
    email: string
    firstName?: string | null
    lastName?: string | null
    fullName?: string | null
    mfiRole: MfiRole
    mfiCustomRoleId?: string | null
    mfiCustomRoleName?: string | null
    mfiCustomRolePermissions?: string[]
    mfiCustomRoleScope?: string | null
  }
  community: MfiCommunity | null
}

interface MfiCommunitySelectionData {
  requiresCommunitySelection: true
  availableCommunities: Array<{
    communityId: string
    name: string
    logo: string | null
    color?: string | null
    description: string | null
    mfiRole: MfiRole | null
    mfiCustomRoleId?: string | null
    mfiCustomRoleName?: string | null
    mfiCustomRolePermissions?: string[]
    mfiCustomRoleScope?: string | null
  }>
}

interface MfiCommunity {
  id: string
  name: string
  logo?: string | null
  color?: string | null
  description?: string | null
  enabledFeatures?: string[]
  details?: { profile?: Record<string, unknown>; corporate?: Record<string, unknown> } | null
}

function displayName(user: MfiLoginData["user"]): string {
  const combined = [user.firstName, user.lastName].filter(Boolean).join(" ")
  return user.fullName || combined || user.email
}

function mapAuthResult(data: MfiLoginData): AuthResult {
  const session: Session = {
    email: data.user.email,
    name: displayName(data.user),
    signedInAt: new Date().toISOString(),
    mustChangePassword: data.mustChangePassword,
  }
  const memberships = data.community
    ? [
        mapMfiMembership(
          {
            ...data.community,
            mfiCustomRoleId: data.user.mfiCustomRoleId,
            mfiCustomRoleName: data.user.mfiCustomRoleName,
            mfiCustomRolePermissions: data.user.mfiCustomRolePermissions,
            mfiCustomRoleScope: data.user.mfiCustomRoleScope,
          },
          data.user.mfiRole,
        ),
      ]
    : []
  return { session, accessToken: data.token, memberships }
}

/**
 * API-backed repository, wired to the MFI backend.
 *
 * The backend verifies the credentials, issues the token and returns the staff member's identity and
 * institutions — either a completed sign-in or the list to choose between.
 */
export class ApiAuthRepository implements AuthRepository {
  async signIn(credentials: SignInCredentials): Promise<AuthOutcome> {
    const response = await apiClient.post<MfiLoginData | MfiCommunitySelectionData>(endpoints.auth.login, {
      email: credentials.email,
      password: credentials.password,
      communityId: credentials.communityId,
    })

    if ("requiresCommunitySelection" in response && response.requiresCommunitySelection) {
      return {
        status: "needs-selection",
        communities: response.availableCommunities.map((community) =>
          mapMfiMembership({ id: community.communityId, ...community }, community.mfiRole ?? "SUPPORT"),
        ),
      }
    }

    return { status: "signed-in", result: mapAuthResult(response as MfiLoginData) }
  }

  async signUp(input: SignUpInput): Promise<AuthOutcome> {
    const response = await apiClient.post<MfiLoginData>(endpoints.auth.register, {
      name: input.name,
      description: input.description,
      logo: input.logo,
      color: input.color,
      ownerName: input.ownerName,
      ownerEmail: input.ownerEmail,
      ownerPhone: input.ownerPhone,
      ownerPassword: input.ownerPassword,
      profile: input.profile,
      corporate: input.corporate,
    })
    return { status: "signed-in", result: mapAuthResult(response) }
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await apiClient.patch(endpoints.auth.changePassword, { currentPassword, newPassword })
  }

  async signOut(): Promise<void> {
    // The backend issues stateless JWTs and has no logout endpoint; the token is cleared client-side.
  }
}
