import { useState } from "react"
import { useOrganizationId } from "@/hooks/useOrganizationId"
import { GitBranch, UserPlus } from "@/icons"
import { Button, SectionHeader, SelectField } from "@/components/ui"
import {
  AccessDeniedState,
  ErrorState,
  LoadingState,
} from "@/components/feedback/AsyncState"
import { useAuthorization } from "@/features/administrators/hooks/useAuthorization"
import { useMembers } from "@/features/members/hooks/useMembers"
import { useBranch, useBranches } from "../hooks/useBranches"
import { BranchStatusBadge } from "./BranchStatusBadge"
import { GroupStatusBadge } from "@/features/groups/components/GroupStatusBadge"
import { BranchForm } from "./BranchForm"
import type { CreateBranchInput } from "@/types"

export function BranchDetailsPage({
  branchId,
  onViewGroup,
}: {
  branchId: string
  onViewGroup: (id: string) => void
}) {
  const organizationId = useOrganizationId()
  const {
    branch,
    members,
    groups,
    administrators,
    status,
    error,
    retry,
    addMember,
    removeMember,
  } = useBranch(organizationId, branchId)
  const { can } = useAuthorization()
  const { branches, updateBranch } = useBranches(organizationId)
  const { members: allMembers } = useMembers(organizationId)
  const [tab, setTab] = useState("Overview")
  const [editOpen, setEditOpen] = useState(false)
  const [memberName, setMemberName] = useState("Select member")
  const branchMemberIds = new Set(members.map((member) => member.id))
  const availableMembers = allMembers.filter(
    (member) => !branchMemberIds.has(member.id),
  )

  if (status === "loading") return <LoadingState label="Loading branch…" />
  if (status === "error" || !branch)
    return <ErrorState message={error ?? "Branch not found."} retry={retry} />
  if (!can("branches.view", branch.id)) return <AccessDeniedState />
  const parent = branches.find((item) => item.id === branch.parentBranchId)

  return (
    <div className="page">
      <SectionHeader
        eyebrow={branch.code ?? "BRANCH"}
        title={branch.name}
        description={branch.description ?? "Organization branch"}
        actions={
          <>
            <BranchStatusBadge status={branch.status} />
            {can("branches.update", branch.id) && (
              <Button variant="secondary" onClick={() => setEditOpen(true)}>
                Edit branch
              </Button>
            )}
          </>
        }
      />
      <div className="tabs">
        {["Overview", "Members", "Groups", "Administrators", "Activity"].map(
          (item) => (
            <button
              type="button"
              key={item}
              className={tab === item ? "active" : ""}
              onClick={() => setTab(item)}
            >
              {item}
            </button>
          ),
        )}
      </div>
      {tab === "Overview" && (
        <div className="profile-grid">
          <section className="panel">
            <div className="panel-head">
              <div>
                <b>Branch information</b>
                <span>Structure and contact details</span>
              </div>
            </div>
            <div className="detail-grid">
              <div>
                <span>Parent branch</span>
                <b>{parent?.name ?? "Organization"}</b>
              </div>
              <div>
                <span>Members</span>
                <b>{branch.memberCount}</b>
              </div>
              <div>
                <span>Groups</span>
                <b>{branch.groupCount}</b>
              </div>
              <div>
                <span>Administrators</span>
                <b>{branch.administratorCount}</b>
              </div>
              <div>
                <span>Email</span>
                <b>{branch.email ?? "Not provided"}</b>
              </div>
              <div>
                <span>Phone</span>
                <b>{branch.phone ?? "Not provided"}</b>
              </div>
            </div>
          </section>
          <section className="panel">
            <div className="panel-head">
              <div>
                <b>Recent activity</b>
                <span>Structural and administrative changes</span>
              </div>
            </div>
            <div className="activity-row">
              <div>
                <b>Branch details reviewed</b>
                <span>Today · Admin User</span>
              </div>
            </div>
          </section>
        </div>
      )}
      {tab === "Members" && (
        <section className="panel">
          <div className="panel-head">
            <div>
              <b>Branch members</b>
              <span>Primary branch relationships</span>
            </div>
            {can("branches.update", branch.id) && availableMembers.length > 0 && (
              <div className="inline-add-control">
                <SelectField
                  label="Add member"
                  value={memberName}
                  options={[
                    "Select member",
                    ...availableMembers.map((member) => member.name),
                  ]}
                  onChange={setMemberName}
                />
                <Button
                  icon={UserPlus}
                  disabled={memberName === "Select member"}
                  onClick={() => {
                    const member = availableMembers.find(
                      (item) => item.name === memberName,
                    )
                    if (!member) return
                    void addMember(member.id).then(() => {
                      setMemberName("Select member")
                      retry()
                    })
                  }}
                >
                  Add
                </Button>
              </div>
            )}
          </div>
          <div className="document-table">
            {members.map((member) => (
              <div className="document-row" key={member.id}>
                <div className="mini-avatar">{member.initials}</div>
                <div>
                  <b>{member.name}</b>
                  <span>
                    {member.id} · {member.phone}
                  </span>
                </div>
                {can("branches.update", branch.id) && (
                  <Button
                    variant="ghost"
                    onClick={() =>
                      void removeMember(member.id).then(() => retry())
                    }
                  >
                    Remove
                  </Button>
                )}
              </div>
            ))}
            {members.length === 0 && (
              <p className="contribution-hint" style={{ padding: 14 }}>
                No members are assigned to this branch yet.
              </p>
            )}
          </div>
        </section>
      )}
      {tab === "Groups" && (
        <section className="panel">
          <div className="panel-head">
            <div>
              <b>Branch groups</b>
              <span>Groups associated with this branch</span>
            </div>
          </div>
          <div className="document-table">
            {groups.map((group) => (
              <div className="document-row" key={group.id}>
                <div className="doc-icon">
                  <GitBranch size={16} />
                </div>
                <div>
                  <b>{group.name}</b>
                  <span>{group.memberCount} members</span>
                </div>
                <GroupStatusBadge status={group.status} />
                <Button variant="ghost" onClick={() => onViewGroup(group.id)}>
                  View
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}
      {tab === "Administrators" && (
        <section className="panel">
          <div className="panel-head">
            <div>
              <b>Branch administrators</b>
              <span>Access scoped to this branch</span>
            </div>
          </div>
          <div className="document-table">
            {administrators.map((administrator) => (
              <div className="document-row" key={administrator.id}>
                <div className="mini-avatar">
                  {administrator.name
                    .split(" ")
                    .map((part) => part[0])
                    .join("")
                    .slice(0, 2)}
                </div>
                <div>
                  <b>{administrator.name}</b>
                  <span>{administrator.email}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
      {tab === "Activity" && (
        <div className="tab-empty">
          <GitBranch size={24} />
          <b>Branch activity</b>
          <span>Branch changes will appear here.</span>
        </div>
      )}
      <BranchForm
        key={editOpen ? `edit-${branch.updatedAt}` : "closed"}
        open={editOpen}
        branch={branch}
        branches={branches}
        onClose={() => setEditOpen(false)}
        onSubmit={async (input: CreateBranchInput) => {
          await updateBranch(branch.id, input)
          retry()
        }}
      />
    </div>
  )
}
