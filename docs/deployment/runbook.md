# Production runbook

First written 2026-10-04 and used for the production release. Correct this file whenever a step
behaves differently.

Production is the k3s VM described in [`infra/azure/README.md`](../../infra/azure/README.md),
serving <https://schedular.polandcentral.cloudapp.azure.com>. The manifests are described in
[`infra/k8s/README.md`](../../infra/k8s/README.md). This file only says what to run, in which
order, and what to look at when it goes wrong.

## Before anything

- `devops-kubectl` and `devops-helm` work: see "Operating the prod cluster" in the Azure README.
  `deploy-prod.sh` runs `devops-kubectl` as a command, so it must be on `PATH` (option 1 there);
  aliases do not reach scripts. Otherwise set `KUBECTL=/full/path/to/infra/azure/bin/devops-kubectl`.
- Local `kubectl`, `helm`, `docker` (running), `openssl` and `curl`.
- Run everything from the repository root, in a clean checkout of the commit you are releasing.
  `deploy-prod.sh release` takes the images from the tag but the manifests from your working tree,
  so it enforces this: see "Release guards".
- A prod tag is `main-<the full 40-character commit SHA>`, published by
  `.github/workflows/build-images-prod.yml` on every push to `main`. The run's job summary lists
  both image references.

## First-time setup

On the empty cluster, in exactly this order. Each step ends with its check; do not go on until it
passes.

### 1. Traefik

```sh
helm repo add traefik https://traefik.github.io/charts
helm repo update traefik
devops-helm install traefik traefik/traefik --version 41.6.0 \
  --namespace traefik --create-namespace \
  -f infra/k8s/traefik/values.yaml \
  -f infra/k8s/traefik/values-prod.yaml
devops-kubectl -n traefik rollout status deployment/traefik
devops-kubectl -n traefik get service traefik
curl -sI http://schedular.polandcentral.cloudapp.azure.com/
```

The Service shows ports `80` and `443` with the node's address as external IP (ServiceLB). The
curl answers with a permanent redirect (301 or 308) to `https://`; the HTTPS side has no route yet.

### 2. cert-manager

v1.21.2 was the latest stable release on api.github.com when this was written. Before installing,
check whether a newer one exists and, if so, update the version here and in
`infra/k8s/cert-manager/values.yaml` together.

```sh
helm repo add jetstack https://charts.jetstack.io
helm repo update jetstack
devops-helm install cert-manager jetstack/cert-manager --version v1.21.2 \
  --namespace cert-manager --create-namespace \
  -f infra/k8s/cert-manager/values.yaml
devops-kubectl -n cert-manager rollout status deployment/cert-manager
devops-kubectl -n cert-manager rollout status deployment/cert-manager-webhook
devops-kubectl -n cert-manager rollout status deployment/cert-manager-cainjector
```

### 3. The issuers

Only once the webhook is ready, or the API server rejects the ClusterIssuers.

```sh
devops-kubectl apply -k infra/k8s/cert-manager/issuers
devops-kubectl get clusterissuer
```

Both `letsencrypt-staging` and `letsencrypt-prod` show `READY True` once their ACME accounts are
registered.

### 4. The two Secrets

The Namespace belongs to `overlays/prod-data`, but the Secrets have to exist before Postgres
first starts, so apply just that overlay's Namespace file first. `prod-data` re-applies the same
object in step 5 without change.

```sh
devops-kubectl apply -f infra/k8s/overlays/prod-data/namespace.yaml
```

`schedular-secrets`, with values generated in a subshell so they never reach the screen, the shell
history or the parent shell. The password is hex, so it needs no percent-encoding in the URL and
the extraction below is exact. `SMTP_USERNAME` and `SMTP_PASSWORD` are deliberately empty: Mailpit
offers no SMTP AUTH, and `mail.py` only logs in when both are set.

