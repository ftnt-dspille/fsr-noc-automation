---
title: Hands-On Network Security Automation
menuTitle: Network Engineer Workshop
weight: 40
draft: true
tags: [ "knowledge", "hands-on", "network" ]
---

This hands-on workshop is designed specifically for network engineers to build practical security automation playbooks. You'll create real-world scenarios using FortiSOAR's built-in actions and simple Jinja2 templating.

## Workshop Overview

In this workshop, you'll build three progressive playbooks:
1. **Automated Threat IP Blocking** - Simple IP blocking with notifications
2. **Network Asset Enrichment** - Gather asset information for investigations
3. **Incident Response Workflow** - Coordinate team notifications and approvals

---

## Lab 1: Automated Threat IP Blocking

### Scenario
Your security team has detected a suspicious IP address in an alert. You need to quickly block this IP on FortiGate and notify the team.

### Objective
Create a simple playbook that blocks IPs from security alerts and sends notifications.

### Steps

#### 1. Create Your Workshop Collection
1. Navigate to **Automation > Playbooks**
2. Click **+ New Collection**
   - **Name**: `Network-Security-Workshop`
   - **Description**: `Simple Network Security Playbooks`
3. Click **Create**

#### 2. Build the IP Blocking Playbook
1. Click **+ New Playbook**
   - **Name**: `Block-Malicious-IP`
   - **Description**: `Block suspicious IP addresses from alerts`
2. Click **Create**

#### 3. Configure the Trigger
1. Select **Manual** trigger (easier for testing)
   - **Trigger Button Label**: `🚫 Block This IP`
   - **Module**: `Alerts`
   - **Requires Record**: `Yes`
2. Click **Save**

#### 4. Extract IP Address
1. Drag to create new step → Select **Set Variable**
   - **Step Name**: `Extract IP Address`
   - **Variables**:
     - **Name**: `suspicious_ip`
     - **Value**: `{{vars.input.records[0].sourceIp}}`
     - **Name**: `alert_id`
     - **Value**: `{{vars.input.records[0].id}}`
     - **Name**: `alert_name`
     - **Value**: `{{vars.input.records[0].name}}`
2. Click **Save**

#### 5. Check if IP Exists
1. Create new step → Select **Decision**
   - **Step Name**: `Valid IP Address?`
   - **Condition**: `{{vars.steps.Extract_IP_Address.suspicious_ip | length > 0}}`
   - **Description**: `Check if alert contains an IP address`
2. Click **Save**

#### 6. Block IP on FortiGate (True Path)
1. From **True** output, create step → Select **FortiGate** connector
   - **Step Name**: `Create Address Object`
   - **Action**: `Create Address Object`
   - **Configuration**:
     - **Name**: `Blocked-{{vars.steps.Extract_IP_Address.suspicious_ip}}`
     - **Type**: `ipmask`
     - **Subnet**: `{{vars.steps.Extract_IP_Address.suspicious_ip}}/32`
     - **Comment**: `Auto-blocked by SOAR - Alert: {{vars.steps.Extract_IP_Address.alert_name}}`
2. Click **Save**

#### 7. Update Firewall Policy
1. Create next step → Select **FortiGate** connector
   - **Step Name**: `Add to Deny Policy`
   - **Action**: `Update Firewall Policy`
   - **Configuration**:
     - **Policy Name**: `SOAR-Block-Policy`
     - **Source Address**: `Blocked-{{vars.steps.Extract_IP_Address.suspicious_ip}}`
     - **Action**: `deny`
2. Click **Save**

#### 8. Create Audit Record
1. Create step → Select **Create Record**
   - **Step Name**: `Log Blocking Action`
   - **Module**: `Comments` (or any available module)
   - **Fields**:
     - **Comment**: `IP {{vars.steps.Extract_IP_Address.suspicious_ip}} blocked automatically from alert {{vars.steps.Extract_IP_Address.alert_id}}`
     - **Type**: `Network Security Action`
2. Click **Save**

