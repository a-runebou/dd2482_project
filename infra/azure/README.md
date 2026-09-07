# infra/azure

The production host for Schedular: a single Ubuntu VM in Azure that installs k3s on first boot.
`docs/ARCHITECTURE.md` section 10 describes it as the prod environment and explains the choice;
risk R2 is resolved by it. The application manifests, the prod overlay and the Traefik prod values
are not part of this directory; they are under `infra/k8s/`.

Everything is in Bicep. `main.bicep` runs at subscription scope, creates the resource group and
deploys `vm.bicep` into it. `cloud-init.yaml` is the VM's first-boot script.

## What it creates

All in the resource group `schedular-prod`, each resource tagged `project=schedular`:

| Resource | Name | Notes |
|---|---|---|
| Virtual machine | `schedular-prod` | `Standard_B2als_v2` (2 vCPU, amd64), Ubuntu 24.04 LTS server, user `azureuser`, SSH key only, password login disabled, boot diagnostics in Azure-managed storage |
| OS disk | `schedular-prod-osdisk` | 32 GB Standard SSD (`StandardSSD_LRS`), deleted with the VM |
| Public IP | `schedular-prod-ip` | Standard, static IPv4, DNS label from the `dnsLabel` parameter |
| Network security group | `schedular-prod-nsg` | On the NIC; see "Network access" |
| Virtual network | `schedular-prod-vnet` | `10.0.0.0/16`, one subnet `schedular-prod-subnet`, `10.0.0.0/24` |
| Network interface | `schedular-prod-nic` | |

The VNet range avoids k3s's own pod (`10.42.0.0/16`) and service (`10.43.0.0/16`) ranges.

### First boot

cloud-init patches the OS, hardens sshd and installs k3s. In order:

- `package_update` and `package_upgrade` are both `true`, so the VM is fully patched at first
  boot. After that Ubuntu's default `unattended-upgrades` applies security updates; nothing
  beyond the image default is installed or configured. Check that it is active with
  `apt-config dump APT::Periodic::Unattended-Upgrade` over SSH (expected `"1"`).
- It writes `/etc/ssh/sshd_config.d/00-schedular-hardening.conf` (see "SSH hardening" below) and
  restarts `ssh.service`.
- It writes `/etc/rancher/k3s/config.yaml` and installs k3s `v1.37.1+k3s1` with the official
install script. It is pinned to v1.37.1+k3s1 rather than the k3s stable channel's 1.36.5 for
parity with the local kind cluster, which runs Kubernetes 1.37, so production runs the same minor
version the manifests are rehearsed against. The k3s config:

- disables the bundled Traefik, because Traefik is installed separately with Helm, as on the
  local rehearsal cluster;
- adds the VM's FQDN as a TLS SAN on the API server certificate, so a kubeconfig that points at
  the FQDN verifies;
- enables secrets encryption at rest.

ServiceLB and the local-path storage provisioner stay enabled. Nothing else is installed. The
script runs once, at creation. Editing `cloud-init.yaml` afterwards has no effect on the existing
VM, and redeploying with a changed file fails, because Azure does not allow a VM's custom data
to change. To apply a changed file, tear down and create the VM again.

### Network access

The NSG has exactly three inbound allow rules, all from the internet:

| Port | Purpose |
|---|---|
| TCP 22 | SSH, key only |
| TCP 80 | HTTP |
| TCP 443 | HTTPS |

Nothing else is open. In particular the Kubernetes API (6443), the kubelet (10250) and NodePorts
(30000-32767, for example 30080) are not reachable from outside. The API is reached through an SSH
tunnel (see "API tunnel and kubeconfig"). Azure's built-in default rules still sit underneath.
They allow traffic from inside the VNet and Azure's load balancer probes, and deny everything
else.

SSH is open to the whole internet because the admin moves between home, KTH and elsewhere, so an
address allowlist would only lock Adrian out. What protects it is that sshd accepts nothing but a
public key, and that the key is passphrase-protected. See "Accepted risks".

### SSH hardening

cloud-init writes `/etc/ssh/sshd_config.d/00-schedular-hardening.conf`:

```
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
AuthenticationMethods publickey
AllowUsers azureuser
AllowAgentForwarding no
X11Forwarding no
```

