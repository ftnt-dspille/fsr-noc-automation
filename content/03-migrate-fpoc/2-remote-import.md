---
title: "CLI Remote Import Method"
linkTitle: "CLI Remote Import Method"
weight: 20
description: "Migrate FortiPOC instances to Fabric Studio remotely using the CLI import command"
---


The remote import method allows you to migrate FortiPOC instances directly through Fabric Studio's command-line interface. This approach is particularly valuable when working with custom firmwares or configurations that aren't available in standard repositories.

## When to Use Remote Import

**Recommended scenarios:**

- Custom firmware versions not in published repositories
- Specialized POC configurations requiring exact replication
- Complex environments with custom repository files
- When direct file access to FortiPOC isn't available

**Important Note:** This method is less extensively tested than standard import procedures. Consider it when other migration options aren't viable.

## Prerequisites

Before starting the remote import process, ensure you have:

### Infrastructure Requirements

- **Fabric Studio CLI Access** - Either through:
    - Built-in console interface
    - SSH connection to Fabric Studio (port 22)
- **Running FortiPOC Instance** - Your source FortiPOC/FNDN must be operational
- **Network Connectivity** - Fabric Studio must be able to reach your FortiPOC instance

### Authentication Requirements

- **FortiPOC Admin Credentials** - Username and password for CLI access
- **Fabric Studio Access** - Administrative privileges to execute import commands

## Import Process

### Step 1: Access Fabric Studio CLI

Choose your preferred method to access the command line:

**Option A: Built-in Console**

1. Log into the Fabric Studio web interface.
2. Click the **>_** (CLI) icon at the top right. A CLI console opens in the browser.

**Option B: SSH Connection**

```bash
ssh admin@<fabric-studio-ip> -p 22
```

### Step 2: Execute Remote Import

Run the basic import command:

```bash
model fabric remote import fortipoc <fortipoc_url>
```

**Example:**

```bash
model fabric remote import fortipoc https://192.168.1.100
# or
model fabric remote import fortipoc fortipoc.example.com
```

Replace `<fortipoc_url>` with your FortiPOC's IP address or domain name.

## What Gets Imported

By default, the remote import process includes:

### Firmware and Software

- **Local firmwares** - Custom or non-standard firmware versions
- **Repository files** - Local software repositories and packages

### POC Configurations

- **POC definitions** - All configured proof-of-concepts
- **POC configurations** - Device settings and network configurations

### Additional Data

- **Local POCs** - User-created proof-of-concept scenarios
- **Custom configurations** - Specialized settings and customizations

## Advanced Configuration Options

For fine-tuned control over the import process, additional command-line options are available. Refer to the [CLI documentation](https://register.fabricstudio.net/docs/fabric-studio/2.2.35/generated/cli/model.html#model-fabric-remote-import-fortipoc) (sign-in required), or the same page on your own Fabric Studio at `https://<fabric-studio>/help/generated/cli/model.html#model-fabric-remote-import-fortipoc`.

## Troubleshooting

### Common Issues

- **Connection timeouts** - Verify network connectivity between Fabric Studio and FortiPOC
- **Authentication failures** - Confirm FortiPOC admin credentials are correct
- **Import failures** - Check FortiPOC disk space and system health

### Best Practices

- **Test connectivity** before starting the import process
- **Backup your FortiPOC** before migration attempts
- **Monitor the import process** for errors or warnings
- **Verify imported data** after completion

## Next Steps

After successful import:

1. **Verify imported fabrics** in the Fabric Studio interface
2. **Test POC functionality** to ensure proper migration
3. **Review custom configurations** for accuracy
4. **Update any hardcoded references** to the new environment

The remote import method provides a way to migrate complex FortiPOC environments while preserving custom configurations and firmware versions.

If a FortiManager or FortiSandbox from the import then fails with `ip doesn't match`, see
[License "ip doesn't match"]({{% relref "/04-troubleshooting/05-license-ip-mismatch" %}}).
