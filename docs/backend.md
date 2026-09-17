# Backend documentation

This document describes the backend as it is implemented in this repository. The primary
references are [the backend source](../backend/), [the OpenAPI contract](../contracts/openapi.yaml),
[the architecture document](ARCHITECTURE.md), and the
[frontend/backend coordination notes](coordination/frontend-backend.md).

## Backend overview

Schedular's backend is a Python 3.12 service for passwordless authentication, group membership,
availability collection, scheduling proposals and votes, calendar import, calendar export, and
reminder mail.

The main runtime components are:

| Component | Current implementation | Why it exists |
| --- | --- | --- |
| HTTP API | FastAPI with Uvicorn | Receives requests, performs authentication and authorization, calls services, and serializes responses. |
| Validation and schemas | Pydantic v2 | Validates request bodies, query parameters, paths, and response models. |
| Domain logic | Pure Python functions in `app/domain/` | Keeps slot generation, suggestion scoring, authentication primitives, and ICS parsing independent of HTTP and database sessions. |
| Persistence | SQLAlchemy 2 with PostgreSQL 16 | Stores users, tokens, groups, memberships, availability, proposals, votes, calendar sources, busy blocks, jobs, and idempotency records. |
| Schema evolution | Alembic | Applies the versioned PostgreSQL migrations before application processes start. |
| Background work | A separate Python worker using the `jobs` table | Sends mail, polls URL calendars, and sends reminders without making the API process a scheduler. |
| Local orchestration | Docker Compose | Starts PostgreSQL, migrations, the API, the worker, the frontend, and Mailpit with health and completion dependencies. |
| API contract | Hand-written OpenAPI 3.1 at `contracts/openapi.yaml` | Defines the public API. The backend is expected to conform to it; the frontend generates types from it. |

The API is mounted below `/api/v1`. Operational endpoints are outside that prefix:
`/healthz`, `/readyz`, and `/metrics`.

All instants crossing the API are UTC RFC 3339 values with a `Z` suffix. Group windows are
interpreted using the group's IANA timezone, but persisted and transmitted times remain UTC.
Slots are fixed at 30 minutes in the current implementation.

## Directory structure

```text
backend/
  app/
    api/          HTTP routers, dependencies, schemas, error mapping, middleware
    domain/       pure business and parsing functions
    infra/        database, circuit breaker, mail, and external ICS fetching
      models/     SQLAlchemy ORM models
    services/     transaction-oriented application use cases
    worker/       job claiming, dispatch, calendar polling, and mail handlers
    main.py       FastAPI application and operational endpoints
  alembic/        migration environment and revision scripts
  alembic.ini     Alembic configuration entry point
  tests/          pytest unit and API tests
  pyproject.toml  package metadata, dependencies, and tool configuration
  Dockerfile      Python 3.12 container image
```

### `app/api/`

The routers are the HTTP boundary. They declare routes and response models, obtain the current
user and database session through FastAPI dependencies, call a service, and translate known
service exceptions into `ProblemException` responses.

Important modules include:

- `router.py`: assembles the `/config`, `/auth`, `/me`, `/groups`, export, and reserved meta
  routers.
- `auth.py`: magic-link exchange, refresh, and logout endpoints.
- `me.py`: profile, calendar-source, and busy-block endpoints.
- `groups.py`: group, membership, availability, proposal, vote, and confirmation endpoints.
- `errors.py`: RFC 9457-style response creation and exception handlers.
- `dependencies.py`: bearer-token authentication and current-user lookup.
- `schemas.py`: Pydantic request and response models.
- `idempotency.py`: middleware for mutating requests carrying `Idempotency-Key`.

### `app/domain/`

Domain modules are intended to be pure functions with no FastAPI or SQLAlchemy dependency. They
contain the rules that are easiest to test in isolation:

- `auth.py`: token generation, hashing, UUID creation, and JWT access-token operations.
- `slots.py`: group-window validation, local-time slot generation, and UTC normalization.
- `suggestions.py`: ranked candidate-window calculation.
- `ics.py`: hostile-input ICS parsing, recurrence expansion, busy-block conversion, and event ICS
  rendering.
- `groups.py` and `calendar.py`: small domain helpers and typed domain values.

ICS parsing is deliberately only in `app/domain/ics.py`; the frontend never parses calendar data.

