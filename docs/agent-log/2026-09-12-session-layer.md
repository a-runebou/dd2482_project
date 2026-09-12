# 2026-09-12 — session layer (T6)

## Task

Round T6: in-memory session layer for the frontend — module-level token/user store,
client middleware attaching the bearer token and refreshing once on `token_expired`,
`POST`/`DELETE /auth/session`, a boot-time refresh probe, `/auth/callback`,
session-aware home-page chrome, MSW handlers, and tests.

## Model

Opus 5.

## Files changed

None beyond this log entry and its `INDEX.md` line. The task stopped at its own
step 1 preflight gate.

## What I did

Ran `git status --short` from the repository root. Output:

```
A  .nvmrc
 M CLAUDE.md
?? .DS_Store
```

The task's step 1 says to stop if anything other than `.DS_Store` is listed, so I
stopped before reading further or writing any code. The two pending changes are
unrelated to T6: a staged new `.nvmrc` containing `24`, and one added line in
`CLAUDE.md` under "Session behaviour" requiring frontend commands to run on the
Node version in `.nvmrc`.

## Discrepancies noticed

None — no contract or code was read beyond `git status` and the pending diff.

## Assumptions made

- The gate exists so that T6's diff is reviewable on its own; the pending changes
  belong to a separate, toolchain-hygiene concern and should be their own commit.

## Follow-ups for later

- Adrian commits `.nvmrc` and the `CLAUDE.md` line (suggested message below), then
  re-runs T6 from a clean tree.
- Suggested commit message: `chore: Pin frontend Node version in .nvmrc`.
- `.DS_Store` is untracked and ignorable; consider adding it to `.gitignore`.

## Commands to verify

```
git status --short   # expect only: ?? .DS_Store
```

---

# 2026-09-12 — session layer (T6), second run

## Task

As above. Adrian waived the step 1 preflight gate ("Proceed") with `.nvmrc` and `CLAUDE.md`
still uncommitted, so this diff sits on top of those two unrelated changes and is not
reviewable entirely on its own.

## Model

Opus 5.

## Files changed

New: `frontend/src/api/session.ts`, `session.test.ts`; `frontend/src/features/auth/`
`redirectPath.ts` (+ test), `useSession.ts`, `createSession.ts`, `signOut.ts`,
`sessionProbe.ts`, `SessionStatus.tsx` (+ test), `storageGuard.test.ts`;
`frontend/src/pages/AuthCallbackPage.tsx` (+ test).

Changed: `frontend/src/api/client.ts`, `frontend/src/app/RootLayout.tsx`, `routes.tsx`,
`frontend/src/pages/HomePage.tsx`, `frontend/src/mocks/fixtures.ts`, `handlers.ts`,
`frontend/src/App.test.tsx`, `frontend/src/app/RootLayout.test.tsx`, `routes.test.tsx`,
`docs/frontend/DECISIONS.md`.

Not touched: `main.tsx` and `App.tsx` needed no change — the probe is a query inside the boot
gate, so it works in the browser and in a memory router without wiring at the root.

## What I did

- A module-scope store (`src/api/session.ts`) holding the access token and user, with a
  subscribe function for `useSyncExternalStore`. Nothing reaches a storage API.
- `refreshSession()` in the same module: `POST /auth/refresh`, a shared in-flight promise per
  tab, and `navigator.locks.request` across tabs where the browser has a `LockManager`
  (feature-detected by typing it `LockManager | undefined`, because lib.dom says it is always
  there). Failure clears the store and resolves to `undefined` rather than rejecting.
- Middleware on the existing client. `onRequest` attaches the bearer token, except on
  `/config`, `/auth/magic-link`, `/auth/session` and `/auth/refresh` (matched on openapi-fetch's
  `schemaPath`, so no URL parsing), and stashes `request.clone()` keyed by the middleware's
  request id. `onResponse` turns a 401 whose problem code is `token_expired` into one refresh
  and one retry of that clone through `options.fetch` — the raw fetch, so the retry cannot
  re-enter the middleware and a second 401 comes back unchanged. Any other 401, and a refresh
  that fails, clear the store and return the original response. `onError` drops the stash.
