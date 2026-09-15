# API client, error model, query client and config query

## Task

Provide `frontend/src/api/`: a typed openapi-fetch client, a normalized RFC 9457 error model, a
TanStack Query client factory and a session-cached config query, all proven against MSW. Plan T3,
approved with five amendments.

## Model

Opus 4.8.

## Files changed

- `frontend/package.json`, `frontend/package-lock.json` — added deps.
- `frontend/src/api/client.ts` — `resolveBaseUrl(configured, origin)` and the `apiClient`.
- `frontend/src/api/errors.ts` — `ApiError` union, `ERROR_CODES`, `normalizeError`, `parseRetryAfter`,
  `unwrap`, and the TanStack Query `Register` augmentation.
- `frontend/src/api/queryClient.ts` — `createQueryClient()`.
- `frontend/src/api/config.ts` — `configQueryOptions` and `useConfig()`.
- `frontend/src/api/{errors,client,config}.test.ts` — colocated tests (written first, shown failing).
- `frontend/src/mocks/{fixtures,handlers,server}.ts` — MSW (new, imported only by tests + setup).
- `frontend/src/test/setup.ts` — start MSW at module top level (see Discrepancies).
- `frontend/src/vite-env.d.ts` — type `VITE_API_BASE_URL`.
- `docs/frontend/DECISIONS.md` — appended F6, F7.

## What I did

- Installed `openapi-fetch` and `@tanstack/react-query` (runtime) and `msw` (dev). No ERESOLVE.
- Error model: `ApiError` has exactly three kinds. `unwrap` classifies a thrown `TypeError` (a fetch
  that produced no response) as `network` and any other throw as `unexpected`, so the two are never
  conflated. `normalizeError` returns `problem` only for `application/problem+json` bodies carrying the
  required Problem fields with a `code` in the runtime `ERROR_CODE_SET`; a non-problem JSON body, an
  unparsed (invalid JSON) body and an unknown code are all `unexpected`. `status` on a `problem` is the
  HTTP response status.
- Amendment 1: `resolveBaseUrl(configured, origin)`. Confirmed the failure mode first —
  `new Request('/api/v1/config')` throws `TypeError` under Node — so a bare relative default would be
  mis-reported as `network`. The client passes `globalThis.location.origin`.
- Amendment 2: the bidirectional guard is `const ERROR_CODE_MAP: Record<ErrorCode, true>` with the list
  and set derived from its keys — no unused binding, no disabled rule. Demonstrated: removing a code →
  `tsc` TS2741 (non-zero); adding `bogus_code` → `tsc` TS2353 (non-zero); restored → exit 0.
- Amendment 3: registered `ApiError` as TanStack Query's default error via module augmentation
  (`declare module "@tanstack/react-query" { interface Register { defaultError: ApiError } }`), so the
  retry function's `error` and `useConfig`'s `error` are `ApiError` with no cast. The eslint config uses
  the non-type-checked `recommended` set, so throwing a non-Error `ApiError` value is not flagged.
- Amendment 4: every MSW-backed error test asserts the handler's request count (503 → 1, network → 2).
- `createQueryClient`: queries retry only `network`, once (`failureCount < 1`); mutations never retry.
- Config query: `staleTime`/`gcTime` Infinity, no refetch on mount/focus/reconnect — one fetch per
  session; exported options for a later boot-time prefetch.

## Discrepancies noticed

- MSW did not intercept the openapi-fetch request for two independent reasons, both fixed in test-only
  code. (1) A bare relative handler path (`/api/v1/config`) is not resolved against jsdom's `location`
  by `msw/node`; the handlers use a leading wildcard (`*/api/v1/config`), which is origin-agnostic.
  (2) openapi-fetch captures `globalThis.fetch` at `createClient` time (dist line 12,
  `baseFetch = globalThis.fetch`), and `apiClient` is created at import — before a `beforeAll` would
  run — so MSW must replace `fetch` first. `server.listen()` is therefore called at `setup.ts` module
  top level, not in a `beforeAll`. No production code was changed for either.

## Assumptions made

- On a `problem`, `status` is the HTTP response status; if a body's `status` field were to differ, the
  error is still classified `problem` and the HTTP status is used (amendment 5).
- `Retry-After` is accepted only as a non-negative integer (contract types it as integer seconds); the
  HTTP-date form yields `undefined`.
- A repeated code in the runtime list is not separately guarded; the object-literal keys make
  duplicates a syntax-level non-issue.

## Follow-ups for later

- F6 is provisional: runtime (not build-time) base-URL configuration for the deployed image is still
  open, pending the CORS/origin decision. Adrian to resolve when prod origins are fixed.
- `configQueryOptions` is exported so a later app-shell task can `prefetchQuery` at boot.

## Commands to verify

From `frontend/` on Node 24: `npm ci`, `npm ls`, `npm run typecheck`, `npm run lint`,
`npm run format:check`, `npm test`, `npm run build`, `npm run check:api`, `grep -rln "mocks" src`.
All exit 0; 20 tests pass; grep lists only `src/test/setup.ts` and `src/api/config.test.ts`.
