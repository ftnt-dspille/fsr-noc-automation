---
title: "Export .fpoc and Upload Directly"
linkTitle: "Export .fpoc and import Directly"
weight: 10
description: "Steps to migrate FortiDemo environments from FNDN to Fabric Studio"
---

## Overview

Now that FortiPOC, the underlying tool that runs demos in FNDN, is reaching End of Life (EOL), we need to migrate virtual machines to Fabric Studio. This process involves working with two FortiDemo environments: your original demo and a blank Fabric Studio demo.

## Migration Process

### 1. Export from FortiPOC

#### Spin up FortiDemo in FNDN

As a CSE, you should be familiar with this process, but here are the steps for reference. These examples use a FortiSOAR demo, but you should choose your corresponding demo.

##### Navigate to FNDN Demo

After you have a demo launched and in the **Running** state, click on the Demo. Locate the **FortiPOC Dashboard** button.

![FortiPOC Dashboard Button](images/img_27.png?height=400px)

{{% notice tip %}}
If you don't have a button for this, you can access the device by going to the Demo IP or Hostname via port 443. To find your hostname, open any other HTTP/HTTPS button and remove everything after and including the colon in your URL. For example, removing
`:14004/ui/login` will take you to the FortiPOC dashboard.
{{% /notice %}}

![URL modification example](images/img_28.png?height=350px)

##### Login to FortiPOC Dashboard

1. Login with the admin credentials. On my instance that is user/pass `admin`/`fabricadmin`
   ![FortiPOC Login Screen](images/img_30.png?height=300px)

2. On the left side, navigate to **PoCs > Definitions**
   ![PoC Definitions Navigation](images/img_31.png?height=400px)

##### Export FortiPOC Demo

{{% notice important %}}
Before exporting, ensure your original FortiDemo is fully functional and all VMs are running properly.
{{% /notice %}}

1. Click the export button and save the file
   ![Export Button](images/img_32.png)

{{% notice note %}}
If you have multiple PoCs, only export the POC that is running.
{{% /notice %}}

2. Wait for the file to finish downloading. It can sometimes be a large file (~1 GB for bigger demos).

You should now have a file with a name ending in .fpoc.

### 2. Create Fabric Studio Instance

#### Spin up Fabric Studio in FNDN

{{% notice info %}}
After launching your original FortiDemo, you'll need to create a new Fabric Studio instance in FNDN to migrate your demo.
{{% /notice %}}

1. Navigate to the FNDN portal
2. Go to FortiDemo > Fortinet Employee > Advanced Demos
3. Click **Create Demo**
   ![Create Demo Button](images/img_33.png?height=200px)
4. Fill in the Demo Name and Lab Purpose fields
5. Search for `Fabric-Studio` in the Type Dropdown. Select the first option unless you know your instance needs a large amount of CPU/RAM
   - Fabric-Studio-Empty has 8 CPU, 40GB RAM, 365GB Storage
   - Fabric-Studio-Empty-Big has 20 CPU, 100GB RAM, and 365GB Storage
     ![Fabric Studio Type Selection](images/img_35.png?height=400px)
6. Click Create

Wait until the Fabric Studio demo is ready.

### 3. Import and Configure

#### Login to Fabric Studio

By this point you should have two FNDN instances.
![Two FNDN Instances](images/img_36.png)

1. Click your Fabric Studio instance
2. Click the HTTPS Button for your **Dashboard**
   ![Dashboard HTTPS Button](images/img_37.png?height=200px)
3. Log in with the provided credentials `admin`/`B8bR!c7dM1n6*8`
   ![Fabric Studio Login](images/img_38.png)

You should now see the Fabric Studio Dashboard
![Fabric Studio Dashboard](images/img_39.png?height=500px)

#### Import FPOC File

1. Navigate to **Fabric Workspace** and click **Import**
   ![Import Button](images/img_24.png)

2. Select your .fpoc file that you exported from your original demo and click **OK**
   ![Select FPOC File](images/img_25.png?height=350px)

3. Wait for the import to complete

4. After import, select your new Fabric and click **Edit**
   ![Edit Imported Fabric](images/img_26.png)

5. Confirm that everything looks correct and that all devices were imported properly

{{% notice warning %}}
In some cases, firmware for certain devices might not be found. This often happens when devices were using snapshots or custom firmware, which are not exportable from FortiDemo. You may need to manually upload firmware for these devices, or follow the migration steps outlined in the next section.

