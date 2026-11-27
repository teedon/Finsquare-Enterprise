import { useState } from "react"
import { Button, Field, Modal, SelectField, Toggle } from "@/components/ui"
import { groupSchema } from "../schemas/group.schema"
import { EntitySelectField } from "@/features/organization/components/EntitySelectField"
import type {
  Branch,
  CreateGroupInput,
  Group,
  GroupType,
  Member,
} from "@/types"

const emptyGroup: CreateGroupInput = {
  name: "",
  code: "",
  description: "",
  typeId: "",
  branchId: null,
  parentGroupId: null,
  coordinatorMemberId: null,
  assistantCoordinatorMemberId: null,
  status: "active",
  allowJoinRequests: false,
  coordinatorCanManageMembers: true,
  visibility: "members",
}

export function GroupForm({
  open,
  group,
  groupTypes,
  branches,
  members,
  onClose,
  onSubmit,
}: {
  open: boolean
  group?: Group | null
  groupTypes: GroupType[]
  branches: Branch[]
  members: Member[]
  onClose: () => void
  onSubmit: (input: CreateGroupInput) => Promise<void>
}) {
  const [values, setValues] = useState<CreateGroupInput>(() =>
    group
      ? {
          name: group.name,
          code: group.code,
          description: group.description,
          typeId: group.typeId,
          branchId: group.branchId,
          parentGroupId: group.parentGroupId,
          coordinatorMemberId: group.coordinatorMemberId,
          assistantCoordinatorMemberId: group.assistantCoordinatorMemberId,
          status: group.status,
          allowJoinRequests: group.allowJoinRequests,
          coordinatorCanManageMembers: group.coordinatorCanManageMembers,
          visibility: group.visibility,
        }
      : emptyGroup,
  )
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)
  if (!open) return null

  const submit = async () => {
    const parsed = groupSchema.safeParse(values)
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Review the group details.")
      return
    }
    setSaving(true)
    setError("")
    try {
      await onSubmit(parsed.data)
      onClose()
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Unable to save group.",
      )
    } finally {
      setSaving(false)
    }
  }

  const typeName =
    groupTypes.find((type) => type.id === values.typeId)?.name ?? ""
  const coordinatorName =
    members.find((member) => member.id === values.coordinatorMemberId)?.name ??
    "Not assigned"
  const assistantName =
    members.find((member) => member.id === values.assistantCoordinatorMemberId)
      ?.name ?? "Not assigned"

  return (
    <Modal title={group ? "Edit group" : "Create group"} onClose={onClose} wide>
      <div className="wizard-body">
        <div className="form-section-title">Basic information</div>
        <div className="form-grid">
          <Field
            label="Group name"
            value={values.name}
            onChange={(name) => setValues({ ...values, name })}
          />
          <Field
            label="Group code"
            value={values.code}
            placeholder="e.g. IKJ-SAV"
            onChange={(code) => setValues({ ...values, code })}
          />
          <SelectField
            label="Group type"
            value={typeName}
            options={["Select type", ...groupTypes.map((type) => type.name)]}
            onChange={(name) =>
              setValues({
                ...values,
                typeId: groupTypes.find((type) => type.name === name)?.id ?? "",
              })
            }
          />
          <SelectField
            label="Status"
            value={values.status}
            options={["active", "inactive"]}
            onChange={(status) =>
              setValues({
                ...values,
                status: status as CreateGroupInput["status"],
              })
            }
          />
          <label className="field span-2">
            <span>Description</span>
            <textarea
              value={values.description}
              onChange={(event) =>
                setValues({ ...values, description: event.target.value })
              }
            />
          </label>
        </div>

        <div className="form-section-title">Organization & leadership</div>
        <div className="form-grid">
          <EntitySelectField
            entity="branch"
            label="Branch"
            value={values.branchId ?? ""}
            placeholder="No branch"
            options={branches.map((branch) => ({ value: branch.id, label: branch.name }))}
            onChange={(branchId) => setValues({ ...values, branchId: branchId || null })}
          />
          <SelectField
            label="Coordinator"
            value={coordinatorName}
            options={["Not assigned", ...members.map((member) => member.name)]}
            onChange={(name) =>
              setValues({
                ...values,
                coordinatorMemberId:
                  members.find((member) => member.name === name)?.id ?? null,
              })
            }
          />
          <SelectField
            label="Assistant coordinator"
            value={assistantName}
            options={["Not assigned", ...members.map((member) => member.name)]}
            onChange={(name) =>
              setValues({
                ...values,
                assistantCoordinatorMemberId:
                  members.find((member) => member.name === name)?.id ?? null,
              })
            }
          />
        </div>

        <div className="form-section-title">Group settings</div>
        <div className="settings-list form-settings-list">
          <div>
            <span>Allow members to request access</span>
            <Toggle
              value={values.allowJoinRequests}
              onChange={() =>
                setValues({
                  ...values,
                  allowJoinRequests: !values.allowJoinRequests,
                })
              }
            />
          </div>
          <div>
            <span>Allow coordinator to manage members</span>
            <Toggle
              value={values.coordinatorCanManageMembers}
              onChange={() =>
                setValues({
                  ...values,
                  coordinatorCanManageMembers:
                    !values.coordinatorCanManageMembers,
                })
              }
            />
          </div>
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
          {saving ? "Saving…" : group ? "Save changes" : "Create group"}
        </Button>
      </div>
    </Modal>
  )
}
