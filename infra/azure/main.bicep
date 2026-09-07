// Production host for Schedular: the resource group schedular-prod and, through vm.bicep, one
// Ubuntu VM running k3s. Preview with `az deployment sub what-if`, deploy with
// `az deployment sub create`; see README.md for the full commands.
//
// sshPublicKey is supplied on the command line only and is never committed. SSH is key-only and
// open to the internet; see README.md, "Network access" and "Post-deploy security checks".

targetScope = 'subscription'

// The only permitted regions that offer Standard_B2als_v2 to this subscription.
@description('Azure region for the resource group and everything in it.')
@allowed([
  'polandcentral'
  'austriaeast'
  'belgiumcentral'
])
param location string

@description('DNS label of the public IP; the FQDN is <dnsLabel>.<location>.cloudapp.azure.com.')
param dnsLabel string

@description('OpenSSH public key for azureuser.')
param sshPublicKey string

var tags = {
  project: 'schedular'
}

resource rg 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: 'schedular-prod'
  location: location
  tags: tags
}

module vm 'vm.bicep' = {
  scope: rg
  params: {
    location: location
    dnsLabel: dnsLabel
    sshPublicKey: sshPublicKey
    adminUsername: 'azureuser'
    tags: tags
  }
}

output fqdn string = vm.outputs.fqdn
output publicIpAddress string = vm.outputs.publicIpAddress
