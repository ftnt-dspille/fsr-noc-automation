---
title: "FMG Provisioning Ladder"
linkTitle: "Provisioning Ladder"
weight: 45
description: "Build FortiGate configuration step by step through FortiManager -- create address objects, firewall policies, install to devices, and verify on the live FortiGate."
tags: ["hands-on", "knowledge"]
---

## Why this use case?

The firmware-upgrade chapter taught you how to *act on* a FortiGate through FortiManager. This chapter teaches you how to *configure* one -- the core of what FortiManager is for.

FortiManager's provisioning model has four layers, and we'll climb them one rung at a time:

1. **Address objects** -- the building blocks (IP addresses, subnets, FQDNs)
2. **Firewall policies** -- the rules that reference those objects
3. **Install** -- push the configuration from FMG's database to the actual FortiGate
4. **Verify** -- read back the live config from the FortiGate to confirm it landed

Each rung uses the same FortiManager JSON RPC connector you configured in [FMG API in SOAR](/chapter-02-ftnt-apis/40-fmg-api-in-soar). The pattern is always the same -- pick the right JSON-RPC method (`add`, `get`, `execute`, `set`) and the right URL path.

---

## Prerequisites

- The **FortiManager JSON RPC** connector configured and health-checked
- A FortiGate managed by FortiManager in the `root` ADOM, with `conn_status` of `up`
- Completed the [FMG API guide](/chapter-02-ftnt-apis/20-fmg-api) and [FMG API in SOAR](/chapter-02-ftnt-apis/40-fmg-api-in-soar)

---

## The ladder at a glance

```
Rung 1: Create Address Object   →  JSON RPC Add   /pm/config/adom/root/obj/firewall/address
Rung 2: Create Firewall Policy  →  JSON RPC Add   /pm/config/adom/root/pkg/<pkg>/firewall/policy
Rung 3: Install to Device       →  JSON RPC Exec  /securityconsole/install/package
Rung 4: Verify on Device        →  JSON RPC Exec  /sys/proxy/json → /api/v2/cmdb/firewall/policy
```

{{% notice info %}}
Each rung is a separate playbook step. Build them one at a time and verify each works before chaining them together. This is how you decompose a complex provisioning task into testable pieces.
{{% /notice %}}

---

## Before you start: the connector step editor

Every rung below is a **Connector** step using the FortiManager JSON RPC connector. The editor has the same shape each time:

| Field             | Notes                                                                     |
|-------------------|---------------------------------------------------------------------------|
| **Step Name**     | Free text                                                                 |
| **Target**        | `Self` or `Access Node`                                                   |
| **Configuration** | **Required.** Which FortiManager this step talks to                       |
| **Action**        | `JSON RPC Add` / `Set` / `Get` / `Exec` / `Delete` / `Freeform`            |
| **URL**           | Appears once an Action is chosen                                           |
| **Data**          | A JSON code editor. Optional for `Get`, required for the others            |
| **Track Task**    | Checkbox, only on `JSON RPC Exec`                                          |

The **Action** dropdown lists every JSON-RPC method the connector supports:

![JSON RPC actions](images/fmg_json_rpc_actions.png?height=260px)

{{% notice warning %}}
The **Data** field is a JSON code editor pre-filled with `{}` that **auto-closes brackets as you type**. Typing a complete JSON object usually leaves a stray `}` at the end and a red syntax marker in the gutter. Check for it before saving.
{{% /notice %}}

{{% notice note %}}
To see any of the JSON responses shown below, the playbook must run in **DEBUG** mode. Click **Running In INFO Mode** in the designer's top bar, set **Select Execution Log Level** to `DEBUG`, and click **Apply**. In the default INFO mode the execution log records only each step's status and duration -- the input and output are not stored at all.
{{% /notice %}}

![Playbook execution log level](images/fmg_debug_log_level.png?height=430px)

---

## Rung 1: Create an address object

Address objects are the named IP entries that firewall policies reference. Instead of hardcoding an address in every policy, you create a named object once and reference it by name.

### Create the playbook

