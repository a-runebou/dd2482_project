# CLAUDE.md

Schedular: a group scheduling app. Monorepo. Read `docs/ARCHITECTURE.md` and
`contracts/openapi.yaml` before writing code. If code and contract disagree, the code is wrong.

## Stack

- `frontend/`: React 19, TypeScript strict, Vite, TanStack Query, Tailwind, Vitest.
- `backend/`: Python 3.12, FastAPI, Pydantic v2, SQLAlchemy 2.0, Alembic, pytest, ruff, mypy strict.
- `infra/`: docker-compose (dev), Kubernetes with kustomize (prod), GitHub Actions.

## Non-negotiable rules

1. `contracts/openapi.yaml` is the source of truth. Do not change it as a side effect of an
   implementation task. If a change is needed, stop and say so.
2. Frontend API types live in `frontend/src/api/generated/` and are produced by
   `openapi-typescript`. Never hand-write a request or response type, never edit generated files.
3. All instants are UTC RFC 3339 with a `Z`. Slots are 30 minutes. The group's IANA timezone is
   used for rendering and for evaluating the daily window, nowhere else. Never send or store a
   local wall-clock time. Never use `datetime.utcnow()`; use `datetime.now(timezone.utc)`.
4. Errors are RFC 9457 `application/problem+json` with a `code` from the `ErrorCode` enum. Never
   invent a code. The frontend switches on `code`, never on `detail` or on HTTP status alone.
5. Lists are `{ "data": [...], "next_cursor": ... }`. Never return a bare array.
6. All validation and all authorization live in the backend. Frontend validation is UX only.
7. Limits come from `GET /api/v1/config`. Never hard-code 30, 31, 50 or any other limit in the
   frontend. The backend reads them from settings, not from literals scattered in handlers.
8. Non-members get `404 group_not_found` for a group, never `403`.
9. Availability writes are a full replacement of the caller's selection. No patch semantics.
10. The access token lives in memory only. Never `localStorage`, never `sessionStorage`. The
    refresh token is an HttpOnly cookie set by the backend and never read by JavaScript.
11. Every database call goes through the circuit breaker in `backend/app/infra/db.py`. When it is
    open, return `503` with code `db_circuit_open` and `Retry-After`, without touching the pool.
    The alert mail path must not use the database.
12. ICS parsing happens only in `backend/app/domain/ics.py`. Treat every feed as hostile: enforce
    the size and event caps, reject private and link-local addresses (SSRF), expand `RRULE` at
    import time, and never persist raw feed content.
13. No secret is ever committed. Configuration is environment variables only, listed in
    `.env.example`.
14. No new runtime dependency without saying why. No Redis, no Celery, no message broker, no
    second database. Background work is a job table plus `FOR UPDATE SKIP LOCKED`.
15. Business logic goes in `backend/app/domain/` as pure functions. Routers are thin, do
    authorization and serialization, and nothing else.

## Testing

- Every domain function in `app/domain/` needs unit tests, especially slot generation, window
  validation and the suggestion scoring, including a fixture spanning the 25 October 2026
  daylight-saving change.
- Every endpoint needs at least one happy-path and one authorization-failure test.
- Do not test generated code, framework behaviour or the schema itself.

## Style

- British English with Oxford spelling in comments, documentation and user-facing strings.
- Conventional commits. Small, reviewable changes, one concern per pull request.
- Type hints everywhere in Python; no `Any` without a comment justifying it.
- No comment that restates the code. Comments explain why, not what.

## When unsure

Ask, or write the assumption at the top of your diff. Do not silently widen the contract, invent
an endpoint, add a field, or relax a limit.
