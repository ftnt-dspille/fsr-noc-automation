---
title: "FMG Provisioning Ladder"
linkTitle: "Provisioning Ladder"
weight: 45
description: "Build FortiGate configuration step by step through FortiManager — create address objects, firewall policies, install to devices, and verify on the live FortiGate."
tags: ["hands-on", "knowledge"]
---

## Why this use case?

The firmware-upgrade chapter taught you how to *act on* a FortiGate through FortiManager. This chapter teaches you how to *configure* one — the core of what FortiManager is for.

FortiManager's provisioning model has four layers, and we'll climb them one rung at a time:

1. **Address objects** — the building blocks (IP addresses, subnets, FQDNs)
2. **Firewall policies** — the rules that reference those objects
3. **Install** — push the configuration from FMG's database to the actual FortiGate
4. **Verify** — read back the live config from the FortiGate to confirm it landed

Each rung uses the same FortiManager JSON RPC connector you configured in [FMG API in SOAR](/chapter-02-ftnt-apis/40-fmg-api-in-soar). The pattern is always the same — pick the right JSON-RPC method (`add`, `get`, `execute`, `set`) and the right URL path.

---

## Prerequisites

- The **FortiManager JSON RPC** connector configured and health-checked
- A FortiGate managed by FortiManager in the `root` ADOM
- Completed the [FMG API guide](/chapter-02-ftnt-apis/20-fmg-api) and [FMG API in SOAR](/chapter-02-ftnt-apis/40-fmg-api-in-soar)

---

## The ladder at a glance

```
Rung 1: Create Address Object    →  json_rpc_add   /pm/config/adom/root/obj/firewall/address
Rung 2: Create Firewall Policy    →  json_rpc_add   /pm/config/adom/root/pkg/default/firewall/policy
Rung 3: Install to Device         →  json_rpc_exec  /securityconsole/install/package
Rung 4: Verify on Device          →  json_rpc_exec  /sys/proxy/json → /api/v2/cmdb/firewall/policy
```

{{% notice info %}}
Each rung is a separate playbook step (or separate playbook). Build them one at a time, verify each works, then chain them together. This is how you decompose a complex provisioning task into testable pieces.
{{% /notice %}}

---

## Rung 1: Create an address object

Address objects are the named IP entries that firewall policies reference. Instead of hardcoding `10.200.1.50` in every policy, you create a named object once and reference it by name.

### Create the playbook

1. Create a new collection called `01 - FMG Provisioning`.
2. Create a new playbook called `Create Address Object`.
3. Add a **Referenced** trigger step.
4. Drag a **Connector** step:

| Field | Value |
|-------|-------|
| **Step Name** | `Create Address Object` |
| **Action** | `JSON RPC Add` |
| **URL** | `/pm/config/adom/root/obj/firewall/address` |
| **Data** | *(see below)* |

```json
{
  "name": "ws-workshop-server",
  "type": "ipmask",
  "subnet": ["10.200.1.50", "255.255.255.255"],
  "comment": "Workshop provisioning ladder demo"
}
```

### Run it

Trigger the playbook. The response confirms the object was created:

```json
{
  "add_response": {
    "status": {
      "code": 0,
      "message": "OK"
    },
    "url": "/pm/config/adom/root/obj/firewall/address"
  }
}
```

{{% notice note %}}
If the object already exists, you'll get `code: -2` with message `"Object already exists"`. This is expected if you run the playbook twice — FMG won't create a duplicate. Use `JSON RPC Set` to modify an existing object.
{{% /notice %}}

### Verify it

Add a second step to read back the object:

| Field | Value |
|-------|-------|
| **Action** | `JSON RPC Get` |
| **URL** | `/pm/config/adom/root/obj/firewall/address/ws-workshop-server` |
| **Data** | *(empty)* |

The response contains the full object:

