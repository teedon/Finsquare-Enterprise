# Member applications

Code: `src/features/members/`. Domain in `domain/member-application.rules.ts` and `domain/form-export.ts`; validation in `schemas/member-application.schema.ts`; data in `services/member-applications.*`; UI in `components/MemberApplication*`.

A member can be added two ways: **manually** (the ten fields an administrator already has) or through an **application form** they share as a link. Both produce the same thing — a member record created by `membersService.create`. There is no second way for a member to come into existence.

## The form builder is shared, not copied

Member application forms are built with the **same** builder as loan application forms. That code lives in `src/features/forms/`:

| Piece | File |
| --- | --- |
| Types (fields, steps, versions, question library) | `features/forms/types/form.types.ts` |
| Generic helpers (`systemField`, `systemStep`, `doc`, `qf`, `renumber`, `applyPublish`, …) | `features/forms/domain/forms.ts` |
| Builder shell (steps rail, step editor, question settings, preview) | `features/forms/components/FormBuilder.tsx` |
| Step/field editors and the document editor | `features/forms/components/Form{Step,Field}Editor.tsx`, `DocumentRequirement.tsx` |
| Question library UI | `features/forms/components/QuestionLibrary.tsx` |
| Applicant-facing renderer | `features/forms/components/FormRenderer.tsx` |
| Submitted answers | `features/forms/components/ResponseSections.tsx` |

`FormBuilder` and `FormRenderer` take **props**, never a `LoanProduct`: `LoanFormConfig` and `FormSubject` are the small shapes the renderer actually reads, and `LoanProduct`/`Borrower` satisfy them structurally. That is what lets a member form pass `loan={undefined}` and drop the loan step, the amount limits and every guarantor concept.

Loans keeps its own half in `features/loans/domain/loan-forms.ts` (the loan system steps, guarantor fields, `extractSubmission`, `newForm`) and `features/loans/types/form.types.ts` (which re-exports the shared vocabulary and adds `LoanApplicationForm` and `FormResponse`).

**Changing the builder changes both features.** Check the loan flow (`/apply/:slug` and the loan-type wizard) whenever you touch anything under `features/forms/`.

Imports into `features/forms` are **deep paths** (`@/features/forms/components/FormBuilder`), not a barrel: `features/forms/domain/forms.ts` is imported by `features/loans/domain/loan-forms.ts`, and a barrel would put a cycle through `LoanUi`.

## The question library is shared too

`questionLibraryService` owns one library per organization, used by every form builder. It used to live inside `LoanDataset`; it does not any more, precisely so a question saved while building a member form is available while building a loan form.

Rules live in `services/question-library.service.ts`: `create` trims and rejects a blank label, `duplicate` mints a new id and appends "(copy)", `archive` keeps the row. `useQuestionLibrary(orgId)` returns `{ items, api }`, where `api(canEdit, notify)` is the `QuestionLibraryApi` the builder components accept. Forms already using a question keep their own copy — the library is a source of questions, not a reference.

## Mandatory fields

`memberSystemSteps()` builds the form. **Full name** and **phone number** are `locked`: the builder cannot delete them or make them optional, and they are the two fields no member record can be created without. Email, gender, address, NIN and BVN are included but optional and removable.

The badge names the three standings, and the same labels appear in the loan form builder: **Required** (locked — cannot be deleted or made optional) versus **Suggested** (supplied by the platform, optional, and removable) versus **Custom** (added by the organization).

There is no branch or group question on the form. The group a new member joins is a **publishing setting** (`groupId`), chosen from the real groups in `features/groups`, because `CreateMemberInput.groupIds` needs at least one and an applicant cannot reasonably pick an internal group. The member's branch stays unset until someone edits the member.

## Joining

One setting, not a workflow builder. `MemberJoinMode` is `"Open"` or `"Approval"`:

| Mode | On submit |
| --- | --- |
| **Approval required** (default) | The application is stored as `Submitted`. An administrator approves or rejects it. Approving creates the member. |
| **Open joining** | The application is stored as `Approved` and the member is created immediately, with `reviewer: "Automatic (open joining)"`. |

