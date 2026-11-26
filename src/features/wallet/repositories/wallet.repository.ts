import type { CashDepositInput, CashReceipt, CashReceiptInput } from "../types/cash.types"
import type { Actor, WalletDataset } from "../types/wallet.types"

export interface WithdrawInput {
  walletId: string
  amount: number
  accountNumber: string
  bankCode: string
  accountName: string
  narration: string
  pin: string
}

export interface WalletRepository {
  load(): Promise<WalletDataset>
  /** Replace named collections atomically; the backend equivalent is a transactional command. */
  commit(next: Partial<WalletDataset>): Promise<void>
  /** Authorize an external bank transfer out of the community wallet. */
  withdraw(input: WithdrawInput): Promise<{ reference: string }>
  /**
   * Receive cash at the counter as one command: credit the member's wallet, settle what they owe
   * from it, credit the cash drawer and write the audit trail.
   *
   * Optional because only an API-backed install can do all of that atomically. Without it the
   * service performs the same steps against `commit`, which is what the mock does.
   */
  receiveCash?(input: CashReceiptInput, actor: Actor, mode: "live" | "simulated" | "blocked"): Promise<CashReceipt>
  /** Bank cash that is already in the drawer. */
  depositCash?(input: CashDepositInput, actor: Actor, mode: "live" | "simulated" | "blocked"): Promise<{ reference: string }>
  subscribe(listener: () => void): () => void
}
