# Schedular

A group scheduling web application: members mark when they are free, the backend suggests the
best meeting times, the group votes on proposals, and the owner confirms one as a calendar event.

## What it does

- Sign-in by e-mail magic link; no passwords are stored.
- Groups with one owner, a date range, a daily time window and an IANA timezone. Members join
  through one reusable, rotatable invite link.
- An availability grid of 30-minute slots, with each member's choices shown as a heatmap and
  refreshed by polling.
- Suggested meeting windows, computed by the backend from everyone's availability.
- Proposals that members vote on, and a confirmation that freezes the group.
- Calendar import from an uploaded `.ics` file or a subscribed ICS URL, which pre-fills busy
  times; export of the confirmed event as a download or a subscribable feed.
- Reminder mail before the confirmed event.

## Architecture at a glance

A React single-page application and a FastAPI backend, served from one origin and split by path:
`/api` to the backend, everything else to the frontend. A worker process, built from the backend
image, runs a job queue in PostgreSQL for calendar polling and all outbound mail. A circuit breaker
inside the backend guards every database call and answers `503 db_circuit_open` while the database
is unavailable.

The API is specified first, in [`contracts/openapi.yaml`](contracts/openapi.yaml); the backend
conforms to it, and the frontend generates its types from it. The design, the domain model, the
environments and the CI/CD pipeline are described in
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Running it locally

### With Docker Compose

Requires Docker with Compose v2. From the repository root:

```sh
cp infra/compose/.env.example infra/compose/.env
docker compose -f infra/compose/docker-compose.dev.yml up --build
```

The application is at <http://localhost:8080>. Sign-in mail, including the magic link, is in
Mailpit at <http://localhost:8025>. The values in `.env.example` are for local development only.
More Compose commands are in the [backend guide](docs/backend.md#common-development-workflows).

### Frontend only, against mocks

```sh
cd frontend
npm ci
npm run dev:mock
```

Needs Node.js 24, as pinned in `frontend/.nvmrc`. See [`frontend/README.md`](frontend/README.md).

### Backend tests and checks

From `backend/`, with a reachable PostgreSQL and a matching `DATABASE_URL`: `pytest`,
`ruff check .`, `mypy app`. See the [backend guide](docs/backend.md#testing-and-quality-checks).

## Deployment

### Local Kubernetes rehearsal

The production manifests also run on a local kind cluster at `http://schedular.localhost`, to
rehearse rollouts, probes and the ingress before they reach production. See
[`infra/k8s/README.md`](infra/k8s/README.md).

### Production on Azure

Production is k3s on a single Azure VM, deallocated when idle to save cost, serving
<https://schedular.polandcentral.cloudapp.azure.com> through Traefik with a cert-manager
certificate. The VM, its network perimeter, SSH access and the daily start and stop routine are in
[`infra/azure/README.md`](infra/azure/README.md).

### Releasing and operating production

A push to `main` builds and publishes images tagged `main-<sha>`. A release is started by hand with
`infra/k8s/deploy-prod.sh release main-<sha>`, which migrates, applies, gates on the rollout and
rolls back on failure. First-time setup, releases, rollback, logs and common failures are in
[`docs/deployment/runbook.md`](docs/deployment/runbook.md).

### Development deployment

Pushes to `develop` that pass CI are deployed with Docker Compose to a Raspberry Pi through a
self-hosted GitHub Actions runner, with a migration preflight and a fallback to the last good
image. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#11-cicd), section 11.

### CI and image publishing

The workflows are in [`.github/workflows/`](.github/workflows/): backend and frontend checks,
secret scanning and CodeQL on pull requests, image builds for dev and prod, and the dev deployment.
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#11-cicd) section 11 lists what each one does.

## Documentation

### Architecture and API contract

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): decisions, domain model, API conventions, limits,
  resilience, environments, CI/CD, risks.
- [`contracts/openapi.yaml`](contracts/openapi.yaml): the normative API contract.

### Backend guide

[`docs/backend.md`](docs/backend.md): components, authentication, scheduling, calendar import,
worker, database, configuration and development workflows, checked against the source.

### Frontend guide and decisions

- [`frontend/README.md`](frontend/README.md): scripts, mocking, the container image.
- [`docs/frontend/DECISIONS.md`](docs/frontend/DECISIONS.md): the frontend design decisions.

### Known limitations

What is not done, stated so that nobody mistakes a plan for a guarantee:

- **Production mail goes only to an internal sink.** `backend/app/infra/mail.py` speaks plain
  SMTP without STARTTLS, so every environment, prod included, sends to Mailpit. A magic link sent
  by prod can only be read by someone with cluster access, through a port-forward.
- **The prod certificate is from Let's Encrypt staging on `main`.** The prod overlay names the
  `letsencrypt-staging` issuer, which browsers do not trust; switching to `letsencrypt-prod` is a
  documented step of the runbook that has not been committed.
- **Single node and no automated database backups.** Prod is one VM with PostgreSQL on its OS
  disk. Losing the VM or the disk loses the data.
- **The backend image runs as root.** `backend/Dockerfile` sets no `USER`.
- **Settings fall back silently to defaults.** Every variable in `backend/app/config.py` has a
  default in code, `DATABASE_URL` and `JWT_SECRET` included, so a missing variable does not stop
  the process.
- **The worker does not use the circuit breaker.** It opens database sessions directly; when the
  database is unreachable its loop raises and the process exits, and Compose or Kubernetes
  restarts it.
- **The dev Compose file contains a literal database password.** `docker-compose.dev.yml` writes
  the development `DATABASE_URL`, password included, into the file instead of building it from
  `.env`.
- **`REFRESH_TOKEN_GRACE_SECONDS` is barely documented.** The backend reads it (default 30); it is
  missing from `.env.example` and the backend guide, and appears only in the architecture
  document's variable list.
- **Readiness does not check the schema revision.** `/readyz` checks database connectivity only,
  so a backend can report ready against a database that has not been migrated. Ordering relies on
  the migration step running first.
- **No per-IP or per-user rate limiting.** The only limit is the cooldown on manual calendar
  refresh.
- **Two group fields are always empty.** `GET /groups/{slug}` returns `confirmed_proposal` and
  `feed_url` as `null`, although the contract defines them; the export endpoints themselves work.

## Team and ownership

- Adrian Grund: architecture and API contract, frontend, production deployment (Kubernetes and
  Azure), CI checks.
- Alexander Runebou: backend, worker and database, development deployment.

[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#13-ownership) section 13 has the full table.

## Licence

The repository contains no licence file.
