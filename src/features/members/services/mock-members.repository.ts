import { groupsMock } from "@/features/groups/mocks/groups.mock"
import { createTenantStore } from "@/lib/tenancy/tenant-store"
import { isSeedTenant } from "@/lib/tenancy/seed-tenant"
import { membersMock } from "../mocks/members.mock"
import { defaultMapping, formatJoinedDate, parseCsv, type ImportTarget } from "../domain/member-import"
import type {
  CreateMemberInput,
  Member,
  MemberImportError,
  MemberImportResult,
  UpdateMemberInput,
} from "@/types"
import type { MemberRepository } from "./members.repository"

/** One community's register, with the sequence its next member id comes from. */
interface MemberRegister {
  records: Member[]
  nextSequence: number
}

const listeners = new Set<() => void>()
const notify = () => listeners.forEach((listener) => listener())

/**
 * Members are numbered above the highest record already present. Counting `records.length` instead
 * would reissue an id after a delete, and would hand the same id to every record in an import.
 */
const highestId = (records: Member[]) =>
  records.reduce((highest, member) => Math.max(highest, Number(member.id.replace(/\D/g, "")) || 0), 0)

const registers = createTenantStore<MemberRegister>({
  seed: () => ({ records: [...membersMock], nextSequence: highestId(membersMock) }),
  empty: () => ({ records: [], nextSequence: 0 }),
})

/** A new member lands in a group of its own community; the seeded list belongs to the seeded one. */
const groupNameOf = (organizationId: string, groupIds: string[]) =>
  (isSeedTenant(organizationId) ? groupsMock : []).find((group) => group.id === groupIds[0])?.name ??
  "New members"

const buildMember = (
  organizationId: string,
  register: MemberRegister,
  input: CreateMemberInput,
  joinedAt?: string,
): Member => ({
  id: `LFC-${String((register.nextSequence += 1)).padStart(6, "0")}`,
  name: input.name,
  phone: input.phone,
  email: input.email,
  gender: input.gender,
  address: input.address,
  nin: input.nin,
  bvn: input.bvn,
  group: groupNameOf(organizationId, input.groupIds),
  branchId: input.branchId,
  status: input.status ?? "Pending",
  accountStatus: "Created",
  // `joinedAt` is a display string in this register, so a raw ISO timestamp must not be written here.
  joinedAt: joinedAt ?? formatJoinedDate("", new Date()),
  initials: input.name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join(""),
})

export class MockMemberRepository implements MemberRepository {
  async getAll(organizationId: string): Promise<Member[]> {
    return structuredClone(registers.of(organizationId).records)
  }

  async getById(
    organizationId: string,
    memberId: string,
  ): Promise<Member | null> {
    return structuredClone(
      registers.of(organizationId).records.find((member) => member.id === memberId) ?? null,
    )
  }

  async create(
    organizationId: string,
    input: CreateMemberInput,
  ): Promise<Member> {
    const register = registers.of(organizationId)
    const member = buildMember(organizationId, register, input)
    register.records = [member, ...register.records]
    notify()
    return structuredClone(member)
  }

  async update(
    organizationId: string,
    memberId: string,
    input: UpdateMemberInput,
  ): Promise<Member> {
    const register = registers.of(organizationId)
    const index = register.records.findIndex((member) => member.id === memberId)
    if (index < 0) throw new Error("Member not found.")
    const current = register.records[index]
    const next: Member = {
      ...current,
      ...(input.name !== undefined ? {
        name: input.name,
        initials: input.name.split(" ").map((part) => part[0]).slice(0, 2).join(""),
      } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.gender !== undefined ? { gender: input.gender } : {}),
      ...(input.address !== undefined ? { address: input.address } : {}),
      ...(input.nin !== undefined ? { nin: input.nin } : {}),
      ...(input.bvn !== undefined ? { bvn: input.bvn } : {}),
      ...(input.branchId !== undefined ? { branchId: input.branchId } : {}),
      ...(input.branchName !== undefined ? { branchName: input.branchName } : {}),
      ...(input.groupName !== undefined ? { group: input.groupName } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
    }
    register.records[index] = next
    notify()
    return structuredClone(next)
  }

  async delete(organizationId: string, memberId: string): Promise<void> {
    const register = registers.of(organizationId)
    register.records = register.records.filter((member) => member.id !== memberId)
    notify()
  }

  /**
   * Reads the upload and creates every record it can. A member cannot exist without a full name and
   * a phone number, so rows missing either are skipped and reported per row — the same shape a
   * backend would return, which is why the caller never has to guess what happened.
   */
  async import(
    organizationId: string,
    file: File,
    mapping?: ImportTarget[],
  ): Promise<MemberImportResult> {
    const table = parseCsv(await file.text())
    const columns = mapping?.length === table.headers.length ? mapping : defaultMapping(table.headers)
    const column = (row: string[], target: ImportTarget) => {
      const index = columns.indexOf(target)
      return index >= 0 ? (row[index] ?? "").trim() : ""
    }
    const register = registers.of(organizationId)

    const errors: MemberImportError[] = []
    const created: Member[] = []

    table.rows.forEach((row, index) => {
      const name = column(row, "Full name")
      const phone = column(row, "Phone")
      if (!name || !phone) {
        // Row numbers count the header, so they line up with what the spreadsheet shows.
        errors.push({ row: index + 2, message: !name ? "Full name is missing" : "Phone number is missing" })
        return
      }
      created.push(
        buildMember(
          organizationId,
          register,
          {
            name,
            phone,
            email: column(row, "Email") || undefined,
            groupIds: [],
            status: "Active",
          },
          formatJoinedDate(column(row, "Date joined"), new Date()),
        ),
      )
    })

    if (created.length) {
      register.records = [...created, ...register.records]
      notify()
    }

    return { imported: created.length, skipped: errors.length, errors }
  }

  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => void listeners.delete(listener)
  }
}
