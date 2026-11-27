import { useMemo, useState, type ReactNode } from "react"
import { Disclosure, Field } from "@/components/ui"
import { SearchInput } from "@/components/data-display/ManagementPrimitives"
import { Button, NumField, Panel } from "./DuesUi"
import { useParticipantRoster } from "../hooks/useParticipantRoster"
import { createDuesPlanSchema, firstError } from "../schemas/dues.schema"
import { toISODate } from "../domain/schedule"
import { DUES_FREQUENCIES } from "../types/dues.types"
import { EntitySelectField } from "@/features/organization/components/EntitySelectField"

import type { DuesCtx } from "./DuesUi"
import type {
  CreateDuesPlanInput,
  DuesFrequency,
  DuesLienRules,
  DuesParticipantSelection,
  DuesScope,
} from "../types/dues.types"
interface Draft {
  name: string
  description?: string
  amount: number
  frequency: DuesFrequency
  customFrequency?: {
    label: string
    days: number
  }
  startDate: string
  endDate?: string
  lien: DuesLienRules
}
const SCOPE_OPTIONS: {
  id: DuesScope
  label: string
  hint: string
}[] = [
  { id: "All", label: "All members", hint: "Everyone in the organization" },
  { id: "Selected", label: "Selected members", hint: "Pick people yourself" },
  { id: "Group", label: "An existing group", hint: "Everyone in one group" },
  { id: "Branch", label: "A branch", hint: "Everyone in one branch" },
]
const FREQUENCY_HINTS: Record<string, string> = {
  "One-time": "A single payment",
  Daily: "Every day",
  Weekly: "Once a week",
  Monthly: "Once a month",
  Quarterly: "Every three months",
  Yearly: "Once a year",
  Custom: "Your own interval",
}
/**
 * Creating a plan is one page: how much, how often, who pays — and the options that genuinely
 * change rarely (end date, the wallet lien rules) behind one Advanced disclosure. There is no
 * stepper and no review step: the page is the review, and one button creates the plan.
 */
