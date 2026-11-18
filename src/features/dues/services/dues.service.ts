import { env } from "@/app/config/env"
import { walletServiceFor } from "@/features/wallet/services/wallet.service"
import { ApiDuesRepository } from "../repositories/api-dues.repository"
import { createMockDuesRepository } from "../repositories/mock-dues.repository"
import type { DuesRepository } from "../repositories/dues.repository"
import type {
  CreateDuesPlanInput,
  DuesActor,
  DuesMoneyMode,
  DuesPlan,
  DuesPlanStatus,
  DuesRecoveryResult,
  DuesTransaction,
  MutationContext,
  RecordDuesPaymentInput,
} from "../types/dues.types"

export type { DuesActor, DuesMoneyMode, MutationContext } from "../types/dues.types"

/** The actor recorded when money is collected without an administrator pressing a button. */
export const AUTOMATIC_RECOVERY_ACTOR: DuesActor = {
  id: "system",
  name: "Automatic recovery",
}

/** Commands that do not move money (a plan's status or lien policy) default to the system actor. */
const SYSTEM_CONTEXT: MutationContext = { actor: AUTOMATIC_RECOVERY_ACTOR, mode: "live" }

/**
 * Dues commands.
 *
 * The repository owns the rules — charge states, liens, outstanding amounts, wallet deductions and
 * audit are authoritative on the server. This layer is the UI's entry point: it guards money
 * movement, keeps one recovery run per scope at a time and owns the auto-recovery subscription.
 */
export class DuesService {
  constructor(
    private repo: DuesRepository = env.VITE_ENABLE_MOCKS
      ? createMockDuesRepository()
      : new ApiDuesRepository(),
  ) {}

  load = (organizationId: string) => this.repo.load(organizationId)
  subscribe = (listener: () => void) => this.repo.subscribe(listener)

  /** An automatic recovery and an administrator's "Recover now" must not run at the same time. */
  private recovering = new Set<string>()

  private guard(mode: DuesMoneyMode) {
    if (mode === "blocked") {
      throw new Error("Money movement is disabled in this environment.")
    }
  }

  /**
   * Creates a plan, its roster and the expected charge ledger for that roster. The backend derives
   * the schedule itself rather than trusting what the client calculated.
   */
  async createPlan(
    organizationId: string,
    input: CreateDuesPlanInput,
    ctx: MutationContext,
  ): Promise<DuesPlan> {
    const { plan } = await this.repo.createPlan(organizationId, input, ctx)
    if (!plan) throw new Error("The dues plan could not be created.")
    return plan
  }

  /** Pauses, resumes or closes a plan. Closing also drops charges that are not due yet. */
  async setStatus(
    organizationId: string,
    planId: string,
    status: DuesPlanStatus,
    ctx: MutationContext = SYSTEM_CONTEXT,
  ): Promise<DuesPlan | undefined> {
    const { plan } = await this.repo.setPlanStatus(organizationId, planId, status, ctx)
    return plan
  }

  /** Changes the lien rules of an existing plan. Organization-level money policy. */
  async updateLienRules(
    organizationId: string,
    planId: string,
    lien: DuesPlan["lien"],
    ctx: MutationContext = SYSTEM_CONTEXT,
  ): Promise<DuesPlan | undefined> {
    const { plan } = await this.repo.updateLienRules(organizationId, planId, lien, ctx)
    return plan
  }

  /**
   * Records a payment against what a participant owes. The amount is spread across that
   * participant's due charges, oldest first, never beyond what they owe.
   */
  async recordPayment(
    organizationId: string,
    input: RecordDuesPaymentInput,
    ctx: MutationContext,
  ): Promise<DuesTransaction | undefined> {
    this.guard(ctx.mode)
    const { transaction } = await this.repo.recordPayment(organizationId, input, ctx)
    return transaction
  }

  /**
   * Collects what members owe from their wallets, following each plan's lien rules. Oldest charges
   * first, capped at each charge's outstanding amount and at the wallet's balance.
   */
  async runLienRecovery(
    organizationId: string,
    ctx: MutationContext,
    options: { memberId?: string; planId?: string } = {},
  ): Promise<DuesRecoveryResult> {
    this.guard(ctx.mode)
    const scopeKey = `${organizationId}:${options.memberId ?? "*"}:${options.planId ?? "*"}`
    if (this.recovering.has(scopeKey)) {
      return { recovered: 0, chargesSettled: 0, membersTouched: 0, skipped: 0 }
    }
    this.recovering.add(scopeKey)
    try {
      const { result } = await this.repo.runRecovery(organizationId, options, ctx)
      return result
    } finally {
      this.recovering.delete(scopeKey)
    }
  }

  /**
   * Subscribes to the wallet so outstanding dues are collected as soon as money reaches a member's
   * wallet. The hook owns the subscription's lifetime because it knows the environment's
   * money-movement mode.
   */
  startAutoRecovery(organizationId: string, mode: DuesMoneyMode): () => void {
    return walletServiceFor(organizationId).onWalletsCredited((wallets) => {
      const memberIds = new Set(
        wallets
          .filter((wallet) => wallet.scope === "member" && wallet.memberId)
          .map((wallet) => wallet.memberId as string),
      )
      for (const memberId of memberIds) {
        const ctx: MutationContext = { actor: AUTOMATIC_RECOVERY_ACTOR, mode }
        void this.runLienRecovery(organizationId, ctx, { memberId }).catch(() => {
          /* an automatic recovery must never break the funding that triggered it */
        })
      }
    })
  }
}

export const duesService = new DuesService()
