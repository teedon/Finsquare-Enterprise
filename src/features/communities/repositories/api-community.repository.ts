import { apiClient, endpoints } from "@/services/api"
import { mapMfiMembership, type MfiRole } from "../domain/mfi-membership"
import type { CommunityMembership, CreateCommunityInput } from "../types"
import type { CommunityRepository } from "./community.repository"

/** `GET /communities` payload item, after the client unwraps `{ success, data }`. */
interface MfiCommunityDTO {
  communityId: string
  name: string
  logo: string | null
  color?: string | null
  description: string | null
  mfiRole: MfiRole
  mfiCustomRoleId?: string | null
  mfiCustomRoleName?: string | null
  mfiCustomRolePermissions?: string[]
  mfiCustomRoleScope?: string | null
  details?: { profile?: Record<string, unknown> } | null
}

/**
 * API-backed repository, wired to the MFI backend's `GET /communities` and `POST /communities`.
 *
 * The backend resolves the institutions from the authenticated session; creating one makes the
 * authenticated staff member its owner.
 */
export class ApiCommunityRepository implements CommunityRepository {
  async list(): Promise<CommunityMembership[]> {
    const response = await apiClient.get<MfiCommunityDTO[]>(endpoints.organizations.list)
    return response.map((community) => mapMfiMembership({ id: community.communityId, ...community }, community.mfiRole))
  }

  async create(input: CreateCommunityInput): Promise<CommunityMembership> {
    const response = await apiClient.post<MfiCommunityDTO>(endpoints.organizations.create, {
      name: input.name,
      type: input.type,
      legalName: input.legalName,
      country: input.country,
      logo: input.logo,
      color: input.accent,
    })
    return mapMfiMembership({ id: response.communityId, ...response }, response.mfiRole)
  }
}
