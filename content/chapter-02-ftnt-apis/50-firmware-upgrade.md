---
title: "FortiGate Firmware Upgrade via FMG Proxy"
linkTitle: "Firmware Upgrade via FMG"
weight: 50
description: "Use the FortiManager /sys/proxy/json endpoint to list available firmware on a FortiGate, resolve the image ID for a target version, and trigger the upgrade -- all from a SOAR playbook."
tags: ["hands-on", "knowledge"]
---

## Why this use case?

When a PSIRT advisory drops, you need to find every vulnerable FortiGate and upgrade it. Doing this manually across dozens of devices is error-prone and slow. FortiManager already manages those devices -- so we can use its established tunnels to proxy FortiGate REST API calls from SOAR, without authenticating to each FortiGate individually.

This chapter builds a playbook that:

1. **Lists available firmware** on a FortiGate via the FMG proxy
2. **Resolves the image ID** for a target version with a Code Snippet step
3. **Triggers the upgrade** via the same proxy
4. **Verifies** the device came back on the new firmware

Everything uses the FortiManager JSON RPC connector and the `/sys/proxy/json` endpoint you met in the [FMG API guide](/chapter-02-ftnt-apis/20-fmg-api). The difference is what we proxy *to* -- FortiOS REST API endpoints on each FortiGate.

---

## Prerequisites

- The **FortiManager JSON RPC** connector configured and health-checked (see [FMG API in SOAR](/chapter-02-ftnt-apis/40-fmg-api-in-soar))
- A FortiGate managed by FortiManager in the `root` ADOM, with `conn_status` of `up`
- Familiarity with the [FMG proxy method](/chapter-02-ftnt-apis/20-fmg-api#fortigate-api-calls-via-fortimanager-proxy-method)

{{% notice warning %}}
This chapter really upgrades a FortiGate. The device reboots and drops off FortiManager for several minutes. Only run it against a lab device you are willing to have offline.
{{% /notice %}}

---

## 1. Understand the proxy pattern

The `/sys/proxy/json` endpoint lets FortiManager forward REST API calls to managed FortiGates. Instead of talking to each FortiGate directly, you send one request to FortiManager with:

| Field      | What it does                                       |
|------------|----------------------------------------------------|
| `target`   | Which FortiGate(s) to proxy to (ADOM-scoped)       |
| `action`   | HTTP method (`get`, `post`, `put`, `delete`)       |
| `resource` | The FortiOS REST API path to call on the target    |
| `payload`  | Request body (for `post`/`put`)                    |

FortiManager forwards the request through its management tunnel and returns the FortiGate's response. You never authenticate to the FortiGate directly.

```
SOAR Playbook → FortiManager /sys/proxy/json → FortiGate REST API
                      (manages tunnel)           /api/v2/monitor/system/firmware
```

{{% notice note %}}
The `target` field uses the ADOM-scoped device path: `adom/<adom>/device/<device_name>`. For a device in the `root` ADOM that's `adom/root/device/fgt-2`. You can also target a group with `adom/<adom>/group/<group_name>`.
{{% /notice %}}

---

## 2. Create the playbook

1. On the left pane select **Automation > Playbooks**
2. Click **+ New Collection**, enter **Name**: `00 - FMG Firmware`, and click **Create**
3. Click **+ Add Playbook**, enter **Name**: `Upgrade FortiGate Firmware`, and click **Create**
4. In the trigger list select **Referenced**

### Define the device name

The **Referenced** trigger has no "input parameters" field -- its editor is just **Step Name** and the **Step Utilities** bar. To give the playbook a device name to work with, define a playbook variable:

5. In the **Step Utilities** bar at the bottom, click **+ Variables**
6. Enter **Variable**: `device_name`, **Value**: the name of your managed FortiGate (e.g. `fgt-2`)
7. Click **Save**

    ![Referenced trigger with a playbook variable](images/fmg_referenced_trigger_variable.png?height=280px)

{{% notice warning %}}
Because this is a **Referenced** trigger, the variable you just created is referenced as `{{vars.device_name}}` -- **not** `{{vars.input.params.device_name}}`. As the screenshot above shows, the trigger editor has no parameters field at all: just **Step Name** and the **Step Utilities** bar. Playbook *parameters* are supplied by the calling playbook's **Reference a Playbook** step; the values you set here are plain playbook variables.
{{% /notice %}}

---

## 3. List available firmware

The FortiOS API exposes a firmware monitor endpoint at `/api/v2/monitor/system/firmware`. Calling it through the FMG proxy returns every firmware image available for that platform, including the `id` needed to trigger an upgrade.

8. Hover the **Start** step to reveal its blue connector dots, then drag from a dot onto empty canvas and release to open the step list
9. Select **Connector** (under **EXECUTE**), then choose **Fortinet FortiManager JSON RPC**
10. Fill in the step:

    | Field             | Value                                     |
    |-------------------|-------------------------------------------|
    | **Step Name**     | `Get Available Firmware`                  |
    | **Target**        | `Self`                                    |
    | **Configuration** | your FortiManager connector configuration |
    | **Action**        | `JSON RPC Exec`                           |
    | **URL**           | `/sys/proxy/json`                         |

11. In the **Data** editor, enter:

    ```json
    {"action": "get", "resource": "/api/v2/monitor/system/firmware", "target": ["adom/root/device/{{vars.device_name}}"]}
    ```

12. Click **Save**

The finished step looks like this:

![Connector step editor](images/fmg_connector_step_editor.png?height=620px)

The **Action** dropdown lists every JSON-RPC method the connector supports:

![JSON RPC actions](images/fmg_json_rpc_actions.png?height=260px)

{{% notice note %}}
**Configuration** is a required field that the step tables in older guides omit. It selects *which* FortiManager the step talks to. The **URL** and **Data** fields only appear after you pick an **Action**.
{{% /notice %}}

{{% notice warning %}}
The **Data** field is a JSON code editor, not a plain text box. It is pre-filled with `{}` and **auto-closes brackets as you type**, so pasting or typing a complete JSON object typically leaves a stray `}` at the end and a red syntax marker in the gutter. Check the marker before saving and delete any extra trailing characters.
{{% /notice %}}

### Turn on DEBUG mode

By default a playbook runs in **INFO** mode, which records only each step's status and execution time. The step's input and output -- the JSON you actually want to read -- are not stored.

13. Click **Running In INFO Mode** in the top bar
14. Set **Select Execution Log Level** to `DEBUG` and click **Apply**

    ![Playbook execution log level](images/fmg_debug_log_level.png?height=430px)

{{% notice note %}}
FortiSOAR states this in-product: *"To enable detailed playbook execution logging like step input, output, configuration and other information helpful in debugging, you can run the playbook in DEBUG mode."* Turn DEBUG back off for production playbooks -- it fills storage quickly.
{{% /notice %}}

### Run it

15. Click **Save Playbook**
16. Click the **Play** button, then **Trigger Playbook**. (If prompted with **Playbook not saved**, click **Save and Test**.)
17. When the **Executed Playbook Logs** view opens, click the **Get Available Firmware** step and expand **OUTPUT**

### What you'll see

The step output is wrapped in a `data` object, alongside the step's own status fields:

```
OUTPUT
  data
    status: 0
    execute_response [1]
  status: Success
  message
  operation: null
  execution_time
```

![Step output nesting](images/fmg_step_output_nesting.png?height=330px)

Inside `execute_response[0].response.results` there are **two** collections:

```json
{
  "current": {
    "name": "FortiOS", "id": "current", "version": "v7.2.13",
    "major": 7, "minor": 2, "patch": 13, "build": 1762,
    "release-type": "GA", "maturity": "M", "source": "current",
    "platform-id": "FGVMK6"
  },
  "available": [
    {
      "name": "FortiOS", "id": "07004000FIMG0013704012", "version": "v7.4.12",
      "major": 7, "minor": 4, "patch": 12, "build": 2902,
      "release-type": "GA", "maturity": "M", "source": "fortiguard"
    }
  ]
}
```

| Field                    | Why it matters                                                        |
|--------------------------|-----------------------------------------------------------------------|
| `current`                | The firmware the device is running right now                          |
| `available`              | Every image the device can move to -- roughly 99 entries               |
| `id`                     | The FortiManager-internal image identifier the upgrade call needs     |
| `major` / `minor` / `patch` | The version, already split for you -- match on these, not on strings |
| `maturity`               | `M` (mature) or `F` (feature)                                         |
| `source`                 | `fortiguard` for downloadable images, `current` for the running one   |

{{% notice warning %}}
**The version the device is already running never appears in `available`.** On a box running 7.2.13, the `available` list tops out at 7.2.12 for that branch. If you write a playbook that "upgrades" a device to the version it already has, it will always fail to resolve an ID. Pick a target the device can actually move to.
{{% /notice %}}

> **Verify:** The step output shows `status: Success`, and `data.execute_response[0].response.results` contains a `current` object and an `available` array with many entries.

---

## 4. Resolve the target firmware ID

The upgrade call needs the image `id`, not a version string, so match your target version against the `available` list.

18. Drag out a new step from **Get Available Firmware** and select **Code Snippet** (under **EXECUTE**)
19. Fill in the step:

    | Field             | Value                  |
    |-------------------|------------------------|
    | **Step Name**     | `Resolve Firmware ID`  |
    | **Configuration** | `default`              |
    | **Action**        | `Execute Python Code`  |

20. In the **Python Function** editor, enter:

    ```python
    import json
    resp = json.loads('''{{ vars.steps.Get_Available_Firmware.data | tojson }}''')
    er = resp.get("execute_response", [])
    results = er[0].get("response", {}).get("results", {}) if er else {}
    available = results.get("available", [])
    current = results.get("current", {})
    target_major, target_minor, target_patch = 7, 4, 12
    firmware_id = None
    for fw in available:
        if (fw.get("major") == target_major
                and fw.get("minor") == target_minor
                and fw.get("patch") == target_patch):
            firmware_id = fw.get("id")
            break
    print(json.dumps({
        "firmware_id": firmware_id,
        "current": current.get("version"),
        "available_count": len(available),
    }))
    ```

    ![Code Snippet step](images/fmg_code_snippet_step.png?height=640px)

21. Click **Save**, then **Save Playbook**, and run the playbook again

{{% notice warning %}}
Two traps in this step:

- The **Action** dropdown offers both `Execute Python Code` and `Execute Python Code (Deprecated)`. Pick the first.
- The Code Snippet sandbox **restricts Python builtins**. Using `next()` fails the step with `Uses of ['next'] is restricted in the code snippet. Remove ['next'] from the code snippet and retry, or add it in connector configuration.` The explicit `for` loop above is safe; if you need a restricted builtin, allow it in the connector configuration.
{{% /notice %}}

### What you'll see

A Code Snippet step puts whatever you `print` under `data.code_output`:

```
OUTPUT
  data
    code_output
      current : v7.2.13
      firmware_id : 07004000FIMG0013704012
      available_count : 99
  status: Success
```

![Code Snippet output](images/fmg_code_output.png?height=380px)

> **Verify:** `data.code_output.firmware_id` is a non-null image ID, and `available_count` is greater than zero.

---

## 5. Referencing step output in Jinja

Both of the paths above follow the same rule, and it is the most common source of broken FMG playbooks:

| What you want                   | Correct expression                                                  |
|---------------------------------|---------------------------------------------------------------------|
| A playbook variable             | `{{vars.device_name}}`                                              |
| A connector step's API response | `{{vars.steps.Get_Available_Firmware.data.execute_response}}`        |
| A Code Snippet's printed output | `{{vars.steps.Resolve_Firmware_ID.data.code_output.firmware_id}}`    |

{{% notice warning %}}
Every step's result is nested under **`data`**. Expressions like `vars.steps.Get_Available_Firmware.execute_response` or `vars.steps.Resolve_Firmware_ID.output.firmware_id` silently resolve to nothing -- the step runs, the playbook continues, and you get an empty value instead of an error. Spaces in a step name become underscores.
{{% /notice %}}

---

## 6. Branch on whether firmware was found

Add a **Decision** step (under **EVALUATE**) after `Resolve Firmware ID` so the playbook only attempts an upgrade when an ID was actually resolved.

The Decision editor is built from numbered **Condition** blocks plus one **Default Step**:

![Decision step editor](images/fmg_decision_step.png?height=580px)

Under **Condition 1**, enter the expression:

```
vars.steps.Resolve_Firmware_ID.data.code_output.firmware_id != None
```

Then set **Select A Step To Execute** to your upgrade step, and give it a **Branch Tooltip** -- that text becomes the label drawn on the connector in the canvas. Under **Default Step**, point **Select Default Step To Execute** at your "not found" path.

{{% notice warning %}}
**Write the condition without `{{ }}`.** The field is documented in the UI as *"Only advanced expression is available"* and FortiSOAR wraps the expression in braces itself when you save. Adding your own produces a doubly-wrapped expression. This matches the **Condition** and **Loop** boxes in the Step Utilities bar, which are brace-free for the same reason -- and it is the opposite of every other Jinja field in the designer.
{{% /notice %}}

---

## 7. Trigger the firmware upgrade

This is the step that actually changes the device.

22. Drag out a new step from the Decision's "found" branch and select **Connector > Fortinet FortiManager JSON RPC**
23. Fill in the step:

    | Field             | Value                                     |
    |-------------------|-------------------------------------------|
    | **Step Name**     | `Trigger Upgrade`                         |
    | **Configuration** | your FortiManager connector configuration |
    | **Action**        | `JSON RPC Exec`                           |
    | **URL**           | `/sys/proxy/json`                         |
    | **Track Task**    | unchecked                                 |

24. In **Data**, enter:

    ```json
    {"action": "post", "resource": "/api/v2/monitor/system/firmware/upgrade", "target": ["adom/root/device/{{vars.device_name}}"], "payload": {"source": "fortiguard", "filename": "{{vars.steps.Resolve_Firmware_ID.data.code_output.firmware_id}}"}}
    ```

25. Click **Save**, then **Save Playbook**, and run it

The finished step looks like this -- note that **Track Task** is off, so none of the task-timeout fields appear:

![Trigger Upgrade step](images/fmg_trigger_upgrade_step.png?height=600px)

### Key fields explained

| Field      | Value                                        | Why                                                    |
|------------|----------------------------------------------|--------------------------------------------------------|
| `action`   | `post`                                       | The upgrade is a POST to the FortiOS API                |
| `resource` | `/api/v2/monitor/system/firmware/upgrade`    | The FortiOS firmware upgrade endpoint                   |
| `source`   | `fortiguard`                                 | Pull the image from FortiGuard -- no staging in FMG      |
| `filename` | The image `id` resolved in step 4            | Identifies which image to install                       |

{{% notice note %}}
The `source` field controls where the image comes from -- `fortiguard` pulls directly from FortiGuard (needs an internet-connected FortiGate), `fmgbased` uses an image staged in FortiManager's repository. Use `fortiguard` unless you have pre-staged images.
{{% /notice %}}

{{% notice note %}}
**Leave `Track Task` unchecked.** Unlike the policy install in the [provisioning ladder](/chapter-02-ftnt-apis/45-fmg-provisioning-ladder), this call is fire-and-forget: FortiManager accepts the request immediately and the FortiGate reboots asynchronously. There is no FMG task object to poll.
{{% /notice %}}

### What you'll see

The response below was captured from a real upgrade run on a device that was on 7.0.19 at the time, which is why the version and build differ from the worked example above:

```json
{
  "execute_response": [
    {
      "response": {
        "http_method": "POST",
        "results": { "status": "success" },
        "vdom": "root",
        "path": "system",
        "name": "firmware",
        "action": "upgrade",
        "status": "success",
        "serial": "<your-fortigate-serial>",
        "version": "v7.0.19",
        "build": 696
      },
      "status": { "code": 0, "message": "OK" },
      "target": "fgt-2"
    }
  ],
  "status": 0
}
```

{{% notice warning %}}
Two things about this response mislead people:

- There is **no `http_status` field**. Acceptance is signalled by `response.status` being `success` and the sibling `status.code` being `0`.
- `version` and `build` report the **firmware the device was running when it accepted the request** -- the old version, not the target. Seeing `v7.0.19` here does not mean the upgrade failed.
{{% /notice %}}

> **Verify:** `response.status` is `success` and `status.code` is `0`. Within a minute or two the FortiGate disconnects from FortiManager to reboot.

---

## 8. Verify the upgrade completed

The device reboots and reconnects to FortiManager. To confirm the new firmware, read it back with the same proxy call from step 3 and look at `current`:

```json
{
  "current": {
    "version": "v7.2.13",
    "major": 7, "minor": 2, "patch": 13,
    "build": 1762,
    "release-type": "GA", "maturity": "M"
  }
}
```

{{% notice warning %}}
**Do not verify with the `os_ver` field from `/dvmdb/adom/root/device`.** It is not the running version and it does not change the way you expect. After a real upgrade from 7.0.19 to 7.2.13, the device database reports:

```json
{ "os_ver": "7.0", "mr": 2, "patch": 13, "build": 1762, "conn_status": "up" }
```

`os_ver` still reads `7.0` on a device running 7.2.13. If you check `os_ver` alone you will wrongly conclude the upgrade failed. Reconstruct the version as `<major from os_ver>.<mr>.<patch>` -- or just read `current.version` through the proxy, which is unambiguous.
{{% /notice %}}

{{% notice tip %}}
The device shows `conn_status: down` while it reboots, then returns to `up` on the new firmware. If you automate this, put a **Wait** step (under **EVALUATE**) between the upgrade and the verify. There is no step called "Delay".
{{% /notice %}}

> **Verify:** The proxy's `current.version` reports your target version, and `conn_status` is back to `up`.

---

## Troubleshooting

### "No tunnel" on any proxy call

If the FortiGate's management tunnel is down, the proxy fails in a shape that is easy to misread:

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

{{% notice warning %}}
Note what is **missing**: there is no `response` key at all. Playbook logic that reaches straight for `execute_response[0].response.results` will fail with a confusing error rather than a clear "device unreachable". Guard for the `response` key before indexing into it -- the Python in step 4 does this with `.get("response", {})`.

Also note the outer `status` is still `0`. The transport succeeded; only the proxied call failed.
{{% /notice %}}

Check the device's `conn_status` in FortiManager before assuming your playbook is at fault.

---

## Summary

You've built a playbook that upgrades FortiGate firmware from SOAR using FortiManager as a proxy:

- ✅ Listed available firmware via `/sys/proxy/json` → `/api/v2/monitor/system/firmware`
- ✅ Resolved the image `id` for a target version with a Code Snippet step
- ✅ Triggered the upgrade via `/sys/proxy/json` → `/api/v2/monitor/system/firmware/upgrade`
- ✅ Verified the new version from the proxy's `current` object

### Key takeaways

| Concept                | What you learned                                                                       |
|------------------------|----------------------------------------------------------------------------------------|
| **Proxy pattern**      | FMG `/sys/proxy/json` forwards REST calls to managed FortiGates -- no direct FGT auth     |
| **Firmware `id`**      | The upgrade needs the FortiManager-internal `id`, not a version string                  |
| **`current` vs `available`** | The running version is never in `available` -- you cannot "upgrade" to it           |
| **Output nesting**     | Every step's result lives under `data`; Code Snippet output under `data.code_output`    |
| **DEBUG mode**         | Step input/output is only recorded when the playbook runs in DEBUG                      |
| **Fire-and-forget**    | The upgrade returns immediately with no task to poll; don't set `Track Task`            |
| **`os_ver` lies**      | It does not track the running version -- verify with the proxy's `current.version`       |

### Real-world extension

In a PSIRT response scenario, this playbook would be triggered from a PSIRT alert. A companion playbook reads affected FortiOS version ranges from the advisory, pulls all managed FortiGates from `/dvmdb/adom/<adom>/device`, cross-references each device's current version, and produces a `vulnerableDevices` list. The upgrade playbook then loops over that list, upgrading every vulnerable device in one run.
