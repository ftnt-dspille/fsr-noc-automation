---
title: "Fabric Studio Footguns"
linkTitle: "Fabric Studio Footguns"
weight: 40
description: "Buttons, defaults, and behaviors in Fabric Studio that do more, or less, than they appear to"
---

Each of these has cost someone a working lab. They're quick to avoid once you
know them.

## Changes made inside a device aren't saved anywhere

FortiOS config, Linux packages, anything you set up *inside* a device lives
only in its VM. Every reinstall (▶ Install, Runtime > Install, an Apply row left
on Install, switching fabrics) rebuilds the device from firmware plus its saved
**Configuration**. If that column is empty, the work is gone. Back up with
**Config & License > Backup Config** and **Update device settings** on.
[Details]({{% relref "/02-building-fabrics/05-saving-state" %}}).

## A saved config overrides the model

Once a device has a saved **Configuration**, installs restore that file and
skip Fabric Studio's own port, gateway and DNS setup. Edit a port address in
the model, reinstall, and FortiOS still has the old address. Make the change
inside the device and back up again, or detach the configuration first.
[Details]({{% relref "/02-building-fabrics/05-saving-state#what-fabric-studio-configures-by-itself-fortigate" %}}).

## Runtime > Install doesn't ask for confirmation

Right-click a device, **Runtime > Install**, and it starts reinstalling
immediately. Back up first.

## ▶ Install on a running fabric reinstalls everything

The fabric's **Install** button is for first bring-up. On a running fabric it
redeploys **every** device from firmware, and unsaved guest state is gone. To
push a change, use **⚡ Apply changes**.
[Details]({{% relref "/02-building-fabrics/04-apply-install-sync" %}}).

## Apply changes defaults every row to Install

Including switches you only plugged a cable into. Set switches to **Sync**,
and new devices to **Install**, before clicking Apply.

## Sync doesn't configure a new port inside the device

Cable a running FortiGate to a new switch, sync it, and the cable is up with
the address recorded in Fabric Studio, but FortiOS has no IP on that port.
Fabric Studio only writes interface addresses during an install, and never
writes firewall policy. Configure the port (and a policy) in FortiOS.
[Details]({{% relref "/02-building-fabrics/03-networking#step-5-configure-fortios-fabric-studio-wont" %}}).

## The System Host is hidden

Every fabric's exit to the internet is the System Host (the Fabric Studio
NIC), but it's hidden in the topology by default, so the path out looks like
it ends at the ISP Router. Show it with the **Layout** button (top right).
[Details]({{% relref "/02-building-fabrics/01-anatomy#show-the-system-host-the-layout-button" %}}).

## Cabling order decides addresses

Switch ports hand out addresses from `.1` upwards, in the order you cable. If
your LAN network's gateway is `.1`, cable the FortiGate first, or a client
takes the gateway address.

## Installing a fabric stops the one that's running

One fabric runs at a time. Installing another fabric uninstalls the running
fabric's VMs first. Its model survives, so it still looks complete in the
workspace, but its devices are gone.

## A new switch has no network

Devices cabled to a switch you added get no address until the switch has an
**Assigned Network** (Edit > Advanced).
[Details]({{% relref "/02-building-fabrics/03-networking" %}}).

## The first data cable decides the default route

A device's gateway and DNS come from **Network Parameters**, which is set by
the first non-management cable you add. A device on several switches still
gets only one default route, from that network. Cable the WAN first, or fix
Network Parameters afterwards.
[Details]({{% relref "/04-troubleshooting/03-no-internet" %}}).

## Gateway / DNS edits don't reach running devices

They're written into the guest at install time. Sync isn't enough. Reinstall
the device (after backing up its configuration).

## VLAN edits don't take effect until the switch is reinstalled

Sync updates the switch's settings, but the old VLANs keep forwarding. Use
Runtime > Install on the switch. This does not reinstall the devices on it.

## "Admin & Guest" access is not reachable from outside

A device access set to **Admin & Guest** (`PRIVATE`, the default) is not a
public port:

- **SSH**: only through the Fabric Studio SSH web console. The port forward is disabled.
- **HTTPS**: the reverse-proxy port only answers while you're logged in to the
  Fabric Studio web UI.
- **HTTP**: only from another device inside the fabric.

For direct access from your own tools, set the access to **Any** (`PUBLIC`)
*and* allow it globally in **System > Settings**.
[Details]({{% relref "/04-troubleshooting/01-device-access" %}}).

## Logs and the Details tab show passwords

The **Apply changes > Details** tab and device install logs show device
passwords in plain text. Don't screenshot or paste them into tickets or chats.

## Templates skip the password policy

Fabrics created from a template keep whatever passwords the template shipped
with. Check them before exposing a Fabric Studio to the internet.
