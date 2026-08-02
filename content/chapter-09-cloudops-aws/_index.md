---
title: "Cloud Ops: AWS"
linkTitle: "Cloud Ops (AWS)"
weight: 90
description: "Contain a compromised cloud workload end to end -- preserve the evidence first, gate production behind a human, isolate reversibly, and prove the containment happened on AWS rather than in the case."
tags: ["hands-on", "knowledge"]
---

## Why this use case?

Every other chapter in this workshop acts on infrastructure you own outright -- a FortiGate, a
FortiManager, a switch. When you push a policy to a FortiGate and the step goes green, the policy
is on the FortiGate.

Cloud is different in one specific way, and it is the way cloud containment demos usually go
wrong: **the API call can return success having done less than you asked.** The step goes green,
the case says "instance contained", and nobody ever asks AWS what the instance's network posture
actually became. You will build the step that asks.

The other difference is that AWS does not remember what you changed. There is no previous-value
field on a security-group swap and no undo. If the responder does not write the original
configuration down before the change, the workload can never be put back -- so recording it is a
step in the playbook, not a nicety.

We'll build the response one part at a time:

1. **Read** -- pull the current state of the instance before changing anything
2. **Preserve** -- snapshot the disk, and *refuse to continue* if that failed
3. **Record** -- write the pre-containment posture into the case while it is still true
4. **Gate** -- production workloads ask a human; everything else contains immediately
5. **Contain** -- replace the security groups with a quarantine group
6. **Verify** -- read the group list back off AWS and compare
7. **Chain** -- assemble the parts into one playbook, with its failure branches
8. **Restore** -- put the workload back from the only surviving copy of its old state

{{% notice warning %}}
Parts 2 through 5 change real cloud infrastructure. Run this chapter against a disposable AWS
account with a throwaway instance -- never against anything you would miss.
{{% /notice %}}

---

## Prerequisites

- The **AWS EC2** connector installed and configured (part 0 below)
- The **AWS EC2 (Extended)** connector, also configured in part 0 -- one step here needs an
  operation the shipped connector does not have
- The **Code Runner** connector, introduced in
  [DevOps Automation](/chapter-08-gitops-devops) -- two steps here flatten AWS responses in Python
- One throwaway EC2 instance you are willing to isolate, tagged `Environment=dev`
- Two security groups in **the same VPC as that instance**: a normal one the instance currently
  uses, and a quarantine group (part 0 covers building it, and why you build it by hand)
- Completed [Playbooks](/chapter-03-playbooks) and
  [Approvals and Error Handling](/chapter-03-playbooks/05-approvals-and-error-handling) -- part 4
  reuses the approval gate from that chapter

---

## The workflow at a glance

```
Part 1: Read state          -> AWS EC2  Get Instance Details -> Code Runner (flatten)
Part 2: Preserve evidence   -> AWS EC2  Capture Volume Snapshot
                                        -> AWS EC2 (Extended)  describe_snapshots
                                        -> Decision: no snapshot, no containment
Part 3: Record the posture  -> Create Record (incident) -> Create Record (comment)
Part 4: Gate                -> Decision on the Environment tag -> Manual Input (approval)
Part 5: Contain             -> AWS EC2  Add Security Group To Instance -> Add Instance Tag
Part 6: Verify              -> AWS EC2  Get Instance Details -> Code Runner (compare)
                                        -> Decision: contained, or say so plainly
Part 7: Chain it            -> all of the above, one playbook
Part 8: Restore             -> parse the case comment -> approve -> re-attach -> verify
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
Credentials` means a long-lived key pair sitting in the connector configuration -- exactly the kind
of credential that gets stolen and generates the alert you are responding to.

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

{{% notice warning %}}
**An EC2 instance ID is only unique within its region**, and this configuration pins one region. A
finding from another region resolves to nothing -- which is the correct outcome, but you want to
recognise it as a region mismatch rather than a deleted instance.
{{% /notice %}}

### Add the extended connector

The shipped AWS EC2 connector has 32 operations, and one thing this chapter needs is not among
them: **there is no way to describe a snapshot.** You can create one, but you cannot ask AWS
whether it exists -- which is exactly what part 2's gate has to do.

