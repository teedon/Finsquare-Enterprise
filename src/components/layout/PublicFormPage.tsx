import type { ReactNode } from "react"
import { BrandMark } from "./Brand"
import OrgAvatar from "./OrgAvatar"

/** The organisation that published a public link, when its payload names it. */
export interface PublicFormCommunity {
  name?: string | null
  logo?: string | null
}

/**
 * The scaffold every public link renders inside: who published it, what it is for, and one card
 * holding the form.
 *
 * Public pages carry no session and no sidebar, so this header is the only thing telling an
 * applicant which organisation they are dealing with. The identity block is skipped rather than
 * guessed when the public payload does not name the organisation — the product mark must never
 * stand in for a community.
 */
export function PublicFormPage({
  community,
  purpose,
  title,
  description,
  children,
}: {
  community?: PublicFormCommunity
  /** What the visitor is doing here: "Loan application", "Membership application", "Contribution". */
  purpose: string
  title: string
  description?: ReactNode
  children: ReactNode
}) {
  const name = community?.name?.trim()
  return (
    <div className="public-page">
      <div className="public-page-column">
        <header className="public-identity">
          {name ? (
            <>
              <div className="public-identity-who">
                <OrgAvatar name={name} logo={community?.logo ?? undefined} />
                <b>{name}</b>
              </div>
              <span className="public-identity-platform">Powered by FinSquare</span>
            </>
          ) : (
            // No organisation in the payload: show the platform and nothing else. Putting the product
            // mark where a community logo belongs would read as "this is FinSquare's form".
            <BrandMark size={28} />
          )}
        </header>

        <div className="public-intro">
          <span className="public-purpose">{purpose}</span>
          <h1>{title}</h1>
          {description && <p>{description}</p>}
        </div>

        <div className="public-card">{children}</div>

        {name && <p className="public-foot">{name} manages this page and receives what you submit.</p>}
      </div>
    </div>
  )
}

export default PublicFormPage