```json
{
  "name": "ws-workshop-server",
  "type": "ipmask",
  "subnet": ["10.200.1.50", "255.255.255.255"],
  "comment": "Workshop provisioning ladder demo",
  "associated-interface": ["any"]
}
```

### Verify

> **Verify:** The `add_response` shows `code: 0` and the `get_response` contains your object with the correct name, type, and subnet.

---

## Rung 2: Create a firewall policy

Now create a firewall policy that references the address object. Policies live inside policy packages — we'll use the `default` package that ships with every ADOM.

### Create the playbook

Add a **Connector** step:

| Field | Value |
|-------|-------|
| **Step Name** | `Create Firewall Policy` |
| **Action** | `JSON RPC Add` |
| **URL** | `/pm/config/adom/root/pkg/default/firewall/policy` |
| **Data** | *(see below)* |

```json
{
  "name": "ws-workshop-allow",
  "srcintf": ["port1"],
  "dstintf": ["port2"],
  "srcaddr": ["all"],
  "dstaddr": ["ws-workshop-server"],
  "action": "accept",
  "schedule": "always",
  "service": ["ALL"],
  "nat": "disable",
  "logtraffic": "utm"
}
```

{{% notice warning %}}
The `srcintf` and `dstintf` fields are **required** — FMG will reject the policy without them. Use the interface names on your FortiGate (e.g., `port1`, `port2`). You can discover them via `/sys/proxy/json` → `GET /api/v2/cmdb/system/interface` (same proxy pattern as the [firmware upgrade chapter](/chapter-02-ftnt-apis/50-firmware-upgrade)).
{{% /notice %}}

The `dstaddr` references the address object by name (`ws-workshop-server`) — the same name you created in Rung 1. This is how objects and policies connect.

### Run it

The response confirms the policy was created:

```json
{
  "add_response": {
    "status": {
      "code": 0,
      "message": "OK"
    },
    "url": "/pm/config/adom/root/pkg/default/firewall/policy"
  }
}
```

### Verify it

Read back the policies in the `default` package:

| Field | Value |
|-------|-------|
| **Action** | `JSON RPC Get` |
| **URL** | `/pm/config/adom/root/pkg/default/firewall/policy` |
| **Data** | *(empty)* |

Find your policy in the list:

```json
{
  "policyid": 32,
  "name": "ws-workshop-allow",
  "srcintf": ["port1"],
  "dstintf": ["port2"],
  "srcaddr": ["all"],
  "dstaddr": ["ws-workshop-server"],
  "action": "accept",
  "schedule": "always",
  "service": ["ALL"]
}
```

### Verify

> **Verify:** The policy appears in the `get_response` with the correct name, interfaces, addresses, and action.

---

## Rung 3: Install the policy to a device

Right now the address object and policy exist only in FortiManager's database — the FortiGate doesn't know about them yet. The **install** step pushes FMG's configuration to the device.

### Create the playbook

Add a **Connector** step:

| Field | Value |
|-------|-------|
| **Step Name** | `Install Policy` |
| **Action** | `JSON RPC Exec` |
| **URL** | `/securityconsole/install/package` |
| **Data** | *(see below)* |
| **Track Task** | True |

```json
{
  "adom": "root",
  "pkg": "default",
  "flags": ["nonblocking"],
  "scope": [
    {
      "name": "fgt-2",
      "vdom": "root"
    }
  ]
}
```

### What Track Task does

Unlike the firmware upgrade (which is fire-and-forget), the policy install **creates a FortiManager task** that you can track. With `Track Task: True`, the connector waits for the task to complete and returns the full task result:

```json
{
  "execute_response": {
    "task": 430
  },
  "task_response": {
    "id": 430,
    "line": [
      {
        "detail": "No installing devices",
        "percent": 100,
        "state": "warning",
        "err": 0
      }
    ]
  }
}
```

