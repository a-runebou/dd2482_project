# Frontend and backend coordination

Maintained by Adrian. This file collects everything the frontend workstream needs from, or wants
to agree with, the backend workstream.

Alexander: read it whenever convenient. To respond, fill in the Response line of an item and set
its status, or tell Adrian and he will. Nothing in this file changes `contracts/openapi.yaml` or
`docs/ARCHITECTURE.md` by itself; an agreed item is carried out as a normal change to those files.

Statuses: `open`, `agreed`, `rejected`, `resolved`. Agents read this file for context but never
edit it.

## Index

| ID | Topic | Status | Blocks on the frontend |
|---|---|---|---|
| C1 | Origin topology and CORS | open | API base URL for the deployed image |
| C2 | Where the user lands after sign-in | open | Invite join flow |
| C3 | Concurrent refresh and reuse detection | open | Session refresh |
| C4 | Error bodies must match the Problem schema | open | Nothing; non-conforming errors degrade to a generic failure |
| C5 | Minor contract and documentation inconsistencies | open | Nothing |
| C6 | No error codes for resource limits | open | Nothing; limit errors show a generic failure |

---

## C1. Origin topology and CORS

- Raised: 2026-09-11
- Status: open
- Contract change: none
- Documents affected: ARCHITECTURE.md D11 and section 10

Problem. D11 places the SPA and the API on different origins, but nothing specifies the CORS
details that requires. Section 4 already draws a single ingress in front of both containers.

Proposal. Serve both from one origin, routed by path: `/api` to the backend, everything else to
the frontend. In development the Vite dev server proxies `/api` to `localhost:8000`, which is
frontend work.

Effects:

- No CORS at all.
- The refresh cookie is first-party, so `SameSite=Lax` works without further thought.
- `ETag` and `Retry-After` are readable by JavaScript without expose headers.
- The frontend keeps its relative `/api/v1` base URL, with no build-time or runtime configuration.

Backend change: none required. `CORS_ALLOWED_ORIGINS` can stay for flexibility.

If separate origins are preferred instead, the backend must send:

- `Access-Control-Allow-Origin` with the exact origin, never `*`
- `Access-Control-Allow-Credentials: true`
- `Access-Control-Expose-Headers: ETag, Retry-After`
- `Access-Control-Allow-Headers: Authorization, Content-Type, If-Match, If-None-Match, Idempotency-Key`

The two origins must also be same-site, or the `Lax` refresh cookie is never sent.

Frontend meanwhile: proceeds against mocks.

Response:

---

## C2. Where the user lands after sign-in

- Raised: 2026-09-11
- Status: open
- Contract change: none with the proposal, optional with the alternative
- Documents affected: ARCHITECTURE.md section 6.1

Problem. `POST /auth/magic-link` accepts `redirect_path`, but nothing returns it. The mail link in
section 6.1 is `/auth/callback?token=...`, and `SessionResponse` has no redirect field. After
signing in from an invite link, the frontend cannot send the user back to `/join/{slug}`, which
section 6.5 step 2 relies on.

Proposal. The mail link becomes
`{PUBLIC_APP_URL}/auth/callback?token=...&redirect=<redirect_path>`, validated server-side against
the existing `redirect_path` pattern before it is written into the mail. The frontend validates it
again as a relative path before navigating. Only section 6.1 changes.

Alternative. Store `redirect_path` with the magic link and return it as an optional field of
`SessionResponse`. This is an OpenAPI change.

Frontend meanwhile: the sign-in request page proceeds; the post-sign-in redirect waits.

Response:

---

## C3. Concurrent refresh and reuse detection

- Raised: 2026-09-11
- Status: open
- Contract change: none
- Documents affected: ARCHITECTURE.md section 6.1

Problem. Rotation with reuse detection revokes the whole token family whenever the same refresh
cookie is presented twice. That happens legitimately in three situations:

- two open tabs refreshing at the same moment;
- React's development-mode double effects;
- a page reload that discards the response carrying the rotated cookie.

In each case the user is silently signed out everywhere.

Frontend mitigation. One refresh at a time per tab, coordinated across tabs with the Web Locks
API. This cannot cover a lost response.

Proposed backend change. A short grace window, for example 30 seconds, during which reuse of the
immediately preceding token returns `401 unauthenticated` without revoking the family. Outside
the window, revoke as specified. Trade-off: theft detection is weaker inside the window.

Frontend meanwhile: the in-memory token store and the single-flight logic proceed; refresh does
not ship until this is agreed.

Response:

---

## C4. Error bodies must match the Problem schema

- Raised: 2026-09-11
- Status: open
- Contract change: possibly, see the last point
- Documents affected: none

The frontend treats a response as a problem only when all of the following hold:

- the Content-Type is `application/problem+json`;
- the body has `type`, `title`, `status` and `code`;
- `code` is a member of `ErrorCode`.

Anything else is shown as a generic failure, and the specific handling for that code never runs.
FastAPI's defaults meet none of these conditions. Watch in particular:

- Request validation errors, which FastAPI returns as 422 with a `detail` list. The contract says
  `400 validation_failed`; 422 is reserved for `slot_not_in_window`, `range_too_long` and
  `ics_parse_failed`.
- Unknown routes (404) and wrong methods (405).
- Unhandled exceptions.

Contract gap: `ErrorCode` has no code for an internal server error. The frontend copes, but we
should decide what a 500 body carries.

Frontend meanwhile: unaffected; the schemathesis run in the contract CI job should catch
violations.

Response:

---

## C5. Minor contract and documentation inconsistencies

- Raised: 2026-09-11
- Status: open
- Contract change: small, optional
- Documents affected: `contracts/openapi.yaml`, ARCHITECTURE.md section 6.3

None of these blocks the frontend.

- Operations that return 304 do not declare `If-None-Match`.
- Section 7.1 says every mutation accepts `Idempotency-Key`, but `putMyVote`, `deleteMyVote`,
  `deleteGroup`, `deleteProposal`, `removeMember`, `unconfirmGroup` and the three calendar-source
  mutations do not declare it.
- `/me/busy` returns `next_cursor` but accepts no `cursor` parameter.
- `Config` omits keys that section 8 says are served verbatim, for example
  `manual_refresh_cooldown_seconds`.
- `401` is not listed on most group and scheduling operations.
- Section 6.3 uses `?duration=60`; the contract uses `duration_minutes`.

Response:

---

## C6. No error codes for resource limits

- Raised: 2026-09-11
- Status: open
- Contract change: yes, small
- Documents affected: `contracts/openapi.yaml`, ARCHITECTURE.md section 7.4

Problem. Section 8 defines `max_groups_per_user`, `max_proposals_per_group` and
`max_calendar_sources`, but `ErrorCode` has a code only for the member limit
(`member_limit_reached`). When a user exceeds one of the other three, the frontend cannot tell
them why. Separately, `createGroup` declares no 409 response although it accepts
`Idempotency-Key`, whose reuse with a different body answers `409 idempotency_key_reuse`.

Proposal. Add `group_limit_reached`, `proposal_limit_reached` and
`calendar_source_limit_reached`, each 409, and declare 409 on `createGroup`. A single generic
`limit_reached` code would also work, but it tells the user less.

Frontend meanwhile: these cases show a generic failure.

Response: