#!/usr/bin/env bash
# Start, deallocate or inspect the production VM. There is deliberately no stop subcommand:
# stopping without deallocating keeps compute billed. See README.md, "Daily routine".
set -euo pipefail

RESOURCE_GROUP="${RESOURCE_GROUP:-schedular-prod}"
VM_NAME="${VM_NAME:-schedular-prod}"

usage() {
  echo "usage: ${0##*/} start|deallocate|status" >&2
  exit 2
}

power_state() {
  az vm get-instance-view --resource-group "$RESOURCE_GROUP" --name "$VM_NAME" \
    --query "instanceView.statuses[?starts_with(code, 'PowerState')].displayStatus" -o tsv
}

[[ $# -eq 1 ]] || usage

case "$1" in
  start)
    az vm start --resource-group "$RESOURCE_GROUP" --name "$VM_NAME"
    az network public-ip show --resource-group "$RESOURCE_GROUP" --name "${VM_NAME}-ip" \
      --query dnsSettings.fqdn -o tsv
    ;;
  deallocate)
    az vm deallocate --resource-group "$RESOURCE_GROUP" --name "$VM_NAME"
    power_state
    ;;
  status)
    power_state
    ;;
  *)
    usage
    ;;
esac
