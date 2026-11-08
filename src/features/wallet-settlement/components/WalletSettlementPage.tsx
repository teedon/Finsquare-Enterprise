import { useEffect, useMemo, useState } from "react"
import { useOrganizationId } from "@/hooks/useOrganizationId"
import { useAuthorization } from "@/features/administrators/hooks/useAuthorization"
import { ErrorState, LoadingState } from "@/components/feedback/AsyncState"
import { Badge, Button, Field, SectionHeader, Toggle } from "@/components/ui"
import { Landmark } from "@/icons"
import { useWalletSettlement } from "../hooks/useWalletSettlement"
import { walletSettlementService } from "../services/wallet-settlement.service"
import type {
  CustomerWalletSettlement,
  SettlementAllocation,
  SettlementAllocationType,
  SettlementCustomer,
} from "../types"

const currency = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 2 })

type Line = { type: SettlementAllocationType; ref: string; label: string; amount: number; dueDate: string }

export default function WalletSettlementPage({ notify }: { notify: (message: string) => void }) {
  const organizationId = useOrganizationId()
  const { can } = useAuthorization()
  const { policy, status, update } = useWalletSettlement(organizationId)
  const canEdit = can("wallet.manage_settlement")
  const [customers, setCustomers] = useState<SettlementCustomer[]>([])
  const [customerSearch, setCustomerSearch] = useState("")
  const [customerId, setCustomerId] = useState("")
  const [customerData, setCustomerData] = useState<CustomerWalletSettlement | null>(null)
  const [customerStatus, setCustomerStatus] = useState<"loading" | "ready" | "error">("loading")
  const [customerReload, setCustomerReload] = useState(0)
  const [amounts, setAmounts] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [updatingPolicy, setUpdatingPolicy] = useState(false)

  useEffect(() => {
    let active = true
    const searchTimer = window.setTimeout(
      () =>
        walletSettlementService
          .getCustomers(organizationId, customerSearch)
          .then((items) => {
            if (active) setCustomers(items)
          })
          .catch(() => {
            if (active) notify("Customer wallets could not be loaded")
          }),
      250,
    )
    return () => {
      active = false
      window.clearTimeout(searchTimer)
    }
  }, [organizationId, customerSearch, notify])

  useEffect(() => {
    if (!customerId) {
      setCustomerData(null)
      setCustomerStatus("ready")
      return
    }
    let active = true
    setCustomerStatus("loading")
    setAmounts({})
    walletSettlementService
      .getCustomer(organizationId, customerId)
      .then((data) => {
        if (active) {
          setCustomerData(data)
          setCustomerStatus("ready")
        }
      })
      .catch(() => {
        if (active) setCustomerStatus("error")
      })
    return () => {
      active = false
    }
  }, [organizationId, customerId, customerReload])

  const lines = useMemo<Line[]>(() => {
    const obligations = customerData?.obligations
    if (!obligations) return []
    return [
      ...obligations.loans.flatMap((loan) =>
        loan.dueInstallments.map((item) => ({
          type: "LOAN" as const,
          ref: item.ref,
          label: `${loan.loanType} installment`,
          amount: item.amount,
          dueDate: item.dueDate,
        })),
      ),
      ...obligations.dues.map((item) => ({ type: "DUES" as const, ...item })),
      ...obligations.contributions.map((item) => ({ type: "CONTRIBUTION" as const, ...item })),
      ...obligations.esusu.map((item) => ({ type: "ESUSU" as const, ...item })),
    ]
  }, [customerData])

  const allocationTotal = lines.reduce((sum, line) => sum + (Number(amounts[`${line.type}:${line.ref}`]) || 0), 0)
  const wallet = customerData?.wallet
  const walletUnavailable = !wallet || !wallet.isActive || wallet.isFrozen

  if (status === "loading") return <LoadingState label="Loading settlement settings…" />
  if (status === "error" || !policy) {
    return (
      <ErrorState message="Wallet settlement settings could not be loaded." retry={() => window.location.reload()} />
    )
  }

  const saveDistribution = async () => {
    if (!customerId || !wallet || walletUnavailable) return
    const selected = lines.flatMap((line) => {
      const raw = amounts[`${line.type}:${line.ref}`]?.trim()
      if (!raw) return []
      const amount = Number(raw)
      if (!Number.isFinite(amount) || amount <= 0 || Math.abs(amount - line.amount) > 0.009) return []
      return [{ type: line.type, ref: line.ref, amount } satisfies SettlementAllocation]
    })
    if (!selected.length) {
      notify("Enter the full amount for at least one obligation")
      return
    }
    if (selected.length !== Object.values(amounts).filter((value) => value.trim()).length) {
      notify("Each selected obligation must be settled for its full amount")
      return
    }
    if (selected.reduce((sum, item) => sum + item.amount, 0) > wallet.balance) {
      notify("Allocation total exceeds the available wallet balance")
      return
    }
    setSaving(true)
    try {
      const result = await walletSettlementService.distribute(organizationId, customerId, selected)
      const refreshed = await walletSettlementService.getCustomer(organizationId, customerId)
      setCustomerData(refreshed)
      setAmounts({})
      notify(
        `${result.settledCount} obligation${result.settledCount === 1 ? "" : "s"} settled · ${currency.format(result.amountDebited)}`,
      )
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not distribute wallet funds")
    } finally {
      setSaving(false)
    }
  }

  const automatic = policy.autoSettleCustomerWallet

  return (
    <div className="page">
      <SectionHeader
        eyebrow="SETTINGS"
        title="Wallet settlement"
        description="Control automatic loan repayment and allocate customer wallet funds to outstanding obligations."
        actions={<Badge tone={automatic ? "blue" : "amber"}>{automatic ? "Automatic" : "Manual"}</Badge>}
      />

      <section className="panel settlement-panel">
        <div className="settlement-row">
          <div className="settlement-icon">
            <Landmark size={20} />
          </div>
          <div className="settlement-copy">
            <b>Auto-settle customer wallet funds</b>
            <span>
              When enabled, incoming funds are applied to due loan installments. When disabled, funds stay in the
              customer wallet until an administrator distributes them.
            </span>
          </div>
          {canEdit ? (
            <Toggle
              value={automatic}
              onChange={() => {
                setUpdatingPolicy(true)
                void update({ autoSettleCustomerWallet: !automatic })
                  .then(() => notify(automatic ? "Settlement set to manual" : "Settlement set to automatic"))
                  .catch(() => notify("Could not update settlement settings"))
                  .finally(() => setUpdatingPolicy(false))
              }}
            />
          ) : (
            <Badge>{updatingPolicy ? "Saving" : automatic ? "On" : "Off"}</Badge>
          )}
        </div>
        {!automatic && (
          <div className="settlement-note">
            Incoming funds remain in customer wallets. Automatic loan deductions are paused.
          </div>
        )}
      </section>

      {canEdit ? (
        <section className="panel settlement-distribution">
          <div className="panel-head">
            <div>
              <b>Distribute wallet funds</b>
              <span>Select a customer to review due obligations and allocate funds.</span>
            </div>
          </div>
          <div className="settlement-customer-picker">
            <Field
              label="Search customer"
              value={customerSearch}
              placeholder="Name or phone number"
              onChange={setCustomerSearch}
            />
            <label className="field">
              <span>Customer wallet</span>
              <select value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
                <option value="">Select a customer</option>
                {customers.map((customer) => (
                  <option value={customer.id} key={customer.id}>
                    {customer.name} · {customer.phone ?? "No phone"}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {customerId && customerStatus === "loading" && <LoadingState label="Loading customer obligations…" />}
          {customerId && customerStatus === "error" && (
            <ErrorState
              message="Customer wallet details could not be loaded."
              retry={() => setCustomerReload((value) => value + 1)}
            />
          )}
          {customerData && customerStatus === "ready" && (
            <>
              <div className="settlement-wallet-summary">
                <div>
                  <span>Customer</span>
                  <b>{customerData.customer.name}</b>
                  <small>{customerData.customer.phone ?? "No phone number"}</small>
                </div>
                <div>
                  <span>Available wallet balance</span>
                  <b>{wallet ? currency.format(wallet.balance) : "No wallet"}</b>
                </div>
                <div>
                  <span>Allocation total</span>
                  <b>{currency.format(allocationTotal)}</b>
                </div>
              </div>
              {walletUnavailable && (
                <div className="settlement-note">
                  {!wallet
                    ? "This customer does not have a wallet."
                    : wallet.isFrozen
                      ? "This wallet is frozen. Funds cannot be distributed."
                      : "This wallet is inactive. Funds cannot be distributed."}
                </div>
              )}
              {!walletUnavailable && lines.length === 0 && (
                <div className="empty-state">
                  <b>No outstanding obligations</b>
                  <span>This customer has no due installments or charges to settle.</span>
                </div>
              )}
              {lines.length > 0 && (
                <>
                  <div className="settlement-obligations">
                    {lines.map((line) => {
                      const key = `${line.type}:${line.ref}`
                      return (
                        <div className="settlement-obligation" key={key}>
                          <div>
                            <Badge>{line.type}</Badge>
                            <b>{line.label}</b>
                            <small>
                              Due {line.dueDate} · {currency.format(line.amount)}
                            </small>
                          </div>
                          <label className="field">
                            <span>Allocation amount</span>
                            <input
                              aria-label={`Allocation amount for ${line.label}`}
                              type="number"
                              min="0"
                              step="0.01"
                              placeholder="Enter amount"
                              value={amounts[key] ?? ""}
                              disabled={walletUnavailable || saving}
                              onChange={(event) => setAmounts((current) => ({ ...current, [key]: event.target.value }))}
                            />
                          </label>
                        </div>
                      )
                    })}
                  </div>
                  <div className="settlement-submit">
                    <span>Unallocated balance remains in the customer wallet.</span>
                    <Button
                      disabled={
                        !canEdit ||
                        walletUnavailable ||
                        saving ||
                        allocationTotal <= 0 ||
                        allocationTotal > (wallet?.balance ?? 0)
                      }
                      onClick={() => void saveDistribution()}
                    >
                      {saving ? "Distributing…" : "Distribute funds"}
                    </Button>
                  </div>
                </>
              )}
            </>
          )}
        </section>
      ) : (
        <section className="panel settlement-distribution">
          <div className="empty-state">
            <b>Settlement access required</b>
            <span>Your role does not have permission to review or distribute customer wallet funds.</span>
          </div>
        </section>
      )}
    </div>
  )
}
