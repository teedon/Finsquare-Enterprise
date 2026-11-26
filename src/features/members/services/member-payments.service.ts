import {
  contributionsService,
  type MutationContext,
} from "@/features/contributions/services/contributions.service"
import { duesService } from "@/features/dues/services/dues.service"
import { todayISO } from "@/features/loans/domain/calculations"
import { loansService } from "@/features/loans/services/loans.service"
import { walletServiceFor } from "@/features/wallet/services/wallet.service"
import { cashService } from "@/features/wallet/services/cash.service"
import type { CashReceipt, CashReceiptItem } from "@/features/wallet/types/cash.types"
import type { ContributionPaymentMethodId } from "@/features/contributions/types/contribution.types"
import type { RepaymentMethod } from "@/features/loans/types/loan.types"
import type { MemberObligation } from "../domain/member-obligations"

/**
 * How the money arrived. `wallet` moves it out of the member's own wallet; the others record a
 * payment received outside the system.
 */
export type MemberPaymentMethod = "wallet" | "cash" | "bank_transfer"

const contributorMethod: Record<MemberPaymentMethod, ContributionPaymentMethodId> = {
  wallet: "wallet",
  cash: "cash",
  bank_transfer: "bank_transfer",
}

const repaymentMethod: Record<MemberPaymentMethod, RepaymentMethod> = {
  wallet: "Wallet debit",
  cash: "Cash",
  bank_transfer: "Bank transfer",
}

export interface MemberPaymentItem {
  obligation: MemberObligation
  amount: number
}

export interface MemberPaymentInput {
  memberId: string
  memberName: string
  items: MemberPaymentItem[]
  method: MemberPaymentMethod
  /** Cash only: what the member handed over. Defaults to the amount applied; the rest is change. */
  cashReceived?: number
  note?: string
}

export interface MemberPaymentResult {
  recorded: number
  total: number
  simulated: boolean
  /** Set when cash was taken and the cash ledger accepted the receipt. */
  cashReceipt?: CashReceipt
  /** False when cash was taken but this install has no cash ledger to put it in. */
  cashTracked: boolean
  /** Why the cash was not tracked, so the surface can say it rather than imply the books are whole. */
  cashError?: string
}

/**
 * Pays what a member owes, across every module that raised it.
 *
 * The wallet is debited exactly once per item. A contribution and a dues charge debit through
 * their own service, which owns that rule; a loan instalment debits here and is then recorded as
 * already paid. The paths cannot both take the money. As everywhere else, the backend must
 * re-check the wallet balance, the outstanding amounts and the environment before committing this.
 */
export class MemberPaymentsService {
  constructor(
    private contributions = contributionsService,
    private loans = loansService,
    private dues = duesService,
    private cash = cashService,
  ) {}

  async recordPayment(
    organizationId: string,
    input: MemberPaymentInput,
    ctx: MutationContext,
  ): Promise<MemberPaymentResult> {
    const date = todayISO()
    let total = 0
    let recorded = 0
    /** What the obligations actually took, so the receipt lists what was settled rather than what was asked. */
    const settledItems: CashReceiptItem[] = []

    for (const { obligation, amount } of input.items) {
      if (amount <= 0) continue

      if (obligation.kind === "Contribution") {
        if (!obligation.contributionId || !obligation.participantId) continue
        const transaction = await this.contributions.recordPayment(
          organizationId,
          {
            contributionId: obligation.contributionId,
            participantId: obligation.participantId,
            periodKey: obligation.periodKey,
            amount,
            method: contributorMethod[input.method],
            note: input.note,
          },
          ctx,
        )
        if (!transaction) continue
        settledItems.push({
          kind: "Contribution",
          id: obligation.contributionId,
          participantId: obligation.participantId,
          periodKey: obligation.periodKey,
          label: obligation.title,
          amount,
        })
      } else if (obligation.kind === "Dues") {
        if (!obligation.duesPlanId) continue
        // The dues service owns the rule that a wallet payment is debited before it is recorded,
        // so the wallet is never touched twice for the same obligation.
        const transaction = await this.dues.recordPayment(
          organizationId,
          {
            duesPlanId: obligation.duesPlanId,
            participantId: obligation.participantId ?? "",
            amount,
            method: input.method,
            chargeId: obligation.duesChargeId,
            note: input.note,
          },
          ctx,
        )
        if (!transaction) continue
        settledItems.push({
          kind: "Dues",
          id: obligation.duesPlanId,
          participantId: obligation.participantId,
          label: obligation.title,
          amount,
        })
      } else {
        if (!obligation.loanId) continue
        if (input.method === "wallet") {
          // The tenant is bound here because the wallet is the community's, not the app's active one.
          const wallet = await walletServiceFor(organizationId).ensureMemberWallet(
            { memberId: input.memberId, memberName: input.memberName },
            ctx.actor,
          )
          await walletServiceFor(organizationId).spend(
            {
              walletId: wallet.id,
              amount,
              type: "Loan Repayment",
              kind: "Withdrawal",
              description: `${obligation.title} — repayment`,
              reference: obligation.loanId,
              counterparty: input.memberName,
            },
            ctx.actor,
            ctx.mode,
          )
        }
        await this.loans.recordRepayment({
          loanId: obligation.loanId,
          amount,
          method: repaymentMethod[input.method],
          date,
          reference: "",
          note: input.note,
        })
        settledItems.push({
          kind: "Loan",
          id: obligation.loanId,
          label: obligation.title,
          amount,
        })
      }

      total += amount
      recorded += 1
    }

    const rounded = Math.round(total * 100) / 100
    if (input.method !== "cash" || recorded === 0) {
      return { recorded, total: rounded, simulated: ctx.mode !== "live", cashTracked: true }
    }

    // Cash is already in hand, so it is recorded, not moved: credit the member's wallet with it,
    // settle the obligations from that balance, and hold the rest in the cash drawer. A backend that
    // has no cash ledger yet must not lose the payment that was just recorded, so the failure is
    // reported instead of thrown.
    const received = input.cashReceived !== undefined ? Math.round(input.cashReceived * 100) / 100 : rounded
    try {
      const cashReceipt = await this.cash.receive(
        organizationId,
        { memberId: input.memberId, memberName: input.memberName, amount: received, items: settledItems, note: input.note },
        ctx.actor,
        ctx.mode,
      )
      return { recorded, total: rounded, simulated: ctx.mode !== "live", cashReceipt, cashTracked: true }
    } catch (cause) {
      return {
        recorded,
        total: rounded,
        simulated: ctx.mode !== "live",
        cashTracked: false,
        cashError: cause instanceof Error ? cause.message : "The cash receipt could not be recorded.",
      }
    }
  }
}

export const memberPaymentsService = new MemberPaymentsService()
