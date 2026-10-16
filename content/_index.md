---
title: "Fabric Studio"
linkTitle: "Fabric Studio"
weight: 40
description: "Build, run and share Fortinet lab topologies on Fabric Studio, the FortiPOC successor: setup, licensing, building fabrics, keeping device state, troubleshooting and automation. Every step verified on a live Fabric Studio."
---

## Overview

**Fabric Studio** is Fortinet's internal lab platform, and the successor to
FortiPOC. On one Fabric Studio (a VM or a lab pod) you build a **fabric**: a set
of virtual devices (FortiGate, FortiManager, FortiAnalyzer, FortiSOAR and other
Fortinet VMs, Linux containers, or any qcow2/KVM image), cabled together through
virtual switches. Fabric Studio deploys and licenses the devices, addresses
them, gets them on the internet, and gives you SSH, HTTPS and VNC access to each
one from your browser. A finished fabric can be exported as a **template** and
shared, so anyone can reproduce the same lab.

Use it to build demos, proofs of concept, workshops and test labs, from a single
FortiGate up to a full Security Fabric.

**This site** is the practical guide: how to set Fabric Studio up, build and
change a fabric without losing work, and fix what goes wrong. Every procedure
and behaviour described here was checked on a running Fabric Studio (2.2.35),
with screenshots from the real UI.

### Where to start

| You want to... | Start with |
|---|---|
| Get a Fabric Studio running and licensed | [Setup]({{% relref "01-fabric-studio-101" %}}) |
| Build your first lab | [Your First Fabric]({{% relref "02-building-fabrics/02-first-fabric" %}}) |
| Change a running lab without breaking it | [Install vs Apply vs Sync]({{% relref "02-building-fabrics/04-apply-install-sync" %}}) |
| Run a Linux box or third-party appliance | [Generic VMs]({{% relref "02-building-fabrics/07-generic-vm" %}}) |
| Move from FortiPOC | [Migration Options]({{% relref "03-migrate-fpoc" %}}) |
| Fix "can't reach my device" or "no internet" | [Troubleshooting]({{% relref "04-troubleshooting" %}}) |
| Script or automate it | [Fabric Studio API]({{% relref "07-python-api" %}}) |

### Five things that catch everyone

1. **A reinstall wipes what you changed inside a device.** ▶ Install, Runtime >
   Install, or an Apply changes row left on Install redeploys from firmware.
   [Back up first]({{% relref "02-building-fabrics/05-saving-state" %}}).
2. **On a running fabric, use ⚡ Apply changes, not ▶ Install**, and check every
   row: rows often default to Install.
3. **Sync doesn't apply everything.** Gateway/DNS, passwords and new port
   addresses only reach a running device on install, and a Sync can clear the
   pending change without applying it.
   [The list]({{% relref "02-building-fabrics/04-apply-install-sync#changes-that-need-more-than-sync" %}}).
4. **One fabric runs at a time.** Installing another fabric shuts down the one
   that's running.
5. **A refused login is rarely a wrong password.** It's usually the wrong user,
   the wrong route, or a lockout.
   [Device access]({{% relref "04-troubleshooting/01-device-access" %}}).

{{% notice tip %}}
Every Fabric Studio has its own built-in documentation for its version at
`https://<fabric-studio>/help/`. See [Resources](#resources).
{{% /notice %}}

### Why Fabric Studio

The core engine has been designed with several key features:

- Incremental creation/destruction of devices while a fabric is running
- Direct connection between ports of VMs
- REST-like HTTP API and CLI commands with consistent behavior
- Modern user interface built with Neutrino

{{% notice note %}}
Fabric Studio is the successor to FortiPOC, which is reaching End of Life (EOL).
{{% /notice %}}

### Key Terminology

| Term                  | Description                                                                                                                                                                      |
|-----------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Fabric**            | A group of VMs interconnected by virtual networks (equivalent to a PoC in FortiPOC)                                                                                              |
| **Template**          | An exported fabric that can be stored in a repository or exchanged between users (similar to .fpoc files in FortiPOC)                                                            |
| **Firmware**          | Files containing the disks used to start a VM or LXC container (equivalent to images in FortiPOC)                                                                                |
| **Home Repository**   | A repository on your Fabric Studio where you can store firmwares and shared templates (similar to the local repository in FortiPOC)                                              |
| **System Repository** | A repository that manages local fabric templates used to create a fabric from scratch with minimal topology                                                                      |
| **VM**                | A LXC container or KVM virtual machine                                                                                                                                           |
| **Router**            | A simple router provided by Fabric Studio                                                                                                                                        |
| **Switch**            | A simple software switch provided by Fabric Studio (note: a network in FortiPOC was a combination of a switch and router)                                                        |
| **Host**              | Represents the Fabric Studio and its external ports to allow your fabric to access devices outside Fabric Studio and its internal ports that connect your fabric to the internet |

## Documentation

{{% children description="true" %}}

## Resources

### Documentation

Access the official documentation and resources on the internal Sharepoint site:

{{< button href="https://fortinet.sharepoint.com/sites/FabricStudio/SitePages/Home.aspx" icon="sharepoint" >}}Fabric Studio Sharepoint{{< /button >}}

![Fabric Studio Sharepoint](img.png?height=500px)

The product documentation (user guide, CLI and API reference) is on
[register.fabricstudio.net](https://register.fabricstudio.net/docs/fabric-studio/2.2.35/)
(sign-in required). **Every Fabric Studio also serves the same documentation,
for its own version, at `https://<fabric-studio>/help/`**, with the API
browser at `/help/openapi/`. Links on this site point at the 2.2.35 pages;
the same path under your Fabric Studio's `/help/` works too.

### Support

Report bugs or issues with Fabric Studio through the official bug tracker:

{{< button href="https://mantis.fortinet.com/bug_report_page.php?project_id=124&category=fabric-studio" style="warning" icon="bug" >}}Report Bugs{{< /button >}}

### Community

Join the Microsoft Teams channel for updates and community support:

{{< button href="https://teams.microsoft.com/l/team/19%3AH8_ZjjrRfW5y-X9QQZ1R5CBfHzLZzYbMpOiT4izrWZs1%40thread.tacv2/conversations?groupId=c6ab0b94-5912-46a7-9738-c03c97a08974&tenantId=2c36c478-3d00-452f-8535-48396f5f01f0" style="primary" icon="microsoft" >}}Join Teams Channel{{< /button >}}

![Teams Channel](img_1.png)

{{% notice info %}}
The Teams channel has multiple sections:

- **General channel**: Read-only update notifications
- **Community Q&A**: Where you can ask questions and get help with non-bug related issues
  {{% /notice %}}

## FortiPOC to Fabric Studio Comparison

For users familiar with FortiPOC, here's a quick reference for Fabric Studio equivalents:

| FortiPOC Term    | Fabric Studio Term          |
|------------------|-----------------------------|
| PoC              | Fabric                      |
| .fpoc file       | Template                    |
| Image            | Firmware                    |
| Network          | Switch + Router combination |
| Local Repository | Home Repository             |