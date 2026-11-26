import { useEffect, useState } from "react"
import { env } from "@/app/config/env"
import { FormRenderer } from "@/features/forms/components/FormRenderer"
import { PublicFormPage } from "@/components/layout/PublicFormPage"
import { SEED_ORGANIZATION_ID } from "@/lib/tenancy/seed-tenant"
import { GUARANTOR_DOC_FIELDS } from "../domain/loan-forms"
import { publishedVersion } from "@/features/forms/domain/forms"
import { useLoansFor } from "../hooks/useLoans"
import { publicApplicationService } from "../services/public-application.service"

const PURPOSE = "Loan application"

/** One shell for every state, so even a dead link still says who published it and what it was. */
function shell(
  title: string,
  description: string,
  body?: React.ReactNode,
  community?: { name?: string | null; logo?: string | null },
) {
  return (
    <PublicFormPage community={community} purpose={PURPOSE} title={title} description={description}>
      {body}
    </PublicFormPage>
  )
}

const unavailable = shell(
  "This link is not active",
  "The lender has closed this application form, or the link is incomplete. Ask them for a current one.",
)

/** The product's own words when it has any, then the one thing every applicant needs to know. */
const applyDescription = (description: string) =>
  description.trim() ? `${description.trim()} No FinSquare account is needed to apply.` : "No FinSquare account is needed to apply."

/**
 * The public application link. It carries no session, so the tenant cannot come from the active
 * community: it belongs to the organisation that published the form. With mocks that is the seeded
 * organisation; against the backend the slug is the loan type's share token, which addresses the
 * lender on its own.
 */
export function PublicApplicationPage({ slug }: { slug: string }) {
  return env.VITE_ENABLE_MOCKS ? <MockPublicApplication slug={slug} /> : <ApiPublicApplication token={slug} />
}

function MockPublicApplication({ slug }: { slug: string }) {
  const { data, service } = useLoansFor(SEED_ORGANIZATION_ID)
  const [ref, setRef] = useState("")
  if (!data) return shell("Loading…", "Fetching the application form.")
  const form = data.forms.find((x) => x.slug === slug && x.status === "Published")
  const product = form && data.products.find((p) => p.id === form.productId && p.status === "Active" && p.applicationType !== "Internal")
  const version = publishedVersion(form)
  if (!form || !product || !version) return unavailable
  return shell(
    form.name,
    applyDescription(product.description),
    <>
      <FormRenderer version={version} audience="External" members={data.borrowers} loan={product} guarantorDocFields={GUARANTOR_DOC_FIELDS}
        onSubmit={async (values) => { const a = await service.submitFormApplication({ form, version, product, values, members: [], source: "Public link" }); setRef(a.reference) }} />
      {ref && <p className="public-ref">Your reference: <b>{ref}</b></p>}
    </>,
  )
}

type Loaded = Awaited<ReturnType<typeof publicApplicationService.load>>

function ApiPublicApplication({ token }: { token: string }) {
  const [state, setState] = useState<{ status: "loading" } | { status: "error" } | { status: "ready"; loaded: Loaded }>({ status: "loading" })
  const [ref, setRef] = useState("")

  useEffect(() => {
    let active = true
    publicApplicationService
      .load(token)
      .then((loaded) => active && setState({ status: "ready", loaded }))
      .catch(() => active && setState({ status: "error" }))
    return () => {
      active = false
    }
  }, [token])

  if (state.status === "loading") return shell("Loading…", "Fetching the application form.")
  if (state.status === "error") {
    return shell("This form could not be loaded", "Check your connection and reload the page to try again.")
  }
  if (!state.loaded) return unavailable

  const { form, version, product, community } = state.loaded
  return shell(
    form.name,
    applyDescription(product.description),
    <>
      <FormRenderer version={version} audience="External" loan={product} guarantorDocFields={GUARANTOR_DOC_FIELDS}
        onSubmit={async (values) => { const r = await publicApplicationService.submit(token, version, product, values); setRef(r.applicationId) }} />
      {ref && <p className="public-ref">Your reference: <b>{ref}</b></p>}
    </>,
    community,
  )
}
