import { useState } from "react"
import { Button, Field, SelectField } from "@/components/ui"
import { ShellPage } from "@/components/layout/ShellPage"
import LogoUpload from "@/components/layout/LogoUpload"
import AccentPicker from "@/features/settings/components/AccentPicker"
import { ORGANIZATION_TYPES } from "@/app/providers/WorkspaceProvider"
import { useCommunities } from "../hooks/useCommunities"
import type { CommunityMembership, CreateCommunityInput } from "../types"
import type { View } from "@/types"

const blank = (): CreateCommunityInput => ({
  name: "",
  type: ORGANIZATION_TYPES[0],
  legalName: "",
  country: "",
  logo: "",
  accent: "blue",
})

/**
 * Starting a community.
 *
 * The administrator account is the one already signed in — a person does not get a second identity by
 * starting a second community — and everything else is new: the profile, the branding, the modules,
 * the corporate account and, of course, the records. The creator becomes its Super Admin.
 */
export default function CreateCommunityPage({
  navigate,
  notify,
  onCreated,
}: {
  navigate: (view: View, id?: string) => void
  notify: (message: string) => void
  onCreated: (membership: CommunityMembership) => void
}) {
  // The page creates rather than lists, so it never loads the membership list the workspace already has.
  const { create, pending, createError } = useCommunities(false)
  const [values, setValues] = useState<CreateCommunityInput>(blank)
  const [logoError, setLogoError] = useState("")

  const valid = values.name.trim().length >= 2 && values.type.trim().length > 0

  const submit = async () => {
    if (!valid) return
    const created = await create({ ...values, name: values.name.trim(), legalName: values.legalName.trim() })
    if (!created) return
    onCreated(created)
    notify(`${created.name} created — you are its Super Admin`)
    navigate("overview")
  }

  return (
    <ShellPage
      width="narrow"
      title="Create a community"
      description="You stay signed in as yourself. The community starts empty, with the default modules enabled, and becomes live once its corporate account is connected."
      actions={
        <Button variant="ghost" onClick={() => navigate("overview")}>
          Cancel
        </Button>
      }
    >
      <section className="panel" style={{ padding: 20 }}>
        <div className="form-grid">
          <div>
            <Field
              label="Community name"
              value={values.name}
              placeholder="Riverside Traders Association"
              onChange={(name) => setValues({ ...values, name })}
            />
          </div>
          <div>
            <SelectField
              label="Type"
              value={values.type}
              options={ORGANIZATION_TYPES}
              onChange={(type) => setValues({ ...values, type })}
            />
          </div>
          <div>
            <Field
              label="Registered name"
              value={values.legalName}
              placeholder="Optional"
              onChange={(legalName) => setValues({ ...values, legalName })}
            />
          </div>
          <div>
            <Field
              label="Country"
              value={values.country}
              placeholder="Nigeria"
              onChange={(country) => setValues({ ...values, country })}
            />
          </div>
        </div>

        <div className="onb-block">
          <b>
            Logo <small>optional</small>
          </b>
          <LogoUpload
            name={values.name}
            logo={values.logo}
            onChange={(logo) => setValues((current) => ({ ...current, logo }))}
            onError={(message) => setLogoError(message ?? "")}
          />
          {logoError && <small className="field-error">{logoError}</small>}
        </div>

        <div className="onb-block">
          <b>Primary colour</b>
          <AccentPicker accent={values.accent} setAccent={(accent) => setValues({ ...values, accent })} />
        </div>

        {createError && (
          <p className="form-error" role="alert">
            {createError}
          </p>
        )}

        <div className="onb-actions">
          <span />
          <Button disabled={!valid || pending} onClick={submit}>
            {pending ? "Creating…" : "Create community"}
          </Button>
        </div>
      </section>
    </ShellPage>
  )
}
