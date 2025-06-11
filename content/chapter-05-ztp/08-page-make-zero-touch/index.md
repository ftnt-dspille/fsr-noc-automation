---
title: Making ZTP "Zero Touch"
menuTitle: Making ZTP "Zero Touch"
weight: 80
tags: hands-on
---

So far there has been a lot of touch! But we're _very_ close to zero now. In this section we'll see how to make the ZTP process truly zero touch.

---

## Modify the ZTP Profile

1. Navigate to **FortiManager > ZTP Profiles** and edit the **Branch ZTP Profile**.
2. At the bottom right of the record click **Edit Record**
3. Change the **Assignment Mode** field to **Automatic**.
4. Click **Save**.

![Set ZTP profile to automatic](images/ztp_profile_auto.png)

---

## Import Playbook Collection

{{% resources style="green" title="Files" /%}}

1. Download **FOS ZTP Helpers.zip** file above
2. Go to **System > Application Editor> Import Wizard**
3. click **Import from File** and select the file **FOS ZTP Helpers.zip**
   ![Import Wizard](images/appeditor.png?height=300px)
4. Leave all the default settings and click ![Continue button](images/continue.png?height=40px&classes=inline) twice, and then click **Run Import**
   ![Select configuration to import](images/selectconfigs.png?height=250px)
5. The import should complete without error.

## Trigger ZTP

Let's now imagine that we have a new branch office **Branch2** that we need to onboard. Here is how we could do it using API

1. Navigate to **FortiManager > Devices**
2. Click the Execute button and select "Set FMG via FOS API" from the dropdown
   ![Set FMG via FOS API](images/set_fmg_via_fos_api.png)
3. Provide the following information
    - **FortiGate IP**: ```192.168.0.2```
    - **FortiManager**: ```192.168.0.3```
    - **Username**: ```admin```
    - **Password**: ```fortinet```
4. Click **Execute**

{{% notice note %}}
There is no Branch2 in our Evoke lab, but that playbook would have configured the FortiGate to register to FortiManager. Then the ZTP profile would have been automatically assigned to the device and provisioning would kick off.
{{% /notice %}}