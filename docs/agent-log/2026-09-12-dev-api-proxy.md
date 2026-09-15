# Development API proxy (T4d)

## Task

Configure the Vite dev and preview servers to forward `/api` requests to `http://localhost:8000`, so the browser talks to a single origin in development. The proxy allows testing error states when no backend is running.

## Model

Haiku 4.5

## Files changed

- Modified: `frontend/vite.config.ts` (added `server.proxy` and `preview.proxy` forwarding `/api` to `http://localhost:8000`)
- Modified: `frontend/README.md` (appended a paragraph explaining that `npm run dev` forwards `/api` to the local backend server)
- Modified: `docs/frontend/DECISIONS.md` (appended F13)

## What I did

1. Preflight: `git status --short` showed only `.DS_Store` and `claudes_info.md` (untracked), both safe to ignore.
2. Evidence before: Started Vite on port 5199, confirmed `/api/v1/config` returned `200` (served index.html), confirmed port 8000 was free, stopped the server.
3. Modified `vite.config.ts` to add `server.proxy` and `preview.proxy` objects, each forwarding `/api` to `http://localhost:8000` with no path rewrite.
4. Evidence after: Started Vite again, confirmed `/api/v1/config` now returns `502` (Bad Gateway, proxied to unavailable backend), stopped the server.
5. Updated `frontend/README.md` with a paragraph explaining the proxy behaviour.
6. Appended F13 to `docs/frontend/DECISIONS.md` per the task specification.

## Discrepancies noticed

None.

## Assumptions made

- The `/api` prefix should proxy in full with no path rewrite (i.e. `/api/v1/config` goes to `http://localhost:8000/api/v1/config`)

## Follow-ups for later

None.

## Commands to verify

Run from `frontend/`:

```
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build
```

Status codes from evidence steps:
- Before change: `/api/v1/config` returned 200 (served index.html)
- After change: `/api/v1/config` returned 502 (proxied to unavailable backend)
- Final state: `lsof -ti :5199` prints nothing (server cleanly stopped)
