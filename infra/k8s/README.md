# infra/k8s

This directory holds the Kubernetes manifests for `kind-schedular`, a local rehearsal cluster
that mimics the production Kubernetes deployment described in `docs/ARCHITECTURE.md` section 10.
It is not the project's day to day development environment: that is Alexander's Docker Compose
stack under `infra/compose/`, which is what both of you run for ordinary feature work. Use this
cluster when you specifically want to exercise the Kubernetes manifests, the ingress, rollouts
and probes before they run in production.

Everything below targets the namespace `schedular-local` on the `kind-schedular` cluster, through
the overlays `local-data`, `local-migrate` and `local`. The word "local" is used rather than "dev"
so these names never collide with the compose "dev environment". Production uses the namespace
`schedular`, through the overlays `prod-data`, `prod-migrate` and `prod`; how to set it up and
release to it is in [`docs/deployment/runbook.md`](../../docs/deployment/runbook.md), and the
sections below only describe what those directories contain.

## Layout

The manifests are split into three lifecycles: data, migration and application. This split
exists because `kubectl apply -k` submits everything in a kustomization at once, with no ordering
guarantee between resource kinds, so it cannot be trusted to bring up a Job after the Deployments
it depends on, or to run a migration Job before the application Pods that need the migrated
schema. Each lifecycle is applied as a separate command, in a fixed order.

### base

The three application workloads, their two Services and the Ingress: `backend` and `worker`
(both from the `schedular-backend:dev` image, different entrypoints), `frontend`, and the Ingress
`schedular`. No Namespace, no Secret, no ConfigMap. It renders into whichever namespace and
configuration an overlay supplies.

The Ingress uses the IngressClass `traefik` and splits one host by path: `/api` (Prefix) to the
Service `backend` on port 8000, and `/` (Prefix) to the Service `frontend` on port 8080. Prefix
matching compares whole path segments, so `/api` matches `/api/v1/config` but not `/apiary`. The
base Ingress has no host; each overlay adds its own with a patch.

### postgres

The single PostgreSQL StatefulSet `postgres` and its ClusterIP Service, also `postgres`. Kept
apart from `base/` because it has its own lifecycle: applied once and left alone across every
application rollout. No Namespace, no Secret here either.

### migrate

The `migrate` Job, which runs `alembic upgrade head` with the backend image. Kept apart from both
`base/` and `postgres/` so that applying the application can never start it, and applying it can
never start the application.

### mailpit

The mail sink, shared by `overlays/local` and `overlays/prod`: one Deployment and one ClusterIP
Service, both `mailpit`, with SMTP on 1025 and the web UI on 8025, image `axllent/mailpit:v1.27.8`,
the same tag as the dev deployment's `infra/compose/docker-compose.deploy.yml` (the local compose
file, `docker-compose.dev.yml`, uses `latest`). `backend/app/infra/mail.py` speaks
plain SMTP without STARTTLS, so neither environment delivers to a real mailbox; magic links and
circuit alerts land here. Nothing is persisted: a restart empties the inbox.

There is no Ingress, NodePort or LoadBalancer for it. The NetworkPolicy `mailpit` admits only the
`backend` and `worker` pods, and only on 1025; nothing may reach 8025. `kubectl port-forward`
reaches the UI regardless, because the kubelet connects inside the pod's network namespace and
NetworkPolicy never sees that traffic. That is the intended way in:

```sh
kubectl -n schedular-local port-forward service/mailpit 8025:8025
```

then open <http://127.0.0.1:8025>. For prod, the same with `devops-kubectl -n schedular`.

### overlays/local-data

First lifecycle. Owns the Namespace `schedular-local` and includes `postgres/`. This is the
longest lived of the three overlays: deleting the application overlay later can never take the
Namespace, and therefore the database's PVC, with it.

### overlays/local-migrate

Second lifecycle. Includes `migrate/`, namespaced to `schedular-local`. Needs Postgres ready and
the `schedular-secrets` Secret present before it does anything useful.

### overlays/local