`MEMBER_JOIN_MODES` carries the wording, so the publish dialog and the public page cannot drift apart.

## The link

`/join/:slug` short-circuits the app shell in `app.tsx` **before** the onboarding gate, like `/apply/:slug` and `/contribute/:slug`. Anyone can open it; no FinSquare account is needed.

`applicationLinkLive(form)` is the single gate: the form must be `Published`, `linkEnabled` must be true and there must be a published version. A closed link says so rather than 404-ing. `setLinkEnabled` takes the link down without touching the versions; `archiveForm` takes it down for good.

## Applications

Statuses are `Submitted`, `Under Review`, `Approved`, `Rejected`. `submit()` decides the first status from the join mode and allocates a reference (`MA-0001`); **the backend must allocate references** — the mock counts rows.

Validation at the boundaries is zod, in `schemas/member-application.schema.ts`: `memberApplicationFormSchema` (a form needs a name and a group), `applicationDecisionSchema` (a rejection needs a reason worth reading) and `joinSettingsSchema`. Manual add reuses the existing `schemas/member.schema.ts`. The domain repeats the reject-reason guard, because a service must not rely on its caller having validated.

`approve()` reads the form's `groupId`, builds the member with `toCreateMemberInput(application.values, groupId)` and records the new member id on the application. `reject()` requires a reason. Both refuse to decide an application twice. Submitted answers are stored keyed by field id, and `ResponseSections` renders them grouped by the step they were collected in, so what an administrator reads is exactly what was submitted.

Approved and open-joining members are created with `status: "Active"` and `accountStatus: "Created"` — a member record, not a login.

## Export

`formExportHtml(version)` turns a version into print-ready markup (steps, question labels, choices, document rules, a line to write on) with everything escaped, and `printDocument` opens it in a print window so the administrator can print it or save it as a PDF. The online form stays the primary route. The applications list exports through the usual `downloadCsv`/`printTable` pair.

## Pages

| View | Path | Notes |
| --- | --- | --- |
| `members` | `/members` | The list, with an **Applications** action carrying the waiting count and **Add member** opening the chooser |
| `member-applications` | `/members/applications` | The inbox: status tabs, search, form filter, CSV/PDF export |
| `member-application-detail` | `/members/applications/:id` | One application, its answers and the approve/reject decision |
| `member-application-forms` | `/members/forms` | Forms list, builder, publish dialog, link controls, question library |
| `/join/:slug` | — | The public form |

All three views are `secondaryAccess` entries with `nav: "members"`, so the sidebar stays one item.

**Routing trap:** `resolveView` must test the exact paths and the `/members/applications/:id` pattern **before** the `pathname.startsWith("/members/")` fallback, or `/members/applications` resolves to a member profile with `entityId: "applications"`.

## Permissions

`members.view_applications` (open the inbox and an application), `members.review_applications` (approve or reject), and `members.manage_forms` — organization-level and `organizationOnly` in the catalog, because building the form is organization configuration. The super-admin role and the Membership Officer role in `administrators.mock.ts` carry the first two; only the super-admin manages forms. **The mocks decide what the signed-in administrator can do** — a permission missing from `allPermissions` renders an empty page.

## Adding a custom question

Add question → set the label and field type → **Save to library** if it should be reusable. Reusable questions come back through **Add from library**. Steps are reorderable by drag or the arrow buttons; system steps are locked in place.

## Known gaps

- **No applicant portal.** The applicant submits and gets a reference; there is no login, no status tracking and no OTP.
- **No decision notification.** Approving or rejecting sends nothing — Communications targets members, and until the decision is made this person is not one.
- **Documents are mocked.** `UploadedFile` is a filename and a date; nothing is uploaded anywhere.
- **Nothing survives a page reload.** The mock repository is in memory and notifies subscribers, like members, wallet and contributions. A form you publish is live for the session only.
- **Manual add now persists.** It used to validate and fire a toast; it calls `membersService.create` instead, so a new member appears in the list immediately (`MemberRepository.subscribe` exists for this).
