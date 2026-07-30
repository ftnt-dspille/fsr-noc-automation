---
title: "Cloud Ops: AWS"
linkTitle: "Cloud Ops (AWS)"
weight: 90
description: "Respond to a cloud security alert end to end -- pivot from a compromised identity to the resources it touched, contain reversibly, preserve evidence, and only then consider destroying anything."
tags: ["hands-on", "knowledge"]
---

## Why this use case?

Every other chapter in this workshop acts on infrastructure you own outright -- a FortiGate, a
FortiManager, a switch. Cloud incident response is different in one important way: **the alert
usually does not tell you what to fix.**

A FortiGate alert names a device. A cloud alert names an *identity* -- an IAM user, an access key,
a role -- and leaves you to work out which instances, volumes, and security groups that identity
touched. Getting from "these credentials are compromised" to "this is the instance to quarantine"
is the actual work, and it is where this chapter spends most of its time.

We'll build the response one part at a time:

1. **Read** -- pull the current state of an instance before changing anything
2. **Pivot** -- walk from the alert's identity to the resources it affected
3. **Quarantine** -- tag and isolate, reversibly
4. **Preserve** -- snapshot the volume before anything destructive
5. **Decide** -- stop is recoverable, terminate is not; gate the irreversible one behind a human
6. **Close the loop** -- comment back to the detection platform and close the alert
7. **Chain** -- assemble the parts into one playbook

{{% notice warning %}}
Parts 3 through 5 change real cloud infrastructure. Part 5 can **permanently destroy** an
instance. Run this chapter against a disposable AWS account with throwaway instances -- never
against anything you would miss.
{{% /notice %}}

---

## Prerequisites

- The **AWS EC2** connector installed and configured (part 0 below)
- The **Lacework FortiCNAPP** connector installed and configured, for parts 2 and 6
- At least one throwaway EC2 instance you are willing to stop, isolate, and terminate
- Completed [Playbooks](/chapter-03-playbooks) and
  [Approvals and Error Handling](/chapter-03-playbooks/05-approvals-and-error-handling) -- part 5
  reuses the approval gate from that chapter

---

## The workflow at a glance

```
Part 1: Read current state    -> AWS EC2  Get Instance Details / Get Security Groups
Part 2: Pivot to resources    -> FortiCNAPP  Get Alert Entities -> Get Alert Entity Details
Part 3: Quarantine            -> AWS EC2  Add Instance Tag -> Create Security Groups
                                          -> Authorize Ingress -> Add Security Group To Instance
Part 4: Preserve evidence     -> AWS EC2  Capture Volume Snapshot
Part 5: Stop or terminate     -> AWS EC2  Stop Instance / Terminate Instance (behind approval)
Part 6: Close the loop        -> FortiCNAPP  Add Comment to Alert -> Close Alert
Part 7: Chain it              -> all of the above, one playbook
```

{{% notice info %}}
Build each part as its own playbook and confirm it works before chaining them. A containment
playbook that half-works is worse than one that does not run at all -- you want to know exactly
which part failed.
{{% /notice %}}

---

## Part 0: Configure the AWS EC2 connector

### Choose an authentication model

The connector's first field, **Configuration Type**, decides everything else on the form:

| Configuration Type    | Fields you then fill in                                              |
|-----------------------|----------------------------------------------------------------------|
| `IAM Role`            | **AWS Instance IAM Role**                                            |
| `Access Credentials`  | **AWS Region**, **AWS Access Key ID**, **AWS Secret Access Key**     |

`IAM Role` is the right answer when FortiSOAR itself runs on EC2: the instance profile supplies
short-lived credentials that rotate automatically, and there is no secret to leak. `Access
Credentials` means a long-lived key pair sitting in the connector configuration, which is exactly
the kind of credential the alert in this chapter is about.

{{% notice note %}}
There is a third option that is better than both, and it is not on this form. **Every action in
this connector has an `Assume A Role` checkbox.** Tick it and the step takes a **Role ARN**, a
**Region**, and a **Session Name**, then assumes that role for that one call. This is how you
reach many AWS accounts from one connector configuration, and how you scope each playbook to
exactly the permissions it needs instead of one over-privileged key. Prefer it for anything
touching more than a single account.
{{% /notice %}}

