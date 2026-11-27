import { useState } from "react"
import { ShieldCheck } from "@/icons"
import { useBranches } from "@/features/branches/hooks/useBranches"
import { EntitySelectField } from "@/features/organization/components/EntitySelectField"
import { ErrorState, LoadingState } from "@/components/feedback/AsyncState"
import { ConfirmDialog } from "@/components/feedback/ConfirmDialog"
import { Button, SectionHeader, SelectField } from "@/components/ui"
import { useAdministrator, useAdministrators } from "../hooks/useAdministrators"
import { useAuthorization } from "../hooks/useAuthorization"
import { AdministratorStatusBadge } from "./AdministratorStatusBadge"
import { useOrganizationId } from "@/hooks/useOrganizationId"

export function AdministratorDetailsPage({
  administratorId,
}: {
  administratorId: string
}) {
  const organizationId = useOrganizationId()
  const {
    data: administrator,
    status,
    error,
    retry,
  } = useAdministrator(organizationId, administratorId)
  const { roles, update, deactivate } = useAdministrators(organizationId)
  // Branch names and options belong to the community being managed, so they come from the service.
  const { branches } = useBranches(organizationId)
  const { can } = useAuthorization()
  const [editing, setEditing] = useState(false)
  const [roleName, setRoleName] = useState("")
  const [scopeType, setScopeType] = useState<"organization" | "branch">(
    "organization",
  )
  const [branchName, setBranchName] = useState("")
  const [confirmDeactivate, setConfirmDeactivate] = useState(false)
  if (status === "loading")
    return <LoadingState label="Loading administrator…" />
  if (status === "error" || !administrator)
    return (
      <ErrorState message={error ?? "Administrator not found."} retry={retry} />
    )

  return (
    <div className="page">
      <SectionHeader
        eyebrow="ADMINISTRATOR"
        title={administrator.name}
        description={administrator.email}
        actions={
          <>
            <AdministratorStatusBadge status={administrator.status} />
            {can("administrators.update") && (
              <Button
                variant="secondary"
                onClick={() => {
                  setRoleName(
                    roles.find((role) =>
                      administrator.roleIds.includes(role.id),
                    )?.name ?? "",
                  )
                  setScopeType(administrator.accessScope.type)
                  setBranchName(
                    branches.find((branch) =>
                      administrator.accessScope.branchIds?.includes(branch.id),
                    )?.name ?? branches[0].name,
                  )
                  setEditing(!editing)
                }}
              >
                Edit access
              </Button>
            )}
            {can("administrators.suspend") &&
              administrator.status !== "deactivated" && (
                <Button
                  variant="ghost"
                  onClick={() => setConfirmDeactivate(true)}
                >
                  Deactivate
                </Button>
              )}
          </>
        }
      />
      <div className="profile-grid">
        <section className="panel">
          <div className="panel-head">
            <div>
              <b>Access details</b>
              <span>Roles and scope assigned to this administrator</span>
            </div>
          </div>
          <div className="detail-grid">
            <div>
              <span>Roles</span>
              <b>
                {administrator.roleIds
                  .map((id) => roles.find((role) => role.id === id)?.name)
                  .filter(Boolean)
                  .join(", ")}
              </b>
            </div>
            <div>
              <span>Scope</span>
              <b>
                {administrator.accessScope.type === "organization"
                  ? "Entire organization"
                  : "Specific branches"}
              </b>
            </div>
            <div>
              <span>Branches</span>
              <b>
                {administrator.accessScope.branchIds
                  ?.map(
                    (id) =>
                      branches.find((branch) => branch.id === id)?.name,
                  )
                  .join(", ") ?? "All branches"}
              </b>
            </div>
            <div>
              <span>Last active</span>
              <b>
                {administrator.lastActiveAt
                  ? new Date(administrator.lastActiveAt).toLocaleString()
                  : "Never"}
              </b>
            </div>
          </div>
          {editing && (
            <div className="access-editor">
              <SelectField
                label="Role"
                value={roleName}
                options={roles.map((role) => role.name)}
                onChange={setRoleName}
              />
              <SelectField
                label="Scope"
                value={scopeType}
                options={["organization", "branch"]}
                onChange={(value) =>
                  setScopeType(value as "organization" | "branch")
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
              <Button
                onClick={() => {
                  const roleId = roles.find((role) => role.name === roleName)
                    ?.id
                  const branchId = branches.find(
                    (branch) => branch.name === branchName,
                  )?.id
                  if (!roleId) return
                  void update(administrator.id, {
                    roleIds: [roleId],
                    accessScope: {
                      type: scopeType,
                      organizationId,
                      branchIds:
                        scopeType === "branch" && branchId
                          ? [branchId]
                          : undefined,
                    },
                  }).then(() => {
                    retry()
                    setEditing(false)
                  })
                }}
              >
                Save access
              </Button>
            </div>
          )}
        </section>
        <section className="panel">
          <div className="panel-head">
            <div>
              <b>Audit identity</b>
              <span>Historical actions remain attributable</span>
            </div>
          </div>
          <div className="access-explain">
            <ShieldCheck size={17} />
            <span>
              Suspending or deactivating this administrator does not remove
              their historical activity.
            </span>
          </div>
        </section>
      </div>
      <ConfirmDialog
        open={confirmDeactivate}
        title="Deactivate administrator?"
        description="Access will be permanently disabled, but the administrator’s identity and historical activity will be preserved."
        confirmLabel="Deactivate administrator"
        destructive
        onClose={() => setConfirmDeactivate(false)}
        onConfirm={() =>
          void deactivate(administrator.id).then(() => {
            retry()
            setConfirmDeactivate(false)
          })
        }
      />
    </div>
  )
}
