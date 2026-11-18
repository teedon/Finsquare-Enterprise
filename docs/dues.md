# Dues

Dues are the fixed, recurring obligations a member owes the organization — monthly association
dues, a weekly security levy, an annual renewal. A dues plan never holds money and never pays out:
it states **what each member owes and when**, and every expected payment is settled through the
member's wallet, cash or a bank transfer.

Code lives in `src/features/dues/`.

## Model

```text
DuesPlan (the plan)
├── amount            a fixed amount per scheduled payment — never flexible, never a target
├── frequency         One-time | Daily | Weekly | Monthly | Quarterly | Yearly | Custom
├── startDate/endDate endDate omitted = runs until it is paused or closed
├── scope             All | Selected | Group | Branch   (resolved to a roster at creation)
└── lien              { enabled, graceDays, autoRecover } — how unpaid dues are collected

DuesParticipant   one row per person on the plan — identity and roster facts only
DuesCharge        one expected payment: a participant, a period, a due date, an amount
DuesTransaction   one money movement: Payment | Wallet recovery | Adjustment | Reversal
```

Types are in `types/dues.types.ts`. The typology is deliberately narrow: **there is no flexible and
no target dues**, because the brief asks for one thing — a fixed amount per scheduled payment.

### Money is derived, never stored twice

A `DuesParticipant` carries **no money fields**. Every figure the UI shows — paid, outstanding,
overdue, paid-up/behind, the plan's collection position, the module dashboard — is computed from the
charge ledger by `domain/dues.rules.ts`. This is deliberate: the contribution ledger stores
`missedCount` on its participants and the docs already record that it can go stale after a payment.
A dues participant's row is only ever asked for its charges, so it cannot disagree with them.

### Two states, one status

| Field | Values | Meaning |
| --- | --- | --- |
| `state` | `Pending` · `Partially Paid` · `Paid` · `Overdue` | how much of the charge is paid, judged against its due date |
| `lienState` | `None` · `Pending` · `Partially recovered` · `Recovered` · `Cancelled` | whether the member's wallet carries a claim for it |
| *derived* `chargeStatus()` | `Awaiting wallet recovery` · `Overdue` · `Partially paid` · `Paid` · `Pending` | the one thing an administrator reads |

`Awaiting wallet recovery` wins over `Overdue`: a charge the wallet owes is a different job from one
that is merely late.

**Outstanding means payable now.** A charge whose due date is still ahead is `Pending` and counts as
`scheduled`, not as outstanding, so a plan's "expected in total" figure can never be mistaken for
money owed today. This is the same rule the member profile applies to contribution periods.

### The schedule

`domain/schedule.ts` generates the charge ledger: daily, weekly, monthly, quarterly, yearly and
custom (`every n days`), plus `One-time`. A plan without an end date generates a rolling
12-month horizon — the backend generates each period on its own schedule instead.

`addMonths` here **clamps to the last day of the target month**. `Date.setMonth` overflows, which is
why a contribution plan starting on the 29th–31st currently skips a month and repeats the next one
(a known defect noted in `docs/README.md`); dues does not repeat it, and a test pins that.

## Money: the wallet lien

A lien is **the organization's claim on the member's own wallet**, not a second ledger. Money is only
ever deducted when it is actually there, so a lien can be raised and stay uncollected — that is a
normal state, not a failure.

| Rule | Effect |
| --- | --- |
| `lien.enabled` | a charge unpaid past its grace period carries a claim; with it off, dues are tracked only |
| `lien.graceDays` | days after the due date before a claim applies |
| `lien.autoRecover` | collect automatically when funds arrive, or only when an administrator asks |
| plan `status` | paused/closed plans take on no **new** claims; a claim already applied stays |

Recovery (`duesService.runLienRecovery`) walks a member's claims **oldest due first**, capped at each
charge's outstanding amount and at the wallet's available balance:

- **never more than is owed** — the allocation is `min(outstanding, remaining balance)` per charge;
- **never twice** — a run reads the charges' current `paidAmount`, and recovery is refused while a run
  for the same scope is still in flight (`recovering`), so an automatic pass and an administrator's
  "Recover now" cannot overlap;
