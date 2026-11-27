import { useMemo, useState, type ReactNode } from "react"
import { useWorkspace } from "@/app/providers/WorkspaceProvider"
import { useAsyncResource } from "@/hooks/useAsyncResource"
import { Button, Disclosure, Field } from "@/components/ui"
import { SearchInput } from "@/components/data-display/ManagementPrimitives"
import { groupsService } from "@/features/groups/services/groups.service"
import { useMembers } from "@/features/members/hooks/useMembers"
import { useWallet } from "@/features/wallet/hooks/useWallet"
import { money } from "@/features/loans/components/LoanUi"
import { round2, toISODate } from "../domain/calculations"
import { COMMISSION_MODEL_OPTIONS, PAYMENT_METHOD_CATALOG, recipientLabel } from "../domain/contribution.rules"
import { useOrganizationId } from "@/hooks/useOrganizationId"
import { useAppRoute } from "@/app/routes/useAppRoute"
import { createContributionSchema, firstError } from "../schemas/contribution.schema"
import { Panel } from "./ContributionUi"
import type { ContributionCtx } from "./ContributionUi"
import type {
  ContributionCommission,
  ContributionForm,
  ContributionFrequency,
  ContributionPaymentMethodId,
  ContributionRecipient,
  ContributionType,
  CreateContributionInput,
  ParticipantScope,
} from "../types/contribution.types"

const TYPE_OPTIONS: { id: ContributionType; label: string; hint: string }[] = [
  { id: "Fixed", label: "Fixed", hint: "Everyone pays the same amount." },
  { id: "Flexible", label: "Flexible", hint: "Contributors choose how much." },
  { id: "Target", label: "Target", hint: "Saving towards a target amount." },
]

const FORM_OPTIONS: { id: ContributionForm; label: string; hint: string }[] = [
  { id: "General", label: "General", hint: "One pooled balance for everyone." },
  { id: "Personal", label: "Personal", hint: "Each member has their own balance." },
]

const FREQUENCY_MODE_OPTIONS: { id: "scheduled" | "anytime"; label: string; hint: string }[] = [
  { id: "scheduled", label: "Frequency-based", hint: "Daily, weekly or monthly." },
  { id: "anytime", label: "No fixed frequency", hint: "Contributors pay whenever they want." },
]

const SCOPE_OPTIONS: { id: ParticipantScope; label: string; hint: string }[] = [
  { id: "All", label: "All Members", hint: "Everyone in the organization." },
  { id: "Selected", label: "Selected Members", hint: "Pick the people yourself." },
  { id: "Open", label: "Open to Everyone", hint: "Anyone with the link, member or not." },
]

const FREQUENCIES: ContributionFrequency[] = ["Daily", "Weekly", "Monthly", "Custom"]

const RECIPIENT_OPTIONS: { id: ContributionRecipient["kind"]; label: string }[] = [
  { id: "organization", label: "Organization account" },
  { id: "member", label: "A specific member" },
  { id: "contributor", label: "Each contributor's own account" },
]

const initialDraft = (walletEnabled: boolean): CreateContributionInput => ({
  name: "",
  description: "",
  type: "Fixed",
  form: "Personal",
  participantScope: "All",
  fixedAmount: 2_000,
  minimumAmount: 1_000,
  targetAmount: 100_000,
  frequencyBased: true,
  frequency: "Daily",
  customFrequency: { label: "", days: 10 },
  startDate: toISODate(new Date()),
  endDate: "",
  groupId: "",
  recipient: { kind: "organization", accountId: "", accountName: "", label: "" },
  commission: { model: "none", percentage: 5, fixedAmount: 0 },
  payout: { mode: "manual", approvalThreshold: 100_000 },
  paymentMethods: walletEnabled ? ["wallet", "bank_transfer", "cash"] : ["bank_transfer", "cash"],
})

