import type {
  CustomerWalletSettlement,
  DistributionResult,
  SettlementAllocation,
  SettlementCustomer,
  WalletSettlementPolicy,
} from "../types"

export interface WalletSettlementRepository {
  getPolicy(organizationId: string): Promise<WalletSettlementPolicy>
  getCustomers(organizationId: string, search?: string): Promise<SettlementCustomer[]>
  updatePolicy(organizationId: string, policy: WalletSettlementPolicy): Promise<void>
  getCustomer(organizationId: string, userId: string): Promise<CustomerWalletSettlement>
  settleCustomerLoans(
    organizationId: string,
    userId: string,
  ): Promise<{ settledInstallments: number; amountDebited: number }>
  distribute(organizationId: string, userId: string, allocations: SettlementAllocation[]): Promise<DistributionResult>
}