```sh
(
  PGPW="$(openssl rand -hex 32)"
  JWT="$(openssl rand -hex 32)"
  devops-kubectl -n schedular create secret generic schedular-secrets \
    --from-literal=DATABASE_URL="postgresql+psycopg://schedular:${PGPW}@postgres:5432/schedular" \
    --from-literal=JWT_SECRET="${JWT}" \
    --from-literal=SMTP_USERNAME= \
    --from-literal=SMTP_PASSWORD=
)
```

`postgres-credentials`, derived from it exactly as for the local cluster (see
`infra/k8s/overlays/local-data/kustomization.yaml`), so the two cannot disagree:

```sh
PGPW="$(devops-kubectl -n schedular get secret schedular-secrets -o jsonpath='{.data.DATABASE_URL}' | base64 -d | sed -E 's#^[^:]+://[^:]+:([^@]*)@.*#\1#')"
devops-kubectl -n schedular create secret generic postgres-credentials \
  --from-literal=POSTGRES_USER=schedular \
  --from-literal=POSTGRES_DB=schedular \
  --from-literal=POSTGRES_PASSWORD="$PGPW"
unset PGPW
devops-kubectl -n schedular describe secret schedular-secrets postgres-credentials
```

`describe` shows sizes, never values. Expected: `DATABASE_URL` 119 bytes, `JWT_SECRET` 64,
`SMTP_USERNAME` and `SMTP_PASSWORD` 0, `POSTGRES_PASSWORD` 64, `POSTGRES_USER` and `POSTGRES_DB` 9.

These Secrets are never recreated casually: Postgres reads its password only when its volume is
empty, so a new `postgres-credentials` does not change the running database.

### 5. prod-data

```sh
devops-kubectl apply -k infra/k8s/overlays/prod-data
devops-kubectl -n schedular rollout status statefulset/postgres --timeout=300s
devops-kubectl -n schedular get pvc
```

