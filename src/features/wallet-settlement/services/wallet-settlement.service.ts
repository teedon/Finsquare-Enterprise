import { apiClient, endpoints } from "@/services/api"
import { env } from "@/app/config/env"
import type {
  CustomerWalletSettlement,
  DistributionResult,
  SettlementAllocation,
  SettlementCustomer,
  WalletSettlementPolicy,
} from "../types"
import type { WalletSettlementRepository } from "./wallet-settlement.repository"
import { membersMock } from "@/features/members/mocks/members.mock"
import { memberWalletsMock } from "@/features/wallet/mocks/wallet.mock"
import { SEED_ORGANIZATION_ID } from "@/lib/tenancy/seed-tenant"
import { createLoanDataset } from "@/features/loans/mocks/loans.mock"
import { buildDuesDataset } from "@/features/dues/mocks/dues.mock"
import { buildContributionDataset } from "@/features/contributions/mocks/contributions.mock"

class MockWalletSettlementRepository implements WalletSettlementRepository {
  private policies = new Map<string, WalletSettlementPolicy>()
  private balances = new Map(memberWalletsMock.map((wallet) => [wallet.memberId!, wallet.availableBalance]))
  private settledRefs = new Set<string>()
  private loanDataset = createLoanDataset()
  private duesDataset = buildDuesDataset()
  private contributionDataset = buildContributionDataset()

  async getPolicy(organizationId: string): Promise<WalletSettlementPolicy> {
    return { ...(this.policies.get(organizationId) ?? { autoSettleCustomerWallet: true }) }
  }

  async getCustomers(organizationId: string, search?: string): Promise<SettlementCustomer[]> {
    if (organizationId !== SEED_ORGANIZATION_ID) return []
    const query = search?.trim().toLowerCase() ?? ""
    return memberWalletsMock.flatMap((wallet) => {
      const member = membersMock.find((item) => item.id === wallet.memberId)
      if (!member || (query && !`${member.name} ${member.phone}`.toLowerCase().includes(query))) return []
      return [
        {
          id: member.id,
          name: member.name,
          phone: member.phone,
          balance: this.balances.get(member.id) ?? wallet.availableBalance,
          isActive: true,
          isFrozen: false,
        },
      ]
    })
  }

  async updatePolicy(organizationId: string, policy: WalletSettlementPolicy): Promise<void> {
    this.policies.set(organizationId, { ...policy })
  }

  async getCustomer(_organizationId: string, userId: string): Promise<CustomerWalletSettlement> {
    const member = membersMock.find((item) => item.id === userId)
    const wallet = memberWalletsMock.find((item) => item.memberId === userId)
    return {
      customer: { id: userId, name: member?.name ?? "Customer", phone: member?.phone ?? null },
      wallet: wallet
        ? { balance: this.balances.get(userId) ?? wallet.availableBalance, isActive: true, isFrozen: false }
        : null,
      obligations: {
        loans: this.loanDataset.loans
          .filter((loan) => loan.borrower.memberId === userId && loan.status === "Active")
          .map((loan) => ({
            loanId: loan.id,
            loanType: loan.productName,
            outstandingBalance: loan.outstanding,
            dueInstallments: loan.schedule
              .filter(
                (item) =>
                  item.dueDate <= new Date().toISOString().slice(0, 10) &&
                  item.paid < item.amount &&
                  !this.settledRefs.has(`LOAN:${loan.id}:${item.no}`),
              )
              .map((item) => ({
                ref: `${loan.id}:${item.no}`,
                scheduleItemId: `${loan.id}:${item.no}`,
                amount: item.amount - item.paid,
                dueDate: item.dueDate,
              })),
          })),
        dues: this.duesDataset.charges
          .filter(
            (charge) =>
              charge.memberId === userId &&
              charge.dueDate <= new Date().toISOString().slice(0, 10) &&
              charge.expectedAmount > charge.paidAmount &&
              !this.settledRefs.has(`DUES:${charge.id}`),
          )
          .map((charge) => ({
            ref: charge.id,
            label: this.duesDataset.plans.find((plan) => plan.id === charge.duesPlanId)?.name ?? "Dues",
            amount: charge.expectedAmount - charge.paidAmount,
            dueDate: charge.dueDate,
          })),
        contributions: this.contributionDataset.periods
          .filter(
            (period) =>
              this.contributionDataset.participants.find((participant) => participant.id === period.participantId)
                ?.memberId === userId &&
              period.dueDate <= new Date().toISOString().slice(0, 10) &&
              period.expectedAmount > period.paidAmount &&
              !this.settledRefs.has(`CONTRIBUTION:${period.id}`),
          )
          .map((period) => ({
            ref: period.id,
            label:
              this.contributionDataset.contributions.find((contribution) => contribution.id === period.contributionId)
                ?.name ?? "Contribution",
            amount: period.expectedAmount - period.paidAmount,
            dueDate: period.dueDate,
          })),
        esusu:
          userId === "LFC-002481" && !this.settledRefs.has("ESUSU:mock-esusu-cycle-1")
            ? [
                {
                  ref: "mock-esusu-cycle-1",
                  label: "Ikeja Cooperative Esusu · Cycle 1",
                  amount: 10_000,
                  dueDate: new Date().toISOString().slice(0, 10),
                },
              ]
            : [],
      },
    }
  }

