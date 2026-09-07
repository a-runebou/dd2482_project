# Schedular: Architecture Overview

Authors: Adrian Grund, Alexander Runebou
Status: describes the system as built and deployed (October 2026); normative for code generation
Companion files: `contracts/openapi.yaml` (normative API contract), `CLAUDE.md` (generation rules)

---

## 1. Purpose

This document fixes the parts of the system that two people (and an AI code generator) cannot
negotiate at runtime: the domain model, the API contract, the limits, the failure behaviour and
the deployment topology. Anything not written down here or in `openapi.yaml` is an
implementation detail owned by whoever writes that component.

Rule of precedence when sources disagree:

1. `contracts/openapi.yaml`
2. this document
3. generated code

If the code and the contract disagree, the code is wrong.

---

## 2. Decisions

| # | Decision | Consequence |
|---|---|---|
| D1 | Identity: lightweight accounts, e-mail plus magic link, no passwords stored | No password hashing, no reset flow, no KTH SSO client registration |
| D2 | Two layers: an availability heatmap plus backend-computed suggestions (layer 1), then explicit proposals that members vote on and the owner confirms (layer 2) | `Availability`, `Suggestion` (computed, not stored), `Proposal`, `Vote` are separate concepts |
| D3 | A group has exactly one owner, who alone confirms, edits and deletes | `role` on membership, `403 forbidden` with code `not_owner` |
| D4 | Fixed 30-minute slots, all instants UTC RFC 3339, group carries an IANA timezone used only for rendering | Frontend never sends local wall-clock time to the API |
| D5 | No recurrence rules anywhere; `RRULE` is expanded at ICS import time into concrete instances | The API has no recurrence vocabulary |
| D6 | ICS import by both file upload and stored subscription URL, parsed server-side only | Frontend never parses ICS |
| D7 | "Sync" means: backend re-polls ICS URLs (6 h), and export is a subscribable feed. Live co-editing is ETag polling every 15 s, no WebSockets | No realtime infrastructure |
| D8 | Export by one-off `.ics` download and by a token-scoped read-only feed | No Google Calendar OAuth |
| D9 | Spec-first. `contracts/openapi.yaml` is hand-written and normative; FastAPI conforms to it, the frontend generates its types from it | CI verifies conformance; frontend is unblocked by a mock server on day one |
| D10 | REST under `/api/v1`, UUIDv7 internally, groups addressed by a 12-character slug, RFC 9457 problem responses with a stable `code`, cursor envelopes on lists, `Idempotency-Key` on mutating requests | See section 7 |
| D11 | Short-lived JWT access token held in memory, refresh token in an HttpOnly cookie, SPA and API served from a single origin and routed by path | No CORS configuration anywhere; the refresh cookie is first-party. See risk R1 (TLS) |
| D12 | The backend is authoritative for all validation; limits are served from `GET /api/v1/config` so neither side hard-codes them | The frontend may duplicate validation for UX only |
| D13 | Production runs k3s on one Azure VM, paid from student credit and deallocated when idle; the platform is replaceable, the manifests are not | See section 10 |
| D14 | PostgreSQL 16, SQLAlchemy 2.0 and Alembic; schema owned by the backend author | Only the ERD and its invariants are fixed here |
| D15 | Mail is an abstract SMTP interface. Every environment, prod included, sends to a Mailpit sink, because `backend/app/infra/mail.py` speaks plain SMTP without STARTTLS and so cannot use a real relay. No dependency on KTH mail | `SMTP_*` env vars only; nothing reaches a real inbox (section 10) |
| D16 | The circuit breaker lives inside the backend and guards its own database access, with an e-mail notification on state change. No separate watchdog service, no Prometheus stack in v1 | See section 9 |
| D17 | `POST /api/v1/events` and `GET /api/v1/flags` are reserved in the v1 contract and stubbed, so the A/B and analytics milestones need no contract change | A/B proof may be a purely visual frontend variant |
| D18 | MLOps is undefined and is out of the runtime architecture until it is scoped | If it becomes a served model it enters as a fourth container behind its own contract |
| D19 | One monorepo with path-filtered CI | See section 12 |
| D20 | Must-ship scope ends at working dev and prod deployment; monitoring dashboard, A/B and MLOps are optional | Reserved surface stays unimplemented but contracted |

---

## 3. System context

```mermaid
graph LR
  U[Student, group member] -->|browser| FE[Schedular SPA]
  FE -->|HTTPS/JSON, /api/v1| BE[Schedular API]
  BE --> DB[(PostgreSQL)]
  BE -->|SMTP| MAIL[Mailpit sink]
  W[Worker] --> DB
  W -->|SMTP| MAIL
  W -->|HTTP GET .ics| KTH[KTH / TimeEdit ICS feed]
  EXT[External calendar app] -->|webcal subscribe| BE
  U -.->|magic link, reminders, read in Mailpit| MAIL
```

Actors and externals

