---
title: "Deploy Fabric Studio"
linkTitle: "Self Host Fabric Studio"
weight: 10
description: "Deploying Fabric Studio in your own environment, and Fabric Studio Licensing"
---

## Overview

This guide covers the steps for deploying Fabric Studio (FS) in your own lab environment. This page is for those that want to host Fabric studio themselves. If you're looking for an easy way to test Fabric Studio, you can do that via FNDN. See [Spin up Fabric Studio in FNDN]({{% relref "/03-migrate-fpoc/1-export-import-directly#spin-up-fabric-studio-in-fndn" %}}).

## Download Fabric Studio

Download your Fabric Studio image from [Sharepoint](https://fortinet-my.sharepoint.com/personal/jparente_fortinet-us_com/_layouts/15/onedrive.aspx?id=%2Fpersonal%2Fjparente%5Ffortinet%2Dus%5Fcom%2FDocuments%2FFabric%20Studio%2F2%2E0&ga=1).

![Fabric Studio download page](images/img.png)

{{% notice note %}}
Only GCP or qcow2 images are available. If you need vmdk format, convert it:

```bash
qemu-img convert -f qcow2 -O vmdk source_image.qcow2 destination_image.vmdk
```
{{% /notice %}}

## Import to Hypervisor

Follow your hypervisor's instructions for uploading the image.

## Configure Network Interface

### Option 1: DHCP (Default)

By default, Fabric Studio uses DHCP on the mgmt1 interface. The "mgmt1" interface is the first interface connected on the system (e.g., ens3).

To verify the hardware address or the assigned IP address:

```bash
(lab-fs20) # system diagnose interfaces mgmt1
[
    {
        "addr_info": [
            {
                "broadcast": "10.222.9.255",
                "dynamic": true,
                "family": "inet",
                "label": "mgmt1",
                "local": "10.222.8.193",
                "preferred_life_time": 271,
                "prefixlen": 22,
                "scope": "global",
                "valid_life_time": 271
            },
            {
                "family": "inet6",
                "local": "fe80::5054:64ff:fe00:c100",
                "preferred_life_time": 4294967295,
                "prefixlen": 64,
                "scope": "link",
                "valid_life_time": 4294967295
            }
        ],
        "address": "52:54:64:00:c1:00",
    ...
```

### Option 2: Static IP

To configure a static address in the console:

```bash
(lab-fs20) # system mgmt interface configure
(configure)set mode static
(configure)set address 10.222.8.193 255.255.252.0
(configure)set gateway 10.222.11.254
(configure)set dns primary 10.222.11.254
(configure)end
(lab-fs20) #
```

## Licensing

### Generate License Token

1. Go to [https://register.fabricstudio.net/](https://register.fabricstudio.net/)
2. Log in using corporate SSO credentials
3. Navigate to **My Account**
   ![Account dashboard](images/img_1.png)

4. Select the **Tokens** tab
   ![Tokens tab](images/img_2.png)

5. Click the **+** icon to create a new token
6. Enter `Fabric Studio` as the Title and click Submit
   ![Create token](images/img_3.png)

7. Click the Copy button to copy the **Token+Secret**
   ![Copy token](images/img_8.png?height=300px)

### Register Your Instance

1. Connect to your Fabric Studio VM through HTTPS
2. Type `admin` as the user. There is not a password configured by default. Click **Login**
   ![Login screen](images/img_4.png)

3. Check the registration status on the dashboard
   ![Dashboard](images/img_5.png)

4. Go to System/Registration
5. Paste your token+secret and click Register
6. Wait for the success message
   ![Registration successful](images/img_6.png)
7. Navigate to **Repositories > Remote** to verify available Fabric templates
   ![Available templates](images/img_7.png?height=300px)

## Next Steps

After successful registration, you can begin using Fabric Studio to deploy templates and create your lab environments.