### `app/infra/`

Infrastructure owns integrations and resource access:

- `db.py` creates the SQLAlchemy engine and session factory. `guarded_session()` passes every
  database operation through the database circuit breaker.
- `circuit.py` implements the in-process closed/open/half-open database circuit breaker.
- `circuit_alerts.py` sends transition alerts without using the database.
- `mail.py` sends SMTP messages.
- `ics_fetch.py` fetches subscription URLs with the calendar-fetch safety checks.
- `models/` defines the ORM tables.

### `app/infra/models/`

The model modules map the persisted data to PostgreSQL tables:

- `user.py`: users, magic links, and rotating refresh tokens.
- `group.py`: groups, memberships, roles, and group state.
- `scheduling.py`: availability, proposals, and votes.
- `calendar.py`: calendar sources and derived busy blocks.
- `job.py`: the database-backed background queue.
- `idempotency.py`: stored successful or client-error mutation responses for replay.

The models are imported by `alembic/env.py` so Alembic's metadata includes all tables.

### `app/services/`

Services are the application use-case layer. They combine domain functions with SQLAlchemy
queries and transactions. Examples include authentication, group mutation, membership actions,
availability replacement, proposal and vote operations, confirmation, calendar-source management,
and export.

A service should own a complete use case and its transaction boundaries. Routers should not
reimplement those rules.

### `app/worker/`

The worker is the same backend image started with a different command. `worker/main.py` loops
forever, claims one due job, dispatches it, and marks it complete or schedules a retry.

- `jobs.py`: `FOR UPDATE SKIP LOCKED` claiming, completion, and exponential retry scheduling.
- `handlers.py`: dispatch by job kind.
- `calendar.py`: URL fetch, parse, busy-block replacement, source status, and next-poll enqueue.
- `email.py`: magic-link and reminder mail.

### `tests/`

The pytest suite covers API behavior, domain functions, authentication, groups, scheduling,
calendar parsing and fetching, export, errors, idempotency, the circuit breaker, mail, and worker
behavior. Run it from `backend/` so the configured `pythonpath` resolves `app`.

### Configuration files

- `app/config.py` reads environment variables and supplies development defaults.
- `pyproject.toml` declares Python 3.12, runtime/dev dependencies, pytest paths, Ruff, and strict
  mypy settings.
- `alembic.ini` points Alembic at `backend/alembic`; `alembic/env.py` replaces its placeholder
  database URL with `DATABASE_URL` from `app.config`.
- `infra/compose/docker-compose.dev.yml` supplies the development container environment.

### Dependency direction

The intended direction is:

```text
api -> services -> domain
api -> infra (through dependencies and response mapping)
services -> domain and infra.models/infra.db
worker -> services, domain, and infra
infra.models -> infra.db.Base
```

`domain` should remain independent of FastAPI, SQLAlchemy, and the worker. Routers should stay
thin: authorization and serialization belong at the API boundary, while business decisions belong
in services or pure domain functions.

## Request flow

For a normal browser request in development or the containerized stack:

```text
frontend browser
  -> frontend nginx / Vite proxy
  -> /api/v1 FastAPI route
  -> authentication/dependency injection
  -> service and domain logic
  -> guarded SQLAlchemy session
  -> PostgreSQL
  -> Pydantic response model
  -> RFC 9457 Problem response or JSON response
```

In the Compose frontend image, nginx serves the SPA and proxies `/api/` to `BACKEND_ORIGIN`.
The backend itself listens on port 8000 inside its container. The Vite development proxy follows
the same path-based arrangement.

FastAPI dependencies provide the current user and a database session. The current-user dependency
reads the bearer access token, validates the JWT, and loads the user. The database dependency
uses `get_db()`, which wraps a `guarded_session()`. If the circuit is open, the session is never
created and the request receives `503 db_circuit_open` with `Retry-After: 30`.

A route normally performs the following work:

1. FastAPI parses and validates the request with Pydantic and parameter declarations.
2. Authentication and membership/role checks run through dependencies or the service call.
3. The service loads the relevant models, invokes pure domain rules, and commits its transaction.
4. The router converts the resulting model/view into the contract response model.
5. Exception handlers convert validation, HTTP, application, circuit, and unhandled errors into
   `application/problem+json`.

