# 2026-09-14 — Contract and architecture reconciliation (T16)

## Task

Bring `contracts/openapi.yaml` and `docs/ARCHITECTURE.md` into line with every decision recorded
in `docs/coordination/frontend-backend.md` (items C1 to C9), regenerate the frontend's types from
the edited contract, and drop the runtime narrowing that only existed because `patchGroup` used to
answer `Group`.

## Model

Opus 5.

## Files changed

- `contracts/openapi.yaml` — the enumerated edits below, and nothing else.
- `docs/ARCHITECTURE.md` — D11, invariant 9, sections 6.1, 6.3, 7.4 and 10.
- `docs/coordination/frontend-backend.md` — statuses and resolution lines for C1 to C9.
- `frontend/src/api/generated/schema.d.ts` — regenerated, never hand-edited.
- `frontend/src/features/groups/RotateInviteAction.tsx` — narrowing removed.
- `frontend/src/features/groups/groupMutations.ts` — the PATCH response type follows the contract.
- `frontend/src/api/errors.ts`, `frontend/src/mocks/fixtures.ts` — forced by the regeneration, see
  "Assumptions made".

## What I did

### Preflight

`git status --short` listed only `?? .DS_Store`, so the tree was clean enough to start.
Baseline `npx --yes @redocly/cli@latest lint contracts/openapi.yaml`: exit 0, 5 warnings
(missing licence URL, an `http://` server URL, and three operations with no 4xx response —
`getConfig`, `deleteSession`, `getFlags`). Baseline frontend suite: 46 files, 340 tests, all
passing.

### Contract changes, with the line each landed on

Line numbers are in the edited file.

| Step | Change | Line(s) |
|---|---|---|
| 2a | `group_limit_reached`, `proposal_limit_reached`, `calendar_source_limit_reached` in `ErrorCode` | 889–891 |
| 2a | `internal_error` in `ErrorCode` | 898 |
| 2b | `patchGroup` 200 schema `Group` → `GroupWithInvite` | 362 |
| 2c | `IfNoneMatch` reusable parameter, beside `IfMatch` | 795–799 |
| 2c | `IfNoneMatch` referenced from `getGroup` | 330–331 |
| 2c | `IfNoneMatch` referenced from `getAvailability` | 448–449 |
| 2d | `409` on `createGroup` | 319 |
| 2e | `401` on `deleteSession` | 112 |
| 2e | `429` on `createSession` | 104 |
| 2f | `Idempotency-Key` on `uploadCalendarSource` | 203–204 |
| 2f | `Idempotency-Key` on `deleteCalendarSource` | 234–235 |
| 2f | `Idempotency-Key` on `refreshCalendarSource` | 248–249 |
| 2f | `Idempotency-Key` on `deleteGroup` | 373–374 |
| 2f | `Idempotency-Key` on `removeMember` | 430–431 |
| 2f | `Idempotency-Key` on `deleteProposal` | 582–583 |
| 2f | `Idempotency-Key` on `putMyVote` | 599–600 |
| 2f | `Idempotency-Key` on `deleteMyVote` | 619–620 |
| 2f | `Idempotency-Key` on `unconfirmGroup` | 657–658 |
| 2g | `401` on `patchGroup` | 363 |
| 2g | `401` on `deleteGroup` | 377 |
| 2g | `401` on `listMembers` | 418 |
| 2g | `401` on `removeMember` | 434 |
| 2g | `401` on `getAvailability` | 459 |
| 2g | `401` on `getMyAvailability` | 476 |
| 2g | `401` on `putMyAvailability` | 502 |
| 2g | `401` on `getSuggestions` | 529 |
| 2g | `401` on `listProposals` | 548 |
| 2g | `401` on `createProposal` | 568 |
| 2g | `401` on `deleteProposal` | 586 |
| 2g | `401` on `putMyVote` | 612 |
| 2g | `401` on `deleteMyVote` | 623 |
| 2g | `401` on `confirmGroup` | 648 |
| 2g | `401` on `unconfirmGroup` | 665 |
| 2h | `Config` required: five new keys | 937–938, 940–942 |
| 2h | `Config` properties: five new keys | 956–957, 959–961 |
| 2i | `Problem.errors[].field` description | 921 |
| 2j | `limit` and `cursor` on `getMyBusy` | 274–275 |

