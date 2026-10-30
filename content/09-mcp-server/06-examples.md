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
| *What's up on my Fabric Studio pods?* | `pods` (view `online`) |
| *Which pods are free to build on right now?* | `pods` (view `health`), `pods` (view `lockouts`) |
| *Where is the FortiGate called `edge1`?* | `pods` (view `find`) |
| *Is anything installing on `pod-a`?* | `tasks` |
| *Can this machine reach my pods, and which forwards are blocked?* | `pods` (view `reach`) |

`pods` (view `online`) lists only what is online, and says whether each pod is **locked**. A lockout freezes
`apply`, `provision` and `destroy` on a pod or fabric, so it is the quickest way to learn that a pod
is somebody's keeper before you build on it.

## Check an image before you install it

| Ask | Tools |
|---|---|
| *Which FortiGate images can `pod-a` install?* | `pods` (view `firmwares`) |
| *Is FortiAnalyzer 7.6.4 on the pod already, or will it download?* | `pods` (view `firmwares`) |
| *Why did my plan pick image 850?* | `pods` (view `firmwares`) |

`pods` (view `firmwares`) reads every repository, not just the home one, and marks each image:

- **local**: `ready` or `downloaded`. It installs at once.
- **remote**: in a repository but not on the pod. Fabric Studio downloads it when the device is
  installed, so the first install is slower and the pod needs internet access.
- **usable: false**: a **0-byte stub**. Never install one. See
  [Troubleshooting a Failed Install]({{% relref "08-troubleshoot-a-failed-install" %}}).

Image ids are specific to each pod, so look them up on the pod you are building on.

## Licensing

| Ask | Tools |
|---|---|
| *Is `pod-a` registered with FortiCloud, and what licenses does it hold?* | `pods` (view `licenses`), `pods` (view `licenses`), `pods` (view `licenses`) |
| *Which license did Fabric Studio give `faz`, and does the device use it?* | `vm` (include `license`), `vm` (include `license_match`) |
| *Read the license on my FortiSOAR.* | `vm` (include `guest_license`) |

## Reach a device

| Ask | Tools |
|---|---|
| *How do I SSH and open the web UI of `fmg`?* | `vm` (include `access`) |
| *What's the default login for a FortiManager?* | `vm` (include `credentials`) |
| *Is the HTTPS forward of `fmg` actually answering?* | `vm` (include `access`) with a live probe |
| *Make `fgt` reachable over HTTPS from outside the pod.* | `set_vm_access_public` |

`vm` (include `access`) shows each access entry, its external port, and whether that port answers (an SSH banner,
or a TLS handshake). `set_vm_access_public` changes the pod, so it previews first and reinstalls the
guest only when you confirm.

## Look at a fabric

| Ask | Tools |
|---|---|
| *Show me the networks and switches in `fgt-fmg-faz`.* | `fabric` (include `topology`) |
| *How much CPU and memory is that fabric using?* | `fabric` (include `resources`) |
| *Give me everything about `fmg`: state, license, firmware, disks, access.* | `vm` (include `detail`) |
| *Does this fabric have DHCP and internet access?* | `fabric` (include `system_host`) |

## Build and install a fabric

Building a fabric from a topology file runs through the lab repo's `make plan` and `make apply`;
Claude runs those for you, then uses the tools above to watch and check the result. Start with
[Build a FortiGate, FortiManager and FortiAnalyzer Fabric]({{% relref "07-build-a-fabric" %}}).

## Protect a pod you care about

| Ask | Tools |
|---|---|
| *Freeze `pod-a` so nobody applies to it. Reason: demo on Thursday.* | `engage_lockout` |
| *Who locked `pod-b` and why?* | `pods` (view `lockouts`) |

The server can engage a lockout but has no tool to lift one. Lifting stays a deliberate step by the
person who set it.

{{% notice tip %}}
When a request changes a pod, ask Claude to **show you the preview first**. Every changing tool
reports what it would do until it is told to go ahead, and several reinstall the guest by default.
{{% /notice %}}
