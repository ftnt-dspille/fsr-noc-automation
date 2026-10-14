---
title: "Fabrics from Templates"
linkTitle: "Fabrics from Templates"
weight: 60
description: "Start from a pre-built template, and export your own fabric as one"
---

A **template** is an exported fabric: devices, cabling, networks, and
(optionally) saved device configurations. Starting from one is the fastest way
to get a working demo.

## Create a fabric from a template

1. Go to **Fabric Workspace**.
2. Click **Create > Fabric from Template**.

   ![The Create menu](images/create-menu.png)

3. Pick a template from the list, then confirm.

   ![Create Fabric from Template](images/create-from-template.png)

Use the search box. The list holds every template your registration can
see (124 on the pod above). Two columns matter when choosing:

- **Description**: most templates state the Fabric Studio version they were
  built on and the firmware versions inside, for example
  `FS2.0.4, FAD8.0.2, FGT7.4.9`.
- **Documentation**: a link to the template's lab guide. Read it first; many
  templates expect manual steps after install.

{{% notice warning %}}
**Fabric Studio's password policy is not applied to fabrics created from a
template.** Older templates, and anything converted from FortiPoC, can ship
with weak device passwords. If your Fabric Studio is reachable from the
internet, change them before you install.
{{% /notice %}}

## Where templates come from

Templates are served from the repositories assigned to your Fabric Studio
registration. Browse them under **Repositories > Remote**. If the list is
empty, check **System > Registration** first. See
[Deploy Fabric Studio]({{% relref "/01-fabric-studio-101/01-deploy-FS" %}}).

## Export your own fabric as a template

From the fabric's **☰** menu, choose **Export Fabric**.

![The fabric menu: Power on all, Shutdown all, Export Fabric](images/fabric-actions-menu.png)

Before exporting, back up each device's configuration (device right-click
**Config & License**) so the template carries the configured state, not just
the factory one.