/**
 * Creation is one page: five questions in the order an administrator thinks about them, each
 * revealing only the fields it needs. Everything an ordinary plan can infer — continuous
 * savings, partial withdrawals, the public link, the payment methods — is derived, and the few
 * genuine options live behind one collapsed Advanced section.
 */
export function CreateContributionForm({ ctx }: { ctx: ContributionCtx }) {
  const { state } = useWorkspace()
  const organizationId = useOrganizationId()
  const { navigate } = useAppRoute()
  const walletEnabled = state.enabledModules.includes("wallet")
  const wallet = useWallet()
  const { members } = useMembers(organizationId)
  const groupsResource = useAsyncResource(() => groupsService.getGroups(organizationId), [organizationId])

  const [draft, setDraft] = useState(() => initialDraft(walletEnabled))
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [memberQuery, setMemberQuery] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const patch = (values: Partial<CreateContributionInput>) => {
    setDraft((current) => ({ ...current, ...values }))
    setError(null)
  }
  const patchRecipient = (values: Partial<ContributionRecipient>) => {
    setDraft((current) => ({ ...current, recipient: { ...current.recipient, ...values } }))
    setError(null)
  }

  const activeMembers = useMemo(() => members.filter((member) => member.status === "Active"), [members])
  const visibleMembers = useMemo(() => {
    const needle = memberQuery.trim().toLowerCase()
    if (!needle) return activeMembers
    return activeMembers.filter((member) => member.name.toLowerCase().includes(needle) || member.id.toLowerCase().includes(needle))
  }, [activeMembers, memberQuery])

  // The select shows the live balance to help the administrator choose; the recipient stores the
  // account's name only, so a stale balance can never end up in the plan's header.
  const walletOptions = wallet.data
    ? [
        { id: wallet.data.account.id, accountName: wallet.data.account.accountName, display: `${wallet.data.account.accountName} · ${wallet.data.account.bankName}` },
        ...wallet.wallets
          .filter((w) => w.scope !== "member")
          .map((w) => ({ id: w.id, accountName: w.name, display: `${w.name} · ${money(w.availableBalance)}` })),
      ]
    : []

  const addGroup = async (groupId: string) => {
    const group = (groupsResource.data ?? []).find((item) => item.id === groupId)
    if (!group) return
    const memberships = await groupsService.getGroupMembers(organizationId, group.id)
    const ids = memberships.filter((m) => m.status === "active").map((m) => m.memberId)
    setSelectedIds((current) => [...new Set([...current, ...ids])])
    patch({ groupId: group.id, groupName: group.name })
  }

  const roster = async () => {
    if (draft.participantScope === "Open") return []
    const people =
      draft.participantScope === "All"
        ? activeMembers
        : activeMembers.filter((member) => selectedIds.includes(member.id))
    return people.map((person) => ({
      memberId: person.id,
      memberName: person.name,
      memberCode: person.id,
      contact: { phone: person.phone, email: person.email },
      branchId: person.branchId,
      branchName: person.branchName,
    }))
  }

  const rosterCount =
    draft.participantScope === "Selected" ? selectedIds.length : activeMembers.length

  const expected =
    draft.frequencyBased && draft.type === "Fixed" && draft.fixedAmount
      ? `Each participant is expected to contribute ${money(draft.fixedAmount)} ${
          draft.frequency === "Custom"
            ? `every ${draft.customFrequency?.days ?? 0} days`
            : draft.frequency.toLowerCase()
        }.`
      : null

  const submit = async () => {
    const parsed = createContributionSchema.safeParse(draft)
    if (!parsed.success) return setError(firstError(parsed) ?? "Some details still need attention.")
    if (draft.participantScope === "Selected" && selectedIds.length === 0) {
      return setError("Choose at least one member, or use All Members.")
    }
    setBusy(true)
    try {
      const created = await ctx.service.createContribution(
        organizationId,
        { ...draft, participants: await roster() },
        ctx.ctx,
      )
      ctx.notify(`${created.name} created`)
      ctx.retry()
      ctx.navigate("contribution-detail", created.id)
    } catch {
      setError("The contribution could not be created.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel title="New contribution" subtitle="Five questions. Everything else follows from your answers.">
      <div className="create-form">
        <div className="form-grid">
          <Field label="Contribution name" value={draft.name} placeholder="e.g. Ikeja Daily Ajo Savings" onChange={(value) => patch({ name: value })} />
          <label className="field">
            <span>Description (optional)</span>
            <input value={draft.description ?? ""} placeholder="What is this contribution for?" onChange={(event) => patch({ description: event.target.value })} />
          </label>
        </div>

        <Question label="What type of contribution is this?">
          <ChoiceRow options={TYPE_OPTIONS} value={draft.type} onChange={(type) => patch({ type })} />
          <div className="form-grid">
            {draft.type === "Fixed" && (
              <NumField lead label="Amount per contribution" value={draft.fixedAmount ?? 0} onChange={(value) => patch({ fixedAmount: value })} />
            )}
            {draft.type === "Flexible" && (
              <NumField lead label="Minimum amount (optional)" value={draft.minimumAmount ?? 0} onChange={(value) => patch({ minimumAmount: value })} />
            )}
            {draft.type === "Target" && (
              <NumField lead label="Target amount" value={draft.targetAmount ?? 0} onChange={(value) => patch({ targetAmount: value })} />
            )}
          </div>
        </Question>

        <Question label="How does it work?">
          <ChoiceRow options={FORM_OPTIONS} value={draft.form} onChange={(form) => patch({ form })} />
          <p className="contribution-hint">
            {draft.form === "General"
              ? "Everyone contributes into one balance. When it is paid out, the money goes to the recipient you choose below."
              : "Each member has their own balance and you can pay any of them out on their own."}
          </p>
        </Question>

        <Question label="How often do people contribute?">
          <ChoiceRow
            options={FREQUENCY_MODE_OPTIONS}
            value={draft.frequencyBased ? "scheduled" : "anytime"}
            onChange={(mode) => patch({ frequencyBased: mode === "scheduled", frequency: mode === "scheduled" ? "Daily" : "None" })}
          />
          {draft.frequencyBased && (
            <>
              <ChoiceRow
                options={FREQUENCIES.map((id) => ({
                  id,
                  label: id,
                  hint:
                    id === "Daily" ? "Every day" : id === "Weekly" ? "Once a week" : id === "Monthly" ? "Once a month" : "Your own interval",
                }))}
                value={draft.frequency}
                onChange={(frequency) => patch({ frequency })}
              />
              {draft.frequency === "Custom" && (
                <div className="form-grid">
                  <Field
                    label="Call it"
                    value={draft.customFrequency?.label ?? ""}
                    placeholder="e.g. Every 10 days"
                    onChange={(value) => patch({ customFrequency: { label: value, days: draft.customFrequency?.days ?? 10 } })}
                  />
                  <NumField
                    label="Repeat every (days)"
                    value={draft.customFrequency?.days ?? 10}
                    onChange={(value) => patch({ customFrequency: { label: draft.customFrequency?.label ?? "", days: value } })}
                  />
                </div>
              )}
              {expected && <p className="contribution-hint">{expected}</p>}
            </>
          )}
        </Question>

        <Question label="Who can participate?">
          <ChoiceRow
            options={SCOPE_OPTIONS}
            value={draft.participantScope}
            onChange={(participantScope) => patch({ participantScope })}
          />
          {draft.participantScope === "Selected" && (
            <div className="create-members">
              <div className="contribution-filters">
                <SearchInput value={memberQuery} onChange={setMemberQuery} placeholder="Search members" />
                <select
                  aria-label="Add everyone from a group"
                  value=""
                  onChange={(event) => {
                    if (event.target.value) void addGroup(event.target.value)
                  }}
                >
                  <option value="">Add everyone from a group…</option>
                  {(groupsResource.data ?? []).map((group) => (
                    <option key={group.id} value={group.id}>{group.name}</option>
                  ))}
                </select>
                <button type="button" className="entity-select-create" onClick={() => navigate("groups")}>+ Create group</button>
                <span className="contribution-sub">{selectedIds.length} selected</span>
              </div>
              <ul className="create-member-list">
                {visibleMembers.map((member) => (
                  <li key={member.id}>
                    <label>
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(member.id)}
                        onChange={() =>
                          setSelectedIds((current) =>
                            current.includes(member.id) ? current.filter((id) => id !== member.id) : [...current, member.id],
                          )
                        }
                      />
                      <span>{member.name}</span>
                      <small>{member.group}</small>
                    </label>
                  </li>
                ))}
                {visibleMembers.length === 0 && <li className="contribution-hint">No member matches that search.</li>}
              </ul>
            </div>
          )}
          {draft.participantScope === "Open" && (
            <p className="contribution-hint">
              A public link is created with this contribution. Anyone who opens it can contribute, with or without an account.
            </p>
          )}
        </Question>

        <Question label="Where does the money go?">
          <label className="field">
            <span>Recipient</span>
            <select
              value={draft.recipient.kind}
              onChange={(event) => patchRecipient({ kind: event.target.value as ContributionRecipient["kind"], accountId: "", accountName: "", memberId: "", memberName: "", label: "" })}
            >
              {RECIPIENT_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
          </label>
          {draft.recipient.kind === "organization" && (
            <label className="field">
              <span>Account or wallet</span>
              <select
                value={draft.recipient.accountId ?? ""}
                onChange={(event) => {
                  const option = walletOptions.find((item) => item.id === event.target.value)
                  patchRecipient({ accountId: event.target.value, accountName: option?.accountName ?? "" })
                }}
              >
                <option value="">Select an account or wallet…</option>
                {walletOptions.map((option) => (
                  <option key={option.id} value={option.id}>{option.display}</option>
                ))}
              </select>
            </label>
          )}
          {draft.recipient.kind === "member" && (
            <label className="field">
              <span>Member</span>
              <select
                value={draft.recipient.memberId ?? ""}
                onChange={(event) => {
                  const person = members.find((member) => member.id === event.target.value)
                  patchRecipient({ memberId: event.target.value, memberName: person?.name ?? "" })
                }}
              >
                <option value="">Select a member…</option>
                {activeMembers.map((member) => (
                  <option key={member.id} value={member.id}>{member.name}</option>
                ))}
              </select>
            </label>
          )}
          <p className="contribution-hint">
            {recipientLabel(draft.recipient)}
            {draft.form === "Personal" && draft.recipient.kind !== "contributor"
              ? " — each member's balance is still kept separately, and pays out to this recipient."
              : ""}
          </p>
        </Question>

        <Disclosure label="Advanced (optional)">
          <div className="create-form">
            <div className="form-grid">
              <Field label="Start date" type="date" value={draft.startDate} onChange={(value) => patch({ startDate: value })} />
              {draft.frequencyBased && (
                <Field label="Ends on (optional)" type="date" value={draft.endDate ?? ""} onChange={(value) => patch({ endDate: value })} />
              )}
            </div>

            <div className="form-grid">
              <label className="field">
                <span>Commission</span>
                <select
                  value={draft.commission.model}
                  onChange={(event) => {
                    const model = event.target.value as ContributionCommission["model"]
                    patch({ commission: { ...draft.commission, model } })
                  }}
                >
                  {COMMISSION_MODEL_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>{option.label}</option>
                  ))}
                </select>
              </label>
              {draft.commission.model === "percentage" && (
                <NumField
                  label="Commission (%)"
                  value={draft.commission.percentage ?? 0}
                  onChange={(value) => patch({ commission: { ...draft.commission, percentage: value } })}
                />
              )}
              {draft.commission.model === "fixed" && (
                <NumField
                  label="Commission amount"
                  value={draft.commission.fixedAmount ?? 0}
                  onChange={(value) => patch({ commission: { ...draft.commission, fixedAmount: value } })}
                />
              )}
              <NumField
                label="Payouts above this need a second approver"
                value={draft.payout.approvalThreshold}
                onChange={(value) => patch({ payout: { ...draft.payout, approvalThreshold: value } })}
              />
            </div>
            <p className="contribution-hint">
              {draft.form === "Personal"
                ? "Commission is deducted at payout: gross balance − commission − fees = net payout."
                : "Commission only applies to Personal contributions, so a General pool always pays out in full."}
            </p>

            <div className="form-grid">
              <label className="field">
                <span>Payout</span>
                <select
                  value={draft.payout.mode}
                  onChange={(event) => {
                    const mode = event.target.value as "manual" | "scheduled"
                    patch({ payout: { ...draft.payout, mode, scheduledDate: mode === "scheduled" ? draft.payout.scheduledDate ?? toISODate(new Date()) : undefined } })
                  }}
                >
                  <option value="manual">Manual, on request</option>
                  <option value="scheduled">Automatic on a date</option>
                </select>
              </label>
              {draft.payout.mode === "scheduled" && (
                <Field
                  label="First payout date"
                  type="date"
                  value={draft.payout.scheduledDate ?? ""}
                  onChange={(value) => patch({ payout: { ...draft.payout, scheduledDate: value } })}
                />
              )}
            </div>

            <div className="create-question">
              <div className="create-q">How people can pay</div>
              <div className="create-methods">
                {PAYMENT_METHOD_CATALOG.map((method) => (
                  <label key={method.id}>
                    <input
                      type="checkbox"
                      checked={draft.paymentMethods.includes(method.id)}
                      disabled={method.id === "wallet" && !walletEnabled}
                      onChange={() =>
                        patch({
                          paymentMethods: draft.paymentMethods.includes(method.id)
                            ? draft.paymentMethods.filter((id) => id !== method.id)
                            : [...draft.paymentMethods, method.id as ContributionPaymentMethodId],
                        })
                      }
                    />
                    <span>{method.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </Disclosure>

        <div className="create-footer">
          <span className="contribution-hint">
            {draft.participantScope === "Open"
              ? "Anyone can contribute through the link."
              : `${rosterCount} ${rosterCount === 1 ? "person" : "people"} will be on this contribution.`}
          </span>
          <div className="create-actions">
            {error && <span className="field-error">{error}</span>}
            <Button onClick={submit} disabled={busy}>
              {busy ? "Creating…" : "Create contribution"}
            </Button>
          </div>
        </div>
      </div>
    </Panel>
  )
}

function Question({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="create-question">
      <div className="create-q">{label}</div>
      {children}
    </div>
  )
}

function ChoiceRow<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { id: T; label: string; hint?: string }[]
  value: T
  onChange: (id: T) => void
}) {
  return (
    <div className="choice-row">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          className="choice"
          aria-pressed={value === option.id}
          onClick={() => onChange(option.id)}
        >
          <b>{option.label}</b>
          {option.hint && <small>{option.hint}</small>}
        </button>
      ))}
    </div>
  )
}

function NumField({
  label,
  value,
  onChange,
  lead,
}: {
  label: string
  value: number
  onChange: (value: number) => void
  /** The one amount the whole plan hinges on — the expected or target contribution. */
  lead?: boolean
}) {
  return (
    <label className={lead ? "field field-lead" : "field"}>
      <span>{label}</span>
      <input
        type="number"
        min={0}
        value={Number.isNaN(value) ? "" : value}
        onChange={(event) => onChange(event.target.value === "" ? 0 : round2(Number(event.target.value)))}
      />
    </label>
  )
}
