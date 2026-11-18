import { useCallback, useState } from "react"
import { getUserErrorMessage } from "@/lib/errors/get-user-message"
import { membersService } from "../services/members.service"
import type { Member, UpdateMemberInput } from "@/types"

/** Updates one member record. Shared by the member profile's edit form. */
export function useUpdateMember(organizationId: string) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const update = useCallback(
    async (memberId: string, input: UpdateMemberInput): Promise<Member | null> => {
      setBusy(true)
      setError(null)
      try {
        return await membersService.update(organizationId, memberId, input)
      } catch (reason) {
        setError(getUserErrorMessage(reason))
        return null
      } finally {
        setBusy(false)
      }
    },
    [organizationId],
  )

  return { update, busy, error }
}