The file name sorts first because sshd uses the first value it reads for a keyword, and Ubuntu's
`sshd_config` includes `sshd_config.d/*.conf` in lexical order before its own settings. A
`50-cloud-init.conf` or an agent-written file therefore cannot override it. TCP forwarding stays
on, because the API tunnel needs it. Ubuntu 24.04 socket-activates ssh, and a running sshd reads
its configuration only when it starts, so the first `runcmd` creates `/run/sshd`, validates with
`sshd -t` and restarts `ssh.service`. "Post-deploy security checks" proves the result.

### Why no availability zone

No resource sets an availability zone: not the VM, not the OS disk, not the public IP.
`Standard_B2als_v2` is restricted per zone for this subscription in the permitted regions, so a
template that names a zone can name one where the size is not offered, and the deployment fails.
A zonal disk or public IP would also force the VM into that same zone. With no zone anywhere,
Azure places the VM wherever the size is available in the region.

## Costs

Measured monthly figures in USD at 730 hours:

| Item | Running | Deallocated |
|---|---|---|
| VM `Standard_B2als_v2` | 31.54 | 0 |
| Standard static public IP | 3.65 | 3.65 |
| Standard SSD E4 OS disk (32 GB) | 2.40 | 2.40 |
| **Total** | **37.59** | **6.05** |

A deallocated VM bills only its disk and IP. A VM that is merely stopped still bills compute (see
"Daily routine"). The VNet, NSG and NIC are free. Outbound data
transfer and the small amount of managed storage used by boot diagnostics are not included in
these figures. The subscription is Azure for Students with the
spending limit on: when the credit runs out, Azure disables the subscription instead of billing.

## SSH access

### Generate a dedicated key

Use a key that is used for nothing else, with a passphrase, and keep the passphrase in the macOS
keychain so that it is typed once:

```sh
ssh-keygen -t ed25519 -f ~/.ssh/schedular-prod -C schedular-prod   # choose a passphrase
ssh-add --apple-use-keychain ~/.ssh/schedular-prod
```

Add a host entry to `~/.ssh/config`, using the FQDN from the deployment outputs:

```
Host schedular.polandcentral.cloudapp.azure.com
    User azureuser
    IdentityFile ~/.ssh/schedular-prod
    IdentitiesOnly yes
    AddKeysToAgent yes
    UseKeychain yes
    ForwardAgent no
```

The private key never leaves the laptop. Only `~/.ssh/schedular-prod.pub` is passed to Azure.

### Pass the public key at deploy time

`sshPublicKey` is a deployment parameter: `SSH_PUB=~/.ssh/schedular-prod.pub` in "Commands". It is
a public key and could be committed, but it is supplied on the command line like everything else.
Azure refuses most changes to an existing VM's OS profile, including its SSH keys, so a redeploy
with a different key fails. To rotate a key on a running VM, edit `~/.ssh/authorized_keys` on the
VM, or use `az vm run-command invoke`.

### Verify the host key

cloud-init prints the VM's host key fingerprints to the console, and Azure keeps that output in
the boot log. They appear near the end of first boot, after the k3s install, between
`BEGIN SSH HOST KEY FINGERPRINTS` and `END SSH HOST KEY FINGERPRINTS`:

```sh
az vm boot-diagnostics get-boot-log --resource-group schedular-prod --name schedular-prod \
  | grep -A6 'BEGIN SSH HOST KEY FINGERPRINTS'
```

On the first connection, ssh shows `ED25519 key fingerprint is SHA256:...`. Compare it with the
`ED25519` line character by character. Answer `yes` only if they are identical. cloud-init prints
the fingerprints once, at first boot, and the log starts at the most recent boot. If they are no
longer in it, read them through Azure's own channel instead:

```sh
az vm run-command invoke --resource-group schedular-prod --name schedular-prod \
  --command-id RunShellScript --scripts 'ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub' \
  --query 'value[0].message' -o tsv
```