## Authentication

Authentication is passwordless and uses a short-lived access token plus a rotating refresh token.
The backend does not store passwords.

### Magic-link request

`POST /api/v1/auth/magic-link` accepts an email address and optional validated `redirect_path`.
The service normalizes the address, creates the user if necessary, creates a single-use hashed
magic-link record, and inserts an `email_send` job. The endpoint returns `202` without revealing
whether the address already belonged to a user.

The worker later builds a link using `PUBLIC_APP_URL`:

```text
/auth/callback?token=<one-time-token>&redirect=<relative-path>
```

The raw token is placed in the job payload so it can be mailed, while the database stores only its
hash. No real token belongs in documentation, logs, or committed fixtures.

### Session exchange

`POST /api/v1/auth/session` consumes a valid, unexpired, unused magic-link token. It returns a
`SessionResponse` containing:

- a JWT access token,
- `expires_in` (900 seconds by default), and
- the authenticated user.

It also sets the refresh-token cookie. The access token is intended to remain in frontend memory;
JavaScript does not read the refresh cookie.

### Refresh rotation and reuse handling

`POST /api/v1/auth/refresh` reads the refresh cookie, validates its stored hash, revokes the
presented token, creates a successor in the same token family, and returns a new access token and
cookie. The default refresh lifetime is 30 days.

The configured grace value is 30 seconds. If the immediately preceding revoked token is reused
while an active successor exists and the reuse is within that grace window, the current service
returns `401 unauthenticated` without revoking the whole family. Reuse outside that special case
revokes every token in the family and also returns `401`. This behavior is the implementation to
rely on; the architecture notes describe the same grace decision but should not be read as a
promise of a successful response for a reused token.

### Logout

`DELETE /api/v1/auth/session` revokes the refresh-token family associated with the cookie and
clears the cookie. A missing or invalid cookie produces `401 unauthenticated`.

### Cookie properties

The cookie is named `refresh_token` and is set with:

- `HttpOnly`, so browser JavaScript cannot read it;
- `SameSite=Lax`;
- `Secure` according to `AUTH_COOKIE_SECURE` (false by default in development);
- `Max-Age` equal to the configured refresh lifetime; and
- `Path=/api/v1/auth`, limiting it to authentication endpoints.

The single-origin decision in [the coordination document](coordination/frontend-backend.md) means
no CORS configuration is required for the development topology.

## Groups

Groups are addressed by a unique 12-character slug in URLs. A group stores its name,
description, owner, IANA timezone, inclusive date range, daily local-time window, fixed slot size,
state, version, invite-token hash, feed-token hash, and timestamps.

### Creation and membership

`POST /api/v1/groups` validates the window and date range, enforces the per-user group limit,
creates the group, makes the caller its owner, creates the initial membership, and returns a
one-time-visible invite URL in the `GroupWithInvite` response.

A group has exactly one owner and zero or more members. Memberships carry an `owner` or `member`
role, notification preference, joined time, and availability-submission timestamp. A member joins
with `POST /groups/{slug}/join` and the invite token. Invalid or non-member group access is
represented as `404 group_not_found` rather than a distinguishable authorization response.

The owner can remove members but cannot remove themselves. Members can leave through the same
membership deletion route. Membership deletion also removes that member's group availability and
votes as implemented by the membership service.

### Invite links and rotation

Invite tokens are stored hashed. `PATCH /groups/{slug}` accepts the owner-only
`rotate_invite_token` operation; rotation replaces the hash and invalidates old links. The returned
invite URL is only populated for a rotation or group creation. The join flow is implemented by the
frontend, which preserves the token through sign-in using session storage; the backend accepts the
token in the join request body.

### Version and ETags

`Group.version` starts at 1 and is incremented by `bump_group_version()` for group and scheduling
mutations handled by the services. Group reads return an ETag derived as the quoted version,
for example `"3"`. A matching `If-None-Match` returns `304 Not Modified`.

Owner group mutations accept `If-Match`. A mismatch produces `412 version_conflict`. The frontend
also uses the group version/ETag relationship when polling group and availability reads, so a
mutation that forgets to increment the version can leave clients with a stale `304` response.

## Scheduling

Scheduling has two stages: availability aggregation and explicit proposals.

### Availability