**2a, the ordering I inferred.** The enum is ordered by the HTTP status the code is served with,
matching the order of the table in ARCHITECTURE 7.4: 400, 401, 403, 404, 409, 412, 422, 429, 502,
503. So the three limit codes go into the 409 run, immediately after `member_limit_reached` and
before `idempotency_key_reuse`, and `internal_error` (500) goes between `rate_limited` (429) and
`ics_fetch_failed` (502).

**2f, which operations already had `Idempotency-Key`.** `patchMe`, `createCalendarSource`,
`createGroup`, `joinGroup`, `patchGroup`, `putMyAvailability`, `createProposal` and
`confirmGroup`. `createCalendarSource` was the one the task said to check: it already had it, so
it was not touched. The other nine in the task's list were all missing it and all got it.

**2g, the operations that gained a `401`.** groups tag: `patchGroup`, `deleteGroup`,
`listMembers`, `removeMember`. scheduling tag: `getAvailability`, `getMyAvailability`,
`putMyAvailability`, `getSuggestions`, `listProposals`, `createProposal`, `deleteProposal`,
`putMyVote`, `deleteMyVote`, `confirmGroup`, `unconfirmGroup`. Fifteen in all. `listGroups`,
`createGroup`, `getGroup` and `joinGroup` already had one. The export tag (`getEventIcs`,
`getGroupFeed`) is outside the two tags the task named and was left alone.

**2h, the section 8 comparison.**

| Section 8 key | In `Config` before? | Action |
|---|---|---|
| `slot_minutes` | yes, required | none |
| `max_range_days` | yes, required | none |
| `max_members` | yes, required | none |
| `max_groups_per_user` | yes, required | none |
| `max_proposals_per_group` | yes, required | none |
| `max_calendar_sources` | yes, required | none |
| `max_ics_bytes` | yes, required | none |
| `max_ics_events` | yes, required | none |
| `min_duration_minutes` / `max_duration_minutes` | yes, required | none |
| `ics_poll_interval_hours` | no | added, integer, required |
| `manual_refresh_cooldown_seconds` | no | added, integer, required |
| `reminder_lead_hours` | yes, required | none |
| `access_token_ttl_seconds` | no | added, integer, required |
| `refresh_token_ttl_days` | no | added, integer, required |
| `magic_link_ttl_seconds` | no | added, integer, required |
| `poll_interval_seconds` | yes, required | none |
| (`build_sha`) | yes, optional | not in section 8; left optional and untouched |

Section 8 says the whole table is "served verbatim", so all five additions are required. Every
value in the table is an integer, so every new property is `type: integer` with the section 8
value as its example. Property order follows the section 8 table.

