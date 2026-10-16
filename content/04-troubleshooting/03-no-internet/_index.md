---
title: "No Internet from a Device"
linkTitle: "No Internet / License Warning"
weight: 30
description: "A device can't reach the internet, or licenses then drifts to Warning: find which of route, DNS, or cabling is wrong"
---

## Symptoms

Any of these:

- FortiGate `License Status: Warning` (not `Valid`), or a license that was
  Valid after install and drifts later.
- FortiGuard / FortiCare / FortiFlex errors with an **empty** reason, such as
  `get license by token failed, reason:`.
- `execute ping update.fortiguard.net` returns `bad address`.
- A Linux guest can't `apt`/`dnf` install.

These look like licensing or FortiGuard outages. Almost always the device has
no route out, or no working DNS.

## Diagnose in this order

From the device CLI (FortiGate shown):

```text
execute ping <its own gateway>        # the gateway in Network Parameters
execute ping 8.8.8.8                  # routing out of the fabric
execute ping update.fortiguard.net    # DNS
get router info routing-table all     # where the default route actually points
get system dns                        # which resolver it actually uses
```

| Result | Meaning | Go to |
|---|---|---|
| Gateway fails | Port has no address, or is on the wrong switch | [Cause 1](#cause-1-the-port-has-no-address) |
| Gateway OK, 8.8.8.8 fails | Default route points at a network with no way out | [Cause 2](#cause-2-network-parameters-points-at-the-wrong-network) |
| 8.8.8.8 OK, hostname says `bad address` | DNS missing or unreachable | [Cause 3](#cause-3-dns) |

`ping` succeeding to the gateway proves very little. A fabric-internal gateway
answers even when nothing beyond it routes.

## Cause 1: the port has no address

The port is cabled to a switch with no **Assigned Network** (every switch you
add starts with none), or not cabled at all. Open the device, **Ports**, click
the port. If **Address** is empty, assign a network to the switch
(**Edit > Advanced > Assigned Network**) or set the address by hand. Then
**Apply changes**.

See [Addressing and Routing]({{% relref "/02-building-fabrics/03-networking" %}}).

## Cause 2: Network Parameters points at the wrong network

A device takes its default route and DNS from the one network named in
**Network Parameters**. It's set automatically by the **first data cable**
you add, which may not be your WAN. Typical case: port2 went to an isolated LAN
or a license segment, and port3 went to Internet Access.

Fabric Studio licenses the device through the management network first, then
**replaces** the default route with the Network Parameters gateway. So the
device licenses fine at install and loses the internet right after.

**Fix:** it depends on whether the device has a saved **Configuration**
(the column in the device table).

- **No saved configuration, or any LXC device:** open the device, **Network
  Parameters**, choose **Predefined** and the network that routes out (e.g.
  **Internet**), then reinstall that device (Runtime > Install). Gateway/DNS
  changes only reach a guest at install time.
- **A FortiGate (or other appliance) with a saved configuration:** changing
  Network Parameters does nothing, because the install restores the saved
  config and its route and DNS win. Fix the route and DNS inside FortiOS, e.g.:

  ```text
  config router static
      edit 1
          set gateway 203.0.113.254
          set device "port2"
      next
  end
  config system dns
      set primary 203.0.113.254
  end
  ```

  then **Config & License > Backup Config** (with *Update device settings* on)
  so the next install restores the fixed version. Also correct Network
  Parameters, so the setting is right if the config is ever detached.

See [Saving State]({{% relref "/02-building-fabrics/05-saving-state#what-fabric-studio-configures-by-itself-fortigate" %}})
for what an install does with and without a saved configuration.

## Cause 3: DNS

- Network Parameters DNS is empty (Custom mode with a blank field).
- The DNS server is only reachable on another network.
- **FortiManager / FortiAnalyzer:** a reinstall can leave
  `primary : 0.0.0.0` in `config system dns`, so names stop resolving while IP
  routing keeps working. A DNS fix made by hand on the appliance is lost at the
  next reinstall. Save it into the device's configuration
  (**Config & License > Backup Config**) so it's restored on install, and set
  the device's **Edit > License > Order of installation** to **After config**.
  Otherwise the license is activated before DNS exists.

## Also check

- **FortiManager / FortiAnalyzer with a `.lic` file:** the license is bound to
  a management IP. Fabric Studio assumes `10.0.0.1` unless the license has its
  address set, and then fails with `License Status: ip doesn't match`. Set the
  license's address from the Fabric Studio CLI:

  ```bash
  system license update <SERIAL> '{"mgmt_addr": "<license IP>"}'
  ```

  and reinstall the device. Step by step:
  [License "ip doesn't match"]({{% relref "/04-troubleshooting/05-license-ip-mismatch" %}}).
- **Is the device actually powered on?** A powered-off device looks exactly like
  one with no network.
