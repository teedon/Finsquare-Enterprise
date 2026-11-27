import { apiClient, endpoints } from "@/services/api"
import type { CommunicationDataset } from "../types/message.types"
import type { CommunicationRepository } from "./communication.repository"

/**
 * API-backed repository, wired to the MFI backend's enterprise messaging dataset endpoint.
 *
 * `load` reads the persisted dataset; `commit` posts the full dataset so the frontend keeps the
 * same repository shape while the mock is in place. The backend owns the stored history, balance
 * and top-ups; the SMS provider integration stays a backend concern.
 */
export class ApiCommunicationRepository implements CommunicationRepository {
  async load(): Promise<CommunicationDataset> {
    return apiClient.get<CommunicationDataset>(endpoints.communications.workspace)
  }

  async commit(_organizationId: string, next: Partial<CommunicationDataset>): Promise<void> {
    await apiClient.post(endpoints.communications.commands, next)
  }

  async topUpBalance(_organizationId: string, input: { amount: number; walletId: string }): Promise<{ balance: number }> {
    return apiClient.post<{ balance: number }>(endpoints.communications.topUp, input)
  }

  subscribe(): () => void {
    // A real implementation would subscribe to a websocket or poll for invalidation.
    return () => {}
  }
}