- **partial payments** leave the charge `Partially recovered` with the rest still owed;
- **multiple outstanding dues** are all attempted in one run until the wallet is exhausted;
- a deduction the **wallet's own limits refuse** stops that member's run, leaves the charge
  outstanding, and records a `Failed` transaction naming the reason. Recovery never reaches past a
  charge it could not collect, so "oldest dues first" stays true.

The wallet's cheque book is the truth: `walletService.spend({ type: "Dues", kind: "Withdrawal" })`
writes a wallet transaction with `related.duesId`, and dues debits draw on the member wallet's daily
**withdrawal** limit. Member wallets cap a single transaction at ₦500,000, so a single charge above
that cannot be collected in one deduction — a limit of the wallet, not of dues.

### When recovery runs

1. **Automatically, when a member's wallet is credited.** `walletService.onWalletsCredited` announces
   credited wallets; the wallet does not know about dues — a module with a claim on the balance acts
   on the announcement. The `useDues` hook owns that subscription (it knows the environment's money
   mode) and recovery only runs where money may move.
2. **When an administrator chooses "Recover now"** on a plan (`dues.recover`).

The backend replaces both with a scheduled recovery job and an event consumer, and must do the
deduction and the charge update **in one transaction** — as everywhere else, the mock commits the
wallet first and the dues ledger second.

## Views

| View | Path | Purpose |
| --- | --- | --- |
| `dues` | `/dues` | Front door: collected / outstanding / overdue / paid-vs-unpaid, a "needs attention" strip, and one filterable plan list |
| `dues-detail` | `/dues/:id` | The plan: Overview, Participants, Payments, Activity |
| `dues-create` | `/dues/new` | One-page creation form |

There are no module tabs, and no public dues link: **members pay from their FinSquare wallet**, and
an administrator records cash or a bank transfer.

**Plan tabs — each has one job:**

| Tab | Contents |
| --- | --- |
| Overview | the money position (collected, outstanding, overdue, not-yet-due) and the plan's own configuration, plus the lien rules with **Edit rules** for `dues.manage_rules` |
| Participants | who pays in and where each stands — paid, outstanding, overdue, status — with **Record payment** and **Recover** per row |
| Payments | the charge ledger: period, due date, expected, paid, outstanding, status, lien, with a view filter that opens on *Outstanding* |
| Activity | every movement on the plan (wallet recoveries, manual payments, failures with their reason), CSV and PDF |

### Creation is one page

`CreateDuesForm.tsx` asks four questions in the order an administrator thinks about them — **amount →
frequency → participants → how unpaid dues are collected** — and keeps the genuine but rarely-changed
options (start and end date, the lien rules) behind one **Advanced** disclosure with sane defaults.
Participants are `All members`, `Selected members`, an existing **group**, or a **branch**; groups
and branches resolve to their members through `useParticipantRoster`, which reads membership rows
only for the group actually selected. Validation is `createDuesPlanSchema`, run on submit.

**Recording a payment** spreads the amount across that participant's due charges, oldest first, so a
part payment and a payment covering several periods both work; naming a specific charge starts there.
A payment above everything the member owes is refused rather than swallowed. A `wallet` payment
debits the member's wallet *before* the charge is marked paid — the same order the contributions
module uses.

## Data layer

```text
page/component → useDues(DUES_ORG_ID) → duesService → repository → mock | API
```

- `repositories/dues.repository.ts` — the command interface; every method takes `organizationId`
  first. Every mutation is a **named command** (`createPlan`, `setPlanStatus`, `updateLienRules`,
  `recordPayment`, `runRecovery`) — the client never posts a computed dataset back.
- `mock-dues.repository.ts` — in-memory, scoped to the organization, implementing the same commands
  against the pure rules in `domain/`, with `subscribe` so pages refresh after a mutation.
