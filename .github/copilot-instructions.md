# Copilot Instructions — FinSquare Enterprise

Configurable, **multi-tenant** financial/community management platform (cooperatives, associations, unions, MFIs, staff associations, farmers' groups). The **organization is the tenant**: modules, permissions and workflows differ per organization — do not assume every organization uses every feature.

This is a **frontend-only** app. All data comes from mocks behind repository interfaces so a real backend can be attached later without rewriting the UI. The frontend is never a security or calculation boundary: the backend must re-check authorization and recompute all financial values.

`AGENTS.md` is the canonical AI development guide (product principles, domain rules, definition of done). `docs/README.md` is the developer handbook and indexes every `docs/*.md` topic; read the relevant doc before changing a domain. This file covers the commands, architecture and conventions that are not obvious from a single file. When a change alters behaviour, routes, views or conventions, update the matching `docs/*.md` (and add an ADR under `docs/decisions/` for architectural decisions).

## Commands

| Task | Command |
| --- | --- |
| Typecheck (must stay clean) | `npx tsc --noEmit -p .` |
| All tests (~20) | `npx vitest run` |
| Single test file | `npx vitest run src/lib/permissions/permissions.test.ts` |
| Single test by name | `npx vitest run -t "resolves missing dependencies"` |
| Lint a single file | `npx eslint src/features/members/services/members.service.ts` |
| Format only the files you touched | `npx oxfmt <files>` |
| Dev server | `pnpm dev` (port 5173, or the `PORT` environment variable) |
| Production build | `pnpm run build` → `vite build` → `dist/`; preview with `pnpm preview` |

- Repo docs use **pnpm**; `npx` works everywhere. Both `package-lock.json` and `pnpm-lock.yaml` are committed.
- Gate work on `npx tsc --noEmit -p .` + `npx vitest run`. **`npx eslint src` and `pnpm format:check` currently report pre-existing failures** (~38 errors, mostly `@typescript-eslint/no-unused-vars` in `features/wallet/*` and the dense demo pages; formatting diffs in many files). Run lint/format on the files you touch only — never run repo-wide `oxfmt`/`pnpm format` (it produces a huge unrelated diff).
- Formatting is configured by `.oxfmtrc.json` (oxfmt, `semi: false`, `printWidth: 120`) so a formatted file matches the surrounding style, and formatting the files you touched is safe — it only rewrites whitespace, quotes and trailing commas. Never lower the oxfmt dependency back to a `^0.2.x` range: that release drops the separators inside inline object types and emits code that does not compile (see `docs/contributing.md` § *Formatting*).
- For browser-level validation, the workspace configures the Playwright MCP server in `.vscode/mcp.json`. Serve the app (dev server or `pnpm preview`) rather than opening `dist/index.html` directly — the app uses `BrowserRouter`.

## Architecture

```text
component → feature hook → feature service → repository → mock | API
```

Components never import mock data, call `fetch`, or build URLs. All HTTP goes through `src/services/api/client.ts` (base URL, JSON, timeout, normalized `ApiError`; auth header injected later via `configureApiAuth`). Path builders live in `src/services/api/endpoints.ts`.

### Directory layout

- `src/app/` — composition root and configuration (see below).
- `src/features/<feature>/` — one folder per product capability, owning its `components/ hooks/ services/ repositories/ schemas/ mocks/ types/ domain/`. Only create the sub-folders a feature needs. **`src/features/forms/`** is the shared form builder and question library, consumed by `loans` and `members`.
- `src/components/` — generic, reusable UI: `ui/` primitives (`Button`, `Field`, `SelectField`, `Badge`, `Modal`, `Toggle`, `SectionHeader`, `IconButton`, `Progress`), `layout/`, `navigation/`, `feedback/` (async states + app overlays), `data-display/`.
- `src/types/` — shared domain contracts (`Member`, `View`, `Permission`, …) plus API DTOs.
- `src/lib/` — permissions, capabilities, error mapping, utilities. `src/services/` — API boundary. `src/hooks/useAsyncResource.ts` — shared load/retry hook.

### Composition root vs entry point

- `src/App.tsx` — router entry. Sets `BrowserRouter` `basename` derived from Vite's `BASE_URL` (published builds are served from a sub-path — do not remove this) and mounts `WorkspaceProvider`.
- `src/app/app.tsx` — the composition root: a single `if / else if` chain that maps the current `view` to a page, plus the app shell, sidebar, overlays and toasts. Some pages are `lazy()`-loaded.

Two short-circuits in `app.tsx` run **before** the shell renders: the public `/apply/:slug` loan application page, and the onboarding flow (returned instead of the whole app while `onboardingCompleted` is `false`). If a page appears not to render, inspect `localStorage` keys `finsquare-*` first.

### Routing (typed `View` union, not route components)

The app uses `BrowserRouter` but routes through a typed union of screen ids:

- `src/types/navigation.ts` — the `View` union (every screen).
- `src/app/config/routes.ts` — `viewPaths` (view → path), `pathViews`, `resolveView(pathname)` (regex fallbacks for `:id` detail routes), `buildViewPath(view, id?)`.
- `src/app/routes/useAppRoute.ts` — returns `{ view, entityId, navigate }`; `entityId` is the last URL segment.
- `src/app/config/navigation.ts` — sidebar + access rules + breadcrumbs.

**Adding a screen** touches, in order: the `View` union → `viewPaths` in `routes.ts` → a branch in `app.tsx` (use `key={view}` if one component serves two views) → `navigationSections` (primary destination) or `secondaryAccess` (sub-page) → `crumbParents`/`crumbLabels` for breadcrumbs. Mutations go through `navigate(view, id)`; do not push raw URLs.

### Navigation, access and settings tabs

- `navigationSections` drives the sidebar. A section **with** a `label` renders as a collapsible dropdown; **without** a label it renders items directly. Only primary destinations belong in the sidebar.
- Anything reachable from another page (detail pages, sub-pages, settings tabs, reports) is registered in `secondaryAccess` with its `module`, `permission` and the sidebar item (`nav`) that should look active. `canAccessView(view, enabledModules, can)` is the single access gate; `parentView(view)` returns the active nav item.
- Settings is one sidebar item: `SETTINGS_TABS` + `settingsTabFor(view)` render `SettingsTabs` above the page; tabs are filtered through `canAccessView`.
- `components/navigation/Breadcrumbs.tsx` renders `breadcrumbTrail`/`crumbParent`/`viewLabel` on every page except Overview. **Back is deterministic** — it navigates to the parent view, not browser history.
- All module reports live in `features/reports/pages/ReportsPage.tsx` as tabs (module report components accept an `embedded` mode). Do not add per-module report entries to the sidebar.

### Modules

`src/app/config/module-registry.ts` is the single source of truth: each module has `id`, `group`, `name`, `description`, `icon` and `dependencies`. Enabled modules live in workspace state (`DEFAULT_ENABLED_MODULES`). `getMissingDependencies` / `getEnabledDependents` back the enable/disable `DependencyModal` in `app.tsx`. Navigation, permissions and page visibility must be driven off this registry — never ad-hoc conditions. Adding a module = one registry entry (+ nav metadata only if it has a page).

### Application state and environment

`src/app/providers/WorkspaceProvider.tsx` owns the only genuinely global state, via a reducer: organization profile, environment, enabled modules, compliance documents, corporate-account status/details, theme/accent, onboarding completion. It persists to `localStorage` (`finsquare-org`, `finsquare-onboarding`, `finsquare-theme`, `finsquare-accent`). Everything else belongs to its feature (component state for panels/tabs/filters; feature hooks for loading/mutations).

`environmentFor(corporateAccountStatus)` derives the environment: Not connected → `demo`, Under review → `pending_review`, Connected → `live`. **Environment gating is centralized** in `src/lib/permissions/capabilities.ts` — use `canPerform(environment, capability)` and `moneyMovementMode(environment)` (`live | simulated | blocked`). Never scatter `environment === "demo"` checks. Demo mode permits configuration but no real money movement.

### Permissions

- Granular strings `<module>.<action>` (`members.view`, `loans.approve`, `wallet.transfer`, `settings.manage`); the catalog is `src/lib/permissions/permission-catalog.ts`; the type lives in `src/types/permission.ts`.
- `src/lib/permissions/permissions.ts` — `hasPermission`, `canAny`, `canAll`, `hasAdministratorPermission`, `canAccessBranch`. `useAuthorization().can(permission)` is the hook used by pages/navigation.
- `scopedPermissionGroups(enabledModules, scope)` hides disabled modules' permissions and blocks branch/group-scoped roles from `organizationOnly` permissions (administrators, roles, settings, compliance).
- Wallet-level effective access = role permission **AND** a per-wallet (or `"*"`) `WalletAccess` grant (`canOnWallet`, `walletsWith`, `visibleWallets`).
- Frontend checks are UX only — the backend must re-check everything.

### Data layer conventions

Each persisted domain defines a repository interface with **`organizationId` as the first argument on every method** (tenant context). The pattern is `X.repository.ts` (interface) + `mock-x.repository.ts` + `api-x.repository.ts`, with `x.service.ts` choosing the implementation:

```ts
export const membersService = env.VITE_ENABLE_MOCKS
  ? new MockMemberRepository()
  : new ApiMemberRepository()
```

- Feature hooks call the **service**, never a repository implementation directly, and expose `{ data, status, error, retry }` using `AsyncStatus` and `getUserErrorMessage`. `useAsyncResource` covers simple load/retry cases.
- API DTOs use backend field names and live in `src/types`; map them to stable domain models inside the API repository (see `mapMember` in `api-members.repository.ts`). Never leak DTO shapes into components.
- Mocks live in `features/<feature>/mocks/`, model realistic backend responses, and are never inlined as large arrays in components.
- Mock boundaries are not the schema for the real database (see `docs/api-integration.md`).

### Members

The member profile (`/members/:id`) is the member's money surface: identity, access, and their own contributions, loans, wallet and activity, plus **Record payment** for everything they owe. The member id is the join key — `viewPaths["member-profile"]` is `/members/:id`, the list passes the id, and the loan mock carries the registry's member ids so a member's loans resolve. Domain maths lives in `features/members/domain/` (`member-obligations.ts`, `member-activity.ts`); the cross-module payment goes through `services/member-payments.service.ts`, which debits the member wallet exactly once per item. A member's own wallet lives here (Wallet tab), not under Wallet — there is no member-wallet index page. See `docs/decisions/009-member-profile-is-the-money-surface.md`.

### Member onboarding

**Add member** offers two paths: the ten-field manual form, or an application form. Both create the member through `membersService.create` — never add a second way a member record comes into existence.

The application form is built with the **shared form builder**, and so is the loan application form. That builder lives in `src/features/forms/` and is imported by **deep path**, never through a barrel (`features/loans/domain/loan-forms.ts` imports `features/forms/domain/forms.ts`, and a barrel would cycle through `LoanUi`). One question library per organization, owned by `features/forms/services/question-library.service.ts`, shared by every builder. Changing anything in `features/forms/` changes member *and* loan forms — check both.

Full name and phone number are **locked** in `memberSystemSteps()`: the builder cannot delete them or make them optional. Everything else FinSquare includes is optional and removable. The group a new member joins is a **publishing setting**, not an applicant question.

`/members/applications`, `/members/applications/:id` and `/members/forms` are `secondaryAccess` entries with `nav: "members"`. In `resolveView`, the exact paths and the `/members/applications/:id` pattern must be tested **before** the `pathname.startsWith("/members/")` fallback, or `/members/applications` resolves to a member profile. `/join/:slug` short-circuits the shell before the onboarding gate, next to `/apply/` and `/contribute/`. See `docs/member-applications.md` and `docs/decisions/011-member-application-forms.md`.

### Loans and money movement

The loan domain (`features/loans/`) is the largest feature: products → applications → eligibility → guarantors → review → approval → offer → disbursement → active loan → schedule → repayments → overdue/recovery → completed. Shared loan UI primitives live in `features/loans/components/LoanUi.tsx` (`Panel`, `PagedTable`, `Stats`, `KV`, `Tabs`, `ActionModal`, `NumField`, `TextArea`, `ExportButtons`, formatters `money`, `compactMoney`, `fmtDate`) — **reuse these instead of rebuilding tables/stats/modals**. Loan money maths belongs in `features/loans/domain/`, not components.

Loan disbursements may require maker-checker approval (approver ≠ initiator) via wallet approval rules. The mock transaction PIN is `1234` (`MOCK_TRANSACTION_PIN`) and must be verified server-side in production.

### Contributions

Contributions (`features/contributions/`, see `docs/contributions.md`) are independent, configurable savings/collection plans — Ajo-style collections, cooperative contributions, target savings and public fundraising. Two settings carry the whole feature: **`form`** (`General` = one pooled balance, `Personal` = a balance per member) and **`participantScope`** (`All`/`Selected`/`Open`, where `Open` is the only scope that puts the pool link live). Type (`Fixed`/`Flexible`/`Target`) and frequency (`frequencyBased` + `Daily`/`Weekly`/`Monthly`/`Custom`/`None`) are independent of both; there is no shared "cycle" object.

Continuous savings, `keepActiveAfterPayout`, `allowPartialWithdrawal`, `appliesToPublicContributions` and `createPublicLink` are **derived, not configured** — see `domain/contribution.rules.ts` (`isPersonal`, `keepsRunningAfterPayout`, `commissionApplies`). Do not reintroduce them as inputs. Creation is a single page (`CreateContributionForm.tsx`) asking type → form → frequency → participants → recipient, with rarely-changed options behind one Advanced disclosure; there is no wizard and no stepper.

Each plan configures its own **recipient** (organization wallet/account, member account, customer account or each contributor's own account) — member and customer balances are tracked inside the contribution, so never assume the organization holds the funds. Payouts subtract commission (only on a **Personal** plan, `percentage`/`fixed`) and above `payout.approvalThreshold` need a **different** administrator with `contributions.approve_withdrawal`. Every plan mints a link: `/contribute/:slug` for `Open` plans and `/contribute/:slug/m/:memberId` for a member. Balances, payout maths and period states (`Paid`/`Partially Paid`/`Late`/`Missed`/`Expected`) live in `features/contributions/domain/` and are unit-tested there.

Money moves through wallets, never through the contribution's own ledger: a `wallet` payment **debits the member's member wallet** before the contribution is recorded, and a completed payout **credits** the recipient's wallet (`walletService.spend`/`credit`). Member wallets are ordinary wallets with `scope: "member"` (see `docs/wallet.md`) — do not build a second wallet system.

### Communications

Communications (`features/communications/`, see `docs/communications.md`) is an **operational messaging tool, not a marketing platform**: who am I sending to, what am I sending, what will it cost, send. Do not add campaigns, automation, journeys, segmentation builders or a drag-and-drop email designer.

One view (`/communication`) with **Compose** and **History** tabs; the SMS balance block sits above the tab row, and History opens a message in a modal rather than a second route — a detail route would lose the active tab on Back. Message detail is a record, so it opens in one place with its recipients and delivery outcomes.

The **SMS balance is money**, so its rules live in `services/communications.service.ts`, never in a component: `estimateCost` prices parts × reachable recipients × rate (email costs nothing), `sendMessage` refuses an unaffordable send naming both figures and deducts the balance in the same mutation that records the message, and `topUpBalance` debits an **existing organization wallet** via `walletService.spend` — there is no second payment rail. Only a text actually submitted is billed, which keeps `Message.cost` equal to `estimateCost().total`.

**The single `{name}` token** is substituted per recipient at send time, which is why the stored body keeps the token and why one bulk reminder can read "Hi David…". Text generation for the two reminders is `domain/templates.ts`; the choice of plan or loan only prefills the editor. `resolveRecipients` must stay de-duplicating: a person in two selected groups is one recipient and one charge.

### Styling

Tailwind v4 is installed, but most UI is built with semantic classes in `src/index.css` (`.page`, `.panel`, `.tabs`, `.btn`, `.badge-*`, `.form-grid`, `.field`, `.crumbs`, …). Add new classes at the end of that file next to related ones; do not add unlayered universal resets.

- `WorkspaceProvider` sets `data-theme` (`light`/`dark`/`system`) and `data-accent` on `<html>`. **Always use CSS variables** (`--surface`, `--surface-soft`, `--ink`, `--muted`, `--line`, `--line-strong`, `--blue`, `--green`, `--amber`, `--red`, …) instead of hard-coded colors so dark mode keeps contrast. The accent is the exception in the other direction: `--blue`, `--blue-dark`, `--blue-soft`, `--blue-text` and `--on-accent` are **all computed by `src/lib/theme/accent.ts` and written by `WorkspaceProvider`, never defined in CSS** — defining only some of them is exactly how an orange workspace shipped a blue active nav item, blue tabs and blue eyebrows. Text or an icon *on* `--blue` uses `color: var(--on-accent)`, never `white`. See `docs/ui-and-styling.md` § *Theming*.
- Icons come from `src/icons.tsx` and are CSS-mask `span.mask-icon` elements, not SVG — style with `color`/`width`, never `fill`/`stroke`. Add new icons to the mask map there.
- `Field` takes `onChange(value: string)`; `SelectField` takes `options: string[]`. Search inputs use `SearchInput` from `data-display/ManagementPrimitives`.
- Enterprise tone: dense but readable, one primary action per header, statuses via badges, no decorative animation, explicit loading/empty/error states.
- **Containers own the horizontal inset; rows own the vertical rhythm.** `Panel` is **flush by default** (`flush = true`), so a panel that renders *content* must supply its own padding — most of the 66 call sites render tables and are correctly flush, so do not invert the default. `Disclosure plain` supplies the summary's inset and the body's inset for the same reason. A list row (`.person-line`, `.log-row`, `.access-row`) takes vertical padding only, so it cannot double up when it is rendered inside an already-inset body. Floors: **row ≥ 44px**, panel content inset **≥ 16px** (20px for forms). Never rely on a hairline separator for breathing room.
- **A create/edit form page is an 880px centred column, not a full-bleed page.** Pass `width="narrow"` to `ShellPage` / `LoanPage`; leave it off for dashboards, lists, reports and record workspaces (the loan-product wizard is full width because its *Application form* step is the three-pane form builder). Inside that column `.choice` is capped at `max-width: 280px` (without the cap a two-option row stretches to fill and the boxes become 544px), `.form-grid-3` packs an all-short-field panel into three columns, and `.field-lead` promotes the one amount the task hinges on. Size is spent on what matters (title, balance, cost) rather than spread evenly. See `docs/ui-and-styling.md` § *Form pages: a focused column*.
- **One page = one header and one navigation level.** Pages render through `components/layout/ShellPage.tsx` (`level="index"` for a module front door, `level="detail"` for a single record — which the type forbids from also showing the module's tabs). Never add an in-page "Back to …" control (the breadcrumb bar owns Back) and never stack two tab rows: an in-screen chooser is a `<select>` in the panel/page header. Data that belongs to a record lives inside that record; advanced detail goes behind `components/ui/Disclosure.tsx`. See `docs/ui-and-styling.md` and `docs/decisions/007-one-header-and-progressive-disclosure.md`.

## Conventions

- Naming: components `PascalCase.tsx`; hooks `useFeature.ts`; `feature.service.ts`; `feature.repository.ts`; `feature.schema.ts`; `feature.mock.ts`. Barrel exports (`index.ts`) only at intentional feature entry points.
- Use double quotes. **A string containing an apostrophe must use double quotes** — an unescaped apostrophe in a single-quoted string breaks the build.
- ESLint enforces `@typescript-eslint/consistent-type-imports` (use `import type`) and `no-explicit-any` (avoid `any`; document a reason if unavoidable). TypeScript is `strict`.
- Validate at boundaries with **zod** schemas in a feature's `schemas/`; infer form types from the schema and keep submission in the feature hook/service.
- Tests are Vitest, colocated `*.test.ts` (node environment — no DOM, component, or E2E tests exist). Cover pure logic: module registry/dependencies, permission scoping, repository mocks, zod schemas, mappers.
- Keep business rules and money maths in `domain/` and `services/` — never in presentational components. Do not hardcode values that belong in configuration or the domain model.
- Prefer the existing component, hook, util or dependency over a new one. Do not add dependencies or parallel duplicates; do not redesign unrelated features.
- Build output goes to `dist/` (gitignored). Deployment and sub-path hosting are covered in `docs/deployment.md`.

## Existing AI assistant configs

`AGENTS.md` is the shared, tool-agnostic guide; `CLAUDE.md` simply starts with `@AGENTS.md` and duplicates its content. Keep them in sync when product-level guidance changes, and prefer editing `AGENTS.md` as the source of truth.