#### 9. Send Notification
1. Create step → Select **Send Email**
   - **Step Name**: `Notify Network Team`
   - **To**: `your-email@company.com`
   - **Subject**: `🚫 IP Blocked: {{vars.steps.Extract_IP_Address.suspicious_ip}}`
   - **Body**:
     ```
     AUTOMATED IP BLOCKING NOTIFICATION
     
     IP Address: {{vars.steps.Extract_IP_Address.suspicious_ip}}
     Alert ID: {{vars.steps.Extract_IP_Address.alert_id}}
     Alert Name: {{vars.steps.Extract_IP_Address.alert_name}}
     Action: IP blocked on FortiGate
     Time: {{globalVars.Current_Date}}
     
     Please verify the blocking was successful in FortiGate.
     ```
2. Click **Save**

#### 10. Handle No IP Case (False Path)
1. From **False** output of decision, create step → Select **Send Email**
   - **Step Name**: `Alert No IP Found`
   - **To**: `your-email@company.com`
   - **Subject**: `⚠️ No IP Address Found in Alert`
   - **Body**: `Alert {{vars.steps.Extract_IP_Address.alert_id}} does not contain a source IP address to block.`
2. Click **Save**

#### 11. Update Alert Status
1. Create final step → Select **Update Record**
   - **Step Name**: `Mark Alert Processed`
   - **Module**: `Alerts`
   - **Record IRI**: `{{vars.input.records[0]['@id']}}`
   - **Fields**:
     - **Status**: `In Progress`
     - **Comments**: `IP blocking action completed by SOAR`
2. Click **Save**

#### 12. Test Your Playbook
1. Click **Save Playbook**
2. Navigate to **Incident Response > Alerts**
3. Find or create an alert with a source IP
4. Click **Execute** and select **🚫 Block This IP**
5. Monitor the execution results

---

## Lab 2: Network Asset Enrichment

### Scenario
When investigating network alerts, you need to quickly gather information about the affected assets and their network context.

### Objective
Build a playbook that enriches alerts with asset information using simple lookups and Jinja2 formatting.

### Steps

#### 1. Create Asset Enrichment Playbook
1. Create new playbook: `Enrich-Network-Alert`
2. Configure **Manual** trigger
   - **Button Label**: `🔍 Enrich Asset Info`
   - **Module**: `Alerts`
   - **Requires Record**: `Yes`

#### 2. Extract Asset Information
1. Create step → Select **Set Variable**
   - **Step Name**: `Extract Alert Data`
   - **Variables**:
     - **Name**: `source_ip`
     - **Value**: `{{vars.input.records[0].sourceIp}}`
     - **Name**: `dest_ip`
     - **Value**: `{{vars.input.records[0].destinationIp}}`
     - **Name**: `alert_severity`
     - **Value**: `{{vars.input.records[0].severity}}`

#### 3. Find Source Asset
1. Create step → Select **Find Records**
   - **Step Name**: `Find Source Asset`
   - **Module**: `Assets`
   - **Query**: `ipAddress = "{{vars.steps.Extract_Alert_Data.source_ip}}"`
   - **Limit**: `1`

#### 4. Find Destination Asset
1. Create step → Select **Find Records**
   - **Step Name**: `Find Destination Asset`
   - **Module**: `Assets`
   - **Query**: `ipAddress = "{{vars.steps.Extract_Alert_Data.dest_ip}}"`
   - **Limit**: `1`

#### 5. Determine Network Segment
1. Create step → Select **Set Variable**
   - **Step Name**: `Analyze Network Segment`
   - **Variables**:
     - **Name**: `source_segment`
     - **Value**: `{% if vars.steps.Extract_Alert_Data.source_ip.startswith('10.1.') %}DMZ{% elif vars.steps.Extract_Alert_Data.source_ip.startswith('10.2.') %}Internal{% elif vars.steps.Extract_Alert_Data.source_ip.startswith('192.168.') %}Guest{% else %}External{% endif %}`
     - **Name**: `risk_level`
     - **Value**: `{% if vars.steps.Analyze_Network_Segment.source_segment == 'Internal' %}High{% elif vars.steps.Analyze_Network_Segment.source_segment == 'DMZ' %}Medium{% else %}Low{% endif %}`

