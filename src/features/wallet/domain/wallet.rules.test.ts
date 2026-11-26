import { describe, expect, it } from "vitest"
import {
  checkOutflow,
  isMemberWallet,
  memberWalletFor,
  memberWallets,
  organizationWallets,
  visibleWallets,
  type Principal,
} from "./wallet.rules"
import type { Administrator, Permission, Role } from "@/types"
import type { Wallet, WalletAccess, WalletDataset, WalletTransaction } from "../types/wallet.types"

const organizationId = "org-test"

const limits = (overrides: Partial<Wallet["limits"]> = {}): Wallet["limits"] => ({
  singleTransaction: 500_000,
  dailyTransfer: 0,
  dailyDisbursement: 0,
  dailyFunding: 5_000_000,
  dailyWithdrawal: 500_000,
  ...overrides,
})

function wallet(overrides: Partial<Wallet> = {}): Wallet {
  return {
    id: "w-org",
    organizationId,
    accountId: "acct-1",
    name: "Main Organization Wallet",
    description: "",
    type: "Main Organization",
    scope: "organization",
    accountNumber: "9830015501",
    bankName: "9PSB",
    currency: "NGN",
    status: "active",
    availableBalance: 1_000_000,
    pendingBalance: 0,
    limits: limits({
      singleTransaction: 5_000_000,
      dailyTransfer: 10_000_000,
      dailyDisbursement: 10_000_000,
      dailyWithdrawal: 2_000_000,
    }),
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  }
}

const memberWallet = (id: string, memberId: string, memberName: string, availableBalance = 10_000) =>
  wallet({
    id,
    name: `${memberName} · member wallet`,
    type: "Member",
    scope: "member",
    memberId,
    memberName,
    accountNumber: `9830016${memberId.slice(-3)}`,
    availableBalance,
    limits: limits(),
  })

const orgWallet = wallet({ id: "w-main" })
const ADA_WALLET = memberWallet("w-member-LFC-1", "LFC-1", "Adewale Johnson", 12_500)

const ALL: WalletPermissionId[] = ["wallet.view", "wallet.view_balance", "wallet.view_transactions", "wallet.fund"]
type WalletPermissionId = WalletAccess["permissions"][number]

const financeRole = (permissions: Permission[]): Role => ({
  id: "role-finance",
  organizationId,
  name: "Finance",
  permissions,
  scope: "organization",
  isSystemRole: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
})

const roles: Role[] = [financeRole(ALL as Permission[])]

const administrator: Administrator = {
  id: "admin-ada",
  organizationId,
  userId: "user-ada",
  name: "Ada Obi",
  email: "ada@example.demo",
  roleIds: ["role-finance"],
  status: "active",
  accessScope: { type: "organization", organizationId, branchIds: [] },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
}

const principal: Principal = { administrator, roles }

const access: WalletAccess[] = [
  { id: "acc-1", walletId: "*", subjectType: "role", subjectId: "role-finance", subjectName: "Finance", permissions: ALL },
]

const dataset = (overrides: Partial<WalletDataset> = {}): WalletDataset => ({
  account: {
    id: "acct-1",
    organizationId,
    organizationName: "Lagos Farmers Cooperative",
    verificationStatus: "Verified",
    accountNumber: "9830015500",
    accountName: "FINSQ/LAGOS FARMERS COOPERATIVE",
    accountType: "Corporate collection account",
    currency: "NGN",
    status: "Active",
    availableBalance: 1_012_500,
    ledgerBalance: 1_012_500,
    provider: { id: "p-1", name: "9PSB" },
    bankName: "9PSB",
    createdAt: "2026-01-01T00:00:00.000Z",
    walletIds: [orgWallet.id, ADA_WALLET.id],
  },
  wallets: [orgWallet, ADA_WALLET],
  access,
  transactions: [],
  transfers: [],
  approvals: [],
  rules: [],
  audit: [],
  fundingMethods: [],
  receipts: [],
  ...overrides,
})