Install
[**AWS EC2 (Extended)**](https://github.com/ftnt-dspille/connector-aws-extended/releases/latest)
alongside the stock connector. It is a clone of the vendor connector that adds a boto3
passthrough, so any AWS API call is reachable without waiting for a curated operation. Download
the `.tgz` from that page and import it from **Content Hub → Manage → Add Connector**.

It is a community connector, so the appliance needs the custom-connector gate on before it will
import. Configure it exactly like the stock one, with the **same credentials** and configuration
name `AWS Lab Extended` -- connector configurations are encrypted per connector on the appliance,
so the stock connector's credentials cannot be shared across to it.

{{% notice note %}}
Two connectors against one AWS account looks redundant, and mostly it is. Every step in this
chapter uses the stock connector except one. Keeping the split visible is the point: you should be
able to say precisely which capability is missing from the shipped connector and why you reached
past it, rather than replacing the vendor's connector wholesale because one operation was absent.
{{% /notice %}}

### Least-privilege IAM policy

The connector will happily accept an administrator key. Don't give it one. This policy covers
exactly the actions parts 1 through 8 use and nothing else:

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
        "ec2:DescribeVolumes",
        "ec2:DescribeSnapshots"
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
      "Sid": "ContainAndRestore",
      "Effect": "Allow",
      "Action": [
        "ec2:ModifyInstanceAttribute",
        "ec2:CreateTags"
      ],
      "Resource": "*"
    }
  ]
}
```

Three things are worth noticing about that policy.

**`ec2:CreateSnapshot` and `ec2:ModifyInstanceAttribute` are separate actions from the describes.**
An identity that can do everything else in this chapter can still be denied both, and the symptom
is `UnauthorizedOperation` on part 2 or part 5 after parts 1 and 6 worked perfectly. If you are
debugging a containment that reads fine and changes nothing, check IAM before you check the
playbook.

**`ec2:ModifyInstanceAttribute` covers containment *and* restore.** AWS models both as the same
attribute write -- which is the same fact that makes restore hard: there is no separate "revert"
call, and therefore no stored previous value to revert to.

**`ec2:DeleteSnapshot` is deliberately absent.** Granting it would mean the identity behind your
containment automation can destroy the evidence that automation just took. Clean up snapshots as a
different identity.

{{% notice tip %}}
Split this into two policies and attach them to two roles -- one read-and-preserve, one
contain-and-restore. Then use `Assume A Role` so the state-changing part has to assume a different
identity than the investigative ones. A playbook bug in part 1 then cannot change anything,
because the credentials it runs under simply cannot.
{{% /notice %}}

### Build the quarantine group by hand

You need a security group in the instance's VPC with **no ingress rules and no egress rules**.
Create it in the AWS console or with the CLI before you start, and delete the default outbound
rule that AWS adds for you:

```bash
aws ec2 create-security-group --group-name workshop-quarantine \
    --description "FortiSOAR isolation group" --vpc-id vpc-xxxxxxxx
aws ec2 revoke-security-group-egress --group-id sg-xxxxxxxx \
    --ip-permissions '[{"IpProtocol":"-1","IpRanges":[{"CidrIp":"0.0.0.0/0"}]}]'
