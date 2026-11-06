import { apiClient, endpoints } from "@/services/api"
import { env } from "@/app/config/env"
import { emptyCorporateDetails } from "@/features/onboarding/types"
import type { CorporateAccountRepository, CorporateAccountState } from "./corporate-account.repository"

class MockCorporateAccountRepository implements CorporateAccountRepository {
  private state: CorporateAccountState = {
    status: "Not connected",
    details: { ...emptyCorporateDetails },
  }

  async get(): Promise<CorporateAccountState> {
    return this.state
  }

  async update(_organizationId: string, state: CorporateAccountState): Promise<void> {
    this.state = state
  }
}

class ApiCorporateAccountRepository implements CorporateAccountRepository {
  async get(): Promise<CorporateAccountState> {
    const loaded = await apiClient.get<Partial<CorporateAccountState>>(endpoints.corporateAccount.account)
    // The backend returns an empty `details` object for institutions that have not
    // connected a corporate account yet; merge the defaults so the form always
    // has every field (notably `documents: []`) to render against.
    return {
      status: loaded.status ?? "Not connected",
      details: { ...emptyCorporateDetails, ...(loaded.details ?? {}) },
    }
  }

  async update(_organizationId: string, state: CorporateAccountState): Promise<void> {
    await apiClient.patch(endpoints.corporateAccount.account, state)
  }
}

export const corporateAccountService: CorporateAccountRepository = env.VITE_ENABLE_MOCKS
  ? new MockCorporateAccountRepository()
  : new ApiCorporateAccountRepository()
