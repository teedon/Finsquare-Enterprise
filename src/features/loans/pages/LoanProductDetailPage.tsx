import { useState } from "react"
import { Button, SectionHeader } from "@/components/ui"
import { publishedVersion } from "@/features/forms/domain/forms"
import { ProductWizard } from "../components/ProductWizard"
import { KV, LoanPage, Panel, StatusBadge, money, type LoanCtx, type LoanPageProps } from "../components/LoanUi"
import type { LoanProduct } from "../types/loan.types"

/**
 * One loan type: what it lends, who may apply, and — the reason this page exists — its public
 * application link, which used to be reachable only by walking the create wizard to its last step.
 */
function Detail({ product, ctx }: { product: LoanProduct; ctx: LoanCtx }) {
  const { data, service, can, notify } = ctx
  const [step, setStep] = useState<number | null>(null)
  const form = data.forms.find((f) => f.productId === product.id)
  const version = form ? publishedVersion(form) : undefined
  const fieldCount = version ? version.steps.reduce((total, s) => total + s.fields.length, 0) : 0
  const external = product.applicationType !== "Internal"
  const link = form && external ? `${window.location.origin}/apply/${form.slug}` : null
  const eligible = product.eligibility

  if (step !== null) {
    return (
      <ProductWizard
        ctx={ctx}
        initial={product}
        startStep={step}
        onClose={() => setStep(null)}
        onCancel={() => setStep(null)}
      />
    )
  }
  const copy = async () => {
    if (!link) return
    await navigator.clipboard?.writeText(link)
    notify("Application link copied")
  }

  return (
    <>
      <SectionHeader
        eyebrow="LOAN TYPE"
        title={product.name}
        description={product.description || "No description yet."}
        actions={
          <>
            <StatusBadge status={product.status} />
            {can("loan_products.update") && (
              <Button variant="secondary" onClick={() => setStep(0)}>
                Edit loan type
              </Button>
            )}
            {can("loan_products.activate") && (
              <Button
                variant="ghost"
                onClick={async () => {
                  await service.saveProduct({ ...product, status: product.status === "Active" ? "Inactive" : "Active" })
                  notify(`${product.name} ${product.status === "Active" ? "deactivated" : "activated"}`)
                }}
              >
                {product.status === "Active" ? "Deactivate" : "Activate"}
              </Button>
            )}
          </>
        }
      />

      <div className="dashboard-grid" style={{ marginTop: 0 }}>
        <div style={{ display: "grid", gap: 12, alignContent: "start" }}>
          <Panel
            title="Application link"
            subtitle={
              external
                ? "Anyone with this link can apply. No FinSquare account is needed."
                : "Members apply from inside the workspace, so this loan type has no public link."
            }
            flush={false}
          >
            {!external ? (
              <p className="contribution-hint" style={{ margin: 0 }}>
                Change <b>Application type</b> to External or Both if applicants should be able to apply from a link.
              </p>
            ) : !form || !version || form.status !== "Published" ? (
              <>
                <p className="contribution-hint" style={{ margin: "0 0 12px" }}>
                  {form && version
                    ? "This form is still a draft, so its link is not live yet. Publish it to start accepting applications."
                    : "This loan type has no published application form yet, so there is nothing to share."}
                </p>
                {can("loan_products.update") && <Button onClick={() => setStep(4)}>Open the application form</Button>}
              </>
            ) : (
              <>
                <div style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap" }}>
                  <label className="field" style={{ flex: "1 1 260px", minWidth: 0 }}>
                    <span>Public link</span>
                    <input readOnly value={link ?? ""} onFocus={(event) => event.currentTarget.select()} />
                  </label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <Button onClick={copy}>Copy link</Button>
                    <Button variant="secondary" onClick={() => link && window.open(link, "_blank")}>
                      Open
                    </Button>
                  </div>
                </div>
                <p className="contribution-hint">
                  Live · form version {version.version} · {form.submissions} application{form.submissions === 1 ? "" : "s"} received
                </p>
              </>
            )}
          </Panel>

          <Panel title="Loan rules">
            <KV
              cols={3}
              items={[
                ["Amount", `${money(product.minAmount)} – ${money(product.maxAmount)}`],
                ["Duration", `${product.minDuration}–${product.maxDuration} ${product.durationUnit.toLowerCase()}`],
                [
                  "Interest",
                  product.interestType === "Zero interest" ? "Zero interest" : `${product.interestRate}% ${product.interestType.toLowerCase()}`,
                ],
                ["Repayment", product.frequency],
                ["Application fee", product.applicationFeePct ? `${product.applicationFeePct}% of the loan` : "None"],
                ["Deduction", product.deductionModel],
                ["Grace period", product.graceDays ? `${product.graceDays} days` : "None"],
                ["Active loans allowed", String(product.maxActiveLoans)],
                ["Approval", product.requiresApproval ? "Administrator approval required" : "No approval step"],
              ]}
            />
          </Panel>

          <Panel title="Eligibility" subtitle="Evaluated for members when they apply">
            <KV
              cols={2}
              items={[
                ["Membership", eligible.minMembershipMonths ? `${eligible.minMembershipMonths} months minimum` : "No minimum"],
                ["Savings balance", eligible.minSavingsBalance ? money(eligible.minSavingsBalance) : "No minimum"],
                ["Overdue loans", eligible.blockIfOverdueLoan ? "Blocked until cleared" : "Not checked"],
                ["Identity (KYC)", eligible.requireKyc ? "Must be verified" : "Not required"],
              ]}
            />
          </Panel>
        </div>

        <div style={{ display: "grid", gap: 12, alignContent: "start" }}>
          <Panel title="Application form" actions={can("loan_products.update") && <Button variant="ghost" onClick={() => setStep(4)}>Edit form</Button>}>
            <KV
              cols={1}
              items={[
                ["Form", form?.name ?? "Not set up"],
                ["Version", version ? `v${version.version} · ${form?.status ?? "Draft"}` : "—"],
                ["Steps", version ? String(version.steps.length) : "—"],
                ["Questions", version ? String(fieldCount) : "—"],
                ["Submissions", String(form?.submissions ?? 0)],
              ]}
            />
          </Panel>

          <Panel title="Applicants">
            <KV
              cols={1}
              items={[
                ["Who can apply", product.applicationType === "Both" ? "Members and external applicants" : product.applicationType === "External" ? "External applicants only" : "Members only"],
                ["Guarantors", product.requiresGuarantor ? `${product.guarantorsRequired} required` : "Not required"],
                ["External guarantors", product.requiresGuarantor && product.allowExternalGuarantors ? "Allowed" : "Not allowed"],
                ["Guarantor verification", product.requiresGuarantor && product.requireGuarantorVerification ? "Required before approval" : "Not required"],
                ["Guarantor documents", product.requiresGuarantor && product.requireGuarantorDocuments ? "Required" : "Not required"],
              ]}
            />
          </Panel>
        </div>
      </div>
    </>
  )
}

export function LoanProductDetailPage(props: LoanPageProps) {
  return (
    <LoanPage {...props}>
      {(ctx) => {
        const product = ctx.data.products.find((p) => p.id === props.id)
        return product ? (
          <Detail product={product} ctx={ctx} />
        ) : (
          <div className="tab-empty">
            <b>Loan type not found</b>
            <span>It may have been removed. Open the loan types list to pick another.</span>
          </div>
        )
      }}
    </LoanPage>
  )
}
