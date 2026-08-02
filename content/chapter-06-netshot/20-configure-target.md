---
title: "Configure Target"
linkTitle: "Configure Target"
weight: 20
---

## Update the Fortigate Target

1. Navigate to **Netshot > Targets**
   ![Navigating to Netshot > Targets](Images/nav_to_targets.png)
2. Click on **FG1**
   ![FG1 target record](Images/fg1_target.png?height=300px)
3. Click **Edit Record** at the bottom right
   ![Edit Record button](Images/edit_record.png)
4. Update the following fields
    - **Name**: `Branch1`
    - **IP**: `10.100.88.8`
    - **Device Password**: `<password from your instructor>`
      ![Target record with device credentials filled in](Images/img_1.png)
5. Click **Save** at the bottom left

## Trigger Netshot from the device

Click the tab **Netshot Data**, then click the button **Run Netshot**
![Run Netshot button on the Netshot Data tab](Images/run_netshot_on_device.png)

You will notice that the **Netshot Status** indicator shows _Running_
![Netshot Status indicator showing Running](Images/netshot_runnings.png)

You will also notice which data queries are complete or waiting
![Data queries showing complete and waiting states](Images/data_queries.png)

Once netshot completes, you should see a total score that the device earned from the various audits performed. The audit scores come from the profiles that were assigned to the device.
![Total compliance score earned by the device](Images/img_2.png?height=700px)

### Investigate the Results

1. Click on the row under netshot data called **get system status**
2. Click on the **Source Data** tab, and expand the **Normalized Data**
   ![Source Data tab with Normalized Data expanded](Images/img_3.png)
   Source data is the raw data from the query, and normalized data is what the raw data was transformed into. In this case, the data wasn't modified or cleaned in any way
3. Scroll down and to the **Output Data Reports** and click **License is Valid**
   ![Output Data Reports with License is Valid selected](Images/img_4.png)

Notice the settings here. This report is saying that the text field from the normalized data must contain a regex of `License Status(\s+)?: Valid` . If that **Regex Pattern Exists**, then the report gives out 25 points
![Output data report settings](Images/output_report.png)

## Understand Domains

Domains allow you to create a grouping of devices that needed audited.

1. Navigate to **Netshot > Domains**
2. Open the **Netshot Workshop** domain
3. Select the Targets Tab

Notice that the domain consists of 2 Fortigates and 1 Fortimanager
![Domain containing two FortiGates and one FortiManager](Images/domain_targets.png?height=500px)


## Understand Reports

1. Navigate to the **Reports** Module
    ![Navigating to the Reports module](Images/nav_reports.png)
2. Click **View** on the **Netshot Report Domain**
    ![View button on the Netshot Report Domain](Images/netshot_report.png)
3. Select the **Netshot Workshop** Domain for the Report Input
    ![Selecting the Netshot Workshop domain as report input](Images/select_domain_input.png)
4. Click **OK**

Check out the report, There were some exceptions found from the FMG because it did not meet the specified 7.6 version
![Rendered Netshot report](Images/report_display_netshot.png)