#### 6. Create Enrichment Summary
1. Create step → Set **Variable**
   - **Step Name**: `Create Summary`
   - **Variables**:
     - **Name**: `enrichment_summary`
     - **Value**: 
       ```
       NETWORK ALERT ENRICHMENT
       
       Source IP: {{vars.steps.Extract_Alert_Data.source_ip}}
       Source Segment: {{vars.steps.Analyze_Network_Segment.source_segment}}
       Risk Level: {{vars.steps.Analyze_Network_Segment.risk_level}}
       
       Source Asset: {% if vars.steps.Find_Source_Asset|length > 0 %}{{vars.steps.Find_Source_Asset[0].hostname}}{% else %}Unknown{% endif %}
       Destination Asset: {% if vars.steps.Find_Destination_Asset|length > 0 %}{{vars.steps.Find_Destination_Asset[0].hostname}}{% else %}Unknown{% endif %}
       
       Alert Severity: {{vars.steps.Extract_Alert_Data.alert_severity}}
       ```

#### 7. Update Alert with Enrichment
1. Create step → Select **Update Record**
   - **Step Name**: `Add Enrichment to Alert`
   - **Module**: `Alerts`
   - **Record IRI**: `{{vars.input.records[0]['@id']}}`
   - **Fields**:
     - **Description**: `{{vars.input.records[0].description}}\n\n{{vars.steps.Create_Summary.enrichment_summary}}`
     - **Source Asset**: `{% if vars.steps.Find_Source_Asset|length > 0 %}{{vars.steps.Find_Source_Asset[0].hostname}}{% else %}Unknown{% endif %}`

#### 8. Send Enrichment Report
1. Create step → Select **Send Email**
   - **Step Name**: `Send Enrichment Report`
   - **To**: `security-team@company.com`
   - **Subject**: `📊 Alert Enriched: {{vars.input.records[0].name}}`
   - **Body**: `{{vars.steps.Create_Summary.enrichment_summary}}`

---

## Lab 3: Simple Incident Response Workflow

### Scenario
When a critical network incident occurs, you need a workflow that notifies the right people and tracks the response process.

### Objective
Create a workflow that handles incident escalation and team coordination using approvals and notifications.

### Steps

#### 1. Create Incident Response Playbook
1. Create new playbook: `Network-Incident-Response`
2. Configure **On Create** trigger
   - **Module**: `Incidents`
   - **Condition**: `severity = "Critical"`

#### 2. Extract Incident Details
1. Create step → Select **Set Variable**
   - **Step Name**: `Get Incident Details`
   - **Variables**:
     - **Name**: `incident_name`
     - **Value**: `{{vars.input.records[0].name}}`
     - **Name**: `incident_id`
     - **Value**: `{{vars.input.records[0].id}}`
     - **Name**: `incident_type`
     - **Value**: `{{vars.input.records[0].type}}`

#### 3. Immediate Notification
1. Create step → Select **Send Email**
   - **Step Name**: `Alert Network Team`
   - **To**: `network-team@company.com`
   - **Subject**: `🚨 CRITICAL: {{vars.steps.Get_Incident_Details.incident_name}}`
   - **Body**:
     ```
     CRITICAL NETWORK INCIDENT
     
     Incident: {{vars.steps.Get_Incident_Details.incident_name}}
     ID: {{vars.steps.Get_Incident_Details.incident_id}}
     Type: {{vars.steps.Get_Incident_Details.incident_type}}
     Time: {{globalVars.Current_Date}}
     
     Please respond immediately.
     ```

#### 4. Get Team Response
1. Create step → Select **Manual Input**
   - **Step Name**: `Network Team Response`
   - **Input Type**: `Button Based`
   - **Message**: `Critical incident detected. What is your response?`
   - **Options**:
     - **Investigating**: Begin investigation
     - **Escalate**: Escalate to manager
     - **Resolved**: Issue already resolved

#### 5. Handle Investigation Path
1. From **Investigating** output, create step → Select **Update Record**
   - **Step Name**: `Start Investigation`
   - **Module**: `Incidents`
   - **Record IRI**: `{{vars.input.records[0]['@id']}}`
   - **Fields**:
     - **Status**: `In Progress`
     - **Assigned To**: `Network Team`
     - **Comments**: `Investigation started by network team`

#### 6. Handle Escalation Path
1. From **Escalate** output, create step → Select **Send Email**
   - **Step Name**: `Escalate to Manager`
   - **To**: `network-manager@company.com`
   - **Subject**: `🚨 ESCALATION: {{vars.steps.Get_Incident_Details.incident_name}}`
   - **Body**: `Critical incident requires management attention: {{vars.steps.Get_Incident_Details.incident_name}}`