- Group member: any authenticated user; may own zero or more groups.
- KTH schedule source: an ICS URL (TimeEdit or the personal KTH feed) or an uploaded `.ics` file. Untrusted input.
- Mail sink: outbound SMTP only, to Mailpit in every environment (D15). Its web UI is the only
  place a magic link can be read.
- External calendar: Google Calendar, Apple Calendar or Outlook subscribing to the exported feed. Read-only, unauthenticated, token in the URL.

---

## 4. Container view

```mermaid
graph TB
  subgraph Cluster / compose
    NG["Ingress: Traefik, Kubernetes only; in compose the frontend's nginx proxies /api"]
    FE[frontend: static SPA bundle on nginx]
    BE[backend: FastAPI + uvicorn]
    WK[worker: single process, DB job queue]
    DB[(postgres)]
    MP[mailpit: SMTP sink]
  end
  NG --> FE
  NG --> BE
  BE --> DB
  WK --> DB
  BE --> MP
  WK --> MP
  BE -. shares code, not process .- WK
```

| Container | Owner | Responsibility | Explicitly not responsible for |
|---|---|---|---|
| frontend | Adrian | Rendering, local state, optimistic UI, timezone rendering, generated API client | Business rules, ICS parsing, authorization decisions |
| backend | Alexander | All validation and authorization, availability aggregation, suggestion computation, ICS parsing, ICS rendering, JWT issuing, circuit breaker | Sending scheduled mail, polling feeds |
| worker | Alexander | Job loop: ICS polling, reminder scheduling, all outbound mail | Serving HTTP |
| postgres | Alexander | Persistence, single source of truth, job queue | Business logic (no triggers, no stored procedures) |
| mailpit | Alexander (compose), Adrian (Kubernetes) | Receives every mail the system sends: magic links, reminders, circuit alerts | Delivery to real mailboxes |

The backend and the worker are the same image with a different entrypoint. The worker is a
single replica; concurrency safety comes from `SELECT ... FOR UPDATE SKIP LOCKED` on the job
table, so a second replica is safe but unnecessary.

---

## 5. Domain model

```mermaid
erDiagram
  USER ||--o{ MEMBERSHIP : has
  USER ||--o{ CALENDAR_SOURCE : owns
  CALENDAR_SOURCE ||--o{ BUSY_BLOCK : yields
  GROUP ||--o{ MEMBERSHIP : has
  GROUP ||--o{ AVAILABILITY : has
  GROUP ||--o{ PROPOSAL : has
  PROPOSAL ||--o{ VOTE : receives
  USER ||--o{ AVAILABILITY : declares
  USER ||--o{ VOTE : casts
  GROUP ||--o| PROPOSAL : "confirmed as"
```

Entities and the fields that the contract depends on:

- `user`: `id`, `email` (unique, case-insensitive), `display_name`, `timezone`, `created_at`.
- `magic_link`: `id`, `user_id`, `token_hash`, `expires_at`, `consumed_at`. Single use.
- `refresh_token`: `id`, `user_id`, `token_hash`, `family_id`, `expires_at`, `revoked_at`. Rotating.
- `group`: `id`, `slug` (12 chars, base58, unique), `name`, `description`, `owner_id`, `timezone`, `date_start`, `date_end` (inclusive dates), `window_start_minute`, `window_end_minute` (minutes from local midnight), `slot_minutes` (always 30), `state` (`open` | `confirmed` | `archived`), `confirmed_proposal_id`, `invite_token_hash`, `feed_token_hash`, `version` (monotonic int), timestamps.
- `membership`: `group_id`, `user_id`, `role` (`owner` | `member`), `notify_email`, `joined_at`. Unique on (`group_id`, `user_id`).
- `availability`: `group_id`, `user_id`, `slot_start` (UTC instant), `state` (`available` | `preferred`). Absence of a row means unavailable. Unique on the triple.
- `calendar_source`: `id`, `user_id`, `kind` (`upload` | `url`), `url`, `status` (`ok` | `pending` | `error`), `last_polled_at`, `last_error_code`, `etag`.
- `busy_block`: `id`, `user_id`, `source_id`, `start_at`, `end_at`, `uid`. Derived, regenerated wholesale per source on each successful poll.
- `proposal`: `id`, `group_id`, `start_at`, `end_at`, `origin` (`suggested` | `manual`), `created_by`, `created_at`.
- `vote`: `proposal_id`, `user_id`, `value` (`yes` | `maybe` | `no`). Unique on the pair.
- `job`: `id`, `kind`, `payload` (jsonb), `run_after`, `attempts`, `dedupe_key` (unique when not null), `locked_at`, `completed_at`, `last_error`.

Invariants the backend must enforce (each maps to an error code in section 7.4):

1. Every slot instant submitted must be aligned to `slot_minutes` and fall inside the group's
   date range and daily window, evaluated in the group's timezone. Otherwise `slot_not_in_window`.
2. `date_end - date_start + 1 <= MAX_RANGE_DAYS`. Otherwise `range_too_long`.
3. `window_start_minute < window_end_minute`, both multiples of 30, both in `[0, 1440]`.
4. A group in state `confirmed` rejects all writes to availability, proposals and votes with
   `group_confirmed`. The owner may unconfirm, which returns the group to `open`.
