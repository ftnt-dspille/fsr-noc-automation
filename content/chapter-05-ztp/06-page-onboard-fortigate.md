---
title: Onboard a FortiGate
menuTitle: Onboard a FortiGate
weight: 60
tags: hands-on
---

In this section we’ll onboard a FortiGate manually so that it checks into FortiManager. Onboarding a device to FortiManager can be done automatically using various methods (DHCP option, FortiZTP, FortiDeploy SKU), but we’ll do it manually for this lab.

---

{{% notice warning %}}
Do not Authorize Branch1 during this process. We will do that later.
{{% /notice %}}

## Onboard a FortiGate
1. Login to Branch1 using admin/```fortinet```
2. Navigate to **Security Fabric > Fabric Connectors**.
3. Click **Central Management**
    - Click **Enabled**
    - Type ```192.168.0.2``` in the **IP Address** field.
    - Click OK

![Authorize FMG](images/authorize_fmg.png)


## Confirm FortiGate is unauthorized in FortiManager
1. Login to FortiManager using admin/```fortinet```
2. Navigate to **Device Manager > Unauthorized Devices**
3. Confirm that the Branch1 FortiGate is listed

{{% notice warning %}}
Do not Authorize Branch1 here. Our ZTP profile will do this for us.
{{% /notice %}}

![Unauthorized branch1](images/unauthed_devices.png)

## Create Policy Package
1. Navigate to **Policy & Objects > Policy Package**
2. Select **Policy Package** and click **New**
![create_policy_package](images/create_policy_package.png)
3. Type in ```Golden_Branch``` for the **Name** and click **OK** at the bottom of the page.

## Create Policy
1. Select **Policy Packages > Golden_Branch > Firewall Policy**
![golden_branch](images/golden_branch.png)
2. Click **Create New > Create New**  to create a new policy
![create_new_policy](images/create_new_policy.png)
3. Set the following fields on the _Create New Firewall Policy_ page (leave the rest as default):
    - **Name**: `Allow port2 to Internet`
    - **Incoming Interface**: `port2`
    - **Outgoing Interface**: `port1`
    - **Source**: `RFC1918-10`
    - **Destination**: `all`
    - **Service**: `HTTPS`
    - **Action**: `Accept`
    - **NAT**: `Enable`
    - **Change Note**: `Policy Creation`
4. Click **OK** at the bottom of the page.

You now have your first policy!
![new_policy](images/new_policy.png)
