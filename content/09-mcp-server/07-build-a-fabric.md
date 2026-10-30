---
title: "Build a FortiGate, FortiManager and FortiAnalyzer Fabric"
linkTitle: "Build a Fabric"
weight: 70
description: "Install a FortiGate, FortiManager and FortiAnalyzer fabric on a Fabric Studio pod with Claude, check it came up, and see what to change for other layouts"
---

This walks one fabric from nothing to three running devices, then shows two variations. Every step
here was run on a real pod. The install took under five minutes with the images already on the pod.

You need the lab repository (`fabric_studio_terraform`) checked out, the MCP server
[registered with Claude]({{% relref "02-connect-claude" %}}), and a
[pod registered]({{% relref "03-connect-a-pod" %}}). Building a fabric uses the repository's
`make` targets; Claude runs them, and the MCP tools are how it checks its own work.

The fabric is `examples/fabrics/fgt_fmg_faz`: one FortiGate, one FortiManager and one FortiAnalyzer
on a management network, installed **unlicensed**.

```text
fgt (10.254.254.30) ──┐
fmg (10.254.254.40) ──┼── OOB Mgmt 10.254.254.0/24 ── the Fabric Studio host (port-forwards)
faz (10.254.254.50) ──┘
```

## 1. Choose images that will install

Ask Claude: *"Which FortiGate, FortiManager and FortiAnalyzer 7.6.4 images can `pod-a` install?"*
It calls `pods` (view `firmwares`) for each type. Image ids belong to one pod, so never copy them from another.

Read each row for two things:

- **local or remote.** A remote image downloads on first install (slower, and the pod needs internet).
- **usable.** A `usable: false` row is a 0-byte stub. Skip it.

On the test pod the same release appeared twice: a stub in the home repository and a working copy in
the `fortinet` repository. Only the second installs.

| Type | Stub (skip) | Working copy (use) |
|---|---|---|
| FortiGate 7.6.4F | home repository, size 0 | `fortinet` repository, local |
| FortiManager 7.6.4F | home repository, size 0 | `fortinet` repository, local |
| FortiAnalyzer 7.6.4F | none | `fortinet` repository, local |

The topology takes these as `fgt_image`, `fmg_image` and `faz_image`. Override them with
`--var fgt_image=<id>`, or put them in a `<pod>.fabricvars` file next to the topology.

## 2. Check the topology and the plan

```bash
make validate POD=<pod> TOPO=examples/fabrics/fgt_fmg_faz
make plan     POD=<pod> TOPO=examples/fabrics/fgt_fmg_faz
```

`validate` needs no pod. `plan` reads the pod and changes nothing. For this fabric it reports
`Plan: 15 to create`: the fabric, two networks, two switches, three nodes, six links and one boot.

{{% notice note %}}
`plan` may warn that the switches are "not host-uplinked". On a fabric that does not exist yet that
is expected: the check reads live state. After the install, `fabric` (include `system_host`) shows both switches
uplinked, which is what you want.
{{% /notice %}}

## 3. Know what you will stop

**A pod runs one fabric at a time.** Applying a new fabric stops the one that is running. Its model
stays, so you can bring it back, but its devices go down. Ask first:

*"What's running on `pod-a`, and is it locked?"* (`pods` (view `online`), `pods` (view `lockouts`))

If a lockout is set, `apply` refuses by design. Don't lift it to get past it; ask whoever set it.

## 4. Apply

```bash
make apply POD=<pod> TOPO=examples/fabrics/fgt_fmg_faz
```

The three devices install in parallel, then a provision step puts an SSH key and an API key on each.
The run ends with:

```text
converged ✓
...
config ✓
```

Everything the run prints is saved to `.logs/apply-<pod>.log`. While it runs, ask Claude
*"What is installing on `pod-a`?"* (`tasks`).

## 5. Check it came up

Ask: *"Is the `fgt-fmg-faz` fabric up on `pod-a`, and can I reach each device?"*

Claude calls `pods` (view `online`) and then `vm` (include `access`) for each device. On the test pod:

| Device | SSH | HTTPS | Answers |
|---|---|---|---|
| fgt | `<pod>:11000` | `<pod>:13000` | SSH banner, TLS 1.3 |
| fmg | `<pod>:11001` | `<pod>:13001` | SSH banner, TLS 1.3 |
| faz | `<pod>:11002` | `<pod>:13002` | SSH banner, TLS 1.3 |

`pods` (view `licenses`) shows each device in license mode `NONE`, which is what an unlicensed install
should show.

To log in, ask *"How do I log in to `fmg`?"*. `vm` (include `credentials`) gives the user, where the
password comes from, and the exact `fabric ssh` command. It never returns the password. Use that
command rather than a hand-written `ssh`: repeated wrong prompts can lock the FortiOS admin out.

## 6. Optional: internet access from the devices

A new fabric's System Host is not installed, so the devices have no NAT or DHCP service. That is fine
for static addresses and an unlicensed install. If a device needs the internet (FortiGuard, firmware
checks, licensing), ask *"Does this fabric have internet access?"*. `fabric` (include `system_host`) reports
`installed: false`. *"Install the System Host."* then previews, and runs only when you confirm. It
drops and rebuilds each guest's port forwards as part of the install.

## Two variations

Both install the same way (`make apply POD=<pod> TOPO=examples/fabrics/<name>`), and both were built
and checked on a real pod. Applying either one stops whichever fabric was running.

### Two managed branches: `branch_pair_managed`

Two FortiGates (`branch1`, `branch2`) joined by a `Transit` network (10.10.10.0/24, ports `port3`),
plus the FortiManager and FortiAnalyzer from the first fabric. Four devices; it converged in about
five minutes. The transit link is only cabled: routing and policy between the branches are
configuration you add afterwards.

### One manager, two firmware trains: `mixed_versions`

A FortiGate on 7.4.11 (`fgt74`) and one on 7.6.4F (`fgt76`) under one FortiManager and
FortiAnalyzer on 7.6.4F. A FortiManager ADOM is pinned to one OS version, so a mixed estate needs an
ADOM per train; this fabric gives you that to practise on. Keep the manager at or above the newest
FortiGate: a manager may run ahead of its devices, never behind.

After the install, `vm` (include `detail`) shows the firmware each FortiGate runs, so you can confirm the two
trains are really different:

```text
fgt74  firmware 811   (7.4.11)
fgt76  firmware 234   (7.6.4F)
```

The 7.4.11 image is usually `remote` on a pod. The first apply downloads it, and the install still
took about five minutes. If it cannot download, the pod has no internet access: see
[Troubleshooting a Failed Install]({{% relref "08-troubleshoot-a-failed-install" %}}).

## Make your own

Copy one of the three directories under `examples/fabrics/`, rename the `fabric:` and the nodes, and
change what you need. Ask Claude to do it: *"Copy `fgt_fmg_faz` to a fabric called `lab2` with two
FortiGates"*. Then `validate`, `plan` and `apply` as above. Keep each node's addresses unique within
the network, and give FortiManager and FortiAnalyzer at least 4 vCPU and 8192 MiB of memory.

## Licensing

These devices are unlicensed: the API, CLI and GUI work, no FortiFlex points are spent and no pooled
license is used. To license them, change `license: "none"` in the topology to a FortiFlex source:
`license: {mode: auto, flex_config: <id or name>}`. A bare `license: auto` on a FortiManager or
FortiAnalyzer fails at install with `No license for fmg000 (LIC,FLEX)`. See
[Troubleshooting a Failed Install]({{% relref "08-troubleshoot-a-failed-install" %}}).
