---
title: "Troubleshooting"
linkTitle: "Troubleshooting"
weight: 50
description: "How to solve common problems when using Fabric Studio"
---

This guide covers common issues you may encounter when using Fabric Studio and provides step-by-step solutions.

## Unable to SSH to Device

If you cannot SSH to a device from outside the Fabric Studio native console, SSH access may be disabled at either the global or device level.

### Understanding SSH Access Levels

**Global Settings Impact:**
- By default, SSH access via public internet is **disabled**
- **Admin & Guest** setting means you **must** be logged into the Fabric Studio web frontend to access devices via SSH web frontend

### Global Settings Configuration

First, verify SSH access is enabled at the system level:

1. Navigate to **System > Settings** in Fabric Studio
2. Ensure both **HTTPS** and **SSH** ports are enabled

![Global SSH Settings](img_2.png?height=400px)

### Device Level Configuration

After confirming global settings, configure device-specific access:

#### Step 1: Access Device Configuration
1. In the Fabric configuration, **right-click** your device
2. Select **Edit** from the context menu

![Device Edit Menu](img.png?height=350px)

#### Step 2: Modify Access Settings
1. Scroll down to the **Access** section
2. **Expand** the Access section
3. Change both **HTTPS** and **SSH** settings:
   - From: `Admin & Guest`
   - To: `Any`

![Access Configuration](img_1.png?height=400px)