The PVC `data-postgres-0` is `Bound` (local-path, on the VM's OS disk).

### 6. First release

Two things must hold for the image, or the release stops on its own:

- it contains Alexander's worker heartbeat (`app.worker.health`), or the worker's startup probe
  fails and the rollout gate fails;
- it does not contain the two "temporary" Alembic revisions from `feat/dev-deployment`, or step c
  of the release refuses to migrate.

Check out the `main` commit the tag names first (`git checkout <SHA>`, with nothing uncommitted),
or `release` refuses (see "Release guards").

```sh
TAG=main-<40-character SHA>
infra/k8s/deploy-prod.sh render "$TAG" | less    # optional: read what will be applied
infra/k8s/deploy-prod.sh release "$TAG"
```

### 7. Check the staging certificate

The Ingress starts with `cert-manager.io/cluster-issuer: letsencrypt-staging`.

```sh
devops-kubectl -n schedular get certificate schedular-tls
curl -skI https://schedular.polandcentral.cloudapp.azure.com/
openssl s_client -connect schedular.polandcentral.cloudapp.azure.com:443 \
  -servername schedular.polandcentral.cloudapp.azure.com </dev/null 2>/dev/null \
  | openssl x509 -noout -issuer -dates
```

The Certificate is `READY True`, curl gets a 200 (with `-k`, because staging is not trusted), and
the issuer contains `(STAGING)`. If the Certificate stays `False`, see "Certificate stuck pending".

### 8. Switch to letsencrypt-prod

The issuer is the `cert-manager.io/cluster-issuer` annotation on the prod Ingress, set in
`infra/k8s/overlays/prod/kustomization.yaml`. Switching it means editing that annotation from
`letsencrypt-staging` to `letsencrypt-prod` and releasing again; nothing applies it except a
release. So:

1. make the edit and merge it to `main` as usual;
2. wait for `build-images-prod.yml` to publish `main-<SHA>` for the merge commit;
3. check out that commit, with a clean tree, and run `deploy-prod.sh release main-<SHA>` as in
   step 6. The "Release guards" apply: a dirty tree is refused, and so is a HEAD other than that
   commit. Editing the annotation in your working tree and releasing an older tag is therefore not
   a shortcut; it is refused, and `--allow-commit-mismatch` is not meant for it.

cert-manager notices the Certificate's issuer has changed and issues a new one from production
into the same Secret.

```sh
devops-kubectl -n schedular get certificate schedular-tls -w
```

### 9. Final check

```sh
curl -sI http://schedular.polandcentral.cloudapp.azure.com/
curl -sI https://schedular.polandcentral.cloudapp.azure.com/
curl -s https://schedular.polandcentral.cloudapp.azure.com/api/v1/config
devops-kubectl -n schedular get pods
```

HTTP answers with a permanent redirect, HTTPS answers 200 without `-k`, `/api/v1/config` returns
JSON, and `backend`, `worker`, `frontend`, `mailpit` and `postgres-0` are all `Running` and ready.
Open the site in a browser and sign in once; the magic link is in Mailpit (see below).

## Routine release

```sh
TAG=main-<40-character SHA>
infra/k8s/deploy-prod.sh release "$TAG"
```

From a clean checkout of that commit (HEAD on the `main` commit the images were built from, which
is the normal path). What `release` does, in order, stopping at the first failure:

0. runs the two guards below, before anything else;
1. validates the tag (`main-` and 40 lowercase hex) and renders both overlays for it, locally;
2. checks both images can be read anonymously (`docker manifest inspect` with an empty
   `DOCKER_CONFIG`), since the cluster has no pull secret;
3. lists the Alembic revisions inside the backend image (`docker run --network none ... alembic
   history`, no cluster, no database) and refuses any revision whose message contains
   "temporary". On Apple silicon this runs the amd64 image under emulation;
4. checks Postgres is ready. It does not check that `schedular-secrets` exists, because the CI
   credential may not read Secrets; a missing one shows up in step 5 or 7 as
   `CreateContainerConfigError`;
5. deletes the previous `migrate` Job, applies the new one and waits for `Complete` or `Failed`
   (or 360 s). On failure it prints the Job and its logs and stops; the application is untouched;
6. applies the application;
7. waits for `backend`, `worker` and `frontend` to roll out (`ROLLOUT_TIMEOUT`, default `300s`);
8. on any failure in 6 or 7, prints the events and logs of every pod that is not ready, rolls back
   (below) and exits non-zero.

It never applies `prod-data`. `KUBECTL` (default `devops-kubectl`) is the only way it reaches the
cluster; it may carry arguments, as in `KUBECTL="kubectl --kubeconfig /path/file"`, split on
whitespace. `RENDER_KUBECTL` (default `kubectl`) is used for `kubectl kustomize` only.

## Release guards

`release` reads its manifests from the working tree but takes its images from the tag, so the two
can silently disagree. It therefore makes two checks, before any call to the cluster:

1. **Clean tree.** `git status --porcelain` must print nothing: no modified, staged or untracked
   files. The changes are listed and the release stops. There is no flag to override this.
2. **HEAD is the tag's commit.** `git rev-parse HEAD` must equal the 40-character SHA in the tag.
   Otherwise the release stops. `--allow-commit-mismatch` continues instead, after a prominent
   warning naming both commits:

   ```sh
   infra/k8s/deploy-prod.sh release --allow-commit-mismatch "$TAG"
   ```

   Use it only when you know the manifests at HEAD are the ones the images need, for example a
   rollback to an older image with manifests that have not changed since. The normal path is to
   release with HEAD on the `main` commit the images were built from, and never to pass the flag.

`render` is subject to neither check; it contacts nothing and is safe on a dirty tree.

## What rollback does and does not do

It does:

- `rollout undo` each Deployment (`backend`, `worker`, `frontend`, `mailpit`) that existed before
  the release **and** got a new revision from it, back to exactly the revision it had before;
- wait for those undos to finish and report any that did not.

It does not:

- touch the database. The migration has already run and stays applied. No `alembic downgrade` is
  ever run: migrations must be backwards compatible with the previous release (ARCHITECTURE
  section 11), so the old code runs against the new schema;
- undo a Deployment that had no previous revision (the first release) or that this release did not
  change;
- revert Services, the Ingress, the NetworkPolicy or other non-Deployment objects; they stay as
  the failed release applied them. The previous generated `schedular-config-<hash>` ConfigMap is
  still in the cluster (apply never prunes), which is why the undone pods start;
- help after a release that succeeded. Going back later means `devops-kubectl -n schedular rollout
  undo deployment/<name>` by hand. Releasing an older tag is only possible if its image knows
  every revision in the database; otherwise its migrate Job fails ("Can't locate revision") and
  the release stops safely before the application.

## Automated deployment (prepared, not active)

`.github/workflows/deploy-prod.yml` runs the same `deploy-prod.sh release main-<SHA>` from a GitHub
runner. It is written, linted and reviewed, but **not active**, and running `deploy-prod.sh` by hand
stays the normal path.

### Why it is inactive

It needs three secrets, `PROD_SSH_PRIVATE_KEY`, `PROD_SSH_KNOWN_HOSTS` and `PROD_KUBECONFIG`, and the
variable `PROD_HOST` (`schedular.polandcentral.cloudapp.azure.com`), all on the GitHub environment
`production`. Setting them needs admin rights on the repository, which only Alexander has. Until all
four exist, every run stops at its first step with a pointer to this section. Even once active it
is manual: `workflow_dispatch` only, a required reviewer on `production` approves each run, and
nothing triggers it on its own.

### What a run does

1. Fails at once if a secret or `PROD_HOST` is empty (it tests presence, never prints a value).
2. Checks the input is 40 lowercase hex and an ancestor of `main` (GitHub's compare API), checks out
   exactly that commit with full history and repeats the ancestor check with `git merge-base`.
3. Installs kubectl v1.37.1 from dl.k8s.io and verifies its sha256, pinned in the workflow.
4. Opens the SSH tunnel `127.0.0.1:16443 -> VM 127.0.0.1:6443` as `azureuser` with the CI key only
   (`-F /dev/null`, `IdentityAgent=none`), strict host key checking against `PROD_SSH_KNOWN_HOSTS`
   alone. A deallocated VM fails here; a runner cannot start it.
5. Runs `deploy-prod.sh release main-<SHA>` with `KUBECTL="kubectl --kubeconfig <PROD_KUBECONFIG
   file>"`: the same guards, gates and rollback as by hand.
6. Smoke test from the runner: `https://<PROD_HOST>/healthz` and `/api/v1/config` must answer 200.
   A failure fails the run but rolls nothing back. It needs the trusted `letsencrypt-prod`
   certificate (step 8 of the first-time setup); against staging it fails by design, since it does
   not pass `-k`.
7. Always closes the tunnel and deletes the key and kubeconfig files, then writes the SHA, the image
   tag and the outcome into the job summary.

Runs share the concurrency group `prod-deploy`: a running deployment is never cancelled, and a
newer queued run replaces an older queued one.

### What the CI credentials can do

- The SSH key can open exactly one forward, to `127.0.0.1:6443` on the VM, and run no command:
  its `authorized_keys` line is `restrict,port-forwarding,permitopen="127.0.0.1:6443",command="/bin/false"`.
- `PROD_KUBECONFIG` is a token for the ServiceAccount `github-deployer` (`infra/k8s/ci/`), bound to
  a Role in namespace `schedular` that grants exactly the calls `release` makes. It cannot read
  Secrets, exec into, attach to or port-forward to pods, or touch Roles, RoleBindings or
  ServiceAccounts, and has nothing outside the namespace.
- It can create and patch Deployments and Jobs, though, and a pod can mount any Secret in its
  namespace. Treat `PROD_KUBECONFIG` as being as sensitive as `schedular-secrets` itself. RBAC alone
  cannot close this; an admission policy could, and is not part of this setup.

### Activation checklist

In this order, on Adrian's laptop unless a step says otherwise, from the repository root and with
the VM running. Everything is created in a temporary directory outside the repository:

```sh
D="$(mktemp -d)"; chmod 700 "$D"
FQDN=schedular.polandcentral.cloudapp.azure.com
```

**1. Generate the CI key**, without a passphrase, because a runner cannot type one:

```sh
ssh-keygen -t ed25519 -N '' -C schedular-github-deploy -f "$D/id_ci"
```

**2. Install its restricted line on the VM**, with your own admin key:

```sh
printf 'restrict,port-forwarding,permitopen="127.0.0.1:6443",command="/bin/false" %s\n' "$(cat "$D/id_ci.pub")" \
  | ssh azureuser@"$FQDN" 'cat >> ~/.ssh/authorized_keys'
ssh azureuser@"$FQDN" 'grep schedular-github-deploy ~/.ssh/authorized_keys'
```

Exactly one line, starting with `restrict,` and ending with `schedular-github-deploy`.

**3. Test the restricted key.** `-F /dev/null -o IdentityAgent=none` on every command, or ssh
silently falls back to your admin key from `~/.ssh/config` or the agent and the test proves
nothing:

```sh
ci_ssh() {
  ssh -F /dev/null -o IdentityAgent=none -o IdentitiesOnly=yes -o BatchMode=yes \
    -i "$D/id_ci" "$@"
}

# a) No command execution: prints nothing (no uid=...) and exits non-zero.
ci_ssh azureuser@"$FQDN" id; echo "exit $?"

# b) The API forward works and the API answers 401 or 403 (no credential is sent).
ci_ssh -f -N -M -S "$D/t.sock" -o ExitOnForwardFailure=yes -L 26443:127.0.0.1:6443 azureuser@"$FQDN"
curl -sk -o /dev/null -w '%{http_code}\n' https://127.0.0.1:26443/api
ci_ssh -S "$D/t.sock" -O exit azureuser@"$FQDN"

# c) Any other forward is refused: no "SSH-2.0-" banner from port 22.
ci_ssh -f -N -M -S "$D/t.sock" -L 26422:127.0.0.1:22 azureuser@"$FQDN"
nc -w 5 127.0.0.1 26422 </dev/null; echo "(nothing above is correct)"
ci_ssh -S "$D/t.sock" -O exit azureuser@"$FQDN"
```

`-k` in b) is acceptable only because no credential is sent and only the forward is under test.
If a) prints a `uid=` line or c) prints an SSH banner, stop: the restriction is not in effect.