- `api-dues.repository.ts` — the API-backed implementation, wired to the MFI dues endpoints.
- `services/dues.service.ts` — the UI's entry point: `createPlan`, `setStatus`, `updateLienRules`,
  `recordPayment`, `runLienRecovery`, `startAutoRecovery`. It guards money movement, keeps one
  recovery run per scope at a time and owns the auto-recovery subscription; the rules live behind
  the repository so the server stays authoritative. Reading and writing a wallet is delegated to
  `features/wallet`, never done here.
- `constants.ts` holds `DUES_ORG_ID` — the tenant the pages operate on, defined once so no component
  imports a mock for it.

The mock generates each plan's charges from its own schedule and writes each seeded payment to both
the charge's `paidAmount` and a transaction, so **the ledger, the reports and the dashboard cannot
disagree** — a property a test asserts directly.

## Environment gating

`useDues` exposes `mode` from `moneyMovementMode(environment)`. In demo or pending-review the page
states that dues can be configured but no real money moves, `MutationContext.mode` is passed through
to the wallet, and the automatic recovery subscription is not even started. No component checks
`environment === "demo"` itself.

## Integrations

- **Members** — a member's dues are part of their money on the member profile: the profile's "what
  this member owes" strip groups dues by plan, the **Dues** tab lists the plans they owe on, and
  **Record payment** settles a dues charge through the same cross-module path as a contribution or a
  loan instalment (`domain/member-obligations.ts` → `duesObligations`). The activity feed shows the
  dues ledger's row and suppresses the wallet's duplicate row for the same money.
- **Wallet** — dues debits are `type: "Dues"` wallet transactions carrying `related.duesId`, so a
  member's statement names the plan; `TransactionType` gained `"Dues"` for that reason.
- **Communications** — a **Dues reminder** shortcut generates a message from a plan's real ledger
  (a period falling due, everything outstanding, or overdue dues only), preselecting the affected
  members. It only prefills the editor, exactly like the contribution and loan shortcuts.
- **Reports** — a **Dues** area on the central Reports page: collection history, plan performance,
  outstanding balances, overdue dues, wallet deductions, manual payments and member payment history,
  filterable by date range, plan, member, group, branch, status, method and amount, with CSV and PDF.

## Permissions

`dues.view` · `dues.create` · `dues.update` · `dues.close` · `dues.record_payment` · `dues.recover` ·
`dues.export`, plus organization-only `dues.manage_rules` (the lien rules spend money, so a
branch-scoped role cannot set them). See `docs/permissions.md`.

## Known gaps

- The mock is in-memory: with `VITE_ENABLE_MOCKS=true` a dues plan survives only the session that
  created it, like every other mock dataset. With mocks off it is stored by the backend.
- There is no member portal, so a member paying their own dues is exercised by the administrator's
  wallet payment, the member-profile **Record payment**, and the automatic recovery path.
- A plan with no end date gets a rolling twelve-month charge horizon. The backend generates the same
  horizon at creation and tops it up whenever a plan is resumed, rather than scheduling one period
  at a time.

## Backend

With `VITE_ENABLE_MOCKS=false` the workspace is served by the MFI backend (`/api/v1/mfi`):

| Command | Endpoint |
| --- | --- |
| load the dataset | `GET organizations/:organizationId/dues` |
| create a plan + roster + charge ledger | `POST organizations/:organizationId/dues/plans` |
| pause / resume / close | `PATCH organizations/:organizationId/dues/plans/:id/status` |
| change lien rules | `PATCH organizations/:organizationId/dues/plans/:id/lien` |
| record a payment | `POST organizations/:organizationId/dues/plans/:id/payments` |
| collect from wallets | `POST organizations/:organizationId/dues/recover` |

The backend stores plans, participants, charges and transactions in `mfi_dues_*` tables, derives
charge state and lien state from the stored rows on every read, re-derives the roster's schedule
itself, and debits a member's MFI wallet inside the same transaction that marks the charges paid
(`mfi_customer_wallets` + `DUES_PAYMENT` ledger entries). `mode: "blocked"` is refused, and
`simulated` records the movement without changing how the ledger is written.