1. On the left pane select **Orchestration > Playbooks**
2. Click **+ New Collection**, enter **Name**: `01 - FMG Provisioning`, and click **Create**
3. Click **+ Add Playbook**, enter **Name**: `Create Address Object`, and click **Create**
4. In the trigger list select **Referenced**, then click **Save**
5. Drag from one of the **Start** step's blue connector dots onto empty canvas and select **Connector > Fortinet FortiManager JSON RPC**
6. Configure the step:

    | Field             | Value                                          |
    |-------------------|------------------------------------------------|
    | **Step Name**     | `Create Address Object`                        |
    | **Configuration** | your FortiManager connector configuration      |
    | **Action**        | `JSON RPC Add`                                 |
    | **URL**           | `/pm/config/adom/root/obj/firewall/address`    |

7. In **Data**, enter:

    ```json
    {"name": "ws-workshop-server", "type": "ipmask", "subnet": ["10.200.1.50", "255.255.255.255"], "comment": "Workshop provisioning ladder demo"}
    ```

8. Click **Save**, then **Save Playbook**, then run the playbook

The finished step looks like this:

![Create Address Object step](images/fmg_address_object_step.png?height=620px)

### What you'll see

A successful `add` returns the **identity of the object it created**, with a sibling `status` of `0`:

```json
{
  "add_response": { "name": "ws-workshop-server" },
  "status": 0
}
```

{{% notice warning %}}
Two different success shapes come back from `JSON RPC Add`, and mixing them up is a common source of broken playbook conditions:

- Adding an object that **has an identity** (an address, a policy) returns that identity -- `{"name": ...}` or `{"policyid": ...}`.
- Adding something with **no addressable identity** (for example a package scope member) returns an envelope instead: `{"status": {"code": 0, "message": "OK"}, "url": "..."}`.

In both cases the reliable success check is the **outer** `status` being `0`. Don't branch on `add_response.status.code`, because on an object-creating add there is no such field.
{{% /notice %}}

{{% notice note %}}
If the object already exists you get the error envelope with `code: -2` and message `Object already exists`. This is expected if you run the playbook twice -- FMG won't create a duplicate. Use `JSON RPC Set` to modify an existing object.
{{% /notice %}}

### Verify it

Add a second step to read the object back:

| Field         | Value                                                          |
|---------------|-----------------------------------------------------------------|
| **Step Name** | `Get Address Object`                                           |
| **Action**    | `JSON RPC Get`                                                 |
| **URL**       | `/pm/config/adom/root/obj/firewall/address/ws-workshop-server` |
| **Data**      | *(leave empty -- Data is optional for Get)*                     |

The response contains the full object. FortiManager returns far more fields than you set; the ones that matter here are:

```json
{
  "get_response": {
    "name": "ws-workshop-server",
    "type": "ipmask",
    "subnet": ["10.200.1.50", "255.255.255.255"],
    "comment": "Workshop provisioning ladder demo",
    "associated-interface": ["any"],
    "dirty": "dirty",
    "uuid": "..."
  },
  "status": 0
}
```

In the execution log, `dirty` sits alongside the fields you set:

![get_response showing dirty](images/fmg_address_dirty.png?height=380px)

{{% notice note %}}
Note `"dirty": "dirty"`. The object exists in FortiManager's database but has not yet been installed to any device. That's exactly the distinction Rung 3 resolves.
{{% /notice %}}

> **Verify:** The `add` step's outer `status` is `0`, and the `get_response` contains your object with the correct name, type, and subnet.

---

## Rung 2: Create a firewall policy

Now create a firewall policy that references the address object. Policies live inside **policy packages**.

### Find the right package

Before writing the policy, find out which package applies to your device -- you'll need this for Rung 3 as well. Add a step:

| Field         | Value                    |
|---------------|--------------------------|
| **Step Name** | `List Policy Packages`   |
| **Action**    | `JSON RPC Get`           |
| **URL**       | `/pm/pkg/adom/root`      |

Each package in the response has a `scope member` array listing the devices it installs to:

```json
{
  "name": "default",
  "scope member": [ { "name": "Branch10", "vdom": "root" } ],
  "type": "pkg"
}
```

{{% notice warning %}}
**Do not assume the `default` package applies to your device.** A policy package only installs to the devices listed in its `scope member`, and `default` is frequently scoped to other devices -- or to none at all. Read this list and use the package that actually contains your FortiGate. Getting this wrong is the single most common reason Rung 3 appears to succeed while changing nothing.
{{% /notice %}}

