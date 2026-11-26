import { useEffect, useState } from "react"
import { FormRenderer } from "@/features/forms/components/FormRenderer"
import { PublicFormPage } from "@/components/layout/PublicFormPage"
import { publishedVersion } from "@/features/forms/domain/forms"
import { memberApplicationsService } from "../services/member-applications.service"
import { applicationLinkLive } from "../domain/member-application.rules"
import type { PublicMemberApplicationForm } from "../types/member-application.types"

const PURPOSE = "Membership application"

/**
 * The link anyone can open — no FinSquare account needed. It answers only while the form is
 * published and the administrator has left the link switched on.
 *
 * The link carries no session, so the tenant cannot come from the active community: the backend
 * resolves the form from its slug through the public endpoint.
 */
export function PublicMemberApplicationPage({ slug }: { slug: string }) {
  const [form, setForm] = useState<PublicMemberApplicationForm | null>(null)
  const [loading, setLoading] = useState(true)
  const [reference, setReference] = useState("")
  const [joined, setJoined] = useState(false)

  useEffect(() => {
    let active = true
    memberApplicationsService
      .getPublicForm(slug)
      .then((result) => {
        if (!active) return
        setForm(result)
        setLoading(false)
      })
      .catch(() => {
        if (!active) return
        setForm(null)
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [slug])

  // The payload names the organisation on the loan link; when this one starts doing the same, the
  // header shows it without another change here.
  const community = form?.mfiName ? { name: form.mfiName, logo: form.mfiLogo ?? undefined } : undefined
  const page = (title: string, description: string, body?: React.ReactNode, purpose = PURPOSE) => (
    <PublicFormPage community={community} purpose={purpose} title={title} description={description}>
      {body}
    </PublicFormPage>
  )

  if (loading) return page("Loading application form…", "This will only take a moment.")

  if (!form || !applicationLinkLive(form)) {
    return page(
      "This link is closed",
      form
        ? "This organization is not accepting applications through this link at the moment. Contact them for a current one."
        : "The application link is incomplete or no longer exists. Ask the organization for a fresh one.",
    )
  }

  const version = publishedVersion(form)!
  if (reference) {
    return page(
      "Application received",
      `Your reference is ${reference}. Keep it for your records.`,
      <p className="contribution-hint" style={{ marginTop: 0 }}>
        {joined
          ? "You are now a member. The organization will be in touch about your account."
          : "An administrator will review your application and contact you if anything else is needed."}
      </p>,
      "Application received",
    )
  }

  return page(
    form.name,
    form.joinMode === "Open"
      ? "Fill this in and you become a member straight away. No FinSquare account is needed."
      : "Fill this in and an administrator will review your application. No FinSquare account is needed.",
    <FormRenderer
      version={version}
      audience="External"
      submittedBody={
        form.joinMode === "Open"
          ? "Thank you. You are now a member and the organization will be in touch about your account."
          : "Thank you. An administrator will review your application and contact you."
      }
      onSubmit={async (values) => {
        const application = await memberApplicationsService.submitPublic(slug, values)
        setJoined(application.status === "Approved")
        setReference(application.reference)
      }}
    />,
  )
}