1. Navigate to **Content Hub** and open the **Manage** tab
2. Find **AWS EC2** and click **Configure**
3. Fill in the fields:

    | Field                    | Value                                                    |
    |--------------------------|----------------------------------------------------------|
    | **Configuration Name**   | `AWS Lab`                                                |
    | **Configuration Type**   | `Access Credentials`                                     |
    | **AWS Region**           | your lab region, for example `us-east-2`                 |
    | **AWS Access Key ID**    | the lab access key                                       |
    | **AWS Secret Access Key**| the lab secret                                           |

4. Click **Save**
5. Run the health check and confirm it passes

### Least-privilege IAM policy

The connector will happily accept an administrator key. Don't give it one. This policy covers
exactly the actions parts 1 through 5 use and nothing else:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ReadState",
      "Effect": "Allow",
      "Action": [
        "ec2:DescribeInstances",
        "ec2:DescribeSecurityGroups",
        "ec2:DescribeNetworkAcls",
        "ec2:DescribeVolumes",
        "iam:GetUser"
      ],
      "Resource": "*"
    },
    {
      "Sid": "Quarantine",
      "Effect": "Allow",
      "Action": [
        "ec2:CreateTags",
        "ec2:CreateSecurityGroup",
        "ec2:AuthorizeSecurityGroupIngress",
        "ec2:ModifyInstanceAttribute"
      ],
      "Resource": "*"
    },
    {
      "Sid": "PreserveEvidence",
      "Effect": "Allow",
      "Action": [
        "ec2:CreateSnapshot"
      ],
      "Resource": "*"
    },
    {
      "Sid": "StopAndTerminate",
      "Effect": "Allow",
      "Action": [
        "ec2:StopInstances",
        "ec2:TerminateInstances"
      ],
      "Resource": "*"
    }
  ]
}
```

{{% notice tip %}}
Split this into two policies and attach them to two roles -- one read-and-contain, one
stop-and-terminate. Then use `Assume A Role` so the destructive part has to assume a different
identity than the investigative ones. A playbook bug in part 1 then cannot terminate anything,
because the credentials it runs under simply cannot.
{{% /notice %}}

---

## Part 1: Read before you write

The most common cloud-IR mistake is remediating an instance nobody has looked at. Part 1 is
deliberately read-only.

### Build the playbook

1. On the left pane select **Automation > Playbooks**
2. Click **+ New Collection**, enter **Name**: `03 - AWS Cloud Ops`, and click **Create**
3. Click **+ Add Playbook**, enter **Name**: `Read Instance State`, and click **Create**
4. In the trigger list select **Referenced**, then click **Save**
5. Drag from one of the **Start** step's blue connector dots onto empty canvas and select
   **Connector > AWS EC2**
6. Configure the step:

    | Field             | Value                              |
    |-------------------|------------------------------------|
    | **Step Name**     | `Get Instance Details`             |
    | **Configuration** | `AWS Lab`                          |
    | **Action**        | `Get Instance Details`             |
    | **Instance ID**   | your throwaway instance's ID       |

7. Click **Save**, then **Save Playbook**, then run it

### What to look for

The response mirrors the AWS `DescribeInstances` shape, so the instance itself is nested a couple
of levels down. In the execution log, expand `Reservations[0].Instances[0]` and find three things
you will need later:

- **`State.Name`** -- so you know whether part 5 has anything to do
- **`SecurityGroups[]`** -- the instance's *current* groups, which is what you are about to change
- **`BlockDeviceMappings[].Ebs.VolumeId`** -- part 4 snapshots this volume, and this is the only
  place the volume ID appears

{{% notice note %}}
To see step input and output at all, the playbook must run in **DEBUG** mode. Click **Running In
INFO Mode** in the designer's top bar, set **Select Execution Log Level** to `DEBUG`, and click
**Apply**. In INFO mode the log records only each step's status and duration -- the payloads are
never stored.
{{% /notice %}}

### Add the surrounding context

Two more steps, both read-only, both useful before you touch anything:

| Step Name              | Action                        | Fields                                    |
|------------------------|-------------------------------|-------------------------------------------|
| `List Security Groups` | `Get Security Groups`         | none -- it takes no parameters            |
| `List Network ACLs`    | `Get Details of Network ACLs` | leave **Network ACL IDs** empty for all   |

`Get Security Groups` deliberately has no filter arguments: it returns every group in the region.
That is a lot of output, and it is the point -- you are looking for whether a quarantine group
already exists before part 3 creates a second one.

---

## Part 2: Pivot from the alert to the resource

This is the part that makes cloud IR different.

Our alert is a FortiCNAPP **Potentially Compromised AWS Keys** detection. Read its `sourcedata`
and you get an IAM principal, a source IP, and a MITRE chain -- Initial Access via valid cloud
accounts, then Persistence via account manipulation. What you do **not** get is an instance ID.
The `instanceIds` and `machines` arrays are empty, because a stolen access key is not a machine.

So the playbook has to ask the detection platform what the alert actually touched.

### Enumerate the alert's entities

1. Create a new playbook, **Name**: `Pivot Alert To Resources`
2. Trigger: **Manual**, **Select Module** `Alerts`, **Requires Record** `Yes`
3. Add a **Connector** step:

    | Field             | Value                                        |
    |-------------------|----------------------------------------------|
    | **Step Name**     | `Get Alert Entities`                         |
    | **Connector**     | `Lacework FortiCNAPP`                        |
    | **Action**        | `Get Alert Entities`                         |
    | **Alert ID**      | the FortiCNAPP alert ID from the record      |

The alert ID lives in the ingested record's `sourcedata` as `alertId`. Pull it with a **Set
Variable** step first so the rest of the playbook can reference one clean variable:

```jinja2
Name: cnapp_alert_id
Value: {{vars.input.records[0].sourcedata | from_json | json_query('alertId')}}
```

### Resolve an entity to something actionable

`Get Alert Entities` returns the entities the alert touched. To get detail on one, use **Get Alert
Entity Details**, which takes three fields:

| Field                   | Value                                              |
|-------------------------|----------------------------------------------------|
| **Alert ID**            | `{{vars.cnapp_alert_id}}`                          |
| **Context Entity Type** | `IpAddress` or `Machine`                           |
| **Entity Value**        | the IP address, or the Machine identifier (MID)    |

{{% notice warning %}}
**Context Entity Type offers only `IpAddress` and `Machine`.** There is no `User` or `Identity`
option. This is the crux of the compromised-credentials case: the alert's primary entity is an IAM
principal, and the connector cannot look one up. If the alert carries no machine entity, this part
**cannot** produce an instance ID, and no amount of retrying will change that.
{{% /notice %}}

That constraint is not a gap in the workshop -- it is the lesson. A containment playbook must
branch on whether it found something to contain:

4. Add a **Decision** step:

    | Field           | Value                                     |
    |-----------------|-------------------------------------------|
    | **Step Name**   | `Did We Find An Instance`                 |
    | **Condition 1** | `vars.target_instance_id != None`          |
    | **Branch Tooltip** | `Instance found`                        |

5. Point **Condition 1** at part 3's quarantine chain
6. Point the **Default Step** at a **Manual Input** step that escalates to a human, with a
   **Branch Tooltip** of `Identity only -- needs an analyst`

{{% notice note %}}
Write the Decision condition **without** `{{ }}`. The field accepts only an advanced expression and
FortiSOAR wraps it for you on save; adding your own braces produces a doubly-wrapped expression.
Every other Jinja field in this chapter wants the braces -- Decision, Condition, and Loop boxes do
not.
{{% /notice %}}

The escalation path is the correct outcome for a stolen-key alert. Rotating an access key and
reviewing CloudTrail is judgement work, and a playbook that quietly did nothing here would be far
worse than one that puts a task in an analyst's queue.

{{% notice tip %}}
For a run that exercises the full workflow, seed a **host-based** FortiCNAPP detection instead --
those carry a machine entity, so part 2 resolves to a real instance. Keep the compromised-keys
alert as the case that proves your escalation branch works. Two alerts, two paths, one playbook.
{{% /notice %}}

### Fallback: ask the platform directly

When the alert has no machine entity but you have an IP address, **Run LQL Query** queries
FortiCNAPP's own data model for resources associated with it. This is also how you answer
"what else did this identity do?" -- which is the question the escalated analyst is about to ask.

---

## Part 3: Quarantine, reversibly

You have an instance ID. Resist stopping it. A running instance you have isolated keeps its memory
state, keeps serving whatever forensics you need, and can be handed back intact if the alert turns
out to be a false positive. Isolation is reversible; a stop is disruptive and a terminate is final.

Four steps, in this order.

### 1. Tag it first

| Field              | Value                                          |
|--------------------|------------------------------------------------|
| **Step Name**      | `Tag Instance Under Investigation`             |
| **Action**         | `Add Instance Tag`                             |
| **Instance ID**    | `{{vars.target_instance_id}}`                  |
| **Tag Key**        | `SecurityStatus`                               |
| **Tag Value**      | `Quarantined-{{vars.cnapp_alert_id}}`          |

Tag before you isolate, not after. The moment you change the security group, someone's monitoring
will page someone else, and the tag is what tells them this was deliberate and which alert caused
it.

### 2. Create the quarantine group

| Field             | Value                                                     |
|-------------------|-----------------------------------------------------------|
| **Step Name**     | `Create Quarantine SG`                                    |
| **Action**        | `Create Security Groups`                                  |
| **Group Name**    | `quarantine-{{vars.cnapp_alert_id}}`                      |
| **Description**   | `Isolation group created by FortiSOAR for alert {{vars.cnapp_alert_id}}` |

{{% notice warning %}}
**This action takes no VPC ID** -- only a name and a description. It therefore creates the group in
the region's **default VPC**. If your instance lives in a non-default VPC, a group created here
cannot be attached to it, and part 3's final step will fail. Either pre-create the quarantine group
in the right VPC and skip this step, or use the connector's **Assume A Role** in an account whose
default VPC is the one you want.
{{% /notice %}}

### 3. Allow exactly one way in

A brand new security group has no inbound rules at all, which is already isolation. Add back only
the forensic access you need:

| Field                   | Value                                    |
|-------------------------|------------------------------------------|
| **Step Name**           | `Allow Forensic Access`                  |
| **Action**              | `Authorize Ingress`                      |
| **Security Group ID**   | the group ID from the previous step      |
| **IP Permissions**      | the JSON below                           |

```json
[
  {
    "IpProtocol": "tcp",
    "FromPort": 22,
    "ToPort": 22,
    "IpRanges": [
      {
        "CidrIp": "203.0.113.10/32",
        "Description": "Forensic jump host"
      }
    ]
  }
]
```

Replace the CIDR with your jump host's address. **IP Permissions** is a free-text field holding
raw JSON in the AWS `IpPermissions` shape -- the editor will not validate it for you, so a typo
here surfaces as a connector error rather than a form warning.

{{% notice note %}}
Outbound is the half people forget. A new group's *egress* rules default to allow-all, so a
quarantined instance can still reach the internet -- including whatever command-and-control
prompted the alert. Use **Revoke Egress** to strip that default, then **Authorize Egress** for only
what your tooling needs.
{{% /notice %}}

### 4. Swap the instance onto it

| Field              | Value                                    |
|--------------------|------------------------------------------|
| **Step Name**      | `Isolate Instance`                       |
| **Action**         | `Add Security Group To Instance`         |
| **Instance ID**    | `{{vars.target_instance_id}}`            |
| **Group List**     | the quarantine group ID                  |

{{% notice warning %}}
Despite the name "Add", this maps onto the AWS call that **sets** an instance's security group
list. Passing only the quarantine group is what achieves isolation -- it replaces the instance's
existing groups rather than adding to them. That also means it is destructive of the original
configuration: record the `SecurityGroups[]` you read in part 1 into a variable first, or you will
have nothing to restore from.
{{% /notice %}}

---

## Part 4: Preserve evidence before you destroy any

If part 5 might terminate the instance, the volume snapshot has to happen first. Once an instance
is terminated with `DeleteOnTermination` set -- the default for root volumes -- the disk is gone.

| Field             | Value                                                       |
|-------------------|-------------------------------------------------------------|
| **Step Name**     | `Snapshot Volume`                                           |
| **Action**        | `Capture Volume Snapshot`                                   |
| **Volume ID**     | the `BlockDeviceMappings[].Ebs.VolumeId` you read in part 1  |
| **Description**   | `Forensic snapshot for FortiCNAPP alert {{vars.cnapp_alert_id}}` |

**Description** is required here, not optional. Put the alert ID in it -- a snapshot with a
meaningless description is an unattributable cost line item three months from now.

{{% notice tip %}}
The snapshot returns immediately with a `pending` state; it does not wait for the copy to finish.
If a later part depends on a completed snapshot, use a **do-until** loop from the
[error handling chapter](/chapter-03-playbooks/05-approvals-and-error-handling) to poll until the
state is `completed`, rather than assuming the snapshot is usable the moment the step goes green.
{{% /notice %}}

---

## Part 5: Stop or terminate -- and who gets to decide

Two actions, and the difference between them is what this part is about:

| Action               | Reversible?          | What survives                              |
|----------------------|----------------------|--------------------------------------------|
| **Stop Instance**    | Yes -- start it again | EBS volumes, instance ID, private IP       |
| **Terminate Instance**| **No**               | Nothing, unless you snapshotted in part 4  |

Automating **Stop Instance** is defensible. Automating **Terminate Instance** is not.

### Gate the irreversible action

1. Add a **Manual Input** step before the terminate step:

    | Field             | Value                                                        |
    |-------------------|--------------------------------------------------------------|
    | **Step Name**     | `Approve Termination`                                        |
    | **Title**         | `Approve termination of {{vars.target_instance_id}}?`         |

2. Configure it in **approval mode**, routed to your security team with a timeout
3. Wire the approve path to **Terminate Instance** and the reject path to **Stop Instance**

The pattern -- and the timeout behaviour, which matters when nobody is on shift -- is covered in
[Approvals and Error Handling](/chapter-03-playbooks/05-approvals-and-error-handling). Reuse it
rather than rebuilding it.

{{% notice tip %}}
**Instance API Termination** is a quieter safety net worth knowing. Set it to `Disable` and the
instance cannot be terminated through the API at all, by your playbook or anyone else's, until it
is explicitly re-enabled. Applying it to production instances turns "a playbook bug terminated
prod" from an incident into a failed step.
{{% /notice %}}

---

## Part 6: Close the loop

An automated response that leaves no trace in the detection platform is invisible to the next
analyst who opens the alert.

### Comment what you did

| Field             | Value                                    |
|-------------------|------------------------------------------|
| **Step Name**     | `Comment On CNAPP Alert`                 |
| **Connector**     | `Lacework FortiCNAPP`                    |
| **Action**        | `Add Comment to Alert`                   |
| **Alert ID**      | `{{vars.cnapp_alert_id}}`                |
| **Comment**       | the summary below                        |
| **Format**        | `Markdown`                               |

```jinja2
**FortiSOAR automated containment**

