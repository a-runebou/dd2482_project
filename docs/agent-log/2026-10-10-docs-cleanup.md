# 2026-10-10 docs-cleanup

## Task

Make `main` present a clean, accurate documentation set for external readers: a root README, an
ARCHITECTURE.md that describes what was built, consistent deployment documents, and no internal
working documents. The basis is `docs-inventory.md` (items X1 to X30, outline in its section 4)
and Adrian's decisions 1 to 7 in the round prompt.

## Model

Opus 5.5

## Plan

1. Verify the merge context on `main` (worker heartbeat, `docker-compose.deploy.yml`, dev
   deployment workflow) and that `archive/working-docs` exists. Done: all present, branch at
   `1abddd4`.
2. Deletions with plain `rm`: the four documents of decision 1 and the seventeen infrastructure
   logs of decision 2.
3. Re-point every reference to a deleted file. The archive branch is not published, so no link
   goes to it: references point to the document on `main` that now holds the content
   (ARCHITECTURE sections 6.1 and 10 for coordination items C1 to C3), or name the branch in
   plain text. Edits in `docs/backend.md` and `frontend/src` are limited to those references.
4. INDEX.md: drop the deleted logs' lines, move the heading to line 1, add the archive note,
   append this round's line.
5. Root README per the inventory outline, with Known limitations and How the repository was built.
6. ARCHITECTURE: header (X24), D13 and D15, container table and diagram (X5), section 8 rate
   limits (X27), section 10 environments rewritten from `infra/azure`, `infra/compose`, the dev
   workflows and the prod overlay (X1, X2, X5, X6, X9), section 11 rewritten from the workflows on
   `main` (X3, X4), section 12 regenerated from `git ls-files` (X7), section 13 compose command
   (X8), section 14 R1 and R2, X26 as a stated limitation. Other sections unchanged.
7. k8s README (X16, X17, X18), Mailpit comment, DECISIONS F6 and the C1 to C3 references (X19),
   frontend README Node version (X20), Azure README opening (X25), runbook banner (X28).
8. build-images-prod.yml: add `paths-ignore` (decision 6) if it is not already there.
9. Verify: em dashes, relative links, layout against `git ls-files`, actionlint,
   `kubectl kustomize` on the overlays, the greps in the acceptance criteria.

## Files changed

Deleted (plain `rm`):

- `docs/coordination/frontend-backend.md`, `docs/coordination/deployment-backend.md`,
  `docs/deployment/reviews/2026-10-04-feat-dev-deployment.md`, `docs-inventory.md` (untracked;
  deleted on Adrian's explicit instruction, so it is not on the archive branch).
- The seventeen infrastructure logs listed in decision 2. No infrastructure-only log was created
  after the inventory.

Edited: `README.md`, `docs/ARCHITECTURE.md`, `docs/deployment/runbook.md`, `infra/k8s/README.md`,
`infra/azure/README.md`, `infra/k8s/mailpit/deployment.yaml` (comment), `docs/frontend/DECISIONS.md`,
`frontend/README.md`, `docs/agent-log/INDEX.md`, this file. Reference re-pointing only:
`docs/backend.md`, `frontend/src/api/session.ts`, `frontend/src/features/auth/redirectPath.ts`
(comments).

Not edited: `.github/workflows/build-images-prod.yml` already carries
`paths-ignore: ['docs/**', '**/*.md']` on its push trigger (commit `53808da`), so decision 6
needed no change.

## What I did

Carried out the Plan; step 8 needed no change. The archive branch is unpublished (Adrian), so no
document links to it; re-pointed references go to ARCHITECTURE sections 6.1 and 10. The root
README follows the inventory outline, plus a "Development deployment" subsection. ARCHITECTURE now
has an environments table (local, dev, prod), the prod cost reasoning, the workflows on `main`,
both delivery paths and why prod releases are manual, a regenerated layout and the real compose
command; R1, R2 and R4 were updated. The k8s README gained a "Differences between the rehearsal
and prod" section.

Re-pointed references in files outside the primary area:

- `docs/backend.md` lines 6, 256, 723-724, 745 and 766: coordination note to
  `ARCHITECTURE.md#10-environments` or "archived" wording.
- `frontend/src/api/session.ts` (comment, item C3) and
  `frontend/src/features/auth/redirectPath.ts` (comment, item C2): to ARCHITECTURE section 6.1.

## Discrepancies noticed

- `backend/alembic/versions/` on `main` contains the two "temporary" revisions again (`d39fd97`,
  "fix dev migration history"). `deploy-prod.sh release` refuses any image whose Alembic history
  contains "temporary", so no `main` commit from `d39fd97` onwards can be released to prod as the
  script stands. Not a documentation fix; Adrian and Alexander must decide.
- `docs/dev-deployment-security.md` is on `main` and empty (0 bytes). Not in the deletion list,
  left alone.
- Four kept logs mention `docs/coordination/frontend-backend.md` in prose
  (2026-09-12-frontend-container-image, 2026-09-12-session-layer, 2026-09-12-sign-in-request,
  2026-09-14-contract-reconciliation). Left as history on Adrian's instruction, since logs are
  off limits.
- `docs/backend.md` still says there is no `.env.example` (X10). Not fixed: only reference edits
  were permitted in that file.
- The dev compose file pins `axllent/mailpit:latest`; the deploy compose file and the cluster pin
  `v1.27.8`.
- The prod overlay on `main` still names `letsencrypt-staging`, so a release of `main` serves a
  certificate browsers do not trust; runbook step 8 (switch to `letsencrypt-prod`) is not
  committed. Stated in ARCHITECTURE section 10 and the README's Known limitations.
- Logs in INDEX.md are not in date order (the 2026-09-16 entries sit at the top); kept as they
  were apart from the moved first line.

## Assumptions made

- The Raspberry Pi as the dev host comes from the round prompt; the files only say a self-hosted
  ARM64 runner labelled `dev-deployment`.
- The date of the first prod release is not in any file, so the runbook says it has been used for
  a release without giving a date.
- There is no licence file, so the README says so instead of naming a licence.

## Follow-ups for later

- Decide on the two temporary Alembic revisions before the next prod release.
- Alexander: X10 in `docs/backend.md`, and the empty `docs/dev-deployment-security.md`.
- Choose a licence, if the repository is to carry one.

## Commands to verify

Results in this session: no reference to the deleted paths outside the four kept logs; the
ARCHITECTURE grep is empty; relative links and anchors in the changed Markdown resolve (local
script, no link checker installed); actionlint passes and `.github/` is unchanged;
`kubectl kustomize` renders all six overlays and `mailpit`; no em dash in a changed file; Prettier
passes on the two edited frontend files; 27 logs and 27 INDEX lines, one each.

    git status --short
    git grep -n -E "docs/coordination|deployment/reviews|docs-inventory" -- ':!docs/agent-log'
    grep -n "PUBLIC_API_URL\|v1 draft\|free-tier cluster" docs/ARCHITECTURE.md
    git ls-files infra .github
    actionlint .github/workflows/build-images-prod.yml
    grep -rn "$(printf '\342\200\224')" README.md docs/ARCHITECTURE.md docs/deployment/runbook.md infra/k8s/README.md infra/azure/README.md docs/frontend/DECISIONS.md frontend/README.md