### Create the policy

Add a **Connector** step:

| Field         | Value                                                |
|---------------|-------------------------------------------------------|
| **Step Name** | `Create Firewall Policy`                             |
| **Action**    | `JSON RPC Add`                                       |
| **URL**       | `/pm/config/adom/root/pkg/<your-package>/firewall/policy` |

In **Data**:

```json
{"name": "ws-workshop-allow", "srcintf": ["any"], "dstintf": ["any"], "srcaddr": ["all"], "dstaddr": ["ws-workshop-server"], "action": "accept", "schedule": "always", "service": ["ALL"], "nat": "disable", "logtraffic": "utm"}
```

The `dstaddr` references the address object by name (`ws-workshop-server`) -- the same name you created in Rung 1. This is how objects and policies connect.

### What you'll see

```json
{
  "add_response": { "policyid": 6 },
  "status": 0
}
```

{{% notice warning %}}
`srcintf` and `dstintf` are **required**. Omitting them fails with:

```
code: -9998
srcintf in Policy "6" Package "<your-package>" cannot be empty
```
{{% /notice %}}

{{% notice warning %}}
**Use `any` for the interfaces unless you have set up per-device mappings.** In a policy package, interface names are *dynamic interface objects*, not literal port names on your FortiGate. A policy that names `port1`/`port2` without a mapping for your device passes the `add` happily, then fails at install time with a rollback:

```
validation error on firewall policy 6 ... by dynamic interface check
vdom copy error: entry not exist. detail: Dynamic interface "port2" mapping undefined for device fgt-2
Copy rollbacked, due to error
Aborted due to previous error
```

The policy is created but can never be installed. Either use `any`, or define the per-device dynamic interface mapping in FortiManager first.
{{% /notice %}}

> **Verify:** The outer `status` is `0` and `add_response` contains a `policyid`.

---

## Rung 3: Install the policy to a device

Right now the address object and policy exist only in FortiManager's database -- the FortiGate doesn't know about them. The **install** step pushes FMG's configuration to the device.

Add a **Connector** step:

| Field           | Value                                     |
|-----------------|-------------------------------------------|
| **Step Name**   | `Install Policy`                          |
| **Action**      | `JSON RPC Exec`                           |
| **URL**         | `/securityconsole/install/package`        |
| **Track Task**  | checked                                   |

In **Data**:

```json
{"adom": "root", "pkg": "<your-package>", "flags": ["nonblocking"], "scope": [{"name": "{{vars.device_name}}", "vdom": "root"}]}
```

Ticking **Track Task** reveals four extra fields that are hidden while it is off:

![Install Policy step with Track Task checked](images/fmg_install_policy_step.png?height=640px)

| Field                     | What it does                                                          |
|---------------------------|-----------------------------------------------------------------------|
| **Task Timeout**          | Overall ceiling on how long the connector waits for the task          |
| **Zero Percent Timeout**  | Gives up if the task never gets off `0%`                              |
| **Task Stale Timeout**    | Gives up if the percentage stops moving for this long. Defaults to 120 seconds |
| **Delete Task On Timeout**| Whether to remove the FortiManager task object when the wait gives up |

Leave them empty to accept the defaults.

### What Track Task does

Unlike the firmware upgrade (which is fire-and-forget), the policy install **creates a FortiManager task**. With **Track Task** checked, the connector waits for the task and returns its full result:

```json
{
  "execute_response": { "task": 438 },
  "task_response": {
    "id": 438,
    "title": "Install Package 'Demo_for_Policy_Automation'",
    "state": "error",
    "percent": 100,
    "num_done": 0,
    "num_err": 1,
    "num_warn": 0,
    "user": "fortisoar",
    "line": [
      {
        "name": "fgt-2[copy]",
        "state": "error",
        "detail": "Aborted due to previous error",
        "history": [
          { "detail": "Start copying policy to devdb, device(fgt-2), vdomid(root)", "percent": 1 },
          { "detail": "Aborted due to previous error", "percent": 100 }
        ]
      }
    ]
  },
  "status": 0
}
```

