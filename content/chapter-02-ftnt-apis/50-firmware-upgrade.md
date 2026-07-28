---
title: "FortiGate Firmware Upgrade via FMG Proxy"
linkTitle: "Firmware Upgrade via FMG"
weight: 50
description: "Use the FortiManager /sys/proxy/json endpoint to list available firmware on a FortiGate and trigger an upgrade — all from a SOAR playbook."
tags: ["hands-on", "knowledge"]
---

## Why this use case?

When a PSIRT advisory drops, you need to find every vulnerable FortiGate and upgrade it. Doing this manually across dozens of devices is error-prone and slow. FortiManager already manages those devices — so we can use its established tunnels to proxy FortiGate REST API calls from SOAR, without authenticating to each FortiGate individually.

This chapter teaches the two key API calls:

1. **List available firmware** on a FortiGate via the FMG proxy
2. **Trigger a firmware upgrade** on that FortiGate via the same proxy

Both use the same FortiManager JSON RPC connector and the same `/sys/proxy/json` endpoint you met in the [FMG API guide](/chapter-02-ftnt-apis/20-fmg-api). The difference is what we proxy *to* — FortiOS REST API endpoints on each FortiGate.

---

## Prerequisites

- The **FortiManager JSON RPC** connector configured and health-checked (see [FMG API in SOAR](/chapter-02-ftnt-apis/40-fmg-api-in-soar))
- A FortiGate managed by FortiManager in the `root` ADOM
- Familiarity with the [FMG proxy method](/chapter-02-ftnt-apis/20-fmg-api#fortigate-api-calls-via-fortimanager-proxy-method)

---

## 1. Understand the proxy pattern

The `/sys/proxy/json` endpoint lets FortiManager forward REST API calls to managed FortiGates. Instead of talking to each FortiGate directly, you send one request to FortiManager with:

| Field | What it does |
|-------|-------------|
| `target` | Which FortiGate(s) to proxy to (ADOM-scoped) |
| `action` | HTTP method (`get`, `post`, `put`, `delete`) |
| `resource` | The FortiOS REST API path to call on the target |
| `payload` | Request body (for `post`/`put`) |

FortiManager forwards the request to the FortiGate through its management tunnel and returns the FortiGate's response. You never need to authenticate to the FortiGate directly.

```
SOAR Playbook → FortiManager /sys/proxy/json → FortiGate REST API
                      (manages tunnel)           /api/v2/monitor/system/firmware
```

---

## 2. List available firmware on a FortiGate

The FortiOS API exposes a firmware monitor endpoint at `/api/v2/monitor/system/firmware`. Calling this via the FMG proxy returns every firmware image available for that specific FortiGate platform, including the `id` needed to trigger an upgrade.

### Create the playbook

1. Navigate to **Automation > Playbooks**.
2. Create a new collection called `00 - FMG Firmware`.
3. Create a new playbook called `Get Available Firmware`.
4. Choose the **Referenced** trigger step.
5. Drag a new **Connector** step and pick the **FortiManager JSON RPC** connector.
6. Configure the step:

   | Field | Value |
   |-------|-------|
   | **Step Name** | `Get Available Firmware` |
   | **Action** | `JSON RPC Exec` |
   | **URL** | `/sys/proxy/json` |
   | **Data** | *(see below)* |

   ```json
   {
     "action": "get",
     "resource": "/api/v2/monitor/system/firmware",
     "target": ["adom/root/device/{{vars.input.params.device_name}}"]
   }
   ```

7. Save the step and the playbook.
8. Add an input parameter: `device_name` (text, required).

### Run it

1. Click the **Play** button, then **Trigger Playbook**.
2. Enter a device name (e.g., `fgt-2`) when prompted.
3. Open the execution log and expand the step output.

### What you'll see

The response contains an `available` array with one entry per firmware image. Each entry has the version broken into `major`, `minor`, `patch` fields, plus an `id` that you'll need for the upgrade call:

```json
{
  "execute_response": [
    {
      "response": {
        "status": "success",
        "http_status": 200,
        "results": {
          "available": [
            {
              "id": "07000000FIMG0013700019",
              "major": 7,
              "minor": 0,
              "patch": 19
            },
            {
              "id": "07000000FIMG0013700018",
              "major": 7,
              "minor": 0,
              "patch": 18
            }
          ]
        }
      }
    }
  ]
}
```

{{% notice note %}}
The `target` field uses the ADOM-scoped device path: `adom/<adom>/device/<device_name>`. For a device in the `root` ADOM, that's `adom/root/device/fgt-2`. You can also target a group with `adom/<adom>/group/<group_name>`.
{{% /notice %}}

{{% notice note %}}
The full list can contain 99+ firmware images spanning multiple major versions (5.6 through 8.0). The `id` field is a FortiManager-internal identifier that encodes the platform and version — you need it exactly as returned to trigger the upgrade.
{{% /notice %}}

### Verify

> **Verify:** The step output shows `status: "success"` and the `available` array contains multiple firmware entries with `id`, `major`, `minor`, and `patch` fields.

---

## 3. Resolve the target firmware ID

The upgrade call needs the firmware `id`, not a version string. You need to match the target version (e.g., `7.0.19`) against the available list to find the right `id`.

Add a **Code Snippet** step after the firmware lookup:

| Field | Value |
|-------|-------|
| **Step Name** | `Resolve Firmware ID` |
| **Connector** | `code-snippet` |
| **Operation** | `Execute Python Code` |

```python
import json

target_version = "{{ vars.input.params.target_version }}"
fw_response = json.loads('''{{ vars.steps.Get_Available_Firmware | tojson }}''')

# Navigate the connector response wrapper
execute_response = fw_response.get('execute_response', [])
if not execute_response:
    available = []
else:
    results = execute_response[0].get('response', {}).get('results', {})
    available = results.get('available', []) if isinstance(results, dict) else []

# Parse target version into major.minor.patch
parts = target_version.split('.')
if len(parts) != 3:
    print(json.dumps({"firmware_id": None, "error": "Invalid version: " + target_version}))
else:
    t_major, t_minor, t_patch = int(parts[0]), int(parts[1]), int(parts[2])
    firmware_id = None
    for fw in available:
        if (fw.get('major') == t_major and
            fw.get('minor') == t_minor and
            fw.get('patch') == t_patch):
            firmware_id = fw.get('id')
            break

    if not firmware_id:
        print(json.dumps({"firmware_id": None, "error": "Version not found"}))
    else:
        print(json.dumps({"firmware_id": firmware_id, "version": target_version}))
```

This step outputs a JSON object with either `firmware_id` (found) or `error` (not found).

### Verify

> **Verify:** The step output shows a JSON object with `firmware_id` set to a non-null value (e.g., `"07000000FIMG0013700019"` for v7.0.19).

---

## 4. Branch on whether firmware was found

Add a **Decision** step to route based on whether the firmware ID was resolved:

| Field | Value |
|-------|-------|
| **Step Name** | `Check Firmware Found` |

| Condition | When | Next Step |
|-----------|------|-----------|
| `Firmware Found` | `{{ vars.steps.Resolve_Firmware_ID.output.firmware_id is not none }}` | Trigger Upgrade |
| `Not Found` | *(default)* | Update Alert With Error |

---

## 5. Trigger the firmware upgrade

This is the money step — it tells the FortiGate to upgrade itself using the resolved firmware ID.

Add a **Connector** step:

| Field | Value |
|-------|-------|
| **Step Name** | `Trigger Upgrade` |
| **Action** | `JSON RPC Exec` |
| **URL** | `/sys/proxy/json` |
| **Data** | *(see below)* |
| **Track Task** | False |

```json
{
  "action": "post",
  "resource": "/api/v2/monitor/system/firmware/upgrade",
  "target": ["adom/root/device/{{vars.input.params.device_name}}"],
  "payload": {
    "source": "fortiguard",
    "filename": "{{vars.steps.Resolve_Firmware_ID.output.firmware_id}}"
  }
}
```

### Key fields explained

| Field | Value | Why |
|-------|-------|-----|
| `action` | `post` | The upgrade is a POST to the FortiOS API |
| `resource` | `/api/v2/monitor/system/firmware/upgrade` | The FortiOS firmware upgrade endpoint |
| `source` | `fortiguard` | Pull the image from FortiGuard — no need to pre-stage in FMG |
| `filename` | The firmware `id` from step 3 | Identifies which image to install |

{{% notice warning %}}
The `source` field controls where the firmware image comes from:
- `fortiguard` — pulls directly from FortiGuard (internet-connected FortiGate)
- `fmgbased` — uses an image staged in FortiManager's image repository

Use `fortiguard` unless you've pre-staged images in FMG. No staging needed for this workshop.
{{% /notice %}}

{{% notice note %}}
**Do NOT enable `Track Task`** for this call. Unlike the `add/device` task you used in the [Authorize Device](/chapter-02-ftnt-apis/40-fmg-api-in-soar#authorize-a-device) chapter, the firmware upgrade is **fire-and-forget** — FortiManager returns HTTP 200 immediately and the FortiGate reboots asynchronously. There is no FMG task object to poll. The reference playbook confirms this: `track_task` is not set on the upgrade step.
{{% /notice %}}

### Run it

1. Save the step and playbook.
2. Trigger with `device_name: fgt-2`, `target_version: 7.0.19`.
3. Watch the execution log — the step should return `status: "success"`.

### What you'll see

The response confirms the upgrade was accepted. The FortiGate will reboot shortly:

```json
{
  "execute_response": [
    {
      "response": {
        "http_method": "POST",
        "status": "success",
        "http_status": 200,
        "vdom": "root",
        "path": "system",
        "name": "firmware",
        "action": "upgrade",
        "serial": "<your-fortigate-serial>",
        "version": "v7.0.19",
        "build": 696
      }
    }
  ]
}
```

### Verify

> **Verify:** The step output shows `status: "success"` and `http_status: 200`. Within 30-60 seconds, the FortiGate will disconnect from FortiManager (rebooting) and come back on the new firmware.

---

## 6. Verify the upgrade completed

After the upgrade, the FortiGate reboots and reconnects to FortiManager. You can verify the new firmware by re-reading the device record from the FMG device database.

Add a **Connector** step:

| Field | Value |
|-------|-------|
| **Step Name** | `Verify Upgrade` |
| **Action** | `JSON RPC Get` |
| **URL** | `/dvmdb/adom/root/device` |
| **Data** | *(empty)* |

The response contains a list of all managed devices. Find your device and check the `os_ver`, `mr`, and `patch` fields:

```json
{
  "name": "fgt-2",
  "os_ver": "7.0",
  "mr": 0,
  "patch": 19,
  "build": 696,
  "sn": "<your-fortigate-serial>",
  "conn_status": "up",
  "platform_str": "FortiGate-VM64-KVM"
}
```

{{% notice tip %}}
The device will show `conn_status: down` while it reboots, then return to `up` on the new firmware. This typically takes 1-3 minutes. If you're automating this, add a **Delay** step (120 seconds) between the upgrade and the verify.
{{% /notice %}}

### Verify

> **Verify:** The device's `os_ver`, `mr`, and `patch` fields now reflect the target version, and `conn_status` is `up`.

---

## 7. Put it all together

Here's the complete playbook flow:

```
Start (manual, params: device_name, target_version)
  → Get Available Firmware (FMG /sys/proxy/json → FGT /api/v2/monitor/system/firmware)
  → Resolve Firmware ID (Python: match version → id)
  → Check Firmware Found (decision)
    → Found:  Trigger Upgrade (FMG /sys/proxy/json → FGT /api/v2/monitor/system/firmware/upgrade)
              → Verify Upgrade (FMG /dvmdb/adom/root/device)
              → Done
    → Missing: Update Alert With Error → Done
```

### The complete YAML

If you're using the YAML playbook compiler, here's the complete playbook in YAML form:

{{% expand "Click to view the YAML playbook" %}}

```yaml
collection: UC1c - FortiGate Firmware Upgrade via FMG
description: Upgrade a FortiGate's firmware via FortiManager's /sys/proxy/json endpoint.
visible: true

playbooks:
  - name: Trigger FGT Firmware Upgrade via FMG
    is_active: true
    parameters: [device_name, adom, target_version]
    steps:
      - name: Start
        type: start
        next: Set Variables

      - name: Set Variables
        type: set_variable
        next: Get Available Firmware
        vars:
          device_name: "{{ vars.input.params.device_name }}"
          adom: "{{ vars.input.params.adom | default('root') }}"
          target_version: "{{ vars.input.params.target_version }}"

      - name: Get Available Firmware
        type: connector
        connector: fortinet-fortimanager-json-rpc
        operation: json_rpc_execute
        config: "fortimanager-lab"
        params:
          url: "/sys/proxy/json"
          data: '{"action": "get", "resource": "/api/v2/monitor/system/firmware", "target": ["adom/{{ vars.adom }}/device/{{ vars.device_name }}"]}'
        next: Resolve Firmware ID

      - name: Resolve Firmware ID
        type: code_snippet
        next: Check Firmware Found
        code: |
          import json
          target_version = "{{ vars.target_version }}"
          fw_response = json.loads('''{{ vars.steps.Get_Available_Firmware | tojson }}''')
          execute_response = fw_response.get('execute_response', [])
          available = []
          if execute_response:
              results = execute_response[0].get('response', {}).get('results', {})
              available = results.get('available', []) if isinstance(results, dict) else []
          parts = target_version.split('.')
          if len(parts) != 3:
              print(json.dumps({"firmware_id": None, "error": "Invalid version"}))
          else:
              t_major, t_minor, t_patch = int(parts[0]), int(parts[1]), int(parts[2])
              firmware_id = None
              for fw in available:
                  if (fw.get('major') == t_major and fw.get('minor') == t_minor
                          and fw.get('patch') == t_patch):
                      firmware_id = fw.get('id')
                      break
              if not firmware_id:
                  print(json.dumps({"firmware_id": None, "error": "Version not found"}))
              else:
                  print(json.dumps({"firmware_id": firmware_id, "version": target_version}))

      - name: Check Firmware Found
        type: decision
        conditions:
          - display: Firmware Found
            when: "{{ vars.steps.Resolve_Firmware_ID.output.firmware_id is not none }}"
            next: Trigger Upgrade
          - display: Not Found
            default: true
            next: Done

      - name: Trigger Upgrade
        type: connector
        connector: fortinet-fortimanager-json-rpc
        operation: json_rpc_execute
        config: "fortimanager-lab"
        params:
          url: "/sys/proxy/json"
          data: '{"action": "post", "resource": "/api/v2/monitor/system/firmware/upgrade", "target": ["adom/{{ vars.adom }}/device/{{ vars.device_name }}"], "payload": {"source": "fortiguard", "filename": "{{ vars.steps.Resolve_Firmware_ID.output.firmware_id }}"}}'
        next: Done

      - name: Done
        type: end
```

{{% /expand %}}

---

## Summary

You've built a playbook that upgrades FortiGate firmware from SOAR using FortiManager as a proxy:

- ✅ Listed available firmware on a FortiGate via `/sys/proxy/json` → `/api/v2/monitor/system/firmware`
- ✅ Resolved the firmware `id` for a target version using a Python code snippet
- ✅ Triggered the upgrade via `/sys/proxy/json` → `/api/v2/monitor/system/firmware/upgrade`
- ✅ Verified the upgrade by reading the device record from `/dvmdb/adom/root/device`
- ✅ Learned that the upgrade is fire-and-forget (no `track_task` needed)

### Key takeaways

| Concept | What you learned |
|---------|------------------|
| **Proxy pattern** | FMG `/sys/proxy/json` forwards REST calls to managed FortiGates — no direct FGT auth needed |
| **Firmware `id`** | The upgrade call needs the FortiManager-internal `id`, not a version string |
| **`source: fortiguard`** | Pulls the image from FortiGuard directly — no FMG image staging |
| **Fire-and-forget** | The upgrade returns 200 immediately; the FGT reboots asynchronously (no task to poll) |

### Real-world extension

In a PSIRT response scenario, this playbook would be triggered from a PSIRT alert. A companion playbook reads affected FortiOS version ranges from the PSIRT email, pulls all managed FortiGates from `/dvmdb/adom/<adom>/device`, cross-references each device's current version, and produces a `vulnerableDevices` list. The upgrade playbook then loops over that list with `for_each`, upgrading every vulnerable device in one run.
