import { env } from "@/app/config/env"
import { walletServiceFor, type Mode } from "@/features/wallet/services/wallet.service"
import {
  canAfford,
  channelsFor,
  estimateCost,
  personalise,
  reachableOn,
  simulateDelivery,
  summariseDelivery,
} from "../domain/messaging"
import { ApiCommunicationRepository } from "../repositories/api-communication.repository"
import { createMockCommunicationRepository } from "../repositories/mock-communication.repository"
import type { CommunicationRepository } from "../repositories/communication.repository"
import type {
  CommunicationDataset,
  Message,
  MessageRecipient,
  MessageSummary,
  ResolvedRecipient,
  SendMessageInput,
} from "../types/message.types"

export interface CommunicationActor {
  id: string
  name: string
}

export interface CommunicationContext {
  actor: CommunicationActor
  /** The environment's money-movement mode, passed straight through to the wallet module. */
  mode: Mode
}

const isSimulated = (ctx: CommunicationContext) => ctx.mode !== "live"

const now = () => new Date().toISOString()
let sequence = 0
const nextId = (prefix: string) => `${prefix}-${Date.now().toString(36)}${(sequence += 1).toString(36)}`

const round2 = (value: number) => Math.round(value * 100) / 100

/** Raised when a send cannot happen; the message is safe to show the administrator as-is. */
export class CommunicationError extends Error {}

/**
 * Messaging commands for one organization.
 *
 * The SMS balance is money, so every rule that protects money lives here rather than in a
 * component: the cost is computed from the body and the reachable recipients, an unaffordable send
 * is refused before anything is written, and the deduction happens in the same mutation that
 * records the message. The backend must do the same atomically.
 */
export class CommunicationService {
  constructor(private repo: CommunicationRepository = createMockCommunicationRepository()) {}

  load = (organizationId: string) => this.repo.load(organizationId)
  subscribe = (listener: () => void) => this.repo.subscribe(listener)

  private async mutate(
    organizationId: string,
    update: (dataset: CommunicationDataset) => Partial<CommunicationDataset>,
  ): Promise<CommunicationDataset> {
    const current = await this.repo.load(organizationId)
    const next = { ...current, ...update(current) }
    await this.repo.commit(organizationId, next)
    return next
  }

  /**
   * Sends a message and charges the balance for the texts it contains.
   *
   * Each recipient is personalised and given an outcome by `simulateDelivery`, which the backend
   * replaces with the provider's delivery report. A message that reaches nobody is still recorded:
   * the attempt happened, and the administrator needs to see it failed.
   */
  async sendMessage(
    organizationId: string,
    input: SendMessageInput,
    ctx: CommunicationContext,
  ): Promise<Message> {
    const dataset = await this.repo.load(organizationId)
    const body = input.body.trim()
    if (body.length === 0) throw new CommunicationError("Write a message before sending.")
    if (input.recipients.length === 0) {
      throw new CommunicationError("Choose at least one recipient.")
    }
    if (input.channel !== "SMS" && !input.subject?.trim()) {
      throw new CommunicationError("Add a subject for an email message.")
    }

    const cost = estimateCost({
      channel: input.channel,
      body,
      recipients: input.recipients,
      costPerSms: dataset.account.costPerSms,
    })
    if (!canAfford(dataset.account.balance, cost.total)) {
      throw new CommunicationError(
        `This send costs ₦${cost.total.toLocaleString("en-NG")} and the SMS balance holds ₦${dataset.account.balance.toLocaleString("en-NG")}. Top up the balance first.`,
      )
    }

    const id = nextId("msg")
    const channels = channelsFor(input.channel)
    const recipients: MessageRecipient[] = input.recipients.map((recipient, index) => {
      // The channel this person is actually on. Someone with neither a phone number nor an address
      // is still attempted on the message's first channel so the failure is recorded against them.
      const reachedOn = channels.find((candidate) => reachableOn(recipient, candidate))
      const attempted = reachedOn ?? channels[0]
      const outcome = simulateDelivery(recipient, attempted)
      return {
        id: `${id}:r${index + 1}`,
        memberId: recipient.memberId,
        name: recipient.name,
        phone: recipient.phone,
        email: recipient.email,
        channel: attempted,
        status: outcome.status,
        failureReason: outcome.failureReason,
        // Only a text that was actually submitted is billed, which is what `estimateCost` charged
        // for. Someone unreachable costs nothing, and a carrier failure after submission still does.
        cost: reachedOn === "SMS" ? round2(cost.segments * dataset.account.costPerSms) : 0,
      }
    })

    const delivery = summariseDelivery(recipients)
    const message: Message = {
      id,
      organizationId,
      category: input.category,
      channel: input.channel,
      subject: input.subject?.trim() || undefined,
      body,
      recipients,
      recipientCount: recipients.length,
      deliveredCount: delivery.delivered,
      failedCount: delivery.failed,
      segments: cost.segments,
      cost: round2(recipients.reduce((sum, recipient) => sum + recipient.cost, 0)),
      status: delivery.status,
      createdAt: now(),
      sentAt: now(),
      sender: ctx.actor.name,
      context: input.context,
    }

    await this.mutate(organizationId, (current) => ({
      messages: [message, ...current.messages],
      account: {
        ...current.account,
        balance: round2(current.account.balance - message.cost),
        updatedAt: now(),
      },
    }))
    return message
  }

