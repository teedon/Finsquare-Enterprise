import type { FormResponseValue, VersionedForm } from "@/features/forms/types/form.types"

/**
 * How someone becomes a member once they submit. One setting, not a workflow builder.
 *
 * - `Open` — anyone with the link can submit and becomes a member straight away.
 * - `Approval` — the submission lands in the review queue for an administrator to approve or reject.
 */
export type MemberJoinMode = "Open" | "Approval"

export const MEMBER_JOIN_MODES: { id: MemberJoinMode; label: string; description: string }[] = [
  { id: "Approval", label: "Approval required", description: "Applications wait for an administrator to approve or reject them." },
  { id: "Open", label: "Open joining", description: "Anyone with the link becomes a member as soon as they submit." },
]

export type MemberApplicationStatus = "Submitted" | "Under Review" | "Approved" | "Rejected"

export const MEMBER_APPLICATION_STATUSES: MemberApplicationStatus[] = ["Submitted", "Under Review", "Approved", "Rejected"]

/** A member application form, versioned exactly like a loan application form. */
export interface MemberApplicationForm extends VersionedForm {
  id: string
  name: string
  slug: string
  joinMode: MemberJoinMode
  /** The group approved and open-joining members are added to. */
  groupId: string
  /** The administrator can take the link down without archiving the form. */
  linkEnabled: boolean
  submissions: number
  createdAt: string
}

/**
 * The form as the public link receives it. The loan application link already names the lender
 * (`mfiName`/`mfiLogo`); when the member-application link returns the same pair the page can show
 * which community the applicant is joining. Absent until then, so the page renders without it.
 */
export interface PublicMemberApplicationForm extends MemberApplicationForm {
  mfiName?: string | null
  mfiLogo?: string | null
}

export interface MemberApplication {
  id: string
  reference: string
  formId: string
  formName: string
  versionId: string
  versionNumber: number
  submittedAt: string
  status: MemberApplicationStatus
  /** Keyed by field id, exactly as the applicant answered. */
  values: Record<string, FormResponseValue>
  /** Set once the application has produced a member record. */
  memberId?: string
  reviewer?: string
  decidedAt?: string
  rejectionReason?: string
  source: "Public link" | "Recorded by staff"
}

export interface MemberApplicationDataset {
  forms: MemberApplicationForm[]
  applications: MemberApplication[]
}
