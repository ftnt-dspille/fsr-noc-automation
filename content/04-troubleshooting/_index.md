---
title: "Troubleshooting"
linkTitle: "Troubleshooting"
weight: 40
description: "Symptom-first fixes for common Fabric Studio problems: device access, internet access, and Fabric Studio footguns"
aliases:
  - /01-fabric-studio-101/05-troubleshooting/
---

Find your symptom, then follow the link.

| Symptom | Page |
|---|---|
| SSH/HTTPS to a device fails from your machine, but works from the Fabric Studio console | [Device Access Blocked]({{% relref "01-device-access" %}}) |
| SSH, HTTP, or HTTPS is not offered in a device's **Access** section | [Missing SSH/HTTPS Access]({{% relref "02-adding-access" %}}) |
| No internet from a device, `bad address` on ping, or a license stuck at **Warning** | [No Internet / License Warning]({{% relref "03-no-internet" %}}) |
| A change wiped a running device, a fabric "disappeared", or a setting didn't take effect | [Fabric Studio Footguns]({{% relref "04-footguns" %}}) |

{{% children description=true %}}

## Fabric Studio's own troubleshooting docs

For more comprehensive troubleshooting assistance, consult the [Fabric Studio Documentation](https://register.fabricstudio.net/docs/fabric-studio/2.0.2/troubleshooting.html) which covers:

- **Fabric Studio Logs** - Analyzing system logs for debugging
- **SystemD Journal Logs** - Service-level log analysis
- **Network Packet Sniffing** - Traffic analysis and debugging
- **Storage Issues** - Resolving out-of-space errors
- **File Transfer Problems** - Fixing SCP transfer failures

{{% notice tip %}}
**Pro Tip:** Always verify changes at both the global and device level when troubleshooting access issues. Many problems stem from mismatched security settings between these two levels.
{{% /notice %}}
