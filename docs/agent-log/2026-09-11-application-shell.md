# Application shell (T4a)

## Task

Boot the React app inside a TanStack Query provider that renders routes only after GET /config
has loaded, with distinct accessible loading and failure states and a root error boundary. React
Router data router in library mode, no loaders/actions for server data.

## Model

Opus 4.8.

## Files changed

- `frontend/package.json`, `frontend/package-lock.json` — added `react-router` (runtime dep).
- `frontend/src/main.tsx` — module-scope QueryClient + browser router, injected into App under StrictMode.
- `frontend/src/App.tsx` — now takes `{ queryClient, router }` props; composes the two providers only.
- `frontend/src/App.test.tsx` — updated to inject its own client + memory router and await the heading.
- `frontend/src/app/routes.tsx` — `appRoutes`: root layout + errorElement, index → HomePage, `*` → NotFoundPage.
- `frontend/src/app/RootLayout.tsx` — boot gate over `configQueryOptions`.
- `frontend/src/app/BootFailure.tsx` — full-page `role="alert"` failure states + guarded auto-retry.
- `frontend/src/app/RootErrorBoundary.tsx` — generic `role="alert"`, never shows the thrown message.
- `frontend/src/app/RootLayout.test.tsx`, `frontend/src/app/routes.test.tsx` — colocated tests.
- `frontend/src/pages/HomePage.tsx`, `frontend/src/pages/NotFoundPage.tsx` — route-level components.
- `docs/frontend/DECISIONS.md` — appended F8, F9.

## What I did

- Installed `react-router@8.3.1` (current stable; `npm view react-router version` → 8.3.1). This is the
  package React Router's docs name for library mode (`react-router-dom` merged into it as of v7). Peers
  `react/react-dom >=19.2.7`; we have ^19.3.0. Clean install, no ERESOLVE.
- Instance creation (plan amendment 1): QueryClient and browser router are created once at module scope
  in `main.tsx` and injected as required props; nothing is created inside a component. `grep -rn
  "createBrowserRouter" src` matches only `main.tsx` (2 lines). Tests inject their own `createQueryClient()`
  and `createMemoryRouter(appRoutes, ...)`.
- Boot gate: one `useQuery(configQueryOptions)` drives everything. `isSuccess` → `<Outlet/>`; `isError`
  → `<BootFailure/>` (stays visible while a retry is in flight, since `isError` remains true); otherwise a
  `role="status"` loading state.
- BootFailure branches only on `kind` and, for `problem`, on `code`: `db_circuit_open` /
  `service_unavailable` → temporarily-unavailable (auto-retry only when `retryAfterSeconds` is defined);
  `network` → cannot-reach; everything else → generic. Retry (manual and automatic) calls `refetch` from
  the same query; the button is disabled while fetching.
- Auto-retry (amendment 3): effect keyed on `errorUpdatedAt` + the retry seconds, so each fresh failure
  arms exactly one new timer; the timer skips if a fetch is already in flight (isFetching ref); cleanup
  clears the timer so StrictMode's double-invoke leaves one timer. `refetch`/`isFetching` refs are synced
  in an effect, not during render (react-hooks/refs forbids ref writes during render).
- Timers (amendment 2): no fake timers anywhere. Real-time waits (Retry-After 1 s, the 2 s no-retry
  window, the network retry backoff) with explicit `findBy*` timeouts that exceed each wait.
- Test 7 (amendment 5): the deliberately-throwing route spies on `console.error` and restores it in a
  `finally`; no global silencing.

## Discrepancies noticed

- `vite.config.ts` sets `test.globals: false`, so Testing Library's automatic `afterEach(cleanup)` is not
  registered and the jsdom document accumulated elements across the multi-test files (getByRole found
  duplicates). `src/test/setup.ts` is read-only and out of scope, so I added an explicit `afterEach(cleanup)`
  at the top of each new test file rather than touching setup. No production code affected.

## Assumptions made

- User-facing copy (British English) is mine to choose; the prompt fixed behaviour, not wording.
- "Current stable" react-router = the `react-router` package (v7+ library mode), not the deprecated
  `react-router-dom`.
- After a successful manual retry in the network test, the total request count is 3 (2 failed attempts incl.
  the client's single retry, then 1 success); the prompt fixed only the pre-retry count of 2.

## Follow-ups for later

- No dev-time MSW browser worker yet: under `npm run dev` the /config request fails and the failure state is
  expected (a later task adds development mocks).
- Feature-code layout under `src/` is deferred to the first feature (F9).

## Commands to verify

From `frontend/` on Node 24: `npm ci`, `npm ls`, `npm run typecheck`, `npm run lint`,
`npm run format:check`, `npm test` (30 tests, ~5 s), `npm run build`, `npm run check:api` — all exit 0.
`grep -rln "mocks" src` → `src/app/RootLayout.test.tsx`, `src/test/setup.ts`, `src/api/config.test.ts`
(test files + setup only). `grep -rn "createBrowserRouter" src` → only `src/main.tsx`.
By hand for Adrian: `npm run dev`, open the URL; a brief loading state then a failure state with a retry
button (no backend/dev mocks yet); clicking retry issues another GET /api/v1/config (visible in the
network tab).
