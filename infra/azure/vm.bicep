// Contents of the resource group schedular-prod: one Ubuntu VM running k3s and the network in
// front of it. Deployed by main.bicep; see README.md for the commands.
//
// No resource here sets `zones`. Standard_B2als_v2 is restricted per availability zone for this
// subscription, so pinning a zone can name one the size is not offered in. A zonal disk or public
// IP would also force the VM into that same zone. Left regional, Azure places the VM wherever the
// size is available.

@description('Azure region, passed through from main.bicep.')
param location string

@description('DNS label of the public IP; the FQDN is <dnsLabel>.<region>.cloudapp.azure.com.')
param dnsLabel string

@description('OpenSSH public key for the admin user.')
param sshPublicKey string

@description('Local admin user on the VM.')
param adminUsername string

@description('Tags applied to every resource.')
param tags object

var vmName = 'schedular-prod'
var vmSize = 'Standard_B2als_v2'

// k3s uses 10.42.0.0/16 for pods and 10.43.0.0/16 for services; the VNet must not overlap them.
var vnetAddressPrefix = '10.0.0.0/16'
var subnetAddressPrefix = '10.0.0.0/24'

resource nsg 'Microsoft.Network/networkSecurityGroups@2024-05-01' = {
  name: 'schedular-prod-nsg'
  location: location
  tags: tags
  properties: {
    // Exactly three allow rules. The Kubernetes API is deliberately not one of them: it is
    // reached through an SSH tunnel. Azure's default rules still apply below these: VNet and
    // load balancer probe traffic in, everything else denied.
    securityRules: [
      {
        // Open to the internet because the admin moves between networks. sshd is hardened by
        // cloud-init.yaml to public keys only.
        name: 'allow-ssh'
        properties: {
          priority: 100
          direction: 'Inbound'
          access: 'Allow'
          protocol: 'Tcp'
          sourceAddressPrefix: 'Internet'
          sourcePortRange: '*'
          destinationAddressPrefix: '*'
          destinationPortRange: '22'
        }
      }
      {
        name: 'allow-http'
        properties: {
          priority: 110
          direction: 'Inbound'
          access: 'Allow'
          protocol: 'Tcp'
          sourceAddressPrefix: 'Internet'
          sourcePortRange: '*'
          destinationAddressPrefix: '*'
          destinationPortRange: '80'
        }
      }
      {
        name: 'allow-https'
        properties: {
          priority: 120
          direction: 'Inbound'
          access: 'Allow'
          protocol: 'Tcp'
          sourceAddressPrefix: 'Internet'
          sourcePortRange: '*'
          destinationAddressPrefix: '*'
          destinationPortRange: '443'
        }
      }
    ]
  }
}

resource vnet 'Microsoft.Network/virtualNetworks@2024-05-01' = {
  name: 'schedular-prod-vnet'
  location: location
  tags: tags
  properties: {
    addressSpace: {
      addressPrefixes: [
        vnetAddressPrefix
      ]
    }
    subnets: [
      {
        name: 'schedular-prod-subnet'
        properties: {
          addressPrefix: subnetAddressPrefix
        }
      }
    ]
  }
}

resource publicIp 'Microsoft.Network/publicIPAddresses@2024-05-01' = {
  name: 'schedular-prod-ip'
  location: location
  tags: tags
  sku: {
    name: 'Standard'
    tier: 'Regional'
  }
  properties: {
    publicIPAddressVersion: 'IPv4'
    // Static, so the address and the FQDN survive deallocation.
    publicIPAllocationMethod: 'Static'
    dnsSettings: {
      domainNameLabel: dnsLabel
    }
  }
}

resource nic 'Microsoft.Network/networkInterfaces@2024-05-01' = {
  name: 'schedular-prod-nic'
  location: location
  tags: tags
  properties: {
    networkSecurityGroup: {
      id: nsg.id
    }
    ipConfigurations: [
      {
        name: 'ipconfig1'
        properties: {
          privateIPAllocationMethod: 'Dynamic'
          subnet: {
            id: vnet.properties.subnets[0].id
          }
          publicIPAddress: {
            id: publicIp.id
          }
        }
      }
    ]
  }
}

// The FQDN is taken from the public IP itself rather than assembled from the label and region,
// so the cloudapp.azure.com suffix is never hard-coded.
var cloudInit = replace(loadTextContent('cloud-init.yaml'), '@@FQDN@@', publicIp.properties.dnsSettings.fqdn)

resource vm 'Microsoft.Compute/virtualMachines@2024-11-01' = {
  name: vmName
  location: location
  tags: tags
  properties: {
    hardwareProfile: {
      vmSize: vmSize
    }
    storageProfile: {
      imageReference: {
        publisher: 'Canonical'
        offer: 'ubuntu-24_04-lts'
        sku: 'server'
        version: 'latest'
      }
      osDisk: {
        name: 'schedular-prod-osdisk'
        createOption: 'FromImage'
        diskSizeGB: 32
        deleteOption: 'Delete'
        managedDisk: {
          storageAccountType: 'StandardSSD_LRS'
        }
      }
    }
    osProfile: {
      computerName: vmName
      adminUsername: adminUsername
      customData: base64(cloudInit)
      linuxConfiguration: {
        disablePasswordAuthentication: true
        ssh: {
          publicKeys: [
            {
              path: '/home/${adminUsername}/.ssh/authorized_keys'
              keyData: sshPublicKey
            }
          ]
        }
      }
    }
    networkProfile: {
      networkInterfaces: [
        {
          id: nic.id
        }
      ]
    }
    // No storageUri: Azure keeps the boot log in managed storage. The boot log is the
    // way in when SSH is not, together with `az vm run-command` (see README.md).
    diagnosticsProfile: {
      bootDiagnostics: {
        enabled: true
      }
    }
  }
}

output fqdn string = publicIp.properties.dnsSettings.fqdn
output publicIpAddress string = publicIp.properties.ipAddress
