---
title: "Unable to SSH or HTTPS to a Device"
linkTitle: "Device Access Blocked"
weight: 10
description: "SSH/HTTPS to a device fails from outside the Fabric Studio console: global and per-device access settings"
---


If you cannot SSH to a device from outside the Fabric Studio native console, SSH access may be disabled at either the global or device level.

If the connection opens but the login is refused, check the username and
password first: `admin` with the fabric password, unless the device has its
own password set. See
[Logins and passwords]({{% relref "/02-building-fabrics/02-first-fabric#logins-and-passwords" %}}).

## Understanding SSH Access Levels

**Global Settings Impact:**
- By default, SSH access via public internet is **disabled**
- **Admin & Guest** setting means you **must** be logged into the Fabric Studio web frontend to access devices via SSH web frontend

## Global Settings Configuration

First, verify SSH access is enabled at the system level:

1. Navigate to **System > Settings** in Fabric Studio
2. Ensure both **HTTPS** and **SSH** ports are enabled

![Global SSH Settings](images/img_2.png?height=400px)

## Device Level Configuration

After confirming global settings, configure device-specific access:

### Step 1: Access Device Configuration
1. In the Fabric configuration, **right-click** your device
2. Select **Edit** from the context menu

![Device Edit Menu](images/img.png?height=350px)

### Step 2: Modify Access Settings
1. Scroll down to the **Access** section
2. **Expand** the Access section
3. Change both **HTTPS** and **SSH** settings:
   - From: `Admin & Guest`
   - To: `Any`

![Access Configuration](images/img_1.png?height=400px)

{{% notice info %}}
**Additional Resources:** For comprehensive information on Security Policies, visit the [Fabric Studio Documentation](https://register.fabricstudio.net/docs/fabric-studio/2.0.2/security.html#ssh-access-to-device)
{{% /notice %}}
