---
title: "Working with Records"
menuTitle: "1 - Working with Records"
weight: 10
tags: ["hands-on"]
---

If you write software, FortiSOAR's data model will feel familiar in about thirty seconds:

| FortiSOAR calls it | You already call it | Example |
|---|---|---|
| **Module** | a table | Alerts, Incidents, Assets, Tasks |
| **Record** | a row | one alert: *"BGP session flap on edge-fw-01"* |
| **Field** | a column | `Severity`, `Status`, `Source` |
| **Picklist** | an enum backing a column | `Severity` = Minimal / Low / Medium / High / Critical |
| **Relationship** | a foreign key / join table | this alert belongs to that incident |

The rest of this page is the thirty seconds' worth of nuance that isn't obvious from the analogy.

{{% notice info %}}
**Which FortiSOAR version are you on?** Look at the bottom of the left navigation pane. This page
was verified on **7.6.5**. On **8.0** the only difference is the navigation group name -- Alerts and
Incidents move from **Incident Response** to **Security Operations**. Every field, button, and tab
below is identical.
{{% /notice %}}

## Step 1: Open a module

Expand the left navigation pane and go to **Incident Response > Alerts**.

You are looking at a module -- a table view of every alert record on the appliance, with one row per
record and one column per field. Note the row of **Search** boxes directly under the column
headers: every column filters independently, and the filters combine.

{{% notice note %}}
**Verify:** the item count above the grid shows a few hundred alerts. The lab appliance is shared
and carries leftover test data from earlier sessions -- a lot of the names will look like machine
output. That's expected. You're about to add one of your own.
{{% /notice %}}

## Step 2: Create a record

Click **+ Add** above the grid. You get the **Create New Alert** form.

![The Create New Alert form showing Source, Status, Severity, Assigned To, Tenant and Type fields](images/rm_create_alert_form.jpg?height=420px)

Fill in:

| Field | Value |
|---|---|
| **Name** | `BGP session flap on edge-fw-01` |
| **Source** | `FortiManager` |
| **Severity** | `High` |

Leave everything else alone, then click **Save**.

Three things to notice while you're in the form:

- **Only `Name` is required.** It's the single field with a red asterisk. Everything else -- severity,
  type, status, assignee -- is optional. FortiSOAR will happily store a nearly-empty record, which is
  why ingestion playbooks have to do their own validation.
- **`Status` and `Severity` are already filled in** with `Open` and `Low`. Those are field-level
  defaults, not something the form invented.
- **Long picklists get a search box, short ones don't.** Open **Severity** (five options) and you get
  a plain list. Open **Type** and you get a list *with* a search box at the top. Same widget, and it
  adapts.

{{% notice note %}}
**Verify:** you land on the new record's detail view and the header reads
`Alert-<number> | BGP session flap on edge-fw-01` with a **High** chip on the left.
{{% /notice %}}

## Step 3: Read the record -- and pick the right view template

Look at the dropdown at the **top right** of the record. On this lab appliance it reads **phishing**,
and the page you're looking at is showing you a playbook-demo widget instead of your alert's fields.

That dropdown is the **view template** selector. A view template controls how a module's records are
*rendered*; it has nothing to do with what the record *contains*. One module can carry several, and
the appliance picks a default.

Switch it to **Base Template**.

Now you get the standard record layout:

- **Description**
- **Details** -- Assigned To, Status, Tenant, Source, Source ID, Escalated, Assigned Date, Resolved Date
- **Type Details** -- Type
- a **relationship graph**, with your alert as the only node so far
- a strip of related-record tabs: **Indicators · Correlations · Tasks · Source Data ·
  External Communications · Access Control**, each with its own **+ Add** and **Link** buttons

`+ Add` creates a new related record; `Link` attaches one that already exists. This is where an
alert gets tied to the incident it belongs to, the indicators extracted from it, and the tasks
opened against it -- the relationships that make FortiSOAR a case-management tool rather than a
list of alerts.

### Make a relationship

One alert is rarely the whole story. When a NOC event needs tracking beyond the single alert that
reported it, you promote it to an **incident** -- and the two stay linked.

Click **Escalate** in the bottom action bar. That button is not a field edit; it runs the playbook
`Alert - Escalate To Incident`, which asks you for the incident's details before it creates
anything:

| Field | Value |
|---|---|
| **Incident Name** | `Unplanned WAN instability - edge-fw-01` |
| **Severity** | leave on `Medium` |
| **Incident Lead** | yourself |
| **Escalation Reason** | leave the pre-filled text |
| **Incident Type** | pick any -- `Explained Anomaly` fits a link flap |
| **Close Alerts** | leave unticked, so your alert stays open |

Click **Escalate**. The playbook creates the incident and links it back to your alert.

{{% notice note %}}
**Verify:** your alert's **Escalated** field flips to **Yes**, and the new incident appears under
the **Correlations** tab and as a second node on the relationship graph. Open it and the alert is
listed on its side of the link too -- the relationship reads from both directions.
{{% /notice %}}

This is the shape of nearly every use case in the rest of the workshop: a record arrives, a playbook
decides what it means, and the result is another record joined to the first.

{{% notice tip %}}
**The template selection does not stick.** Reload the record and it reverts to the appliance
default. If your fields disappear, you haven't lost data -- you're back on the other template.
Switch to **Base Template** again.
{{% /notice %}}

## Step 4: Read the audit trail

Click the **Audit Logs** tab at the top of the record.

![Audit Logs timeline showing Alert Created by User CS Admin and Alert Updated by a playbook](images/rm_audit_log_timeline.jpg?height=380px)

You get a timeline, filterable by user, operation and date range. On a record you created seconds
ago there are already **two** entries:

| Entry | Actor |
|---|---|
| **Alert Created** | By User: *your login* |
| **Alert Updated** | By Playbook: *Extract Indicators (Alerts)* |

You only did one thing. The second entry is the point of this whole page: **saving a record is an
event, and events trigger playbooks.** A post-create playbook read your alert, looked for indicators
in it, and wrote back -- all before the detail view finished rendering.

Every field change from here on lands in this timeline, attributed to the user or the playbook that
made it. That is what makes an automated action auditable after the fact.

{{% notice note %}}
**Verify:** your Audit Logs timeline shows both a **Created** entry attributed to your user and an
**Updated** entry attributed to a playbook.
{{% /notice %}}

## What you built

A single alert record -- and, more usefully, the vocabulary for the rest of the workshop:

- a **module** is a table, a **record** is a row, a **field** is a column
- **only `Name`** is required on an alert; validation is the automation's job
- **view templates** change how a record is drawn, not what it holds -- and the lab appliance does
  not default to the plain one
- **relationships** hang off the record's tab strip, not off its fields, and read from both ends
- **escalation is a playbook**, not a field edit -- it creates the incident and the link
- the **audit trail** attributes every change to a user or a playbook

Day 2 picks this up from the automation side: the playbook that fired in Step 4 is the same kind of
object you'll be writing yourself.

{{% notice tip %}}
**Custom fields and custom modules** -- adding your own field to Alerts, or building a module from
scratch -- are covered on **Day 3** in the Application Editor session. Everything above works on the
modules that ship with the platform.
{{% /notice %}}