{{% notice info %}}
**Additional Resources:** For comprehensive information on Security Policies, visit the [Fabric Studio Documentation](https://register.fabricstudio.net/docs/fabric-studio/2.0.2/security.html#ssh-access-to-device)
{{% /notice %}}

## Adding Access That Isn't Listed

If SSH, HTTP, or HTTPS isn't available in a device's Access section, there are two
different ways to add it — and picking the wrong one costs you a lot of time.

| You want to… | Do this |
|---|---|
| Add access to **one existing VM** | Use the CLI: [VM Access]({{% relref "/06-handy-commands/02-vm-access" %}}). One command, no image changes, no repository refresh. |
| Add access to **every future VM built from a firmware image** | Edit the image's `.meta` file — the procedure below. |

**For a single device, use the [VM Access]({{% relref "/06-handy-commands/02-vm-access" %}})
page.** `model vm access create` adds the entry directly to the VM model. The
`.meta` procedure below edits the *firmware image*, so it only affects VMs
deployed from that image afterwards — it is not the quick fix for one device.

### Baking access into a firmware image

Use this when you want the access type present by default on every VM deployed
from an image.

### Prerequisites

Before proceeding, note your device's firmware name. In this example: `Ubuntu-Branch2.final.qcow2`

![Firmware Name](firmware_name_used.png)

### Step-by-Step Process

#### Step 1: Access CLI
Open the CLI interface in Fabric Studio.

#### Step 2: Navigate to Firmware Directory
```bash
system repository home shell
cd firmwares/
```

#### Step 3: Edit Meta File
Replace `<firmware-name>` with your actual firmware name:
```bash
vi <firmware-name>.meta
# Example: vi Ubuntu-Branch2.final.qcow2.meta
```

![CLI Commands Example](example_commands.png)

#### Step 4: Add SSH Access Entry
1. Use arrow keys or press `j` to navigate to the **accesses** section
2. Position cursor on the **VNC access line**
3. Press `o` to create a new line below VNC
4. Paste the following line:
   ```xml
   <access path="" port="22" type="SSH"></access>
   ```

You should now see two access entries:

![Two Access Entries](two_access_entries.png)

#### Step 5: Save Changes
1. Press `ESC` to exit insert mode
2. Type `:wq` (write and quit)
3. Press `Enter` to confirm

#### Step 6: Verify Changes (Optional)
```bash
less <firmware-name>.meta
# Press 'q' to exit viewer
```

#### Step 7: Return to Main Shell
```bash
exit
```

![CLI Navigation](img_3.png)

### Repository Synchronization

{{% notice warning %}}
**Important:** After modifying meta files directly, you **must** inform Fabric Studio of changes by performing a repository sync.
{{% /notice %}}

#### Refresh Repository
```bash
system repository home refresh
```

The refresh command will display changes made to your firmware's meta file:

![Repository Sync Changes](repo_sync_changes.png)

### Verify and Apply Changes

#### Step 1: Confirm UI Changes
1. Navigate back to the Fabric Studio UI
2. **Refresh** the page
3. Open the modified device
4. Confirm **SSH** is now available in the Access section

![SSH Access Now Present](ssh_access_now_present.png)

#### Step 2: Sync Device Configuration
The meta file changes won't take effect on installed fabrics until you perform a device sync:

1. Initiate a **Sync** on the device
2. During sync/install, verify that Fabric Studio creates a port forward for SSH

![Device Sync SSH Access](device_sync_access_shh.png)

## Adding HTTP/HTTPS Access to One Device

If HTTPS is missing from a single device's Access section, add it from the CLI —
no image edit and no repository refresh needed.

### Initial Assessment

When HTTPS is not listed in the Access section:

![No SSH Access](no_ssh_access.png?height=500px)

### Step-by-Step Process

#### Step 1: Locate VM ID

You can read it from the UI — click the **Info** tab, scroll to the **JSON
format** of access settings, and note the **VM ID** from the `vm` field
(example: `66`):

![Find VM ID](find_vm_id.png)

Or list it from the CLI, where the first column is the VM ID:

```bash
(cmm-master-fs-001) # model fabric vm list 5
40 fgt1 [fgt000] (FGT)
41 lxc1 [lxc000] (LXC)
```

#### Step 2: Access SSH Interface
Click the **SSH** button in Fabric Studio:

![SSH to Fabric](ssh_to_fabric.png)

#### Step 3: Create HTTPS Access
Execute the following command, replacing `66` with your actual VM ID:

```bash
(cmm-master-fs-001) # model vm access create '{"vm": 66, "type": "HTTPS", "mode": "PUBLIC", "name": "HTTPS", "dport": 443}'
115 HTTPS PUBLIC access to lxc1 from 13001 to 443
```

{{% notice warning %}}
**Use `"mode": "PUBLIC"`, not `PRIVATE`.** A `PRIVATE` entry is created
successfully and appears in every listing, but it's reachable only inside the pod
— no external port is opened. `PUBLIC` is what lets you connect from your own
machine.
{{% /notice %}}

#### Step 4: Sync the device

The entry is in the model, but nothing is listening until you push it to the
running device:

```bash
(cmm-master-fs-001) # runtime vm synchronize 66
558 [admin] "Synchronize 'lxc1' device" running since 2026-07-16 18:03:18+00:00

(cmm-master-fs-001) # task detail 558
558 "Synchronize 'lxc1' device" ends with 0 code
```

Then connect on the port from the create output — `https://<pod-host>:13001` above.

For the full reference — access types, `HTTPS2HTTP` for plain-HTTP guests, the
pod-wide security gate, and updating or deleting entries — see
[VM Access]({{% relref "/06-handy-commands/02-vm-access" %}}).

## Additional Resources

For more comprehensive troubleshooting assistance, consult the [Fabric Studio Documentation](https://register.fabricstudio.net/docs/fabric-studio/2.0.2/troubleshooting.html) which covers:

- **Fabric Studio Logs** - Analyzing system logs for debugging
- **SystemD Journal Logs** - Service-level log analysis
- **Network Packet Sniffing** - Traffic analysis and debugging
- **Storage Issues** - Resolving out-of-space errors
- **File Transfer Problems** - Fixing SCP transfer failures

{{% notice tip %}}
**Pro Tip:** Always verify changes at both the global and device level when troubleshooting access issues. Many problems stem from mismatched security settings between these two levels.
{{% /notice %}}