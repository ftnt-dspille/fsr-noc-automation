---
title: "Custom Ports"
linkTitle: "Custom Ports"
weight: 30
description: "Expose an app on a non-standard port with a System Host port redirect"
---

## Overview

[VM Access]({{% relref "/06-handy-commands/02-vm-access" %}}) covers the well-known
protocols — SSH, HTTP, HTTPS, RDP and the consoles. But if your app listens on
something else (8080, 9200, 5432, …), a VM access entry won't help: there's no
access type for it.

That case is a different mechanism entirely — a **port redirect** on the fabric's
System Host, which acts as the fabric's router and NAT. It forwards an external
port on the pod straight to an IP and port inside the fabric.

| | VM access | Port redirect |
|---|---|---|
| **For** | SSH / HTTP / HTTPS / RDP / consoles | Any port |
| **Attached to** | A VM | The fabric's System Host |
| **Targets** | The VM it belongs to | Any IP:port in the fabric |
| **External port** | Chosen by FS (base + index) | **You choose it** |
| **Command** | `model vm access …` | `model port redirect …` |
| **Gate** | `{ssh,http,https,rdp}_public_allowed` | `custom_rules_allowed` |

---

## Step 1 — Check the pod-wide gate

Custom redirects are gated pod-wide by `custom_rules_allowed`:

```bash
(cmm-master-fs-001) # system security preferences get
console="vnc_public_allowed='yes' spice_public_allowed='yes' public_password='required'" ... ssh_public_allowed='yes' rdp_public_allowed='no' http_public_allowed='yes' https_public_allowed='yes' custom_rules_allowed='no' web_session_age=14700 cli_session_timeout=900
```

Here it's `no`. Enable it:

```bash
(cmm-master-fs-001) # system security preferences set '{"custom_rules_allowed": "yes"}'
```

{{% notice warning %}}
**The gate is not enforced when you create the rule.** With
`custom_rules_allowed='no'`, `model port redirect create` still returns success
and the rule appears in every listing — Fabric Studio just never installs it, so
nothing listens. Check this flag *first*; a created-but-dead rule looks identical
to a working one in the CLI output.
{{% /notice %}}

---

## Step 2 — Find the System Host ID

A redirect attaches to the **System Host of your fabric**, and each fabric has its
own. Get your fabric's:

```bash
(cmm-master-fs-001) # model fabric host detail 5
36 System Host [host] (HOST)
```

Fabric 5's System Host is **36** — that's the `device` value in the JSON below.

{{% notice tip %}}
`model host list` shows every System Host on the pod (one per fabric) with no
indication of which fabric each belongs to. Use `model fabric host detail
<FABRIC_ID>` so you get the right one.
{{% /notice %}}

---

## Step 3 — Find the target IP

The redirect targets an IP **inside** the fabric, so you need the guest's address.
Ports are listed by device — note the filter key is `device`, not `vm`:

```bash
(cmm-master-fs-001) # model vm port list --select "device=41"
321 lxc000.eth0 (@10.254.254.2/24) -> oobsw.port3
322 lxc000.eth1 (@None)
323 lxc000.eth2 (@None)
```

`lxc1` is at **10.254.254.2** on `eth0`. Ports showing `(@None)` have no address
and can't be a redirect target.

---

## Step 4 — Create the redirect

As with VM access, the argument is a **JSON object**:

```bash
(cmm-master-fs-001) # model port redirect create '{"device": 36, "name": "lxc1_app", "from_port": 8080, "to_addr": "10.254.254.2", "to_port": 8080, "socktype": "TCP", "snat": true, "enabled": true}'
13 lxc1_app 8080->10.254.254.2:8080
```

### Fields

| Field | Meaning |
|---|---|
| `device` | The **System Host** model ID from Step 2 — not the VM ID |
| `name` | A label for the rule; make it identifiable |
| `from_port` | The **external** port on the pod. Must be unique pod-wide |
| `to_addr` | The guest's IP inside the fabric (Step 3) |
| `to_port` | The port the app listens on inside the guest |
| `socktype` | `TCP` or `UDP` |
| `snat` | Source-NAT the traffic to the System Host's address |
| `enabled` | `true` to activate the rule |

`from_port` and `to_port` don't have to match — `{"from_port": 9122, "to_port": 22}`
is a perfectly good way to publish SSH on a custom external port.

{{% notice warning %}}
**`from_port` must be unique across the whole pod**, not just your fabric. It also
must not collide with the ranges Fabric Studio allocates for VM access
(11000–17999) or with port 22, which the pod's own SSH uses.
{{% /notice %}}

---

## Step 5 — Review existing redirects

List them before choosing an external port — this is how you spot a collision:

```bash
(cmm-master-fs-001) # model port redirect list
1 EDR 8081->10.100.88.20:8081
2 EMS_TCP-8013 8013->10.100.88.5:8013
3 EMS_TCP-8014 8014->10.100.88.5:8014
4 FGT_Core_UDP-4500 4500->172.16.0.1:4500
5 FGT_Core_UDP-500 500->172.16.0.1:500
8 SSH_Attacker 9122->192.168.0.4:22
9 rdp_bankdc 3390->10.100.55.104:3389
12 FortiMail 25->10.100.88.4:25
```

Read each row as **ID**, name, then `external->target:port`. Note `SSH_Attacker`
publishing guest port 22 on external 9122, and `rdp_bankdc` mapping 3390 to a
guest's 3389 — both examples of custom external ports.

Scope the list to one fabric:

```bash
(cmm-master-fs-001) # model fabric host port redirect list 5
```

Empty output means that fabric has no redirects.

One rule's detail:

```bash
(cmm-master-fs-001) # model port redirect detail 13
13 lxc1_app 8080->10.254.254.2:8080
```

---

## Step 6 — Apply the change

Like VM access, creating a redirect only edits the model. The rule has to be
installed on the System Host before anything listens.

{{% notice warning %}}
**Do not reach for `model host sync`.** Syncing the System Host tears down **every
port forward on the pod** — including other fabrics' — and they only return after
a full fabric install. On a shared pod that's disruptive to everyone.
{{% /notice %}}

Apply redirects from the Fabric Studio UI, the same way you'd sync any other
fabric change, and confirm the rule is live by connecting to
`<pod-host>:<from_port>`.

---

## Deleting a redirect

Takes the **rule ID** from `model port redirect list`, and `--yes` to skip the
confirmation prompt (without it the command blocks forever over a non-interactive
SSH session):

```bash
(cmm-master-fs-001) # model port redirect delete 13 --yes
13 lxc1_app 8080->10.254.254.2:8080
```

---

## Troubleshooting

| Symptom | Cause |
|---|---|
| Rule created, nothing listening | `custom_rules_allowed='no'` — the rule was accepted but never installed. |
| `Expecting value: line 1 column 1 (char 0)` | You passed `key='value'` instead of JSON. |
| Rule created against the wrong fabric | `device` was another fabric's System Host. Use `model fabric host detail <FABRIC_ID>`. |
| Connection refused on `from_port` | The external port collides with an existing rule or an FS-allocated range. Check `model port redirect list`. |
| `delete` hangs forever | Missing `--yes`; it's waiting on a confirm prompt. |
| Traffic reaches the fabric but not the app | `to_addr` has no address (`@None`) or the app isn't bound to that interface. |
