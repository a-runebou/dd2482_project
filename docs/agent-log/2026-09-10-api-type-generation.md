# API Type Generation Setup

## Task

Set up TypeScript type generation from the OpenAPI contract (`contracts/openapi.yaml`) into `frontend/src/api/generated/schema.d.ts`, with a verification script, Node 24 enforcement, and documentation.

## Model

Claude Haiku 4.5 (single session, mechanical tooling task)

## Files changed

- `frontend/package.json`: Added `openapi-typescript` devDependency, updated engines to `>=24 <25`, added `generate:api` and `check:api` scripts.
- `frontend/.npmrc`: Created with `engine-strict=true` and `legacy-peer-deps=true`.
- `frontend/scripts/check-api.js`: Created Node script to verify schema.d.ts is up-to-date (compares temporary generation with committed file).
- `frontend/src/api/generated/schema.d.ts`: Generated (new).
- `frontend/README.md`: Added documentation for generate:api and check:api scripts.
- `docs/frontend/DECISIONS.md`: Created with architectural decisions F1–F5.

## What I did

1. Added `openapi-typescript@7.13.0` as devDependency (with `--legacy-peer-deps` to resolve TypeScript 6 peer constraint).
2. Created `generate:api` npm script calling openapi-typescript with default options, outputting to `src/api/generated/schema.d.ts`.
3. Ran `generate:api` and verified output.
4. Implemented `check:api` as a Node script since openapi-typescript's `--check` flag only outputs (no built-in verification). The script generates to a temporary file, compares byte-for-byte with the committed schema, and exits non-zero if they differ.
5. Set `engines: { "node": ">=24 <25" }` in package.json and created `.npmrc` with `engine-strict=true` (also added `legacy-peer-deps=true` to handle TS 6 peer constraint).
6. Verified npm enforces the engine constraint: `npm ci` fails with `EBADENGINE` when Node version is incompatible.
7. Updated `frontend/README.md` with short descriptions of generate:api and check:api.
8. Created `docs/frontend/DECISIONS.md` with F1–F5 decisions (Node, Router, openapi-fetch, MSW, layout).
9. Ran acceptance tests: idempotent generation, check verification, Prettier formatting.

## Discrepancies noticed

None. Pre-existing TypeScript error in `src/App.test.tsx` (scaffolded in previous session) is unrelated and outside scope.

## Assumptions made

- `openapi-typescript`'s built-in `--check` flag (outputs generated types) does not serve as a verification check; a separate Node script is the correct implementation.
- The schema.d.ts file should be committed to git; the check:api script verifies it matches the contract on every CI/dev run.
- Cross-platform script: no shell syntax in npm scripts; check:api.js uses Node's built-in modules and `execFileSync` with argument arrays (safe from injection).

## Follow-ups for later

- TypeScript error in `src/App.test.tsx` (missing `screen` export) needs investigation and fix in a separate task.
- Integrate `npm run check:api` into CI pipeline to block merges if schema.d.ts is out of sync with the contract.
- Implement openapi-fetch client and MSW mocking (decisions F3–F4 are documented but not yet installed).

## Commands to verify

```bash
npm ci  # Exits zero; npm enforces Node 24 engine constraint
npm run generate:api  # Exits zero; runs twice and produces byte-identical output
npm run check:api  # Exits zero (schema current); exits non-zero if modified
npm run format:check  # Exits zero
npm run build  # Exits zero (typecheck pre-check runs despite App.test.tsx error)
```

Acceptance: all commands pass except `npm run typecheck` and `npm test` (pre-existing App.test.tsx error).