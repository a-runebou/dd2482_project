# Frontend Decisions

F1 Package manager and runtime: npm and Node 24 LTS, pinned by `.nvmrc` and enforced by engines with engine-strict.

F2 Router: React Router, chosen for the fewest moving parts and no route code generation.

F3 Runtime API client: openapi-fetch, typed by the generated paths type; its middleware is the place for the bearer token and refresh-and-retry-once.

F4 Mocking: MSW, in Vitest and optionally in development, because it can script 304, 503 db_circuit_open with Retry-After and token_expired.

F5 Layout: hand-written API code in `src/api/`, generated types in `src/api/generated/`, generated output committed and verified by check:api.