# API integration

## Boundary

All HTTP calls go through `services/api/client.ts`. It provides:

- base URL handling;
- JSON request/response handling;
- request timeouts;
- normalized user-safe errors;
- a future insertion point for authentication and telemetry.

## Repositories

Important persisted domains define repository interfaces. Members currently provide:

- `MemberRepository`;
- `MockMemberRepository`;
- `ApiMemberRepository`;
- `membersService`, which selects the implementation using environment configuration.

To connect a real endpoint, update the API repository and mapper. Do not change components.

## DTO mapping

API DTOs use backend-oriented field names. Repository mappers convert them into stable frontend domain models. This allows the backend contract to evolve independently.

## Authentication

Add token acquisition through an auth provider and inject the resulting authorization header at the API client boundary. Never read authentication state inside feature repositories or components.

## Public links: what each payload tells the page

The three unauthenticated links each answer from their own endpoint. Only one of them currently names
the organisation, which is why the public pages show a community header where they can and omit it
where they cannot:

| Link | Endpoint | Names the organisation? |
| --- | --- | --- |
| `/apply/:slug` | `GET /public/forms/:token` | Yes — `mfiName` + `mfiLogo` (a data URL), mapped in `buildPublicForm` |
| `/contribute/:slug` | `GET /public/contributions/:slug` | Only indirectly: `contribution.recipient.accountName` when the recipient is the organisation account |
| `/join/:slug` | `GET /public/member-applications/:slug` | No. The page reads optional `mfiName`/`mfiLogo` (`PublicMemberApplicationForm`), so it shows the community as soon as the endpoint returns the same pair the loan form already does |

Do not fill the gap with the product mark presented as the community, and do not guess a name from a
slug or an id. `docs/ui-and-styling.md` § *Public links: who is asking* describes the shell.

## Cash endpoints

The cash ledger is the one part of the wallet with no deployed implementation yet. The frontend calls
the contract below and treats a `not_found` from either endpoint as "this backend cannot track cash
yet": `member-payments.service.ts` keeps the payment it already recorded and returns
`cashTracked: false` with the reason, and the UI says the payment was recorded but cash tracking is not
connected. Never fail the payment because the cash ledger is missing.

| Call | Endpoint | Body |
| --- | --- | --- |
| Recording a receipt | `POST /enterprise/wallet/cash/receipts` | `{ memberId, amount, items[], note? }` |
| Banking cash | `POST /enterprise/wallet/cash/deposits` | `{ amount, bankReference, note? }` |
| Reading receipts | `GET /enterprise/wallet/cash/receipts` | — |
| Audit trail | `GET /enterprise/wallet/audit` | — |

The backend owns the invariants the mock proves: the receipt is **one** transaction (member wallet
credit, each obligation debit, cash wallet credit, receipt, three audit rows), the cash wallet is
excluded from the bank balance, `receivedBy` is the authenticated administrator rather than a client
value, and a deposit can never exceed the cash held. `wallet.cash` must be re-checked server-side; the
frontend only hides the option. See `wallet.md` § *Cash on hand* and
`decisions/015-cash-on-hand.md`.