{{% notice note %}}
Read `task_response.state` (`success`, `warning`, or `error`) together with `num_err` and `num_warn`. The `line[].history[]` array is the per-stage trace and is where the actual cause appears.
{{% /notice %}}

### When the task never finishes

An install against a device that is not currently reachable does not come back as an error -- it simply stops progressing. When that happens, **Task Stale Timeout** ends the wait and the step returns the task as it stood at that moment:

![task_response after a stale timeout](images/fmg_task_response.png?height=620px)

Three things in that output are worth reading carefully:

- `state` is still `running` and `percent` is stuck part-way. The install did not fail -- the connector stopped waiting.
- `msg` names the timeout that fired and the value it used, and warns that the task will be deleted. Querying `/task/task/<id>` afterwards returns `Object does not exist`.
- The outer `status` is `1`, not `0`.

{{% notice warning %}}
Don't treat the outer `status` as a success flag on a tracked install. It reflects how the tracking wait ended, so a timed-out install reports a non-zero `status` even though FortiManager accepted the request perfectly well. Branch on `task_response.state`, `num_err`, and `num_warn` instead.
{{% /notice %}}

{{% notice tip %}}
If you hit this, check the device's `conn_status` in `/dvmdb/adom/root/device/<name>` before blaming the policy. A device showing `down` cannot receive an install, and the task will sit at the same percentage until it is deleted.
{{% /notice %}}

### Common install outcomes

| `state`   | `detail`                                            | What it means                                                              |
|-----------|-----------------------------------------------------|----------------------------------------------------------------------------|
| `success` | `installation completed`                            | Config reached the device                                                   |
| `warning` | `No installing devices`                             | The device isn't in the package's `scope member` -- nothing was installed     |
| `error`   | `Dynamic interface "..." mapping undefined`         | The policy names interfaces with no per-device mapping (see Rung 2)         |
| `error`   | `Initiate install to real device failed due to tunnel down` | FMG has no management tunnel to the device                         |

{{% notice warning %}}
**`No installing devices` is a warning, not an error** -- `num_err` stays `0` and the outer `status` is `0`. A playbook that only checks those will report success while having changed nothing on the device. Always assert on `task_response.state`.
{{% /notice %}}

> **Verify:** `execute_response.task` contains a task ID, and `task_response.state` is `success` with `percent: 100`.

---

## Rung 4: Verify the config on the FortiGate

The final rung reads the live configuration directly from the FortiGate via the `/sys/proxy/json` proxy -- the same pattern as the [firmware upgrade chapter](/chapter-02-ftnt-apis/50-firmware-upgrade), but reading firewall policies.

Add a **Connector** step:

| Field         | Value                    |
|---------------|--------------------------|
| **Step Name** | `Verify Policy on Device`|
| **Action**    | `JSON RPC Exec`          |
| **URL**       | `/sys/proxy/json`        |

In **Data**:

```json
{"action": "get", "resource": "/api/v2/cmdb/firewall/policy", "target": ["adom/root/device/{{vars.device_name}}"]}
```

### What you'll see

Each entry in `execute_response` has three keys -- `response`, `status`, and `target`:

```json
{
  "execute_response": [
    {
      "response": {
        "http_method": "GET",
        "status": "success",
        "http_status": 200,
        "results": [
          { "policyid": 1, "name": "Block All Traffic to Threat Feed", "action": "deny" }
        ]
      },
      "status": { "code": 0, "message": "OK" },
      "target": "fgt-2"
    }
  ],
  "status": 0
}
```

In the execution log those three keys look like this -- note that everything sits under `data`:

![execute_response shape in the execution log](images/fmg_proxy_execute_response.png?height=420px)

If your `ws-workshop-allow` policy installed successfully in Rung 3, it appears in this list. If it doesn't, the install didn't reach the device -- re-read the Rung 3 task result.

{{% notice warning %}}
When the device's tunnel is down, the proxy returns a **different shape with no `response` key at all**:

```json
{
  "execute_response": [
    {
      "status": { "code": -1, "message": "fgt-2(1311) error: No tunnel 80.\n" },
      "target": "fgt-2"
    }
  ],
  "status": 0
}
```

Playbook logic that reaches straight for `execute_response[0].response.results` will fail confusingly rather than reporting "device unreachable". Guard for the `response` key first.
{{% /notice %}}