5. `confirmed_proposal_id` is non-null if and only if `state = confirmed`.
6. Membership count never exceeds `MAX_MEMBERS`.
7. The owner cannot leave a group; they must delete it or transfer ownership (transfer is out
   of scope in v1, so: cannot leave).
8. Busy blocks are per user, not per group. A user imports once and it applies everywhere.
9. `version` on the group increments on every change to the group, its memberships, its
   availability, its proposals or its votes. It is the value behind the `ETag`. The frontend
   polls the group and the availability matrix with `If-None-Match`, so a mutation that does not
   increment `version` answers `304` and produces a silently stale view. A missed increment is
   therefore a correctness bug, not a caching nicety.

### 5.1 Suggestion algorithm (layer 1)

`GET /groups/{slug}/suggestions` is computed on request and never stored. Given a requested
`duration_minutes` (multiple of 30, default 60):

1. Build the ordered slot vector for the group.
2. For each slot, count members whose state is `available` or `preferred`; a member with no
   rows at all counts as "not responded" and is excluded from the denominator.
3. Slide a window of `duration_minutes / 30` consecutive slots over the vector, discarding
   windows that cross a day boundary of the daily window.
4. Score a window as `sum over slots of (2 * preferred_count + 1 * available_count)`, divided
   by the number of slots, and require that every slot in the window has the same set of
   fully available members.
5. Return the top `limit` windows (default 5, max 20), sorted by score descending then start
   ascending, each with the member ids that are available, preferred and missing.

This function is pure, lives in the backend, and is the one piece of logic that must have unit
tests with fixed fixtures. The frontend renders it and does not reimplement it.

---

## 6. Key flows

### 6.1 Sign-in

```mermaid
sequenceDiagram
  participant FE
  participant BE
  participant WK as worker
  FE->>BE: POST /auth/magic-link {email}
  BE->>BE: upsert user, create single-use token
  BE->>WK: enqueue job email_send
  WK-->>FE: (e-mail with link to /auth/callback?token=...&redirect=<redirect_path>)
  FE->>BE: POST /auth/session {token}
  BE-->>FE: 200 {access_token, user} + Set-Cookie refresh_token
  FE->>BE: POST /auth/refresh (cookie only) when access token expires
```

Access token lifetime 15 minutes, refresh token 30 days, rotated on every use, reuse of a
consumed refresh token revokes the whole family. Magic link lifetime 15 minutes, single use.

The mail links to `{PUBLIC_APP_URL}/auth/callback?token=...&redirect=<redirect_path>`, carrying
the `redirect_path` from `POST /auth/magic-link` so the user returns to where they started, an
invite route in particular. The backend validates `redirect_path` against the pattern in
`MagicLinkRequest` before it goes into the mail, and the frontend validates it again as a path
relative to this origin before navigating. Nothing is returned in `SessionResponse`.

Reuse detection has a 30-second grace window: presenting the immediately preceding refresh token
within that window answers `401 unauthenticated` without revoking the family. Outside the window,
and for any older token in the family, reuse revokes the whole family as specified. Without the
grace window, two open tabs, React's development-mode double effects or a reload that discards
the rotated cookie would sign the user out everywhere; the cost is weaker theft detection inside
those 30 seconds.

### 6.2 Schedule import

The user registers a source. The worker fetches it (job `ics_poll`, also enqueued immediately
on creation and on manual refresh), parses it with a hard cap on size and event count, expands
`RRULE` within the horizon of the user's groups plus 90 days, converts everything to UTC,
replaces the busy blocks for that source in one transaction and marks the source `ok` or
`error`. Busy blocks pre-fill the availability grid as unavailable in the frontend, but they
never write `availability` rows. A user can always override a busy slot by marking it available.

### 6.3 Scheduling round

```mermaid
sequenceDiagram
  actor M as Member
  actor O as Owner
  M->>BE: PUT /groups/{slug}/availability/me (full replace)
  O->>BE: GET /groups/{slug}/suggestions?duration_minutes=60
  O->>BE: POST /groups/{slug}/proposals (from a suggestion, or manual)
  M->>BE: PUT /groups/{slug}/proposals/{id}/vote/me {value}
  O->>BE: POST /groups/{slug}/confirmation {proposal_id}
  BE->>DB: state=confirmed, enqueue reminder jobs
  M->>BE: GET /groups/{slug}/event.ics
```

Availability writes are a full replacement of that user's rows for that group, which makes them
idempotent and avoids patch semantics. The grid view polls
`GET /groups/{slug}/availability` with `If-None-Match` while visible, at the interval served as
`poll_interval_seconds` by `GET /config`; neither side hard-codes it. A 304 is the expected
common case.

### 6.4 Reminders

On confirmation the backend enqueues one `reminder_send` job per member with `notify_email`
true, with `run_after = start_at - REMINDER_LEAD_HOURS` and a `dedupe_key` of
`reminder:{group_id}:{user_id}:{proposal_id}`. Unconfirming or reconfirming cancels pending
jobs by prefix. Reminders in the past are dropped, not sent late.