**2j.** `/me/busy` returned `next_cursor` but accepted no cursor. Adrian was asked and chose
"add `limit` and `cursor`", referencing the existing `Limit` and `Cursor` parameters, so the
operation matches `listGroups` and ARCHITECTURE 7.1 ("Collections ... accept `limit` and
`cursor`"). The backend must now honour both.

### Architecture changes

- **D11** — "SPA and API on different origins, CORS allow-listed per environment" became "served
  from a single origin and routed by path", with the CORS consequence in the consequence column.
- **Invariant 9** — now states that the frontend polls conditionally, so a mutation that does not
  increment `version` answers 304 and produces a silently stale view; a missed increment is a
  correctness bug.
- **6.1** — the sequence diagram's mail link carries `&redirect=<redirect_path>`, and two new
  paragraphs record the server-side validation of `redirect_path` before it enters the mail and
  the 30-second refresh-reuse grace window.
- **6.3** — `?duration=60` became `?duration_minutes=60`, and "every 15 seconds" became "at the
  interval served as `poll_interval_seconds` by `GET /config`".
- **7.4** — four rows added for the four new codes (see "Assumptions made").
- **10** — a paragraph on the single-origin path routing, the frontend's `/api` proxy to
  `BACKEND_ORIGIN` and the absence of CORS; `CORS_ALLOWED_ORIGINS` replaced by `BACKEND_ORIGIN`
  in the required environment variables.

### Frontend

`npm run generate:api` from `frontend/`, twice; the second run left `schema.d.ts` byte-identical
(same md5). `npm run check:api` exits 0.

`RotateInviteAction.tsx` lost `readInviteUrl` and its jsdoc and now reads `group.invite_url`
directly. For that to typecheck, `patchGroupMutationOptions` in `groupMutations.ts` had to
`unwrap<GroupWithInvite>` rather than `unwrap<Group>`, which is what the contract now says the
operation returns; that is part of the same narrowing removal, not a separate change. No test file
was edited and the rotation path stays covered by `GroupDetailPage.test.tsx`.

## Discrepancies noticed

- `GroupWithInvite` marks `invite_url` **required**, but its own description says it is returned
  "on creation and on rotation only, never on subsequent reads". Now that `patchGroup` answers
  `GroupWithInvite`, the contract claims every `PATCH /groups/{slug}` returns an `invite_url`,
  including a plain rename. That is almost certainly not intended. Fixing it means either making
  `invite_url` optional in `GroupWithInvite` or giving `patchGroup` its own schema, and neither is
  in the list of edits this session was permitted to make, so it was left alone. Flagged as a
  follow-up.
- ARCHITECTURE D7 still says "Live co-editing is ETag polling every 15 s", which now contradicts
  6.3. The task scoped the polling change to 6.3, so D7 was not touched. Flagged as a follow-up.
- The Redocly warning count fell from 5 to 4: `deleteSession` now has a 4xx response. The
  remaining four (`getConfig` and `getFlags` without a 4xx, the missing licence URL, the `http://`
  development server URL) are pre-existing and unrelated.
- `contracts/openapi.yaml` still carries a large amount of flow-style YAML whose descriptions are
  unquoted. Nothing new was broken, but any future description containing a comma must be quoted;
  the new `IfNoneMatch` and `field` descriptions are quoted for that reason.

## Assumptions made

- **Two files outside the stated frontend scope had to change.** Regenerating the types broke
  `src/api/errors.ts` (its `Record<ErrorCode, true>` map is deliberately exhaustive, so four new
  enum members are four compile errors) and `src/mocks/fixtures.ts` (the `Config` fixture is typed
  against the schema, so five new required keys are five compile errors). Both are mechanical,
  unavoidable consequences of the authorised contract change, and leaving them broken would have
  failed `typecheck`, `test` and `build`. They were fixed minimally: four `true` entries, and five
  fixture values chosen deliberately unlike section 8, as the fixture's own comment requires.
- **ARCHITECTURE 7.4 was edited although step 3 did not name it.** C6 and C8 both list section 7.4
  under "Documents affected", and 7.4 calls itself "exhaustive for v1", so adding four enum values
  without adding four rows would have made the document wrong. Four rows added, nothing else in
  that section touched.
- C5's `version`-increment point is recorded in invariant 9 but honouring it is backend work, so
  C5 is marked resolved on the documentation side only, and the remaining obligation is named in
  its response line.

## Follow-ups for later

- Decide whether `invite_url` should be optional on `GroupWithInvite`, or whether `patchGroup`
  needs its own response schema. Until then the contract overstates what a non-rotating `PATCH`
  returns. Needs Adrian, and a fresh permission to edit the contract.
- Reconcile D7's "every 15 s" with 6.3's `poll_interval_seconds`.
- Backend: `GET /me/busy` must now accept and honour `limit` and `cursor`.
- Backend: the five new `Config` keys are required, so `GET /config` must serve all of them.
- Backend: C4 (conformant problem bodies) and C9 (compose and Kubernetes wiring) remain `agreed`
  and unimplemented.

## Commands to verify

From the repository root:

```
npx --yes @redocly/cli@latest lint contracts/openapi.yaml   # exit 0, 4 warnings
```

From `frontend/`, on Node 24 (`.nvmrc`):

```
npm run generate:api    # exit 0; a second run leaves schema.d.ts byte-identical
npm run check:api       # exit 0
npm run typecheck       # exit 0
npm run lint            # exit 0
npm run format:check    # exit 0
npm test                # exit 0, 46 files, 340 tests, unchanged from the baseline
npm run build           # exit 0
```
