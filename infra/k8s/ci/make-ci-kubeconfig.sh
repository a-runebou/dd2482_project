#!/usr/bin/env bash
# Write a kubeconfig for the ServiceAccount github-deployer, the content of the GitHub secret
# PROD_KUBECONFIG. Step 6 of the activation checklist in docs/deployment/runbook.md.
#
#   make-ci-kubeconfig.sh <output file>
#
# Reads the token and the cluster CA from the Secret github-deployer-token through devops-kubectl
# (so infra/k8s/ci must have been applied). The server is https://127.0.0.1:16443, the local end
# of the tunnel the workflow opens, and the namespace is schedular. The file is written with mode
# 600 and the token is never printed, passed as an argument or written anywhere else.
set -euo pipefail

NAMESPACE=schedular
SECRET=github-deployer-token
SERVER=https://127.0.0.1:16443

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HERE/../../.." && pwd)"

die() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

[[ $# -eq 1 && -n "$1" ]] || { echo "usage: ${0##*/} <output file>" >&2; exit 2; }
out="$1"
out_dir="$(cd "$(dirname "$out")" 2>/dev/null && pwd)" || die "the directory of $out does not exist."
out="$out_dir/$(basename "$out")"

# A credential inside the working tree is one `git add .` away from being committed.
case "$out_dir/" in
  "$REPO_ROOT"/*) die "refusing to write a credential inside the repository ($REPO_ROOT)." ;;
esac
[[ ! -e "$out" ]] || die "$out already exists; delete it first if you mean to replace it."

command -v devops-kubectl >/dev/null 2>&1 \
  || die "devops-kubectl is not on PATH (infra/azure/README.md, \"Operating the prod cluster\")."
command -v kubectl >/dev/null 2>&1 || die "kubectl is not installed or not on PATH."

umask 077
tmp="$(mktemp "$out_dir/.ci-kubeconfig.XXXXXX")"
trap 'rm -f "$tmp"' EXIT

# Both stay base64 as stored: certificate-authority-data takes base64, and the token is decoded
# only into a variable.
ca_b64="$(devops-kubectl -n "$NAMESPACE" get secret "$SECRET" -o jsonpath='{.data.ca\.crt}')"
token_b64="$(devops-kubectl -n "$NAMESPACE" get secret "$SECRET" -o jsonpath='{.data.token}')"
[[ -n "$ca_b64" && -n "$token_b64" ]] \
  || die "Secret $SECRET has no token or CA yet; is infra/k8s/ci applied, and has the token controller filled it?"
token="$(printf '%s' "$token_b64" | base64 -d)"
unset token_b64

# A heredoc rather than `kubectl config set-credentials --token=...`, which would put the token on
# a command line where ps can see it.
cat >"$tmp" <<EOF
apiVersion: v1
kind: Config
clusters:
  - name: schedular-prod
    cluster:
      server: ${SERVER}
      certificate-authority-data: ${ca_b64}
users:
  - name: github-deployer
    user:
      token: ${token}
contexts:
  - name: github-deployer@schedular-prod
    context:
      cluster: schedular-prod
      user: github-deployer
      namespace: ${NAMESPACE}
current-context: github-deployer@schedular-prod
EOF
unset token
chmod 600 "$tmp"

# devops-kubectl has just opened the tunnel on 16443, so the new file can be tried for real: the
# CA must verify the API server and the token must carry the Role, and nothing more.
[[ "$(kubectl --kubeconfig "$tmp" auth can-i patch deployments -n "$NAMESPACE" 2>/dev/null || true)" == yes ]] \
  || die "the new kubeconfig cannot patch deployments in $NAMESPACE; is the tunnel up on 16443 and the Role bound?"
[[ "$(kubectl --kubeconfig "$tmp" auth can-i get secrets -n "$NAMESPACE" 2>/dev/null || true)" == no ]] \
  || die "the new kubeconfig can read Secrets; the Role is wrong. Nothing was written."

mv "$tmp" "$out"
trap - EXIT
printf 'wrote %s (mode %s); it holds a token: do not print it, commit it or keep it longer than needed.\n' \
  "$out" "$(stat -c '%a' "$out" 2>/dev/null || stat -f '%Lp' "$out")" >&2