### 6.5 Invite and join

One reusable link per group, of the form
`{PUBLIC_APP_URL}/join/{slug}?invite={token}`. It points at the frontend, not the API, because
joining requires an account and the token must survive the sign-in round trip.

1. The frontend route stores the token in `sessionStorage` under a single well-known key and
   checks for a session.
2. If there is none, it runs the magic-link flow with `redirect_path` set back to the same
   route, so the token is still there afterwards.
3. With a session, it calls `POST /groups/{slug}/join` with the token, clears the stored token
   and navigates to the group.

The token is compared against a hash, is rotatable through `PATCH /groups/{slug}` with
`rotate_invite_token`, and rotation invalidates every copy of the old link. An invalid token
gives `404 group_not_found`, not a distinguishable error, so links cannot be probed. Joining
twice is `409 already_member` and the frontend treats it as success. This is the only place the
token is allowed to appear in a URL query string, and the backend must never log query strings
for `/join` or `/feed.ics`.

---

## 7. API contract

Normative file: `contracts/openapi.yaml` (OpenAPI 3.1). This section explains the conventions;
the file is the truth.

### 7.1 Conventions

- Base path `/api/v1`. Breaking changes require `/api/v2`.
- JSON only, `snake_case` keys, UTF-8. All instants are RFC 3339 in UTC with a `Z` suffix.
  Dates are `YYYY-MM-DD`. Durations are integers in minutes.
- Resource ids are UUIDv7 strings. Groups are addressed in URLs by `slug`, never by id.
- Collections return `{"data": [...], "next_cursor": null | "opaque"}` and accept `limit` and
  `cursor`. Never a bare array.
- `POST`, `PUT`, `PATCH` and `DELETE` accept an optional `Idempotency-Key` header (UUID); a
  repeat within 24 hours returns the stored response.
- `GET /groups/{slug}` and the availability and proposal reads return an `ETag` derived from
  the group `version`. Mutations on the group accept `If-Match` and answer `412` with
  `version_conflict` on mismatch.
- Errors are `application/problem+json` per RFC 9457, always including a stable `code`.
- Times sent by the client are always instants. The client never sends a timezone name except
  when setting the group's or the user's timezone.

