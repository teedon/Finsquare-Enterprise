import { useState } from "react"
import { ArrowRight, BadgeCheck, Check, Download, FileText, Upload } from "@/icons"
import { Button, Badge, SectionHeader } from "@/components/ui"
import type { CSSProperties } from "react"
import type { ComplianceDocumentStatus as DocStatus, CorporateAccountStatus } from "@/types"
import CorporateAccountForm from "@/features/onboarding/components/CorporateAccountForm"
import { corporateSchema, validate, type FieldErrors } from "@/features/onboarding/domain/validation"
import type { CorporateAccountDetails } from "@/features/onboarding/types"
import { complianceRequirementsMock } from "../mocks/compliance.mock"

export function CompliancePage({
  docs,
  updateDoc,
}: {
  docs: DocStatus[]
  updateDoc: (index: number, status: DocStatus) => void
}) {
  const approved = docs.filter((d) => d === "Approved").length
  const percent = 40 + approved * 12
  const names = complianceRequirementsMock.map((requirement) => requirement.name)
  return (
    <div className="page">
      <SectionHeader
        eyebrow="COMPLIANCE CENTER"
        title="Organization verification"
        description="Complete verification in parallel while you configure and digitize your organization."
        actions={
          <Badge tone={percent === 100 ? "green" : "amber"}>{percent === 100 ? "Verified" : "In progress"}</Badge>
        }
      />
      <div className="compliance-progress">
        <div>
          <div className="progress-ring" style={{ "--progress": `${percent * 3.6}deg` } as CSSProperties}>
            <span>{percent}%</span>
          </div>
          <div>
            <b>{percent === 100 ? "Verification complete" : "Verification in progress"}</b>
            <span>
              {percent === 100
                ? "Your organization has met the verification requirements."
                : "Complete the remaining requirements to enable live operations."}
            </span>
          </div>
        </div>
        <Button variant="secondary" icon={Download}>
          Download checklist
        </Button>
      </div>
      <div className="compliance-sections">
        {[
          ["Organization details", "Completed", "4 of 4 fields"],
          ["Corporate documents", `${approved} / 5 submitted`, "Registration and governance"],
          ["Authorized representatives", "Completed", "2 representatives"],
          ["Identity verification", "2 / 3 completed", "One review remaining"],
          [
            "Additional requirements",
            docs.includes("Required") ? "2 documents required" : "Completed",
            "Based on organization type",
          ],
        ].map(([title, status, sub], i) => (
          <div key={title}>
            <div className={`compliance-icon ${status === "Completed" ? "complete" : ""}`}>
              {status === "Completed" ? <Check size={15} /> : i + 1}
            </div>
            <div>
              <b>{title}</b>
              <span>{sub}</span>
            </div>
            <Badge tone={status === "Completed" ? "green" : status.includes("required") ? "red" : "amber"}>
              {status}
            </Badge>
          </div>
        ))}
      </div>
      <section className="panel document-panel">
        <div className="panel-head">
          <div>
            <b>Corporate documents</b>
            <span>Keep your registration, address and representative documents current</span>
          </div>
          <Button variant="secondary" icon={Upload}>
            Upload document
          </Button>
        </div>
        <div className="document-table">
          {names.map((name, index) => (
            <div className="document-row" key={name}>
              <div className="doc-icon">
                <FileText size={16} />
              </div>
              <div>
                <b>{name}</b>
                <span>{docs[index] === "Required" ? "No file uploaded" : `PDF · Updated ${index + 18} May 2025`}</span>
              </div>
              <Badge tone={docs[index] === "Approved" ? "green" : docs[index] === "Pending" ? "amber" : "red"}>
                {docs[index]}
              </Badge>
              <div className="doc-actions">
                {docs[index] !== "Required" && <Button variant="ghost">View</Button>}
                <Button
                  variant="secondary"
                  onClick={() => updateDoc(index, docs[index] === "Approved" ? "Pending" : "Approved")}
                >
                  {docs[index] === "Required" ? "Upload" : docs[index] === "Approved" ? "Replace" : "Approve"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

export function CorporatePage({
  details,
  saveDetails,
  status,
  setStatus,
  notify,
}: {
  details: CorporateAccountDetails
  saveDetails: (value: CorporateAccountDetails) => void
  status: CorporateAccountStatus
  setStatus: (s: CorporateAccountStatus) => void
  notify: (s: string) => void
}) {
  const [draft, setDraft] = useState(details)
  const [errors, setErrors] = useState<FieldErrors>({})
  const tone = status === "Connected" ? "green" : status === "Under review" ? "amber" : "neutral"
  return (
    <div className="page">
      <SectionHeader
        eyebrow="SETTINGS"
        title="Corporate account & wallet"
        description="Provide your organization's corporate account details to enable real financial operations."
        actions={<Badge tone={tone}>{status}</Badge>}
      />
      {status === "Connected" ? (
        <div className="connected-state">
          <div className="connected-icon">
            <BadgeCheck size={30} />
          </div>
          <div className="page-title">Corporate account connected</div>
          <p>Your workspace is ready for live financial operations.</p>
          <div className="account-details">
            <div>
              <span>Business</span>
              <b>{details.businessName || "—"}</b>
            </div>
            <div>
              <span>Settlement account</span>
              <b>
                {details.bankName} · {details.accountNumber || "—"}
              </b>
            </div>
            <div>
              <span>Authorized representative</span>
              <b>{details.repName || "—"}</b>
            </div>
            <div>
              <span>Currency</span>
              <b>Nigerian Naira (NGN)</b>
            </div>
          </div>
        </div>
      ) : (
        <section className="panel account-form">
          <div className="panel-head">
            <div>
              <b>{status === "Under review" ? "Submitted for review" : "Account details"}</b>
              <span>
                {status === "Under review"
                  ? "You can update your details while the review is in progress."
                  : "Complete this to enable live money movement. Everything else in the workspace stays available while you fill it in."}
              </span>
            </div>
          </div>
          <div className="account-content">
            <CorporateAccountForm value={draft} onChange={setDraft} errors={errors} />
          </div>
          <div className="account-footer">
            <Button
              variant="ghost"
              onClick={() => {
                saveDetails(draft)
                notify("Draft saved")
              }}
            >
              Save draft
            </Button>
            {status === "Not connected" ? (
              <Button
                onClick={() => {
                  const found = validate(corporateSchema, draft)
                  setErrors(found)
                  if (Object.keys(found).length) return notify("Please fix the highlighted fields")
                  saveDetails(draft)
                  setStatus("Under review")
                  notify("Corporate account request submitted for review")
                }}
              >
                Submit for review <ArrowRight size={14} />
              </Button>
            ) : (
              <Button
                onClick={() => {
                  saveDetails(draft)
                  setStatus("Connected")
                  notify("Account connected")
                }}
              >
                Approve account
              </Button>
            )}
          </div>
        </section>
      )}
    </div>
  )
}