When a VM has been rebuilt, its host key changes and ssh stops with `REMOTE HOST IDENTIFICATION
HAS CHANGED`. Do not delete the `known_hosts` entry to make the message go away. Get the new
VM's fingerprint from the boot log or run-command, and compare it with the fingerprint in the
warning ("The fingerprint for the ED25519 key sent by the remote host is ..."). If they match,
remove the old entry with `ssh-keygen -R <fqdn>` and verify the new key as for a first
connection. If they do not match, stop: something other than the rebuilt VM is answering.

### API tunnel and kubeconfig

The Kubernetes API is not exposed. Open a tunnel, in a terminal of its own, and leave it running:

```sh
ssh -N -L 16443:127.0.0.1:6443 azureuser@"$FQDN"
```

k3s's own API certificate covers `127.0.0.1`, so a kubeconfig pointing at the local end of the
tunnel verifies. The kubeconfig lives in its own file under `~/.kube`, never in
`~/.kube/config`, so a stray command against the local kind cluster cannot reach production:

```sh
mkdir -p ~/.kube
(umask 077; ssh azureuser@"$FQDN" sudo cat /etc/rancher/k3s/k3s.yaml > ~/.kube/schedular-prod.yaml)
chmod 600 ~/.kube/schedular-prod.yaml
kubectl --kubeconfig ~/.kube/schedular-prod.yaml config set-cluster default --server https://127.0.0.1:16443
kubectl --kubeconfig ~/.kube/schedular-prod.yaml config rename-context default schedular-prod
chmod 600 ~/.kube/schedular-prod.yaml
stat -f '%Lp' ~/.kube/schedular-prod.yaml    # 600
kubectl --kubeconfig ~/.kube/schedular-prod.yaml get nodes    # with the tunnel running
```

The two `config` commands only edit the local file. From here on, reach the cluster through
`devops-kubectl` and `devops-helm` (see "Operating the prod cluster"), which pass this file with
`--kubeconfig`; the context is `schedular-prod`. Without the tunnel,
`kubectl` fails with a connection refused on `127.0.0.1:16443`, which is the intended behaviour.

**This file is a cluster-admin credential.** Anyone who holds it controls the whole cluster and
every Secret in it. It never enters the repository, a chat, a ticket or a CI log. If it leaks, the
cluster's certificates have to be rotated, or the VM recreated. Fetch it again after recreating
the VM, because the new cluster has a new CA.

### The Azure account is part of the perimeter

`az vm run-command` and the portal's serial console give root on the VM to anyone whose Azure
role allows them, with no SSH key and no open port. Whoever controls the Azure account controls
the VM, whatever sshd says. **MFA on the Azure account is mandatory.** Treat its credentials with
the same care as the SSH key.

## Commands

Run everything from the repository root, signed in with `az login` to the Azure for Students
subscription. Set these first. The public key is supplied here and never written into a
committed file:

```sh
LOCATION=polandcentral
DNS_LABEL=schedular               # becomes <dns-label>.polandcentral.cloudapp.azure.com
SSH_PUB=~/.ssh/schedular-prod.pub   # see "SSH access"
```

The deployment name is the default, `main`, taken from the template's file name.

### 1. Preview

```sh
az deployment sub what-if \
  --location "$LOCATION" \
  --template-file infra/azure/main.bicep \
  --parameters location="$LOCATION" dnsLabel="$DNS_LABEL" \
    sshPublicKey="$(cat "$SSH_PUB")"
```

On an empty subscription this should list the resource group and the six resources above as
`Create`, and nothing else. Nothing is billed until the next step.

### 2. Deploy

```sh
az deployment sub create \
  --location "$LOCATION" \
  --template-file infra/azure/main.bicep \
  --parameters location="$LOCATION" dnsLabel="$DNS_LABEL" \
    sshPublicKey="$(cat "$SSH_PUB")"
```

`az bicep build` writes `main.json` next to `main.bicep`. That file is a build product. Delete it
rather than committing it.

### 3. Read the outputs

```sh
az deployment sub show --name main --query properties.outputs -o json
FQDN="$(az deployment sub show --name main --query properties.outputs.fqdn.value -o tsv)"
```

The outputs are `fqdn` and `publicIpAddress`. Both stay the same across deallocation.

### 4. Wait for k3s

First-boot patching and the k3s install take a few minutes. Verify the host key as described in
"Verify the host key" before the first connection, then:

```sh
ssh azureuser@"$FQDN" cloud-init status --wait
ssh azureuser@"$FQDN" sudo k3s kubectl get nodes
```

Then run "Post-deploy security checks".

### 5. Fetch the kubeconfig

Follow "API tunnel and kubeconfig".

### 6. Daily routine

`infra/azure/vm.sh` wraps the three commands. It takes the resource group and VM name from
`RESOURCE_GROUP` and `VM_NAME` (both default to `schedular-prod`). There is no auto-shutdown
schedule: deallocating is a manual step.

```sh
infra/azure/vm.sh start        # morning: starts the VM and prints its FQDN
infra/azure/vm.sh deallocate   # when done: deallocates and prints the power state
infra/azure/vm.sh status       # check at any time
```

After `deallocate`, `status` must read `VM deallocated`. Any other value, in particular
`VM stopped`, means compute is still billed.

- Never use `az vm stop`. It powers the guest off but keeps the hardware reserved, so compute
  keeps billing. `vm.sh` deliberately has no `stop` subcommand.
- The portal's Stop button does deallocate, so it is safe to use.
- A forgotten night costs about 0.60 USD: 31.54 USD a month for compute over 730 hours is about
  0.043 USD an hour, times roughly 14 hours.
- k3s and its workloads come back on their own after `start`, and the FQDN, IP, host key and
  kubeconfig stay valid.

### 7. Tear down

```sh
az group delete --name schedular-prod
rm ~/.kube/schedular-prod.yaml
```

This deletes the resource group and everything in it, and billing stops. The separate
`NetworkWatcherRG` resource group survives (see "NetworkWatcherRG"). The second line removes
the now useless kubeconfig. A recreated VM has a new SSH host key: verify it as described in
"Verify the host key" rather than deleting the `known_hosts` entry. The deployment record `main`
stays at subscription level. It costs nothing, and `az deployment sub delete --name main`
removes it.

## Operating the prod cluster

Three scripts in `infra/azure/bin/` wrap the tunnel from "API tunnel and kubeconfig", so that
prod is reached with a prefix instead of a second kubeconfig juggled by hand. They are bash,
and they only run `ssh`, `kubectl` and `helm`.

| Script | Does |
|---|---|
| `devops-tunnel start\|stop\|status` | Opens, closes or reports the SSH tunnel to the API |
| `devops-kubectl ...` | Ensures the tunnel is up, then runs `kubectl --kubeconfig <prod file> ...` |
| `devops-helm ...` | Ensures the tunnel is up, then runs `helm --kubeconfig <prod file> ...` |

Arguments pass through unchanged. The scripts never set `KUBECONFIG`, never edit a kubeconfig
file and never change a current context. Settings come from environment variables:

| Variable | Default |
|---|---|
| `SCHEDULAR_PROD_HOST` | `schedular.polandcentral.cloudapp.azure.com` |
| `SCHEDULAR_PROD_KUBECONFIG` | `~/.kube/schedular-prod.yaml` |
| `SCHEDULAR_PROD_TUNNEL_PORT` | `16443` |

### Installation

Pick one. Both go in `~/.zshrc`; open a new shell afterwards. Adjust the repository path if it
lives elsewhere.

Option 1, put the directory on `PATH` (this also provides `devops-tunnel`):

```sh
export PATH="$PATH:$HOME/Development/DevOps-Course/project/infra/azure/bin"
```

Option 2, aliases for the two wrappers only:

```sh
alias devops-kubectl="$HOME/Development/DevOps-Course/project/infra/azure/bin/devops-kubectl"
alias devops-helm="$HOME/Development/DevOps-Course/project/infra/azure/bin/devops-helm"
```

The wrappers find `devops-tunnel` next to themselves, so aliases work without a `PATH` entry.
Do not symlink the scripts elsewhere, because that breaks this lookup.

### Tunnel lifecycle

```sh
devops-tunnel start    # background SSH forward on 127.0.0.1:16443; does nothing if already up
devops-tunnel status   # "tunnel up ..." (exit 0) or "tunnel down" (exit 1)
devops-tunnel stop     # closes it through the SSH control socket
```

