# 2026-09-12 Create-group form

## Task

T8b. Let a signed-in user open `/groups/new`, create a group (name, optional description,
timezone, inclusive date range, daily window) and see the one-time invite link with a copy
action. Config-driven UX validation, distinct server error handling, all proven against MSW.

## Model

Opus 5.

## Files changed

New: `frontend/src/lib/uuid.ts`, `uuid.test.ts`, `frontend/src/lib/timezones.ts`,
`timezones.test.ts`, `frontend/src/features/groups/windowOptions.ts`, `windowOptions.test.ts`,
`validateGroupForm.ts`, `validateGroupForm.test.ts`, `createGroup.ts`, `CreateGroupForm.tsx`,
`CreateGroupForm.test.tsx`, `InviteLinkPanel.tsx`, `frontend/src/pages/CreateGroupPage.tsx`,
`CreateGroupPage.test.tsx`.

Changed: `frontend/src/lib/date.ts` and `date.test.ts` (added `daysInclusive`),
`frontend/src/features/groups/GroupsList.tsx` and `GroupsList.test.tsx`,
`frontend/src/pages/GroupsPage.tsx` and `GroupsPage.test.tsx`, `frontend/src/app/routes.tsx`
and `routes.test.tsx`, `frontend/src/mocks/fixtures.ts`, `frontend/src/mocks/handlers.ts`,
`docs/frontend/DECISIONS.md`.

## What I did

Preflight: `git log --oneline -5` was `4961f2f, 021ddd9, 371df35, d4efebd, 2728b1e`;
`git status --short` was `?? .DS_Store` only, so the tree was clear.

`lib/date.ts` gained `daysInclusive(start, end)`. The existing regex parse was extracted into a
private `toUtcMillis`, so `formatCalendarDate` and `formatDateRange` behave exactly as before.
Both endpoints are UTC midnights, so no daylight-saving transition can change the count.

`lib/uuid.ts` builds a version 4 UUID from `crypto.getRandomValues`, setting the version and
variant bits by hand. `crypto.randomUUID` is exposed only in a secure context and the
development VM serves plain HTTP (ARCHITECTURE R1), so it is absent exactly where the form has
to work; a test spies on it and asserts it is never called.

`lib/timezones.ts` is a pure `resolveTimezoneChoice(supported, browserZone)`. The component
supplies `Intl.supportedValuesOf("timeZone")` and the resolved zone. The contract default
`Europe/Stockholm` is added to the options when the runtime's list omits it, so the preselected
value is always selectable.

`features/groups/windowOptions.ts` derives the start options (0 to 1440 minus slot) and end
options (slot to 1440) from `config.slot_minutes`, labelled `HH:MM` with 1440 as "24:00".
`1440` is written as a constant in that file: it is the number of minutes in a day, a fact about
the clock rather than a configurable limit, so CLAUDE.md rule 7 does not apply to it.

`features/groups/validateGroupForm.ts` is pure and takes the form values plus `Config`. It
implements exactly the five rules the task lists and nothing else; the range message
interpolates `config.max_range_days`. Errors are keyed by GroupCreate property name so a server
`errors[]` entry lands in the same place as the equivalent UX error.

`features/groups/createGroup.ts` holds `toGroupCreate` and `createGroupMutationOptions`. The
body always carries `timezone`, sends the minutes as numbers and omits `description` when blank.
The key travels through openapi-fetch's typed `params.header["Idempotency-Key"]`, so a contract
rename is a compile error rather than a dropped header. On success every query whose key starts
with `"groups"` is invalidated. The response is deliberately *not* seeded into the cache,
because it carries `invite_url`.

`CreateGroupForm.tsx` is a native form; every control has a visible label. UX errors appear on
submit with `aria-invalid` and `aria-describedby`, and block the request. The idempotency memo is
a `useRef` holding the serialized body and its key: an identical resubmission reuses the key, any
edit mints a new one. A second `useRef` guards against a double click landing before React has
re-rendered the disabled button, since `isPending` updates asynchronously. Server handling
switches on kind and code only: `validation_failed` splits `errors[]` between fields and a
form-level list, `range_too_long` shows the configured limit at the end-date field, everything
else goes to `ApiErrorNotice` whose retry resends the last attempt with the same key. `title`,
`detail` and `status` are never rendered.

