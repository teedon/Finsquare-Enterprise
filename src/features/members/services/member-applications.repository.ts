import type { FormResponseValue } from "@/features/forms/types/form.types"
import type { MemberApplication, MemberApplicationDataset, MemberApplicationForm, PublicMemberApplicationForm } from "../types/member-application.types"

/** Contract for the member application data source. Swap the mock for an API-backed implementation later. */
export interface MemberApplicationRepository {
  load(organizationId: string): Promise<MemberApplicationDataset>
  saveForm(organizationId: string, form: MemberApplicationForm): Promise<void>
  saveApplication(organizationId: string, application: MemberApplication): Promise<void>
  subscribe(listener: () => void): () => void
  /** Public link: resolve a form by slug without a session. */
  getPublicForm(slug: string): Promise<PublicMemberApplicationForm | null>
  /** Public link: submit an application. The backend owns reference allocation and member creation. */
  submitPublic(slug: string, values: Record<string, FormResponseValue>): Promise<MemberApplication>
}
