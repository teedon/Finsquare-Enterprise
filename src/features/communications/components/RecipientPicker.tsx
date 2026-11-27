import { useMemo, useState } from "react"
import { Button } from "@/components/ui"
import { SearchInput } from "@/components/data-display/ManagementPrimitives"
import { GitBranch, Network } from "@/icons"
import { useAppRoute } from "@/app/routes/useAppRoute"
import type { RecipientSelection } from "../domain/recipients"
import type { CommunicationsCtx } from "../hooks/useCommunications"
import type { ResolvedRecipient } from "../types/message.types"
import type { MemberStatus } from "@/types"

const STATUSES: (MemberStatus | "All")[] = ["All", "Active", "Pending", "Suspended", "Inactive"]

type Reach = "everyone" | "groups" | "branches" | "people"

/**
 * Who the message goes to.
 *
 * Three ways of reaching people — everyone, a group or branch, or specific members — and the count
 * is always shown before sending, because the count *is* the cost. Everything here is a selection,
 * so picking a group and a branch that overlap still messages each person once.
 */
export function RecipientPicker({
  ctx,
  selection,
  onChange,
  recipients,
}: {
  ctx: CommunicationsCtx
  selection: RecipientSelection
  onChange: (next: RecipientSelection) => void
  /** Resolved by the composer, so the count shown here and the cost charged are the same list. */
  recipients: ResolvedRecipient[]
}) {
  const [reach, setReach] = useState<Reach>(selection.allMembers ? "everyone" : "people")
  const [query, setQuery] = useState("")
  const { navigate } = useAppRoute()

  const visibleMembers = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return ctx.members
    return ctx.members.filter(
      (member) =>
        member.name.toLowerCase().includes(needle) ||
        member.id.toLowerCase().includes(needle) ||
        member.phone.toLowerCase().includes(needle),
    )
  }, [ctx.members, query])

  const patch = (next: Partial<RecipientSelection>) => onChange({ ...selection, ...next })

  const chooseReach = (next: Reach) => {
    setReach(next)
    if (next === "everyone") {
      // Reaching everyone replaces the other pickers rather than adding to them.
      onChange({ allMembers: true, memberIds: [], groupIds: [], branchIds: [], status: selection.status })
    } else {
      onChange({ ...selection, allMembers: false })
    }
  }

  const toggle = (key: "memberIds" | "groupIds" | "branchIds", id: string) =>
    patch({
      [key]: selection[key].includes(id)
        ? selection[key].filter((value) => value !== id)
        : [...selection[key], id],
    } as Partial<RecipientSelection>)

  const clear = () => {
    setReach("people")
    onChange({ allMembers: false, memberIds: [], groupIds: [], branchIds: [], status: "All" })
  }

  return (
    <div className="create-question">
      <div className="create-q">
        Who is it for?
        <span className="recipient-count">
          {recipients.length} {recipients.length === 1 ? "recipient" : "recipients"}
        </span>
      </div>

      <div className="choice-row">
        {(
          [
            { id: "everyone", label: "All members", hint: "Every member of the organization" },
            { id: "groups", label: "Groups", hint: "Everyone in the groups you pick" },
            { id: "branches", label: "Branches", hint: "Everyone in the branches you pick" },
            { id: "people", label: "Members", hint: "Pick people one by one" },
          ] as { id: Reach; label: string; hint: string }[]
        ).map((option) => (
          <button
            key={option.id}
            type="button"
            className="choice"
            aria-pressed={reach === option.id}
            onClick={() => chooseReach(option.id)}
          >
            <b>{option.label}</b>
            <small>{option.hint}</small>
          </button>
        ))}
      </div>

      {reach === "groups" && (
        <>
        <button type="button" className="entity-select-create" onClick={() => navigate("groups")}>+ Create group</button>
        <ul className="picker-list">
          {ctx.groups.map((group) => (
            <li key={group.id}>
              <label>
                <input
                  type="checkbox"
                  checked={selection.groupIds.includes(group.id)}
                  onChange={() => toggle("groupIds", group.id)}
                />
                <Network size={14} />
                <span>{group.name}</span>
                <small>
                  {group.memberCount} {group.memberCount === 1 ? "member" : "members"}
                </small>
              </label>
            </li>
          ))}
          {ctx.groups.length === 0 && <li className="contribution-hint">No groups in this organization yet.</li>}
        </ul>
        </>
      )}

      {reach === "branches" && (
        <>
        <button type="button" className="entity-select-create" onClick={() => navigate("branches")}>+ Create branch</button>
        <ul className="picker-list">
          {ctx.branches.map((branch) => (
            <li key={branch.id}>
              <label>
                <input
                  type="checkbox"
                  checked={selection.branchIds.includes(branch.id)}
                  onChange={() => toggle("branchIds", branch.id)}
                />
                <GitBranch size={14} />
                <span>{branch.name}</span>
                <small>
                  {branch.memberCount} {branch.memberCount === 1 ? "member" : "members"}
                </small>
              </label>
            </li>
          ))}
          {ctx.branches.length === 0 && <li className="contribution-hint">No branches in this organization yet.</li>}
        </ul>
        </>
      )}

      {reach === "people" && (
        <div className="create-members">
          <div className="contribution-filters">
            <SearchInput value={query} onChange={setQuery} placeholder="Search name, member ID or phone" />
            <select
              aria-label="Filter by member status"
              value={selection.status}
              onChange={(event) => patch({ status: event.target.value as MemberStatus | "All" })}
            >
              {STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status === "All" ? "All statuses" : status}
                </option>
              ))}
            </select>
            <Button
              variant="ghost"
              onClick={() => patch({ memberIds: visibleMembers.map((member) => member.id) })}
            >
              Select all
            </Button>
            <Button variant="ghost" onClick={clear}>
              Clear selection
            </Button>
          </div>
          <ul className="create-member-list">
            {visibleMembers.map((member) => (
              <li key={member.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={selection.memberIds.includes(member.id)}
                    onChange={() => toggle("memberIds", member.id)}
                  />
                  <span>{member.name}</span>
                  <small>
                    {member.group} · {member.phone}
                  </small>
                </label>
              </li>
            ))}
            {visibleMembers.length === 0 && <li className="contribution-hint">No member matches that search.</li>}
          </ul>
        </div>
      )}

      {reach !== "people" && (
        <div className="contribution-filters">
          <select
            aria-label="Filter by member status"
            value={selection.status}
            onChange={(event) => patch({ status: event.target.value as MemberStatus | "All" })}
          >
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {status === "All" ? "All statuses" : status}
              </option>
            ))}
          </select>
          <Button variant="ghost" onClick={clear}>
            Clear selection
          </Button>
        </div>
      )}

      {recipients.length > 0 && (
        <p className="contribution-hint">
          {recipients.length} {recipients.length === 1 ? "person" : "people"} will receive this —{" "}
          {describeReach(selection, ctx)}
        </p>
      )}
    </div>
  )
}

/** A plain-language restatement of the selection, so the count is never a mystery. */
function describeReach(selection: RecipientSelection, ctx: CommunicationsCtx): string {
  if (selection.allMembers) {
    return selection.status === "All"
      ? "every member of the organization"
      : `every member with status ${selection.status}`
  }

  const parts: string[] = []
  if (selection.groupIds.length > 0) {
    const names = ctx.groups.filter((group) => selection.groupIds.includes(group.id)).map((group) => group.name)
    parts.push(names.length > 0 ? names.join(", ") : `${selection.groupIds.length} groups`)
  }
  if (selection.branchIds.length > 0) {
    const names = ctx.branches
      .filter((branch) => selection.branchIds.includes(branch.id))
      .map((branch) => branch.name)
    parts.push(names.length > 0 ? names.join(", ") : `${selection.branchIds.length} branches`)
  }
  if (selection.memberIds.length > 0) {
    parts.push(`${selection.memberIds.length} chosen individually`)
  }
  return parts.join(" + ")
}