`PUT /groups/{slug}/availability/me` is a full replacement of the caller's selection. The body
contains UTC instants in `available` and `preferred` arrays. A slot appearing in both is treated as
preferred. The backend validates timezone-aware instants, 30-minute alignment, group date range,
daily window, and configured maximum range, then replaces the caller's rows in one transaction.

The availability matrix returns a slot vector, participant indexes, aggregate counts, response
counts, member counts, and the current group version. The group timezone is used to evaluate local
dates and windows; the stored slot instants remain UTC.

Busy blocks imported from calendar sources are read separately through `/me/busy`. They inform the
frontend grid but do not create availability rows and do not prevent a user from marking a slot
available.

### Suggestions and proposals

Suggestions are computed on demand and are not persisted. The backend generates contiguous windows,
counts available and preferred members, gives preferred availability double weight, requires the
same fully available member set across a candidate window, ranks by score, and returns the requested
limit.

The owner creates proposals either from a suggestion or manually. Proposals store start/end UTC
instants, origin (`suggested` or `manual`), creator, and creation time. The proposal limit is
checked per group. Members vote `yes`, `maybe`, or `no`; each member has at most one vote per
proposal and changing a vote replaces the previous value.

### Confirmation and unconfirmation

Only the owner can confirm a proposal. Confirmation changes the group state from `open` to
`confirmed`, stores `confirmed_proposal_id`, increments the group version, and optionally creates
one `reminder_send` job per opted-in member. Availability, proposal, and vote writes are rejected
with `group_confirmed` while the group is confirmed.

Only the owner can unconfirm. Unconfirmation returns the group to `open`, clears
`confirmed_proposal_id`, increments the version, and deletes pending reminder jobs matching the
confirmed proposal. The export service separately uses the confirmed proposal to render a one-off
ICS file or token-scoped feed.

## Calendar sources

Calendar sources belong to users rather than groups, so one import can provide busy information to
all of that user's groups.

### URL sources and uploads

`POST /api/v1/me/calendar-sources` validates an `http`, `https`, or `webcal` URL, stores it as a
`pending` source, and enqueues an immediate `ics_poll` job. The configured maximum source count is
enforced.

`POST /api/v1/me/calendar-sources/upload` reads at most `max_ics_bytes + 1`, rejects an oversized
file, parses the content immediately, stores an `upload` source in `ok` state, and writes its
initial busy blocks. Uploaded source URLs are null and cannot be manually refreshed later.

### Parsing and busy blocks

`app/domain/ics.py` treats ICS input as hostile. It enforces byte and event caps, requires valid
UTF-8/iCalendar content, handles `DTEND` or `DURATION` (defaulting an event with neither to 30
minutes), converts values to UTC, ignores invalid/non-positive intervals, and expands `RRULE`
occurrences within the calculated user horizon. Raw feed content is not persisted.

A successful URL poll deletes and recreates all busy blocks for that source in the same database
transaction, updates the source status, event count, ETag, and poll time, and enqueues the next
poll. Busy blocks are derived data and cascade when their source is deleted.

### Manual refresh and source status

`POST /me/calendar-sources/{sourceId}/refresh` is available for URL sources. It marks the source
pending and enqueues a deduplicated poll job. Refreshes inside the configured 300-second cooldown
return `429 rate_limited` with a numeric `Retry-After` header.

Sources expose `ok`, `pending`, or `error` status, the last poll time, event count, and
`last_error_code`. Fetch failures set `ics_fetch_failed`; parse failures set `ics_parse_failed`.
The failed job is still sent through the worker retry path, so a later attempt can recover the
source.

## Worker and jobs

The worker is started by the Compose `worker` service with:

```bash
python -m app.worker.main
```

It uses the same backend image and environment as the API but does not serve HTTP. Every loop opens
a database session, claims one due incomplete job using `SELECT ... FOR UPDATE SKIP LOCKED`, marks
it locked and increments `attempts`, then dispatches it.

The current job kinds are:

| Kind | Created by | Handler |
| --- | --- | --- |
| `email_send` | Magic-link request | Sends the sign-in email through SMTP. |
| `ics_poll` | URL source creation, manual refresh, and successful poll | Fetches, parses, and replaces busy blocks, then schedules the next poll. |
| `reminder_send` | Group confirmation with reminders enabled | Loads the user/group/proposal and sends a meeting reminder. |

