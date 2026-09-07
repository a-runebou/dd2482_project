#!/usr/bin/env bash
# Render or release Schedular to the prod k3s cluster, namespace schedular.
#
#   deploy-prod.sh render  <tag>   print the prod-migrate and prod manifests for <tag>; contacts nothing
#   deploy-prod.sh release [--allow-commit-mismatch] <tag>
#                                  preflight, migrate, apply, gate on rollout, roll back on failure
#
# release reads the manifests from the working tree but takes the images from <tag>, so it
# refuses a dirty tree (no override) and a HEAD that is not the tag's commit (unless
# --allow-commit-mismatch). render is subject to neither.
#
# <tag> is main-<40 lowercase hex>, as published by .github/workflows/build-images-prod.yml.
# prod-data is never applied here; it is a separate, manual step (docs/deployment/runbook.md).
#
# Every call that reaches the cluster goes through $KUBECTL (default devops-kubectl, which opens
# the SSH tunnel), so a workflow can substitute its own kubectl. KUBECTL may carry arguments, such
# as `kubectl --kubeconfig /path/file`; it is split on whitespace, so no word in it may contain a
# space. Rendering uses $RENDER_KUBECTL
# instead, because `kubectl kustomize` is purely local and routing it through devops-kubectl
# would open a tunnel just to render.
set -euo pipefail

# An array, so that a KUBECTL with arguments is run as a command plus arguments rather than as one
# file name containing spaces. read -a does not glob, unlike an unquoted expansion.
read -r -a KUBECTL_CMD <<<"${KUBECTL:-devops-kubectl}"
RENDER_KUBECTL="${RENDER_KUBECTL:-kubectl}"
ROLLOUT_TIMEOUT="${ROLLOUT_TIMEOUT:-300s}"

NAMESPACE=schedular
BACKEND_IMAGE=ghcr.io/a-runebou/dd2482_project-backend
FRONTEND_IMAGE=ghcr.io/a-runebou/dd2482_project-frontend

# The Job's own activeDeadlineSeconds is 300 (migrate/job.yaml); the margin lets the controller
# mark it Failed with DeadlineExceeded before this script gives up on its own.
MIGRATE_WAIT_SECONDS=360

# Gated on in this order. mailpit is applied with them and rolled back with them, but not gated:
# a broken mail sink must not hold back the application.
GATED_DEPLOYMENTS=(backend worker frontend)
ALL_DEPLOYMENTS=(backend worker frontend mailpit)

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Revisions of ALL_DEPLOYMENTS before the apply, index for index. A plain array rather than an
# associative one, because macOS ships bash 3.2.
BEFORE_REVISIONS=()

WORKDIR=""
cleanup() {
  if [[ -n "$WORKDIR" ]]; then
    rm -rf "$WORKDIR"
  fi
}
trap cleanup EXIT

usage() {
  echo "usage: ${0##*/} render <tag> | release [--allow-commit-mismatch] <tag>" >&2
  echo "  <tag> is main- followed by 40 lowercase hex characters" >&2
  exit 2
}

log() {
  printf '==> %s\n' "$*" >&2
}

die() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

kube() {
  "${KUBECTL_CMD[@]}" "$@"
}

require() {
  command -v "$1" >/dev/null 2>&1 || die "$1 is not installed or not on PATH${2:+ ($2)}."
}

validate_tag() {
  [[ "$1" =~ ^main-[0-9a-f]{40}$ ]] || die "'$1' is not a prod tag (main-<40 lowercase hex>)."
}

# Rendering must not write into the repository, so the manifests are copied into a temporary
# directory outside it and the per-release kustomizations are written next to the copy. A copy
# rather than a path back into the repository, because kustomize refuses absolute resource paths.
prepare_workdir() {
  WORKDIR="$(mktemp -d "${TMPDIR:-/tmp}/deploy-prod.XXXXXX")"
  cp -R "$HERE" "$WORKDIR/k8s"
}

