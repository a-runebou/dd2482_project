# 2026-09-13 — Conditional requests and grid polling (T15b)

## Task

Round T15b: make the API layer treat `304 Not Modified` as a distinct, non-error outcome, and
make the availability grid poll for other members' changes while it is visible, without ever
discarding an unsaved selection.

## Model

Opus 5.

## Files changed

New:

- `frontend/src/api/conditional.ts`, `conditional.test.ts`
- `frontend/src/features/availability/AvailabilityBoard.polling.test.tsx`

Changed:

- `frontend/src/api/errors.ts` — extracted `normalizeThrown`, which `unwrap`, the conditional
  read and `groupQueries` now share. No behaviour change; `errors.test.ts` is untouched.
- `frontend/src/features/availability/availabilityQueries.ts` — the matrix query reads
  conditionally and caches `{ data, etag }`.
- `frontend/src/features/availability/AvailabilityBoard.tsx` — polling, the three new notices,
  and the guard that stops a read seeding over unsaved work.
- `frontend/src/features/availability/availabilityModel.ts`, `availabilityModel.test.ts` —
  `orphanedSlots`, a pure function, plus four cases for it.
- `frontend/src/features/availability/availabilityErrors.ts` — wording for the three notices.
- `frontend/src/features/groups/groupQueries.ts` — the group read is conditional too.
- `frontend/src/mocks/handlers.ts`, `fixtures.ts` — `If-None-Match` honoured, a way to advance
  the stored version, a one-second polling config fixture.
- `docs/frontend/DECISIONS.md` — F23.

## What I did

**Where conditional reads live.** In `src/api/conditional.ts`, beside `unwrap` rather than
inside it and not in client middleware. `unwrap` promises one thing — the body, or a thrown
`ApiError` — and "unchanged" is a third answer that cannot go into that signature without
making every existing caller handle an outcome it never asked for. Middleware was the other
candidate and is worse: it would have to guess which requests are conditional, and the ETag of
a `200` would have to leave through a side channel, because openapi-fetch hands the caller a
parsed body rather than the response. The helper instead takes the caller's validator and a
`send` callback that receives the headers to merge, so the caller keeps its path and parameters
and never touches a raw `Response`.

`conditionalRead` checks `response.status === 304` *before* `response.ok` — which is false for
a 304 — so it can never be classified as `unexpected`; everything else (problem body, unknown
code, failed fetch) behaves exactly as `unwrap` does. `cachedConditionalRead` is the same thing
in the shape a query function wants, and on a 304 it returns the *identical* previous object,
so TanStack Query sees no new reference and nothing derived from the matrix recomputes. A 304
with nothing cached is `unexpected`: a validator that was never sent cannot have matched.

**Polling.** TanStack Query's own `refetchInterval` with `refetchIntervalInBackground: false`,
fed `poll_interval_seconds` from `GET /config` (never a literal). That option is precisely what
stops the fetch while `document.visibilityState` is `hidden` and what refetches once when it
becomes visible again, through the same focus manager, so no hand-rolled timer or
`visibilitychange` listener was written. The interval is `false` while a save is in flight,
which both keeps a poll from overlapping the write and makes the invalidation's refetch the
only one that follows a save, because switching the interval back on restarts its timer.

**Unsaved work.** Three separate hazards, three separate answers: a stored selection arriving
while there are unsaved changes is not applied and not marked as seeded, so it seeds later
after a save or a discard (this also fixes an existing hazard, where a refetch on window focus
would have replaced an in-progress selection); another member's answer landing mid-edit sets a
flag that clears itself when nothing is unsaved; and a selected slot that leaves the server's
vector is kept in state and named in a notice.

**Poll failures.** Silent. `ApiErrorNotice` is still shown only when there is no matrix at all.
When a poll fails with data already on screen, the data stays and one quiet line says the view
may be out of date. It appears only after the retry the query client already performs for a
`network` error has also failed, and it clears on the next successful poll.

## Discrepancies noticed

- `contracts/openapi.yaml` documents `304` on `GET /groups/{slug}` and
  `GET /groups/{slug}/availability` and tells the client to poll with `If-None-Match`, but
  declares no `If-None-Match` request parameter, so the header cannot be sent through
  openapi-fetch's typed `params.header` and goes through the untyped `headers` option instead.
  Nothing is blocked; a contract change adding the parameter would make it type-checked. Not
  made here — the contract is read-only for this round.
- ARCHITECTURE 6.3 still says "every 15 seconds" in prose while section 8 and the contract make
  the interval `poll_interval_seconds` from `GET /config`. The code follows the latter.
- The mock's member-removal handler changed `member_count` without moving `version`. Once the
  group read became conditional, that would have answered `304` for a group whose body really
  had changed, so the handler now bumps the version with it.
- "Mark the affected cells" for a slot that has left the server's vector is not literally
  possible: the grid renders the server's vector (F22), so those cells no longer exist. They
  are named in a notice instead, with their local date and time.

## Assumptions made

- "Persistent failure" means a poll that failed after the query client's own retry, which for a
  `network` error is two attempts. A single dropped request therefore never reaches the user.
- The caller's own selection (`GET .../availability/me`) is not polled. ARCHITECTURE 6.3 names
  only the matrix, and the caller's own rows change only through this tab's save.

## Follow-ups for later

- Consider adding an `If-None-Match` parameter to the two conditional GETs in the contract, so
  the header is typed rather than passed through `headers`.
- ARCHITECTURE 6.3's "every 15 seconds" could be reworded to point at `poll_interval_seconds`.
- The busy-blocks query is still unconditional; `GET /me/busy` has no ETag in the contract.

## Commands to verify

From `frontend/` on Node 24:

- `npm run typecheck` — exit 0
- `npm run lint` — exit 0
- `npm run format:check` — exit 0
- `npm test` — 340 tests in 46 files, 17.6 s wall clock (318 in 44 before this round)
- `npm run build` — exit 0
- `npm run check:api` — exit 0
- `grep -rnE "localStorage|sessionStorage" src/api src/features` — only
  `src/features/auth/storageGuard.test.ts`
- `grep -rn "15" src/features/availability` — only `bg-accent/15` opacity classes and a test
  timestamp; no interval literal
- By hand: `npm run dev:mock`, open the grid in two tabs, save in one, watch the other's
  heatmap catch up within the polling interval.
