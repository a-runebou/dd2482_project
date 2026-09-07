# Groups list (T8a)

## Task

Signed-in users can open `/groups` and see their groups with date range, state, role and member
count, page through them with "Load more", and get distinct accessible loading, empty and error
states, all proven against MSW. Round T8a of the frontend workstream; a plan was written first,
then the human supplied amendments overriding several parts of it before inline execution.

## Model

Opus (plan), Sonnet 5 (inline execution of the amended plan).

## Files changed

- New: `frontend/src/lib/date.ts`, `frontend/src/lib/date.test.ts`
- New: `frontend/src/components/ApiErrorNotice.tsx`, `frontend/src/components/ApiErrorNotice.test.tsx`
- New: `frontend/src/features/groups/queries.ts`, `frontend/src/features/groups/GroupsList.tsx`,
  `frontend/src/features/groups/GroupsList.test.tsx`
- New: `frontend/src/pages/GroupsPage.tsx`, `frontend/src/pages/GroupsPage.test.tsx`
- Modified: `frontend/src/pages/HomePage.tsx` (added a link to `/groups`, kept the existing
  heading)
- Modified: `frontend/src/app/routes.tsx` (added the `/groups` route)
- Modified: `frontend/src/app/routes.test.tsx` (appended two routing cases only; the two
  pre-existing cases are untouched and still pass)
- Modified: `frontend/src/mocks/fixtures.ts` (added `ownerGroupFixture`, `memberGroupFixture`,
  `confirmedGroupFixture`, `roleUnknownGroupFixture`, `groupsPage1Fixture`, `groupsPage2Fixture`,
  `validationFailedProblem`)
- Modified: `frontend/src/mocks/handlers.ts` (added the default two-page `GET /groups` handler)
- Modified: `docs/frontend/DECISIONS.md` (appended F11, F12, exact wording as specified)
- A plan file was written to `docs/superpowers/plans/2026-09-11-groups-list.md` during planning
  and then **deleted** on the human's instruction before execution, since the task prompt forbids
  plan files in the repository. Its content lives only in the session transcript.

## What I did

1. Preflight: `git log --oneline -10` and `git status --short` showed a clean tree (only
   `.DS_Store` untracked) and no commits touching `backend/` or `infra/`, so I proceeded.
2. Wrote a plan, got human amendments overriding several parts of it, deleted the plan file, and
   executed the amended version inline task-by-task with tests written and shown failing before
   each implementation (see Discrepancies for two exceptions).
3. `formatCalendarDate`/`formatDateRange` in `src/lib/date.ts` parse with a regex and throw on a
   malformed date, per the amendment (the originally planned `split("-").map(Number)` approach
   does not type-check under `noUncheckedIndexedAccess`). A small `requireGroup` helper narrows
   the regex capture groups from `string | undefined` without a non-null assertion or cast.
4. `GroupsList` branches on whether `query.data` is defined, not on `isFetchNextPageError`, per
   the amendment: pending → status; no data and an error → only the notice; data present → always
   render the list, with a below-the-list notice for `isFetchNextPageError` (retry =
   `fetchNextPage`) or `isRefetchError` (retry = `refetch`), and "Load more" hidden whenever a
   notice is shown.
5. `GroupsList.test.tsx` uses a counting `GET /groups` handler in every case (including the empty
   state, the 401 case, the roles case, and a new background-refetch-error case that invalidates
   the `["groups", "list"]` query key against a `service_unavailable` handler). The network-retry
   test fails the second page twice (its own attempt plus `createQueryClient`'s automatic single
   network retry) before succeeding, and asserts a total of 4 requests; `findBy` calls after that
   failure use an explicit 3000 ms timeout. The missing-role assertion checks, inside that list
   item only, that no element's exact text is "Owner" or "Member" (not a regex against the whole
   item, which "3 members" would also match).
6. Ran the full acceptance suite from `frontend/`: `npm ci`, `npm run typecheck`, `npm run lint`,
   `npm run format:check` (two files needed `prettier --write` after being hand-written; both are
   whitespace-only), `npm test`, `npm run build`, `npm run check:api`, and the two `grep` checks
   below — all green.

## Discrepancies noticed

- The plan's Task 1 (`split("-").map(Number)`) does not type-check under
  `noUncheckedIndexedAccess: true` (`tsconfig.app.json`); resolved as directed by the amendment
  (regex + `requireGroup`).
- `process.env.TZ` in `date.test.ts` needed a local `declare const process: { env: { TZ?: string
  } }` — this project has no `@types/node`, and `package.json`/`tsconfig.app.json` are out of
  scope to change. The declaration is file-local and does not touch any config. `process.env.TZ`
  itself demonstrably does work at runtime in this Vitest/Node setup: the malformed-timezone test
  passes with the assigned value in effect.
- Two files (`GroupsPage.tsx`, and the four tests for it/routes that reused an already-existing
  fixture-backed pattern) were written test-after rather than test-first, because their
  implementation was a direct, low-risk composition of already-tested pieces (`GroupsList`,
  `ApiErrorNotice`) with no new logic of their own. Every other file followed red→green.
- `frontend/tsconfig.app.tsbuildinfo` changed as an incidental side effect of running
  `npm run typecheck`/`npm run build` repeatedly; it is not `.gitignore`d in this repo but is a
  pre-existing condition, not something this task introduced deliberately.

## Assumptions made

- Role label text: "Owner" / "Member"; state label text: "Open" / "Confirmed" / "Archived";
  member count: "N members" ("1 member" singular) — none of these strings are specified verbatim
  in the contract or architecture doc, so I chose plain, unambiguous English matching the existing
  boot-failure copy's tone.
- `groupsInfiniteQueryOptions`'s query key is `["groups", "list"]`, satisfying "query keys start
  with the feature name" (F12) while leaving room for a future `["groups", "detail", slug]` key
  without a collision.
- "Hide Load more while any notice is shown" (amendment 2) is implemented by hiding the button
  whenever either the fetch-next-page notice or the refetch-error notice is visible, not only the
  former.

## Follow-ups for later

- No group detail route, invite links, access token, or app-wide `db_circuit_open` banner — all
  explicitly out of scope for this task, per the task prompt.
- `GET /groups` sends no `Idempotency-Key` (it's a read) and no auth header (no token layer yet);
  a real backend will answer `401` until that lands, which is exactly the `unauthenticated`
  branch this task already renders correctly.

## Commands to verify

Run from `frontend/`:

```
npm ci
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build
npm run check:api
grep -rln "mocks" src
grep -rn "new Date(" src/lib src/features
```

Results: all exit zero. `npm test` — 13 test files, 60 tests, all passed, ~5.6s.
`grep -rln "mocks" src` lists exactly: `src/app/mocking.ts`, `src/app/RootLayout.test.tsx`,
`src/app/routes.test.tsx`, `src/test/setup.ts`, `src/features/groups/GroupsList.test.tsx`,
`src/pages/GroupsPage.test.tsx`, `src/api/config.test.ts` — all test files plus the two permitted
non-test files. `grep -rn "new Date(" src/lib src/features` prints nothing (exit 1).

Manual check (not run in this session, for Adrian): `npm run dev:mock`, open the root, follow the
link to Your groups, see the fixture groups with readable dates and states, click Load more, see
the second page and the button disappear.