**4. Record the host key** and compare its fingerprint with the trusted one from
`infra/azure/README.md`, "Verify the host key" (boot log or `az vm run-command`), character by
character:

```sh
ssh-keyscan -t ed25519 "$FQDN" 2>/dev/null >"$D/known_hosts"
ssh-keygen -lf "$D/known_hosts"
```

One line, starting with the host name, type `ED25519`. If the fingerprint differs, stop.

**5. Apply the RBAC and check it:**

```sh
devops-kubectl apply -k infra/k8s/ci
devops-kubectl auth can-i --list --as=system:serviceaccount:schedular:github-deployer -n schedular
```

The list shows the rules of `infra/k8s/ci/role.yaml` plus the defaults every authenticated user has
(self-reviews and discovery URLs), and no `secrets`, no `pods/exec`, `pods/attach` or
`pods/portforward`, no `roles`, `rolebindings` or `serviceaccounts` and no `*`.

**6. Generate `PROD_KUBECONFIG`:**

```sh
infra/k8s/ci/make-ci-kubeconfig.sh "$D/kubeconfig"
```

It refuses a path inside the repository, writes mode 600, never prints the token, and tries the new
file through the tunnel: it must be able to patch Deployments and must not read Secrets.

**7. Have a repository admin set the secrets and the variable**, without the private material ever
leaving the machine it was created on. Either:

- **The admin signs in to `gh` on this machine**, for this step only:

  ```sh
  gh auth login
  gh secret set PROD_SSH_PRIVATE_KEY --env production <"$D/id_ci"
  gh secret set PROD_SSH_KNOWN_HOSTS --env production <"$D/known_hosts"
  gh secret set PROD_KUBECONFIG --env production <"$D/kubeconfig"
  gh variable set PROD_HOST --env production --body "$FQDN"
  gh auth logout
  ```

- **Or the admin generates the key pair** on their own machine (step 1 there) and sends only
  `id_ci.pub`. Steps 2, 4, 5 and 6 still run here; step 3 needs the private key, so the admin runs
  it on their machine with the same commands. The known_hosts line is public and can be sent to the
  admin. `PROD_KUBECONFIG` is private and is created here, so for that one secret the admin still
  signs in to `gh` on this machine as above.

The environment `production` must exist, with required reviewers and deployment restricted to
`main`, before the secrets are set on it. `gh secret list --env production` and
`gh variable list --env production` then show the four names, never values.

**8. Delete the local copies:**

```sh
rm -rf "$D"; unset D
```

The private key and the token now exist only as GitHub secrets (and the token in the cluster).

**9. First manual run.** Redeploy the commit that is already in prod, so the first run changes
nothing but proves the path:

