# FinSquare Enterprise — developer & agent handbook

Start here. FinSquare Enterprise is a **configurable, multi-tenant financial and community management platform** for cooperatives, associations, unions, MFIs, staff associations and farmers' groups. The organization is the tenant; modules, permissions and workflows differ per organization.

This is currently a **frontend-only** application running on mock data behind a repository layer. A backend can be attached later without rewriting the UI (see `api-integration.md`).

## Stack
React 19, TypeScript (strict), Vite, Tailwind v4 (plus a large hand-written `src/index.css`), `react-router-dom` (BrowserRouter), `zod` for validation, Vitest for tests. Package manager: pnpm.

## Commands
| Command | Purpose |
| --- | --- |
| `pnpm dev` | Vite dev server (defaults to port 5173, or `PORT`) |
| `npx tsc --noEmit -p .` | Type check (must be clean) |
| `npx vitest run` | Unit tests |
| `pnpm run build` | Production build (`vite build`) → `dist/` |

## Document map
| Doc | Contents |
| --- | --- |
| `architecture.md` | Layering, state ownership, composition root |
| `routing-and-navigation.md` | `View` enum routing, sidebar, breadcrumbs, settings tabs, access rules |
| `modules.md` | Module registry and the feature map (what lives where) |
| `permissions.md` | Permission model, scoping by module, wallet-level access |
| `authentication.md` | Login gate, session lifetime, signing up and logging out |
| `communities.md` | Communities and the switcher: what is per community, the tenant, roles, creating one |
| `branding.md` | FinSquare's own mark vs a community's logo: what to drop in, and where each appears |
| `onboarding.md` | Onboarding flow, demo mode and the corporate-account lifecycle |
| `loans.md` | Loan domain, application lifecycle, form builder, disbursement |
| `member-applications.md` | Member onboarding: application forms, joining rules, the public link, approvals, export |
| `wallet.md` | Main wallet, branch wallets, member wallets, transfers, approvals, reports |
| `contributions.md` | Contribution plans, form, recipients, payouts, commission, links |
| `dues.md` | Dues plans, the charge ledger, wallet liens and recovery, reminders, reports |
| `communications.md` | Messaging workspace, SMS balance, composing, reminders, delivery || `ui-and-styling.md` | Design primitives, theming, dark mode, icons, CSS conventions |
| `api-integration.md` | How to replace mocks with a real backend |
| `deployment.md` | Build, sub-path hosting and browser verification |
| `contributing.md` | Working agreements and the definition of done |
| `decisions/` | Architecture decision records |

## Golden rules (short form)
1. Read existing code first; reuse components and utilities. Do not create parallel versions.
2. UI → hook → service/repository → mock/API. Components never import mock data or call `fetch`.
3. Business rules and money maths live in `domain/` and `services/`, never in presentational components.
4. Organization context, module enablement and permissions are centralized (`navigation.ts`, `module-registry.ts`, `lib/permissions`).
5. Money movement is gated by `moneyMovementMode(environment)` / `canPerform`. Never scatter `environment === "demo"` checks.
6. Frontend permission checks are UX only. The backend must enforce authorization and recompute all financial values.
7. Less is more: keep the sidebar short, put secondary pages behind the page that owns them, avoid dense stat rows.
8. No unlayered universal CSS resets. Use double quotes for strings that contain apostrophes.
9. One page = one header (`ShellPage`) and at most one tab row. Secondary data goes behind a `Disclosure`; a page never adds its own back button. See `ui-and-styling.md` and `decisions/007-one-header-and-progressive-disclosure.md`.
10. A container that renders content owns its horizontal inset (`Panel` is flush by default); a list row owns only vertical rhythm. Row ≥ 44px, panel inset ≥ 16px (20px for forms). See `ui-and-styling.md` § *Spacing: who owns the inset*.
11. A member's money — contributions, loans, wallet, what they owe — lives on the member profile and nowhere else. See `decisions/009-member-profile-is-the-money-surface.md`.
12. Communications is an operational tool: who, what, what it costs, send. No campaigns, automation or builders. The SMS balance is funded from the wallet, never a second payment rail. See `communications.md`.
13. There is **one form builder per feature family and one question library per organization**. It lives in `src/features/forms/` and both loan and member application forms use it — never build a second one, and never import it through a barrel. See `decisions/011-member-application-forms.md`.
14. A member is created by `membersService.create` and nothing else. Approving an application, open joining and manual add all go through it, so there is one way a member record appears.
15. A wallet lien is a **claim on the member's own wallet**, never a second ledger and never a reservation: dues are only ever deducted when the money is actually there, and never more than the amount owed. Recovery is capped, oldest due first, and refuses to run twice for the same scope. See `dues.md`.
16. A **community is the tenant**, and the tenant is state: one slice per community in `WorkspaceProvider`, `useOrganizationId()` at the call site, and the role you hold in the active community drives the permission checks. Nothing pins a tenant with a constant. See `communities.md` and `decisions/014-communities-and-active-tenant.md`.
17. **Cash is a wallet, not a payment method.** Money taken at the counter lives in a `type: "Cash"` wallet that `syncAccount` excludes from the bank balance; taking it is one commit (credit the member wallet, settle the obligations, credit the cash wallet, write the receipt and audit); banking it is a cash→bank transfer that needs a bank reference. See `wallet.md` and `decisions/015-cash-on-hand.md`.

