import { useState } from "react"
import { useWorkspace, ORGANIZATION_TYPES, type OrganizationProfile } from "@/app/providers/WorkspaceProvider"
import { useAppRoute } from "@/app/routes/useAppRoute"
import { useAuth } from "@/features/auth/hooks/useAuth"
import { Badge, Button, Field, SelectField } from "@/components/ui"
import OrgAvatar from "@/components/layout/OrgAvatar"
import LogoUpload from "@/components/layout/LogoUpload"
import AccentPicker from "@/features/settings/components/AccentPicker"
import Brand, { BrandMark } from "@/components/layout/Brand"
import { readableOn } from "@/lib/theme/accent"
import { ArrowLeft, ArrowRight, BadgeCheck, Check, Landmark } from "@/icons"
import { accountSchema, corporateSchema, organizationInfoSchema, organizationSchema, validate, type FieldErrors } from "../domain/validation"
import CorporateAccountForm from "./CorporateAccountForm"
import type { AdminAccount, CorporateAccountDetails } from "../types"

const STEPS = [
  { title: "Create account", hint: "Your administrator login" },
  { title: "Set up organization", hint: "Name, logo and brand colors" },
  { title: "Organization details", hint: "Registration and contacts" },
  { title: "Corporate account", hint: "Optional — can be done later" },
  { title: "Finish", hint: "Review and finish" },
]

const COUNTRIES = ["Nigeria", "Ghana", "Kenya", "South Africa", "Other"]
const SECONDARY_PRESETS = ["#0f766e", "#7c3aed", "#d97706", "#be123c", "#475569"]

