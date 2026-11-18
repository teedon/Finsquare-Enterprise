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

/** A command that changes one plan returns the authoritative dataset alongside the plan. */
export interface DuesPlanCommandResult {
  plan?: DuesPlan
  dataset: DuesDataset
}

export interface DuesPaymentCommandResult {
  transaction?: DuesTransaction
  dataset: DuesDataset
}

export interface DuesRecoveryCommandResult {
  result: DuesRecoveryResult
  dataset: DuesDataset
}

/**
 * Persistence boundary for the dues domain.
 *
 * Every mutation is a named command because the backend is the only authority for charges, liens,
 * outstanding amounts and wallet movements — the client never sends a computed dataset back.
 * `organizationId` is the tenant context and is the first argument on every method.
 */
export interface DuesRepository {
  /** The complete workspace dataset: plans, their roster, the charge ledger and transactions. */
  load(organizationId: string): Promise<DuesDataset>
  createPlan(
    organizationId: string,
    input: CreateDuesPlanInput,
    ctx: MutationContext,
  ): Promise<DuesPlanCommandResult>
  setPlanStatus(
    organizationId: string,
    planId: string,
    status: DuesPlanStatus,
    ctx: MutationContext,
  ): Promise<DuesPlanCommandResult>
  updateLienRules(
    organizationId: string,
    planId: string,
    lien: DuesLienRules,
    ctx: MutationContext,
  ): Promise<DuesPlanCommandResult>
  recordPayment(
    organizationId: string,
    input: RecordDuesPaymentInput,
    ctx: MutationContext,
  ): Promise<DuesPaymentCommandResult>
  /** Collects unpaid dues from member wallets, oldest charge first. */
  runRecovery(
    organizationId: string,
    options: { memberId?: string; planId?: string },
    ctx: MutationContext,
  ): Promise<DuesRecoveryCommandResult>
  subscribe(listener: () => void): () => void
}
