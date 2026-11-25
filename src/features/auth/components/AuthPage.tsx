import { useState } from "react"
import { Button, Field } from "@/components/ui"
import Brand, { BrandMark } from "@/components/layout/Brand"
import { validate, type FieldErrors } from "@/lib/validation/zod"
import { ArrowRight } from "@/icons"
import type { CommunityMembership } from "@/features/communities/types"
import { loginSchema } from "../schemas/auth.schema"
import { useAuth } from "../hooks/useAuth"
import { authService } from "../services/auth.service"

/**
 * The login gate. Rendered before the shell while there is no session, so it is deliberately not an
 * app page: no sidebar, no breadcrumbs, same first-run look as the onboarding flow.
 *
 * Sign-up is not a second form here — creating the administrator account is what the onboarding flow
 * does, so the switch hands over to it. A staff member who belongs to several institutions first
 * picks which one to enter.
 */
export default function AuthPage({ onSignUp }: { onSignUp: () => void }) {
  const { signIn, pending, error } = useAuth()
  const [credentials, setCredentials] = useState({ email: "", password: "" })
  const [errors, setErrors] = useState<FieldErrors>({})
  const [selecting, setSelecting] = useState(false)
  const [communities, setCommunities] = useState<CommunityMembership[]>([])
  const [showPassword, setShowPassword] = useState(false)
  const [recovering, setRecovering] = useState(false)
  const [resetStep, setResetStep] = useState<"request" | "verify" | "password">("request")
  const [resetIdentifier, setResetIdentifier] = useState("")
  const [resetToken, setResetToken] = useState("")
  const [resetOtp, setResetOtp] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [resetPending, setResetPending] = useState(false)
  const [resetError, setResetError] = useState("")
  const [resetMessage, setResetMessage] = useState("")
  const [resetComplete, setResetComplete] = useState(false)

  const err = (key: string) => (errors[key] ? <small className="field-error">{errors[key]}</small> : null)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const found = validate(loginSchema, credentials)
    setErrors(found)
    if (Object.keys(found).length) return
    const outcome = await signIn({ email: credentials.email.trim(), password: credentials.password })
    if (outcome.needsSelection) {
      setCommunities(outcome.communities)
      setSelecting(true)
    }
  }

  const selectCommunity = async (communityId: string) => {
    const outcome = await signIn({
      email: credentials.email.trim(),
      password: credentials.password,
      communityId,
    })
    if (outcome.needsSelection) {
      setCommunities(outcome.communities)
    }
  }

  const requestReset = async (event: React.FormEvent) => {
    event.preventDefault()
    const identifier = resetIdentifier.trim()
    if (!identifier) {
      setResetError("Enter the email address or phone number on your account.")
      return
    }
    setResetPending(true)
    setResetError("")
    try {
      const token = await authService.requestPasswordReset(identifier)
      setResetToken(token)
      setResetStep("verify")
      setResetMessage("If an account matches those details, a verification code has been sent.")
    } catch (cause) {
      setResetError(cause instanceof Error ? cause.message : "Could not request a password reset.")
    } finally {
      setResetPending(false)
    }
  }

  const verifyResetOtp = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!/^\d{6}$/.test(resetOtp)) {
      setResetError("Enter the 6-digit verification code.")
      return
    }
    setResetPending(true)
    setResetError("")
    try {
      await authService.verifyPasswordResetOtp(resetToken, resetOtp)
      setResetStep("password")
      setResetMessage("")
    } catch (cause) {
      setResetError(cause instanceof Error ? cause.message : "Could not verify the code.")
    } finally {
      setResetPending(false)
    }
  }

  const resendResetOtp = async () => {
    setResetPending(true)
    setResetError("")
    try {
      await authService.resendPasswordResetOtp(resetToken)
      setResetMessage("If an account matches those details, a new verification code has been sent.")
    } catch (cause) {
      setResetError(cause instanceof Error ? cause.message : "Could not resend the code.")
    } finally {
      setResetPending(false)
    }
  }

  const submitNewPassword = async (event: React.FormEvent) => {
    event.preventDefault()
    if (
      newPassword.length < 8 ||
      !/[a-z]/.test(newPassword) ||
      !/[A-Z]/.test(newPassword) ||
      !/\d/.test(newPassword) ||
      !/[^A-Za-z0-9]/.test(newPassword)
    ) {
      setResetError("Use at least 8 characters with uppercase, lowercase, a number, and a symbol.")
      return
    }
    if (newPassword !== confirmPassword) {
      setResetError("The passwords do not match.")
      return
    }
    setResetPending(true)
    setResetError("")
    try {
      await authService.resetPassword(resetToken, newPassword)
      setResetComplete(true)
      setResetMessage("")
    } catch (cause) {
      setResetError(cause instanceof Error ? cause.message : "Could not reset the password.")
    } finally {
      setResetPending(false)
    }
  }

  const backToLogin = () => {
    setRecovering(false)
    setResetStep("request")
    setResetToken("")
    setResetOtp("")
    setNewPassword("")
    setConfirmPassword("")
    setResetError("")
    setResetMessage("")
    setResetComplete(false)
  }

  return (
    <div className="onb">
      <header className="onb-top">
        <Brand />
        <span className="onb-top-note">Sign in to your workspace</span>
      </header>

      <main className="onb-main">
        <div className="onb-card">
          <div className="onb-card-head">
            <span className="onb-step-label">Administrator access</span>
          </div>
          <div className="onb-welcome">
            <BrandMark size={46} />
            <div>
              <h1>Log in to FinSquare</h1>
              <p>Use the administrator account for your organization.</p>
            </div>
          </div>

          {resetComplete ? (
            <div className="onb-recovery-state">
              <p className="form-success" role="status">
                Your password has been reset. Log in with your new password.
              </p>
              <Button onClick={backToLogin}>
                Back to log in <ArrowRight size={14} />
              </Button>
            </div>
          ) : recovering ? (
            <section className="onb-recovery">
              <h2>
                {resetStep === "request"
                  ? "Forgot password?"
                  : resetStep === "verify"
                    ? "Check your code"
                    : "Choose a new password"}
              </h2>
              <p className="onb-recovery-note">
                {resetStep === "request"
                  ? "Enter your account email or phone number and we’ll send a verification code."
                  : resetStep === "verify"
                    ? `Enter the 6-digit code sent to ${resetIdentifier}.`
                    : "Your new password must be at least 8 characters and include uppercase, lowercase, a number, and a symbol."}
              </p>
              {resetMessage && (
                <p className="form-success" role="status">
                  {resetMessage}
                </p>
              )}
              {resetError && (
                <p className="form-error" role="alert">
                  {resetError}
                </p>
              )}
              {resetStep === "request" && (
                <form onSubmit={requestReset} noValidate>
                  <Field
                    label="Email or phone number"
                    type="text"
                    value={resetIdentifier}
                    placeholder="you@organization.com"
                    onChange={setResetIdentifier}
                  />
                  <div className="onb-actions">
                    <button type="button" className="onb-link" onClick={backToLogin}>
                      Back to log in
                    </button>
                    <Button type="submit" disabled={resetPending}>
                      {resetPending ? "Sending…" : "Send code"} <ArrowRight size={14} />
                    </Button>
                  </div>
                </form>
              )}
              {resetStep === "verify" && (
                <form onSubmit={verifyResetOtp} noValidate>
                  <Field
                    label="6-digit verification code"
                    type="text"
                    value={resetOtp}
                    placeholder="123456"
                    onChange={(value) => setResetOtp(value.replace(/\D/g, "").slice(0, 6))}
                  />
                  <div className="onb-actions">
                    <button
                      type="button"
                      className="onb-link"
                      disabled={resetPending}
                      onClick={() => void resendResetOtp()}
                    >
                      Resend code
                    </button>
                    <Button type="submit" disabled={resetPending}>
                      {resetPending ? "Verifying…" : "Verify code"} <ArrowRight size={14} />
                    </Button>
                  </div>
                  <button
                    type="button"
                    className="onb-link onb-recovery-back"
                    onClick={() => {
                      setResetStep("request")
                      setResetError("")
                      setResetMessage("")
                    }}
                  >
                    Use a different email or phone
                  </button>
                </form>
              )}
              {resetStep === "password" && (
                <form onSubmit={submitNewPassword} noValidate>
                  <div className="form-grid">
                    <Field
                      label="New password"
                      type="password"
                      value={newPassword}
                      placeholder="Choose a strong password"
                      onChange={setNewPassword}
                    />
                    <Field
                      label="Confirm new password"
                      type="password"
                      value={confirmPassword}
                      placeholder="Enter it again"
                      onChange={setConfirmPassword}
                    />
                  </div>
                  <div className="onb-actions">
                    <button type="button" className="onb-link" onClick={backToLogin}>
                      Cancel
                    </button>
                    <Button type="submit" disabled={resetPending}>
                      {resetPending ? "Saving…" : "Reset password"} <ArrowRight size={14} />
                    </Button>
                  </div>
                </form>
              )}
            </section>
          ) : selecting ? (
            <div className="onb-community-picker">
              <p className="onb-community-picker-note">
                You belong to more than one institution. Choose which one to continue into.
              </p>
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              <div className="onb-community-list">
                {communities.map((community) => (
                  <button
                    type="button"
                    key={community.organizationId}
                    className="onb-community-row"
                    disabled={pending}
                    onClick={() => void selectCommunity(community.organizationId)}
                  >
                    {community.logo ? (
                      <img src={community.logo} alt="" className="onb-community-logo" />
                    ) : (
                      <BrandMark size={32} />
                    )}
                    <span className="onb-community-name">
                      <b>{community.name}</b>
                      <small>{community.roleName}</small>
                    </span>
                    <ArrowRight size={14} />
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="onb-link"
                disabled={pending}
                onClick={() => {
                  setSelecting(false)
                  setCommunities([])
                }}
              >
                Back
              </button>
            </div>
          ) : (
            <form onSubmit={submit} noValidate>
              <div className="form-grid">
                <div>
                  <Field
                    label="Work email"
                    type="email"
                    value={credentials.email}
                    placeholder="you@organization.com"
                    onChange={(value) => setCredentials({ ...credentials, email: value })}
                  />
                  {err("email")}
                </div>
                <div>
                  <label className="field">
                    <span>Password</span>
                    <span className="auth-password-input">
                      <input
                        type={showPassword ? "text" : "password"}
                        value={credentials.password}
                        placeholder="At least 6 characters"
                        onChange={(event) => setCredentials({ ...credentials, password: event.target.value })}
                      />
                      <button
                        type="button"
                        className="auth-password-toggle"
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        aria-pressed={showPassword}
                        onClick={() => setShowPassword((shown) => !shown)}
                      >
                        {showPassword ? "Hide" : "Show"}
                      </button>
                    </span>
                  </label>
                  {err("password")}
                </div>
              </div>
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              <button
                type="button"
                className="onb-link onb-forgot-link"
                onClick={() => {
                  setRecovering(true)
                  setResetIdentifier(credentials.email.trim())
                  setResetError("")
                  setResetMessage("")
                }}
              >
                Forgot password?
              </button>
              <div className="onb-actions">
                <span className="onb-top-note" />
                <Button type="submit" disabled={pending}>
                  {pending ? "Signing in…" : "Log in"} <ArrowRight size={14} />
                </Button>
              </div>
            </form>
          )}

          {!recovering && !resetComplete && (
            <p className="onb-auth-switch">
              New here?{" "}
              <button type="button" className="onb-link" onClick={onSignUp}>
                Create an account
              </button>
            </p>
          )}
        </div>
      </main>
    </div>
  )
}