- Instance: `{{vars.target_instance_id}}`
- Quarantine SG: `quarantine-{{vars.cnapp_alert_id}}`
- Forensic snapshot: `{{vars.snapshot_id}}`
- Final action: {{vars.final_action}}
```

**Format** accepts `Plaintext` or `Markdown`. Choose `Markdown` -- a table of what changed is worth
far more than a paragraph.

### Close it

| Field         | Value                                                       |
|---------------|-------------------------------------------------------------|
| **Step Name** | `Close CNAPP Alert`                                         |
| **Action**    | `Close Alert`                                               |
| **Alert ID**  | `{{vars.cnapp_alert_id}}`                                   |
| **Reason**    | `Malicious and have resolution in place`                    |

**Reason** is a fixed list, not free text: `Other`, `False positive`, `Not enough information`,
`Malicious and have resolution in place`, `Expected because of routine testing`, and
`Expected behavior`. Pick honestly -- these become the numbers someone reports on next quarter.

{{% notice warning %}}
Close the FortiCNAPP alert only on the path where containment actually succeeded. If part 2 escalated
to an analyst, or part 3 failed on the VPC mismatch, the alert must stay open. Wiring **Close
Alert** as an unconditional final step is how automation quietly hides incidents.
{{% /notice %}}

---

## Part 7: Chain it

Now assemble it. Trigger **On Create** against the **Alerts** module, filtered to your FortiCNAPP
source, and wire the parts in order: pivot, decide, tag, isolate, snapshot, approve, act, comment,
close.

Three things to get right in the chained version that do not matter when you build each part alone:

- **Order is not negotiable.** Snapshot before terminate; tag before isolate; read before write.
- **`ignore_errors` belongs on the reporting steps, not the containment ones.** A failed comment
  should not abandon a half-quarantined instance. A failed isolation absolutely should stop the
  playbook.
- **Record what you changed.** Save the original security group list, the new group ID, and the
  snapshot ID into variables. Without them there is no rollback, and a false positive becomes an
  outage you cannot undo.

### Challenges

#### Challenge 1

Write the rollback playbook: given the alert ID, restore the instance's original security groups
and remove the quarantine tag. Decide where the original group list has to be stored for this to be
possible at all.

#### Challenge 2

Part 3's group creation fails for instances in a non-default VPC. Rework it so the playbook detects
the instance's VPC and either reuses a per-VPC quarantine group or fails loudly with a useful
message.

#### Challenge 3

Extend part 2 so that when only an IP address is available, a **Run LQL Query** step finds the
resources associated with it -- turning the escalation path into a second automated attempt.
