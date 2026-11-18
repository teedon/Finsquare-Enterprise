import { apiClient, endpoints } from "@/services/api"
import type {
  CreateDuesPlanInput,
  DuesDataset,
  DuesLienRules,
  DuesPlan,
  DuesPlanStatus,
  DuesRecoveryResult,
  DuesTransaction,
  MutationContext,
  RecordDuesPaymentInput,
} from "../types/dues.types"
import type {
  DuesPaymentCommandResult,
  DuesPlanCommandResult,
  DuesRecoveryCommandResult,
  DuesRepository,
} from "./dues.repository"

interface PlanCommandResponse {
  plan?: DuesPlan
  dataset: DuesDataset
}

interface PaymentCommandResponse {
  transaction?: DuesTransaction
  dataset: DuesDataset
}

interface RecoveryCommandResponse {
  result: DuesRecoveryResult
  dataset: DuesDataset
}

/**
 * API-backed repository, wired to the MFI dues endpoints.
 *
 * Every mutation is a named command: the backend re-derives charge states, liens and outstanding
 * amounts, debits the wallet atomically once per charge and writes an audit row, then returns the
 * authoritative dataset.
 */
export class ApiDuesRepository implements DuesRepository {
  async load(organizationId: string): Promise<DuesDataset> {
    return apiClient.get<DuesDataset>(endpoints.dues.list(organizationId))
  }

  async createPlan(
    organizationId: string,
    input: CreateDuesPlanInput,
    ctx: MutationContext,
  ): Promise<DuesPlanCommandResult> {
    void ctx;
    return apiClient.post<PlanCommandResponse>(endpoints.dues.plans(organizationId), {
      name: input.name,
      description: input.description,
      amount: input.amount,
      frequency: input.frequency,
      customFrequency: input.customFrequency,
      startDate: input.startDate,
      endDate: input.endDate,
      scope: input.scope,
      groupId: input.groupId,
      groupName: input.groupName,
      branchId: input.branchId,
      branchName: input.branchName,
      roster: input.roster.map((entry) => ({
        memberId: entry.memberId,
        memberName: entry.memberName,
        memberCode: entry.memberCode,
        branchId: entry.branchId,
        branchName: entry.branchName,
        phone: entry.phone,
      })),
      lien: input.lien,
    })
  }

  async setPlanStatus(
    organizationId: string,
    planId: string,
    status: DuesPlanStatus,
    ctx: MutationContext,
  ): Promise<DuesPlanCommandResult> {
    void ctx;
    return apiClient.patch<PlanCommandResponse>(endpoints.dues.planStatus(organizationId, planId), {
      status,
    })
  }

  async updateLienRules(
    organizationId: string,
    planId: string,
    lien: DuesLienRules,
    ctx: MutationContext,
  ): Promise<DuesPlanCommandResult> {
    void ctx;
    return apiClient.patch<PlanCommandResponse>(endpoints.dues.planLien(organizationId, planId), lien)
  }

  async recordPayment(
    organizationId: string,
    input: RecordDuesPaymentInput,
    ctx: MutationContext,
  ): Promise<DuesPaymentCommandResult> {
    return apiClient.post<PaymentCommandResponse>(
      endpoints.dues.payments(organizationId, input.duesPlanId),
      {
        participantId: input.participantId,
        amount: input.amount,
        method: input.method,
        chargeId: input.chargeId,
        note: input.note,
        mode: ctx.mode,
      },
    )
  }

  async runRecovery(
    organizationId: string,
    options: { memberId?: string; planId?: string },
    ctx: MutationContext,
  ): Promise<DuesRecoveryCommandResult> {
    return apiClient.post<RecoveryCommandResponse>(endpoints.dues.recover(organizationId), {
      planId: options.planId,
      memberId: options.memberId,
      mode: ctx.mode,
    })
  }

  subscribe(): () => void {
    // A real implementation would subscribe to a websocket or poll for invalidation.
    return () => {}
  }
}