  async settleCustomerLoans(
    organizationId: string,
    userId: string,
  ): Promise<{ settledInstallments: number; amountDebited: number }> {
    const customer = await this.getCustomer(organizationId, userId)
    const allocations = customer.obligations.loans.flatMap((loan) =>
      loan.dueInstallments.map((item) => ({ type: "LOAN" as const, ref: item.ref, amount: item.amount })),
    )
    if (!allocations.length) return { settledInstallments: 0, amountDebited: 0 }
    const result = await this.distribute(organizationId, userId, allocations)
    return { settledInstallments: result.settledCount, amountDebited: result.amountDebited }
  }

  async distribute(
    _organizationId: string,
    userId: string,
    allocations: SettlementAllocation[],
  ): Promise<DistributionResult> {
    const currentCustomer = await this.getCustomer(_organizationId, userId)
    const current = currentCustomer.wallet?.balance ?? 0
    if (!currentCustomer.wallet?.isActive || currentCustomer.wallet.isFrozen)
      throw new Error("Customer wallet is unavailable")
    const dueByKey = new Map<string, number>()
    currentCustomer.obligations.loans.forEach((loan) =>
      loan.dueInstallments.forEach((item) => dueByKey.set(`LOAN:${item.ref}`, item.amount)),
    )
    ;(["dues", "contributions", "esusu"] as const).forEach((kind) =>
      currentCustomer.obligations[kind].forEach((item) =>
        dueByKey.set(
          `${kind === "dues" ? "DUES" : kind === "contributions" ? "CONTRIBUTION" : "ESUSU"}:${item.ref}`,
          item.amount,
        ),
      ),
    )
    const keys = allocations.map((item) => `${item.type}:${item.ref}`)
    if (!allocations.length || new Set(keys).size !== keys.length)
      throw new Error("Select distinct obligations to settle")
    allocations.forEach((item) => {
      if (dueByKey.get(`${item.type}:${item.ref}`) !== item.amount)
        throw new Error("Each selected obligation must be settled for its full amount")
    })
    const total = allocations.reduce((sum, item) => sum + item.amount, 0)
    if (total > current) throw new Error("Allocation total exceeds the available wallet balance")
    allocations.forEach((allocation) => this.settledRefs.add(`${allocation.type}:${allocation.ref}`))
    this.balances.set(userId, current - total)
    return { settledCount: allocations.length, amountDebited: total }
  }
}

class ApiWalletSettlementRepository implements WalletSettlementRepository {
  async getPolicy(): Promise<WalletSettlementPolicy> {
    return apiClient.get<WalletSettlementPolicy>(endpoints.walletSettlement.policy)
  }

  async getCustomers(_organizationId: string, search?: string): Promise<SettlementCustomer[]> {
    const query = search ? `?search=${encodeURIComponent(search)}` : ""
    return apiClient.get<SettlementCustomer[]>(`${endpoints.walletSettlement.customers}${query}`)
  }

  async updatePolicy(_organizationId: string, policy: WalletSettlementPolicy): Promise<void> {
    await apiClient.patch(endpoints.walletSettlement.policy, policy)
  }

  async getCustomer(_organizationId: string, userId: string): Promise<CustomerWalletSettlement> {
    return apiClient.get<CustomerWalletSettlement>(endpoints.walletSettlement.customer(userId))
  }

  async settleCustomerLoans(
    _organizationId: string,
    userId: string,
  ): Promise<{ settledInstallments: number; amountDebited: number }> {
    return apiClient.post<{ settledInstallments: number; amountDebited: number }>(
      endpoints.walletSettlement.settleLoans(userId),
    )
  }

  async distribute(
    _organizationId: string,
    userId: string,
    allocations: SettlementAllocation[],
  ): Promise<DistributionResult> {
    return apiClient.post<DistributionResult>(endpoints.walletSettlement.distribute(userId), { allocations })
  }
}

export const walletSettlementService: WalletSettlementRepository = env.VITE_ENABLE_MOCKS
  ? new MockWalletSettlementRepository()
  : new ApiWalletSettlementRepository()
