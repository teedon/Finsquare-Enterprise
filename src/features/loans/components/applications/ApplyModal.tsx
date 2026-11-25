import { useState } from "react"
import { Modal } from "@/components/ui"
import { publishedVersion } from "@/features/forms/domain/forms"
import { FormRenderer } from "@/features/forms/components/FormRenderer"
import { GUARANTOR_DOC_FIELDS } from "../../domain/loan-forms"
import type { LoanCtx } from "../LoanUi"

/** In-app application for existing members; loads the published form of the chosen product. */
export function ApplyModal({ ctx, onClose }: { ctx: LoanCtx; onClose: () => void }) {
  const { data, service, notify, navigate } = ctx
  const products = data.products.filter((p) => p.status === "Active" && p.applicationType !== "External" && publishedVersion(data.forms.find((f) => f.productId === p.id)))
  const [productId, setProductId] = useState(products[0]?.id ?? "")
  const product = products.find((p) => p.id === productId)
  const form = product && data.forms.find((f) => f.productId === product.id)
  const version = publishedVersion(form)
  return (
    <Modal title="New member application" wide onClose={onClose}>
      <div className="wizard-body">
        {!products.length ? "No active loan types with a published internal application form are available." :
          !data.borrowers.some((member) => member.type === "Member") ? "No active members are available for an application." :
          !product || !form || !version ? "The selected loan type has no published application form." : (
          <>
            <label className="field">
              <span>Loan type</span>
              <select value={productId} onChange={(event) => setProductId(event.target.value)}>
                {products.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            <div style={{ marginTop: 14 }}>
              <FormRenderer key={product.id} version={version} audience="Internal" members={data.borrowers} loan={product} guarantorDocFields={GUARANTOR_DOC_FIELDS}
                onSubmit={async (values) => { const a = await service.submitFormApplication({ form, version, product, values, members: data.borrowers, source: "Internal" }); notify(`Application ${a.reference} submitted`); onClose(); navigate("loan-application-detail", a.id) }} />
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
