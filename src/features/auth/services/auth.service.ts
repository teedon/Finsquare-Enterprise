import { apiClient, configureApiAuth, endpoints } from "@/services/api"
import { env } from "@/app/config/env"
import { ApiAuthRepository } from "../repositories/api-auth.repository"
import { MockAuthRepository } from "../repositories/mock-auth.repository"
import type { AuthRepository } from "../repositories/auth.repository"
import type { AuthOutcome, SignInCredentials, SignUpInput } from "../types"

const repository: AuthRepository = env.VITE_ENABLE_MOCKS ? new MockAuthRepository() : new ApiAuthRepository()

const TOKEN_KEY = "finsquare-auth-token"

function readStoredToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

function persistToken(token: string | null) {
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token)
    else window.localStorage.removeItem(TOKEN_KEY)
  } catch {
    // Storage unavailable (private mode) — the session stays in memory only.
  }
}

// The access token survives a page reload; `apiClient` reads it through this provider.
let accessToken: string | null = readStoredToken()
configureApiAuth(() => accessToken)

export const authService = {
  async requestPasswordReset(identifier: string): Promise<string> {
    const response = await apiClient.post<{ token: string }>(endpoints.auth.requestPasswordReset, { identifier })
    return response.token
  },

  async verifyPasswordResetOtp(token: string, otp: string): Promise<void> {
    await apiClient.post(endpoints.auth.verifyPasswordResetOtp, { token, otp })
  },

  async resendPasswordResetOtp(token: string): Promise<void> {
    await apiClient.post(endpoints.auth.resendPasswordResetOtp, { token })
  },

  async resetPassword(token: string, password: string): Promise<void> {
    await apiClient.post(endpoints.auth.resetPassword, { token, password })
  },

  async signIn(credentials: SignInCredentials): Promise<AuthOutcome> {
    const outcome = await repository.signIn(credentials)
    if (outcome.status === "signed-in") {
      accessToken = outcome.result.accessToken
      persistToken(accessToken)
    }
    return outcome
  },

  async signUp(input: SignUpInput): Promise<AuthOutcome> {
    const outcome = await repository.signUp(input)
    if (outcome.status === "signed-in") {
      accessToken = outcome.result.accessToken
      persistToken(accessToken)
    }
    return outcome
  },

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await repository.changePassword(currentPassword, newPassword)
  },

  async signOut(): Promise<void> {
    try {
      await repository.signOut()
    } finally {
      accessToken = null
      persistToken(null)
    }
  },
}
