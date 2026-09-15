# Frontend CI workflow

## Task

Add a GitHub Actions workflow that runs lint, format check, typecheck, test, build and the
API type-drift check on every pull request and push touching `frontend/**` or
`contracts/openapi.yaml`.

## Model

Sonnet 5

## Files changed

- `.github/workflows/frontend-ci.yml` (new)
- `docs/agent-log/2026-09-10-frontend-ci-workflow.md` (new, this file)
- `docs/agent-log/INDEX.md` (appended)

## What I did

Read `frontend/package.json`, `frontend/.nvmrc` (24) and `frontend/.npmrc`
(`engine-strict=true`) without running any npm or node command, per the instruction that a
concurrent session was installing dependencies in the same working tree.

Created `.github/workflows/frontend-ci.yml` with:

- Triggers: `pull_request`, `push` to `main`/`develop`, both path-filtered to `frontend/**`,
  `contracts/openapi.yaml` and the workflow file itself; plus `workflow_dispatch`.
- Workflow-level `permissions: contents: read`.
- A concurrency group `${{ github.workflow }}-${{ github.ref }}` that cancels in-progress runs
  only for `pull_request` events.
- Five jobs, each named with a `frontend-` prefix (`frontend-lint`, `frontend-typecheck`,
  `frontend-test`, `frontend-build`, `frontend-api-drift`), each on `ubuntu-latest` with
  `timeout-minutes: 10`, `defaults.run.working-directory: frontend`, its own
  `actions/checkout@v7` and `actions/setup-node@v7` (node-version-file
  `frontend/.nvmrc`, npm cache, `cache-dependency-path: frontend/package-lock.json`), then
  `npm ci`. No composite action, no reusable workflow, per instruction.

### Job-to-script table

| Job | Steps (after checkout/setup-node/npm ci) | package.json script |
|---|---|---|
| frontend-lint | `npm run lint` | `"lint": "eslint ."` |
| frontend-lint | `npm run format:check` | `"format:check": "prettier --check ."` |
| frontend-typecheck | `npm run typecheck` | `"typecheck": "tsc -b --noEmit"` |
| frontend-test | `npm test` | `"test": "vitest run"` |
| frontend-build | `npm run build` | `"build": "tsc -b --noEmit && vite build"` |
| frontend-api-drift | `npm run check:api` | `"check:api": "openapi-typescript ../contracts/openapi.yaml -o src/api/generated/schema.d.ts --check"` |

All six scripts were confirmed present verbatim in `frontend/package.json` before writing the
workflow.

### Action versions

Determined via `gh api repos/actions/checkout/releases/latest` -> `v7.0.1`, and
`gh api repos/actions/setup-node/releases/latest` -> `v7.0.0`. Both referenced by major tag
`@v7` in the workflow.

## Discrepancies noticed

None. All required scripts exist and match the task's expectations exactly.

## Assumptions made

None beyond what the task specified; the trigger paths, job shape and action choice all follow
the prompt literally.

## Follow-ups for later

- The `actionlint` PostToolUse hook flagged a generic warning about untrusted-input command
  injection when the file was written. None of the risky `github.event.*` fields are used
  anywhere in this workflow (no `run:` step interpolates any event payload), so no change was
  needed, but flagging it here since the hook fired.
- Adrian should still do the by-hand acceptance check: open a PR and confirm all five jobs go
  green, then push a throwaway comment-only edit to
  `frontend/src/api/generated/schema.d.ts` and confirm only `frontend-api-drift` fails, then
  discard that commit.

## Commands to verify

- `actionlint .github/workflows/frontend-ci.yml` (run from repo root) -> exit 0, confirmed in
  this session.
