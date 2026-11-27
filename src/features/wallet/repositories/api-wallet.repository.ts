import { apiClient, endpoints } from "@/services/api"
import { ApiError } from "@/services/api/types"
import type { CashDepositInput, CashReceipt, CashReceiptInput } from "../types/cash.types"
import type { WalletDataset } from "../types/wallet.types"
import type { WalletRepository, WithdrawInput } from "./wallet.repository"

function notAvailable(feature: string): never {
  throw new ApiError(`${feature} is not available on the MFI backend yet.`, "not_found")
}

/** What the backend is expected to answer for one cash receipt. */
interface CashReceiptResponse {
  receiptId: string
  reference: string
  receivedAt?: string
  cashWalletId?: string
  cashTransactionId?: string
  memberTransactionIds?: string[]
}

/**
 * API-backed wallet repository, wired to the MFI community wallet.
 *
 * The MFI backend has a single community wallet (balance + transaction ledger), whereas the
 * Enterprise model has multiple wallets, approvals, access controls and simulated balances. The
 * read side is mapped onto the real wallet; external transfers map onto `POST /wallet/withdraw`;
 * mutations the backend does not expose yet throw a user-safe error.
 *
 * A cash receipt is one command on the backend (`POST /enterprise/wallet/cash/receipts`), so the
 * whole "credit the member, settle from their wallet, credit the drawer, write the audit" rule runs
 * server-side in one transaction. Until those endpoints exist the service says so instead of writing
 * half a receipt locally.
 */
export class ApiWalletRepository implements WalletRepository {
  async load(): Promise<WalletDataset> {
    const workspace = await apiClient.get<WalletDataset>(endpoints.wallet.workspace)
    // A backend that does not track cash yet has no drawer and no receipts; asking must not break
    // the wallet page.
    const receipts = await apiClient.get<CashReceipt[]>(endpoints.wallet.cashReceipts).catch(() => [])
    return { ...workspace, receipts: Array.isArray(receipts) ? receipts : [] }
  }

  async commit(): Promise<void> {
    return notAvailable("Wallet mutations")
  }

  async withdraw(input: WithdrawInput): Promise<{ reference: string }> {
    const response = await apiClient.post<{ reference?: string }>(endpoints.wallet.withdraw, {
      amount: input.amount,
      destinationAccountNumber: input.accountNumber,
      destinationBankCode: input.bankCode,
      destinationAccountName: input.accountName,
      narration: input.narration,
      transactionPin: input.pin,
    })
    return { reference: response.reference ?? "" }
  }

  async receiveCash(input: CashReceiptInput): Promise<CashReceipt> {
    try {
      const response = await apiClient.post<CashReceiptResponse>(endpoints.wallet.cashReceipts, {
        memberId: input.memberId,
        memberName: input.memberName,
        amount: input.amount,
        note: input.note,
        items: input.items,
      })
      return {
        id: response.receiptId,
        organizationId: "",
        reference: response.reference,
        at: response.receivedAt ?? new Date().toISOString(),
        memberId: input.memberId,
        memberName: input.memberName,
        amount: input.amount,
        settled: input.items.reduce((total, item) => total + item.amount, 0),
        items: input.items,
        receivedById: "",
        receivedBy: "",
        note: input.note,
        cashWalletId: response.cashWalletId ?? "",
        cashTransactionId: response.cashTransactionId ?? "",
        memberTransactionIds: response.memberTransactionIds ?? [],
      }
    } catch (error) {
      if (error instanceof ApiError && error.code === "not_found") return notAvailable("Receiving cash")
      throw error
    }
  }

  async depositCash(input: CashDepositInput): Promise<{ reference: string }> {
    try {
      const response = await apiClient.post<{ reference?: string }>(endpoints.wallet.cashDeposits, {
        amount: input.amount,
        bankReference: input.bankReference,
        note: input.note,
      })
      return { reference: response.reference ?? "" }
    } catch (error) {
      if (error instanceof ApiError && error.code === "not_found") return notAvailable("Depositing cash")
      throw error
    }
  }

  subscribe(): () => void {
    // A real implementation would subscribe to a websocket or poll for invalidation.
    return () => {}
  }
}
