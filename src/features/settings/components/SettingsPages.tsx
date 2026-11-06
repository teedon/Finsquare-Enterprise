import AccentPicker from "./AccentPicker"
import OrgAvatar from "@/components/layout/OrgAvatar"
import LogoUpload from "@/components/layout/LogoUpload"
import type { ThemePreference } from "@/app/providers/WorkspaceProvider"
import {
  Blocks,
  CheckCircle2,
  CreditCard,
  Folder,
  WalletCards,
} from "@/icons"
import { Button, Badge, Progress, SectionHeader } from "@/components/ui"
import type { View } from "@/types"
import type { IconType } from "@/icons"

export function GenericPage({ view, navigate }: { view: View; navigate: (view: View) => void }) {
  const config: Record<string, [string, string, IconType, string, { label: string; view: View }?]> = {
    payments: [
      "Payments",
      "Track and reconcile member payments across all enabled products.",
      CreditCard,
      "Payments recorded against a contribution, a dues plan or a loan appear here as they are collected. Record one from a member's profile.",
      { label: "Go to members", view: "members" },
    ],
    savings: [
      "Savings",
      "Create member savings products and monitor target progress.",
      WalletCards,
      "Savings products you create will be listed here with their target progress. Until one exists there is nothing to show.",
    ],
    documents: [
      "Documents",
      "Store and organize important files for your organization.",
      Folder,
      "Files you upload for your organization appear here. Nothing has been uploaded yet.",
    ],
  }
  const [title, description, Icon, empty, action] = config[view] || [
    "Workspace",
    "Manage your organization.",
    Blocks,
    "There is nothing to show in this area yet.",
  ]
  return (
    <div className="page">
      <SectionHeader eyebrow="WORKSPACE" title={title} description={description} />
      <section className="panel generic-main">
        <div className="generic-icon">
          <Icon size={24} />
        </div>
        <b>Nothing here yet</b>
        <p>{empty}</p>
        {action && (
          <Button variant="secondary" onClick={() => navigate(action.view)}>
            {action.label}
          </Button>
        )}
      </section>
    </div>
  )
}


export function SettingsPage({
  theme,
  setTheme,
  accent,
  setAccent,
  notify,
  organization,
  setLogo,
  onSignOut,
}: {
  organization: { name: string; logo: string }
  setLogo: (value: string) => void
  theme: ThemePreference
  setTheme: (value: ThemePreference) => void
  accent: string
  setAccent: (value: string) => void
  notify: (text: string) => void
  onSignOut: () => void
}) {
  return (
    <div className="page">
      <SectionHeader
        eyebrow="WORKSPACE SETTINGS"
        title="Appearance & branding"
        description="Choose a comfortable interface theme and align the workspace with your organization’s brand."
        actions={<Button variant="secondary" onClick={onSignOut}>Sign out</Button>}
      />
      <div className="appearance-layout">
        <section className="panel appearance-panel">
          <div className="panel-head">
            <div>
              <b>Interface theme</b>
              <span>Applied immediately across the entire workspace</span>
            </div>
          </div>
          <div className="theme-options">
            {([
              ["light", "Light", "Bright neutral surfaces", "light-preview"],
              ["dark", "Dark", "Reduced-glare dark surfaces", "dark-preview"],
              ["system", "System", "Match your device setting", "light-preview system-preview"],
            ] as const).map(([id, label, hint, preview]) => (
              <button
                type="button"
                key={id}
                className={theme === id ? "active" : ""}
                aria-pressed={theme === id}
                onClick={() => setTheme(id)}
              >
                <span className={`theme-preview ${preview}`}>
                  <i />
                  <i />
                  <i />
                </span>
                <span>
                  <b>{label}</b>
                  <small>{hint}</small>
                </span>
                {theme === id && <CheckCircle2 size={18} />}
              </button>
            ))}
          </div>
        </section>

        <section className="panel appearance-panel">
          <div className="panel-head">
            <div>
              <b>Organization logo</b>
              <span>Shown in the workspace switcher, on the organization page and in previews. PNG, JPG or SVG, up to 512 KB.</span>
            </div>
          </div>
          <LogoUpload
            name={organization.name}
            logo={organization.logo}
            style={{ padding: 16 }}
            onChange={(logo) => {
              setLogo(logo)
              notify(logo ? "Logo updated" : "Logo removed")
            }}
            onError={(message) => message && notify(message)}
          />
        </section>

        <section className="panel appearance-panel">
          <div className="panel-head">
            <div>
              <b>Primary brand color</b>
              <span>
                Used for actions, progress, focus states and selected navigation
              </span>
            </div>
          </div>
          <AccentPicker accent={accent} setAccent={setAccent} onPreset={(label) => notify(`${label} applied as the primary color`)} />
        </section>

        <section className="panel brand-preview-panel">
          <div className="panel-head">
            <div>
              <b>Brand preview</b>
              <span>See how your choices appear in key workspace controls</span>
            </div>
          </div>
          <div className="brand-preview-content">
            <div className="brand-preview-card">
              <div className="brand-preview-head">
                <OrgAvatar />
                <div>
                  <b>{organization.name}</b>
                  <span>Enterprise workspace</span>
                </div>
                <Badge tone="green">LIVE</Badge>
              </div>
              <Progress value={72} />
              <div className="brand-preview-actions" aria-hidden="true">
                <span className="btn btn-secondary">Secondary action</span>
                <span className="btn btn-primary">Primary action</span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
