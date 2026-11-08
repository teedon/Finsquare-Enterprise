import { useCallback, useEffect, useState } from "react"
import { walletSettlementService } from "../services/wallet-settlement.service"
import type { WalletSettlementPolicy } from "../types"

/** Loads and persists the per-community customer-wallet settlement policy. */
export function useWalletSettlement(organizationId: string) {
  const [policy, setPolicy] = useState<WalletSettlementPolicy | null>(null)
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading")

  useEffect(() => {
    let active = true
    walletSettlementService
      .getPolicy(organizationId)
      .then((loaded) => {
        if (active) {
          setPolicy(loaded)
          setStatus("ready")
        }
      })
      .catch(() => {
        if (active) setStatus("error")
      })
    return () => {
      active = false
    }
  }, [organizationId])

  const update = useCallback(
    async (next: WalletSettlementPolicy) => {
      await walletSettlementService.updatePolicy(organizationId, next)
      setPolicy(next)
    },
    [organizationId],
  )

  return { policy, status, update }
}