### 7.2 Endpoints

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/config` | none | Limits, feature flags placeholder, build info |
| POST | `/auth/magic-link` | none | Always `202`, never reveals whether the e-mail exists |
| POST | `/auth/session` | none | Exchanges magic-link token for tokens |
| POST | `/auth/refresh` | cookie | Rotates the refresh token |
| DELETE | `/auth/session` | cookie | Logout, revokes the family |
| GET / PATCH | `/me` | bearer | Display name, timezone, notification default |
| GET / POST | `/me/calendar-sources` | bearer | URL sources |
| POST | `/me/calendar-sources/upload` | bearer | `multipart/form-data`, one `.ics` file |
| POST | `/me/calendar-sources/{id}/refresh` | bearer | Rate limited, `202` |
| DELETE | `/me/calendar-sources/{id}` | bearer | Cascades busy blocks |
| GET | `/me/busy` | bearer | `from`, `to` required, merged busy blocks |
| GET / POST | `/groups` | bearer | List own groups, create |
| GET | `/groups/{slug}` | bearer, member | `404 group_not_found` for non-members, not `403`. `confirmed_proposal` and `feed_url` are currently always `null`, a known gap against the contract |
| PATCH / DELETE | `/groups/{slug}` | bearer, owner | `If-Match` supported |
| POST | `/groups/{slug}/join` | bearer | Body carries the invite token |
| GET | `/groups/{slug}/members` | bearer, member | |
| DELETE | `/groups/{slug}/members/{user_id}` | bearer, owner or self | Owner cannot be removed |
| GET | `/groups/{slug}/availability` | bearer, member | Full matrix plus aggregate, `ETag` |
| GET / PUT | `/groups/{slug}/availability/me` | bearer, member | Full replacement |
| GET | `/groups/{slug}/suggestions` | bearer, member | Computed, not persisted |
| GET / POST | `/groups/{slug}/proposals` | bearer, member | Creation is owner-only |
| DELETE | `/groups/{slug}/proposals/{id}` | bearer, owner | |
| PUT | `/groups/{slug}/proposals/{id}/vote/me` | bearer, member | |
| POST / DELETE | `/groups/{slug}/confirmation` | bearer, owner | Confirm and unconfirm |
| GET | `/groups/{slug}/event.ics` | bearer, member | One-off download of the confirmed event |
| GET | `/groups/{slug}/feed.ics` | feed token in query | Public, read-only, subscribable |
| POST | `/events` | bearer, optional | Reserved, returns `202`, no-op in v1 |
| GET | `/flags` | bearer, optional | Reserved, returns the assignment map |

Outside `/api/v1`, unversioned and not part of the client contract: `GET /healthz`,
`GET /readyz`, `GET /metrics`.

### 7.3 Availability payload shape

Writes send instants:

```json
{ "available": ["2026-10-05T08:00:00Z"], "preferred": ["2026-10-05T08:30:00Z"] }
```

Reads return the slot vector once and index into it, to keep the matrix small:

```json
{
  "version": 42,
  "slots": ["2026-10-05T06:00:00Z", "2026-10-05T06:30:00Z"],
  "participants": [
    { "user_id": "...", "display_name": "Adrian", "available": [0], "preferred": [1], "responded": true }
  ],
  "aggregate": [
    { "slot_index": 0, "available_count": 1, "preferred_count": 0 }
  ]
}
```

The indices in `available` and `preferred` refer to positions in `slots`. This asymmetry is
deliberate and is the only one in the API.

### 7.4 Error codes

Stable strings, exhaustive for v1. The frontend may switch on these; it must never switch on
`detail`.

| HTTP | code | Meaning |
|---|---|---|
| 400 | `validation_failed` | Schema or field-level violation, see `errors[]` |
| 401 | `unauthenticated` | Missing or invalid credentials |
| 401 | `token_expired` | Access token expired, refresh and retry once |
| 403 | `forbidden` | Authenticated but not permitted |
| 403 | `not_owner` | Owner-only operation |
| 404 | `not_found` | Generic |
| 404 | `group_not_found` | Also returned to non-members, deliberately |
| 409 | `already_member` | Join on an existing membership |
| 409 | `group_confirmed` | Write attempted on a confirmed group |
| 409 | `group_not_confirmed` | Export requested for a group that is not confirmed |
| 409 | `member_limit_reached` | |
| 409 | `group_limit_reached` | `max_groups_per_user` would be exceeded |
| 409 | `proposal_limit_reached` | `max_proposals_per_group` would be exceeded |
| 409 | `calendar_source_limit_reached` | `max_calendar_sources` would be exceeded |
| 409 | `idempotency_key_reuse` | Same key, different body |
| 412 | `version_conflict` | `If-Match` mismatch |
| 422 | `slot_not_in_window` | Slot misaligned or outside range or window |
| 422 | `range_too_long` | Date range exceeds the limit |
| 422 | `ics_parse_failed` | Uploaded or fetched calendar unusable |
| 429 | `rate_limited` | `Retry-After` set |
| 500 | `internal_error` | Unhandled server error; the only code a 500 carries |
| 502 | `ics_fetch_failed` | Upstream calendar unreachable |
| 503 | `db_circuit_open` | Circuit breaker open, `Retry-After` set |
| 503 | `service_unavailable` | Dependency down, not the database |

---

## 8. Limits and constants

Served verbatim by `GET /api/v1/config`. Neither side hard-codes them; the frontend fetches
once at boot and caches for the session.

| Key | Value | Enforced by |
|---|---|---|
| `slot_minutes` | 30 | backend |
| `max_range_days` | 31 | backend |
| `max_members` | 50 | backend |
| `max_groups_per_user` | 20 | backend |
| `max_proposals_per_group` | 20 | backend |
| `max_calendar_sources` | 5 | backend |
| `max_ics_bytes` | 2 097 152 | backend |
| `max_ics_events` | 5 000 | backend |
| `min_duration_minutes` / `max_duration_minutes` | 30 / 480 | backend |
| `ics_poll_interval_hours` | 6 | worker |
| `manual_refresh_cooldown_seconds` | 300 | backend |
| `reminder_lead_hours` | 24 | worker |
| `access_token_ttl_seconds` | 900 | backend |
| `refresh_token_ttl_days` | 30 | backend |
| `magic_link_ttl_seconds` | 900 | backend |
| `poll_interval_seconds` (client hint) | 15 | frontend |

Rate limits: only the manual calendar-refresh cooldown (`manual_refresh_cooldown_seconds`) is
implemented, answering `429 rate_limited` with `Retry-After`. The per-IP and per-user limits once
planned here (magic link 5 per hour, availability writes 60 per minute, everything else 300 per
minute) were not built.

---

## 9. Resilience: the circuit breaker

Scope: the backend guarding its own PostgreSQL access. There is no separate watchdog container
and no cross-container heartbeat in v1.

- Fail fast so that failures are detectable: connection pool acquire timeout 2 s, statement
  timeout 3 s, pool pre-ping on.
- States: `closed`, `open`, `half_open`. Transition to `open` after 5 consecutive failures or
  more than 50 percent failures in the last 20 calls within a 30 second window. Stay open for
  30 s, then admit one probe call; two consecutive successes close it.
- While open, database-backed endpoints return `503` with `code: db_circuit_open` and
  `Retry-After: 30` without touching the pool. `GET /healthz` still returns 200, because the
  process is alive and Kubernetes must not restart it. `GET /readyz` returns 503, so the pod
  leaves the load-balancer rotation.
- On every `closed -> open` and `open -> closed` transition the backend sends an alert e-mail
  to `OPS_ALERT_EMAIL` directly over SMTP from within the request process, with a 10 second
  timeout and an in-memory cooldown of 15 minutes. This path must not touch the database,
  since the database is what is broken.
- Exposed on `/metrics`: `schedular_circuit_state` (0 closed, 1 half-open, 2 open),
  `schedular_circuit_transitions_total`, `schedular_db_failures_total`.
- Demonstrable for the TAs by `docker compose -f infra/compose/docker-compose.dev.yml stop
  postgres`, then watching the state change,
  the 503 responses and the alert mail in Mailpit.

The frontend must handle `503 db_circuit_open` as a distinct, retryable, non-destructive state:
show a banner, keep unsaved edits in memory, retry after `Retry-After`.

---

## 10. Environments

| | local | dev | prod |
|---|---|---|---|
| Host | a developer's machine | Alexander's Raspberry Pi (arm64), registered as a self-hosted GitHub Actions runner labelled `dev-deployment` | one Azure VM, `schedular-prod`, `Standard_B2als_v2` (2 vCPU, amd64), Ubuntu 24.04, region `polandcentral`, defined in Bicep under `infra/azure/` |
| Orchestration | Docker Compose, `infra/compose/docker-compose.dev.yml`, images built from source | Docker Compose, `infra/compose/docker-compose.deploy.yml`, images pulled from GHCR | k3s `v1.37.1+k3s1`, kustomize overlays `prod-data`, `prod-migrate` and `prod` |
| Images | built locally | `linux/arm64`, tagged with the commit SHA and `develop` | `linux/amd64`, tagged `main-<sha>` |
| Trigger | by hand | every push to `develop` that passes CI | by hand, `infra/k8s/deploy-prod.sh release main-<sha>` (section 11) |
| Database | `postgres:16` service, named volume | `postgres:16` service, named volume | StatefulSet `postgres` with a PVC on k3s's local-path provisioner, on the VM's OS disk |
| Mail | Mailpit, UI on port 8025 | Mailpit `v1.27.8`, UI bound to `127.0.0.1:8025` on the Pi | Mailpit `v1.27.8` in the cluster, UI reachable only through `kubectl port-forward` |
| TLS | none | none (R1) | Traefik terminates TLS with a cert-manager certificate from Let's Encrypt (HTTP-01). The overlay on `main` still names `letsencrypt-staging`; switching to `letsencrypt-prod` is step 8 of the runbook |
| Entry point | `http://localhost:8080` | port 8080 on the Pi | `https://schedular.polandcentral.cloudapp.azure.com`, Traefik on ports 80 and 443 through k3s's ServiceLB, HTTP redirected to HTTPS |
| Data | disposable | kept across deployments in the volume | persistent, no automated backups |