{{% notice warning %}}
**"No installing devices"** means the target device (`fgt-2`) is not assigned to the `default` policy package. FortiManager only installs to devices that are in the package's scope. To assign a device to a package, use the FortiManager UI (**Device Manager → select device → Assign Package**) or the DVM API.

When a device IS assigned and has pending config changes, the task shows `state: "success"` and `percent: 100` with `detail: "installation completed"`.
{{% /notice %}}

### Verify

> **Verify:** The `execute_response` contains a `task` ID and the `task_response` shows `percent: 100`. If you see "No installing devices", assign the device to the package in FortiManager and re-run.

---

## Rung 4: Verify the config on the FortiGate

The final rung reads the live configuration directly from the FortiGate via the `/sys/proxy/json` proxy — the same pattern from the [firmware upgrade chapter](/chapter-02-ftnt-apis/50-firmware-upgrade), but reading firewall policies instead of firmware.

### Create the playbook

Add a **Connector** step:

| Field | Value |
|-------|-------|
| **Step Name** | `Verify Policy on Device` |
| **Action** | `JSON RPC Exec` |
| **URL** | `/sys/proxy/json` |
| **Data** | *(see below)* |

```json
{
  "action": "get",
  "resource": "/api/v2/cmdb/firewall/policy",
  "target": ["adom/root/device/fgt-2"]
}
```

### What you'll see

The response contains the policies as they exist on the actual FortiGate:

```json
{
  "execute_response": [
    {
      "response": {
        "status": "success",
        "http_status": 200,
        "results": [
          {
            "policyid": 1,
            "name": "Block All Traffic to Threat Feed",
            "action": "deny"
          },
          {
            "policyid": 2,
            "name": "Block All Traffic from Threat Feed",
            "action": "deny"
          }
        ]
      }
    }
  ]
}
```

If your `ws-workshop-allow` policy was successfully installed (Rung 3), it appears in this list. If it doesn't appear, the install didn't reach the device — check the package assignment from Rung 3.

### Verify

> **Verify:** The response shows `status: "success"` and `http_status: 200`. Your workshop policy appears in the results list if the install succeeded.

---

## Put it all together

Here's the complete provisioning flow:

```
Rung 1: json_rpc_add    /pm/config/adom/root/obj/firewall/address      → creates the address object
Rung 2: json_rpc_add    /pm/config/adom/root/pkg/default/firewall/policy → creates the policy
Rung 3: json_rpc_exec   /securityconsole/install/package                → pushes config to the FortiGate
Rung 4: json_rpc_exec   /sys/proxy/json → /api/v2/cmdb/firewall/policy   → reads back the live config
```

### The JSON-RPC method cheat sheet

| Method | FMG operation | When to use |
|--------|---------------|-------------|
| `json_rpc_get` | Read existing config | Verify objects, policies, device state |
| `json_rpc_add` | Create new objects | Add address objects, policies, scripts |
| `json_rpc_set` | Modify existing objects | Change a field on an existing object |
| `json_rpc_execute` | Run an action | Install packages, proxy to devices, run scripts |
| `json_rpc_delete` | Remove objects | Delete address objects, policies |

### The URL pattern cheat sheet

| URL pattern | What it manages |
|-------------|----------------|
| `/pm/config/adom/<adom>/obj/firewall/address` | ADOM-level address objects |
| `/pm/config/adom/<adom>/pkg/<pkg>/firewall/policy` | Policies in a policy package |
| `/securityconsole/install/package` | Install a package to devices |
| `/securityconsole/install/device` | Install device-level config |
| `/sys/proxy/json` | Proxy REST calls to a managed FortiGate |
| `/dvmdb/adom/<adom>/device` | Device database (list, authorize) |

---

## The complete YAML playbook

{{% expand "Click to view the provisioning ladder YAML" %}}