The forward uses `ExitOnForwardFailure=yes`, so a busy local port is an error, not a silent
half-tunnel. Its control socket is `~/.ssh/schedular-prod-tunnel-<port>.sock`.
`devops-kubectl` and `devops-helm` start the tunnel when it is down, so `start` is only needed on
its own. The tunnel stays up after the command ends; run `stop` when you are done.

A deallocated VM means no tunnel: `start` fails with an error and the wrappers refuse to run.
Run `infra/azure/vm.sh status`, and `infra/azure/vm.sh start` if needed, and wait for SSH to
answer. The tunnel does not survive a VM deallocation, a laptop sleep or a network change. After
one of these, `devops-tunnel stop` then `start` clears a stale session.

### The CI deploy key

`.github/workflows/deploy-prod.yml` reaches the API the same way, through an SSH tunnel, with a
key of its own whose `authorized_keys` line allows only the forward to `127.0.0.1:6443` and no
command. It is prepared but not active; see `docs/deployment/runbook.md`, "Automated deployment
(prepared, not active)".

- That key is **not part of the Bicep**: `sshPublicKey` installs only the admin key. It lives only
  in `~azureuser/.ssh/authorized_keys` on the VM, so after a VM rebuild it is gone and must be
  installed again (runbook, activation steps 2 and 3), together with a new `PROD_SSH_KNOWN_HOSTS`
  and `PROD_KUBECONFIG`, because the host key and the cluster CA change too.
- A **deallocated VM makes every deployment fail at the tunnel step**. A GitHub runner has no
  Azure credentials and cannot start it: run `infra/azure/vm.sh start` first.

### Docker habits

Prod runs in the namespace `schedular`. Add `-n schedular` or use `-A` where shown.

| Docker | Prod |
|---|---|
| `docker ps` | `devops-kubectl get pods -n schedular -o wide` |
| `docker logs <c>` | `devops-kubectl logs -n schedular <pod>` (add `-c <container>` for a multi-container pod) |
| `docker logs -f <c>` | `devops-kubectl logs -n schedular -f <pod>` |
| `docker compose logs` | `devops-kubectl logs -n schedular -l app=<label> --all-containers --prefix` |
| logs of a crashed container | `devops-kubectl logs -n schedular <pod> --previous` |
| `docker events` | `devops-kubectl get events -n schedular --sort-by=.lastTimestamp` |

`docker inspect` has its counterpart in `devops-kubectl describe pod -n schedular <pod>`, which
also shows the events for that pod. Check the actual label with `get pods --show-labels` before
using `-l`; the table does not know it.

### Below Kubernetes

When the API does not answer, there is no tunnel to use. Go in over SSH and read the node
itself:

```sh
FQDN=schedular.polandcentral.cloudapp.azure.com
ssh azureuser@"$FQDN" sudo journalctl -u k3s --since '1 hour ago' --no-pager   # the k3s service log
ssh azureuser@"$FQDN" sudo k3s crictl ps -a                                    # containers, even without the API
ssh azureuser@"$FQDN" sudo k3s crictl logs <container-id>                      # one container's log
```

`crictl ps -a` also lists exited containers, which is the way to find a crashed one. If SSH
itself fails, use "Recovering access".

### Port-forwarding to a Service

```sh
devops-kubectl port-forward -n schedular svc/<service> 8025:8025
```

This is the only way internal tools, such as a mail sink, will be reached: the NSG opens only
22, 80 and 443, and such Services have no Ingress. The command runs in the foreground and
reaches the Service at `localhost:8025`. Stop it with Ctrl-C. It rides on the API tunnel, so the
tunnel must stay up while it runs.

### Read logs before deleting anything

`kubectl logs` keeps only the current and the previous container of a pod. Deleting the pod, or
a second restart, loses the evidence. Read `logs` and `logs --previous`, and save them to a file
if they matter, before you delete, restart or roll out anything.

### The prefix is the safety line

`kubectl` and `helm` without the prefix still talk to the local kind cluster through the default
kubeconfig. `devops-kubectl` and `devops-helm` talk to prod and nothing else. Do not set
`KUBECONFIG` in your shell to the prod file, and do not merge it into `~/.kube/config`:
that would remove the line between the two clusters. When a command is meant for prod, the
word `devops-` has to be in it.

