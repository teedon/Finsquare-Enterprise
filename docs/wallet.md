# Wallet

Code: `src/features/wallet/`. Pattern: components → `hooks` → `services/wallet.service.ts` → `repositories` → `mocks/wallet.mock.ts`.

## Model
- One **main organization wallet** is the source of all payments. Account number and bank are shown on the Overview hero card. Mock bank is **9PSB** (`constants/banks.ts`, `HOME_BANK`).
- **Branch wallets** (Lagos, Ikeja, Epe in the mock) are secondary, viewed from Wallet → Branch wallets (`wallets` view).
- **Member wallets** hold one member's own money — `scope: "member"` with `memberId`/`memberName`. They are ordinary wallets (same ledger, limits and access model), not a second wallet system. A member wallet receives funding and pays what the member owes (contributions, repayments); its transfer and disbursement limits are `0` so it can never act as a treasury. **They are reached from the member, not from Wallet**: open Members → a member → **Wallet**. There is deliberately no member-wallet index page, so a member's balance has exactly one home.
- Loan disbursements are initiated from **Loans**, not Wallet.
- Contributions move money through these wallets: a wallet-method payment **debits** the contributor's member wallet, and a completed payout **credits** the recipient's wallet (`contributions.service.ts` calls `walletService.spend` / `credit`).

## Views
`wallet` (Overview: balance, Fund wallet, Transfer, recent transactions, links), `wallets` (branch wallets), `wallet-transactions` (search, filters, CSV/PDF export, detail drawer with audit and reverse), `wallet-access` (Access, Limits, Approval rules, Audit trail).

## Member wallets
`walletService.ensureMemberWallet({ memberId, memberName }, actor)` opens one on demand and returns the existing wallet if there is one, so any module can call it before moving a member's money. A Personal contribution opens one for every member on its roster when the plan is created. `isMemberWallet`, `memberWallets`, `organizationWallets` and `memberWalletFor` in `domain/wallet.rules.ts` are how the rest of the app tells them apart; the branch-wallet list and the contribution recipient picker both exclude them.

`MemberWalletPanel` (exported from the wallet barrel) renders one member's balance, statement and actions. The member profile renders it inside `WalletPage bare` so the wallet tab and the wallet module share one implementation rather than two.

Funding, spending and crediting all run the same `checkOutflow` guards. `spend` draws on a named limit bucket — `Contribution`, `Withdrawal`, `Transfer` or `Disbursement` — so a contribution debit is checked against `dailyWithdrawal` and counted as a `Contribution` movement.

### Dues
`features/dues` (see `dues.md`) collects fixed recurring dues through the same wallets. A dues debit
is a `type: "Dues"` transaction carrying `related.duesId`, and it draws on the member wallet's
**withdrawal** limit. When a charge is unpaid past its plan's grace period the plan raises a **lien**
— a claim on the member's own wallet, never a second ledger — and the wallet does not need to know:
it announces credited wallets through `walletService.onWalletsCredited`, and the dues service
collects what it is owed. `TransactionType` includes `"Dues"` for exactly this reason.

## Cash on hand
Money a member pays at the counter is real money that never touches the bank, so it cannot enter the
bank balance and cannot be settled by a wallet debit that pretends it arrived digitally.

Cash is an ordinary `Wallet` with `type: "Cash"` (`CASH_WALLET_NAME = "Cash on hand"`), created on
demand by `walletService.ensureCashWallet`. It is deliberately **excluded from `WALLET_TYPES`** so it
never appears in the create-wallet form, and `syncAccount` leaves it out of the community's bank
balance — the account figure is money the bank holds, the cash figure is money in the drawer.

`CashService` (`services/cash.service.ts`) owns the two operations:

- **`receive`** — one commit that credits the member's wallet with what they handed over
  (`Cash Receipt`), debits that wallet for each obligation settled (`Dues`, `Contribution`,
  `Loan Repayment`), credits the cash wallet, writes the `CashReceipt` record and three audit rows.
  Overpaying the amount applied is normal change: the full amount is received, only the obligations
  are settled, and the difference stays in the member's wallet.
- **`depositToBank`** — moves cash into a community bank wallet as `Cash Deposit` transactions. It
  changes where the money is, never how much exists, and it requires a bank reference so the deposit
  can be matched on a statement. Banking cash needs no second approver.

The receipt is a historical record: `amount`, `settled`, `items` and `receivedBy` are stored, not
recomputed, so reading an obligation back later cannot rewrite what was taken.

`domain/cash.rules.ts` holds the pure parts (`changeOf`, `settledOf`, `isCashWallet`, `cashWalletOf`,
`receivedOn`) and is unit-tested there.

Recording cash is a money action *and* a permission: `wallet.cash`. `RecordMemberPayment` only offers
the Cash method when the administrator holds it, which keeps the payment permission separate from the
right to hold the organization's cash.

## Transfers
`TransferModal` — account number (10 digits), bank, amount, narration, 4-digit PIN. Internal accounts resolve to a wallet and move instantly; external transfers create a Processing (or Completed in simulation) debit. Validation by zod `transferOutSchema`; limits and status checks in `service.checkOutflow`. There is no stored PIN to compare against in the mock, so any 4 digits are accepted and **the backend must verify the PIN and rate-limit attempts** in production.

## Environment gating
`moneyMovementMode(environment)` → `live | simulated | blocked`. Demo is simulated and shows `ModeBanner` on wallet pages.

## Reports
Wallet reports (statement, transactions, funding, branch comparison) are embedded in the central Reports page (`WalletReports`, `export.ts` has `printTable` for PDF through the browser print dialog).