`InviteLinkPanel.tsx` replaces the form on success: heading, group name, a read-only "Invite
link" input, the one-time wording, a Copy button and a link to `/groups`. Copy uses
`navigator.clipboard.writeText` when present and falls back to selecting the field and showing
"Press Ctrl+C or Cmd+C to copy the link." when it is missing or rejects. `invite_url` lives only
in component state.

`GroupsList` previously returned the empty state before the refresh-error notice was computed, so
a failed background refresh on an empty list showed nothing. The notice computation now happens
first and the empty branch renders it too, alongside a "Create a group" link. A regression test
was shown failing first.

Routing gained `groups/new` and `GroupsPage` gained the link. Mocks gained a default
`POST /groups` handler returning 201 with a `GroupWithInvite` echoing the request body, built by
a new `createdGroupFixture` helper; its `invite_url` is
`<origin>/join/5kW8rFj4Qz7X?invite=<32 chars>`, the slug matching the contract's base58 pattern.

## Discrepancies noticed

- The contract types `Problem.errors[].field` as a bare `string` and does not specify its
  format: a bare property name, a dotted path such as `body.name`, or something else. The form
  therefore treats only an exact match against a `GroupCreate` property name as a field error and
  shows everything else in a form-level list, so nothing is silently dropped either way. Worth
  settling with Alexander so the two sides agree on a spelling.
- The contract has no error code for exceeding `max_groups_per_user`. That case falls to the
  generic `ApiErrorNotice` branch, which offers a retry that cannot succeed. Already tracked by
  Adrian with Alexander.
- Step 12 of the task assumed `fixtures.ts` had `max_range_days: 31`. It is `13`, and nothing in
  `src/` asserts on the value, so it was left alone. The validation tests use the fixture value
  rather than a literal, so they follow it if it changes.
- `GroupCreate.window_start_minute` has `maximum: 1410` while `Group.window_start_minute` has
  `maximum: 1440`. The generated start options stop at 1410, so this is consistent, but the
  asymmetry looks unintentional in the contract.

## Assumptions made

- `GroupsPage.test.tsx` was not in the task's scope list, but adding the `<Link>` to
  `GroupsPage` breaks it, because it renders the page with no router context. Adrian approved
  wrapping that test's render in a `MemoryRouter`. No assertion was removed or weakened; one was
  added for the link. The same wrap was needed in `GroupsList.test.tsx`, which was in scope.
- `description` is omitted from the body when blank rather than sent as `""` or `null`: the
  create schema has no null case and an empty string carries no meaning.
- A `validation_failed` problem with no usable `errors[]` shows a single form-level "Please check
  the form and try again.", rather than failing silently.
- An edit to any field clears both the UX errors and the server failure for the previous body,
  because stale feedback about a body that is no longer on screen is misleading.

## Follow-ups for later

- Settle the `errors[].field` spelling with the backend and tighten the matching once it is
  specified.
- `max_groups_per_user` needs an error code, or the frontend needs a defined generic behaviour
  for it.
- There is no auth layer yet, so `/groups/new` is reachable while signed out; against the real
  API it will return 401 and show the sign-in message. The route needs a guard once auth lands.
- The invite panel has no "generate a new link" action; rotation is `PATCH /groups/{slug}` with
  `rotate_invite_token` and belongs to a later task.

## Commands to verify

From `frontend/` on Node 24:

    npm ci
    npm run typecheck
    npm run lint
    npm run format:check
    npm test
    npm run build
    npm run check:api
    grep -rln "mocks" src
    grep -rnE "randomUUID\(|Math\.random|localStorage|sessionStorage" src/features src/lib src/pages
    grep -rn "new Date(" src/lib src/features

By hand: `npm run dev:mock`, then Your groups, then Create a group.
