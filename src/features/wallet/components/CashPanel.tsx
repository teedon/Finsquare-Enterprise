import { useState } from "react"
import { Button } from "@/components/ui"
import { Panel, money } from "@/features/loans/components/LoanUi"
import { cashWalletOf, receivedOn } from "../domain/cash.rules"
import { fmtDate, type WalletCtx } from "./WalletShell"
import CashDepositModal from "./CashDepositModal"

/**
 * Money taken at the counter, kept apart from the bank balance.
 *
 * Cash is only bank money once it is deposited, so the wallet page shows the drawer as its own
 * balance with what was taken today and the last few receipts — plus the one action that moves it
 * into the bank.
 */
export default function CashPanel({ ctx }: { ctx: WalletCtx }) {
  const { data, navigate } = ctx
  const [depositing, setDepositing] = useState(false)
  const cash = cashWalletOf(data.wallets)
  const receipts = data.receipts
  const today = receivedOn(receipts)
  const canDeposit = ctx.can("wallet.cash")

  if (!cash) {
    return (
      <Panel title="Cash on hand">
        <p className="contribution-hint" style={{ margin: 0, padding: 16 }}>
          Cash taken at the counter is held here. This community has no cash wallet yet — it opens the first time an
          administrator records cash.
        </p>
      </Panel>
    )
  }

  return (
    <>
      <Panel
        title="Cash on hand"
        subtitle="Received at the counter · not part of the bank balance"
        actions={
          canDeposit && cash.availableBalance > 0 ? (
            <Button variant="secondary" onClick={() => setDepositing(true)}>
              Deposit to bank
            </Button>
          ) : undefined
        }
      >
        <div style={{ padding: 16, display: "grid", gap: 14 }}>
          <div className="money-facts" style={{ margin: 0 }}>
            <div>
              <span>Cash on hand</span>
              <b>{money(cash.availableBalance)}</b>
            </div>
            <div>
              <span>Taken today</span>
              <b>{money(today)}</b>
            </div>
            <div>
              <span>Receipts</span>
              <b>{receipts.length}</b>
            </div>
          </div>

          {receipts.length === 0 ? (
            <p className="contribution-hint" style={{ margin: 0 }}>
              No cash has been received yet. Take a member payment and choose <b>Cash</b> to start the drawer.
            </p>
          ) : (
            <ul className="person-list">
              {receipts.slice(0, 3).map((receipt) => (
                <li key={receipt.id}>
                  <div className="person-line">
                    <span className="person-name">
                      {receipt.memberName}
                      <small style={{ display: "block", color: "var(--muted)", fontWeight: 400 }}>
                        {receipt.reference} · {receipt.settled === receipt.amount ? "settled in full" : `${money(receipt.amount - receipt.settled)} kept as change`}
                      </small>
                    </span>
                    <span className="person-metric">{money(receipt.amount)}</span>
                    <span style={{ color: "var(--muted)", fontSize: 12 }}>{fmtDate(receipt.at)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div>
            <Button variant="ghost" onClick={() => navigate("wallet-activity")}>
              View activity &amp; audit trail
            </Button>
          </div>
        </div>
      </Panel>

      {depositing && cash && (
        <CashDepositModal
          ctx={ctx}
          cashBalance={cash.availableBalance}
          onClose={() => setDepositing(false)}
          onDone={(reference) => {
            setDepositing(false)
            ctx.notify(`Cash deposited — reference ${reference}`)
            ctx.retry()
          }}
        />
      )}
    </>
  )
}
