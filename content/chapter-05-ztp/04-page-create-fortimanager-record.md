---
title: Create FortiManager Record
menuTitle: Create FortiManager Record
weight: 40
tags: hands-on
---

We will begin configuring FortiSOAR to connect to FortiManager, which allows us to **manage** FortiManager.

---
### Create a manager record

1. Navigate to **FortiManager > Managers**
   {{% notice note %}}
   If you already see a Manager Record, you don't need to create a new one. You can skip to [here]({{< relref "#viewing-the-manager-record">}})
   ![img.png](manager_record_created.png)
   {{% /notice %}}
2. Click the ![Add button](images/add.png?classes=inline) button to add a new record.
   ![Add FortiManager Record](images/managers_module.png?height=500px)
2. Enter the following information:
    - **Manager Name**: ```FortiManager```
    - **Manager IP**: ```10.100.88.10```
    - **Admin RPC Username**: ```fortisoar```
    - **Admin RPC Password**: ```fortinet```
   
   ![Create FortiManager Record](images/create_manager_screen.png)

3. Click **Save**.

---

### Viewing the Manager record

You will now see the FortiManager record populated with information from the FortiManager API. FortiSOAR automatically created the connector configuration for us and retrieved details about the device

![FortiManager Record](images/manager_record.png?height=500px)

![FMG RPC Connector](images/fmg_rpc_connector.png?height=500px)

{{% notice note %}}
The health check is successful because the fortisoar user was already present on FortiManager. Normally you would need to create an api user with rest api permissions
{{% /notice %}}

## Bonus Points :money_with_wings:

Investigate the playbook that triggered when we created the FortiManager record. What did it do?