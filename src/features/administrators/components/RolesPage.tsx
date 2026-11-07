import { useState } from "react"
import { env } from "@/app/config/env"
import { useOrganizationId } from "@/hooks/useOrganizationId"
import { Check, ChevronRight, Plus, ShieldCheck } from "@/icons"
import { ErrorState, LoadingState } from "@/components/feedback/AsyncState"
import { Button, Field, Modal, SectionHeader, SelectField } from "@/components/ui"
import { useAdministrators } from "../hooks/useAdministrators"
import { useAuthorization } from "../hooks/useAuthorization"
import { useWorkspace } from "@/app/providers/WorkspaceProvider"
import { scopedPermissionGroups } from "@/lib/permissions/permission-catalog"
import type { Permission, Role } from "@/types"

export function RolesPage({
  selectedRoleId,
  onSelectRole,
  notify,
}: {
  selectedRoleId?: string
  onSelectRole: (id: string) => void
  notify: (message: string) => void
}) {
  const organizationId = useOrganizationId()
  const { roles, status, error, retry, updateRole, createRole } = useAdministrators(organizationId)
  const { can } = useAuthorization()
  const { enabledModules } = useWorkspace()
  const selected = roles.find((role) => role.id === selectedRoleId) ?? roles[0]
  const [draft, setDraft] = useState<Role | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [newRoleName, setNewRoleName] = useState("")
  const [newRoleScope, setNewRoleScope] = useState<Role["scope"]>("organization")
  const role = draft?.id === selected?.id ? draft : selected

  if (status === "loading") return <LoadingState label="Loading roles…" />
  if (status === "error") return <ErrorState message={error ?? "Roles could not be loaded."} retry={retry} />
  if (!role) return null

  const togglePermission = (permission: Permission) => {
    if (!can("roles.update") || role.isSystemRole) return
    setDraft({
      ...role,
      permissions: role.permissions.includes(permission)
        ? role.permissions.filter((item) => item !== permission)
        : [...role.permissions, permission],
    })
  }

  return (
    <div className="page">
      <SectionHeader
        eyebrow="SETTINGS"
        title="Roles & permissions"
        description="Configure reusable administrator roles and access boundaries."
        actions={
          <>
            {can("roles.create") && (
              <Button variant="secondary" icon={Plus} onClick={() => setCreateOpen(true)}>
                Create role
              </Button>
            )}
            {can("roles.update") && (
              <Button
                disabled={!draft || draft.isSystemRole}
                onClick={() =>
                  draft &&
                  void updateRole(draft).then(() => {
                    setDraft(null)
                    notify("Role permissions updated")
                  })
                }
              >
                Save changes
              </Button>
            )}
          </>
        }
      />
      <div className="roles-layout">
        <section className="panel role-list">
          <div className="panel-head">
            <div>
              <b>Roles</b>
              <span>{roles.length} configured</span>
            </div>
          </div>
          {roles.map((item) => (
            <button
              type="button"
              className={item.id === role.id ? "active" : ""}
              onClick={() => {
                setDraft(null)
                onSelectRole(item.id)
              }}
              key={item.id}
            >
              <div className="role-icon">
                <ShieldCheck size={16} />
              </div>
              <div>
                <b>{item.name}</b>
                <span>
                  {item.scope} scope · {item.permissions.length} permissions
                </span>
              </div>
              <ChevronRight size={15} />
            </button>
          ))}
        </section>
        <section className="panel permission-panel">
          <div className="panel-head">
            <div>
              <b>{role.name}</b>
              <span>{role.description}</span>
            </div>
            <span className="scope-label">{role.scope} scope</span>
          </div>
          <div className="permission-matrix">
            {scopedPermissionGroups(new Set(enabledModules), role.scope).map((group) => (
              <div className="permission-domain" key={group.label}>
                <div className="permission-domain-title">{group.label}</div>
                <div>
                  {group.permissions.map((permission) => {
                    const enabled = role.permissions.includes(permission)
                    return (
                      <button
                        type="button"
                        key={permission}
                        className={enabled ? "enabled" : ""}
                        disabled={!can("roles.update") || role.isSystemRole}
                        onClick={() => togglePermission(permission)}
                      >
                        <span className="permission-check">{enabled && <Check size={13} />}</span>
                        <span>{permission.split(".")[1].replace(/_/g, " ")}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
      {createOpen && (
        <Modal title="Create role" onClose={() => setCreateOpen(false)}>
          <div className="wizard-body">
            <div className="form-grid">
              <Field label="Role name" value={newRoleName} onChange={setNewRoleName} />
              <SelectField
                label="Scope"
                value={newRoleScope}
                options={env.VITE_ENABLE_MOCKS ? ["organization", "branch"] : ["organization"]}
                onChange={(value) => setNewRoleScope(value as Role["scope"])}
              />
            </div>
          </div>
          <div className="wizard-footer">
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={newRoleName.trim().length < 2}
              onClick={() =>
                void createRole({
                  name: newRoleName.trim(),
                  description: "Custom organization role.",
                  scope: newRoleScope,
                  permissions: [],
                }).then((created) => {
                  setCreateOpen(false)
                  setNewRoleName("")
                  onSelectRole(created.id)
                  notify("Role created")
                })
              }
            >
              Create role
            </Button>
          </div>
        </Modal>
      )}
    </div>
  )
}