export function CreateDuesForm({ ctx }: { ctx: DuesCtx }) {
  const [draft, setDraft] = useState<Draft>(() => ({
    name: "",
    amount: 0,
    frequency: "Monthly",
    startDate: toISODate(new Date()),
    lien: { enabled: true, graceDays: 5, autoRecover: true },
  }))
  const [selection, setSelection] = useState<DuesParticipantSelection>({
    scope: "All",
    memberIds: [],
    status: "Active",
  })
  const [memberQuery, setMemberQuery] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const rosterResource = useParticipantRoster(selection)
  const roster = rosterResource.roster
  const patch = (values: Partial<Draft>) => {
    setDraft((current) => ({ ...current, ...values }))
    setError(null)
  }
  const patchSelection = (values: Partial<DuesParticipantSelection>) => {
    setSelection((current) => ({ ...current, ...values }))
    setError(null)
  }
  const visibleMembers = useMemo(() => {
    const needle = memberQuery.trim().toLowerCase()
    if (!needle) return rosterResource.members
    return rosterResource.members.filter(
      (member) => member.name.toLowerCase().includes(needle) || member.id.toLowerCase().includes(needle),
    )
  }, [rosterResource.members, memberQuery])
  const expected = useMemo(() => {
    if (draft.frequency === "One-time")
      return `${roster.length} one-time ${roster.length === 1 ? "charge" : "charges"} of ₦${draft.amount.toLocaleString("en-NG")}.`
    const every =
      draft.frequency === "Custom" ? `every ${draft.customFrequency?.days ?? 0} days` : draft.frequency.toLowerCase()
    return `Each participant owes ₦${draft.amount.toLocaleString("en-NG")} ${every}.`
  }, [draft.amount, draft.customFrequency?.days, draft.frequency, roster.length])
  const submit = async () => {
    const parsed = createDuesPlanSchema.safeParse({
      ...draft,
      scope: selection.scope,
      groupId: selection.groupId,
      branchId: selection.branchId,
      memberIds: selection.memberIds,
      rosterCount: roster.length,
    })
    if (!parsed.success) return setError(firstError(parsed) ?? "Some details still need attention.")
    setBusy(true)
    try {
      const input: CreateDuesPlanInput = {
        name: draft.name,
        description: draft.description,
        amount: draft.amount,
        frequency: draft.frequency,
        customFrequency: draft.frequency === "Custom" ? draft.customFrequency : undefined,
        startDate: draft.startDate,
        endDate: draft.endDate || undefined,
        scope: selection.scope,
        groupId: selection.groupId,
        groupName: rosterResource.groupName,
        branchId: selection.branchId,
        branchName: rosterResource.branchName,
        roster,
        lien: draft.lien,
      }
      const created = await ctx.service.createPlan(ctx.organizationId, input, ctx.ctx)
      ctx.notify(
        `${created.name} created with ${roster.length} ${roster.length === 1 ? "participant" : "participants"}`,
      )
      ctx.navigate("dues-detail", created.id)
    } catch {
      setError("The dues plan could not be created.")
    } finally {
      setBusy(false)
    }
  }
  return (
    <Panel title="New dues plan" subtitle="What is owed, how often, and by whom.">
      <div className="create-form">
        <div className="form-grid">
          <Field
            label="Dues name"
            value={draft.name}
            placeholder="e.g. Monthly Association Dues"
            onChange={(value) => patch({ name: value })}
          />
          <label className="field">
            <span>Description (optional)</span>
            <input
              value={draft.description ?? ""}
              placeholder="What are these dues for?"
              onChange={(event) => patch({ description: event.target.value })}
            />
          </label>
        </div>

        <Question label="How much does each member owe?">
          <div className="form-grid">
            <label className="field field-lead">
              <span>Amount per payment</span>
              <input
                type="number"
                min={0}
                value={Number.isNaN(draft.amount) ? "" : draft.amount}
                onChange={(event) =>
                  patch({
                    amount: event.target.value === "" ? 0 : Number(event.target.value),
                  })
                }
              />
            </label>
          </div>
          <p className="contribution-hint">
            Dues are always a fixed amount. Members can be on several dues plans at once.
          </p>
        </Question>

        <Question label="How often is it due?">
          <ChoiceRow
            options={DUES_FREQUENCIES.map((id) => ({
              id,
              label: id,
              hint: FREQUENCY_HINTS[id],
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
                onChange={(value) =>
                  patch({
                    customFrequency: {
                      label: value,
                      days: draft.customFrequency?.days ?? 10,
                    },
                  })
                }
              />
              <NumField
                label="Repeat every (days)"
                value={draft.customFrequency?.days ?? 10}
                onChange={(value) =>
                  patch({
                    customFrequency: {
                      label: draft.customFrequency?.label ?? "",
                      days: value,
                    },
                  })
                }
              />
            </div>
          )}
          <p className="contribution-hint">{expected}</p>
        </Question>

        <Question label="Who pays these dues?">
          <ChoiceRow options={SCOPE_OPTIONS} value={selection.scope} onChange={(scope) => patchSelection({ scope })} />

          {selection.scope === "Group" && (
            <>
              <EntitySelectField entity="group" label="Group" value={selection.groupId ?? ""} placeholder="Choose a group…" options={rosterResource.groups.map((group) => ({ value: group.id, label: group.name }))} onChange={(groupId) => patchSelection({ groupId: groupId || undefined })} />
              {rosterResource.groupName && (
                <p className="contribution-hint">
                  {rosterResource.groupName} — {roster.length} active {roster.length === 1 ? "member" : "members"}.
                </p>
              )}
            </>
          )}

          {selection.scope === "Branch" && (
            <>
              <EntitySelectField entity="branch" label="Branch" value={selection.branchId ?? ""} placeholder="Choose a branch…" options={rosterResource.branches.map((branch) => ({ value: branch.id, label: branch.name }))} onChange={(branchId) => patchSelection({ branchId: branchId || undefined })} />
              {rosterResource.branchName && (
                <p className="contribution-hint">
                  {rosterResource.branchName} — {roster.length} {roster.length === 1 ? "member" : "members"}.
                </p>
              )}
            </>
          )}

          {selection.scope === "Selected" && (
            <div className="create-members">
              <div className="contribution-filters">
                <SearchInput value={memberQuery} onChange={setMemberQuery} placeholder="Search members" />
                <select
                  aria-label="Member status"
                  value={selection.status}
                  onChange={(event) =>
                    patchSelection({
                      status: event.target.value as DuesParticipantSelection["status"],
                    })
                  }
                >
                  {["All", "Active", "Pending", "Suspended", "Inactive"].map((option) => (
                    <option key={option} value={option}>
                      {option === "All" ? "Any status" : option}
                    </option>
                  ))}
                </select>
                <span className="contribution-sub">{selection.memberIds.length} selected</span>
              </div>
              <ul className="create-member-list">
                {visibleMembers.map((member) => (
                  <li key={member.id}>
                    <label>
                      <input
                        type="checkbox"
                        checked={selection.memberIds.includes(member.id)}
                        onChange={() =>
                          patchSelection({
                            memberIds: selection.memberIds.includes(member.id)
                              ? selection.memberIds.filter((id) => id !== member.id)
                              : [...selection.memberIds, member.id],
                          })
                        }
                      />
                      <span>{member.name}</span>
                      <small>{member.branchName ?? member.group}</small>
                    </label>
                  </li>
                ))}
                {visibleMembers.length === 0 && <li className="contribution-hint">No member matches that search.</li>}
              </ul>
            </div>
          )}

          {rosterResource.status === "error" && <p className="field-error">{rosterResource.error}</p>}
        </Question>

        <Disclosure label="Advanced (optional)">
          <div className="create-form">
            <div className="form-grid">
              <Field
                label="Start date"
                type="date"
                value={draft.startDate}
                onChange={(value) => patch({ startDate: value })}
              />
              <Field
                label="Ends on (optional)"
                type="date"
                value={draft.endDate ?? ""}
                onChange={(value) => patch({ endDate: value })}
              />
            </div>
            <p className="contribution-hint">
              Leave the end date empty and the plan runs until it is paused or closed.
            </p>

            <div className="create-question">
              <div className="create-q">Collecting unpaid dues from the member&apos;s wallet</div>
              <div className="form-grid">
                <label className="field">
                  <span>Wallet lien</span>
                  <select
                    value={draft.lien.enabled ? "yes" : "no"}
                    onChange={(event) =>
                      patch({
                        lien: {
                          ...draft.lien,
                          enabled: event.target.value === "yes",
                        },
                      })
                    }
                  >
                    <option value="yes">Apply a lien to unpaid dues</option>
                    <option value="no">Track outstanding dues only</option>
                  </select>
                </label>
                <NumField
                  label="Grace period (days after the due date)"
                  value={draft.lien.graceDays}
                  onChange={(value) =>
                    patch({
                      lien: {
                        ...draft.lien,
                        graceDays: Math.max(0, Math.round(value || 0)),
                      },
                    })
                  }
                />
                <label className="field">
                  <span>Collection</span>
                  <select
                    value={draft.lien.autoRecover ? "auto" : "manual"}
                    onChange={(event) =>
                      patch({
                        lien: {
                          ...draft.lien,
                          autoRecover: event.target.value === "auto",
                        },
                      })
                    }
                  >
                    <option value="auto">Automatic when the wallet has funds</option>
                    <option value="manual">Only when an administrator recovers</option>
                  </select>
                </label>
              </div>
              <p className="contribution-hint">
                A lien claims the member&apos;s own wallet when dues are late — never more than the amount owed, and
                only ever money that is actually there.
              </p>
            </div>
          </div>
        </Disclosure>

        <div className="create-footer">
          <span className="contribution-hint">
            {roster.length} {roster.length === 1 ? "member" : "members"} will be on this plan.
          </span>
          <div className="create-actions">
            {error && <span className="field-error">{error}</span>}
            <Button onClick={submit} disabled={busy}>
              {busy ? "Creating…" : "Create dues plan"}
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
  options: {
    id: T
    label: string
    hint?: string
  }[]
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