The prod target. The plan before implementation listed free-tier candidates (AKS on Azure for
Students, DigitalOcean, Oracle Cloud's free ARM instances, a second KTH VM). Production ended up on
the simplest of them, a single VM running k3s, on the Azure for Students subscription with its
spending limit on. Cost decided the shape: the VM costs about 37.59 USD a month while running and
6.05 USD while deallocated, when only the disk and the static IP bill (`infra/azure/README.md`,
"Costs"). It is therefore deallocated whenever nobody is using it, with `infra/azure/vm.sh`; there
is no auto-shutdown schedule. k3s is pinned to the same Kubernetes minor version as the local kind
cluster, so prod runs what was rehearsed. The Kubernetes API is not exposed: the network security
group opens only 22, 80 and 443, and the API is reached through an SSH tunnel by the wrappers in
`infra/azure/bin/`.

Mail in every environment goes to Mailpit (D15). In prod that means a magic link can only be read
by someone with cluster access, through a port-forward to the Mailpit UI; nothing is delivered to
a real inbox. A real relay needs STARTTLS support in `backend/app/infra/mail.py` first.

The SPA and the API are served from one origin in every environment, routed by path: `/api` to
the backend, everything else to the frontend. In Kubernetes the split happens at the ingress:
one Ingress, class `traefik`, holds two `Prefix` rules on one host, `/api` to `backend:8000` and
`/` to `frontend:8080`; the base Ingress has no host and each overlay adds its own. Prefix
matching compares whole path segments, so `/api` matches `/api/v1/config` but not `/apiary`. The
same manifests also run on a local kind cluster (`infra/k8s/kind/`, namespace `schedular-local`,
overlays `local-data`, `local-migrate` and `local`, Traefik from Helm with values under
`infra/k8s/traefik/`), reached at `http://schedular.localhost` on a host port bound to
`127.0.0.1`; it rehearses prod and is neither a development environment nor deployed by CI. Its
differences from prod are listed in `infra/k8s/README.md`. In compose there is no ingress: the frontend image serves the bundle and proxies `/api` to
`BACKEND_ORIGIN`, passing the path through unchanged, so `/api/v1/config` reaches the backend as
`/api/v1/config`. The image keeps that proxy in Kubernetes too, but traffic through the Ingress
never reaches it. In development the Vite server proxies the same path. There is therefore no
CORS configuration in any environment, no expose-headers list for `ETag` and `Retry-After`, and
the refresh cookie is first-party, so `SameSite=Lax` is enough. The frontend keeps a relative
`/api/v1` base URL and bakes in no API host.

Configuration is environment variables only, no config files baked into images. The backend,
the worker and the migration run read, in `backend/app/config.py`: `ENVIRONMENT`,
`DATABASE_URL`, `JWT_SECRET`, `PUBLIC_APP_URL`, `AUTH_COOKIE_SECURE`, `BUILD_SHA`, `SMTP_HOST`,
`SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM`, `OPS_ALERT_EMAIL` and
`REFRESH_TOKEN_GRACE_SECONDS`. Every one has a default in code, including `DATABASE_URL` and
`JWT_SECRET`, so a missing variable does not stop the process. The frontend image reads only
`BACKEND_ORIGIN`. The compose files also interpolate `POSTGRES_DB`, `POSTGRES_USER` and
`POSTGRES_PASSWORD`, and the deploy file `IMAGE_TAG`; `infra/compose/.env.example` lists the local
values. In prod the four secret values (`DATABASE_URL`, `JWT_SECRET`, `SMTP_USERNAME`,
`SMTP_PASSWORD`) come from the Kubernetes Secret `schedular-secrets`, created once by hand as the
runbook describes, and the rest from a ConfigMap generated by the `prod` overlay. On the dev host
they come from an untracked env file that the runner reads. Nothing secret is committed.

---

## 11. CI/CD

Monorepo with path filters, so a documentation-only change builds nothing.

Workflows on `main`, in `.github/workflows/`:

| Workflow | Trigger | What it does |
|---|---|---|
| `ci.yml` | pull requests and pushes to `develop` that touch `backend/`, `frontend/`, `contracts/`, `infra/compose/` or the workflows; manual | Calls `backend-ci`, `frontend-ci` and `security`. On a push to `develop`, once all three pass, calls `build-images` and then `deploy-dev` |
| `backend-ci.yml` | called by `ci.yml`; manual | ruff, mypy, `alembic upgrade head` and `alembic check` against a Postgres service container, pytest |
| `frontend-ci.yml` | called by `ci.yml`; manual | ESLint and Prettier check, `tsc`, Vitest, production build, `check:api` (the generated types match the contract), `npm audit --audit-level=high` (reported, not gating), Redocly lint of `contracts/openapi.yaml` |
| `security.yml` | called by `ci.yml`; pull requests and pushes to `main` or `develop` that touch `frontend/`, the contract or the workflow itself; weekly; manual | gitleaks over the full history; CodeQL for JavaScript, TypeScript and Python |
| `build-images.yml` | called by `ci.yml` on `develop` | arm64 backend and frontend images to GHCR, tagged with the commit SHA and `develop` |
| `deploy-dev.yml` | called by `ci.yml` on `develop`; manual on `develop` | Deploys to the Pi, below |
| `build-images-prod.yml` | push to `main`, except changes only under `docs/` or to Markdown files; manual, publishing only from `main` | amd64 images tagged `main-<sha>`; Trivy reports HIGH and CRITICAL findings and fails on a CRITICAL one with a fix available, before anything is pushed |
| `deploy-prod.yml` | manual only | Prepared and inactive, below |

Not built, although planned: schemathesis against the running backend, `pip-audit`, Dependabot
and coverage reporting.

Delivery to dev. On a push to `develop`, `deploy-dev` runs on the Pi's self-hosted runner in the
GitHub environment `development`. It checks that the ref is `develop` and that the image tag is a
commit SHA on `develop`, pulls the images, starts Postgres and Mailpit, and runs a migration
preflight: the last image that deployed successfully must still read the database's current
revision, and the candidate's migrations are rendered as SQL without being applied. It then runs
`docker compose up -d --wait`, in which the one-shot `migrate` service runs `alembic upgrade head`
before the backend and worker start, and polls `/readyz` for up to 60 seconds. On success it
records the tag as the last known good one; on failure it starts the last known good tag again.

Delivery to prod. A push to `main` only publishes images. A release is started by hand, from a
clean checkout of the `main` commit being released:
`infra/k8s/deploy-prod.sh release main-<sha>`. The script renders the overlays for that tag,
checks that both images can be pulled anonymously, refuses an image whose Alembic history contains
a revision named "temporary", runs the `migrate` Job and waits for it, applies the application,
and gates on the rollout of `backend`, `worker` and `frontend`. On failure it rolls back the
Deployments it changed with `rollout undo`; the database is never downgraded. It never applies
`prod-data`. `docs/deployment/runbook.md` has the details.

Releases are manual primarily for cost. The VM is deallocated when idle, so an automatic deploy on
every push to `main` would either fail at the SSH tunnel or force the VM to run continuously.
`deploy-prod.yml` is prepared for a manual run from GitHub, through a restricted SSH key and a
namespace-scoped Kubernetes credential, but is inactive: its secrets have to be set on the
repository's `production` environment, which needs repository admin rights.

- Migrations run before the new code is served and must be backwards compatible with the
  previous revision, since rollout is not atomic and rollback never downgrades.

---

## 12. Repository layout

Generated from `git ls-files`; every directory under `infra/` and `.github/` is listed.

```
/frontend                React 19, TypeScript, Vite, TanStack Query, Tailwind
  src/api/               hand-written API client; generated/ holds the contract's types, never edited
/backend                 FastAPI, Pydantic v2, SQLAlchemy 2.0, Alembic
  app/api/               routers, thin
  app/domain/            pure logic: slots, suggestions, ICS parsing, auth, groups, calendars
  app/services/          use cases combining domain logic and persistence
  app/infra/             db, circuit breaker and alerts, mail, ICS fetching, models
  app/worker/            job loop, handlers, heartbeat (health.py)
  alembic/               migrations
  tests/
/contracts               openapi.yaml
/infra
  compose/               docker-compose.dev.yml, docker-compose.deploy.yml, .env.example
  azure/                 main.bicep, vm.bicep, cloud-init.yaml, vm.sh, README.md
    bin/                 devops-tunnel, devops-kubectl, devops-helm
  k8s/                   README.md, deploy-prod.sh
    base/                backend, worker and frontend Deployments, two Services, Ingress
    postgres/            StatefulSet, Service
    migrate/             migration Job
    mailpit/             Deployment, Service, NetworkPolicy
    overlays/            local-data, local-migrate, local, prod-data, prod-migrate, prod
    kind/                cluster.yaml for the local rehearsal
    traefik/             Helm values: values.yaml, values-local.yaml, values-prod.yaml
    cert-manager/        Helm values.yaml; issuers/ with letsencrypt-staging and letsencrypt-prod
    ci/                  ServiceAccount, Role, RoleBinding, token and make-ci-kubeconfig.sh for deploy-prod.yml
/.github/workflows       ci, backend-ci, frontend-ci, security, build-images, deploy-dev,
                         build-images-prod, deploy-prod
/docs                    this file, backend.md, deployment/runbook.md, frontend/DECISIONS.md,
                         agent-log/
README.md
CLAUDE.md
```

Branching: `main` is protected and always deployable, `develop` is the integration branch,
feature branches merge by pull request with the full pipeline green. Conventional commits.

---

## 13. Ownership

| Area | Owner |
|---|---|
| Architecture, API contract, this document | Adrian |
| Frontend | Adrian |
| Backend, worker, database | Alexander |
| Test suite | shared, per component |
| Lint, dependency and vulnerability checks | Adrian |
| Dev deployment (Compose, Raspberry Pi, self-hosted runner) | Alexander |
| Prod deployment (Azure VM, k3s, Kubernetes manifests) | Adrian |
| MLOps and repository insight | Alexander |
| Feature flags and A/B | Adrian |

Both must be able to run the whole stack locally with one command, after copying
`infra/compose/.env.example` to `infra/compose/.env`:
`docker compose -f infra/compose/docker-compose.dev.yml up --build`.

---

## 14. Risks and open items

| id | Risk | Mitigation |
|---|---|---|
| R1 | No TLS in local and dev. A refresh cookie with `Secure` is not sent over plain HTTP, and JWTs travel in clear | Resolved for prod: Traefik terminates TLS with a cert-manager certificate, and the prod overlay sets `AUTH_COOKIE_SECURE=true` and an `https://` `PUBLIC_APP_URL`, a configuration change and not a code change. Accepted for local and dev. Nothing in the application may assume `http://`: all outbound links are built from `PUBLIC_APP_URL`, and no service holds a certificate of its own |
| R2 | Free-tier Kubernetes may vanish or throttle mid-project | Resolved: prod is k3s on one Azure VM (section 10), the manifests stayed platform-neutral and run unchanged on kind, and no managed add-on is used |
| R3 | The KTH ICS URL may need authentication, or may be unstable | File upload is the guaranteed path and ships first; URL polling degrades to `status: error` without breaking the group |
| R4 | Gmail SMTP has a 500 per day cap and needs an app password; the account may get locked | Superseded: no external relay is used, all mail goes to Mailpit (D15). The mailer stays abstract and no request blocks on mail delivery |
| R5 | AI-generated code drifts from the contract | The `contract` CI job, plus `CLAUDE.md`, plus generated frontend types |
| R6 | MLOps is unscoped and could eat the last week | It is optional scope; decide after the lecture, and keep it offline (repository analytics) unless there is a clear reason to serve a model |
| R7 | Timezone bugs around the daylight-saving change on 25 October 2026 | Slots are stored in UTC and generated in the group's zone; add a test fixture that spans the transition |

Previously open, now settled (2026-09-07), all as the contract already assumed:

1. One reusable invite link per group, shareable with anyone, rotatable by the owner. No
   per-member tokens and no invite e-mails from the application.
2. Member names are visible in the heatmap, not just counts.
3. The exported feed contains the confirmed event only, never proposals.
4. No anonymous participation. An account is required to join.

---

## 15. Reserved and out of scope

Contracted but not implemented in v1: `POST /events`, `GET /flags`. Out of scope entirely:
recurring meetings, ownership transfer, group chat, mobile applications, calendar write-back
via OAuth, multi-tenant organizations, i18n, WebSockets, and any second database.
