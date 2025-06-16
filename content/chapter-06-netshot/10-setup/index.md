---
title: "Setup"
linkTitle: "Setting up NetShot"
weight: 10
---

## Install Solution Pack

### Download Solution Pack

Download the Solution Pack file below

{{% resources style="green" title="Download me" pattern="FortiSOAR-netshot.*" /%}}

### Install Solution Pack

1. Login to FortiSOAR
2. Navigate to the Content Hub
   ![img_1.png](images/content_hub.png)
3. Select the **Manage** Tab
4. Click **Upload> Upload Solution Pack**
   ![img_1.png](images/upload_pack.png)
5. Select the File you downloaded
6. Click **Install**
   
   ![img.png](images/install_netshot_sp.png?height=500px)

7. Click **Confirm**
8. Wait for the SP to finish installing. Should take ~2 minutes

## Configure Code Snippet

We need to add a default configuration to the code snippet connector to make sure the playbooks have a valid one to use.

1. Search for `Code Snippet`
   ![img_2.png](images/search_code_snippet.png?height=400px)
2. Click anywhere on the connector to edit the configuration.
3. Click the checkbox's for both **Mark as Default Configuration** and **Allow Universal Imports**
   ![img_2.png](images/code_snippet_settings.png)
   {{% notice warning %}}
   These settings are critical to Netshot working properly.
   {{% /notice %}}
4. Click **Save**

## Add Permissions for the new Modules

1. Navigate to **System Settings > Roles**
   ![img_1.png](images/system_settings.png)
2. Open **Full App Permissions**
   ![img_1.png](images/img_1.png)
3. Click the highlighted **+** icon shown in the picture below.
   
   ![img.png](images/img.png?height=500px)

4. Click **Save**
5. After clicking Save, you should see a new section appear on the left navigation pane
   
   ![img_1.png](images/netshot_navigation.png)
   {{% notice tip %}}
   If you don't see the navigation for Netshot, log out of SOAR and log back in
   {{% /notice %}}

## Download Workshop File

Download the Workshop Example file below
{{% resources style="blue" title="Download me" pattern="FortiSOAR-Export.*" /%}}

## Import Netshot Workshop Settings

1. Navigate to **System Settings > Import Wizard.**
2. Click **Import From File** and import the Solution Pack you downloaded.
3. Select the `FortiSOAR-Export-NetshotWorkshop...` file
   ![img_1.png](images/import_workshop_records.png?height=400px)
   {{% notice warning %}}
   Make sure you see "X Records.." before proceeding. If you see other options, you likely selected the wrong file.
   {{% /notice %}}
4. Click **Continue** twice
   ![img_2.png](images/import_wizard_options.png)
5. Click **Run Import**
6. Wait around ~1 minute for the import to finish
   ![img_1.png](images/import_success.png?height=150px)
7. Click **Done**