## Post-deploy security checks

Run these after every deployment, with the VM running. `FQDN` is set as in "Commands".

**1. sshd's effective configuration**, read through Azure, not SSH:

```sh
az vm run-command invoke --resource-group schedular-prod --name schedular-prod \
  --command-id RunShellScript \
  --scripts "mkdir -p /run/sshd; sshd -T | grep -E '^(passwordauthentication|kbdinteractiveauthentication|permitrootlogin|authenticationmethods|allowusers|allowagentforwarding|x11forwarding) '" \
  --query 'value[0].message' -o tsv
```

Expected, in the output's `[stdout]` block, exactly these seven lines in any order:

```
allowagentforwarding no
allowusers azureuser
authenticationmethods publickey
kbdinteractiveauthentication no
passwordauthentication no
permitrootlogin no
x11forwarding no
```

**2. Password login is refused:**

```sh
ssh -o PubkeyAuthentication=no -o PreferredAuthentications=password azureuser@"$FQDN"
```

Expected: `azureuser@<fqdn>: Permission denied (publickey).` and no password prompt. If a password
prompt appears, press Ctrl-C: the check has failed.

**3. Internal ports are closed:**

```sh
for p in 6443 10250 30080; do nc -vz -G 5 "$FQDN" "$p"; done
```

Expected: all three time out (`Operation timed out`). `Connection refused` is a failure: the
packets reached the VM, so the NSG did not drop them.

## Accepted risks

- The window between an sshd vulnerability being disclosed and the patch reaching the VM: port 22
  is open to the internet, and unattended security updates close the window only after the fact.
- Theft of the laptop together with the key passphrase gives full access to the VM.
- Compromise of the Azure account gives root on the VM through run-command, whatever sshd says.
- The NSG is the only barrier for ports other than 22, 80 and 443: k3s, the kubelet and NodePorts
  listen on all interfaces on the VM itself.
- `azureuser` has passwordless sudo, so anyone who gets in over SSH is root.

## Recovering access

The way in when SSH does not work is Azure, not a password. There is no password to set and none
is ever set.

**Reading the boot log.** Boot diagnostics capture the VM's serial output, which includes
cloud-init's progress, the host key fingerprints and the k3s install script's output. This works
without SSH and without any open port:

```sh
az vm boot-diagnostics get-boot-log --resource-group schedular-prod --name schedular-prod
```

Look for `Cloud-init ... finished`, and above it for the k3s installer's output or a failed
`runcmd`. On a VM that has been running for a while, the log starts at the most recent boot.

**Running a command as root with `az vm run-command invoke`.** It goes through the Azure VM
agent, so it needs the VM running but no SSH, no key and no open port. Read sshd's effective
configuration:

```sh
az vm run-command invoke --resource-group schedular-prod --name schedular-prod \
  --command-id RunShellScript --scripts 'mkdir -p /run/sshd; sshd -T' \
  --query 'value[0].message' -o tsv
```

Restart k3s and check it:

```sh
az vm run-command invoke --resource-group schedular-prod --name schedular-prod \
  --command-id RunShellScript --scripts 'systemctl restart k3s && systemctl is-active k3s' \
  --query 'value[0].message' -o tsv
```

The same route restarts `ssh.service` or fixes `~azureuser/.ssh/authorized_keys` after a lost
key. Because it gives root, the Azure account is part of the perimeter: see "The Azure account is
part of the perimeter".

## NetworkWatcherRG

Creating the VNet can make Azure create a resource group `NetworkWatcherRG` with a Network
Watcher for the region. It is not in the template, it is not tagged, and it survives
`az group delete --name schedular-prod`. It costs nothing on its own. Leave it, or delete it
separately once nothing else in the subscription uses it.

## The VM is amd64

`Standard_B2als_v2` is an x86-64 (AMD) size and the image is the amd64 Ubuntu server image.
Container images built locally on Apple silicon are arm64 by default and will not run there:
pods fail with `exec format error`. Build for `linux/amd64` (for example
`docker buildx build --platform linux/amd64 ...`), or use images built by CI on GitHub's amd64
runners.
