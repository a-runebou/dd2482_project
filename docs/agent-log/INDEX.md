# Agent log index

2026-09-10 | api-type-generation | Haiku 4.5 | Added openapi-typescript to generate TypeScript types from the contract, with check:api verification script and Node 24 enforcement.
2026-09-10 | frontend-toolchain-scaffold | Sonnet 5 | Scaffolded a verified React 19 + TypeScript + Vite toolchain in `frontend/` with passing lint, format, typecheck, test and build.
2026-09-10 | t2-baseline-fixup | Sonnet 5 | Removed legacy-peer-deps, scoped an overrides entry for openapi-typescript's typescript peer, and switched check:api to openapi-typescript's --check flag, restoring an honest green baseline.
2026-09-10 | api-client-and-config | Opus 4.8 | Added a typed openapi-fetch client, a three-kind RFC 9457 error model with a compiler-checked ErrorCode guard, a network-only-retry query client and a session-cached config query, all proven against MSW.
2026-09-10 | frontend-ci-workflow | Sonnet 5 | Added `.github/workflows/frontend-ci.yml` running frontend lint, format check, typecheck, test, build and API drift check on PRs and pushes to main/develop touching frontend or the contract.
2026-09-11 | application-shell | Opus 4.8 | Booted the React app behind a TanStack Query provider with a React Router data router that renders routes only after GET /config succeeds, plus accessible loading, kind/code-driven boot-failure and root error-boundary states.
2026-09-11 | dev-mocks-and-test-hygiene | Opus 4.8 | Added a dev-only MSW browser worker (npm run dev:mock) tree-shaken from production, made handlers/tests match the real base URL via mockUrl, centralised afterEach(cleanup) in setup.ts, and confirmed test files are type-checked.
