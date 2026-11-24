import { useState } from "react"
import { Button, Modal } from "@/components/ui"
import { useOrganizationId } from "@/hooks/useOrganizationId"
import type { Member } from "@/types"
import { useAdministrators } from "../hooks/useAdministrators"

export function PromoteMemberModal({
  member,
  onClose,
  onPromoted,
}: {
  member: Member
  onClose: () => void
  onPromoted: () => void
}) {
  const organizationId = useOrganizationId()
  const { roles, status, error, retry, promoteMember } = useAdministrators(organizationId)
  const [roleId, setRoleId] = useState("")
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState("")
  const organizationRoles = roles.filter((role) => role.scope === "organization")

  const promote = async () => {
    if (!roleId || saving) return
    setSaving(true)
    setSaveError("")
    try {
      await promoteMember(member, roleId)
      onPromoted()
    } catch (reason) {
      setSaveError(reason instanceof Error ? reason.message : "Could not promote this member")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title="Promote member to administrator" onClose={saving ? () => {} : onClose}>
      <div className="wizard-body">
        <p>
          {member.name} will use their existing account and move from the member register into Administrators. Choose an
          organization-wide role.
        </p>
        {status === "loading" ? (
          <p>Loading administrator roles…</p>
        ) : status === "error" ? (
          <div className="form-error" role="alert">
            {error ?? "Administrator roles could not be loaded."}
            <Button variant="ghost" onClick={retry}>
              Retry
            </Button>
          </div>
        ) : organizationRoles.length === 0 ? (
          <div className="form-error" role="alert">
            No organization-wide administrator roles are available.
          </div>
        ) : (
          <label className="field">
            <span>Administrator role</span>
            <select value={roleId} onChange={(event) => setRoleId(event.target.value)}>
              <option value="">Select a role</option>
              {organizationRoles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {saveError && (
          <div className="form-error" role="alert">
            {saveError}
          </div>
        )}
      </div>
      <div className="wizard-footer">
        <Button variant="ghost" disabled={saving} onClick={onClose}>
          Cancel
        </Button>
        <Button disabled={status !== "success" || !roleId || saving} onClick={() => void promote()}>
          {saving ? "Promoting…" : "Promote member"}
        </Button>
      </div>
    </Modal>
  )
}