- `credentials: "include"` went on `createClient` rather than into the middleware: a
  `Request`'s credentials are read-only once constructed, and rebuilding a request that carries
  a body risks undici's `duplex` requirement. Every request, refresh included, now sends the
  cookie, which is what the requirement needed.
- `/auth/callback` (`AuthCallbackPage`) exchanges the token through a *query*, not a mutation,
  because a query is deduplicated per `QueryClient` and the token is single use; it resolves to
  a boolean so the `SessionResponse` never enters the cache. Success navigates with
  `replace: true` to a validated relative `redirect` or to `/`.
- Boot probe as a query inside `RootLayout`, gating `Outlet` together with `GET /config`.
- `HomePage` renders a new `SessionStatus` (display name + Sign out, or the Sign in link).

## Discrepancies noticed

- `contracts/openapi.yaml` gives `POST /auth/session`, `DELETE /auth/session` and
  `POST /auth/refresh` `security: []`, which is right, but `DELETE /auth/session` declares only
  a 204 and no 401, and `POST /auth/session` declares no 429 although it is an obvious
  brute-force target. Neither blocks this task; no contract change made.
- ARCHITECTURE section 6.1's diagram still shows the mail link without the `redirect`
  parameter agreed in item C2, and D11 still says the SPA and API are on different origins
  (item C1). Both are documentation catch-up owed by earlier decisions, not by this task.
- `grep -rn "console\." src/api src/features src/pages` matches one pre-existing line,
  `src/features/groups/InviteLinkPanel.tsx:16`, which is a comment, not a call. It is outside
  this task's files and was left alone.

## Assumptions made

- The default MSW `POST /auth/refresh` handler answers 200, as the task's step 9 says. To keep
  that consistent, `handlers.ts` now holds one module-level flag standing in for the refresh
  cookie: present by default, set by `POST /auth/session`, revoked by `DELETE /auth/session`.
  Without it, sign-out's `queryClient.clear()` restarts the boot probe and signs the user
  straight back in. Reset it with `setMockRefreshCookie(true)` in a `beforeEach`;
  `server.resetHandlers()` does not touch module state. The browser worker's copy resets on
  every page load, so in `dev:mock` a reload after signing out shows the user signed in again —
  a mock artefact, not application behaviour.
- The task limited `routes.test.tsx` to added cases. One existing case, "navigates to /sign-in
  from the link on the home page", also gained a one-line `setMockRefreshCookie(false)`: the
  home page now shows Sign out when a session exists, so the case needed its signed-out
  precondition made explicit. Nothing was weakened or removed.
- Sign-out clears the whole query cache, as specified. That includes the config query, so
  signing out briefly shows the boot gate's loading state while `/config` is refetched.
- The invalid-link wording ("This sign-in link is invalid, has already been used, or has
  expired.") is mine; the task fixed the meaning, not the string. It deliberately does not
  distinguish the three cases.

## Follow-ups for later

- Adrian's manual check (`npm run dev:mock`) is still outstanding; nothing here was exercised
  in a real browser.
- No route guards were added, as instructed. A signed-out user can still reach `/groups` and
  will see the 401 branch of `ApiErrorNotice`.
- The invite join flow (ARCHITECTURE 6.5) and the `redirect_path` argument to
  `POST /auth/magic-link` are still unwired; F16 and item C2 are the relevant notes.
- `docs/coordination/frontend-backend.md` items C1, C2 and C3 are still marked `open` although
  Adrian answered all three; the backend has not confirmed.

## Commands to verify

Run from `frontend/` on Node 24 (`nvm use 24`; the ambient shell node was v25, which fails
`npm ci`'s `engines` check):

```
npm ci
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build
npm run check:api
grep -rnE "localStorage|sessionStorage|document\.cookie" src/api src/features src/pages src/app
grep -rn "console\." src/api src/features src/pages
```

Manual, for Adrian:

```
npm run dev:mock
# visit /auth/callback?token=anything -> signed in on the home page, name shown
# reload -> still signed in; Sign out -> the Sign in link returns
```
