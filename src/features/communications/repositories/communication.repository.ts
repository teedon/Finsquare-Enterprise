import type { CommunicationDataset } from "../types/message.types"

/**
 * The messaging workspace for one organization. Every method takes the tenant first, exactly like
 * every other repository in the app, so switching to the API implementation cannot lose the
 * organization context.
 */
export interface CommunicationRepository {
  load(organizationId: string): Promise<CommunicationDataset>
  commit(organizationId: string, next: Partial<CommunicationDataset>): Promise<void>
  topUpBalance?(organizationId: string, input: { amount: number; walletId: string }): Promise<{ balance: number }>
  subscribe(listener: () => void): () => void
}
