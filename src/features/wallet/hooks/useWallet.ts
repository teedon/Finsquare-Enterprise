import { useCallback, useEffect, useMemo, useState } from "react"
import { useAuthorization } from "@/features/administrators/hooks/useAuthorization"
import { useWorkspace } from "@/app/providers/WorkspaceProvider"
import { moneyMovementMode } from "@/lib/permissions/capabilities"
import { env } from "@/app/config/env"
import { canOnWallet, visibleWallets, walletsWith, type Principal } from "../domain/wallet.rules"
import { walletServiceFor } from "../services/wallet.service"
import type { Actor, Wallet, WalletDataset, WalletPermission } from "../types/wallet.types"

export function useWallet() {
  const [loaded, setLoaded] = useState<{ organizationId: string; data: WalletDataset } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const { administrator, can, roles } = useAuthorization()
  const { state } = useWorkspace()
  const organizationId = state.activeCommunityId
  // The service is resolved per community, so its dataset is this community's wallets.
  const walletService = walletServiceFor(organizationId)

  useEffect(() => walletService.subscribe(() => setVersion((v) => v + 1)), [walletService])
  useEffect(() => {
    let active = true
    walletService
      .load()
      .then((d) => active && (setLoaded({ organizationId, data: d }), setError(null)))
      .catch(() => active && setError("Wallet data could not be loaded."))
    return () => {
      active = false
    }
  }, [walletService, organizationId, version])

  // The loaded dataset remembers which community it belongs to, so `loading` is derived rather than
  // set: switching community can never show the previous community's balances under the new name.
  const data = loaded && loaded.organizationId === organizationId ? loaded.data : null

  const principal = useMemo<Principal>(() => ({ administrator, roles }), [administrator, roles])
  const actor = useMemo<Actor>(() => ({ id: administrator.id, name: administrator.name }), [administrator])
  const mode = moneyMovementMode(state.environment)
  const retry = useCallback(() => setVersion((v) => v + 1), [])
  // The MFI wallet endpoint is already scoped to the authenticated community and does not yet
  // return Enterprise wallet-access grants. Treat its returned wallets as read-only visible data;
  // keep every money-movement permission behind the normal role and wallet grant checks.
  const apiReadOnlyWallets = !env.VITE_ENABLE_MOCKS && data?.access.length === 0 ? data.wallets : null
  const canOn = (wallet: Wallet, permission: WalletPermission) => {
    if (
      apiReadOnlyWallets?.some((returnedWallet) => returnedWallet.id === wallet.id) &&
      (permission === "wallet.view" ||
        permission === "wallet.view_balance" ||
        permission === "wallet.view_transactions")
    )
      return true
    return data ? canOnWallet(data, principal, wallet, permission) : false
  }

  return {
    data,
    error,
    retry,
    service: walletService,
    actor,
    can,
    mode,
    environment: state.environment,
    principal,
    organizationId,
    wallets: apiReadOnlyWallets ?? (data ? visibleWallets(data, principal) : ([] as Wallet[])),
    walletsWith: (p: WalletPermission) => (data ? walletsWith(data, principal, p) : ([] as Wallet[])),
    canOn,
  }
}
