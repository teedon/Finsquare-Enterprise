# 015 — Cash on hand is a wallet, not a payment method

## Context

Members pay contributions, dues and loan instalments in cash at a branch. That money is real and must
be accounted for, but it is not in the bank. Two shortcuts were available and both were wrong:

- Record the cash payment as if it were a wallet/bank movement. The community's bank balance then
  overstates the money it actually holds.
- Keep a "cash" column somewhere beside the wallets. Cash then gets its own ledger, its own transfer
  path, and a second place for balances to disagree.

## Decision

**Cash is an ordinary `Wallet` with `type: "Cash"`**, one per community, named `Cash on hand` and
created on demand. It is held out of `WALLET_TYPES` (so it is never created by hand) and out of
`syncAccount` (so the account balance stays the bank's figure).

Taking cash is one commit, not a chain of independent writes:

1. credit the member's wallet with the amount received (`Cash Receipt`),
2. debit that wallet for each obligation settled (`Dues` / `Contribution` / `Loan Repayment`),
3. credit the cash wallet (`Cash Receipt`),
4. store a `CashReceipt` and three audit rows naming the administrator.

The member's wallet is the join: the money arrives there and leaves from there exactly like any other
credit, so nothing downstream needs to know cash was involved. That also gives overpayment an obvious
meaning — what is left over is the member's balance, not an adjustment to the obligation.

**Depositing cash to the bank** is a transfer between two wallets. It needs a bank reference, because
a deposit that cannot be matched to a statement is not reconcilable, and it needs no approval, because
it moves money the organization already has.

**Taking cash requires its own permission, `wallet.cash`**, on top of the payment permission. An
administrator who may record a payment is not automatically allowed to hold the community's cash.

## Consequences

- The wallet screen shows two figures that must both be true: what the bank holds and what the drawer
  holds. Neither is derived from the other.
- Every movement caused by a receipt is auditable in the same place as any other wallet movement, and
  the receipt carries `receivedById` / `receivedBy` so the counter can be traced to a person.
- The receipt is stored with its own `amount` / `settled` / `items`, so it does not change when the
  obligation is read back.
- A backend without a cash ledger cannot silently lose the payment: `member-payments.service.ts`
  records the payment, then reports `cashTracked: false` with the reason, and the UI says the payment
  was recorded but cash tracking is not connected.
- Cash is a frontend-representable state only; the backend remains the authority on both balances and
  must re-verify the receiving administrator's permission.

## Alternatives rejected

- **A cash payment method with no cash wallet.** Money appears in the member's wallet out of nowhere
  and the organization can never see what it is holding.
- **Cash as a bank wallet sub-balance.** It would be included in the bank balance the moment the
  total is computed, which is the error this exists to prevent.
- **A separate cash ledger module.** Duplicates wallets, and the reconciliation rules would drift.