Third lifecycle, the application. Includes `base/` and `mailpit/`, namespaced to `schedular-local`, adds the host
`schedular.localhost` to the Ingress, and supplies the non-secret settings via a
`configMapGenerator` for `schedular-config` (including `PUBLIC_APP_URL=http://schedular.localhost`
and `AUTH_COOKIE_SECURE=false`, since the local entrypoint is plain HTTP). It does not declare the
Namespace, which belongs to `overlays/local-data`.

### overlays/prod-data, overlays/prod-migrate, overlays/prod

The same three lifecycles for production, in the namespace `schedular`, which only `prod-data`
declares. `prod-migrate` and `prod` set the registry names
`ghcr.io/a-runebou/dd2482_project-backend` and `-frontend` but no tag, and the `prod` ConfigMap has
no `BUILD_SHA`: both are added per release by `deploy-prod.sh`, so applying either overlay
directly cannot start a pod. `prod` adds the host `schedular.polandcentral.cloudapp.azure.com`, a
`tls` section with the Secret `schedular-tls`, the `cert-manager.io/cluster-issuer` annotation,
the production settings, and a liveness and startup probe on the worker
(`python -m app.worker.health`), which only images that contain the heartbeat can pass. The local
overlay has no worker probe.

### deploy-prod.sh

`render <tag>` prints the `prod-migrate` and `prod` manifests for one image tag without contacting
anything; `release <tag>` checks, migrates, applies, gates and rolls back. Both are described in the
runbook. Neither ever applies `prod-data`.

### ci

The namespace-scoped credential for `.github/workflows/deploy-prod.yml`: ServiceAccount
`github-deployer`, a Role with exactly the calls `deploy-prod.sh release` makes (no Secrets, no
exec, attach or port-forward, no RBAC objects), its RoleBinding and a long-lived token Secret.
`make-ci-kubeconfig.sh` turns the token into the `PROD_KUBECONFIG` secret. Not applied by any
release; prepared, not active (runbook, "Automated deployment (prepared, not active)").

### cert-manager

Helm values for `jetstack/cert-manager` (`values.yaml`) and, in `issuers/`, the two ClusterIssuers
`letsencrypt-staging` and `letsencrypt-prod` (ACME HTTP-01 through the IngressClass `traefik`).
Production only.

### kind

`kind/cluster.yaml` defines the cluster itself: name `schedular`, one control-plane node pinned by
digest to `kindest/node:v1.37.0`, and one port mapping from the node's port 30080 to port 80 on
the host, bound to `127.0.0.1`.

### traefik

Helm values for the ingress controller, chart `traefik/traefik` version 41.6.0, release `traefik`,
namespace `traefik`. `values.yaml` holds what every environment shares: the IngressClass
`traefik`, and only the standard Kubernetes Ingress provider enabled (the IngressRoute CRD and
Gateway API providers are off). `values-local.yaml` holds the kind settings: the Traefik Service
is a NodePort, only the `web` entrypoint is exposed, on node port 30080, the dashboard has no
route, and forwarded headers from clients are not trusted. `values-prod.yaml` holds the prod
settings: a LoadBalancer Service, which k3s's ServiceLB binds to ports 80 and 443 on the VM, `web`
redirecting permanently to `websecure`, no dashboard route, and no trusted forwarded headers.

## Differences between the rehearsal and prod

The local overlays run the same base, Postgres, migration and Mailpit manifests as prod. They
differ in what the prod overlays add:

- TLS: the local entrypoint is plain HTTP on `schedular.localhost`, with `AUTH_COOKIE_SECURE=false`
  and no cert-manager. Prod terminates TLS at Traefik with a cert-manager certificate.
- Worker probes: only `overlays/prod` adds the startup and liveness probes on
  `python -m app.worker.health`; the local worker has no probe.
- Images: locally built bare tags (`schedular-backend:dev`, `schedular-frontend:dev`) loaded into
  kind, against `main-<sha>` images from GHCR in prod.
- Traefik: a NodePort with only the `web` entrypoint locally, against a LoadBalancer on 80 and 443
  with a permanent redirect to HTTPS in prod.