Successful jobs receive `completed_at`. Exceptions clear the lock, save up to 2,000 characters of
error text, and schedule a retry with exponential delay capped at one hour. The worker sleeps for
one second when there is no due job.

The queue requires PostgreSQL row-locking and the `jobs` table. It is intentionally not Redis,
Celery, or a separate broker. The worker must start after migrations because it queries `jobs` and
other migrated tables as soon as it begins.

## Database

### PostgreSQL and SQLAlchemy

Development uses `postgres:16`. The application uses the SQLAlchemy PostgreSQL URL from
`DATABASE_URL`, `pool_pre_ping`, a two-second pool timeout, and a three-second PostgreSQL statement
timeout. `SessionLocal` creates non-autoflush sessions with `expire_on_commit=False`.

Every application database call goes through `guarded_session()` and the circuit breaker. The
breaker opens after repeated failures, refuses database-backed work without touching the pool, and
returns `db_circuit_open`. It records state, transition, and failure metrics and can send a direct
SMTP alert to `OPS_ALERT_EMAIL`.

### Models and migrations

The ORM metadata is rooted at `app.infra.db.Base`. `alembic/env.py` imports
`app.infra.models`, obtains settings, replaces the placeholder Alembic URL with `DATABASE_URL`,
and runs migrations against `Base.metadata`.

The current migration directory contains six revision files:

1. `02daa394a268_create_core_schema.py`
2. `300c4ef3c65e_add_confirmed_proposal_id.py`
3. `7f60c1c680f9_add_calendar_source_metadata.py`
4. `bcb51f836df7_add_user_notification_preference.py`
5. `ec8426316aae_add_availability_submission_tracking.py`
6. `40f928786ecb_add_idempotency_records.py`

The first item creates the core schema and the remaining revisions extend it. Always inspect
`alembic heads` rather than relying on a copied revision list when diagnosing a database.

### Fresh database initialization

A fresh local database is initialized by the Compose `migrate` service. Its command is:

```bash
alembic upgrade head
```

It depends on PostgreSQL's health check. The API and worker depend on `migrate` completing
successfully, so they do not start against an uninitialized schema.

The expected startup sequence is:

```text
postgres healthy
  -> migrate runs alembic upgrade head
  -> migrate exits successfully
  -> backend and worker start
  -> frontend starts
```

`migrate` showing `Exited (0)` is expected: it is a one-shot migration container, not a long-running
service. PostgreSQL data is kept in the named `postgres_data` volume. Removing that volume deletes
the local database and is the destructive reset operation.

## Docker development setup

Use the actual Compose file:

```bash
docker compose -f infra/compose/docker-compose.dev.yml up --build
```

The services are:

| Service | Purpose | Important dependencies/ports |
| --- | --- | --- |
| `postgres` | PostgreSQL 16 database | Host port `5432`; health check uses `pg_isready`; persists `postgres_data`. |
| `migrate` | One-shot Alembic migration runner | Waits for healthy `postgres`; must exit 0 before API/worker. |
| `backend` | FastAPI/Uvicorn API | Container port `8000`; waits for successful migration, Mailpit started, and worker started. |
| `worker` | Background job loop | Waits for successful migration and Mailpit started; shares the backend image/code. |
| `frontend` | Built SPA and nginx reverse proxy | Host port `8080`; waits for backend started and proxies `/api` to `http://backend:8000`. |
| `mailpit` | Development SMTP sink and web UI | SMTP `1025`; UI `8025`; receives magic links and reminders without external delivery. |

Compose passes the same database, authentication, application URL, SMTP, and alert settings to
`migrate`, `backend`, and `worker`. The backend URL is currently hard-coded inside the Compose
file as `postgresql+psycopg://schedular:schedular@postgres:5432/schedular`; it is not built from
`DATABASE_URL` interpolation there.

## Environment variables

`app/config.py` reads the backend variables below. The Compose file also interpolates PostgreSQL
and a few frontend/mail variables. There is no `.env.example` in the inspected repository, so the
examples below are safe development examples, not committed secret values.