const contributionDebit = (overrides: Partial<WalletTransaction> = {}): WalletTransaction => ({
  id: "tx-1",
  reference: "WTX-1",
  date: new Date().toISOString(),
  description: "Ikeja Daily Ajo Savings — contribution",
  type: "Contribution",
  walletId: ADA_WALLET.id,
  walletName: ADA_WALLET.name,
  amount: 2_000,
  direction: "debit",
  status: "Completed",
  fee: 0,
  initiatedBy: "Adewale Johnson",
  sender: ADA_WALLET.name,
  recipient: "Ikeja Daily Ajo Savings",
  related: {},
  metadata: {},
  ...overrides,
})

describe("member wallets", () => {
  it("separates member wallets from the organization's own wallets", () => {
    const data = dataset()
    expect(memberWallets(data.wallets).map((w) => w.id)).toEqual([ADA_WALLET.id])
    expect(organizationWallets(data.wallets).map((w) => w.id)).toEqual([orgWallet.id])
    expect(isMemberWallet(orgWallet)).toBe(false)
    expect(isMemberWallet(ADA_WALLET)).toBe(true)
  })

  it("finds the wallet belonging to a member", () => {
    const data = dataset()
    expect(memberWalletFor(data.wallets, "LFC-1")?.id).toBe(ADA_WALLET.id)
    expect(memberWalletFor(data.wallets, "LFC-404")).toBeUndefined()
  })

  it("is visible to an administrator with an organization-wide grant", () => {
    expect(visibleWallets(dataset(), principal).map((w) => w.id)).toContain(ADA_WALLET.id)
  })

  it("stays hidden when the role has no wallet permission, even with a grant", () => {
    expect(visibleWallets(dataset(), { administrator, roles: [financeRole([])] })).toHaveLength(0)
  })
})

describe("spending from a member wallet", () => {
  it("allows a contribution within balance and limits", () => {
    const checks = checkOutflow({
      data: dataset(),
      source: ADA_WALLET,
      amount: 2_000,
      kind: "Contribution",
      allowed: true,
      mode: "live",
    })
    expect(checks.every((check) => check.ok)).toBe(true)
  })

  it("refuses more than the member holds", () => {
    const checks = checkOutflow({
      data: dataset(),
      source: ADA_WALLET,
      amount: 20_000,
      kind: "Contribution",
      allowed: true,
      mode: "live",
    })
    const balance = checks.find((check) => check.label === "Sufficient available balance")
    expect(balance?.ok).toBe(false)
    expect(balance?.detail).toContain("12,500")
  })

  it("counts contributions already made today against the daily limit", () => {
    const capped = wallet({ ...ADA_WALLET, limits: limits({ dailyWithdrawal: 12_500 }) })
    const data = dataset({
      wallets: [orgWallet, capped],
      transactions: [contributionDebit({ amount: 12_000 })],
    })
    const checks = checkOutflow({
      data,
      source: capped,
      amount: 1_000,
      kind: "Contribution",
      allowed: true,
      mode: "live",
    })
    const daily = checks.find((check) => check.label === "Within daily limit")
    expect(daily?.ok).toBe(false)
    expect(daily?.detail).toContain("12,000")
  })

  it("refuses movement when the environment blocks it", () => {
    const checks = checkOutflow({
      data: dataset(),
      source: ADA_WALLET,
      amount: 500,
      kind: "Contribution",
      allowed: true,
      mode: "blocked",
    })
    expect(checks.find((check) => check.label === "Environment allows money movement")?.ok).toBe(false)
  })

  it("still applies the transfer bucket to a transfer", () => {
    // A member wallet sets dailyTransfer to 0, so it can never be used as a treasury.
    const checks = checkOutflow({
      data: dataset(),
      source: ADA_WALLET,
      amount: 100,
      kind: "Transfer",
      allowed: true,
      mode: "live",
    })
    expect(checks.find((check) => check.label === "Within daily limit")?.ok).toBe(false)
  })
})
