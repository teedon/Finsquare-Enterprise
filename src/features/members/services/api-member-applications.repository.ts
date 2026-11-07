import { apiClient, endpoints } from "@/services/api"
import { ApiError } from "@/services/api/types"
import type { FormResponseValue } from "@/features/forms/types/form.types"
import type { MemberApplication, MemberApplicationDataset, MemberApplicationForm } from "../types/member-application.types"
import type { MemberApplicationRepository } from "./member-applications.repository"

const listeners = new Set<() => void>()
const notify = () => listeners.forEach((listener) => listener())

/**
 * API-backed repository. The backend owns reference allocation, the join-mode decision and member
 * creation, so each mutation is a named command rather than a dataset batch.
 */
export class ApiMemberApplicationRepository implements MemberApplicationRepository {
  async load(): Promise<MemberApplicationDataset> {
    return apiClient.get<MemberApplicationDataset>(endpoints.memberApplications.workspace)
  }

  async saveForm(_organizationId: string, form: MemberApplicationForm): Promise<void> {
    // `createdAt` is generated and owned by the backend (`@default(now())` on the
    // MfiMemberApplicationForm model), and is not part of UpsertMemberApplicationFormDto.
    // The API rejects unknown properties, so strip the client-only display field.
    const payload = Object.fromEntries(
      Object.entries(form).filter(([key]) => key !== "createdAt"),
    )
    await apiClient.post(endpoints.memberApplications.forms, payload)
    notify()
  }

  async saveApplication(_organizationId: string, application: MemberApplication): Promise<void> {
    await apiClient.post(endpoints.memberApplications.applications, application)
    notify()
  }

  async getPublicForm(slug: string): Promise<MemberApplicationForm | null> {
    try {
      return await apiClient.get<MemberApplicationForm>(endpoints.memberApplications.publicForm(slug))
    } catch (error) {
      if (error instanceof ApiError && error.code === "not_found") return null
      throw error
    }
  }

  async submitPublic(slug: string, values: Record<string, FormResponseValue>): Promise<MemberApplication> {
    return apiClient.post<MemberApplication>(endpoints.memberApplications.publicSubmit(slug), { values })
  }

  subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return () => void listeners.delete(listener)
  }
}
