import { apiClient, endpoints } from "@/services/api"
import type {
  Contribution,
  ContributionCommission,
  ContributionDataset,
  ContributionParticipant,
  ContributionPeriod,
  ContributionPublicLink,
  ContributionStatus,
  ContributionTransaction,
  ContributionWithdrawal,
  PublicContributionInput,
  PublicContributionReceipt,
} from "../types/contribution.types"
import type {
  ContributionPlanPatch,
  ContributionPayoutRelease,
  ContributionRepository,
  ContributionSettlement,
  ContributionWithdrawalPatch,
  PublicContributionView,
} from "./contribution.repository"

/**
 * API-backed repository, wired to the MFI contribution endpoints.
 *
 * Each authenticated mutation maps to a named command on `/enterprise/contributions/*`; the service
 * still computes derived records (periods, balances, commission, payout breakdowns) client-side and
 * the backend applies them transactionally with an audit entry. Moving the math server-side is a
 * follow-up. The public link resolves and submits through unauthenticated `/public/contributions/*`
 * endpoints, so it carries no tenant and no session.
 */
export class ApiContributionRepository implements ContributionRepository {
  async load(): Promise<ContributionDataset> {
    return apiClient.get<ContributionDataset>(endpoints.contributions.workspace)
  }

  async createPlan(
    _organizationId: string,
    plan: Contribution,
    participants: ContributionParticipant[],
    periods: ContributionPeriod[],
  ): Promise<void> {
    await apiClient.post(endpoints.contributions.plans, { ...plan, participants, periods })
  }

  async updatePlan(
    _organizationId: string,
    planId: string,
    patch: ContributionPlanPatch,
  ): Promise<void> {
    await apiClient.patch(endpoints.contributions.plan(planId), patch)
  }

  async setPlanStatus(
    _organizationId: string,
    planId: string,
    status: ContributionStatus,
  ): Promise<void> {
    await apiClient.post(endpoints.contributions.planStatus(planId), { status })
  }

  async updatePlanCommission(
    _organizationId: string,
    planId: string,
    commission: ContributionCommission,
  ): Promise<void> {
    await apiClient.post(endpoints.contributions.planCommission(planId), { commission })
  }

  async setPlanPublicLink(
    _organizationId: string,
    planId: string,
    publicLink: ContributionPublicLink | null,
  ): Promise<void> {
    await apiClient.post(endpoints.contributions.planPublicLink(planId), { publicLink })
  }

  async recordPayment(
    _organizationId: string,
    transaction: ContributionTransaction,
    participant?: ContributionParticipant,
    period?: ContributionPeriod,
  ): Promise<void> {
    await apiClient.post(endpoints.contributions.payments, { transaction, participant, period })
  }

  async requestWithdrawal(
    _organizationId: string,
    withdrawal: ContributionWithdrawal,
    settlement?: ContributionSettlement,
  ): Promise<void> {
    await apiClient.post(endpoints.contributions.withdrawals, {
      withdrawal,
      transaction: settlement?.transaction,
      contribution: settlement?.contribution,
      participants: settlement?.participants,
    })
  }

  async approveWithdrawal(
    _organizationId: string,
    withdrawalId: string,
    patch: ContributionWithdrawalPatch,
    settlement?: ContributionSettlement,
  ): Promise<void> {
    await apiClient.post(endpoints.contributions.approveWithdrawal(withdrawalId), {
      ...patch,
      transaction: settlement?.transaction,
      contribution: settlement?.contribution,
      participants: settlement?.participants,
    })
  }

  async rejectWithdrawal(
    _organizationId: string,
    withdrawalId: string,
    note?: string,
  ): Promise<void> {
    await apiClient.post(endpoints.contributions.rejectWithdrawal(withdrawalId), { note })
  }

  async releasePayouts(
    _organizationId: string,
    today: string,
    release: ContributionPayoutRelease,
  ): Promise<void> {
    await apiClient.post(endpoints.contributions.releasePayouts, {
      today,
      withdrawals: release.withdrawals,
      participants: release.participants,
      transactions: release.transactions,
      contributions: release.contributions,
    })
  }

  async loadPublicContribution(
    slug: string,
    memberId?: string,
  ): Promise<PublicContributionView | undefined> {
    const query = memberId ? `?memberId=${encodeURIComponent(memberId)}` : ""
    const view = await apiClient.get<{
      contribution: Contribution
      participant: ContributionParticipant | null
    }>(`${endpoints.contributions.publicContribution(slug)}${query}`)
    return {
      contribution: view.contribution,
      participant: view.participant ?? undefined,
    }
  }

  async submitPublicContribution(
    slug: string,
    input: PublicContributionInput,
  ): Promise<PublicContributionReceipt | undefined> {
    const { memberId, contributorName, phone, email, amount, method } = input
    return apiClient.post<PublicContributionReceipt>(
      endpoints.contributions.publicContribution(slug),
      { memberId, contributorName, phone, email, amount, method },
    )
  }

  subscribe(): () => void {
    // A real implementation would subscribe to a websocket or poll for invalidation.
    return () => {}
  }
}