2. Create step → Select **Update Record**
   - **Step Name**: `Mark Escalated`
   - **Module**: `Incidents`
   - **Record IRI**: `{{vars.input.records[0]['@id']}}`
   - **Fields**:
     - **Status**: `Escalated`
     - **Priority**: `High`

#### 7. Handle Resolved Path
1. From **Resolved** output, create step → Select **Update Record**
   - **Step Name**: `Mark Resolved`
   - **Module**: `Incidents`
   - **Record IRI**: `{{vars.input.records[0]['@id']}}`
   - **Fields**:
     - **Status**: `Resolved`
     - **Resolution**: `Resolved by network team during initial assessment`

#### 8. Final Status Update
1. Create step that connects all paths → Select **Send Email**
   - **Step Name**: `Send Status Update`
   - **To**: `security-team@company.com`
   - **Subject**: `📋 Incident Update: {{vars.steps.Get_Incident_Details.incident_name}}`
   - **Body**: `Incident {{vars.steps.Get_Incident_Details incident_id}} has been processed by the network team.`

---

## Quick Challenges

### Challenge 1: Simple Port Blocking
Create a manual playbook that:
1. Takes an alert with a destination port
2. Uses Jinja2 to check if the port is in a "dangerous ports" list (22, 23, 3389)
3. If dangerous, blocks the port using FortiGate service objects
4. Sends notification with the action taken

**Hint**: Use Jinja2 `in` operator: `{% if port in ['22', '23', '3389'] %}`

### Challenge 2: Asset Criticality Assessment
Build a playbook that:
1. Looks up an asset from an alert
2. Uses Jinja2 to determine criticality based on hostname patterns
3. Updates the alert severity based on asset criticality
4. Notifies different teams based on criticality level

**Hint**: Use Jinja2 `contains` filter: `{% if hostname | contains('DC') %}`

### Challenge 3: Time-Based Response
Create a playbook that:
1. Checks the current time using `{{globalVars.Current_Date}}`
2. Routes differently for business hours vs after hours
3. Sends to different notification groups based on time
4. Sets different response priorities

**Hint**: Use Jinja2 time formatting and comparisons

---

## Jinja2 Quick Reference for Network Engineers

### Common Network Patterns

**Network Segment Detection**:
```jinja2
{% if ip.startswith('10.1.') %}
  DMZ Network
{% elif ip.startswith('192.168.') %}
  Internal Network
{% endif %}
```

**Port Classification**:
```jinja2
{% set dangerous_ports = ['22', '23', '3389', '445'] %}
{% if port in dangerous_ports %}
  High Risk Port
{% endif %}
```

**Asset Criticality**:
```jinja2
{% if hostname | contains('DC') or hostname | contains('DB') %}
  Critical Asset
{% elif hostname | contains('WEB') %}
  Important Asset
{% else %}
  Standard Asset
{% endif %}
```

**Time-Based Logic**:
```jinja2
{% set current_hour = globalVars.Current_Date | strftime('%H') | int %}
{% if current_hour >= 9 and current_hour <= 17 %}
  Business Hours
{% else %}
  After Hours
{% endif %}
```

---

## Best Practices

### 1. Keep It Simple
- Use built-in actions when possible
- Avoid complex Python unless absolutely necessary
- Use Jinja2 for simple logic and formatting

### 2. Test Incrementally
- Test each step individually
- Use Set Variable steps to debug data
- Start with manual triggers for easier testing

### 3. Use Descriptive Names
- Name steps clearly: "Block Malicious IP" not "Step 1"
- Use meaningful variable names
- Add descriptions to complex logic

### 4. Handle Edge Cases
- Always check if data exists before using it
- Use Jinja2 default filters: `{{variable | default('Unknown')}}`
- Include "else" paths in decision steps

### 5. Documentation
- Add comments to explain business logic
- Document trigger conditions clearly
- Include examples in step descriptions

---

## Troubleshooting Tips

**Playbook Not Triggering**: Check trigger conditions and test with manual triggers first

**Empty Variables**: Use Jinja2 default filters and check data paths

**Email Not Sending**: Verify email configuration and use test addresses

**FortiGate Actions Failing**: Check connector configuration and API permissions

**Jinja2 Errors**: Test templates in Set Variable steps first

**Record Updates Failing**: Verify field names and record IRI format