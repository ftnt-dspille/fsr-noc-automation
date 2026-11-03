---
title: "Tool Reference"
linkTitle: "Tool Reference"
weight: 40
description: "Every tool the Fabric Studio MCP server offers, and which ones change a pod"
---

You rarely call these by name. Claude picks the right one from your question. There are few tools
and each is broad: you choose a *view* or *include* inside it. Most take a *host* (the pod, as shown by
the *instances* view), and where a VM or fabric is involved, **vm** and **fabric** may each be an id or a
name, or left out for the single SOAR VM and the running fabric.

## Read-only

### diagnose: start here when something is wrong

One call checks every VM in a fabric and returns a verdict (healthy, needs attention, problems found)
with findings ranked by severity. It reads the log of any failed install and names the cause, and
checks firmware, power and boot state, licensing, forwards that do not answer, another fabric running
on the pod, tasks in flight, and lockouts. Each finding gives the evidence and the next step. A login
problem is not a **diagnose** job: use **vm** with *credentials*.

Add *deep=true* for the slower device-level checks, in the lab repository's build: each device's
own verification (powered, booted, forwards answering, license as Fabric Studio records it, and a
diagnosis such as a device sized above its eval limit with no FortiFlex activation), and, when you
name a *topology*, that topology's health checks. In the core build *deep* says it has nothing to add.

### pods: anything about pods