```yaml
collection: FMG Provisioning Ladder
description: Create an address object and firewall policy in FortiManager, install to a device, and verify.
visible: true

playbooks:
  - name: FMG Provision - Address and Policy
    is_active: true
    parameters: [device_name, adom]
    steps:
      - name: Start
        type: start
        next: Set Variables

      - name: Set Variables
        type: set_variable
        next: Create Address Object
        vars:
          device_name: "{{ vars.input.params.device_name | default('fgt-2') }}"
          adom: "{{ vars.input.params.adom | default('root') }}"

      - name: Create Address Object
        type: connector
        connector: fortinet-fortimanager-json-rpc
        operation: json_rpc_add
        config: "fortimanager-lab"
        params:
          url: "/pm/config/adom/{{ vars.adom }}/obj/firewall/address"
          data: '{"name": "ws-workshop-server", "type": "ipmask", "subnet": ["10.200.1.50", "255.255.255.255"], "comment": "Workshop demo"}'
        next: Create Firewall Policy

      - name: Create Firewall Policy
        type: connector
        connector: fortinet-fortimanager-json-rpc
        operation: json_rpc_add
        config: "fortimanager-lab"
        params:
          url: "/pm/config/adom/{{ vars.adom }}/pkg/default/firewall/policy"
          data: '{"name": "ws-workshop-allow", "srcintf": ["port1"], "dstintf": ["port2"], "srcaddr": ["all"], "dstaddr": ["ws-workshop-server"], "action": "accept", "schedule": "always", "service": ["ALL"], "nat": "disable", "logtraffic": "utm"}'
        next: Install Policy

      - name: Install Policy
        type: connector
        connector: fortinet-fortimanager-json-rpc
        operation: json_rpc_execute
        config: "fortimanager-lab"
        params:
          url: "/securityconsole/install/package"
          data: '{"adom": "{{ vars.adom }}", "pkg": "default", "flags": ["nonblocking"], "scope": [{"name": "{{ vars.device_name }}", "vdom": "root"}]}'
          track_task: true
        next: Verify on Device

      - name: Verify on Device
        type: connector
        connector: fortinet-fortimanager-json-rpc
        operation: json_rpc_execute
        config: "fortimanager-lab"
        params:
          url: "/sys/proxy/json"
          data: '{"action": "get", "resource": "/api/v2/cmdb/firewall/policy", "target": ["adom/{{ vars.adom }}/device/{{ vars.device_name }}"]}'
        next: Done

      - name: Done
        type: end
```

{{% /expand %}}

---

## Summary

You've climbed the FortiManager provisioning ladder:

- ✅ **Rung 1** — Created an address object via `json_rpc_add` on `/pm/config/adom/root/obj/firewall/address`
- ✅ **Rung 2** — Created a firewall policy via `json_rpc_add` on `/pm/config/adom/root/pkg/default/firewall/policy`
- ✅ **Rung 3** — Installed the policy via `json_rpc_execute` on `/securityconsole/install/package` with `track_task: true`
- ✅ **Rung 4** — Verified the config on the FortiGate via `/sys/proxy/json` → `/api/v2/cmdb/firewall/policy`

### Key takeaways

| Concept | What you learned |
|---------|------------------|
| **FMG DB vs device** | Config exists in FMG's database after `add`; it only reaches the device after `install` |
| **Object references** | Policies reference address objects by name, not IP — change the object, all policies update |
| **Track Task** | The install creates an FMG task; `track_task: true` waits for it to complete |
| **Package scope** | Devices must be assigned to a policy package before install works |
| **Proxy verify** | `/sys/proxy/json` reads live config from the FortiGate — the definitive verification |

### Next steps

This ladder creates static configuration. In a real deployment, you'd:
- Loop over multiple devices with `for_each` to install to many FortiGates at once
- Use CLI script templates (like the ZTP solution pack) for complex, templated configs
- Chain this with the [firmware upgrade playbook](/chapter-02-ftnt-apis/50-firmware-upgrade) for a full PSIRT response: upgrade firmware AND update policies
