import { useState } from "react"
import { Check } from "@/icons"
import { Button, Field, Modal, SelectField } from "@/components/ui"
import { useBranches } from "@/features/branches/hooks/useBranches"
import { useGroups } from "@/features/groups/hooks/useGroups"
import { useUpdateMember } from "../hooks/useUpdateMember"
import { useOrganizationId } from "@/hooks/useOrganizationId"
import { EntitySelectField } from "@/features/organization/components/EntitySelectField"
import type { Member } from "@/types"

const GENDERS = ["Prefer not to say", "Female", "Male", "Other"]
const isElevenDigits = (v: string) => !v || /^\d{11}$/.test(v)

/**
 * Edits a member's identity and placement. The same ten fields as manual entry, prefilled from the
 * member record. Optional fields (email, address, NIN, BVN) are sent as-is; emptying one leaves the
 * backend value in place for email and clears the rest.
 */
export function EditMemberModal({
  member,
  onClose,
  notify,
}: {
  member: Member
  onClose: () => void
  notify: (message: string) => void
}) {
  const organizationId = useOrganizationId()
  const { update, busy, error } = useUpdateMember(organizationId)
  const { branches } = useBranches(organizationId)
  const { groups } = useGroups(organizationId)
  const activeBranches = branches.filter((branch) => branch.status === "active")
  const activeGroups = groups.filter((group) => group.status === "active")

  const [form, setForm] = useState({
    name: member.name,
    phone: member.phone,
    email: member.email ?? "",
    address: member.address ?? "",
    gender: member.gender ?? GENDERS[0],
    nin: member.nin ?? "",
    bvn: member.bvn ?? "",
    branchId: member.branchId ?? "",
    groupId: "",
  })
  const [tried, setTried] = useState(false)
  const set = (key: keyof typeof form) => (value: string) =>
    setForm((current) => ({ ...current, [key]: value }))

  // A member's group is stored by name, so the select matches the current group by name when
  // it is not tracked by id.
  const currentGroupId =
    form.groupId ||
    (activeGroups.find((group) => group.name === member.group)?.id ?? "")
  const currentBranchId =
    form.branchId ||
    (activeBranches.find((branch) => branch.id === member.branchId)?.id ??
      activeBranches.find((branch) => branch.name === member.branchName)?.id ??
      "")

  const errors = {
    name: form.name.trim().length >= 2 ? "" : "Enter the member’s full name.",
    phone: form.phone.trim().length >= 10 ? "" : "Enter a valid phone number.",
    email:
      !form.email.trim() || /^\S+@\S+\.\S+$/.test(form.email.trim())
        ? ""
        : "Enter a valid email address.",
    nin: isElevenDigits(form.nin.trim()) ? "" : "NIN must be 11 digits",
    bvn: isElevenDigits(form.bvn.trim()) ? "" : "BVN must be 11 digits",
  }
  const valid = !Object.values(errors).some(Boolean)
  const show = (key: keyof typeof errors) =>
    tried && errors[key] ? <small className="field-error">{errors[key]}</small> : null

  const submit = async () => {
    setTried(true)
    if (!valid) return
    const selectedGroup = activeGroups.find((group) => group.id === currentGroupId)
    const selectedBranch = activeBranches.find((branch) => branch.id === currentBranchId)
    const saved = await update(member.id, {
      name: form.name.trim(),
      phone: form.phone.trim(),
      email: form.email.trim() || undefined,
      gender: form.gender === GENDERS[0] ? undefined : (form.gender as Member["gender"]),
      address: form.address.trim() || undefined,
      nin: form.nin.trim() || undefined,
      bvn: form.bvn.trim() || undefined,
      branchId: selectedBranch?.id,
      branchName: selectedBranch?.name,
      groupIds: selectedGroup ? [selectedGroup.id] : [],
      groupName: selectedGroup?.name,
    })
    if (!saved) return
    notify(`${saved.name}'s details updated`)
    onClose()
  }

  return (
    <Modal title="Edit member" onClose={onClose} wide>
      <div className="wizard-body">
        <div className="form-grid">
          <div><Field label="Full name *" placeholder="Enter member name" value={form.name} onChange={set("name")} />{show("name")}</div>
          <div><Field label="Phone number *" placeholder="+234" value={form.phone} onChange={set("phone")} />{show("phone")}</div>
          <div><Field label="Email (optional)" value={form.email} onChange={set("email")} />{show("email")}</div>
          <SelectField label="Gender" value={form.gender} options={GENDERS} onChange={set("gender")} />
          <Field label="Residential address" placeholder="Street, city, state" value={form.address} onChange={set("address")} />
          <div><Field label="NIN (optional)" placeholder="11 digits" value={form.nin} onChange={set("nin")} />{show("nin")}</div>
          <div><Field label="BVN (optional)" placeholder="11 digits" value={form.bvn} onChange={set("bvn")} />{show("bvn")}</div>
          <EntitySelectField
            entity="branch"
            label="Branch"
            value={currentBranchId}
            options={activeBranches.map((branch) => ({ value: branch.id, label: branch.name }))}
            onChange={set("branchId")}
          />
          <EntitySelectField
            entity="group"
            label="Primary group"
            value={currentGroupId}
            options={activeGroups.map((group) => ({ value: group.id, label: group.name }))}
            onChange={set("groupId")}
          />
        </div>
        {error && <div className="form-error" role="alert">{error}</div>}
      </div>
      <div className="wizard-footer">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={() => void submit()} disabled={busy}>
          {busy ? "Saving…" : "Save changes"} <Check size={14} />
        </Button>
      </div>
    </Modal>
  )
}
