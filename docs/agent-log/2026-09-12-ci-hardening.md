# CI hardening

## Task

Add a dependency audit, secret scanning and contract validation to the frontend pipeline, and
run CodeQL wherever the repository allows it, per T10.

## Model

Sonnet 5

## Files changed

- `.github/workflows/frontend-ci.yml` (added two jobs)
- `.github/workflows/security.yml` (new)
- `docs/agent-log/2026-09-12-ci-hardening.md` (new, this file)
- `docs/agent-log/INDEX.md` (appended)

## What I did

Preflight: `git status --short` showed only `.DS_Store`, so proceeded.

Read `.github/workflows/frontend-ci.yml`, `frontend/package.json`, `frontend/.nvmrc` (24),
`docs/ARCHITECTURE.md` §11 (CI/CD: `deps` wants `npm audit --audit-level=high`; `sast` wants
CodeQL plus gitleaks; `contract` wants spec validation, drift check and schemathesis) and §12,
`docs/frontend/DECISIONS.md` F1 (npm, Node 24, engine-strict) and F5 (generated types
committed, verified by `check:api`), and the prior CI agent log.

Confirmed repository visibility with `gh repo view --json visibility,nameWithOwner`: public,
owned by a personal account (`a-runebou/dd2482_project`), not an organisation.

### frontend-ci.yml: `frontend-audit`

Same shape as the other four jobs (checkout, setup-node from `.nvmrc`, npm cache, `npm ci`),
then `npm audit --audit-level=high` with `continue-on-error: true` on that step. An advisory
with no upstream fix would otherwise block every pull request indefinitely (npm audit has no
way to distinguish "fixable" from "no fix yet" in its exit code), so the step is marked
non-blocking rather than the job. **How a real finding becomes visible to Adrian:** the step
shows a yellow warning triangle in the run's job view and in the PR checks list even though the
job and the overall check both report success (green). There is no other signal — nothing
posts a comment or fails the merge gate. Adrian (or whoever reviews the PR) has to open the
"frontend-audit" job and look at the `npm audit` step to notice it. This is a real usability
gap; if it needs to be louder later (e.g. a Slack ping or a required manual acknowledgement),
that is a follow-up, not something invented here.

### frontend-ci.yml: `frontend-contract`

Checkout, setup-node from `.nvmrc` (no `npm ci`, since nothing here depends on
`node_modules` or the lockfile), then:

```
npx --yes @redocly/cli@2.52.1 lint contracts/openapi.yaml
```

