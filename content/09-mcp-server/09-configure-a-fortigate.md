---
title: "Configure a FortiGate with Claude"
linkTitle: "Configure a FortiGate"
weight: 90
description: "Ask Claude to look at and change the configuration inside a FortiGate of a built fabric, with a real before and after to approve and a read-back to prove it"
---

A fabric that is built is only the start. The **device** tool looks at and changes what is *inside* a FortiGate:
interfaces, routes, addresses, policies, DNS and the rest of its configuration. You name the device and say what
you want. Claude picks the section, shows you exactly what would change, and applies it once you approve.

You need a [pod registered]({{% relref "02-connect-a-pod" %}}) and a built fabric (see
[Build a Fabric]({{% relref "07-build-a-fabric" %}})). The FortiGate must be **powered on**, **licensed**, and
have its HTTPS and SSH access set to **public**.

{{% notice warning %}}
An unlicensed (evaluation) FortiGate does not accept API keys, so **device** cannot configure it. Give it a license
first (**set_vm_license**, mode *AUTO*, which reinstalls it). **device** tells you this in plain words when it
meets one; it does not silently fail.
{{% /notice %}}

## Look first

Reading never asks for approval and never changes anything.

```text
What firmware is fgt running on pod-a, and is it licensed?
```

```text
Show me the interfaces on fgt, and the firewall addresses.
```

**device** has four actions. *status* gives the firmware, hostname, license and HA mode. *config* reads one
section as structured data. *set* and *delete* are the two that change something.

*section* is a name such as *interfaces*, *routes*, *policies*, *addresses*, *dns*, *ntp* or *global*, or a
FortiOS path such as system/interface. Ask Claude "what sections can you read?" and it lists them. Passwords, keys
and pre-shared secrets are never returned: they show as hidden.

## Change something

```text
On fgt, add a firewall address called branch-lan for 10.80.0.0/24.
```

Claude calls **device** with *set*. Nothing is applied yet. The first answer is the **plan**: each field with its
real value on the device now, and the value it would have.

| Field | From | To |
|---|---|---|
| subnet | (new) | 10.80.0.0 255.255.255.0 |

When you say to go ahead, Claude calls it again with *confirm=true*. The server then asks **you** to approve that
plan, exactly as it does for a build: tick **Approve** (press Space), move to **Accept** and press Enter. The agent
cannot answer for you. Decline, Esc, or accepting without ticking **Approve** leaves the device untouched.

After it applies a change, the tool reads the object back from the device. The result says *verified*: whether
the FortiGate really holds what you asked. If it does not, Claude tells you, instead of reporting success.

Some things worth knowing about how values are written:

- A list of names is a table when FortiOS wants one (the members of an address group, the source addresses of a
  policy) and one string where it wants that (the allowed access of an interface). You say it the natural way.
- *true* and *false* mean enable and disable.
- Asking for what the device already has is a no-op: nothing is sent and you are not asked.
- Naming an object that does not exist creates it. Naming a field the section does not have is refused, with the
  fields it does have.

## Delete

```text
Remove the branch-lan address from fgt.
```

The plan shows the object that would go. A delete is read back too: *verified* means it is gone. FortiOS will not
delete an object that something else uses, and the error says so; remove the reference first.

## What it will not do

- **Administrator and API-user accounts.** They are what the tool signs in with, so changing them from here could
  lock it out. Use the device's own GUI for those.
- **A locked pod.** A lockout is a deliberate freeze. *set* and *delete* refuse, and the plan still shows.
- **Anything but a FortiGate, for now.** A FortiManager or FortiAnalyzer is refused by name.
- **Registration with FortiManager or FortiAnalyzer.** That is not part of **device** yet.

Some changes can cut the tool's own way in: an interface, a route, or the admin ports. The plan carries a warning
when a change touches one of those. The result is read back, but a lost route cannot be undone from here.

## How it signs in

You never give **device** a password. On first use of a FortiGate it creates a read-only API user called
fsmcp-ro on the device and keeps the key in your system keychain. A read-write user, fsmcp-rw, is created only
inside the first change you approve, and the plan says so. Looking at a device therefore never gives the tool the
power to change it.

The tool makes **one** login attempt. If the device refuses it, the tool says so and does not retry for two
minutes, because repeated failures lock the FortiGate's admin account for a while. A key the device no longer
accepts (after a reinstall, for example) is replaced once, automatically.

## If it does not work

| You see | What it means |
|---|---|
| "is an unlicensed (evaluation) FortiGate VM" | Give it a license with **set_vm_license**, then ask again. |
| "access is not PUBLIC" | Make the device's HTTPS and SSH access public on the pod (**set_vm_access_public**). |
| "is powered off" | A pod runs one fabric at a time, and the device's fabric is not the one running. |
| "is still booting" | Ask again in a minute. |
| "refused the login ... will not retry for 2 minutes" | The password Fabric Studio holds for the device no longer matches it (it was changed by hand). Fix it on the device, then ask again. |
| "holds the accounts this tool signs in with" | You asked to change an administrator or API user. Use the device's GUI. |