```sh
devops-kubectl -n schedular get deployment backend -o jsonpath='{.spec.template.spec.containers[0].image}{"\n"}'
```

Then Actions, `deploy-prod`, "Run workflow" on `main`, with that SHA (without `main-`), and approve
the run as the `production` reviewer. Read the job summary and
`devops-kubectl -n schedular get pods`.

### Making it automatic later

Only after several clean manual runs, and as a reviewed change of its own. Add a second trigger
next to `workflow_dispatch`:

```yaml
on:
  workflow_dispatch:
    # ... unchanged ...
  workflow_run:
    workflows: [build-images-prod]
    types: [completed]
    branches: [main]
```

give the job a condition:

```yaml
    if: >-
      github.event_name == 'workflow_dispatch' ||
      (github.event.workflow_run.conclusion == 'success' &&
       github.event.workflow_run.head_branch == 'main' &&
       (github.event.workflow_run.event == 'push' ||
        github.event.workflow_run.event == 'workflow_dispatch'))
```

and take the commit from the build run when there is no input, in the job's `env`:

```yaml
      DEPLOY_SHA: ${{ inputs.sha || github.event.workflow_run.head_sha }}
```

Why each condition:

- `conclusion == 'success'`: `completed` also fires for failed and cancelled builds, whose images
  were never pushed, or were pushed by a run whose scan gate then failed.
- `head_branch == 'main'`: `build-images-prod` can be dispatched from any branch (its job is then
  skipped), and `branches: [main]` is a trigger filter only. The condition makes sure a run for
  another branch never deploys, whatever conclusion GitHub gives it.
- `event` is `push` or `workflow_dispatch`: these are the only events `build-images-prod` is meant
  to run for. `head_branch` is just a branch name, so a pull request from a fork whose branch is
  called `main` would otherwise match too, if a `pull_request` trigger were ever added there.

The ancestor-of-main check, the environment's reviewers and branch restriction stay in force; with
required reviewers kept, "automatic" still waits for an approval. Every push to `main` would then
deploy, so the VM must be running whenever `main` moves, or the run fails at the tunnel.

### Redeploying or rolling back by hand

Either run the workflow with an earlier `main` SHA, or check that commit out cleanly and run
`infra/k8s/deploy-prod.sh release main-<SHA>` as in "Routine release". Both deploy that commit's
manifests with that commit's images, and both refuse a SHA that is not on `main` (the workflow) or
not the checked-out HEAD (the script).

