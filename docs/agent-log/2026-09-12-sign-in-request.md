# 2026-09-12 sign-in-request

## Task

T7: `/sign-in`, a page where anyone can request a magic link by e-mail and see a confirmation
that reveals nothing about whether the address exists, with rate limiting and validation errors
handled distinctly, following the create-group form's established pattern.

## Model

Sonnet 5

## Files changed

- `frontend/src/features/auth/validateEmail.ts` (new)
- `frontend/src/features/auth/validateEmail.test.ts` (new)
- `frontend/src/features/auth/requestMagicLink.ts` (new)
- `frontend/src/features/auth/SignInForm.tsx` (new)
- `frontend/src/features/auth/SignInForm.test.tsx` (new)
- `frontend/src/pages/SignInPage.tsx` (new)
- `frontend/src/pages/SignInPage.test.tsx` (new)
- `frontend/src/pages/HomePage.tsx` (added a "Sign in" link)
- `frontend/src/app/routes.tsx` (added the `/sign-in` route)
- `frontend/src/app/routes.test.tsx` (added two routing cases)
- `frontend/src/mocks/handlers.ts` (added the default `POST /auth/magic-link` handler)
- `docs/frontend/DECISIONS.md` (appended F16)
- `docs/agent-log/2026-09-12-sign-in-request.md` (this file)
- `docs/agent-log/INDEX.md` (appended one line)

## What I did

Preflight: `git status --short` showed only `.DS_Store` untracked, so I proceeded.

Read `contracts/openapi.yaml`'s `/auth/magic-link` path, `MagicLinkRequest` and the shared
`RateLimited`/`Problem` responses; ARCHITECTURE 6.1 (the sign-in sequence and token lifetimes),
7.4 (error codes) and 8 (the 5-per-hour magic-link rate limit); and item C2 of
`docs/coordination/frontend-backend.md`, which is why `redirect_path` is not sent.

`src/features/auth/validateEmail.ts`: a pure function requiring a non-empty value, no
whitespace, and an `@` with a non-empty part on each side — nothing stricter, per CLAUDE.md
rule 6.

`src/features/auth/requestMagicLink.ts`: `useMutation` options for `POST /auth/magic-link`,
sending only `{ email }`. No query invalidation (there is no session yet) and no idempotency
key (the endpoint has no `Idempotency-Key` parameter in the contract, unlike group creation).

`src/features/auth/SignInForm.tsx`: follows `CreateGroupForm`'s pattern — a native form, UX
validation on submit with `aria-invalid`/`aria-describedby`, a synchronous in-flight ref so a
double click sends one request, and a disabled submit while pending. Server errors switch on
`kind`/`code` only: `rate_limited` renders its own message (whole minutes rounded up, or a
general message when `Retry-After` was not readable) with no retry button; `validation_failed`
puts an `email`-field entry at the field and everything else at form level; anything else
renders the shared `ApiErrorNotice`, whose retry resubmits the last address sent (tracked in a
ref, the same idea as `CreateGroupForm`'s `attemptRef`), not necessarily what is currently
typed. On success the form is replaced by a `role="status"` confirmation that names neither the
submitted address nor whether an account exists, with a button that resets the mutation and
clears the field.

Wired `/sign-in` into `appRoutes`, added a "Sign in" link on `HomePage`, added the default MSW
handler (`202`, empty body) to `handlers.ts`, and added two `routes.test.tsx` cases (route
renders, and the home-page link navigates there) without touching the existing ones.

Appended F16 to `docs/frontend/DECISIONS.md`.

## Discrepancies noticed

None in the contract or architecture docs for this endpoint.

## Assumptions made

- The confirmation's copy ("If that address has an account, a sign-in link is on its way." /
  "The link expires in fifteen minutes and can be used once.") is my own wording satisfying the
  two required facts (no account disclosure; 15-minute, single-use link) — the task did not
  specify exact strings.
- `ApiErrorNotice`'s retry resubmits the last address a request was actually sent for (via a
  ref), not the field's live value if it was edited after the failure but before retrying — this
  mirrors `CreateGroupForm`'s `attemptRef` approach and matches "retry resubmits the same
  address".
- No idempotency key for this request: the contract's `MagicLinkRequest`/`requestMagicLink`
  operation has no `Idempotency-Key` parameter, unlike `POST /groups`, so none is sent.

## Follow-ups for later

- `redirect_path` is intentionally not sent; wiring it in depends on item C2 of
  `docs/coordination/frontend-backend.md` being settled.
- Adrian's manual acceptance step (`npm run dev:mock`, follow the flow) is still outstanding.

## Commands to verify

Run from `frontend/` on Node 24 (confirmed with `nvm use 24`; the ambient shell node was v25,
which fails `npm ci`'s `engines` check):

```
npm ci
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build
npm run check:api
grep -rnE "localStorage|sessionStorage" src/features src/pages   # expect no matches, exit 1
```

Manual, for Adrian:

```
npm run dev:mock
# open /, click "Sign in", submit an address, confirm no address is shown,
# click "Use a different address" and confirm the field is empty
```
