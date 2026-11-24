import { apiClient, endpoints } from "@/services/api"
import type {
  CreateMemberInput,
  Member,
  MemberImportResult,
  UpdateMemberInput,
} from "@/types"
import type { MemberRepository } from "./members.repository"
import { defaultMapping, parseCsv, type ImportTarget } from "../domain/member-import"
import {
  genderToMfi,
  mapCustomerFields,
  splitFullName,
  type MfiCustomerDetail,
  type MfiCustomerListItem,
} from "../domain/mfi-member"

interface CustomersResponse {
  customers: MfiCustomerListItem[]
}

interface EnrolCustomerResponse {
  membership?: {
    joinedAt?: string | null
    mfiMeta?: MfiCustomerListItem["mfiMeta"]
  } | null
  user: MfiCustomerDetail
}

const listeners = new Set<() => void>()
const notify = () => listeners.forEach((listener) => listener())

/**
 * API-backed member repository, wired to the MFI customer endpoints.
 *
 * The tenant is the signed-in staff member's community, so the organization id the repository is
 * handed is ignored; the backend derives it from the JWT. Group and branch have no MFI equivalent
 * yet, so they are dropped on write and shown as unassigned on read.
 */
export class ApiMemberRepository implements MemberRepository {
  async getAll(): Promise<Member[]> {
    const response = await apiClient.get<CustomersResponse>(endpoints.members.all)
    return response.customers.map(mapCustomerFields)
  }

  async getById(_organizationId: string, memberId: string): Promise<Member> {
    const detail = await apiClient.get<MfiCustomerDetail>(endpoints.members.detail(memberId))
    return mapCustomerFields(detail)
  }

  async create(_organizationId: string, input: CreateMemberInput): Promise<Member> {
    const { firstName, lastName } = splitFullName(input.name)
    const response = await apiClient.post<EnrolCustomerResponse>(endpoints.members.enrol, {
      firstName,
      lastName,
      phoneNumber: input.phone,
      email: input.email,
      gender: input.gender ? genderToMfi(input.gender) : undefined,
      address: input.address,
      nin: input.nin,
      bvn: input.bvn,
      groupName: input.groupName,
      branchName: input.branchName,
      groupId: input.groupIds[0],
      branchId: input.branchId,
    })
    const member = mapCustomerFields({
      id: response.user.id,
      fullName: response.user.fullName,
      email: response.user.email,
      phoneNumber: response.user.phoneNumber,
      gender: response.user.gender,
      address: response.user.address,
      bvn: response.user.bvn,
      nin: response.user.nin,
      walletTier: response.user.walletTier,
      isBanned: response.user.isBanned,
      joinedAt: response.membership?.joinedAt,
      createdAt: response.user.createdAt,
      mfiMeta: response.membership?.mfiMeta,
    })
    notify()
    return member
  }

  async update(_organizationId: string, memberId: string, input: UpdateMemberInput): Promise<Member> {
    const body: Record<string, unknown> = {}
    if (input.name !== undefined) {
      const { firstName, lastName } = splitFullName(input.name)
      body.firstName = firstName
      body.lastName = lastName
    }
    if (input.phone !== undefined) body.phoneNumber = input.phone
    // Email is non-null and unique on the backend, so an emptied email is left unchanged.
    if (input.email !== undefined && input.email !== "") body.email = input.email
    if (input.gender !== undefined) body.gender = genderToMfi(input.gender) ?? null
    if (input.address !== undefined) body.address = input.address || null
    if (input.nin !== undefined) body.nin = input.nin || null
    if (input.bvn !== undefined) body.bvn = input.bvn || null
    if (input.groupName !== undefined) body.groupName = input.groupName
    if (input.branchName !== undefined) body.branchName = input.branchName
    if (input.branchId !== undefined) body.branchId = input.branchId
    if (input.groupIds !== undefined) body.groupId = input.groupIds[0]

    if (input.status !== undefined) {
      if (input.status === "Suspended") {
        await apiClient.post(endpoints.members.suspend(memberId))
      } else if (input.status === "Active") {
        await apiClient.post(endpoints.members.reactivate(memberId))
      } else {
        throw new Error(`Changing a member to ${input.status.toLowerCase()} is not supported.`)
      }
    }

    const response = Object.keys(body).length
      ? await apiClient.patch<MfiCustomerDetail>(endpoints.members.detail(memberId), body)
      : await apiClient.get<MfiCustomerDetail>(endpoints.members.detail(memberId))
    const member = mapCustomerFields({
      id: response.id,
      fullName: response.fullName,
      email: response.email,
      phoneNumber: response.phoneNumber,
      gender: response.gender,
      address: response.address,
      bvn: response.bvn,
      nin: response.nin,
      walletTier: response.walletTier,
      isBanned: response.isBanned,
      joinedAt: response.joinedAt,
      mfiMeta: response.mfiMeta,
    })
    notify()
    return member
  }

  async delete(_organizationId: string, memberId: string): Promise<void> {
    await apiClient.delete(endpoints.members.detail(memberId))
    notify()
  }

  async import(
    _organizationId: string,
    file: File,
    mapping?: ImportTarget[],
  ): Promise<MemberImportResult> {
    const table = parseCsv(await file.text())
    const columns = mapping?.length === table.headers.length ? mapping : defaultMapping(table.headers)
    const cell = (row: string[], target: ImportTarget) => {
      const index = columns.indexOf(target)
      return index >= 0 ? (row[index] ?? "").trim() : ""
    }
    const rows = table.rows.map((row) => ({
      fullName: cell(row, "Full name"),
      phone: cell(row, "Phone"),
      email: cell(row, "Email"),
      joinedAt: cell(row, "Date joined"),
    }))
    const result = await apiClient.post<MemberImportResult>(endpoints.members.import, { rows })
    notify()
    return result
  }

  subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return () => void listeners.delete(listener)
  }
}

