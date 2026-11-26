# UI and styling

## Principles
Serious enterprise workspace; dense but readable; consistent tables and status badges; no decorative animation. Prefer fewer choices: one primary action per page header, one stats row, secondary links as a compact row.

## Page structure: one header, one navigation level

Every screen renders **exactly one** header, owned by the page. `components/layout/ShellPage.tsx` is the contract:

```tsx
<ShellPage level="index" title="…" description="…" meta={chips} actions={…} attention={items} tabs={…} activeTab={…} onTabChange={…}>
  …content…
</ShellPage>
```

- `level="index"` — a module front door. May show the module's tab row and an attention strip.
- `level="detail"` — a single record. The type **forbids** `tabs`/`attention`, so a detail screen can never end up with the module's tabs on top of its own.
- `meta` holds the chips that describe the record (status, type, who holds the funds) inside the header instead of in a separate row underneath.

Rules that follow from it:

1. **One header per screen.** The breadcrumb bar owns "where am I / back". Do not add an in-page "Back to …" button or link.
2. **One navigation level at a time.** Module tabs belong to the module index; a detail screen has its own tabs and never both. Inside a tab, switch views with a `<select>` in the panel's `actions` slot (see `PlanActivity`, `PlanReports`) — never a second `Tabs` row.
3. **Module = front door + list; data lives in the entity.** A front door shows what needs attention and the list of records. Money detail, history and reports live inside the record that owns them.
4. **Advanced detail behind disclosure**, never in the default view.
5. **Tables show decisions, not inventories.** Default columns answer "what do I do next?". Every table also numbers its rows: `DataTable` renders a narrow `#` column by default (`showSerial`), numbered continuously across pages from the caller's `page` and `pageSize`. Pass `showSerial={false}` only where the rows already carry their own sequence number, as the loan repayment schedule does.
6. **State changes behind one control** (`ActionMenu`), not a row of always-visible buttons.
7. **One vertical rhythm.** `.page > * + *` owns the gap between blocks (see below).

### Shared pieces for the above