What that does not roll back: the database (migrations only move forward, and an image older than
the database's revision fails its migrate Job, stopping the release before the application), the
Secrets, `prod-data`, Traefik, cert-manager and the issuers, and objects a later release added
(`apply` never prunes). See "What rollback does and does not do".

### Rotating the CI credentials

- **CI key**: steps 1 to 3 with a new key, then the admin sets `PROD_SSH_PRIVATE_KEY` again
  (step 7), then remove the old line from `~/.ssh/authorized_keys` on the VM. Then step 8.
- **`PROD_KUBECONFIG`**: delete the Secret, which revokes the old token at once, re-apply and
  regenerate:

  ```sh
  devops-kubectl -n schedular delete secret github-deployer-token
  devops-kubectl apply -k infra/k8s/ci
  infra/k8s/ci/make-ci-kubeconfig.sh "$D/kubeconfig"
  ```

  then step 7 for that secret only, then step 8.
- **After a VM rebuild**, all three change: the CI key is not part of the Bicep and must be
  installed again (steps 2 and 3), the host key is new (step 4), and the new cluster has a new CA
  and no `github-deployer` (steps 5 and 6).
- **If a credential may have leaked**: remove the `authorized_keys` line and delete
  `github-deployer-token` first, then rotate.

## Reading logs

```sh
devops-kubectl -n schedular get pods
devops-kubectl -n schedular logs deployment/backend --tail=200
devops-kubectl -n schedular logs deployment/backend --previous      # the instance before a restart
devops-kubectl -n schedular logs job/migrate
devops-kubectl -n schedular get events --sort-by=.lastTimestamp
devops-kubectl -n traefik logs deployment/traefik
devops-kubectl -n cert-manager logs deployment/cert-manager
```

The worker writes no logs yet (no logging and no `PYTHONUNBUFFERED` in the image); its state is in
the job table. More inspection commands are under "Inspecting the cluster" in the k8s README;
substitute `devops-kubectl -n schedular` for `kubectl -n schedular-local`.

## Opening Mailpit

```sh
devops-kubectl -n schedular port-forward service/mailpit 8025:8025
```

Then open <http://127.0.0.1:8025>. Every mail prod sends is there, magic links included; nothing
reaches a real inbox. The NetworkPolicy blocks 8025 for every pod, but not a port-forward, which
is the intended way in. Stop it with Ctrl-C.

## Likely failures

### Certificate stuck pending

```sh
devops-kubectl -n schedular describe challenges
```

The challenge's `Reason` says what Let's Encrypt or cert-manager's self-check saw. Usual causes:
port 80 not reaching Traefik (NSG, or the Traefik Service has no external IP), the DNS name not
resolving to the VM, or the IngressClass not being `traefik`. The HTTP-to-HTTPS redirect is not a
cause on its own: Let's Encrypt follows it to port 443.

### Migrate Job failed

```sh
devops-kubectl -n schedular logs -l batch.kubernetes.io/job-name=migrate --all-containers --prefix --tail=-1
```

`deploy-prod.sh` prints the same. A connection error points at Postgres or `DATABASE_URL`;
`CreateContainerConfigError` in `describe job migrate` at a missing Secret key; "Can't locate
revision" at an image older than the database.

### ImagePullBackOff or exec format error

```sh
devops-kubectl -n schedular get events --sort-by=.lastTimestamp | tail -20
```

`ImagePullBackOff`: the tag does not exist or the package is not public; check with
`DOCKER_CONFIG=$(mktemp -d) docker manifest inspect <image>`. `exec format error` in the logs: the
image is not amd64, for example one from the develop pipeline (arm64) or built on a Mac. Only
`main-` tags from `build-images-prod.yml` are amd64.

### Worker restarting on its probe

```sh
devops-kubectl -n schedular describe pod -l app.kubernetes.io/component=worker
```

Read the probe failures under Events. `No module named app.worker.health`: the image predates the
heartbeat; release a newer one. `worker heartbeat is stale`: the loop stopped iterating for over
two minutes, usually because the database is unreachable and the worker crashed, or a job is
hanging.

### Readiness failing because the breaker is open

```sh
devops-kubectl -n schedular describe pod -l app.kubernetes.io/component=backend
```

`Readiness probe failed: HTTP probe failed with statuscode: 503` with `/healthz` still passing
means the circuit breaker is open: the pod is alive but out of rotation, and the API answers
`503 db_circuit_open`. Look at the database next
(`devops-kubectl -n schedular get pods -l app.kubernetes.io/component=postgres`). The breaker
closes on its own about 30 s after Postgres answers again; do not restart the backend.
