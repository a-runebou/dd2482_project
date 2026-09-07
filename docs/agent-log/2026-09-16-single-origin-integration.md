# Task

Integrate the imported frontend and backend through the finalized single-origin local Compose topology.

# Model

GitHub Copilot

# Files changed

- `backend/app/api/groups.py`
- `backend/app/api/schemas.py`
- `backend/app/services/groups.py`
- `backend/tests/test_groups.py`
- `frontend/src/features/auth/requestMagicLink.ts`
- `frontend/src/features/auth/SignInForm.tsx`
- `frontend/src/features/auth/SignInForm.test.tsx`
- `infra/compose/docker-compose.dev.yml`
- `infra/compose/.env.example`

# What I did

Added the frontend Compose service on port 8080 with nginx proxying `/api` to `backend:8000`, aligned the example public URL, and passed the current frontend path as `redirect_path` for magic-link requests. Fixed invite rotation to return a transient `invite_url` through the contract's PATCH response without storing plaintext tokens.

# Discrepancies noticed

Normal group reads still return `confirmed_proposal` and `feed_url` as null. The frontend consumes both fields, but feed URLs cannot be reconstructed from the stored one-way hash without a separate design decision. The backend upload-too-large response still uses `validation_failed`.

# Assumptions made

The local runtime uses `http://localhost:8080` as the public application URL. The existing local `.env` was not changed; validation supplied the URL as a command-level override.

# Follow-ups for later

Decide how feed tokens are delivered or stored, populate confirmed proposal views, and reconcile remaining backend contract gaps such as upload status mapping and broader rate limiting.

# Commands to verify

- `docker compose ... config --quiet`
- `cd backend && pytest -q`
- `cd backend && mypy app`
- `cd backend && ruff check .`
- Frontend Node 24 container: `npm run test`, `npm run typecheck`, `npm run build`, `npm run lint`, `npm run check:api`
- `git diff --check`
- Runtime: frontend `/healthz`, proxied `/api/v1/config`, `/api/v1/groups`, and `/api/v1/auth/magic-link`
