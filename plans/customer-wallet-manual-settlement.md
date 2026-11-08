# Customer Wallet Manual Settlement

**Status:** Implemented (2026-11-08)

**Decision record:**
- Settlement mode is a **per-community** toggle.
- Distribution is **purely an admin decision** (no customer-declared split).
- The allocation form is **completely blank** (no suggested amounts).

## Goal

Let each MFI choose how incoming customer-wallet funds are applied:

- **Auto mode (default):** funds auto-settle due/overdue loan installments.
- **Manual mode:** funds stay in the customer wallet; a Super Admin / Co-admin
  (custom role) reviews the balance and distributes it across dues, loans,
  contributions and esusu (e.g. ₦50k → ₦10k dues, ₦15k loan, ₦15k contribution,
  ₦10k esusu).

## Current state

- Customer wallets: `mfi_customer_wallets`, funded via VA top-up webhook.
- Only auto-settlement today is **loan repayment**:
  - Webhook: `community-wallet-webhook.controller.ts` → `settleDueLoanRepaymentsFromCustomerWallet`
  - Cron: `mfi-customer-wallet-repayment.scheduler.ts` (6-hourly, production only)
- `MfiCustomerWalletTxnSource` has no dues/contribution/esusu debit sources.
- Custom roles already exist (`mfi_custom_roles` + `mfi.service.ts` role CRUD).

## Design decisions

1. Toggle is a typed column on `Community` (not JSON): `autoSettleCustomerWallet Boolean @default(true)`.
2. New permission `wallet.manage_settlement`, enforced server-side via a new
   `MfiPermission.WALLET_SETTLEMENT` and `MfiPermissionGuard`.
3. Manual settlement is a named command; backend owns validation + money movement.
4. Each obligation is posted using its owning domain records inside one shared Prisma transaction. The existing domain APIs do not accept a shared transaction client; writes therefore happen in the MFI settlement command so debit, obligation state, and organization ledger commit or roll back together.
5. Distribution is atomic and idempotent: `sum(allocations) <= balance`, guarded debit.

## Data model changes

```prisma
// Community
autoSettleCustomerWallet Boolean @default(true)

// MfiCustomerWalletTxnSource — new values (Phase 2)
DUES_PAYMENT
CONTRIBUTION_PAYMENT
ESUSU_CONTRIBUTION

// MfiPermission — new value
WALLET_SETTLEMENT = 'WALLET_SETTLEMENT'
```

## Backend — Phase 1 (toggle + manual loan settle)

1. Add `autoSettleCustomerWallet` column + migration.
2. Gate both auto-settle call sites on the setting (webhook + cron sweep).
3. Enterprise endpoints guarded by `WALLET_SETTLEMENT`:
   - `GET  /api/v1/mfi/enterprise/wallet-settlement`
   - `PATCH /api/v1/mfi/enterprise/wallet-settlement`  `{ autoSettleCustomerWallet: boolean }`
   - `GET  /api/v1/mfi/enterprise/wallet-settlement/customers/:userId`
   - `POST /api/v1/mfi/enterprise/wallet-settlement/customers/:userId/loans` (manual settle)

## Backend — Phase 2 (multi-way distribution)

4. Extend obligations summary to return loan installments, dues charges,
   contribution plans and esusu cycles.
5. `POST /api/v1/mfi/enterprise/wallet-settlement/customers/:userId/distribute`:

```jsonc
{
  "allocations": [
    { "type": "LOAN",         "ref": "<id>", "amount": 15000 },
    { "type": "DUES",         "ref": "<id>", "amount": 10000 },
    { "type": "CONTRIBUTION", "ref": "<id>", "amount": 15000 },
    { "type": "ESUSU",        "ref": "<id>", "amount": 10000 }
  ]
}
```

6. Transactional execution: validate total ≤ balance → settle each leg through
   the owning service → write `mfi_customer_wallet_transactions` debit with the
   matching `MfiCustomerWalletTxnSource`.
7. Map `wallet.manage_settlement → MfiPermission.WALLET_SETTLEMENT` in
   `backendPermissionsForEnterpriseRole`.

## Frontend

1. Add `wallet.manage_settlement` to `permission-catalog.ts` and `ALL_PERMISSIONS`
   in `system-roles.ts` (Super Admin inherits it).
2. New Settings tab "Wallet settlement" in `navigation.ts` + route in `routes.ts`.
3. Toggle UI that PATCHes the setting (persisted server-side, unlike module toggles).
4. Distribution screen: pick customer → show balance + outstanding obligations →
   blank amount inputs → validate ≤ balance → submit. Gate with `can("wallet.manage_settlement")`.
5. `wallet-settlement` service/repository pair (mock + API) behind `VITE_ENABLE_MOCKS`.

## Edge cases

- Unallocated balance stays in the customer wallet.
- Over-allocation rejected (422).
- Partial coverage settles fully-covered legs only.
- Loan legs preserve the platform-fee math.
- Idempotency via unique reference + guarded debit.
- Record `settledBy` admin id + timestamp.
- Respect owning-service rules (plan targeting, esusu cycle windows, dues charges).
- Skip frozen/inactive wallets and surface the reason.

## Testing

- Unit: allocation math; permission mapping.
- Integration: toggle off → top-up → no auto-settle; manual `distribute` → correct
  ledger + obligation state.
- E2E: settings toggle persists; distribution screen updates balances.

## Rollout

1. Phase 1: toggle + manual loan settle (low risk).
2. Phase 2: dues/contrib/esusu distribution.


## Implementation status

### Complete

- Added the per-community `autoSettleCustomerWallet` column and migration. Automatic loan deductions now respect it at the shared settlement entry point used by wallet funding and the scheduled sweep; manual loan settlement explicitly bypasses the policy and records the administrator and settlement time.
- Added guarded policy, customer search/detail, manual loan settlement, and multi-obligation distribution endpoints. The new permission is mapped from `wallet.manage_settlement` to `WALLET_SETTLEMENT`; every endpoint checks it server-side.
- Customer detail includes due loan installments, current dues charges, due contribution periods, and active Esusu cycle contributions. Distribution accepts full obligation legs only, validates currency precision and available balance, rejects frozen/inactive wallets, and leaves unallocated funds untouched.
- Distribution uses one Prisma transaction for guarded wallet debit, customer-wallet ledger entries, obligation settlement, and organization wallet/fund ledger credits. Per-leg unique references make retries idempotent. Esusu cycle completion is notified after commit.
- Added the Enterprise Settings page, role permission, route/navigation, API/mock repositories, customer search, blank allocation fields, balance validation, and permission-gated controls.
- Added focused backend unit coverage for allocation rules and permission mapping.

### Verification

- `npm run build` in `finsquare-backend` — passed.
- `npm run typecheck` in `Finsquare-Enterprise` — passed.
- `npm test -- --runInBand --watchman=false modules/mfi/customer-wallet-settlement.spec.ts` — passed (4 tests). The initial run without `--watchman=false` could not access the local Watchman socket; rerunning with Watchman disabled passed.
- Database-backed integration and browser E2E flows were not run in this workspace. Apply both new migrations before exercising the live endpoints.

### Rollout

Deploy the backend and Enterprise UI together, apply the migrations in timestamp order, then verify policy read/update and one distribution against a staging community with funded customer and organization wallets. New communities default to automatic loan settlement; existing communities receive the same default through the migration.
