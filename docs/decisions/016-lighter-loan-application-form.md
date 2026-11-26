# 016 — A lighter loan application form

## Context

The loan application form asked for more than the product needs. Identification type and number,
emergency contact details and a per-guarantor guarantee amount were all marked required, and the
organisation could not remove any of the optional details FinSquare supplied. Two smaller problems came
with it: **Requested duration** was a free number, which the loan type then rejected if it fell outside the
range it allows; and the builder's badges read *Required by FinSquare* / *Included by FinSquare* /
*Added by organization*, which told the reader who had supplied a field rather than what they could do
with it.

## Decision

**Only the facts a loan cannot be processed without are locked.** First name, last name, phone number,
date of birth, and the four address parts (street, city, LGA, state). Everything else FinSquare supplies —
email, gender, and the guarantor's optional details — is **Suggested**: present by default, optional, and
removable.

**Identity and emergency contacts leave the loan form.** Identification is not needed to open a loan
application, and the emergency contact pair was never used by any downstream step. The guarantor keeps its
own optional identification, because a guarantor is a person the organisation may need to trace.

**Duration is a picker built from the loan type.** A loan type already stores `minDuration`–`maxDuration`
in a unit; the form renders exactly that range. The stored answer stays a numeral, so the existing
min/max validation and `num()` mapping are unchanged, and the field keeps `type: "number"` in the schema —
only its presentation differs.

**A guarantor has no amount.** The form no longer asks for one; each guarantor stands behind the whole
loan, so `extractSubmission` writes the loan amount onto every guarantor. The Amount column on the
application detail keeps a truthful value.

**The builder is organised around what you can do.** Badges are **Required** (locked: cannot be deleted or
made optional), **Suggested** (platform-supplied, optional, removable) and **Custom** (the organisation's
own). Anything not Required carries a delete icon. Every question can be reordered within its step, and
every step except Review can be reordered — Review is the submit step and stays last.

## Consequences

- The member application form inherits the same builder rules. That matches what its own documentation
  already promised: full name and phone are locked and everything else is removable. It was previously
  impossible to delete a Suggested member field, because the delete action was hidden for every system
  field.
- Locked fields remain the only undeletable ones, so a submitted application can always produce a borrower
  record.
- Name and address are collected in parts, but older published versions carry `fullName`/`address`.
  `applicantName` and `composeAddress` read the parts and fall back to the legacy keys, so a form published
  before this change still maps correctly. Published versions stay immutable; editing clones to a draft.
- The public application payload is unchanged in shape: the address parts are composed into the single
  `address` string the backend already accepts, and `firstName`/`lastName` were already separate there.
- `nin` therefore resolves to `undefined` on new forms. The legacy `idType`/`idNumber` path remains so old
  published forms still send it.

## Alternatives rejected

- **Keep identification on the personal step and make it optional.** It is not needed to process a loan,
  and an optional field on a four-field identity block invites partial answers.
- **A free number for duration with better validation.** The loan type already knows its range; making the
  applicant guess it and rejecting afterwards is worse than offering the range.
- **A separate cash/split guarantee amount per guarantor.** Removed by product decision; the amount is a
  property of the loan, not of each guarantor's promise.
- **Blocking step reordering entirely to protect the review step.** Only Review needs protecting, so it is
  pinned rather than freezing every step.