  /** Discards the message a send would have produced, without charging anything. */
  previewMessage(input: SendMessageInput, recipients: ResolvedRecipient[]) {
    const body = input.body.trim()
    return recipients.length > 0 ? personalise(body, recipients[0].name) : body
  }

  /**
   * Funds the SMS balance from the organization's own wallet.
   *
   * This is the existing wallet system doing the work — no second payment rail. The wallet is
   * debited first, exactly like a contribution debit, so the balance can never be topped up
   * without the money having moved.
   */
  async topUpBalance(
    organizationId: string,
    input: { amount: number; walletId: string },
    ctx: CommunicationContext,
  ): Promise<{ balance: number }> {
    const amount = round2(input.amount)
    if (!(amount > 0)) throw new CommunicationError("Enter an amount greater than zero.")

    const wallets = await walletServiceFor(organizationId).load()
    const wallet = wallets.wallets.find((row) => row.id === input.walletId)
    if (!wallet) throw new CommunicationError("Choose a wallet to top up from.")
    if (wallet.type === "Cash") throw new CommunicationError("Cash on hand cannot fund the SMS balance. Deposit it to the community wallet first.")
    if (wallet.organizationId !== organizationId) {
      throw new CommunicationError("That wallet belongs to another organization.")
    }

    if (this.repo.topUpBalance) {
      return this.repo.topUpBalance(organizationId, { amount, walletId: wallet.id })
    }

    const reference = `SMS-${Date.now().toString().slice(-5)}`
    await walletServiceFor(organizationId).spend(
      {
        walletId: wallet.id,
        amount,
        type: "Payment",
        kind: "Withdrawal",
        description: "SMS balance top-up",
        reference,
        counterparty: "Messaging provider",
      },
      ctx.actor,
      ctx.mode,
    )

    const dataset = await this.mutate(organizationId, (current) => ({
      account: {
        ...current.account,
        balance: round2(current.account.balance + amount),
        updatedAt: now(),
      },
      topUps: [
        {
          id: nextId("topup"),
          organizationId,
          amount,
          walletId: wallet.id,
          walletName: wallet.name,
          reference,
          createdBy: ctx.actor.name,
          createdAt: now(),
          simulated: isSimulated(ctx),
        },
        ...current.topUps,
      ],
    }))
    return { balance: dataset.account.balance }
  }
}

/** The headline figures the workspace shows above the tabs. */
export function summarizeMessages(messages: Message[]): MessageSummary {
  return {
    total: messages.length,
    sent: messages.filter((message) => message.status === "Sent" || message.status === "Partially sent").length,
    scheduled: messages.filter((message) => message.status === "Scheduled").length,
    failed: messages.filter((message) => message.status === "Failed").length,
    reach: messages.reduce((sum, message) => sum + message.recipientCount, 0),
    spend: round2(messages.reduce((sum, message) => sum + message.cost, 0)),
  }
}

/**
 * The UI depends on this service only. Switching to the real backend is a one-line change:
 * set `VITE_ENABLE_MOCKS=false` and `ApiCommunicationRepository` takes over.
 */
export const communicationsService = env.VITE_ENABLE_MOCKS
  ? new CommunicationService(createMockCommunicationRepository())
  : new CommunicationService(new ApiCommunicationRepository())