| Variable | Service | Purpose | Required in development? | Safe development value |
| --- | --- | --- | --- | --- |
| `ENVIRONMENT` | backend, worker, migrate | Environment label returned by `/config` and used for runtime configuration. | No; defaults to `development`. | `development` |
| `DATABASE_URL` | backend, worker, migrate | SQLAlchemy/Alembic PostgreSQL connection URL. | Yes for a non-local database; Compose supplies an equivalent URL directly. | `postgresql+psycopg://schedular:schedular@localhost:5432/schedular` |
| `JWT_SECRET` | backend, worker, migrate | Signs and verifies access JWTs. | Operationally yes; the code has an explicitly unsafe development fallback. | `development-only-not-a-production-secret` |
| `PUBLIC_APP_URL` | backend, worker, migrate | Base URL placed in magic links and invite links. | No; defaults to `http://localhost:5173`. | `http://localhost:5173` |
| `AUTH_COOKIE_SECURE` | backend, worker, migrate | Controls the refresh cookie's `Secure` flag. | No; defaults to false. | `false` |
| `BUILD_SHA` | backend, worker, migrate | Optional build identifier exposed by `/config`. | No. | `local` |
| `SMTP_HOST` | backend, worker, migrate | SMTP server used for magic-link, reminder, and circuit-alert mail. | No; defaults to `mailpit`. | `mailpit` |
| `SMTP_PORT` | backend, worker, migrate | SMTP TCP port. | No; defaults to `1025`. | `1025` |
| `SMTP_USERNAME` | backend, worker, migrate | Optional SMTP username. | No in Mailpit development. | empty |
| `SMTP_PASSWORD` | backend, worker, migrate | Optional SMTP password. | No in Mailpit development. | empty |
| `SMTP_FROM` | backend, worker, migrate | From address for generated mail. | No; defaults to `schedular@example.local`. | `schedular@example.local` |
| `OPS_ALERT_EMAIL` | backend, worker, migrate | Optional recipient for database circuit transition alerts. | No. | empty |
| `POSTGRES_DB` | postgres | Database name used when PostgreSQL initializes its data directory. | Yes for Compose interpolation. | `schedular` |
| `POSTGRES_USER` | postgres | Initial PostgreSQL role. | Yes for Compose interpolation. | `schedular` |
| `POSTGRES_PASSWORD` | postgres | Initial PostgreSQL password. | Yes for Compose interpolation. | `schedular` |
| `POSTGRES_PORT` | Compose/operator | Requested external PostgreSQL port variable. | No; current Compose hard-codes `5432:5432` and does not consume this variable. | `5432` |
| `MAILPIT_UI_PORT` | Compose/operator | Requested Mailpit UI port variable. | No; current Compose hard-codes `8025:8025` and does not consume this variable. | `8025` |
| `BACKEND_ORIGIN` | frontend | nginx upstream for `/api/` requests. | No in current Compose; it supplies `http://backend:8000`. | `http://backend:8000` |
| `FRONTEND_PORT` | Compose/operator | Requested frontend port variable. | No; current Compose hard-codes `8080:8080` and the nginx image listens on 8080. | `8080` |

The current Compose file requires values for `${POSTGRES_DB}`, `${POSTGRES_USER}`,
`${POSTGRES_PASSWORD}`, `${JWT_SECRET}`, `${PUBLIC_APP_URL}`, `${AUTH_COOKIE_SECURE}`,
`${BUILD_SHA}`, `${SMTP_HOST}`, `${SMTP_PORT}`, `${SMTP_USERNAME}`, `${SMTP_PASSWORD}`,
`${SMTP_FROM}`, and `${OPS_ALERT_EMAIL}` to be available through Compose interpolation, even when
some have application defaults. Set them in a local uncommitted `.env` file or the shell; never
commit real secrets.

Additional settings exist in `app/config.py`, including slot and range limits, calendar caps,
refresh cooldown, polling interval, reminder lead time, access-token lifetime, refresh-token
lifetime, refresh grace, and magic-link lifetime. They currently use code defaults rather than
separate environment variables.

## Error handling

Backend failures are represented as `application/problem+json` documents with this core shape:

```json
{
  "type": "about:blank",
  "title": "Validation failed",
  "status": 400,
  "code": "validation_failed",
  "instance": "/api/v1/groups"
}
```

