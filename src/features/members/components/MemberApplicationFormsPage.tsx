import { useState } from "react"
import { Download, Pencil, Plus } from "@/icons"
import { ShellPage } from "@/components/layout/ShellPage"
import { Button, Field, SelectField } from "@/components/ui"
import { ErrorState, LoadingState } from "@/components/feedback/AsyncState"
import { FormBuilder } from "@/features/forms/components/FormBuilder"
import { QuestionLibraryManager } from "@/features/forms/components/QuestionLibrary"
import { publishedVersion, workingVersion } from "@/features/forms/domain/forms"
import { useQuestionLibrary } from "@/features/forms/hooks/useQuestionLibrary"
import { ActionModal, PagedTable, Panel, Tabs, fmtDate } from "@/features/loans/components/LoanUi"
import { printDocument } from "@/features/wallet/domain/export"
import { useAuthorization } from "@/features/administrators/hooks/useAuthorization"
import { useGroups } from "@/features/groups/hooks/useGroups"
import { useOrganizationId } from "@/hooks/useOrganizationId"
import { useMemberApplications } from "../hooks/useMemberApplications"
import { applicationLinkLive } from "../domain/member-application.rules"
import { formExportHtml } from "../domain/form-export"
import { memberApplicationFormSchema } from "../schemas/member-application.schema"
import { JoinModeBadge, LinkStateBadge } from "./MemberApplicationUi"
import { MEMBER_JOIN_MODES } from "../types/member-application.types"
import { EntitySelectField } from "@/features/organization/components/EntitySelectField"
import type { FormVersion } from "@/features/forms/types/form.types"
import type { MemberApplicationForm, MemberJoinMode } from "../types/member-application.types"

type Editing = { form: MemberApplicationForm; version: FormVersion }

const linkFor = (slug: string) => `${window.location.origin}/join/${slug}`

/**
 * Where an organization builds the form new members fill in. Reuses the loan form builder, so the
 * steps, questions, question library and preview behave exactly as they do for a loan application.
 */
export function MemberApplicationFormsPage({ notify }: { notify: (message: string) => void }) {
  const organizationId = useOrganizationId()
  const { data, status, error, retry, service } = useMemberApplications(organizationId)
  const questionLibrary = useQuestionLibrary(organizationId)
  const { groups } = useGroups(organizationId)
  const { can } = useAuthorization()
  const [tab, setTab] = useState<"forms" | "library">("forms")
  const [editing, setEditing] = useState<Editing | null>(null)
  const [creating, setCreating] = useState(false)
  const [publishing, setPublishing] = useState<Editing | null>(null)

  const canManage = can("members.manage_forms")
  const activeGroups = groups.filter((group) => group.status === "active")
  const defaultGroupId = activeGroups[0]?.id ?? ""
  const groupName = (id: string) => groups.find((group) => group.id === id)?.name ?? "—"
  const library = questionLibrary.api(canManage, notify)

  if (status === "loading" || status === "idle") return <LoadingState label="Loading application forms…" />
  if (status === "error" || !data) return <ErrorState message={error ?? "Application forms could not be loaded."} retry={retry} />

  const publishingForm = publishing?.form
  const publishingVersion = publishing?.version
  const publishModal = publishingForm && publishingVersion ? (
    <PublishModal
      groups={activeGroups.map((group) => ({ id: group.id, name: group.name }))}
      defaultJoinMode={publishingForm.joinMode}
      defaultGroupId={publishingForm.groupId}
      onClose={() => setPublishing(null)}
      onPublish={async (joinMode, groupId) => {
        await service.publishForm(organizationId, publishingForm, publishingVersion, { joinMode, groupId, linkEnabled: true })
        setPublishing(null)
        setEditing(null)
        notify("Form published — the application link is live")
      }}
    />
  ) : null

  if (editing) {
    return (
      <ShellPage
        level="detail"
        title={editing.form.name}
        description={`Version ${editing.version.version} · ${editing.version.status} · ${groupName(editing.form.groupId)}`}
        actions={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>Close</Button>
            <Button variant="secondary" icon={Download} onClick={() => printDocument(editing.form.name, formExportHtml(editing.version))}>Export</Button>
            {canManage && <Button onClick={() => setPublishing(editing)}>Publish…</Button>}
          </>
        }
      >
        <FormBuilder
          version={editing.version}
          audiences={["External"]}
          preview={{}}
          library={library}
          onChange={(version) => setEditing((current) => (current ? { ...current, version } : current))}
          onSave={async () => {
            const saved = await service.saveDraft(organizationId, editing.form, editing.version)
            setEditing({ form: saved, version: editing.version })
            notify("Draft saved")
          }}
          onPublish={canManage ? () => setPublishing(editing) : undefined}
        />
        {publishModal}
      </ShellPage>
    )
  }

  const forms = data.forms
  const pending = data.applications.filter((application) => application.status === "Submitted" || application.status === "Under Review").length

  return (
    <ShellPage
      title="Application forms"
      description="Build the form new members fill in, choose how joining works, and share the link."
      actions={canManage && <Button icon={Plus} onClick={() => setCreating(true)}>New form</Button>}
    >
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "forms", label: "Forms", count: forms.length },
          { id: "library", label: "Question library", count: questionLibrary.items.filter((question) => !question.archived).length },
        ]}
      />

      {tab === "library" ? (
        <QuestionLibraryManager library={library} />
      ) : (
        <Panel>
          <PagedTable
            rows={forms}
            rowKey={(form) => form.id}
            emptyText="No application forms yet — create one to start collecting applications."
            columns={[
              {
                id: "name",
                header: "Form",
                render: (form) => {
                  const live = publishedVersion(form)
                  return (
                    <>
                      <b>{form.name}</b>
                      <div style={{ color: "var(--muted)" }}>
                        {live ? `v${live.version} live` : "Not published"}
                        {form.versions.some((version) => version.status === "Draft") ? " · draft in progress" : ""}
                      </div>
                    </>
                  )
                },
              },
              { id: "join", header: "Joining", render: (form) => <JoinModeBadge mode={form.joinMode} /> },
              { id: "group", header: "New members join", render: (form) => groupName(form.groupId) },
              { id: "apps", header: "Applications", render: (form) => data.applications.filter((application) => application.formId === form.id).length },
              { id: "link", header: "Link", render: (form) => <LinkStateBadge live={applicationLinkLive(form)} /> },
              { id: "created", header: "Created", render: (form) => fmtDate(form.createdAt) },
              { id: "status", header: "Status", render: (form) => form.status },
              {
                id: "actions",
                header: "",
                render: (form) => {
                  const live = applicationLinkLive(form)
                  return (
                    <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {canManage && (
                        <Button variant="ghost" icon={Pencil} onClick={() => setEditing({ form, version: workingVersion(form) })}>
                          {form.status === "Published" ? "Edit" : "Build"}
                        </Button>
                      )}
                      {live && (
                        <Button variant="ghost" onClick={() => { void navigator.clipboard?.writeText(linkFor(form.slug)); notify("Application link copied") }}>
                          Copy link
                        </Button>
                      )}
                      {canManage && form.status === "Published" && (
                        <Button
                          variant="ghost"
                          onClick={async () => {
                            await service.setLinkEnabled(organizationId, form, !form.linkEnabled)
                            notify(form.linkEnabled ? "Application link disabled" : "Application link enabled")
                          }}
                        >
                          {form.linkEnabled ? "Disable link" : "Enable link"}
                        </Button>
                      )}
                      {canManage && form.status === "Published" && (
                        <Button
                          variant="ghost"
                          onClick={async () => {
                            await service.archiveForm(organizationId, form)
                            notify(`${form.name} archived`)
                          }}
                        >
                          Archive
                        </Button>
                      )}
                    </span>
                  )
                },
              },
            ]}
          />
          {pending > 0 && <p className="contribution-hint" style={{ marginTop: 12 }}>{pending} application{pending === 1 ? "" : "s"} waiting for a decision.</p>}
        </Panel>
      )}

      {creating && (
        <CreateFormModal
          defaultGroupId={defaultGroupId}
          onCreate={async (name, groupId) => {
            const form = service.createForm(name, groupId)
            await service.saveForm(organizationId, form)
            setCreating(false)
            setEditing({ form, version: form.versions[0] })
            notify(`${form.name} created — build the form, then publish it`)
          }}
          onClose={() => setCreating(false)}
        />
      )}

      {publishModal}
    </ShellPage>
  )
}

