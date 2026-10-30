---
title: "Tool Reference"
linkTitle: "Tool Reference"
weight: 40
description: "Every tool the Fabric Studio MCP server offers, and which ones change a pod"
---

You rarely call these by name. Claude picks the right ones from your question.
Most take a `host` (the pod, as shown by `list_instances`), and where a VM or
fabric is involved, `vm` and `fabric` may each be an id or a name, or left out
for the single SOAR VM and the running fabric.

## Read-only

### Your pods

| Tool | Answers |
|---|---|
| `list_instances` | The pods you manage, and whether each is online |
| `discover_instances` | Login files and pod hosts found on this machine |
| `whats_up` | Only what is online: each pod, its fabric, its devices |
| `instances_overview` | Every device in every fabric of every managed pod |
| `find_device` | Which pod and fabric a named device is on |
| `pods_health` | Is it safe to act: tasks in flight, locks, health |
| `licenses_overview` | FortiFlex registration and license pool, per pod |
| `reach_matrix` | Can this machine reach each pod (HTTPS, SSH), and its devices |
| `list_lockouts` | Pods or fabrics frozen against changes, and why |
| `list_pods` | Pods in the local backend database |

### Fabrics and devices

| Tool | Answers |
|---|---|
| `list_fabrics`, `list_vms` | What fabrics and VMs a pod has |
| `fabric_topology` | The fabric's networks and switches |
| `fabric_resources` | vCPU, memory and disk configured per VM, with totals |
| `vm_detail` | One-shot picture of a VM: state, license, firmware, disks, access |
| `vm_state`, `vm_disks` | Runtime state, and the VM's disks |
| `vm_access` | SSH, HTTPS and RDP entries and whether they answer |
| `system_host` | The fabric's System Host (DHCP, NAT, routing device) |
| `device_credentials_hint` | The default login for a device type, without guessing |

### System, licensing and tasks

| Tool | Answers |
|---|---|
| `pod_health` | Fabric Studio version, serial, uptime, licenses, disk layout |
| `list_firmwares` | Every firmware image the pod can install, from all repositories, marked local, remote or unusable (a 0-byte stub) |
| `list_snapshots` | Firmware in the pod's home repository only (default: FortiSOAR) |
| `fs_license_pool`, `fs_license_assignment` | The pod's license pool, and what a VM was assigned |
| `forticloud_status` | Whether the FortiFlex or FortiCloud account is registered |
| `list_tasks`, `task_log` | Running tasks, and the log that explains a failure |

### Inside a FortiSOAR guest

These SSH into the guest through the pod and run `csadm`. FortiSOAR only.

| Tool | Answers |
|---|---|
| `read_guest_license` | The guest's own license details |
| `guest_config_status` | First-boot wizard: configured, pending or failed |
| `validate_license_match` | Is the serial Fabric Studio assigned the one the guest uses |

## Changes something

{{% notice warning %}}
These alter a pod, so each is gated. The first four do nothing unless the call
carries `confirm=true`, and Claude Code asks your permission on every tool call
besides. Read what it proposes before you approve.
{{% /notice %}}

| Tool | What it does |
|---|---|
| `set_vm_access_public` | Makes a guest's SSH or HTTPS access public and reinstalls it to allocate the external port |
| `install_system_host` | Installs the System Host so DHCP and NAT start working |
| `set_vm_port_dhcp` | Points a guest port at a System Host DHCP reservation |
| `set_vm_port_auto` | Puts a guest port on its auto network |

{{% notice note %}}
The lab repository's own build adds the tools that build a fabric: `list_topologies`,
`validate_fabric`, `plan_fabric`, `apply_fabric` (confirm to run; it stops the fabric running on the
pod) and `fabric_run_status`.
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
