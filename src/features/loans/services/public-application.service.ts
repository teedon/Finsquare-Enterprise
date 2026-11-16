import { apiClient, endpoints } from "@/services/api"
import type { FormResponseValue, FormVersion } from "@/features/forms/types/form.types"
import type { LoanProduct } from "../types/loan.types"
import { buildPublicForm, buildPublicPayload, type PublicFormDTO } from "../domain/public-application"

/** The unauthenticated application link of the MFI backend; the share token is the only credential. */
export const publicApplicationService = {
  async load(token: string) {
    return buildPublicForm(await apiClient.get<PublicFormDTO | null>(endpoints.loans.publicForm(token)))
  },

  async submit(token: string, version: FormVersion, product: LoanProduct, values: Record<string, FormResponseValue>) {
    return apiClient.post<{ applicationId: string }>(endpoints.loans.publicSubmit(token), buildPublicPayload(version, product, values))
  },
}