function CreateFormModal({ defaultGroupId, onCreate, onClose }: { defaultGroupId: string; onCreate: (name: string, groupId: string) => Promise<void>; onClose: () => void }) {
  const organizationId = useOrganizationId()
  const [name, setName] = useState("")
  const [groupId, setGroupId] = useState(defaultGroupId)
  const { groups } = useGroups(organizationId)
  const active = groups.filter((group) => group.status === "active")
  const valid = memberApplicationFormSchema.safeParse({ name, groupId }).success
  return (
    <ActionModal
      title="New application form"
      submitLabel="Create form"
      disabled={!valid}
      onClose={onClose}
      onSubmit={() => onCreate(name, groupId)}
    >
      <div className="form-grid">
        <Field label="Form name *" placeholder="e.g. Member onboarding" value={name} onChange={setName} />
        <EntitySelectField entity="group" label="New members join *" value={groupId} options={active.map((group) => ({ value: group.id, label: group.name }))} onChange={setGroupId} />
      </div>
      <p style={{ color: "var(--muted)", margin: "4px 0 0" }}>The form starts with the details FinSquare needs. Add your own questions before publishing.</p>
    </ActionModal>
  )
}

function PublishModal({ groups, defaultJoinMode, defaultGroupId, onClose, onPublish }: {
  groups: { id: string; name: string }[]
  defaultJoinMode: MemberJoinMode
  defaultGroupId: string
  onClose: () => void
  onPublish: (joinMode: MemberJoinMode, groupId: string) => Promise<void>
}) {
  const [joinMode, setJoinMode] = useState<MemberJoinMode>(defaultJoinMode)
  const [groupId, setGroupId] = useState(groups.some((group) => group.id === defaultGroupId) ? defaultGroupId : groups[0]?.id ?? "")
  return (
    <ActionModal wide title="Publish application form" submitLabel="Publish" disabled={!groupId} onClose={onClose} onSubmit={() => onPublish(joinMode, groupId)}>
      <div className="create-question">
        <div className="create-q">How does joining work?</div>
        <div className="choice-row">
          {MEMBER_JOIN_MODES.map((mode) => (
            <button key={mode.id} type="button" className="choice" aria-pressed={joinMode === mode.id} onClick={() => setJoinMode(mode.id)}>
              <b>{mode.label}</b>
              <small>{mode.description}</small>
            </button>
          ))}
        </div>
      </div>
      <div className="create-question">
        <div className="create-q">Where do new members go?</div>
        <EntitySelectField
          entity="group"
          label="Group"
          value={groupId}
          options={groups.map((group) => ({ value: group.id, label: group.name }))}
          onChange={setGroupId}
        />
        <p style={{ color: "var(--muted)", margin: "6px 0 0" }}>Approved and open-joining members are added to this group.</p>
      </div>
      <p style={{ color: "var(--muted)", margin: 0 }}>Publishing makes the current version live and switches the application link on. Past applications keep the version they were submitted with.</p>
    </ActionModal>
  )
}