## Rebuilding the cluster from nothing

Run every command from the repository root. This is the full sequence; on an existing cluster,
start from whichever step you need (see "Releasing again" below).

1. Delete any existing cluster. Port mappings can only be set at creation, so a cluster made
   without `kind/cluster.yaml` cannot be fixed in place:

   ```sh
   kind delete cluster --name schedular
   ```

2. Create the cluster from the committed config:

   ```sh
   kind create cluster --config infra/k8s/kind/cluster.yaml
   ```

   The context is `kind-schedular`. Check `kubectl config current-context` before going further.

3. Build both images and load them into the node. The tags are bare names with no registry, and
   nothing is ever pulled for them:

   ```sh
   docker build -t schedular-backend:dev backend
   docker build -t schedular-frontend:dev frontend
   kind load docker-image schedular-backend:dev --name schedular
   kind load docker-image schedular-frontend:dev --name schedular
   ```

4. Apply the data lifecycle. On a fresh cluster this must come before the Secrets, because it
   creates the Namespace they live in:

   ```sh
   kubectl apply -k infra/k8s/overlays/local-data
   ```

   Until `postgres-credentials` exists, the Postgres pod waits in `CreateContainerConfigError` and
   recovers on its own once the Secret is created; there is no need to delete or recreate
   anything.

5. Create the Secret `schedular-secrets` in `schedular-local`. It needs four keys:
   `DATABASE_URL`, `JWT_SECRET`, `SMTP_USERNAME`, `SMTP_PASSWORD`. Each is a plain
   `--from-literal`; none of them are described further here, since no command in this document
   embeds a value. All four keys must exist, or the backend and worker containers fail to be
   created rather than starting with a default. The command shape is in the comment at the end of
   `overlays/local/kustomization.yaml`.

6. Create the Secret `postgres-credentials` in `schedular-local`, derived from `schedular-secrets`
   so the two can never disagree: its `POSTGRES_PASSWORD` is the password extracted from
   `schedular-secrets`'s `DATABASE_URL`, and its `POSTGRES_USER` and `POSTGRES_DB` must match the
   user and database name in that same URL, since `postgres/service.yaml` requires the connection
   string to point at `postgres:5432/<that database>`. The extraction takes the password exactly
   as it appears in the URL, which is percent-encoded, so it is only correct if the password
   contains no character that needs percent-encoding. The commands are in the comment in
   `overlays/local-data/kustomization.yaml`.
   * `PGPW="$(kubectl -n schedular-local get secret schedular-secrets -o jsonpath='{.data.DATABASE_URL}' | base64 -d | sed -E 's#^[^:]+://[^:]+:([^@]*)@.*#\1#')"`
   * `kubectl -n schedular-local create secret generic postgres-credentials --from-literal=POSTGRES_USER=schedular --from-literal=POSTGRES_DB=schedular --from-literal=POSTGRES_PASSWORD="$PGPW"`
   * `unset PGPW`
   * `kubectl -n schedular-local describe secret postgres-credentials`

7. Install Traefik with the pinned chart version and both values files, common first:

   ```sh
   helm repo add traefik https://traefik.github.io/charts
   helm repo update traefik
   helm install traefik traefik/traefik --version 41.6.0 \
     --namespace traefik --create-namespace \
     -f infra/k8s/traefik/values.yaml \
     -f infra/k8s/traefik/values-local.yaml
   kubectl -n traefik rollout status deployment/traefik
   ```

8. Wait for Postgres:

   ```sh
   kubectl -n schedular-local rollout status statefulset/postgres
   ```

9. Run the migration and wait for it:

   ```sh
   kubectl -n schedular-local delete job migrate --ignore-not-found
   kubectl apply -k infra/k8s/overlays/local-migrate
   kubectl -n schedular-local wait --for=condition=complete job/migrate --timeout=300s
   kubectl -n schedular-local logs job/migrate
   ```

10. Apply the application:

    ```sh
    kubectl apply -k infra/k8s/overlays/local
    ```

## Releasing again