![The imported fabric with devices whose firmware wasn't found](images/img_40.png?height=500px)
{{% /notice %}}

#### Migrate Firmware if Needed

In some cases, you may want to reuse firmware images from another Fabric Studio instance instead of re-uploading them. When the **source system (System A)** resides in a private lab and the **destination (System B)** is reachable over the internet, you can **run `rsync` from System A** to push the firmware files to System B.

##### Prerequisites

- Both instances must be on the same firmware version.
- Admin credentials and IPs/hostnames for both systems.
- SSH access from **System A → System B** (outbound allowed).

##### Steps

1. **On the source Fabric Studio (System A)**, open the CLI and navigate to the firmware directory:

   ```bash
   system repository home shell
   cd firmwares
   ```

2. **Perform a dry-run** to preview the files that would be transferred:

   ```bash
   rsync -avzn --progress --exclude 'Package.xml*' ./ admin@<DEST_HOST>:firmwares/
   ```

   ![rsync dry-run listing the firmware files to transfer](dry_run.png)

3. **Run the actual transfer** once verified:

   ```bash
   rsync -avz --progress --exclude 'Package.xml*' ./ admin@<DEST_HOST>:firmwares/
   ```

   _Example:_

   ```bash
   rsync -avz --progress --exclude 'Package.xml*' ./ admin@dspille-fabric-studio-dest.fortidemo.fortinet.com:firmwares/
   ```

4. **On the destination Fabric Studio (System B)**, verify the results:

   ```bash
   system repository home shell
   cd firmwares
   ls -lh
   ```

   Confirm all `.qcow2` and `.zip` firmware files are present, and `Package.xml` / `Package.xml.gz` remain unchanged.
   ![The destination's firmwares directory after rsync](after_rsync_b.png)

{{% notice note %}}
You can repeat the `rsync` command from **System A** to keep firmware directories synchronized. Avoid using `--delete` to prevent removing files that exist only on the destination.
{{% /notice %}}

#### Sync the Home Firmware Repository

1. Navigate to **Repositories > Home > Firmwares**
2. Click the **Sync** button to refresh the firmware list
3. Confirm all required firmware is now available
   ![Repositories > Home > Firmwares after Sync](firmware_after_sync_b.png)

### 4. Install and Test

#### Run Fabric Demo

Once everything looks ok, you can Install the demo.

1. Click **Install**

2. Wait for the devices to all install.

#### Test the Environment

After installation:

1. Verify all devices are running properly
2. Test connectivity between devices
3. Confirm all services are working as expected
4. Document any issues or differences from the original FNDN environment

#### IMPORTANT: Saving new Changes

{{% notice style="warning" title="PLEASE READ" %}}
Please read this section, otherwise you may end up losing hours of work and changes you make to the Fabric template
{{% /notice %}}

A Fabric template is a stateful configuration, meaning the firmware, network connections, and device config applied to the template will get provisioned on the template install. But what if you need to make changes to the device's config? If you change any device settings (i.e. log into a device via CLI/GUI and configure it), you need to Backup that config so that the next time Fabric Studio does an Install, it knows what extra config can be applied.

##### Preferred Method Backup Config

The best option is saving the config through the **Right-Click-Device > Config & License > Backup Config**, with **Update device settings** on. See [Saving State]({{% relref "/02-building-fabrics/05-saving-state" %}}).

##### Less preferred: Backup Disk

For Linux devices whose state isn't in a config file, **Disk > Backup as Firmware** saves the whole disk as a new firmware image. It's large and slow to move, so prefer Backup Config where it's enough. See [Back up a whole disk instead]({{% relref "/02-building-fabrics/05-saving-state#back-up-a-whole-disk-instead" %}}).

#### Export the Fabric

The team that manages FNDN's FortiDemo is very busy and tight on resources. So it may take some time before they can make a snapshot of the instance and save it. Since the FortiDemo spin has a countdown timer until it auto deletes, it's advised to grab an export from Fabric Studio in case you forget to extend the expiry.

Back up each device's configuration first, then use the fabric's **☰ > Export
Fabric**. Your browser downloads `<fabric>-<version>.zip`. Step-by-step, with
screenshots and what the zip contains:
[Export your own fabric as a template]({{% relref "/02-building-fabrics/06-templates#export-your-own-fabric-as-a-template" %}}).

### 5. Complete the Migration

#### Notify David Chan's Team

Once your migration is complete and tested:

Obtain the **Demo Type**, **Old demo FortiPOC Dashboard URL**, and the new **Fabric Studio Dashboard URL**.

1. Send an email to David Chan's team with details about your new Fabric Studio instance

- **TO**: `dchan@fortinet.com`
- **CC**: `jhuber@fortinet.com;btrulove@fortinet.com;dspille@fortinet.com`
- **Subject**: `Fabric Studio Migration`
- **BODY**

  ```text
  Hello,

  We have completed the migration of FortiDemo Type "<DEMO_TYPE>" from FortiPOC to Fabric Studio.

  Old FortiPOC URL: <FORTIPOC_DASHBOARD_URL>
  New Fabric Studio URL: <FABRIC_STUDIO_DASHBOARD_URL>

  Please proceed with making a new golden image for the Fabric Studio instance.
  ```

## Advanced Operations

### Managing Custom Images

#### Uploading Custom Images

If you need to use an image that's not available in the Remote Firmwares in Fabric Studio:

1. Navigate to **Repositories > Home > Firmwares**

2. Click **Upload**
   ![Upload Firmware](images/img_23.png)

3. Click **Select files** and find your firmware file (must be KVM or QCOW2 format)

{{% notice tip %}}
If your firmware image is larger than 2GB, you'll need to use SCP to transfer it to the host instead of uploading through the GUI.
{{% /notice %}}

Use the following command to upload large files:

```bash
scp <image-name> admin@<Fabric_Studio_IP_or_HOST>:firmwares/
```

Example:

```bash
scp fortisoar-kvm-enterprise-7.6.1-5275.qcow2 admin@dspille-fabric-studio.fortidemo.fortinet.com:firmwares/
```

Enter the password `B8bR!c7dM1n6*8` when prompted.

4. After the file is transferred, click the **Sync** button and refresh the browser
   ![Firmware List](images/img_1.png?height=300px)

Note the **Type** column that indicates the firmware classification (e.g., "SOAR"). Fabric Studio uses this to configure and manage the firmware properly.

#### Using Custom Firmware in a Fabric

1. Navigate to Fabric Workspace and click **Create > Fabric**
   ![Create Fabric](images/img_2.png?height=300px)

2. Select the ![Plus Icon](images/img_4.png?classes=inline) (plus sign) icon > **Device**
   ![Add Device](images/img_3.png?height=300px)

3. Select the type of device you want (by default, Fabric Studio searches the remote repository)
   ![Device Type Selection](images/img_5.png?height=300px)

4. Click **Browse**, select your custom firmware, then click **OK**
   ![Select Custom Firmware](images/img_6.png?height=300px)

5. Click **OK** on the Device dialog
   ![Device Dialog](images/img_7.png?height=300px)

### Device Management

#### Configure Fabric Device

A blank device usually requires additional configuration:

- Cable the device to **Internet Access** (the ISP Router behind it was called "NAT Internet" in older builds)
- Check its **Network Parameters** (the network its default route and DNS come from)
- Adjust CPU and RAM allocations
- Add a disk if needed
- Set its **Access** entries to the mode you need (e.g. SSH to **Any** to reach it from your own machine)

#### Install Fabric

Once your device is configured:

1. Click the **Install** button
   ![Install Button](images/img_8.png?height=400px)

2. Click **OK** to confirm
   ![Install Confirmation](images/img_9.png?height=150px)

3. Wait for the installation to finish
   ![Installation Progress](images/img_10.png?height=250px)

4. If you see errors, check the device Logs section
   ![Device Logs Button](images/img_11.png?height=250px)

   ![Device Logs](images/img_12.png?height=250px)

{{% notice note %}}
Common issues include missing licenses or FortiFlex configuration
{{% /notice %}}

![License Error](images/img_13.png?height=250px)

### License Management

#### Upload License to Fabric Studio

1. Navigate to **Repositories > Home > Licenses**

2. Click **Add > File upload**
   ![Upload License](images/img_15.png?height=250px)

3. Browse to and select your license file, then click **OK**
   ![Select License File](images/img_16.png?height=400px)

4. Verify your license is listed with the proper **Device Type**
   ![License List](images/img_17.png?height=250px)

{{% notice warning %}}
If you don't see a device type, ensure you haven't renamed your license file. Fabric Studio uses the filename to determine the device type.
{{% /notice %}}

#### Manually Assign a License

If Fabric Studio isn't detecting the device type:

1. Open a Fabric and edit the device
   ![Edit Device](images/img_18.png)

2. Under License, select **Custom** and click the **...** to select your license
   ![Custom License](images/img_19.png?height=600px)
   ![Select License](images/img_20.png)

3. Click **OK** to save changes

### Troubleshooting

#### Device Issues After Install

If a device shows a warning exclamation mark but is "Running", it means the device is still being provisioned:

1. Right-click the device and select **Log** to check progress
   ![Device Warning](images/img_21.png)
   ![Device Logs](images/img_22.png)

2. Review logs for specific errors or completion status

#### Accessing a Device After Install

To access your installed device:

1. Right-click the device in the diagram or select the device row in the table
2. Click **Access > HTTPS** (or your preferred access method)