render_migrate() {
  local tag="$1"
  mkdir -p "$WORKDIR/release-migrate"
  cat >"$WORKDIR/release-migrate/kustomization.yaml" <<EOF
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - ../k8s/overlays/prod-migrate
images:
  - name: ${BACKEND_IMAGE}
    newTag: ${tag}
EOF
  "$RENDER_KUBECTL" kustomize "$WORKDIR/release-migrate"
}

# BUILD_SHA is merged into the generated ConfigMap here, so its content hash, and with it the
# name every Deployment references, changes with each release.
render_app() {
  local tag="$1"
  mkdir -p "$WORKDIR/release-app"
  cat >"$WORKDIR/release-app/kustomization.yaml" <<EOF
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - ../k8s/overlays/prod
images:
  - name: ${BACKEND_IMAGE}
    newTag: ${tag}
  - name: ${FRONTEND_IMAGE}
    newTag: ${tag}
configMapGenerator:
  - name: schedular-config
    namespace: ${NAMESPACE}
    behavior: merge
    literals:
      - BUILD_SHA=${tag}
EOF
  "$RENDER_KUBECTL" kustomize "$WORKDIR/release-app"
}

cmd_render() {
  local tag="$1"
  validate_tag "$tag"
  require "$RENDER_KUBECTL"
  prepare_workdir
  render_migrate "$tag"
  echo "---"
  render_app "$tag"
}

# --- release steps ---------------------------------------------------------------------------

# An empty DOCKER_CONFIG means no stored credential is offered, so this proves the cluster, which
# has no pull secret, can pull the same references.
check_images_exist() {
  local tag="$1" image
  mkdir -p "$WORKDIR/docker-config"
  for image in "$BACKEND_IMAGE:$tag" "$FRONTEND_IMAGE:$tag"; do
    if ! DOCKER_CONFIG="$WORKDIR/docker-config" docker manifest inspect "$image" >/dev/null 2>&1; then
      die "$image cannot be read anonymously. Has build-images-prod.yml finished for this commit?"
    fi
    log "found $image"
  done
}

# `alembic history` reads only the revision files, never env.py, so it needs no database and no
# settings. The image is amd64; on Apple silicon Docker runs it under emulation. No network: the
# command has no reason to reach anything.
check_migrations() {
  local tag="$1" history
  if ! history="$(DOCKER_CONFIG="$WORKDIR/docker-config" docker run --rm --network none \
    --platform linux/amd64 --entrypoint alembic "$BACKEND_IMAGE:$tag" history)"; then
    die "could not list the Alembic revisions in $BACKEND_IMAGE:$tag."
  fi
  [[ -n "$history" ]] || die "the image lists no Alembic revisions at all."
  printf '%s\n' "$history" >&2
  # Revisions named "temporary" are test scaffolding from the dev deployment. Once a database is
  # stamped with one, any later image that lacks the file fails `alembic upgrade head`.
  if grep -qi 'temporary' <<<"$history"; then
    die "a revision message contains \"temporary\"; refusing to migrate prod with it."
  fi
}

# There is deliberately no check here that the Secret schedular-secrets exists: the CI credential
# (infra/k8s/ci) may not read Secrets at all, and a missing one is caught anyway, by the migrate
# Job and then the rollout gate, as CreateContainerConfigError.
check_database_ready() {
  kube -n "$NAMESPACE" rollout status statefulset/postgres --timeout=120s \
    || die "Postgres in $NAMESPACE is not ready; nothing was changed."
}

print_migrate_diagnostics() {
  kube -n "$NAMESPACE" describe job migrate >&2 || true
  kube -n "$NAMESPACE" logs -l batch.kubernetes.io/job-name=migrate \
    --all-containers --prefix --tail=-1 --max-log-requests=5 >&2 || true
}