On a cluster that already exists, a release is steps 3 (rebuild and reload the images), 8, 9 and
10. The Job must be deleted before every re-run, whether or not anything in it changed, because
its pod template is immutable. Reloading an image under the same tag does not restart the pods
that use it; `kubectl -n schedular-local rollout restart deployment/<name>` does.

## Reaching the application

Open <http://schedular.localhost> in a browser on the Mac. The request path is:

- the browser resolves `schedular.localhost` to `127.0.0.1`,
- kind forwards `127.0.0.1:80` to port 30080 on the node,
- Traefik's `web` entrypoint receives it on that NodePort and matches the Ingress on its host,
- `/api/...` goes straight to the Service `backend` on port 8000, and everything else to the
  Service `frontend` on port 8080.

To check each route from a terminal:

```sh
curl -i http://schedular.localhost/api/v1/config
curl -i http://schedular.localhost/
```

Browsers and curl resolve any name ending in `.localhost` to loopback themselves. A tool that
relies on the system resolver may not; for that tool, pass the name explicitly, for example
`curl --resolve schedular.localhost:80:127.0.0.1 ...`, or add a hosts entry.

To see what Traefik made of the Ingress:

```sh
kubectl -n schedular-local describe ingress schedular
kubectl -n traefik logs deployment/traefik
```

## Inspecting the cluster

### Rollouts

```sh
kubectl -n schedular-local rollout status deployment/backend
```

The exit code is what a script or CI gate should check: zero once the rollout completes, non-zero
if it times out or fails. The same command works for `deployment/frontend`, `deployment/worker`
and `statefulset/postgres`.

```sh
kubectl -n schedular-local get rs -l app.kubernetes.io/component=backend
```

Lists the ReplicaSets for one component, so you can see the old and new generations during a
rollout and which one currently holds the ready replicas. Swap the label value for `frontend` or
`worker`.

```sh
kubectl -n schedular-local get deployment backend -o jsonpath='{.status.conditions}'
```

Prints the Deployment's conditions directly, which is where `ProgressDeadlineExceeded` shows up
if a rollout stalls (see Pitfalls below).

```sh
kubectl -n schedular-local rollout history deployment/backend
```

Lists past revisions of a Deployment.

```sh
kubectl -n schedular-local rollout history deployment/backend --revision=2
```

Shows the full pod template of one specific revision, useful for seeing exactly what changed
between two rollouts.

### Pods

```sh
kubectl -n schedular-local get pods -w
```

```sh
kubectl -n schedular-local get pvc -w
```

These are two separate commands because `get -w` only accepts one resource type at a time; there
is no single watch that covers both Pods and PersistentVolumeClaims.

```sh
kubectl -n schedular-local describe pod <pod-name>
```

Look at the `Last State` and `Restart Count` fields under the container status: `Last State`
shows the exit reason of the previous instance (for example `OOMKilled` with exit code 137), and
a climbing restart count on its own tells you a container is repeatedly failing even if it is
currently running.

```sh
kubectl -n schedular-local logs <pod-name>
```

```sh
kubectl -n schedular-local logs <pod-name> --previous
```

`--previous` reads the logs of the container instance before the current restart, which is
usually the one that actually failed.

```sh
kubectl -n schedular-local logs <pod-name> --timestamps
```

Adds a timestamp to every line, useful when correlating a crash against a probe failure or an
external event.

### Configuration

```sh
kubectl -n schedular-local describe secret schedular-secrets
```

Shows the key names and their byte sizes, never the values, which is enough to confirm all four
expected keys (`DATABASE_URL`, `JWT_SECRET`, `SMTP_USERNAME`, `SMTP_PASSWORD`) are present and
non-empty. The same applies to `postgres-credentials` and its three keys.

To confirm which ConfigMap a pod is actually using, since the `local` overlay's
`configMapGenerator` appends a content hash to the name:

```sh
kubectl -n schedular-local get deployment backend -o jsonpath='{.spec.template.spec.containers[0].env[*].valueFrom.configMapKeyRef.name}'
```

This prints the generated name (for example `schedular-config-2d227g7gm5`), which changes
whenever a value in the generator changes, and which is what forces a rollout when configuration
changes.