## Known gaps / assumptions
- No automated browser E2E tests; verification is `tsc` + Vitest, plus manual or Playwright MCP browser checks.
- Transaction PIN is any 4 digits. The service enforces the format; a real backend must verify the PIN itself and rate-limit attempts.
- Withdrawals exist as permissions and limits but have no UI.
- Onboarding, organization profile, theme and corporate-account details persist to `localStorage` only.
- The session is **not** persisted. The login gate is a mock that accepts any well-formed email and password, and reloading the page signs you out. There is no password reset, account recovery, lockout, MFA or refresh token — see `authentication.md`.
- Contribution mutations live in memory for the session: the mock repository scopes to the organization and notifies subscribers, but nothing survives a page reload (same as members/wallet mocks).
- `features/reports` and the contribution reports read the same mock datasets, so a new plan appears in reports only in the session that created it.
- There is no cross-plan payout queue: withdrawals and approvals are handled inside each contribution (`/contributions/:id`, Activity tab). A contribution-wide or organization-wide payout worklist is a deliberate omission (see `decisions/007-one-header-and-progressive-disclosure.md`).
- Contribution money-control **editors** (commission rate, payout approval threshold) are only set when a plan is created — the create form's Advanced section. Changing them afterwards goes through the mock data, not the UI.
- Member wallets hold mock balances and are only reachable by an administrator with `wallet.view`; there is no member login yet, so the member-facing side is the contribution link (see `decisions/008-contribution-form-and-member-wallet.md`).
- A member's money is read from the member profile (`/members/:id`): contributions, loans, wallet, activity and **Record payment**. There is no member-wallet index page — see `decisions/009-member-profile-is-the-money-surface.md`.
- Member onboarding has **no applicant portal**: someone who submits an application gets a reference and nothing else — no login, no status tracking, no notification when the decision is made (`member-applications.md`). Documents are mocked (filename + date only), and a published form survives the session only, like every other mock dataset.
- A member created from an application is `Active` with `accountStatus: "Created"` and joins the group the form was published with. Its **branch is not set** — there is no branch question on an application form, and no editor for it on the member profile.
- `addMonths` (`features/contributions/domain/calculations.ts`) uses `setMonth`, which overflows rather than clamping, so a monthly plan starting on the 29th–31st skips a month and repeats the next one. The member profile de-duplicates by settleable key so its figures stay correct, but the plan's own period ledger still shows the gap and the repeat.
- `contributions.service.recordPayment` does not recompute `participant.missedCount`, so a plan can report a stale missed count after a payment. The member profile derives its missed figure from period states and is accurate.
- The `customer` recipient kind exists in the contribution schema and domain but not in the create form.
- Roles/permissions are scoped by enabled modules and role scope; this was an assumption, confirm with product.
- Dues data lives in memory for the session, so a created plan appears in reports only in the session that created it (same as every other mock dataset).
- A dues charge above the member wallet's single-transaction limit (₦500,000) cannot be recovered in one deduction. The limit belongs to the wallet, so dues does not work around it.
- The wallet commit and the dues commit are separate in the mock, exactly as they are for a contribution payment; the backend must make the deduction and the charge update atomic.
- There is no scheduler. Outstanding dues are collected when a member's wallet is credited or when an administrator runs **Recover now**; the backend owns the real recovery schedule.