`detail` and `errors` are optional. Field errors contain a field name and message. FastAPI request
validation is converted from its normal response into `400 validation_failed`; 404, 405, unhandled
exceptions, application exceptions, and circuit-open failures are also mapped by the handlers in
`app/api/errors.py`.

Important current codes include:

| Code | Typical status | Meaning |
| --- | ---: | --- |
| `validation_failed` | 400 | Request schema, parameter, URL, cursor, or other validation failure. |
| `unauthenticated` | 401 | Missing, invalid, expired, or already-used credentials. |
| `token_expired` | 401 | Access token expiry signal used by the client refresh path where emitted. |
| `forbidden`, `not_owner` | 403 | Authenticated but not allowed; owner-only operation when `not_owner`. |
| `not_found`, `group_not_found` | 404 | Missing resource; groups deliberately conceal non-members as `group_not_found`. |
| `already_member`, `group_confirmed`, `member_limit_reached`, `group_limit_reached`, `proposal_limit_reached`, `calendar_source_limit_reached`, `idempotency_key_reuse` | 409 | Conflict or configured resource limit. |
| `version_conflict` | 412 | `If-Match` did not match the current group ETag/version. |
| `slot_not_in_window`, `range_too_long`, `ics_parse_failed` | 422 | Validly shaped request that violates a scheduling/calendar rule. |
| `rate_limited` | 429 | Manual calendar refresh is inside its cooldown; includes `Retry-After`. |
| `internal_error` | 500 | Unexpected server exception. |
| `ics_fetch_failed` | 502 | External calendar fetch failed in the worker/source status path. |
| `db_circuit_open`, `service_unavailable` | 503 | Database circuit is open or another dependency is unavailable. |

The stable `code`, not `detail` or status alone, is the client-facing branching key. The full
normative list remains in [the contract](../contracts/openapi.yaml).

## Idempotency

Mutating requests may carry an `Idempotency-Key`, which must be a UUID. The
`IdempotencyMiddleware` handles `POST`, `PUT`, `PATCH`, and `DELETE` requests that include the
header.

For a new key, the middleware hashes the request body, calls the route, consumes the response body,
and stores the status, response body, selected response headers, method, path, body hash, and
creation time in `idempotency_records` when the status is below 500. A repeat of the same key,
method, path, and body within 24 hours replays the stored response without calling the route again.

Reusing a key for a different request returns `409 idempotency_key_reuse`. Expired records are
removed when encountered. Responses with status 500 or higher are not stored, so a server failure
can be retried. The middleware buffers streaming response bodies so normal Starlette responses can
be replayed safely.

## Health and readiness

- `GET /healthz` returns `200 {"status":"ok"}`. It proves that the FastAPI process is alive and
  can serve the endpoint; it does not prove PostgreSQL is reachable.
- `GET /readyz` executes `SELECT 1` through the database circuit path. It returns
  `200 {"status":"ready"}` when the database is reachable and `503 {"status":"not_ready"}`
  otherwise. It is the database-backed readiness signal for deployment routing.
- `GET /metrics` is not in the OpenAPI schema. It exposes plain-text counters for circuit state,
  circuit transitions, and observed database failures.

## Testing and quality checks

Run these from `backend/`:

```bash
pytest
ruff check .
ruff format --check .
mypy app
```

The project configuration in `pyproject.toml` enables strict mypy for Python 3.12 and defines the
pytest test path. There is no separate repository script for Alembic validation. Useful migration
commands are:

```bash
alembic current
alembic heads
alembic upgrade head
```

For the full development stack, use the Compose commands in the next section. Backend tests that
need PostgreSQL should run with a reachable database and matching `DATABASE_URL`.

## Common development workflows

All Compose commands use the repository's actual file.

### Start the whole stack

```bash
docker compose -f infra/compose/docker-compose.dev.yml up --build
```

Run detached when you want the shell back:

```bash
docker compose -f infra/compose/docker-compose.dev.yml up -d --build
```

### Rebuild or restart the backend

```bash
docker compose -f infra/compose/docker-compose.dev.yml build backend worker migrate
docker compose -f infra/compose/docker-compose.dev.yml up -d backend worker
```

### Inspect logs

```bash
docker compose -f infra/compose/docker-compose.dev.yml logs -f backend
docker compose -f infra/compose/docker-compose.dev.yml logs -f worker
```

### Run or inspect migrations

The normal migration path is the one-shot service:

