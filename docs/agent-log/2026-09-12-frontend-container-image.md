# 2026-09-12 frontend-container-image

## Task

T9: produce a multi-stage Docker build for `frontend/` that serves the built SPA on nginx, falls
back to `index.html` for client routes, and proxies `/api` to a backend address supplied at
container start.

## Model

Sonnet 5

## Files changed

- `frontend/Dockerfile` (new)
- `frontend/.dockerignore` (new)
- `frontend/nginx/default.conf.template` (new)
- `frontend/README.md` (appended a "Container image" section)
- `docs/frontend/DECISIONS.md` (appended F15)
- `docs/agent-log/2026-09-12-frontend-container-image.md` (this file)
- `docs/agent-log/INDEX.md` (appended one line)

## What I did

Preflight: `git status --short` showed only `.DS_Store` untracked, so I proceeded.

Two-stage `Dockerfile`:

1. `node:24-alpine` build stage — matches the Node major version pinned in `frontend/.nvmrc`
   (`24`) and `package.json` `engines` (`>=24 <25`), pinned by tag rather than `latest`. Copies
   `package.json`/`package-lock.json` first and runs `npm ci`, then copies the rest of the
   source and runs `npm run build` (`tsc -b --noEmit && vite build`, per `package.json`), so a
   source-only change does not invalidate the `npm ci` layer.
2. `nginxinc/nginx-unprivileged:1.27-alpine` runtime stage — only `dist/` is copied in; no
   Node, npm or source in the final image.

Non-root: chose `nginxinc/nginx-unprivileged` (nginx's own unprivileged variant, listens on
8080 as the non-root `nginx` user by default) over the docker-library `nginx` image plus manual
`chown`/`USER` changes, per the instruction to prefer a base image's own unprivileged variant.
No `USER` directive was needed because the base image already runs as non-root.

Runtime configuration: the base image (built on top of official nginx) already supports
`/etc/nginx/templates/*.template` → `envsubst` → `/etc/nginx/conf.d/*.conf` at container start
(`docker-entrypoint.d/20-envsubst-on-templates.sh`), so no custom entrypoint script was needed.
`frontend/nginx/default.conf.template` uses `${BACKEND_ORIGIN}` as a placeholder; the Dockerfile
sets `ENV BACKEND_ORIGIN=http://backend:8000` as the default, overridable with `-e` or a
Kubernetes env var at container start.

`/api/v1/config` → backend path preservation: `location /api/ { proxy_pass ${BACKEND_ORIGIN}/api/; }`.
Because the `proxy_pass` value's URI (`/api/`) equals the `location` prefix, nginx does not
rewrite the path — a request to `/api/v1/config` is forwarded as `/api/v1/config` on the backend.

## Requirement-to-line mapping (steps 3-5)

| Requirement | Satisfied by |
|---|---|
| Build stage on Node image matching `.nvmrc`, pinned by tag | `Dockerfile`: `FROM node:24-alpine AS build` |
| Copy manifests first, `npm ci`, then copy rest, `npm run build` | `Dockerfile`: `COPY package.json package-lock.json ./` / `RUN npm ci` / `COPY . .` / `RUN npm run build` |
| Runtime stage on pinned nginx image, only `dist/` copied | `Dockerfile`: `FROM nginxinc/nginx-unprivileged:1.27-alpine` / `COPY --from=build /app/dist /usr/share/nginx/html` |
| Non-root, prefer base image's own unprivileged variant | `Dockerfile`: base image is `nginxinc/nginx-unprivileged`, which runs as `nginx` (non-root) by default; no `USER`/`chown` needed |
| `EXPOSE` matching listen port | `Dockerfile`: `EXPOSE 8080`; `default.conf.template`: `listen 8080;` |
| `HEALTHCHECK` requesting the application root | `Dockerfile`: `HEALTHCHECK ... CMD wget -q -O- http://127.0.0.1:8080/ \|\| exit 1` |
| Proxy `/api` to `BACKEND_ORIGIN`, default `http://backend:8000` | `Dockerfile`: `ENV BACKEND_ORIGIN=http://backend:8000`; `default.conf.template`: `location /api/ { proxy_pass ${BACKEND_ORIGIN}/api/; ... }` |
| Template substituted at container start | Base image's built-in `/etc/nginx/templates` → `envsubst` mechanism; template lives at `frontend/nginx/default.conf.template` |
| `/api/v1/config` reaches backend unchanged | `default.conf.template`: `location /api/ { proxy_pass ${BACKEND_ORIGIN}/api/; }` (matching URI prefix preserves the rest of the path) |
| SPA fallback to `index.html`, not applied to `/api` | `default.conf.template`: `location / { try_files $uri /index.html; }`, placed after the more specific `location /api/` block |
| `index.html` not cached | `default.conf.template`: `location = /index.html { add_header Cache-Control "no-cache"; }` |
| Hashed assets cached long-term | `default.conf.template`: `location ~* \.(?:js\|css\|svg\|...)$ { expires 1y; add_header Cache-Control "public, immutable"; }` |
| gzip for text/JS/CSS/JSON/SVG | `default.conf.template`: `gzip on;` / `gzip_types text/plain text/css application/javascript application/json image/svg+xml;` |
| `/healthz` answered by nginx itself, no backend dependency | `default.conf.template`: `location = /healthz { return 200 "ok\n"; }` (a static response, not proxied) |
| Forward `X-Forwarded-*`, no forced HTTPS/redirect | `default.conf.template`: `proxy_set_header X-Forwarded-Host $host;` / `X-Forwarded-Proto $scheme;` / `X-Forwarded-For $proxy_add_x_forwarded_for;`; no `return 301 https://...` or `ssl` anywhere |
| No security headers / CSP added | Confirmed by inspection: `default.conf.template` adds only `Cache-Control` headers, nothing else |

## Discrepancies noticed

None beyond what is already tracked in `docs/coordination/frontend-backend.md` C1 (this task
implements the single-origin proposal there, still `open`/unagreed with the backend).

## Assumptions made

- `nginxinc/nginx-unprivileged` counts as the base image's "own unprivileged variant" referred to
  in the task, since it is maintained by the nginx project specifically for non-root use, built on
  the same official nginx source, and supports the same `/etc/nginx/templates` mechanism.
- Pinning to the `node:24-alpine` and `nginxinc/nginx-unprivileged:1.27-alpine` tags (major/minor
  tags rather than a full patch digest) satisfies "pinned by tag, not `latest`"; I did not pin to a
  full patch version or digest because Docker is unavailable in this session to verify a chosen
  patch tag actually exists and builds.
- `1y`/`public, immutable` for hashed assets and `no-cache` for `index.html` reasonably satisfy
  "hashed asset files may be cached for a long time" / "index.html must not be cached"; no specific
  durations were given in the task.

## Follow-ups for later

- Adrian's manual acceptance step (build/run/curl checks) is still required; Docker was not
  available in this session.
- Kubernetes manifests referencing this image, its port (8080) and `BACKEND_ORIGIN` are out of
  scope here and still to be written.
- Consider pinning both base images to a full version/digest once a working build is confirmed
  locally, for reproducibility.

## Commands to verify

Docker is unavailable in this session; verification is Adrian's manual step, per the task's
acceptance criteria:

```
cd frontend
docker build -t schedular-frontend:dev .
docker run --rm -p 8080:8080 -e BACKEND_ORIGIN=http://host.docker.internal:8000 schedular-frontend:dev
curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/
curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/groups/new
curl -s http://localhost:8080/healthz
curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/api/v1/config
docker image inspect --format '{{.Config.User}}' schedular-frontend:dev
```