run_migration() {
  local conditions deadline
  # The pod template of a Job is immutable, so the previous one goes first. Foreground deletion
  # waits for its pods too, so their logs cannot be mistaken for the new run's.
  kube -n "$NAMESPACE" delete job migrate --ignore-not-found --cascade=foreground \
    --wait=true --timeout=120s
  kube apply -f "$WORKDIR/migrate.yaml"

  deadline=$((SECONDS + MIGRATE_WAIT_SECONDS))
  while :; do
    conditions="$(kube -n "$NAMESPACE" get job migrate \
      -o jsonpath='{range .status.conditions[?(@.status=="True")]}{.type}{" "}{end}')"
    case " $conditions " in
      *" Complete "*)
        log "migration complete"
        kube -n "$NAMESPACE" logs job/migrate --all-containers >&2 || true
        return 0
        ;;
      *" Failed "*)
        print_migrate_diagnostics
        die "the migrate Job failed; the application was not touched."
        ;;
    esac
    if ((SECONDS >= deadline)); then
      print_migrate_diagnostics
      die "the migrate Job did not finish within ${MIGRATE_WAIT_SECONDS}s; the application was not touched."
    fi
    sleep 5
  done
}

revision_of() {
  kube -n "$NAMESPACE" get deployment "$1" --ignore-not-found \
    -o jsonpath='{.metadata.annotations.deployment\.kubernetes\.io/revision}'
}

print_failing_pods() {
  local deployment pod ready
  for deployment in "${ALL_DEPLOYMENTS[@]}"; do
    while IFS=$'\t' read -r pod ready; do
      [[ -n "$pod" && "$ready" != "True" ]] || continue
      log "pod $pod is not ready: events"
      kube -n "$NAMESPACE" get events --sort-by=.lastTimestamp \
        --field-selector "involvedObject.kind=Pod,involvedObject.name=$pod" >&2 || true
      log "pod $pod: logs"
      kube -n "$NAMESPACE" logs "$pod" --all-containers --tail=100 >&2 || true
      log "pod $pod: logs of the previous container, if it restarted"
      kube -n "$NAMESPACE" logs "$pod" --all-containers --previous --tail=100 >&2 || true
    done < <(kube -n "$NAMESPACE" get pods \
      -l "app.kubernetes.io/name=schedular,app.kubernetes.io/component=$deployment" \
      -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.status.conditions[?(@.type=="Ready")].status}{"\n"}{end}' \
      || true)
  done
}

# Rolls back only the application. The database stays at the revision the migrate Job reached:
# migrations are expand-only and backwards compatible with the previous release, and no
# downgrade is ever run here. A Deployment is undone only if it existed before this release and
# this release gave it a new revision; undoing one the release did not change would take it back
# past the release, to whatever ran before that.
roll_back() {
  local i deployment before after undone=()
  print_failing_pods
  for i in "${!ALL_DEPLOYMENTS[@]}"; do
    deployment="${ALL_DEPLOYMENTS[$i]}"
    before="${BEFORE_REVISIONS[$i]}"
    after="$(revision_of "$deployment" || true)"
    if [[ -z "$before" ]]; then
      log "$deployment: no previous revision; left as it is"
    elif [[ "$after" == "$before" ]]; then
      log "$deployment: unchanged by this release; left at revision $before"
    else
      log "$deployment: undoing revision $after back to $before"
      if kube -n "$NAMESPACE" rollout undo "deployment/$deployment" --to-revision="$before"; then
        undone+=("$deployment")
      else
        log "$deployment: undo FAILED; intervene by hand"
      fi
    fi
  done
  # The guard keeps bash 3.2 with set -u from rejecting an empty array.
  for deployment in ${undone[@]+"${undone[@]}"}; do
    kube -n "$NAMESPACE" rollout status "deployment/$deployment" --timeout="$ROLLOUT_TIMEOUT" \
      || log "$deployment: the undo did not complete within $ROLLOUT_TIMEOUT; intervene by hand"
  done
  die "the release failed and was rolled back as far as shown above; the database was not touched."
}

