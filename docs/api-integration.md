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
