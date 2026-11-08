/** Per-community customer-wallet settlement policy (Enterprise). */
export interface WalletSettlementPolicy {
  /** When true (default), incoming customer-wallet funds auto-settle due loans. */
  autoSettleCustomerWallet: boolean
}

export interface CustomerWalletSettlement {
  customer: { id: string; name: string; phone: string | null }
  wallet: { balance: number; isActive: boolean; isFrozen: boolean } | null
  obligations: {
    loans: Array<{
      loanId: string
      loanType: string
      outstandingBalance: number
      dueInstallments: Array<{
        ref: string
        scheduleItemId: string
        amount: number
        dueDate: string
      }>
    }>
    dues: Array<SettlementObligation>
    contributions: Array<SettlementObligation>
    esusu: Array<SettlementObligation>
  }
}

export interface SettlementCustomer {
  id: string
  name: string
  phone: string | null
  balance: number
  isActive: boolean
  isFrozen: boolean
}

export interface SettlementObligation {
  ref: string
  label: string
  amount: number
  dueDate: string
}

export type SettlementAllocationType = "LOAN" | "DUES" | "CONTRIBUTION" | "ESUSU"
export interface SettlementAllocation {
  type: SettlementAllocationType
  ref: string
  amount: number
}

export interface DistributionResult {
  settledCount: number
  amountDebited: number
  idempotentReplay?: boolean
}