# Both checks run before anything touches the cluster, because the manifests come from the working
# tree while the images come from the tag; if the two disagree the release is not what was reviewed.
check_tree_matches_tag() {
  local tag="$1" allow_mismatch="$2" status head tag_sha
  status="$(git -C "$HERE" status --porcelain)" || die "git status failed; is $HERE inside a git checkout?"
  if [[ -n "$status" ]]; then
    printf '%s\n' "$status" >&2
    die "the working tree is not clean; release deploys manifests from it. Commit or discard the changes. There is no override."
  fi

  head="$(git -C "$HERE" rev-parse HEAD)" || die "git rev-parse HEAD failed."
  tag_sha="${tag#main-}"
  if [[ "$head" != "$tag_sha" ]]; then
    if [[ "$allow_mismatch" != "true" ]]; then
      die "HEAD is $head but the images are built from $tag_sha; the manifests would not belong to them. Check out $tag_sha, or pass --allow-commit-mismatch if you mean it."
    fi
    {
      printf '\n!!! WARNING: --allow-commit-mismatch !!!\n'
      printf '!!! manifests come from HEAD   %s\n' "$head"
      printf '!!! images come from the tag   %s\n' "$tag_sha"
      printf '!!! these are different commits; continuing anyway.\n\n'
    } >&2
  fi
}

cmd_release() {
  local tag="$1" allow_mismatch="$2" deployment revision
  validate_tag "$tag"
  require git
  check_tree_matches_tag "$tag" "$allow_mismatch"
  require docker
  require "$RENDER_KUBECTL"
  [[ ${#KUBECTL_CMD[@]} -gt 0 ]] || die "KUBECTL is set but empty."
  require "${KUBECTL_CMD[0]}" "put infra/azure/bin on PATH or set KUBECTL to its full path; aliases do not reach scripts"
  prepare_workdir

  # Everything that can fail without the cluster is done first, so a bad tag or a bad overlay
  # stops the release before anything in prod changes.
  log "rendering manifests for $tag"
  render_migrate "$tag" >"$WORKDIR/migrate.yaml"
  render_app "$tag" >"$WORKDIR/app.yaml"

  log "checking that both images exist anonymously"
  check_images_exist "$tag"

  log "listing Alembic revisions in the backend image"
  check_migrations "$tag"

  log "checking Postgres in namespace $NAMESPACE"
  check_database_ready

  log "running the migration"
  run_migration

  for deployment in "${ALL_DEPLOYMENTS[@]}"; do
    # A separate assignment, so that a failed read stops the release under set -e before the apply.
    revision="$(revision_of "$deployment")"
    BEFORE_REVISIONS+=("$revision")
  done

  log "applying the application"
  if ! kube apply -f "$WORKDIR/app.yaml"; then
    log "apply failed part-way"
    roll_back
  fi

  for deployment in "${GATED_DEPLOYMENTS[@]}"; do
    log "waiting for deployment/$deployment"
    if ! kube -n "$NAMESPACE" rollout status "deployment/$deployment" --timeout="$ROLLOUT_TIMEOUT"; then
      log "deployment/$deployment did not become ready"
      roll_back
    fi
  done

  log "released $tag"
}

[[ $# -ge 2 ]] || usage
command_name="$1"
shift
allow_commit_mismatch=false
positional=()
for arg in "$@"; do
  case "$arg" in
    --allow-commit-mismatch) allow_commit_mismatch=true ;;
    -*) usage ;;
    *) positional+=("$arg") ;;
  esac
done
[[ ${#positional[@]} -eq 1 ]] || usage
case "$command_name" in
  render)
    [[ "$allow_commit_mismatch" == "false" ]] || usage
    cmd_render "${positional[0]}"
    ;;
  release) cmd_release "${positional[0]}" "$allow_commit_mismatch" ;;
  *) usage ;;
esac
