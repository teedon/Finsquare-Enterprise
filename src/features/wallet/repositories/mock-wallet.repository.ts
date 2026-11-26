import { createTenantStore } from "@/lib/tenancy/tenant-store"
import { SEED_ORGANIZATION_ID } from "@/lib/tenancy/seed-tenant"
import { createWalletDataset } from "../mocks/wallet.mock"
import type { WalletDataset } from "../types/wallet.types"
import type { WalletRepository } from "./wallet.repository"

/**
 * A community that is not the seeded one has no wallets and no history. The shape comes from the
 * seeded dataset so it cannot drift from the type, and the account starts unverified and empty
 * because a new community has not connected a corporate account yet.
 */
const emptyDataset = (): WalletDataset => {
  const seeded = createWalletDataset()
  return {
    ...seeded,
    wallets: [],
    transactions: [],
    access: [],
    approvals: [],
    rules: [],
    audit: [],
    fundingMethods: [],
    receipts: [],
    account: {
      ...seeded.account,
      verificationStatus: "Unverified",
      status: "Pending",
      availableBalance: 0,
      ledgerBalance: 0,
    },
  }
}

/**
 * One dataset per community: the seeded community has the seeded wallets and every other community
 * starts with none, so a transfer in one community can never touch another's balances.
 *
 * The tenant is bound here rather than passed to every method the service exposes, because the
 * tenant is ambient — every wallet screen works inside the community the switcher has active. A
 * backend takes it from the authenticated session instead.
 */
export function createMockWalletRepository(
  organizationId: string = SEED_ORGANIZATION_ID,
): WalletRepository {
  const stores = createTenantStore<WalletDataset>({
    seed: () => createWalletDataset(),
    empty: emptyDataset,
  })
  const listeners = new Set<() => void>()
  return {
    async load() {
      await new Promise((r) => setTimeout(r, 120))
      return structuredClone(stores.of(organizationId))
    },
    async commit(next) {
      stores.set(organizationId, { ...stores.of(organizationId), ...next })
      listeners.forEach((l) => l())
    },
    async withdraw(input) {
      // Mock only records the intent; the backend performs the real transfer.
      const reference = `TRF-${Math.floor(10000 + Math.random() * 89999)}`
      const data = stores.of(organizationId)
      const wallets = data.wallets.map((w) =>
        w.id === input.walletId ? { ...w, availableBalance: w.availableBalance - input.amount } : w,
      )
      stores.set(organizationId, { ...data, wallets })
      listeners.forEach((l) => l())
      return { reference }
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
  }
}