```

Both halves of that matter, and both are the point of the exercise.

**Zero egress is what actually contains anything.** A new security group has no inbound rules,
which is already isolation from the outside. But AWS adds an **allow-all outbound rule** by
default, so an instance in a group cloned from `default` stops *serving* traffic and carries on
*beaconing* to whatever prompted the alert. That looks like a successful containment from every
angle except the one that matters.

**The connector cannot do either half of this reliably,** which is why you are at a shell:

- **`Create Security Groups` takes no VPC ID** -- only a name and a description -- so it creates
  the group in the region's *default* VPC. A group in the wrong VPC cannot be attached to your
  instance, and part 5 will fail on it.
- **`Revoke Egress` cannot send `IpProtocol: "-1"`.** Removing an all-protocols rule requires the
  string `"-1"`, and FortiSOAR's parameter layer retypes numeric-looking strings to integers before
  the connector sees them. boto3 then rejects the integer:

    ```
    Invalid type for parameter IpPermissions[0].IpProtocol, value: -1,
    type: <class 'int'>, valid types: <class 'str'>
    ```

    `"tcp"` works and `"6"` fails identically to `"-1"`, which puts the fault in the platform
    rather than the connector -- and the connector's own placeholder text documents
    `"IpProtocol": "-1"`, so the shipped example is the case that cannot work.

This is not a reason to avoid the connector. It is a reason to know where its edges are, and the
"When the shipped connector can't" sidebar at the end of this chapter covers what to do when you
hit one in production rather than in a lab you can fix by hand.

---

## Part 1: Read before you write

The most common cloud-IR mistake is remediating an instance nobody has looked at. Part 1 is
deliberately read-only.

### Build the playbook

1. On the left pane select **Automation > Playbooks**
2. Click **+ New Collection**, enter **Name**: `03 - AWS Cloud Ops`, and click **Create**
3. Click **+ Add Playbook**, enter **Name**: `Contain Cloud Workload`, and click **Create**
4. In the trigger list select **Manual**, **Select Module** `Alerts`, **Requires Record** `Yes`,
   and set the button label to `Contain Cloud Workload`
5. Add a **Set Variables** step named `Cloud Config`:

    | Variable              | Value                  |
    |-----------------------|------------------------|
    | `quarantine_group`    | `workshop-quarantine`  |
    | `approval_tag`        | `Environment`          |
    | `approval_values`     | `production,prod`      |
    | `status_tag_key`      | `SecurityStatus`       |
    | `status_tag_value`    | `Quarantined`          |
    | `containment_enabled` | `yes`                  |

Everything environment-specific lives in that one step. A customer whose tagging scheme is
`env=prod` or `tier=1` changes a string here rather than editing the playbook.

6. Add a second **Set Variables** step named `Read Alert`:

```jinja2
Name: instance_id
Value: {{vars.input.records[0].deviceUID | default('', true) or '__no_instance__'}}
```

{{% notice warning %}}
**Put the instance ID in `deviceUID`, not `sourceId`.** The Alerts module carries a module-level
uniqueness constraint on `sourceId`, so the *second* finding naming the same instance fails
ingestion with "a record already exists with the specified values" -- and a deleted alert sitting
in the recycle bin keeps failing it. The constraint does not appear in the per-field metadata, only
in the module's `uniqueConstraints`, so the first sign of it is a 409 you did not expect.

It is the more accurate model anyway. `sourceId` is the *finding's* identifier, which is what
deduplicates repeat deliveries of one finding. `deviceUID` is the resource the finding implicates,
and many findings can legitimately name one instance.
{{% /notice %}}

The `'__no_instance__'` sentinel is there because a blank instance ID is not safely "match
nothing" everywhere in the AWS API, and a playbook that resolves the *wrong* instance is worse than
one that resolves none.

### Read the instance

7. Add a **Connector** step:

    | Field             | Value                              |
    |-------------------|------------------------------------|
    | **Step Name**     | `Resolve Instance`                 |
    | **Configuration** | `AWS Lab`                          |
    | **Action**        | `Get Instance Details`             |
    | **Instance ID**   | `{{vars.instance_id}}`             |

8. On the step's **Advanced** tab, tick **Ignore Errors** and set the step to continue

That second click is the whole lesson of this step. `Get Instance Details` raises
`InvalidInstanceID.NotFound` when the ID does not exist -- which turns "the alert named an instance
that has already been terminated", an ordinary and expected outcome, into a red run with no case
and no explanation. Ignoring the error lets the next step decide what to do about it.

{{% notice warning %}}
**Ignoring an error does not make the run green, and the `| default({})` in the next step is not
decoration.** Both are worth seeing for yourself in DEBUG mode.

A step that raised does not produce an empty result. It produces a result with no `data` key at
all, holding the error instead:

```json
{"Error message": "An error occurred (InvalidInstanceID.NotFound) when calling the
 DescribeInstances operation: The instance ID 'i-01234567890abcdef' does not exist"}
```

So `{{vars.steps.Resolve_Instance.data | default({})}}` renders as `{}` and the flatten reports
`found: no`, exactly as intended -- but only because it asks for `.data` and defaults it. Reach
for `vars.steps.Resolve_Instance` directly, or drop the `| default`, and the next step gets the
error dict or a template failure instead.

And the run still finishes with the status **`finished with error`**, even though every step after
the ignored one ran to completion. `Ignore Errors` governs *control flow*, not the run's verdict.
Anything that judges the run by its terminal status -- a parent playbook, a monitoring query, a
test harness -- will call this run failed while the case it produced is perfectly correct.
{{% /notice %}}

{{% notice note %}}
To see step input and output at all, the playbook must run in **DEBUG** mode. Click **Running In
INFO Mode** in the designer's top bar, set **Select Execution Log Level** to `DEBUG`, and click
**Apply**. In INFO mode the log records only each step's status and duration -- the payloads are
never stored.
{{% /notice %}}

### Flatten it

The response mirrors the AWS `DescribeInstances` shape, so everything useful is two levels down
inside `Reservations[0].Instances[0]`. Rather than dot-walk that from a dozen later steps, flatten
it once.

9. Add a **Connector** step, **Code Runner** > **Run Python**, named `Read Instance`:

```python
response = {{vars.steps.Resolve_Instance.data | default({})}}
approval_tag = "{{vars.approval_tag}}"
approval_values = [v.strip().lower()
                   for v in "{{vars.approval_values}}".split(",") if v.strip()]

instance = {}
for reservation in (response.get("Reservations") or []):
    for candidate in (reservation.get("Instances") or []):
        instance = candidate
        break
    if instance:
        break

if not instance:
    return {"found": "no",
            "instance_id": "{{vars.instance_id}}",
            "reason": "no EC2 instance matched that identifier in this account and region"}

tags = {str(t.get("Key") or ""): str(t.get("Value") or "")
        for t in (instance.get("Tags") or [])}
groups     = [str(g.get("GroupName") or "") for g in (instance.get("SecurityGroups") or [])]
group_ids  = [str(g.get("GroupId") or "")   for g in (instance.get("SecurityGroups") or [])]
volumes    = [str((m.get("Ebs") or {}).get("VolumeId") or "")
              for m in (instance.get("BlockDeviceMappings") or [])
              if (m.get("Ebs") or {}).get("VolumeId")]

environment = tags.get(approval_tag, "")

return {
    "found": "yes",
    "instance_id": str(instance.get("InstanceId") or ""),
    "instance_type": str(instance.get("InstanceType") or ""),
    "state": str((instance.get("State") or {}).get("Name") or "unknown"),
    "private_ip": str(instance.get("PrivateIpAddress") or "none"),
    "public_ip": str(instance.get("PublicIpAddress") or "none"),
    "vpc_id": str(instance.get("VpcId") or ""),
    "subnet_id": str(instance.get("SubnetId") or ""),
    "groups_before": ", ".join(groups) or "none",
    "group_ids_before": ", ".join(group_ids) or "none",
    "root_volume": volumes[0] if volumes else "",
    "other_volumes": ", ".join(volumes[1:]) or "none",
    "environment": environment or "untagged",
    "approval_required": "yes" if environment.strip().lower() in approval_values else "no",
    "approval_reason": "{0}={1}".format(approval_tag, environment or "(unset)"),
}
```

Note where the approval decision is made: **here, in Python, not in the gate.** Deciding it in a
step means the *reason* is a value you can write into the case, instead of a condition nobody can
read afterwards.

10. Add a **Decision** step:

    | Field           | Value                                                              |
    |-----------------|--------------------------------------------------------------------|
    | **Step Name**   | `Resolve Gate`                                                     |
    | **Condition 1** | `vars.steps.Read_Instance.data.code_output.found == 'yes'`         |
    | **Branch Tooltip** | `Instance found`                                                |

11. Point the **Default Step** at a **Create Record** step on the **Comments** module that says
    what happened and links back to the alert -- the instance was not found, nothing was
    snapshotted, nothing was changed, and the usual causes are a terminated instance, a different
    AWS account, or a region mismatch

{{% notice note %}}
Write Decision conditions **without** `{{ }}`. The field accepts only an advanced expression and
FortiSOAR wraps it for you on save; adding your own braces produces a doubly-wrapped expression.
Every other Jinja field in this chapter wants the braces -- Decision, Condition, and Loop boxes do
not.
{{% /notice %}}

An alert naming an instance nobody can find is common and is not a failure. Recording it plainly
beats a red run.

---

## Part 2: Preserve the evidence -- and refuse to continue without it

Containment is a live change to a running instance, and a not-uncommon response to losing network
access is to wipe the disk. A snapshot taken *after* containment records the aftermath.

| Field             | Value                                                                |
|-------------------|----------------------------------------------------------------------|
| **Step Name**     | `Preserve Evidence`                                                  |
| **Action**        | `Capture Volume Snapshot`                                            |
| **Volume ID**     | `{{vars.steps.Read_Instance.data.code_output.root_volume}}`          |
| **Description**   | `Forensic snapshot before containment of {{vars.steps.Read_Instance.data.code_output.instance_id}} (alert {{vars.input.records[0].uuid}})` |

**Description** is required here, not optional. Put the instance and alert in it -- a snapshot with
a meaningless description is an unattributable cost line item three months from now.

### Read the snapshot back

The create call's return value says a snapshot was *requested*. Ask AWS whether it holds one.

This is the one step in the chapter that uses the **extended** connector, because the shipped one
has no describe-snapshot operation at all. `Generic AWS API Action` takes an AWS API call by name
and a JSON payload, so anything boto3 can do is reachable:

| Field             | Value                                                                          |
|-------------------|--------------------------------------------------------------------------------|
| **Step Name**     | `Verify Snapshot`                                                              |
| **Connector**     | `AWS EC2 (Extended)`, configuration `AWS Lab Extended`                         |
| **Action**        | `Generic AWS API Action`                                                       |
| **AWS Service**   | `ec2`                                                                          |
| **API Action**    | `describe_snapshots`                                                           |
| **Payload**       | `{"SnapshotIds": ["{{vars.steps.Preserve_Evidence.data.SnapshotId}}"]}`        |
| **Read Only**     | checked                                                                        |

**Read Only** is worth checking even though `describe_snapshots` is obviously a read. The operation
takes an API action as a *string*, which means a templating mistake upstream can turn a read into
something else; the flag refuses anything that is not a `describe_`/`get_`/`list_`/`search_`. A
passthrough operation is powerful precisely because it is not curated, so the guard rail is the
one you set.

### Gate on it

Add a **Decision** step named `Preservation Gate`, with **Condition 1**:

```jinja2
vars.steps.Verify_Snapshot.data.Snapshots | default([]) | length > 0
```

Condition 1 goes on to part 3. The **Default Step** goes to a comment that says containment was
**refused** because evidence could not be preserved, that no security group was changed, and that
the most common cause is a missing `ec2:CreateSnapshot` permission.

{{% notice tip %}}
This gate is what makes "preserve first" a control rather than a claim. Without it, the ordering is
a comment in your playbook, and a snapshot step that silently failed leaves you with an incident
and no evidence. Containing without evidence is a choice a human can still make by hand -- it is
not one the playbook should make silently.
{{% /notice %}}

{{% notice warning %}}
**Do not wait for the snapshot to reach `completed`.** An EBS snapshot is point-in-time as of the
moment `CreateSnapshot` returns; the block copy that follows is durability, not capture. A
`pending` snapshot is a complete capture that is still copying, and blocking containment until
`completed` keeps a compromised instance online for minutes for no forensic gain. What the gate
requires is that the snapshot *exists on AWS*, read back by ID -- not that it has finished copying.
{{% /notice %}}

---

## Part 3: Record the posture while it is still true

Create the case now -- after preservation, before containment -- so the record exists to hold the
"before" state at the moment that state is still the current state.

1. **Create Record** on **Incidents**, named
   `Cloud workload containment -- {{vars.steps.Read_Instance.data.code_output.instance_id}}`,
   type `Compromised System`, severity `High`, phase `Containment`, linked to the alert
2. **Create Record** on **Comments**, linked to that incident:

```html
<p><b>Evidence preserved before containment.</b></p>
<p>Snapshot <code>{{vars.steps.Preserve_Evidence.data.SnapshotId}}</code> of root volume
<code>{{vars.steps.Read_Instance.data.code_output.root_volume}}</code>, state
<b>{{vars.steps.Verify_Snapshot.data.Snapshots[0].State | default('unknown', true)}}</b>,
read back from AWS by ID rather than taken from the create call's return value.</p>

<p>Other volumes on this instance:
<code>{{vars.steps.Read_Instance.data.code_output.other_volumes}}</code> -- these are
<b>not</b> snapshotted by this playbook and must be captured separately if they are in scope.</p>

<p><b>Pre-containment network posture</b> (record this -- AWS keeps no history of it):<br/>
security groups <code>{{vars.steps.Read_Instance.data.code_output.groups_before}}</code>
(<code>{{vars.steps.Read_Instance.data.code_output.group_ids_before}}</code>)<br/>
private <code>{{vars.steps.Read_Instance.data.code_output.private_ip}}</code>,
public <code>{{vars.steps.Read_Instance.data.code_output.public_ip}}</code>,
subnet <code>{{vars.steps.Read_Instance.data.code_output.subnet_id}}</code></p>
```

{{% notice warning %}}
**This comment is a backup, not documentation.** After the next two parts run, it is the only place
the instance's original security-group membership exists. AWS keeps no history of
`ModifyInstanceAttribute` -- no previous-value field, no undo, and nothing in the CloudTrail event
that says what the group list used to be. Part 8 restores the workload by reading this comment,
because there is nothing else to read.

That is also why it records both **names and IDs**. Names are for the human reading the case; IDs
are what AWS attaches, and part 8 matches on them.
{{% /notice %}}

Only the root volume is snapshotted, and the comment says so out loud rather than leaving the
reader to assume otherwise. A multi-volume workload needs a snapshot per volume -- a loop worth
building deliberately rather than hiding inside one step.

---

## Part 4: Gate the workloads a human has to authorise

| Field           | Value                                                                        |
|-----------------|------------------------------------------------------------------------------|
| **Step Name**   | `Approval Gate`                                                              |
| **Condition 1** | `vars.containment_enabled != 'yes'`  -> `Containment Disabled Comment`        |
| **Condition 2** | `vars.steps.Read_Instance.data.code_output.approval_required == 'yes'` -> `Production Approval` |
| **Default**     | `Contain`                                                                    |

Two independent conditions, and it is worth being explicit about why both are there.
`containment_enabled` is the change-window switch and applies to every workload. The approval tag
applies only to the workloads a customer has called production.

{{% notice tip %}}
A run with containment disabled must **not** raise an approval. Asking a human to authorise an
action the playbook has already been told not to take is how approval fatigue starts -- and how
approvals stop being read.
{{% /notice %}}

### The approval itself

Add a **Manual Input** step in approval mode, assigned to your security team with a timeout:

| Field         | Value                                                        |
|---------------|--------------------------------------------------------------|
| **Step Name** | `Production Approval`                                        |
| **Title**     | `Approve containment of a production cloud workload`          |
| **Options**   | `Contain` (primary) -> `Contain`; `Decline` -> `Declined Comment` |

```markdown
Containment will replace **all** security groups on
`{{vars.steps.Read_Instance.data.code_output.instance_id}}`
({{vars.steps.Read_Instance.data.code_output.instance_type}},
{{vars.steps.Read_Instance.data.code_output.private_ip}}) with
**{{vars.quarantine_group}}**, which has no ingress and no egress rules. The workload will stop
serving traffic and stop reaching anything, including its own dependencies and any agent that
reports its health.

Currently attached: `{{vars.steps.Read_Instance.data.code_output.groups_before}}`.
**Record this** -- AWS keeps no history of the change, and it is what restore puts back.

Tagged **{{vars.approval_tag}}={{vars.steps.Read_Instance.data.code_output.environment}}**, which
is why this is being asked. Forensic snapshot
`{{vars.steps.Preserve_Evidence.data.SnapshotId}}` has already been taken, so declining does not
lose the evidence.
```

That is more prose than an approval usually carries, and every paragraph is doing a job: what will
break, what is being replaced, why *this* workload triggered the question, and that saying no does
not cost the evidence. An approver who has to open the AWS console to answer will start
rubber-stamping.

{{% notice warning %}}
**Assign the approval to a team by IRI, not by name.** A `manual_input` step given a bare team name
emits a string FortiSOAR cannot resolve, and the gate is created *unowned* -- it renders nowhere,
nobody can answer it, and the run waits forever. Pick the team from the field's own selector rather
than typing it.
{{% /notice %}}

Wire **Decline** to a comment stating that the workload is still online, still on its original
security groups, and that the snapshot is unaffected. A declined approval is an outcome, not an
error, and it deserves the same write-up a containment gets.

{{% notice note %}}
The approval gate keys off a **tag**, not an OS family or an instance type. A tag is what a
customer actually controls and already maintains -- `Environment=production` is the one nearly
everybody has. Gating on something intrinsic to the instance means the customer has to go populate
data your playbook invented.
{{% /notice %}}

---

## Part 5: Contain

| Field              | Value                                                          |
|--------------------|----------------------------------------------------------------|
| **Step Name**      | `Contain`                                                      |
| **Action**         | `Add Security Group To Instance`                               |
| **Instance ID**    | `{{vars.steps.Read_Instance.data.code_output.instance_id}}`    |
| **Group List**     | `{{vars.quarantine_group}}`                                    |

{{% notice warning %}}
**Despite the name, this operation replaces the instance's security-group list. It does not add.**
It resolves the names it was given to IDs and calls `ModifyInstanceAttribute(Groups=<those ids>)`.

For containment that is exactly the behaviour you want -- quarantine is only quarantine if the
permissive groups are *gone*, and a quarantine group added alongside an allow-all group contains
nothing. Anywhere else in your automation it is a footgun.
{{% /notice %}}

It has a sharper edge that reading the documentation will not surface: **a group name the operation
cannot resolve is dropped from the list rather than raising.** Ask for `quarantine,typo-group` and
you get a successful call that applied one group:

```json
{"quarantine":  "Security Group Name/ID Added Successfully",
 "typo-group":  "Security Group Name/ID Not Found in List of Security Groups",
 "Response":    {"ResponseMetadata": {"HTTPStatusCode": 200, "...": "..."}}}
```

Read that carefully, because it is the more interesting version of the lesson. The connector *did*
tell you. It put the failure in the response body, next to the success, under a 200 -- and the
**step still goes green**, because a per-item verdict inside a payload is not something the engine
can turn into a step status. Nothing downstream looks at it unless you write the step that does.

Ask for a group in a different VPC and it is the same shape: a call that succeeded having done
less than you asked. Hold that thought for part 6.

### Tag it

| Field              | Value                                                          |
|--------------------|----------------------------------------------------------------|
| **Step Name**      | `Tag Instance`                                                 |
| **Action**         | `Add Instance Tag`                                             |
| **Instance ID**    | `{{vars.steps.Read_Instance.data.code_output.instance_id}}`    |
| **Tag Key**        | `{{vars.status_tag_key}}`                                      |
| **Tag Value**      | `{{vars.status_tag_value}}`                                    |

The tag is for humans, cost tooling and the CMDB. It runs **before** the read-back deliberately, so
that the verification below is checking AWS's account of the network posture rather than the
playbook's own bookkeeping -- and so that a tag reading `Quarantined` on an instance whose group
list says otherwise becomes visible as the contradiction it is.

{{% notice tip %}}
If you take one habit from this chapter, take this one: **the tag is never the evidence.** The lab
instance this use case was built against was found tagged `Quarantined` and sitting on its fully
permissive security group. Every dashboard said contained. Nothing was.
{{% /notice %}}

---

## Part 6: Verify against AWS

This is the step most cloud-containment demos leave out, and the one the whole chapter turns on.

1. Add a **Connector** step, `Read Back`, **Get Instance Details** on the same instance ID
2. Add a **Code Runner** step, `Verify Containment`:

```python
response = {{vars.steps.Read_Back.data | default({})}}
expected = "{{vars.quarantine_group}}"
before   = "{{vars.steps.Read_Instance.data.code_output.groups_before}}"

instance = {}
for reservation in (response.get("Reservations") or []):
    for candidate in (reservation.get("Instances") or []):
        instance = candidate
        break
    if instance:
        break

groups = [str(g.get("GroupName") or "") for g in (instance.get("SecurityGroups") or [])]
tags   = {str(t.get("Key") or ""): str(t.get("Value") or "")
          for t in (instance.get("Tags") or [])}

contained = groups == [expected]

if contained:
    verdict = "the instance is on {0} and nothing else".format(expected)
elif expected in groups:
    verdict = ("{0} was attached but {1} other group(s) survived alongside it, "
               "so permissive rules may still apply".format(expected, len(groups) - 1))
elif not groups:
    verdict = "the instance reports no security groups at all"
else:
    verdict = ("the group list is {0}, which does not include {1} -- "
               "the change did not take effect".format(", ".join(groups), expected))

return {
    "contained": "yes" if contained else "no",
    "groups_before": before,
    "groups_after": ", ".join(groups) or "none",
    "verdict": verdict,
    "status_tag": tags.get("{{vars.status_tag_key}}", "not written"),
}
```

3. Add a **Decision** step, `Verify Gate`, on
   `vars.steps.Verify_Containment.data.code_output.contained == 'yes'`

{{% notice warning %}}
Note the comparison: `groups == [expected]`. **Exact equality, not membership.** "Contains the
quarantine group" is a different and much weaker claim, and it is the one that lets a still
permissive group survive alongside the quarantine group while every status field reads green.
{{% /notice %}}

The failure branch is the interesting one, and it deserves a real comment rather than a red step:

```html
<p><b>Containment did NOT take effect -- treat this workload as still reachable.</b></p>
<p>{{vars.steps.Verify_Containment.data.code_output.verdict}}.</p>
<p>Requested <code>{{vars.quarantine_group}}</code>; AWS now reports
<code>{{vars.steps.Verify_Containment.data.code_output.groups_after}}</code> (was
<code>{{vars.steps.Verify_Containment.data.code_output.groups_before}}</code>).</p>
<p>The API call returned success, which is why this comment exists. The usual causes are a
quarantine group name that does not resolve -- dropped from the list, reported only inside the
response body, and still a 200 -- or a group in a different VPC to the instance. Contain by hand now; do not re-run and hope.</p>
```

*"The API call returned success, which is why this comment exists"* is the sentence that separates
this playbook from one that would have carried on.

The success branch says the same things in the other direction, and adds one worth saying to a
customer out loud: **the instance is still running.** Containment cut the network and left memory,
processes and disk intact for investigation. Stopping the instance is the more common reflex and it
destroys the memory.

---

## Part 7: Chain it

Wire the parts in order: read, preserve, gate on preservation, create the case, record the posture,
gate on the tag, contain, tag, read back, verify, comment, and update the alert.

Three things to get right in the chained version that do not matter when you build each part alone.

**Order is not negotiable, and two orderings are load-bearing.**

- *Snapshot before the approval gate*, not after. Preservation is a read of the disk and costs
  nothing. If the approval is declined an hour later, the evidence from the moment of detection
  still exists -- putting the snapshot after the gate would mean a declined approval also declines
  the evidence.
- *Tag before the read-back*, for the reason part 5 gives.

**`ignore_errors` belongs on the reporting steps, not the containment ones.** A failed comment
should not abandon a half-quarantined instance. A failed isolation absolutely should stop the
playbook.

**A converging final step may reference only what every branch produced.** Four branches reach the
end here -- contained, not contained, declined, and containment disabled. The alert-update step
therefore records the snapshot and the instance, which all four have, and deliberately does *not*
interpolate the containment verdict, which only one branch produced. A summary field that renders
blank on three of four paths is how a case ends up implying an outcome nobody asserted. The verdict
lives in the branch comments, each of which states it unambiguously.

### Test it four ways

A containment playbook is only as good as its failure branches, so run it against four situations:

| Scenario | What it proves |
|---|---|
| `Environment=dev` | No approval. Snapshot exists, group list on AWS becomes exactly the quarantine group, tag written, case holds the pre-containment posture. |
| `Environment=production`, approved | The run **pauses** on the gate, and the instance ends up contained after you answer. |
| `Environment=production`, declined | The instance must **still be on its original group**, must **not** carry the quarantine tag, and the snapshot must exist anyway. |
| An instance ID that does not exist | No case, no snapshot, nothing touched, and a comment saying why. |

{{% notice tip %}}
The declined case is the one worth caring about. A gate that renders, is assigned to a team, and is
answerable -- but whose Decline branch still falls through into the containment step -- passes
every other scenario in that table. The only assertion that catches it is reading the instance's
group list off AWS after a declined run and finding it unchanged.
{{% /notice %}}

---

## Part 8: Restore

Containment is the half that demos well. Restore is the half that decides whether a customer lets
the containment run unattended.

Build it as a second playbook, triggered from the **incident** rather than the alert. It reads the
pre-containment posture out of the case comment part 3 wrote -- because, as part 3 said, that is
the only copy that exists.

The interesting failure here is not "the API call failed". It is "the record we are restoring from
is missing, ambiguous, or no longer true". Four checks exist only to establish that, and all four
run **before** the approval:

| Check | What it refuses |
|---|---|
| Parse the evidence comment | A case with no recorded posture, or one naming two different instances. It will not pick. |
| Read the instance | An instance that has been terminated since the incident -- the most likely outcome after a real compromise. |
| Compare its current state | An instance on neither the quarantine group nor the recorded list. Something else changed it, and a restore would overwrite that. |
| Check the groups still exist | A recorded group that has been deleted, or recreated in a different VPC. Partial restore is not offered. |

Then: approve, re-attach the recorded groups with `Add Security Group To Instance`, set the tag,
read back, and verify exact equality against the recorded list.

Three design choices are worth saying out loud, because each is the opposite of the obvious one.

**The approval gate is unconditional, where containment's is conditional.** Containment asks a
human only about production-tagged workloads. Restore asks every time, because the question it
poses is "is this host clean", and no tag on an instance answers that. The risk direction is
reversed, so the gate is.

**Match security groups by ID, not by name.** Names are for the human reading the case; IDs are
what AWS attaches. The sharp reason is the one part 5 already gave -- the operation that takes
names drops a name it cannot resolve, reports it only inside the response body, and still
returns success. Restoring from names turns
"one of the three original groups was deleted last week" into a partial restore reported as a
complete one. Restoring by ID, having first asked AWS whether every ID still exists, turns it into
a refusal that names the missing group.

**Set the tag to `Restored`; do not remove it.** An instance with no tag is indistinguishable from
one that was never contained, and the fact that this workload went through a containment outlives
the incident.

{{% notice tip %}}
Move the case to the **Recovery** phase on both terminal branches, including a failed restore. The
phase describes where the incident is, not whether the last step worked. And leave the case
**Open** -- closing it is a judgement about the whole incident, and a playbook that has made one
network change is not the thing that should be making it.
{{% /notice %}}

Test restore the same way you tested containment: approved, declined, run twice (the second run
must report "no change" as a **success** -- re-running a restore is a normal thing for a responder
unsure whether the first one finished), against an instance a third party has since modified, and
against a case with no evidence comment.

---

## Sidebar: if you have a CNAPP

Everything above starts from an alert that already names an instance. A CNAPP finding often does
not: it names an *identity* -- an IAM user, an access key, a role -- and leaves you to work out
which instances that identity touched.

With the **Lacework FortiCNAPP** connector configured, that pivot goes in front of part 1:

| Step | Action | Notes |
|---|---|---|
| `Get Alert Entities` | `Get Alert Entities` | Alert ID from the ingested record's `sourcedata` |
| `Get Alert Entity Details` | `Get Alert Entity Details` | Takes **Context Entity Type** and **Entity Value** |

and the close-out goes after part 7: `Add Comment to Alert` (choose `Markdown` format -- a table of
what changed is worth more than a paragraph) and `Close Alert` with a **Reason** picked from a
fixed list, of which `Malicious and have resolution in place` is the honest one here.

{{% notice warning %}}
**Context Entity Type offers only `IpAddress` and `Machine`.** There is no `User` or `Identity`
option -- so for a compromised-credentials alert, whose primary entity is an IAM principal, this
pivot **cannot** produce an instance ID. That is not a gap in the workshop; it is the lesson. Branch
on whether you found something to contain, and route the identity-only case to a **Manual Input**
step that escalates to an analyst. Rotating a key and reviewing CloudTrail is judgement work, and a
playbook that quietly did nothing there would be far worse than one that files a task.

`Run LQL Query` is the fallback when you have an IP but no machine entity -- and it is also how the
escalated analyst answers "what else did this identity do?".
{{% /notice %}}

{{% notice warning %}}
Close the CNAPP alert **only** on the path where containment actually succeeded. If the pivot
escalated to an analyst, or part 6 found the containment did not take, the alert must stay open.
Wiring `Close Alert` as an unconditional final step is how automation quietly hides incidents.
{{% /notice %}}

---

## Sidebar: when the shipped connector can't

Part 0 sent you to a shell twice: the security-group create takes no VPC ID, and `Revoke Egress`
cannot send `IpProtocol: "-1"`. In a lab you fix that by hand. In a customer environment where the
quarantine group has to be created per-VPC on demand, you cannot.

The general answer is that a FortiSOAR connector is a Python package you can read, and therefore
one you can extend. Clone the vendor connector, add a **generic passthrough** operation that takes
a service name, an API action, and a **payload as a JSON string**, and install it alongside the
stock connector under a new name.

That is exactly what **AWS EC2 (Extended)** is -- the connector part 0 had you install and part 2
used once. It is worth opening
[its source](https://github.com/ftnt-dspille/connector-aws-extended) rather than treating it as a
black box: the whole extension is one module plus a short footer appended to `operations.py`, and
no vendor function body is edited. That constraint is what makes it re-cloneable against a newer
vendor release instead of a patch you have to reapply by hand.

The JSON-string payload is the fix, not an implementation detail: the platform's parameter layer
retypes values it parses, and it cannot retype a string it never parsed. `"-1"` stays `"-1"`, and
an all-digit resource identifier stays a string rather than becoming an integer.

Two things that generic operation buys you beyond the egress fix:

- **Resolve instances by filter rather than by ID.** A filtered `describe_instances` returns an
  empty list for an unknown instance instead of raising `InvalidInstanceID.NotFound` -- which is
  the clean version of the **Ignore Errors** trick part 1 used.
- **Reach the operations the curated list does not cover.** There are exactly thirty-two curated
  operations on the AWS connector; there are thousands of boto3 calls. Describing a snapshot --
  which part 2 could not do without this -- tagging arbitrary resource types, invoking a Lambda,
  describing subnets, deactivating an IAM access key: all reachable, none shipped.

{{% notice warning %}}
Give that operation a `read_only` flag that refuses anything which is not a
`describe_`/`get_`/`list_`, and set it on every step that is only meant to read. A passthrough is
by definition an unaudited API surface inside your automation; a step that *cannot* mutate the
account even if someone edits it later is worth the one extra checkbox.
{{% /notice %}}

The trade is real: a cloned connector is yours to maintain across vendor releases, and it needs its
own configuration because credentials are encrypted per-connector on the appliance and cannot be
copied across. Reach for it when a shipped connector's edge is blocking a control you actually
need -- not to avoid learning the curated operations.

---

## Challenges

#### Challenge 1

Part 3's evidence comment is prose, and part 8 recovers the group list by parsing it. Write the
parser so it refuses rather than guesses: require the instance ID to be unanimous across every
comment on the case, match security group IDs on their format, and fail loudly when the case
contains two different recorded postures. Then change one word of the containment playbook's
comment wording and confirm your restore playbook notices.

#### Challenge 2

The playbook snapshots only the root volume and says so in the comment. Rework part 2 into a loop
over `BlockDeviceMappings` that snapshots every attached volume, and decide what the preservation
gate should require when three volumes were requested and two snapshots came back.

#### Challenge 3

Part 0 creates the quarantine group by hand because `Create Security Groups` takes no VPC ID.
Build the per-VPC version: given an instance, find or create a quarantine group in *that
instance's* VPC, strip its default egress rule, and cache the group ID so the second incident in
the same VPC does not create a second group.