| Piece | Use |
| --- | --- |
| `ShellPage` (`components/layout/ShellPage.tsx`) | The page contract described above |
| `AttentionStrip` (`components/feedback/AttentionStrip.tsx`) | A module's "what needs me" row. Renders nothing when the list is empty, so a calm module stays calm. Items need a stable `id` — the same record can raise more than one |
| `Disclosure` (`components/ui/Disclosure.tsx`) | Collapsed advanced detail: references, fees, schedules, payout maths, audit logs. `plain` drops the divider for use inside a panel or list row |
| `ActionMenu` (`components/ui/ActionMenu.tsx`) | One button for a group of state-changing actions |
| `Tabs` (`components/ui/Tabs.tsx`) | One tab row. Re-exported from `features/loans/components/LoanUi.tsx` for existing imports |
| `Panel` (`features/loans/components/LoanUi.tsx`) | A surface that groups content. **Flush by default** (`flush = true`), so a panel rendering content rather than a table passes `flush={false}` or supplies its own padding — see [Spacing](#spacing-who-owns-the-inset) |

## Styling
Tailwind v4 is installed, but most UI uses semantic classes in `src/index.css` (`.page`, `.panel`, `.tabs`, `.btn`, `.badge-*`, `.form-grid`, `.field`, `.onb-*`, `.crumbs`, `.disclosure`, `.attention`, `.page-meta`, …). Add new classes to the end of that file next to related ones. Do not add unlayered universal resets.

### Vertical rhythm
Page-level blocks previously had **no** vertical space at all — consecutive panels sat flush against each other, which is what made dense screens feel clustered. Two tokens now own spacing:

```css
:root { --gap-section: 18px; --gap-block: 12px; }
.page > * + * { margin-top: var(--gap-section); }   /* between blocks on a page */
.stack > * + * { margin-top: var(--gap-section); }  /* explicit, for fragments' children */
.stack-tight > * + * { margin-top: var(--gap-block); }
```

Because sibling margins collapse, existing `.page-header`/`.tabs` margins keep working; the rule only fills the gaps that were zero. Use `.stack`/`.stack-tight` instead of inline margins so the rhythm stays in one place.

### Spacing: who owns the inset

Every bunching bug in this app has had the same shape — a container rendered content and assumed
something underneath it would supply the spacing. It is a rule, not a preference:

1. **A container that renders content owns its horizontal inset.**
   `Panel` is **flush by default** (`flush = true` in `features/loans/components/LoanUi.tsx`): its
   body has no padding. Most of the ~66 `<Panel>` call sites render a table, which carries its own
   `td` padding, and are correctly flush — **do not invert the default**, it would double-pad the
   content panels that already opt in with `flush={false}`. A panel that renders a *form* or a
   paragraph must supply its own inset; `.create-form` does this with `padding: 20px`.
   `Disclosure` behaves the same way: `.disclosure-plain` supplies `0 14px` on the summary and
   `10px 14px 14px` on the body, so the row inside it does not have to.
2. **A list row owns its vertical rhythm, and only that.** `.person-line`, `.log-row` and
   `.access-row` carry vertical padding and no horizontal padding, so the same row renders at the
   same density inside a flush panel and inside an already-inset disclosure body. `.person-line`
   is `flex`, not a fixed grid: the name absorbs the slack and its metrics are marked
   `person-metric`, so a call site rendering four columns or five both end flush right.
3. **Floors.** A row a person scans or clicks is **≥ 44px** tall. Panel content sits **≥ 16px**
   from the panel edge, and **20px** for a form. A hairline separator is decoration, never a
   substitute for spacing.
4. **Density is set by tokens, not by hand** — `--gap-section` and `--gap-block` through
   `.page > * + *`, `.stack` and `.stack-tight`.

Measure it rather than eyeballing it. Paste this into the devtools console on any route (expand
the disclosures first — collapsed content is not laid out):

```js
document.querySelectorAll('.disclosure-summary[aria-expanded="false"]').forEach((b) => b.click())
setTimeout(() => {
  document.querySelectorAll('.panel, .table-panel').forEach((p) => {
    const pr = p.getBoundingClientRect()
    let worst = Infinity
    p.querySelectorAll('*').forEach((el) => {
      if (el.closest('.table-scroll, table, .badge, .btn, .mask-icon, .tabs, .table-toolbar')) return
      if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) return
      const r = el.getBoundingClientRect()
      if (r.width && r.height) worst = Math.min(worst, r.left - pr.left, pr.right - r.right)
    })
    if (worst < 16) console.warn('under-inset content', Math.round(worst) + 'px', p.querySelector('.panel-head b')?.textContent)
  })
  document.querySelectorAll('.person-line, .log-row, .access-row, .create-member-list li, .picker-list > li').forEach((row) => {
    const h = row.getBoundingClientRect().height
    if (h && h < 44) console.warn('short row', Math.round(h) + 'px', row.textContent.trim().slice(0, 40))
  })
}, 100)
```

### Form pages: a focused column

A form that creates or edits one record is a **focused task**, not a workspace, so it renders in a
**880px centred column** rather than the full width. Full-bleed was the cause of the worst density
bug in the app: with 1137px of panel, a two-option choice row had nothing to stop it stretching, so
"General"/"Personal" came out **544px wide each** and a text input was 546px.

```tsx
<ShellPage width="narrow" … />   {/* components/layout/ShellPage.tsx */}
<LoanPage width="narrow" … />    {/* features/loans/components/LoanUi.tsx */}
```

- **Use `width="narrow"` for a create/edit form page** — `ContributionCreatePage`, `DuesCreatePage`,
  `CreateCommunityPage`, and the Communications **Compose** tab. Compose derives it from the active
  tab, because History renders a six-column table and keeps the full width.
- **Leave it off** for a dashboard, a list, a report or a record workspace. The loan-product wizard
  in `LoanProductsPage` is full width on purpose: its *Application form* step is the form builder,
  which needs three panes.
- 880px leaves ~830px of content. That is the width the geometry below is tuned for: wide enough
  that the 13-field *Loan rules* panel sits in four rows of ~265px, narrow enough that a two-field
  `.form-grid` still reads as a form rather than a stretched table.

| Element | Rule | Why |
| --- | --- | --- |
| `.choice` | `flex: 1 1 160px` **and `max-width: 280px`** | The cap is the important half — without it a row of two stretches to fill. With it, two options are 2 × 280, three are ~202 each, four still fit one line. It only ever *stops* growth, so it is safe in every call site including modals. Lifted below 600px so a choice fills a phone |
| `.form-grid-3` | 3 columns, collapsing to 2 at `860px` and 1 at `600px` | For a panel whose fields are *all* short — the loan-product *Loan rules* panel packs 13 fields into 5 rows of ~201px instead of 7 rows of 546px. Do not use it where a label or a value needs room to wrap |
| `.field-lead` | `height: 44px; font-size: 16px; font-weight: 600` | Promotes the **one** amount the task hinges on (the expected or target contribution). One per form |
| `.create-q` | 14px / 700 | The question a choice row answers is the form's real hierarchy, so it outranks a `.field` label |

The inverse also holds: things that *are* important stay large on purpose — a page title, the SMS
balance, the send cost. Spend size on one number per screen rather than shrinking everything into
uniformity.

### Public links: who is asking

`/apply/:slug` (loan application), `/join/:slug` (membership application) and `/contribute/:slug`
(a contribution pool) render **outside the app shell** — no sidebar, no session. A stranger opening
one has no context, so all three render through
[`PublicFormPage`](../src/components/layout/PublicFormPage.tsx), which supplies the whole page:

```
[community logo] Community name                  Powered by FinSquare
LOAN APPLICATION                      ← what this link is for (`purpose`)
Short Term application form           ← h1: the form or plan
One line of what happens next         ← description
┌─────────────────────────────────────┐
│ the form, in one card at 760px      │
└─────────────────────────────────────┘
Community name manages this page …    ← only when the name is known
```

- **The community is real data or nothing.** The loan link's payload already names the lender
  (`mfiName`/`mfiLogo`); the contribution link can only name it when the plan's recipient is the
  organisation account. The membership link's payload names nobody today, so its header shows the
  product mark and **no community** — never substitute the product mark for a community, and never
  invent a name.
- **The card is the only surface.** The renderer inside it is shared with the in-app builder, so its
  extra room (`.public-card .form-grid`, taller inputs) is scoped under `.public-card` rather than
  changed in `FormRenderer`.
- States stay inside the same shell — a dead link, a load failure and a receipt each set their own
  `title`/`description`, so the page never loses the identity block.

### Responsive containment
A grid with a hard minimum (`.appearance-layout`, the `Stats` row, the wide filter grids) must collapse or wrap below `860px`, otherwise it pushes the whole page into horizontal scroll. Two rules to remember:

- Never set `grid-template-columns` **inline** on a responsive grid — an inline style beats the class's media queries. `Stats` passes its column count as `--stat-cols`, and `.stat-grid[data-stats]` switches to `repeat(auto-fit, minmax(150px, 1fr))` below the breakpoint.
- Add new multi-column layouts to the `@media (max-width: 860px)` block that collapses the existing ones (`dashboard-grid`, `profile-grid`, `structure-grid`, …, `appearance-layout`).

The **form builder** is the exception that proves both rules. It is one component embedded in pages of
very different widths (a full-width member-form detail page, the loan-product wizard), so it collapses
on the *canvas* it is given, not on the viewport: `.form-canvas` is a `container-type: inline-size`
query container and `.form-builder-grid` is a container query — three panes, two below 880px of canvas
(the settings rail moves under the editor), one below 560px. Its tracks are all `minmax`, so at any
width they shrink instead of letting the settings rail ride over the question list.

## Theming

`data-theme` ("light"/"dark") and `data-accent` are set on `<html>` by `WorkspaceProvider`. Theme preference is `light | dark | system`; System follows `prefers-color-scheme` and updates live. **Always use CSS variables** (`--surface`, `--surface-soft`, `--ink`, `--muted`, `--line`, `--line-strong`, `--blue`, `--blue-soft`, `--green`, `--amber`, `--red`, …) instead of hard-coded colors so dark mode keeps contrast. Secondary brand colour is `--brand-secondary`.

### The accent resolves to five tokens, in one place

`src/lib/theme/accent.ts` owns the presets and `resolveAccent(accent, theme)`. **It is the only place the accent is interpreted, and `WorkspaceProvider` writes all five tokens from its result.** Never set a brand-derived token in CSS: `--blue` used to follow the brand while `--blue-text` kept a hardcoded blue, so an orange workspace shipped a blue active nav item, blue tabs and blue eyebrows.

| Token | Use |
| --- | --- |
| `--blue` | Fill for buttons, progress, active borders |
| `--blue-dark` | That fill's hover shade |
| `--blue-soft` | A tint of it, as a background behind accent text |
| `--blue-text` | The accent as **text** on the page |
| `--on-accent` | Text and icons **on** an accent fill |

**The resolution is contrast-aware, and that is the point of it.** A brand colour is a hue, not a promise, so the tokens are computed against the surface each one lands on rather than assumed:

- `--on-accent` is whichever of white/near-black reads better on the fill, so a white brand colour can never paint white writing on a white button. **Any element sitting on `--blue` uses `color: var(--on-accent)`** — never `white`.
- `--blue-text` clears **AA (4.5:1)** against both the page *and* the accent's own tint, because badges and checked chips paint accent text on `--blue-soft`, which is darker than the page. Checking only the page left them at 4.48.
- The fill clears **4.5:1** against `--on-accent` and stays distinguishable from the page. A mid-grey is the awkward case: neither ink clears AA on `#808080`, so the fill moves a shade.
- The tint stays a *tint* (under 1.6:1 against the page). A near-white accent tinted a dark surface into a light grey, which broke every muted label painted on it.
- Presets are honoured exactly; only a colour that would fail one of the floors moves, and then only as far as it must.

One trap this replaces, and which must not come back:

- **The dark theme forcing `b`/`strong` to `--ink`.** Any `<b>` inside an accent fill is repainted the light `--ink`, which on a light accent fill is the same colour as the fill. `.wallet-main b` restates `color: var(--on-accent)` and must stay declared *after* the dark block.

Covered by `src/lib/theme/accent.test.ts`: both floors for every preset and for awkward colours (white, mid-grey, yellow, black) in both themes.

## Text and contrast

Text colour always comes from a token. Never hard-code a hex in a `color:` declaration — the dark theme cannot override it, which is exactly how table cells became unreadable.

| Token | Use | Light | Dark |
| --- | --- | --- | --- |
| `--ink` | Headings, `<b>`, primary values | `#17202e` | `#eef2f7` |
| `--ink-soft` | Body copy, table cells | `#3f4a5c` | `#c7cfdb` |
| `--muted` | Secondary text, table headers | `#5c6678` | `#a9b3c2` |
| `--faint` | Tertiary metadata, timestamps | `#616b80` | `#8d97a6` |
| `--blue-text` `--green-text` `--amber-text` `--red-text` `--purple-text` | Brand-coloured **text** and icons | AA-safe variants of the brand colours | lightened for dark surfaces |

`--blue`, `--green`, `--amber`, `--red`, `--purple` and their `--*-soft` companions are **fills**: solid backgrounds, borders, bars and toggles. Their values are intentionally theme-independent so white-on-fill stays legible. When a brand colour is used as *text* — including inside ternaries and inline `style={{ color: … }}` — use the matching `--*-text` token.

Surfaces are `--surface` / `--surface-soft`; borders are `--line` / `--line-strong`. Every text token clears WCAG AA (≥ 4.5:1) against every surface token in both themes.

Brand swatches (colour pickers, brand preview) paint arbitrary user hex, so a token cannot cover them — compute a readable foreground instead of hard-coding `#fff`; see `readableOn()` in `features/onboarding/components/OnboardingFlow.tsx`.

## Components
- Primitives: `src/components/ui` (`Field` `onChange(value: string)`, `SelectField` takes `options: string[]`).
- Loan/wallet shared UI: `features/loans/components/LoanUi.tsx` (`Panel`, `PagedTable`, `Stats`, `KV`, `Tabs`, `ActionModal`, `NumField`, `TextArea`, `ExportButtons`, formatters `money`, `compactMoney`, `fmtDate`). Reuse these rather than rebuilding.
- Feature shells: `features/contributions/components/ContributionUi.tsx` (`ContributionPage` tab shell, badges, `RecipientChip`) re-exports those primitives and adds contribution-specific classes (`.contribution-*`, `.recipient-chip`, `.public-contribution-*`). Put a page inside `ContributionPage` instead of re-implementing tabs, loading and error states.
- Icons come from `src/icons.tsx` and are CSS-mask `span.mask-icon` elements, not SVG. Style icons with `color`/`width`, not `fill`/`stroke`. Add new icons to the mask map there.
  - **Never write a container-scoped bare `span` rule around an icon.** `.mask-icon` is `flex: 0 0 auto` (specificity **0,1,0**), so a rule like `.env-banner span { flex: 1 }` (**0,1,1**) outranks it — that stretched the icon element to 382px and centred its 15px glyph in the leftover space, which read as a misaligned banner. Give the element that needs the styling its own class (`.env-banner-text`). The same trap applies to any `flex`/`width` you set on an ancestor's descendants.
- Search inputs: `SearchInput` in `data-display/ManagementPrimitives`; the icon is absolutely positioned inside `.search`.
- Branding: `components/layout/Brand.tsx` exports `Brand` (mark + wordmark) and `BrandMark` (the mark alone, for the login and onboarding welcome cards). An organisation's own logo is separate — `OrgAvatar`. See `branding.md`.

## Accessibility
Buttons for actions, `aria-pressed` on toggle cards, `aria-label` on icon-only controls, `role="status"` on banners, visible focus states.
