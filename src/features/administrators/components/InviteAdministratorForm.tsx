import { useState } from "react"
import { Button, Field, Modal, SelectField } from "@/components/ui"
import { useBranches } from "@/features/branches/hooks/useBranches"
import { useOrganizationId } from "@/hooks/useOrganizationId"
import { administratorInvitationSchema } from "../schemas/administrator.schema"
import { EntitySelectField } from "@/features/organization/components/EntitySelectField"
import type { InviteAdministratorInput, Role } from "@/types"

export function InviteAdministratorForm({
  open,
  roles,
  onClose,
  onSubmit,
}: {
  open: boolean
  roles: Role[]
  onClose: () => void
  onSubmit: (input: InviteAdministratorInput) => Promise<void>
}) {
  const organizationId = useOrganizationId()
  // The branch options belong to the community being invited into, so they come from the service
  // rather than from the seeded list.
  const { branches } = useBranches(organizationId)
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [roleName, setRoleName] = useState(roles[0]?.name ?? "")
  const [scopeType, setScopeType] = useState<"organization" | "branch">(
    "organization",
  )
  const [branchName, setBranchName] = useState(branches[0]?.name ?? "")
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)
  if (!open) return null

  const submit = async () => {
    const roleId = roles.find((role) => role.name === roleName)?.id ?? ""
    const branchId =
      branches.find((branch) => branch.name === branchName)?.id ?? ""
    const parsed = administratorInvitationSchema.safeParse({
      firstName,
      lastName,
      email,
      phone,
      roleIds: [roleId],
      scopeType,
      branchIds: scopeType === "branch" ? [branchId] : [],
    })
    if (!parsed.success) {
      setError(
        parsed.error.issues[0]?.message ?? "Review the invitation details.",
      )
      return
    }
    setSaving(true)
    try {
      await onSubmit({
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        email: parsed.data.email,
        phone: parsed.data.phone,
        roleIds: parsed.data.roleIds,
        accessScope: {
          type: parsed.data.scopeType,
          organizationId,
          branchIds:
            parsed.data.scopeType === "branch"
              ? parsed.data.branchIds
              : undefined,
        },
      })
      onClose()
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to invite administrator.",
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title="Invite administrator" onClose={onClose} wide>
      <div className="wizard-body">
        <div className="form-section-title">Identity</div>
        <div className="form-grid">
          <Field label="First name" value={firstName} onChange={setFirstName} />
          <Field label="Last name" value={lastName} onChange={setLastName} />
          <Field label="Email" value={email} onChange={setEmail} />
          <Field label="Phone" value={phone} onChange={setPhone} />
        </div>
        <div className="form-section-title">Role & access</div>
        <div className="form-grid">
          <SelectField
            label="Role"
            value={roleName}
            options={roles.map((role) => role.name)}
            onChange={setRoleName}
          />
          <SelectField
            label="Access scope"
            value={
              scopeType === "organization"
                ? "Entire organization"
                : "Specific branch"
            }
            options={["Entire organization", "Specific branch"]}
            onChange={(value) =>
              setScopeType(
                value === "Entire organization" ? "organization" : "branch",
              )
            }
          />
          {scopeType === "branch" && (
            <EntitySelectField
              entity="branch"
              label="Branch"
              value={branchName}
              options={branches.map((branch) => ({ value: branch.name, label: branch.name }))}
              onChange={setBranchName}
            />
          )}
        </div>
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
      </div>
      <div className="wizard-footer">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button disabled={saving} onClick={submit}>
          {saving ? "Sending…" : "Send invitation"}
        </Button>
      </div>
    </Modal>
  )
}