| *view* | Answers |
|---|---|
| *online* | Only what is online: each pod, its fabric, its devices, and whether it is locked |
| *overview* | Every device in every fabric of every managed pod |
| *health* | Is it safe to act: Fabric Studio version, uptime, tasks in flight, locks (*host* for one pod's detail) |
| *licenses* | FortiFlex and FortiCloud registration and the license pool (*host* for one pod) |
| *reach* | Can this machine reach each pod (HTTPS, SSH); *devices=true* also probes devices |
| *lockouts* | Pods or fabrics frozen against changes, and why |
| *instances* | The pods you manage, and whether each is online |
| *known* | Every pod found on this machine: login files and the local database |
| find | Which pod and fabric a named device (*query*) is on |
| *firmwares* | Every firmware image the pod can install, from all repositories, marked local, remote or unusable (a 0-byte stub); *vm_type* filters |
| *snapshots* | Firmware in the pod's home repository only (default: FortiSOAR) |

### fabric: one fabric

*include* any of *fabrics* (what the pod has and which one runs), *vms*, *topology* (networks, subnets,
gateways), *resources* (vCPU, memory, disk per VM, with totals) and **system_host** (the DHCP, NAT and
routing device: installed or not, and its ports). The default is *vms*.

### vm: one VM

*include* any of:

| *include* | Answers |
|---|---|
| *state* | Powered, booted, licensed, any task in flight, firmware (the default) |
| *detail* | State plus CPU and memory, disks and access entries |
| *access* | SSH, HTTPS and RDP entries and whether each forward answers |
| *disks* | The VM's disks |
| *license* | The license Fabric Studio assigned it |
| *credentials* | The default login for the device type and where its password lives |
| *license_match*, *guest_license*, *guest_config* | FortiSOAR only: SSH into the guest through the pod and compare or read its license, and report the first-boot wizard (configured, pending or failed) |

A section that fails reports its error in place and does not hide the others. If every section fails the same way (the pod is down, or it refused the login), the call itself fails with that one error.

### tasks: what ran and why it failed

Without a task id, the tasks running now and (with **vm**) that VM's recent tasks and return codes. With
a task id, that task's log, which holds the reason a device task failed.

## Changes something

{{% notice warning %}}
These alter a pod, so each is gated twice. Without *confirm=true* a tool only reports what it
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
| **set_vm_access_public** | Makes a guest's SSH or HTTPS access public and reinstalls it to allocate the external port |
| **install_system_host** | Installs the System Host so DHCP and NAT start working |
| **set_vm_port_dhcp** | Points a guest port at a System Host DHCP reservation |
| **set_vm_port_auto** | Puts a guest port on its auto network |
| **vm_lifecycle** | One VM: *action* is *on*, *off*, *restart*, *reinstall* or **cancel_task** (with *task_id*). *off* and *restart* are hard power-offs, so unsaved guest state is lost. *reinstall* rebuilds the guest from its firmware and wipes everything changed inside it. Asking for *on* on a VM that is already on does nothing and does not ask you |
| **set_vm_license** | Chooses how one VM is licensed on install: *NONE* (unlicensed, nothing spent) or *AUTO* (takes a pooled license or FortiFlex points). The preview shows the current mode, the license now served, how many pooled licenses match the device type and whether FortiFlex is registered. The mode only applies on the next install, so *reinstall=true* is the default; *reinstall=false* changes the setting only |
| **build** | Makes a whole fabric from a topology. *action* is *topologies* (what can be built), *validate* (no pod), *plan* (what it would create, reinstall or delete, which firmware each device gets, which running fabric it would stop), *apply* (build it; with *confirm=true* you are asked to approve the plan, then it runs in the background and returns a *run_id*) or *status* (follow a run). Only *apply* changes the pod, and it **stops the fabric running there now**. *prune=true* also deletes what the topology does not declare in that fabric (the plan lists every delete). Refused on a locked pod, a blocked plan, or a pod with a build already running. See [Build a Fabric]({{% relref "07-build-a-fabric" %}}) |
| **device** | Looks at and configures what is inside a FortiGate, by device name. *action* is *status* (firmware, license, HA mode), *config* (read a configuration section as structured data, such as *interfaces*, *routes*, *policies*, *addresses* or a path like system/interface), *set* (give an object field values; it is created when it does not exist) or *delete*. Reading never asks and never changes anything. *set* and *delete* return a plan first, the real before and after read from the device, and with *confirm=true* you are asked to approve it; the result is then read back, and *verified* says whether the device kept what was asked. Passwords and keys are never returned, and administrator and API-user accounts are refused. The device must be powered on with its SSH access public; it uses the API when the device accepts it and its command line over SSH when not, and says which in *via*. See [Configure a FortiGate]({{% relref "09-configure-a-fortigate" %}}) |
| **run** | Runs a command over SSH, or makes an API call, on **any** device of a fabric by name, using its public SSH or HTTPS access. Give *command* (such as `get system status` or `df -h`) or *api* (such as `GET /api/v2/monitor/system/status`, with a *body* for POST and PUT). A command that only reads and every GET run at once; anything else returns a plan showing exactly what will be sent, and runs only after you approve it. FortiOS secrets in the output are hidden. See [Run Anything on a Device]({{% relref "10-run-on-a-device" %}}) |
| **snapshot_vm** | Saves a VM's disks as a new firmware in the pod's home repository. *action* is *diff* (only what changed since the original firmware; small) or *full* (one standalone image; larger, no dependency). The VM is hard powered off during the export and brought back up, so expect several minutes of downtime and lose unsaved guest state. *link=true* (the default) points the VM at the snapshot so a reinstall boots it |

{{% notice note %}}
**build** ships two topologies, *fgt_single* and *fgt_fmg_faz*, and also lists any *intent.yaml* under
`<workspace>/topologies/<name>/`. It brings devices up and stops there: configuring a FortiGate afterwards is the
job of **device**. The lab repository's own build of the server adds a device configuration phase and device-level
checks for the topologies that use them.
{{% /notice %}}

{{% notice warning %}}
A reinstall wipes whatever you changed inside the guest. Back the device up
first, as described in
[Saving State]({{% relref "/02-building-fabrics/05-saving-state" %}}).
{{% /notice %}}

### Preview first, and order matters

Every tool above reports what it would do until you pass *confirm=true*, so ask
Claude to show you the preview before it applies anything. Several of them
reinstall the guest by default; ask for *reinstall=false* when you only want the
model changed.

When you wire a guest to the fabric's DHCP, the order is:

1. **set_vm_port_dhcp** on the guest. Fabric Studio only writes a DHCP reservation
   into the System Host when the host is installed, so the reservation must
   exist first.
2. **install_system_host**. It drops every guest's external port forward, so the
   tool rebuilds them one guest at a time. It never synchronizes the System
   Host itself, because that wipes the host's egress address and cuts internet
   access for the whole fabric.
3. Reinstall the guest so it picks up its lease.

To go back to fixed addressing, use **set_vm_port_auto**. There is no tool to
uninstall the System Host.

A tool that waits for a reinstall can run for many minutes. The server allows
up to 20 minutes for those, 30 for **snapshot_vm**, and one minute for the reads (**diagnose**
and **vm** get 20). While a change runs, the server sends your client a progress update every ten
seconds with the step it is on, so a long restart or snapshot shows activity.

**vm_lifecycle** and **set_vm_license** refuse to run on a pod that carries a lockout. A lockout is a
deliberate freeze, and the server cannot lift one.

## Resources and prompts

Besides tools, the server offers two other kinds of MCP content.

| Kind | Name | What it gives you |
|---|---|---|
| Resource | *fabric-studio://pods* | The pods you manage (host and name), without contacting them |
| Resource | *fabric-studio://pods/&lt;host&gt;/fabric* | The running fabric's VMs with firmware |
| Resource | *fabric-studio://pods/&lt;host&gt;/firmwares* | Every image the pod can install, marked local, remote or unusable |
| Prompt | *troubleshoot-failed-install* | *host* and optional **fabric**: runs **diagnose**, reads the failed task's log, explains the cause and changes nothing |
| Prompt | *snapshot-before-change* | *host*, **vm**: checks the VM is healthy, picks a snapshot kind and previews **snapshot_vm** |
| Prompt | *pod-health-check* | *host*: is this pod safe to build on right now |

A resource is data you attach to the conversation (in Claude Code, type **@**). A prompt is a ready-made
request you pick (in Claude Code, a slash command). Neither changes a pod.

## Local only

These change your registry on this machine and never touch a pod.

| Tool | What it does |
|---|---|
| **add_instance**, **remove_instance** | Start or stop managing a pod |
| **engage_lockout** | Freezes apply, provision and destroy on a pod or fabric, with a reason shown to whoever hits it |

The server has no tool to lift a lockout. That stays a deliberate step for the
person who set it.