```bash
docker compose -f infra/compose/docker-compose.dev.yml up migrate
```

Check the current revision or heads from the backend image:

```bash
docker compose -f infra/compose/docker-compose.dev.yml run --rm migrate alembic current
docker compose -f infra/compose/docker-compose.dev.yml run --rm migrate alembic heads
```

### Reset the local database

This destroys all local PostgreSQL data, including the named volume:

```bash
docker compose -f infra/compose/docker-compose.dev.yml down -v
docker compose -f infra/compose/docker-compose.dev.yml up --build
```

### Open Mailpit

Open [http://localhost:8025](http://localhost:8025) in a browser. SMTP is available to the
containers at `mailpit:1025`; the host-facing SMTP port is `1025`.

### Check Compose status

```bash
docker compose -f infra/compose/docker-compose.dev.yml ps
```

Expect `migrate` to show `Exited (0)` after a successful migration. That is a successful
completion state, not a crashed service.

## Known limitations and open issues

The following are confirmed from current code or the repository documentation. They are separated
from implemented behavior so that a reviewer does not mistake an architecture intention for a
runtime guarantee.

### Confirmed implementation limitations

- **Group read export fields are not populated.** `group_response()` currently sets both
  `confirmed_proposal` and `feed_url` to `None`. The separate export service and export routes
  exist, but a normal group response does not currently include the confirmed proposal/feed data
  described by the contract and architecture. This is a backend implementation gap to resolve
  before relying on those fields in a group read.
- **No general request rate limiter is visible.** The implemented `rate_limited` path is the
  manual calendar-refresh cooldown. The architecture document describes broader per-IP/per-user
  rate limits, but no corresponding general limiter is present in the inspected backend modules.
- **Compose port variables are not wired.** `POSTGRES_PORT`, `MAILPIT_UI_PORT`, and
  `FRONTEND_PORT` are useful names for deployment configuration but the current Compose file
  hard-codes the published ports and does not interpolate them.
- **The backend `.env.example` referenced by repository rules is absent.** Environment values must
  currently be inferred from `app/config.py` and Compose rather than copied from a checked-in
  template.

### Documentation/source ambiguities

- `docs/coordination/frontend-backend.md` still labels some conformance obligations as `agreed`,
  while the current backend has implemented central Problem exception handlers and single-origin
  Compose wiring. When the coordination note and code differ, this document reports the code and
  points to the note as historical integration context.
- The hand-written OpenAPI contract declares the intended response shapes, while the current
  serializer behavior for `confirmed_proposal` and `feed_url` is narrower. The contract remains
  normative; the implementation should be fixed rather than silently changing the contract.
- The architecture document describes the worker as the owner of all outbound mail and says a
  successful poll schedules the next poll. The current code does both, but failed calendar jobs
  also re-enter the generic retry loop, so source error status and job retry state are separate
  pieces of state.

No claim is made here that the broader architecture risks, production Kubernetes plan, or future
feature-flag/analytics surfaces are implemented in the current Compose backend.

## Contract and source-of-truth rules

The project has an explicit precedence rule:

1. `contracts/openapi.yaml` is the normative public API contract.
2. `docs/ARCHITECTURE.md` defines the intended architecture, domain invariants, deployment
   topology, and cross-component decisions.
3. `docs/coordination/frontend-backend.md` records integration decisions between the workstreams.
4. If implementation disagrees with the contract, fix the implementation rather than silently
   changing the contract.

Generated frontend API types must come from the contract and must not be hand-edited. Backend
changes that alter request/response behavior should first be checked against the contract and the
architecture notes, then covered by backend tests and reflected in the appropriate documentation.

## Useful source links

- [Backend application](../backend/app/)
- [API routers](../backend/app/api/)
- [Domain functions](../backend/app/domain/)
- [Services](../backend/app/services/)
- [Infrastructure and models](../backend/app/infra/)
- [Worker](../backend/app/worker/)
- [Backend tests](../backend/tests/)
- [Alembic revisions](../backend/alembic/versions/)
- [Compose development stack](../infra/compose/docker-compose.dev.yml)
- [OpenAPI contract](../contracts/openapi.yaml)
- [Architecture](ARCHITECTURE.md)
- [Frontend/backend coordination](coordination/frontend-backend.md)