`@redocly/cli` was chosen because it validates OpenAPI 3.1 (the contract's declared version)
against the JSON Schema meta-schema and exits non-zero only when there are rule violations at
`error` severity (structural invalidity), not on style warnings — so it fails on a genuinely
broken document without also failing on cosmetic lint opinions. Pinned to the exact published
version `2.52.1` (latest at the time, confirmed via `npm view @redocly/cli version`), not a
floating major tag, because "pinned" was specified explicitly and `npx` has no notion of a
moving major-version alias the way a GitHub Action tag does. Nothing was added to
`frontend/package.json`; the tool is fetched by `npx` in CI only. `schemathesis` was
deliberately not run here, since it needs a live backend and belongs in Alexander's pipeline
per the task.

**Ran this locally against the real `contracts/openapi.yaml` before committing to the
approach** (read-only; no file was changed) and it currently fails with 2 errors — see
Discrepancies below.

### security.yml (new)

Workflow-level `permissions: contents: read`. Triggers mirror `frontend-ci.yml`
(`pull_request` and `push` to `main`/`develop`, both path-filtered to `frontend/**`,
`contracts/openapi.yaml` and this workflow file, plus `workflow_dispatch`) with a weekly
`schedule` added (`cron: "0 3 * * 1"`, Mondays 03:00 UTC; schedule events ignore path filters,
so this always runs regardless of what changed). A `concurrency` group matching
`frontend-ci.yml`'s pattern was added for consistency, though it wasn't explicitly requested.

- **`gitleaks`**: `actions/checkout@v7` with `fetch-depth: 0` (full history — gitleaks needs
  every commit, not just the working tree), then `gitleaks/gitleaks-action@v3`.
  `GITLEAKS_ENABLE_COMMENTS: false` because the workflow only grants `contents: read` and PR
  commenting needs `pull-requests: write`, which nothing in the task asked for; better to
  disable the feature explicitly than rely on it failing open or silently.
  **Licence check**: gitleaks-action's own README states a `GITLEAKS_LICENSE` is required only
  for repositories owned by a GitHub organisation account, not a personal account. This repo
  (`a-runebou/dd2482_project`) is owned by a personal account, so no licence key is needed and
  none was referenced.
- **`codeql`**: job-level `permissions: { contents: read, security-events: write }`
  (workflow-level `contents: read` alone is not enough; CodeQL results upload needs
  `security-events: write`, and job-level permissions replace rather than extend the
  workflow-level block, so `contents: read` is restated here). `github/codeql-action/init@v4`
  with `languages: javascript-typescript` and `source-root: frontend` to scope the scan to the
  frontend tree only, then `github/codeql-action/analyze@v4`. No build step: CodeQL's
  JavaScript/TypeScript extractor parses source directly and does not need `npm ci` or a
  compile step.

## Discrepancies noticed

**`contracts/openapi.yaml` fails OpenAPI 3.1 structural validation today, independent of this
task.** Running `npx @redocly/cli@2.52.1 lint contracts/openapi.yaml` against the current
contract (read-only, not modified) reports 2 errors:

- Line 860, `#/components/schemas/Problem/properties/detail`: the flow mapping
  `{ type: string, description: Human-readable, not for programmatic use }` contains an
  unquoted comma inside the intended `description` value. YAML flow-mapping syntax treats `,`
  as an entry separator, so this parses as `description: Human-readable` followed by a second,
  bogus, colon-less key `not for programmatic use`, which the OpenAPI Schema Object does not
  permit as an extra property.
- Line 1178, `#/components/schemas/Suggestion/properties/score`: the same pattern —
  `description: Higher is better, comparable only within one response` splits into
  `description: Higher is better` plus a bogus `comparable only within one response` key.

Both are genuine YAML authoring defects (an unescaped comma inside an unquoted flow scalar),
not an artefact of Redocly's opinionated ruleset — any conformant OpenAPI 3.1 validator that
checks the Schema Object against its meta-schema should reject the same two properties. There
are also 5 unrelated `warn`-level style findings (missing `license.url`/`identifier`, a
`localhost` server URL, three operations without a documented 4XX response) that do **not**
fail the job, by design.

**Consequence: `frontend-contract` will fail on the very first run**, on the current `main`,
until these two `description` fields are quoted or rewritten to remove the embedded comma.
Per CLAUDE.md rule 1 and the session rule that the contract is read-only, I have not touched
`contracts/openapi.yaml`. This is a contract-change note for whoever owns the contract: quote
or rephrase the two `description` values above so the comma is not a flow-mapping separator.

## Assumptions made

- "Current major releases" were checked via `gh api repos/<owner>/<repo>/releases/latest` for
  GitHub Actions (`actions/checkout` → `v7.0.1`, `actions/setup-node` → `v7.0.0`) and via
  `git ls-remote --tags` for `github/codeql-action` (major tag `v4` exists and points at a real
  tag on the API's release history). `gitleaks/gitleaks-action` → latest release `v3.0.0`. All
  four are referenced by major tag (`@v7`, `@v4`, `@v3`) except `@redocly/cli`, which is a pinned
  exact npm version rather than a Action tag, per the task's explicit "pinned version" wording
  for that one case.
- Added a `concurrency` block to `security.yml` even though only "same triggers... plus a
  weekly schedule" was specified, for parity with `frontend-ci.yml`'s existing style. This is a
  low-risk addition (cheaper CI, no behavioural surprise); flagging it as a judgement call
  rather than a literal instruction.
- `frontend-contract` does not run `npm ci`: nothing in that job touches `node_modules` or the
  lockfile, so it was left out rather than added purely for shape-matching.

## Follow-ups for later

- Fix the two `description` fields in `contracts/openapi.yaml` (lines 860 and 1178) so
  `frontend-contract` can pass — this blocks the by-hand acceptance check below until done.
- Decide whether `frontend-audit`'s non-blocking warning is visible enough long-term, or
  whether it needs a stronger surface (job summary write, required PR comment, etc.).
- Confirm whether GitHub Advanced Security / code scanning is enabled for this repository so
  the `codeql` job's SARIF upload actually lands somewhere visible — see below.

## Commands to verify

- `actionlint .github/workflows/frontend-ci.yml` → exit 0, confirmed.
- `actionlint .github/workflows/security.yml` → exit 0, confirmed.
- `git status --short` → only `.DS_Store` outside the changed/added files listed above,
  confirmed.
- By hand, after committing: open a pull request touching `frontend/**` and see all seven
  `frontend-ci` jobs plus both `security.yml` jobs run (the latter needs the PR to also touch
  `contracts/openapi.yaml`, `frontend/**` or the workflow files, since `security.yml`'s
  `pull_request` trigger is path-filtered the same way). Then, on a throwaway commit, introduce
  a deliberate syntax error into `contracts/openapi.yaml` (e.g. an unbalanced bracket) and
  confirm `frontend-contract` fails while the other jobs are unaffected; discard that commit.
- Adrian must check, in the repository's Settings → Code security, whether GitHub Advanced
  Security / code scanning is enabled. If it is not (common for private repos without a paid
  plan; this repo is currently public so it should be available, but confirm), the `codeql`
  job's SARIF upload step will fail for reasons unrelated to the code, and that failure is
  isolated to `security.yml` precisely so it cannot block `frontend-ci.yml`.

## Job table (Tests)

| Job | File | Runs | Can fail the pipeline? | ARCHITECTURE §11 requirement satisfied |
|---|---|---|---|---|
| `frontend-lint` | frontend-ci.yml | eslint, prettier --check | Yes | `lint` |
| `frontend-typecheck` | frontend-ci.yml | `tsc -b --noEmit` | Yes | `typecheck` |
| `frontend-test` | frontend-ci.yml | vitest | Yes | `test` |
| `frontend-build` | frontend-ci.yml | `tsc -b --noEmit && vite build` | Yes | `build` |
| `frontend-api-drift` | frontend-ci.yml | `openapi-typescript --check` | Yes | `contract` (drift half only) |
| `frontend-audit` | frontend-ci.yml | `npm audit --audit-level=high` | No (`continue-on-error` on the audit step) | `deps` (npm half only; no `pip-audit`, that's backend) |
| `frontend-contract` | frontend-ci.yml | `@redocly/cli lint` against `contracts/openapi.yaml` | Yes | `contract` (validation half; schemathesis excluded, needs a running backend) |
| `gitleaks` | security.yml | `gitleaks/gitleaks-action@v3`, full-history checkout | Yes | `sast` (secrets half) |
| `codeql` | security.yml | CodeQL init/analyze for `javascript-typescript`, scoped to `frontend/` | Yes, but isolated to `security.yml` so it cannot block `frontend-ci.yml` | `sast` (CodeQL half) |
