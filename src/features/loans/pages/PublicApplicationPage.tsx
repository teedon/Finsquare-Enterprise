import { useEffect, useState } from "react"
import { env } from "@/app/config/env"
import { FormRenderer } from "@/features/forms/components/FormRenderer"
import { SEED_ORGANIZATION_ID } from "@/lib/tenancy/seed-tenant"
import { GUARANTOR_DOC_FIELDS } from "../domain/loan-forms"
import { publishedVersion } from "@/features/forms/domain/forms"
import { useLoansFor } from "../hooks/useLoans"
import { publicApplicationService } from "../services/public-application.service"

const wrap = (c: React.ReactNode) => <div className="page" style={{ maxWidth: 720, margin: "0 auto", padding: 24 }}>{c}</div>
const unavailable = wrap(<><h1>Form unavailable</h1><p>This application link is inactive or does not exist.</p></>)

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
  if (!data) return wrap("Loading…")
  const form = data.forms.find((x) => x.slug === slug && x.status === "Published")
  const product = form && data.products.find((p) => p.id === form.productId && p.status === "Active" && p.applicationType !== "Internal")
  const version = publishedVersion(form)
  if (!form || !product || !version) return unavailable
  return wrap(
    <>
      <h1>{form.name}</h1>
      <p style={{ color: "var(--muted)" }}>{product.description} No FinSquare account is needed to apply.</p>
      <FormRenderer version={version} audience="External" members={data.borrowers} loan={product} guarantorDocFields={GUARANTOR_DOC_FIELDS}
        onSubmit={async (values) => { const a = await service.submitFormApplication({ form, version, product, values, members: [], source: "Public link" }); setRef(a.reference) }} />
      {ref && <p>Your reference: <b>{ref}</b></p>}
    </>,
  )
}

type Loaded = Awaited<ReturnType<typeof publicApplicationService.load>>

function ApiPublicApplication({ token }: { token: string }) {
  const [state, setState] = useState<{ status: "loading" } | { status: "error" } | { status: "ready"; loaded: Loaded }>({ status: "loading" })
  const [ref, setRef] = useState("")

  useEffect(() => {
    let active = true
    setState({ status: "loading" })
    publicApplicationService
      .load(token)
      .then((loaded) => active && setState({ status: "ready", loaded }))
      .catch(() => active && setState({ status: "error" }))
    return () => {
      active = false
    }
  }, [token])

  if (state.status === "loading") return wrap("Loading…")
  if (state.status === "error") return wrap(<><h1>Form unavailable</h1><p>This application form could not be loaded. Please try again.</p></>)
  if (!state.loaded) return unavailable

  const { form, version, product } = state.loaded
  return wrap(
    <>
      <h1>{form.name}</h1>
      <p style={{ color: "var(--muted)" }}>{product.description} No FinSquare account is needed to apply.</p>
      <FormRenderer version={version} audience="External" loan={product} guarantorDocFields={GUARANTOR_DOC_FIELDS}
        onSubmit={async (values) => { const r = await publicApplicationService.submit(token, version, product, values); setRef(r.applicationId) }} />
      {ref && <p>Your reference: <b>{ref}</b></p>}
    </>,
  )
}
