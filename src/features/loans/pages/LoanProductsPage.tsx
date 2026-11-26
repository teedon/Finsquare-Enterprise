import { useState } from "react"
import { Plus, Pencil } from "@/icons"
import { Button, SectionHeader, Badge } from "@/components/ui"
import { publishedVersion } from "@/features/forms/domain/forms"
import { ProductWizard } from "../components/ProductWizard"
import { QuestionLibraryManager } from "@/features/forms/components/QuestionLibrary"
import { useQuestionLibrary } from "@/features/forms/hooks/useQuestionLibrary"
import { useOrganizationId } from "@/hooks/useOrganizationId"
import { LoanPage, PagedTable, Panel, StatusBadge, Tabs, money, type LoanPageProps } from "../components/LoanUi"
import type { LoanProduct } from "../types/loan.types"

export function LoanProductsPage(props: LoanPageProps) {
  const organizationId = useOrganizationId()
  const [tab, setTab] = useState<"products" | "forms" | "library">("products")
  const [editing, setEditing] = useState<{ product: LoanProduct | null; step: number } | null>(props.id === "new" ? { product: null, step: 0 } : null)
  const questionLibrary = useQuestionLibrary(organizationId)
  return (
    <LoanPage {...props}>
      {(ctx) => {
        const { data, can, service, notify, navigate } = ctx
        if (editing) return <ProductWizard ctx={ctx} initial={editing.product} startStep={editing.step} onClose={() => { setEditing(null); if (props.id === "new") navigate("loan-products") }} />
        const link = (slug: string) => `${window.location.origin}/apply/${slug}`
        return (
          <>
            <SectionHeader eyebrow="LOANS" title="Loan types" description="Configure the loan types borrowers can apply for, their application forms and reusable questions."
              actions={can("loan_products.create") && <Button icon={Plus} onClick={() => setEditing({ product: null, step: 0 })}>Create loan type</Button>} />
            <Tabs value={tab} onChange={setTab} tabs={[{ id: "products", label: "Loan types", count: data.products.length }, { id: "forms", label: "Application forms", count: data.forms.length }, { id: "library", label: "Question library", count: questionLibrary.items.filter((q) => !q.archived).length }]} />
            {tab === "products" && (
              <Panel>
                <PagedTable rows={data.products} rowKey={(p) => p.id} onRowClick={(p) => navigate("loan-product-detail", p.id)}
                  columns={[
                    { id: "n", header: "Product", render: (p) => <><b>{p.name}</b><div style={{ color: "var(--muted)", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis" }}>{p.description}</div></> },
                    { id: "a", header: "Amount", render: (p) => `${money(p.minAmount)} – ${money(p.maxAmount)}` },
                    { id: "d", header: "Duration", render: (p) => `${p.minDuration}–${p.maxDuration} ${p.durationUnit.toLowerCase()}` },
                    { id: "i", header: "Interest", render: (p) => (p.interestType === "Zero interest" ? "Zero interest" : `${p.interestRate}% ${p.interestType.toLowerCase()}`) },
                    { id: "t", header: "Applicants", render: (p) => p.applicationType },
                    { id: "g", header: "Guarantors", render: (p) => (p.requiresGuarantor ? p.guarantorsRequired : <Badge>None</Badge>) },
                    { id: "s", header: "Status", render: (p) => <StatusBadge status={p.status} /> },
                    { id: "x", header: "", render: (p) => (
                      <span style={{ display: "flex", gap: 6 }} onClick={(event) => event.stopPropagation()}>
                        <Button variant="ghost" onClick={() => navigate("loan-product-detail", p.id)}>Open</Button>
                        {can("loan_products.activate") && <Button variant="ghost" onClick={async () => { await service.saveProduct({ ...p, status: p.status === "Active" ? "Inactive" : "Active" }); notify(`${p.name} ${p.status === "Active" ? "deactivated" : "activated"}`) }}>{p.status === "Active" ? "Deactivate" : "Activate"}</Button>}
                      </span>) },
                  ]} />
              </Panel>
            )}
            {tab === "forms" && (
              <Panel>
                <PagedTable rows={data.forms} rowKey={(f) => f.id}
                  columns={[
                    { id: "n", header: "Form", render: (f) => <b>{f.name}</b> },
                    { id: "p", header: "Loan type", render: (f) => data.products.find((p) => p.id === f.productId)?.name },
                    { id: "a", header: "Applicants", render: (f) => data.products.find((p) => p.id === f.productId)?.applicationType },
                    { id: "v", header: "Live version", render: (f) => { const v = publishedVersion(f); return v ? `v${v.version}${f.versions.some((x) => x.status === "Draft") ? " (+draft)" : ""}` : f.versions.some((x) => x.status === "Draft") ? "Draft only" : "—" } },
                    { id: "u", header: "Submissions", render: (f) => f.submissions },
                    { id: "s", header: "Status", render: (f) => <StatusBadge status={f.status} /> },
                    { id: "x", header: "", render: (f) => {
                      const prod = data.products.find((p) => p.id === f.productId)
                      const pub = f.status === "Published" && prod && prod.applicationType !== "Internal"
                      return (
                        <span style={{ display: "flex", gap: 6 }}>
                          {can("loan_products.update") && prod && <Button variant="ghost" icon={Pencil} onClick={() => setEditing({ product: prod, step: 4 })}>Edit</Button>}
                          <Button variant="ghost" onClick={() => navigate("loan-applications")}>Responses</Button>
                          {pub && <Button variant="ghost" onClick={() => { void navigator.clipboard?.writeText(link(f.slug)); notify("Public link copied") }}>Copy link</Button>}
                          {pub && <Button variant="ghost" onClick={() => window.open(`/apply/${f.slug}`, "_blank")}>Open</Button>}
                          {can("loan_products.update") && f.status === "Published" && <Button variant="ghost" onClick={async () => { await service.archiveForm(f); notify("Form archived") }}>Archive</Button>}
                        </span>)
                    } },
                  ]} />
              </Panel>
            )}
            {tab === "library" && <QuestionLibraryManager library={questionLibrary.api(can("loan_products.update"), notify)} />}
          </>
        )
      }}
    </LoanPage>
  )
}