> **Verify:** `response.status` is `success` with `http_status: 200`, and your workshop policy appears in `results`.

---

## Referencing step output in Jinja

| What you want                   | Correct expression                                             |
|---------------------------------|-----------------------------------------------------------------|
| A playbook variable             | `{{vars.device_name}}`                                          |
| A connector step's API response | `{{vars.steps.Install_Policy.data.task_response.state}}`        |

{{% notice warning %}}
Every step's result is nested under **`data`**. `vars.steps.Install_Policy.task_response` silently resolves to nothing -- the step runs, the playbook continues, and you get an empty value rather than an error. Spaces in a step name become underscores.
{{% /notice %}}

---

## Put it all together

```
Rung 1: JSON RPC Add    /pm/config/adom/root/obj/firewall/address        → creates the address object
Rung 2: JSON RPC Add    /pm/config/adom/root/pkg/<pkg>/firewall/policy   → creates the policy
Rung 3: JSON RPC Exec   /securityconsole/install/package                 → pushes config to the FortiGate
Rung 4: JSON RPC Exec   /sys/proxy/json → /api/v2/cmdb/firewall/policy   → reads back the live config
```

### The JSON-RPC action cheat sheet

| Action              | FMG operation          | When to use                                   |
|---------------------|------------------------|-----------------------------------------------|
| `JSON RPC Get`      | Read existing config   | Verify objects, policies, device state        |
| `JSON RPC Add`      | Create new objects     | Add address objects, policies, scope members  |
| `JSON RPC Set`      | Modify existing objects| Change a field on an existing object          |
| `JSON RPC Exec`     | Run an action          | Install packages, proxy to devices            |
| `JSON RPC Delete`   | Remove objects         | Delete address objects, policies              |
| `JSON RPC Freeform` | Any method             | Anything the fixed actions don't cover        |

### The URL pattern cheat sheet

| URL pattern                                        | What it manages                          |
|----------------------------------------------------|------------------------------------------|
| `/pm/config/adom/<adom>/obj/firewall/address`      | ADOM-level address objects               |
| `/pm/pkg/adom/<adom>`                              | Policy packages and their scope members  |
| `/pm/config/adom/<adom>/pkg/<pkg>/firewall/policy` | Policies in a policy package             |
| `/securityconsole/install/package`                 | Install a package to devices             |
| `/securityconsole/install/device`                  | Install device-level config              |
| `/sys/proxy/json`                                  | Proxy REST calls to a managed FortiGate  |
| `/dvmdb/adom/<adom>/device`                        | Device database (list, authorize)        |

---

## Summary

You've climbed the FortiManager provisioning ladder:

- ✅ **Rung 1** -- Created an address object and saw it sitting `dirty` in FMG's database
- ✅ **Rung 2** -- Created a firewall policy referencing that object, in the package scoped to your device
- ✅ **Rung 3** -- Installed the package and read the task result to confirm what actually happened
- ✅ **Rung 4** -- Verified the live config on the FortiGate through `/sys/proxy/json`

### Key takeaways

| Concept                  | What you learned                                                                     |
|--------------------------|---------------------------------------------------------------------------------------|
| **FMG DB vs device**     | Config is `dirty` in FMG after `add`; it only reaches the device after `install`       |
| **Object references**    | Policies reference address objects by name -- change the object, all policies update    |
| **Package scope**        | A package installs only to the devices in its `scope member`                            |
| **Dynamic interfaces**   | Policy interface names need per-device mappings; `any` avoids the problem               |
| **Track Task**           | The install creates an FMG task -- assert on `task_response.state`, not the outer status |
| **Warnings aren't errors** | `No installing devices` returns `num_err: 0`; only `state` reveals it did nothing     |
| **Proxy verify**         | `/sys/proxy/json` reads live config from the FortiGate -- the definitive check           |

### Next steps

This ladder creates static configuration. In a real deployment, you'd:

- Loop over multiple devices to install to many FortiGates at once
- Use CLI script templates (like the ZTP solution pack) for complex, templated configs
- Chain this with the [firmware upgrade playbook](/chapter-02-ftnt-apis/50-firmware-upgrade) for a full PSIRT response: upgrade firmware *and* update policies
