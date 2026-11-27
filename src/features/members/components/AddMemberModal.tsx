import { useState } from "react"
import { BadgeCheck, UserPlus } from "@/icons"
import { Button, Field, Modal, SelectField } from "@/components/ui"
import { useBranches } from "@/features/branches/hooks/useBranches"
import { useGroups } from "@/features/groups/hooks/useGroups"
import { memberSchema } from "../schemas/member.schema"
import { useCreateMember } from "../hooks/useCreateMember"
import { useOrganizationId } from "@/hooks/useOrganizationId"
import { EntitySelectField } from "@/features/organization/components/EntitySelectField"
import type { Member } from "@/types"

const GENDERS = ["Prefer not to say", "Female", "Male", "Other"]
const isElevenDigits = (v: string) => !v || /^\d{11}$/.test(v)

type Step = "choose" | "manual"

/**
 * Adding a member starts with a choice: type the details you already have, or send someone a form
 * to fill in themselves. Manual entry is the same ten fields it has always been, but it now
 * creates the record for real.
 */
export function AddMemberModal({
  onClose,
  notify,
  onUseForm,
}: {
  onClose: () => void
  notify: (message: string) => void
  onUseForm: () => void
}) {
  const [step, setStep] = useState<Step>("choose")
  return step === "choose"
    ? <ChooserStep onClose={onClose} onManual={() => setStep("manual")} onUseForm={onUseForm} />
    : <ManualStep onClose={onClose} notify={notify} onBack={() => setStep("choose")} />
}

function ChooserStep({ onClose, onManual, onUseForm }: { onClose: () => void; onManual: () => void; onUseForm: () => void }) {
  return (
    <Modal title="Add member" onClose={onClose}>
      <div className="wizard-body">
        <div className="choice-row">
          <button type="button" className="choice" onClick={onManual}>
            <b>Add member manually</b>
            <small>Enter the details you already have and create the member straight away.</small>
          </button>
          <button type="button" className="choice" onClick={onUseForm}>
            <b>Use an application form</b>
            <small>Build a form, share the link, and review what comes back before you approve it.</small>
          </button>
        </div>
        <div className="info-callout compact">
          <BadgeCheck size={17} />
          <span>A digital account is created either way. The member does not need to activate a login.</span>
        </div>
      </div>
      <div className="wizard-footer">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
      </div>
    </Modal>
  )
}

function ManualStep({ onClose, notify, onBack }: { onClose: () => void; notify: (message: string) => void; onBack: () => void }) {
  const organizationId = useOrganizationId()
  const { create, busy, error } = useCreateMember(organizationId)
  const { branches } = useBranches(organizationId)
  const { groups } = useGroups(organizationId)
  const activeBranches = branches.filter((branch) => branch.status === "active")
  const activeGroups = groups.filter((group) => group.status === "active")

  const [form, setForm] = useState({
    name: "", phone: "", email: "", address: "", gender: GENDERS[0], nin: "", bvn: "",
    branchId: "", groupId: "",
  })
  const [tried, setTried] = useState(false)
  const set = (key: keyof typeof form) => (value: string) => setForm((current) => ({ ...current, [key]: value }))

  const parsed = memberSchema.safeParse({ name: form.name, phone: form.phone, email: form.email, branchId: form.branchId || undefined, groupIds: form.groupId ? [form.groupId] : [] })
  const issue = (key: string) => parsed.success ? "" : parsed.error.issues.find((i) => i.path[0] === key)?.message ?? ""
  const errors = {
    name: issue("name"),
    phone: issue("phone"),
    email: issue("email"),
    groupId: issue("groupIds"),
    nin: isElevenDigits(form.nin) ? "" : "NIN must be 11 digits",
    bvn: isElevenDigits(form.bvn) ? "" : "BVN must be 11 digits",
  }
  const valid = !Object.values(errors).some(Boolean)
  const show = (key: keyof typeof errors) => (tried && errors[key] ? <small className="field-error">{errors[key]}</small> : null)

  const submit = async () => {
    setTried(true)
    if (!valid) return
    const selectedGroup = activeGroups.find((group) => group.id === form.groupId)
    const selectedBranch = activeBranches.find((branch) => branch.id === form.branchId)
    const member = await create({
      name: form.name.trim(),
      phone: form.phone.trim(),
      email: form.email.trim() || undefined,
      gender: form.gender === GENDERS[0] ? undefined : (form.gender as Member["gender"]),
      address: form.address.trim() || undefined,
      nin: form.nin.trim() || undefined,
      bvn: form.bvn.trim() || undefined,
      branchId: form.branchId || undefined,
      branchName: selectedBranch?.name,
      groupIds: form.groupId ? [form.groupId] : [],
      groupName: selectedGroup?.name,
      status: "Active",
    })
    if (!member) return
    notify(`${member.name} added as a member`)
    onClose()
  }

  return (
    <Modal title="Add member manually" onClose={onClose} wide>
      <div className="wizard-body">
        <div className="form-grid">
          <div><Field label="Full name *" placeholder="Enter member name" value={form.name} onChange={set("name")} />{show("name")}</div>
          <div><Field label="Phone number *" placeholder="+234" value={form.phone} onChange={set("phone")} />{show("phone")}</div>
          <div><Field label="Email (optional)" value={form.email} onChange={set("email")} />{show("email")}</div>
          <SelectField label="Gender" value={form.gender} options={GENDERS} onChange={set("gender")} />
          <Field label="Residential address" placeholder="Street, city, state" value={form.address} onChange={set("address")} />
          <Field label="Membership number" placeholder="Auto-generated" />
          <div><Field label="NIN (optional)" placeholder="11 digits" value={form.nin} onChange={set("nin")} />{show("nin")}</div>
          <div><Field label="BVN (optional)" placeholder="11 digits" value={form.bvn} onChange={set("bvn")} />{show("bvn")}</div>
          <EntitySelectField entity="branch" label="Branch" value={form.branchId} options={activeBranches.map((branch) => ({ value: branch.id, label: branch.name }))} onChange={set("branchId")} />
          <div><EntitySelectField entity="group" label="Primary group *" value={form.groupId} options={activeGroups.map((group) => ({ value: group.id, label: group.name }))} onChange={set("groupId")} />{show("groupId")}</div>
        </div>
        <div className="info-callout compact">
          <BadgeCheck size={17} />
          <span>The member starts as active with a created account. NIN and BVN can be added later for identity verification.</span>
        </div>
        {error && <div className="form-error" role="alert">{error}</div>}
      </div>
      <div className="wizard-footer">
        <Button variant="ghost" onClick={onBack}>Back</Button>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={() => void submit()} disabled={busy}>
          {busy ? "Adding…" : "Add member"} <UserPlus size={14} />
        </Button>
      </div>
    </Modal>
  )
}