### Database

```sh
kubectl -n schedular-local exec -it postgres-0 -- psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
```

The shell inside the pod already has `POSTGRES_USER` and `POSTGRES_DB` set, since the container's
own probes rely on them (see `postgres/statefulset.yaml`); this avoids hard-coding whatever
values were chosen when `postgres-credentials` was created. The setup instructions above use
`schedular` for both, but no manifest fixes them.

Inside `psql`, `\dt` lists the tables, and `select * from alembic_version;` shows the schema
revision the database is currently at, which is the only reliable way to confirm a migration
actually applied, since `/readyz` does not check it (see Pitfalls below).

## Pitfalls

A Job's pod template is immutable. Re-applying `overlays/local-migrate` against an existing
`migrate` Job that has not changed does nothing at all, and re-applying it after changing the
image or command fails outright. The Job must be deleted first, every time, whether or not
anything in it changed.

`kubectl apply -k` never deletes a resource that a kustomization has stopped mentioning. Removing
a resource from a `resources:` list and re-applying leaves the old object in the cluster; it has
to be deleted explicitly.

PostgreSQL only reads `POSTGRES_PASSWORD` (and `POSTGRES_USER`, `POSTGRES_DB`) when its data
directory is empty. Changing `postgres-credentials` after the cluster has already been
initialised has no effect on the running database. Deleting the `schedular-local` Namespace deletes
the `postgres` StatefulSet's PVC along with it, and since the cluster uses the `local-path`
provisioner with no retention policy override, that also deletes the underlying data on disk.

`/readyz` on the backend checks database connectivity only, by running a trivial query through
the circuit breaker. It says nothing about the schema revision, so a backend can report ready
against a database that has never been migrated. Ordering is enforced entirely by applying the
migration overlay separately and waiting for the Job to complete, not by anything the application
itself checks.

A pod with no readiness probe is considered ready as soon as it starts running, regardless of
whether it is actually doing useful work. The local `worker` Deployment has no probes at all,
since it serves no HTTP endpoint (prod adds startup and liveness probes on the heartbeat, see
above), which means a rollout gate watching the local `deployment/worker` cannot detect a worker
that starts, then crashes on its first database call; it can only detect a worker that fails to
start at all.

nginx in the frontend image resolves the `backend` Service name to an address once, when the
worker process starts, and keeps using that address for the life of the process. The Service must
stay a plain ClusterIP, not headless, because a headless Service would eventually hand it a pod
IP that stops existing after the next backend rollout. If the `backend` Service is ever deleted
and recreated, the frontend pods must be restarted, or they will keep proxying to a stale address.

`ProgressDeadlineExceeded` on a Deployment is a status the controller reports; it is not a
decision the controller acts on. A Deployment that exceeds its progress deadline is left exactly
as it is: the controller keeps trying to reconcile it, new pods keep being created and probed, and
nothing is rolled back automatically. Seeing this condition means someone has to intervene, either
by fixing the underlying problem or by rolling back manually.

An Ingress without a controller is stored and ignored. `kubectl apply` accepts it, `kubectl get
ingress` lists it, and nothing answers on the host, because the API server only stores the object;
it is Traefik that reads it and routes. If `schedular.localhost` refuses the connection or hangs,
check first that the `traefik` release exists and its pod is ready (`kubectl -n traefik get
pods`), and that the Ingress's class is `traefik`.

The frontend's nginx resolves `backend` when it starts and refuses to start if the name does not
resolve. After a node restart, the frontend pod can come up before cluster DNS or the `backend`
Service is answering, so it crash-loops briefly and then settles once the name resolves. A few
restarts in `kubectl -n schedular-local get pods` right after a restart are expected; a restart
count that keeps climbing is not, and means `backend` is genuinely missing.

The host port is bound to `127.0.0.1` deliberately, in `kind/cluster.yaml`. The rehearsal cluster
runs with throwaway secrets and plain HTTP, so it must not be reachable from anything else on the
network. Do not change `listenAddress` to `0.0.0.0` to reach it from another device.
