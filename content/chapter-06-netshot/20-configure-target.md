---
title: "Configure Target"
linkTitle: "Configure Target"
weight: 20
---

## Update the Fortigate Target

1. Navigate to **Netshot > Targets**
   ![img.png](Images/nav_to_targets.png)
2. Click on **FG1**
   ![img.png](Images/fg1_target.png?height=300px)
3. Click **Edit Record** at the bottom right
   ![img.png](Images/edit_record.png)
4. Update the following fields
    - **Name**: `Branch1`
    - **IP**: `10.100.88.8`
    - **Device Password**: `$3curityFabric`
      ![img_1.png](Images/img_1.png)
5. Click **Save** at the bottom left

## Trigger Netshot from the device

Click the tab **Netshot Data**, then click the button **Run Netshot**
![img_2.png](Images/run_netshot_on_device.png)

You will notice that the **Netshot Status** indicator shows _Running_
![img_2.png](Images/netshot_runnings.png)

You will also notice which data queries are complete or waiting
![img_2.png](Images/data_queries.png)

Once netshot completes, you should see a total score that the device earned from the various audits performed. The audit scores come from the profiles that were assigned to the device.
![img_2.png](Images/img_2.png?height=700px)

### Investigate the Results

1. Click on the row under netshot data called **get system status**
2. Click on the **Source Data** tab, and expand the **Normalized Data**
   ![img_3.png](Images/img_3.png)
   Source data is the raw data from the query, and normalized data is what the raw data was transformed into. In this case, the data wasn't modified or cleaned in any way
3. Scroll down and to the **Output Data Reports** and click **License is Valid**
   ![img_4.png](Images/img_4.png)

Notice the settings here. This report is saying that the text field from the normalized data must contain a regex of `License Status(\s+)?: Valid` . If that **Regex Pattern Exists**, then the report gives out 25 points
![img_5.png](Images/output_report.png)

## Understand Domains

Domains allow you to create a grouping of devices that needed audited.

1. Navigate to **Netshot > Domains**
2. Open the **Netshot Workshop** domain
3. Select the Targets Tab

Notice that the domain consists of 2 Fortigates and 1 Fortimanager
![img_5.png](Images/domain_targets.png?height=500px)


## Understand Reports

1. Navigate to the **Reports** Module
    ![img_6.png](Images/nav_reports.png)
2. Click **View** on the **Netshot Report Domain**
    ![img_6.png](Images/netshot_report.png)
3. Select the **Netshot Workshop** Domain for the Report Input
    ![img_6.png](Images/select_domain_input.png)
4. Click **OK**

Check out the report, There were some exceptions found from the FMG because it did not meet the specified 7.6 version
![img_6.png](Images/report_display_netshot.png)