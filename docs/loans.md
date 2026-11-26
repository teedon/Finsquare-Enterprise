# Loans

Code: `src/features/loans/`. Pattern: `pages/` → `hooks/useLoans.ts` → `services/loans.service.ts` → `repositories/` (`mock-loan.repository.ts`). Pure maths in `domain/calculations.ts`; form logic in `domain/forms.ts`. Types in `types/loan.types.ts` and `form.types.ts`.

## Lifecycle
Loan type → Application → Eligibility → Guarantors → Review → Approval (or revised offer → applicant acceptance) → Disbursement → Active loan → Repayments → Overdue/Default → Recovery → Completed.

**Every application goes through the normal approval channel.** There is no "create approved loan" shortcut. `service.createApplication` always starts at `Submitted`.

## Pages
| View | Page |
| --- | --- |
| `loans` | Overview: attention strip for what needs action, a one-line portfolio summary, then two tables (applications requiring action, overdue repayments). Loan types and other destinations live under navigation, not as cards |
| `loan-applications` | Applications list; **New member application** (`ApplyModal`, loads the published form for the chosen loan type) |
| `loan-application-detail` | Tabbed: Overview, Form responses, Eligibility, Guarantors, Documents, Activity; Decision and summary panels on the right |
| `loan-active`, `loan-detail` | Active loans and a single loan. The loan detail keeps 4 tabs (Repayment schedule, Payments, Guarantors, Documents); repayment progress stays visible, while loan terms, borrower/repayment account and the activity log sit behind disclosures. The Recovery panel renders only for a loan in recovery |
| `loan-disbursements` | Approved applications ready to disburse from the main wallet |
| `loan-repayments` | Repayments (sidebar item under Disbursements) |
| `loan-guarantors`, `loan-recovery` | Reached from the Loans overview |
| `loan-products` / `loan-type-create` | Loan types, application forms, question library. `loan-type-create` (`/loans/products/new`) opens the loan type wizard directly |
| `loan-product-detail` | One loan type (`/loans/products/:id`), opened by clicking a row in the list. Shows its **application link** (copy / open), the loan rules, eligibility, the application form's version and question count, and who may apply. **Edit loan type** and **Edit form** open the wizard inline; `Close` returns to this page. The link field only exists once the form is published — a draft or an internal-only loan type says so instead of offering a dead link |
| `/apply/:slug` | Public application page for external applicants |

Terminology: UI says **Loan types**; code/types still say `product`.

## Form builder
**Shared with member application forms.** The builder itself — the step list, step and field editors,
document requirements, question library, preview and the applicant renderer — lives in
`src/features/forms/`, not here; see `member-applications.md` and
`decisions/011-member-application-forms.md`. What stays in `features/loans/` is the loan half:
`domain/loan-forms.ts` (the loan system steps, guarantor fields, `extractSubmission`, `newForm`) and
`types/form.types.ts` (which re-exports the shared vocabulary and adds `LoanApplicationForm` and
`FormResponse`).

Each loan type has an application form with versions (Draft / Published / Archived). Submissions record the form **version** used, so later edits never change past responses (`FormResponse.versionId`). Reusable questions live in the shared question library. The renderer no longer takes a `LoanProduct`: it takes `LoanFormConfig`, which a product satisfies, so `loan={product}` is all a loan form passes to get the loan step, its limits and guarantors.

**Changing anything under `features/forms/` affects member application forms too** — check `/apply/:slug` and `/members/forms` alongside the loan flow.

## What the form asks for by default

`systemSteps()` builds the loan form, and only these facts are locked:

| Step | Required (locked) | Suggested (optional, removable) |
| --- | --- | --- |
| Personal Information | First name, Last name, Phone number, Date of birth, Street address, City, LGA, State | Email, Gender |
| Loan Information | Loan amount, Loan purpose, Requested duration | — |
| Guarantors | Guarantor type, Full name, Phone number, Relationship | Email, Address, Occupation, Identification type, Identification number |

Identification type/number and the emergency contact pair are **not** on the loan form. A guarantor has no
guarantee amount: a guarantor stands behind the whole loan, so `extractSubmission` records the loan amount
on each guarantor.

**Requested duration is a pick, not a number.** The loan type owns `minDuration`–`maxDuration` and
`durationUnit`, and the renderer turns that range into a dropdown (1–12 Months → 1…12). The stored answer
is still a numeral, so the min/max check in `FormRenderer` and `num()` in both submission mappers keep
working; the field stays `type: "number"` in the schema for that reason and only its presentation changes.

**Compatibility with published versions.** Name and address are collected in parts, but older published
versions carry a single `fullName`/`address`. `applicantName` and `composeAddress` in
`domain/loan-forms.ts` read the parts and fall back to the legacy keys, and both `extractSubmission` and
`buildPublicPayload` use them — so a submitted old-style form still maps correctly.

## Disbursement
`DisbursementModal` always uses the main wallet (`defaultDisbursementWallet`). Amount-based approval rules (maker-checker) are configured under Wallet. Money movement honours `moneyMovementMode`.

## Rules to keep
- Loan calculations on the client are previews; the backend must recalculate before committing.
- External applicants and guarantors do not need FinSquare accounts.
- Loan pages follow the app-wide page rules in `ui-and-styling.md`: one header via `ShellPage`, no page-level back button, and secondary/derived data behind a `Disclosure` rather than another panel.
