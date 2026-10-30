---
title: "Things to Ask"
linkTitle: "Things to Ask"
weight: 60
description: "Plain-language requests that work with the Fabric Studio MCP server, grouped by what you are trying to do"
---

You don't call tools by name. Ask the way you would ask a colleague, and name the pod by the name
you gave it in [Connect a Pod]({{% relref "03-connect-a-pod" %}}). Each request below lists the tools
Claude reaches for, so you can tell what it is doing and what it can see.

## See what is going on

| Ask | Tools |
|---|---|
| *What's up on my Fabric Studio pods?* | `whats_up` |
| *Which pods are free to build on right now?* | `pods_health`, `list_lockouts` |
| *Where is the FortiGate called `edge1`?* | `find_device` |
| *Is anything installing on `pod-a`?* | `list_tasks` |
| *Can this machine reach my pods, and which forwards are blocked?* | `reach_matrix` |

`whats_up` lists only what is online, and says whether each pod is **locked**. A lockout freezes
`apply`, `provision` and `destroy` on a pod or fabric, so it is the quickest way to learn that a pod
is somebody's keeper before you build on it.

## Check an image before you install it

| Ask | Tools |
|---|---|
| *Which FortiGate images can `pod-a` install?* | `list_firmwares` |
| *Is FortiAnalyzer 7.6.4 on the pod already, or will it download?* | `list_firmwares` |
| *Why did my plan pick image 850?* | `list_firmwares` |

`list_firmwares` reads every repository, not just the home one, and marks each image:

- **local**: `ready` or `downloaded`. It installs at once.
- **remote**: in a repository but not on the pod. Fabric Studio downloads it when the device is
  installed, so the first install is slower and the pod needs internet access.
- **usable: false**: a **0-byte stub**. Never install one. See
  [Troubleshooting a Failed Install]({{% relref "08-troubleshoot-a-failed-install" %}}).

Image ids are specific to each pod, so look them up on the pod you are building on.

## Licensing

| Ask | Tools |
|---|---|
| *Is `pod-a` registered with FortiCloud, and what licenses does it hold?* | `licenses_overview`, `forticloud_status`, `fs_license_pool` |
| *Which license did Fabric Studio give `faz`, and does the device use it?* | `fs_license_assignment`, `validate_license_match` |
| *Read the license on my FortiSOAR.* | `read_guest_license` |

## Reach a device

| Ask | Tools |
|---|---|
| *How do I SSH and open the web UI of `fmg`?* | `vm_access` |
| *What's the default login for a FortiManager?* | `device_credentials_hint` |
| *Is the HTTPS forward of `fmg` actually answering?* | `vm_access` with a live probe |
| *Make `fgt` reachable over HTTPS from outside the pod.* | `set_vm_access_public` |

`vm_access` shows each access entry, its external port, and whether that port answers (an SSH banner,
or a TLS handshake). `set_vm_access_public` changes the pod, so it previews first and reinstalls the
guest only when you confirm.

## Look at a fabric

| Ask | Tools |
|---|---|
| *Show me the networks and switches in `fgt-fmg-faz`.* | `fabric_topology` |
| *How much CPU and memory is that fabric using?* | `fabric_resources` |
| *Give me everything about `fmg`: state, license, firmware, disks, access.* | `vm_detail` |
| *Does this fabric have DHCP and internet access?* | `system_host` |

## Build and install a fabric

Building a fabric from a topology file runs through the lab repo's `make plan` and `make apply`;
Claude runs those for you, then uses the tools above to watch and check the result. Start with
[Build a FortiGate, FortiManager and FortiAnalyzer Fabric]({{% relref "07-build-a-fabric" %}}).

## Protect a pod you care about

| Ask | Tools |
|---|---|
| *Freeze `pod-a` so nobody applies to it. Reason: demo on Thursday.* | `engage_lockout` |
| *Who locked `pod-b` and why?* | `list_lockouts` |

The server can engage a lockout but has no tool to lift one. Lifting stays a deliberate step by the
person who set it.

{{% notice tip %}}
When a request changes a pod, ask Claude to **show you the preview first**. Every changing tool
reports what it would do until it is told to go ahead, and several reinstall the guest by default.
{{% /notice %}}
