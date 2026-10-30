---
title: "Tool Reference"
linkTitle: "Tool Reference"
weight: 40
description: "Every tool the Fabric Studio MCP server offers, and which ones change a pod"
---

You rarely call these by name. Claude picks the right one from your question. There are few tools
and each is broad: you choose a `view` or `include` inside it. Most take a `host` (the pod, as shown by
the `instances` view), and where a VM or fabric is involved, `vm` and `fabric` may each be an id or a
name, or left out for the single SOAR VM and the running fabric.

## Read-only

### `diagnose`: start here when something is wrong

One call checks every VM in a fabric and returns a verdict (healthy, needs attention, problems found)
with findings ranked by severity. It reads the log of any failed install and names the cause, and
checks firmware, power and boot state, licensing, forwards that do not answer, another fabric running
on the pod, tasks in flight, and lockouts. Each finding gives the evidence and the next step. A login
problem is not a `diagnose` job: use `vm` with `credentials`.

Add `deep=true` for the slower device-level checks, in the lab repository's build: each device's
own verification (powered, booted, forwards answering, license as Fabric Studio records it, and a
diagnosis such as a device sized above its eval limit with no FortiFlex activation), and, when you
name a `topology`, that topology's health checks. In the core build `deep` says it has nothing to add.

### `pods`: anything about pods

| `view` | Answers |
|---|---|
| `online` | Only what is online: each pod, its fabric, its devices, and whether it is locked |
| `overview` | Every device in every fabric of every managed pod |
| `health` | Is it safe to act: Fabric Studio version, uptime, tasks in flight, locks (`host` for one pod's detail) |
| `licenses` | FortiFlex and FortiCloud registration and the license pool (`host` for one pod) |
| `reach` | Can this machine reach each pod (HTTPS, SSH); `devices=true` also probes devices |
| `lockouts` | Pods or fabrics frozen against changes, and why |
| `instances` | The pods you manage, and whether each is online |
| `known` | Every pod found on this machine: login files and the local database |
| `find` | Which pod and fabric a named device (`query`) is on |
| `firmwares` | Every firmware image the pod can install, from all repositories, marked local, remote or unusable (a 0-byte stub); `vm_type` filters |
| `snapshots` | Firmware in the pod's home repository only (default: FortiSOAR) |

### `fabric`: one fabric

`include` any of `fabrics` (what the pod has and which one runs), `vms`, `topology` (networks, subnets,
gateways), `resources` (vCPU, memory, disk per VM, with totals) and `system_host` (the DHCP, NAT and
routing device: installed or not, and its ports). The default is `vms`.

### `vm`: one VM

`include` any of:

| `include` | Answers |
|---|---|
| `state` | Powered, booted, licensed, any task in flight, firmware (the default) |
| `detail` | State plus CPU and memory, disks and access entries |
| `access` | SSH, HTTPS and RDP entries and whether each forward answers |
| `disks` | The VM's disks |
| `license` | The license Fabric Studio assigned it |
| `credentials` | The default login for the device type and where its password lives |
| `license_match`, `guest_license`, `guest_config` | FortiSOAR only: SSH into the guest through the pod and compare or read its license, and report the first-boot wizard (configured, pending or failed) |

A section that fails reports its error in place and does not hide the others.

### `tasks`: what ran and why it failed

Without a task id, the tasks running now and (with `vm`) that VM's recent tasks and return codes. With
a task id, that task's log, which holds the reason a device task failed.

## Changes something

{{% notice warning %}}
These alter a pod, so each is gated twice. Without `confirm=true` a tool only reports what it
would do. With it, the server runs that preview and then **asks you** to approve the exact plan
(an MCP elicitation prompt in your client). The agent cannot answer for you. If you decline, nothing
changes. A client that cannot show the prompt gets a refusal, so use Claude Code or another client
that supports elicitation. Read the plan before you approve.

Every tool also tells the client whether it is read-only or destructive, so the client can prompt
accordingly. For an unattended run you operate yourself, set `FS_MCP_ASSUME_CONFIRMED=1` in the
server's environment; an agent cannot set it.
{{% /notice %}}

| Tool | What it does |
|---|---|
| `set_vm_access_public` | Makes a guest's SSH or HTTPS access public and reinstalls it to allocate the external port |
| `install_system_host` | Installs the System Host so DHCP and NAT start working |
| `set_vm_port_dhcp` | Points a guest port at a System Host DHCP reservation |
| `set_vm_port_auto` | Puts a guest port on its auto network |
| `snapshot_vm` | Saves a VM's disks as a new firmware in the pod's home repository. `action` is `diff` (only what changed since the original firmware; small) or `full` (one standalone image; larger, no dependency). The VM is hard powered off during the export and brought back up, so expect several minutes of downtime and lose unsaved guest state. `link=true` (the default) points the VM at the snapshot so a reinstall boots it |

{{% notice note %}}
The lab repository's own build adds the tools that build a fabric: `list_topologies`,
`validate_fabric`, `plan_fabric`, `apply_fabric` (confirm to run, and you are asked to approve the plan; it
stops the fabric running on the pod) and `fabric_run_status`. `plan_fabric` and `apply_fabric` take
`prune=true`, which also deletes what the topology does not declare in that fabric; the plan lists every delete
(`deletes`), so read it before you approve, because a prune can remove seeded networks or switches the
topology leaves out. The examples are written to prune only the seeded router: Fabric Studio seeds an `ISP Router` into every fabric, and left in place it blocks every later
plan of that fabric.
{{% /notice %}}

{{% notice warning %}}
A reinstall wipes whatever you changed inside the guest. Back the device up
first, as described in
[Saving State]({{% relref "/02-building-fabrics/05-saving-state" %}}).
{{% /notice %}}

### Preview first, and order matters

Every tool above reports what it would do until you pass `confirm=true`, so ask
Claude to show you the preview before it applies anything. Several of them
reinstall the guest by default; ask for `reinstall=false` when you only want the
model changed.

When you wire a guest to the fabric's DHCP, the order is:

1. `set_vm_port_dhcp` on the guest. Fabric Studio only writes a DHCP reservation
   into the System Host when the host is installed, so the reservation must
   exist first.
2. `install_system_host`. It drops every guest's external port forward, so the
   tool rebuilds them one guest at a time. It never synchronizes the System
   Host itself, because that wipes the host's egress address and cuts internet
   access for the whole fabric.
3. Reinstall the guest so it picks up its lease.

To go back to fixed addressing, use `set_vm_port_auto`. There is no tool to
uninstall the System Host.

A tool that waits for a reinstall can run for many minutes. The server allows
up to 20 minutes for those, and one minute for everything else.

## Local only

These change your registry on this machine and never touch a pod.

| Tool | What it does |
|---|---|
| `add_instance`, `remove_instance` | Start or stop managing a pod |
| `engage_lockout` | Freezes apply, provision and destroy on a pod or fabric, with a reason shown to whoever hits it |

The server has no tool to lift a lockout. That stays a deliberate step for the
person who set it.