export default function OnboardingFlow({ onLogin }: { onLogin?: () => void } = {}) {
  const { state, dispatch } = useWorkspace()
  const { signUp, pending, error } = useAuth()
  const { navigate } = useAppRoute()
  const [step, setStep] = useState(0)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [account, setAccount] = useState({ ...state.admin, password: "" })
  const [corporate, setCorporate] = useState<CorporateAccountDetails>(() => ({
    ...state.corporateDetails,
    businessName: state.corporateDetails.businessName || state.organization.legalName || state.organization.name,
    registrationNumber: state.corporateDetails.registrationNumber || state.organization.registrationNumber,
    businessAddress: state.corporateDetails.businessAddress || state.organization.address,
    accountHolder: state.corporateDetails.accountHolder || state.organization.name,
    repName: state.corporateDetails.repName || state.admin.name,
    repEmail: state.corporateDetails.repEmail || state.admin.email,
    repPhone: state.corporateDetails.repPhone || state.admin.phone,
  }))
  const org = state.organization
  const setOrg = (value: Partial<OrganizationProfile>) => dispatch({ type: "organization/updated", value })
  const [logoError, setLogoError] = useState("")

  const go = (next: number) => { setErrors({}); setStep(next); window.scrollTo({ top: 0 }) }
  const proceed = (schema: Parameters<typeof validate>[0], value: unknown, onValid: () => void) => {
    const found = validate(schema, value)
    setErrors(found)
    if (!Object.keys(found).length) onValid()
  }
  const err = (key: string) => (errors[key] ? <small className="field-error">{errors[key]}</small> : null)
  const orgField = (key: keyof OrganizationProfile, label: string, placeholder?: string) => (
    <div>
      <Field label={label} value={org[key]} placeholder={placeholder} onChange={(v) => setOrg({ [key]: v })} />
      {err(key)}
    </div>
  )

  const finish = async () => {
    const profile = {
      type: org.type,
      legalName: org.legalName,
      registrationNumber: org.registrationNumber,
      country: org.country,
      state: org.state,
      city: org.city,
      address: org.address,
      website: org.website,
      yearEstablished: org.yearEstablished,
      memberCount: org.memberCount,
      areaOfOperation: org.areaOfOperation,
      secondaryColor: org.secondaryColor,
      logo: org.logo,
      email: org.email,
      phone: org.phone,
      description: org.description,
    }
    const ok = await signUp({
      name: org.name,
      description: org.description,
      logo: org.logo,
      color: org.secondaryColor,
      ownerName: account.name,
      ownerEmail: account.email,
      ownerPhone: account.phone,
      ownerPassword: account.password,
      profile,
      corporate: corporateSubmitted ? { ...state.corporateDetails } : undefined,
    })
    if (!ok) return
    dispatch({ type: "onboarding/completed" })
    navigate("overview")
  }
  const corporateSubmitted = state.corporateAccountStatus !== "Not connected"

  return (
    <div className="onb">
      <header className="onb-top">
        <Brand />
        {onLogin ? (
          <span className="onb-top-note">Already have an account?{" "}<button type="button" className="onb-link" onClick={onLogin}>Log in</button></span>
        ) : (
          <span className="onb-top-note">Setup takes about three minutes</span>
        )}
      </header>

      <main className="onb-main">
        <ol className="onb-steps" aria-label="Setup progress">
          {STEPS.map((s, i) => (
            <li key={s.title} className={i === step ? "current" : i < step ? "done" : ""} aria-current={i === step ? "step" : undefined}>
              <button type="button" disabled={i > step} onClick={() => go(i)} title={s.hint}>
                <span>{i < step ? <Check size={13} /> : i + 1}</span>
                <b>{s.title}</b>
              </button>
            </li>
          ))}
        </ol>
        <div className="onb-progress" aria-hidden><i style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} /></div>
        <p className="onb-mobile-step">Step {step + 1} of {STEPS.length} · {STEPS[step].title}</p>

        <div className="onb-card" key={step}>
          <div className="onb-card-head">
            <span className="onb-step-label">{STEPS[step].hint}</span>
            <span className="onb-step-count">Step {step + 1} of {STEPS.length}</span>
          </div>

          {step === 0 && (
            <>
              <div className="onb-welcome">
                <BrandMark size={46} />
                <div>
                  <h1>Welcome to FinSquare</h1>
                  <p>Let&apos;s set up your organization&apos;s workspace.</p>
                </div>
              </div>
              <h2>Create your administrator account</h2>
              <p>You will be the first Super Admin of this workspace.</p>
              <div className="form-grid">
                <div><Field label="Full name" value={account.name} onChange={(v) => setAccount({ ...account, name: v })} />{err("name")}</div>
                <div><Field label="Work email" type="email" value={account.email} onChange={(v) => setAccount({ ...account, email: v })} />{err("email")}</div>
                <div><Field label="Phone number" placeholder="+234" value={account.phone} onChange={(v) => setAccount({ ...account, phone: v })} />{err("phone")}</div>
                <div><Field label="Password" type="password" placeholder="At least 8 characters" value={account.password} onChange={(v) => setAccount({ ...account, password: v })} />{err("password")}</div>
              </div>
              <div className="onb-actions">
                <span />
                <Button onClick={() => proceed(accountSchema, account, () => {
                  const admin: AdminAccount = { name: account.name.trim(), email: account.email.trim(), phone: account.phone.trim() }
                  dispatch({ type: "onboarding/admin-saved", value: admin })
                  go(1)
                })}>Continue <ArrowRight size={14} /></Button>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <h1>Make the workspace yours</h1>
              <p>Tell us who you are, then pick the accent colors your members will see.</p>
              <div className="onb-split">
                <div className="onb-fields">
                  <div className="form-grid">
                    <div><Field label="Organization name" value={org.name} onChange={(v) => setOrg({ name: v })} />{err("name")}</div>
                    <div><SelectField label="Organization type" value={org.type} options={ORGANIZATION_TYPES} onChange={(v) => setOrg({ type: v })} />{err("type")}</div>
                  </div>
                  <div className="onb-block">
                    <b>Logo <small>optional</small></b>
                    <LogoUpload
                      name={org.name}
                      logo={org.logo}
                      onChange={(logo) => setOrg({ logo })}
                      onError={(message) => setLogoError(message ?? "")}
                    />
                    {logoError && <small className="field-error">{logoError}</small>}
                  </div>
                  <div className="onb-block">
                    <b>Primary color</b>
                    <AccentPicker accent={state.accent} setAccent={(value) => dispatch({ type: "preferences/accent-changed", value })} />
                  </div>
                  <div className="onb-block">
                    <b>Secondary color <small>optional</small></b>
                    <div className="accent-presets">
                      {SECONDARY_PRESETS.map((c) => (
                        <button type="button" key={c} aria-label={`Secondary ${c}`} className={`accent-chip${org.secondaryColor === c ? " active" : ""}`} style={{ background: c, color: readableOn(c) }} onClick={() => setOrg({ secondaryColor: c })}>
                          {org.secondaryColor === c && <Check size={14} />}
                        </button>
                      ))}
                      <input type="color" aria-label="Custom secondary color" value={org.secondaryColor} onChange={(e) => setOrg({ secondaryColor: e.target.value })} />
                    </div>
                  </div>
                </div>
                <div className="onb-preview" aria-label="Brand preview">
                  <small>Live preview</small>
                  <div className="onb-preview-card">
                    <div className="onb-preview-side">
                      <OrgAvatar />
                      <b>{org.name || "Your organization"}</b>
                      <i className="active" /><i /><i />
                    </div>
                    <div className="onb-preview-body">
                      <b>Dashboard</b>
                      <div className="onb-preview-chips"><Badge tone="blue">Primary</Badge><span style={{ background: org.secondaryColor, color: readableOn(org.secondaryColor) }}>Secondary</span></div>
                      <Button>Primary action</Button>
                      <div className="onb-preview-bar"><i /><i style={{ background: org.secondaryColor }} /></div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="onb-actions">
                <Button variant="ghost" icon={ArrowLeft} onClick={() => go(0)}>Back</Button>
                <Button onClick={() => proceed(organizationSchema, org, () => go(2))}>Continue <ArrowRight size={14} /></Button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h1>A few organization details</h1>
              <p>These appear on member records, statements and compliance documents. Anything marked optional can be skipped.</p>
              <div className="form-grid">
                {orgField("legalName", "Registered / business name")}
                {orgField("registrationNumber", "Registration number (optional)", "e.g. RC-1048223")}
                {orgField("email", "Organization email")}
                {orgField("phone", "Organization phone", "+234")}
                {orgField("website", "Website (optional)", "www.example.org")}
                <SelectField label="Country" value={org.country} options={COUNTRIES} onChange={(v) => setOrg({ country: v })} />
                {orgField("state", "State")}
                {orgField("city", "City")}
                {orgField("address", "Physical address")}
                {orgField("yearEstablished", "Year established (optional)", "e.g. 2014")}
                {orgField("memberCount", "Number of members (optional)")}
                {orgField("areaOfOperation", "Primary area of operation (optional)", "e.g. Agriculture")}
              </div>
              <label className="field" style={{ marginTop: 12 }}>
                <span>Description (optional)</span>
                <textarea rows={3} value={org.description} onChange={(e) => setOrg({ description: e.target.value })} placeholder="What does your organization do?" />
              </label>
              <div className="onb-actions">
                <Button variant="ghost" icon={ArrowLeft} onClick={() => go(1)}>Back</Button>
                <Button onClick={() => proceed(organizationInfoSchema, org, () => go(3))}>Save and continue <ArrowRight size={14} /></Button>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <h1>Corporate account &amp; wallet <Badge>Optional</Badge></h1>
              <p>Connect a corporate account when you are ready to move real money.</p>
              <div className="onb-callout">
                <Landmark size={18} />
                <span>Completing this step lets FinSquare open your organization&apos;s corporate account and wallet, which is required for <b>real</b> collections, loan disbursements and transfers. You can skip it now and connect the account later from Settings.</span>
              </div>
              <CorporateAccountForm value={corporate} onChange={setCorporate} errors={errors} />
              <div className="onb-actions">
                <Button variant="ghost" icon={ArrowLeft} onClick={() => go(2)}>Back</Button>
                <span className="onb-actions-right">
                  <Button variant="secondary" onClick={() => go(4)}>Skip for now</Button>
                  <Button onClick={() => proceed(corporateSchema, corporate, () => {
                    dispatch({ type: "corporate-account/details-saved", value: corporate })
                    dispatch({ type: "corporate-account/status-changed", value: "Under review" })
                    go(4)
                  })}>Save and continue <ArrowRight size={14} /></Button>
                </span>
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <div className="onb-done"><BadgeCheck size={30} /></div>
              <h1>You&apos;re all set, {state.admin.name.split(" ")[0] || "there"}</h1>
              <p>Your workspace is ready. Here is a quick summary before you step in.</p>
              <ul className="onb-summary">
                <li><Check size={14} /> Administrator account <b>{state.admin.email}</b></li>
                <li><Check size={14} /> Organization <b>{org.name}</b> · {org.type}</li>
                <li><Check size={14} /> Organization details saved</li>
                <li className={corporateSubmitted ? "" : "pending"}>
                  {corporateSubmitted ? <Check size={14} /> : <Landmark size={14} />} Corporate account &amp; wallet{" "}
                  <b>{corporateSubmitted ? "Submitted for review" : "Not set up — finish it any time"}</b>
                </li>
              </ul>
              {!corporateSubmitted && (
                <div className="onb-callout">
                  <Landmark size={18} />
                  <span>Finish the corporate account step whenever you&apos;re ready — a banner in the workspace will bring you back to it.</span>
                </div>
              )}
              {error && <small className="field-error">{error}</small>}
              <div className="onb-actions">
                <Button variant="ghost" icon={ArrowLeft} onClick={() => go(3)} disabled={pending}>Back</Button>
                <Button onClick={finish} disabled={pending}>{pending ? "Creating workspace…" : "Complete setup"}</Button>
              </div>
            </>
          )}
        </div>
        <p className="onb-foot">Everything here stays editable in Settings.</p>
      </main>
    </div>
  )
}
