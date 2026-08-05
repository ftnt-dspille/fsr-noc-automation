---
title: "Cloud Ops & DevOps Automation"
linkTitle: "Cloud Ops (AWS)"
weight: 90
description: "What a general-purpose orchestrator like FortiSOAR brings to a team that already uses Terraform, Lambda, and ServiceNow -- and how to wire it into your existing automation without replacing what works."
tags: ["knowledge", "architecture"]
---

## Why you even need another thing

You have a CDK or Terraform repo, Lambda functions, maybe Azure Functions, a CI/CD pipeline, and a
ServiceNow instance. When something needs to happen, you write code. That works. So why add a SOAR
platform into the picture?

**SOAR is not your IaC tool. It is not your compute platform.** It is an orchestrator that sits
between the things that generate events and the things that act on them. It is the "when X happens in
ServiceNow, do Y in AWS, then tell Z in Slack" layer -- not the thing that builds the VPC or runs
the Lambda.

The value is in the glue:

| Your current stack does this well | The orchestrator does this |
|---|---|
| Provision infrastructure (Terraform, CDK, ARM) | Detect when a process should start and wire up the steps |
| Run compute (Lambda, Functions, EC2) | Enrich raw events with context before they reach the compute |
| Store tickets (ServiceNow, Jira) | Watch for tickets and route decisions without polluting your codebase with polling |
| Deploy code (GitHub Actions, Azure DevOps) | Provide a UI for non-developers to approve, modify, and track those deployments |

You do not call Lambda from Terraform. You do not embed ServiceNow client logic in your ARM
templates. SoAR gives you the place where all those systems' events can meet.

{{% notice tip %}}
**Think of it like Step Functions or GitHub Actions, but for the business process layer.** Your
pipeline orchestrates code deployment. Your orchestration layer orchestrates *what happens when a
ticket arrives, an alert fires, or a compliance check fails*. They run adjacent, not competitive.
{{% /notice %}}

---

## Where this fits in your stack

```
ServiceNow Incident           Cloud Event (GuardDuty, CloudTrail)        Monitoring (Prometheus, DCM)
      |                                 |                                          |
      | webhook / API polling           | SNS / EventBridge webhook                 |  Custom API Endpoint
      |                                 |                                          |
      +-------------+-------------------+------------------------+-----------------+
                    v                                                        v
         +-------------------------------------------+    +------------------------------------+
         |      FortiSOAR (the orchestrator)         |    |  Your existing automation          |
         |                                           |     |                                   |
         |  1. Normalize the event                   |    |  AWS Lambda                        |
         |  2. Enrich with context (CMDB, tags, ...) |    |  Azure Functions                    |
         |  3. Route / decide / approve               |    |  Terraform plan/apply               |
         |  4. Kick off the right action              |    |  Ansible / Salt / custom scripts    |
         |  5. Write up what happened                 |    |                                   |
         +-------------------+-----------------------+    +------------------------------------+
                             |
                             | invoke lambda / fire function / call API / change FortiGate
                             |
         +-------------------------------------------+    +------------------------------------+
         |      Action targets                       |    |     Notification & tracking        |
         |                                           |                                   |
         |  AWS (EC2, IAM, S3, Security Groups)      |    |  Slack / Teams                       |
         |  Azure (VMs, NSGs, App Service)            |    |  ServiceNow (update ticket)          |
         |  FortiGate (block IP / policy push)        |    |  Email                               |
         +-------------------------------------------+    +------------------------------------+
```

Your Lambda still does the work. Your Terraform still manages state. The orchestrator decides
*what* Lambda to invoke, *with what context*, and *writes up what happened* so that at 2am the
on-call person can understand it without reading the function code.

---

## The common pattern (and why you already do it)

Every DevOps team has this pattern scattered across glue scripts:

```
Something happens (event)
  -> parse it and figure out what it means (enrich)
  -> decide what to do (routing / if/else / approval)
  -> kick off the action (lambda, function, terraform apply)
  -> write up what happened (service now, slack, ticketing)
```

The difference is *where* that logic lives. In most teams it lives in:
- An EventBridge rule that invokes a Lambda, which invokes another Lambda, which posts to a SNS topic
- A GitHub Actions workflow that calls Terraform, then updates Jira, then posts to Slack
- A `cron` job that polls ServiceNow, parses JSON, and hits an internal API

**All of that is automation.** SOAR is the same pattern in a platform that gives you the parts out of
the box: the trigger, the decision, the approval gate, the audit trail, and the connector catalog.

{{% notice note %}}
You can (and should) still call Lambda from a playbook. There is nothing to stop you. The playbook
is the decision layer; the Lambda is the action layer. They are designed to run that way. Chapter
8 covers how to make raw HTTP calls from a playbook, which is how you invoke a Lambda's REST
endpoint or trigger an Azure Function -- no special connector needed.
{{% /notice %}}

---

## Prerequisites

- A FortiSOAR account (completed earlier chapters in this workshop)
- The **Generic HTTP** connector, configured and available (covered in
  [DevOps Automation](/chapter-08-gitops-devops))
- The **Code Runner** connector, introduced in
  [DevOps Automation](/chapter-08-gitops-devops) -- used for data transforms
- Completed [Triggers](/chapter-03-playbooks/02-triggers) and
  [Playbooks](/chapter-03-playbooks) -- this chapter builds on those foundations

You do **not** need: an AWS account with EC2 instances, the AWS connector, or FortiManager.

---

## Pattern 1: Watch ServiceNow, act in the cloud

This is the pattern that shows up most often in customer environments and it is the one that
separates a "nice-to-have" from something that saves shifts of work.

### The problem

Your team monitors ServiceNow for change requests. When a CR of a certain type is approved,
something needs to happen in cloud:

- A security group rule needs to be added to allow traffic for a new workload
- A FortiGate needs to open a rule for a vendor IP range
- An IAM role needs to be updated so a new service can access resources
- An NSG rule needs to flip in Azure so a cross-region deployment works

Today that flows through: someone sees the CR, reads it, decides what to change, talks to the
cloud team, waits for the PR, and then validates. That is hours in which the workload is blocked.

### How it looks in the orchestrator

```
Trigger: ServiceNow record updated (CR approved)
  -> Read the record: what changed, who approved, what resources?
  -> Enrich: look up the resources in CMDB, check tags, pull the VPC/region
  -> Route Decision: is this security group? FortiGate? IAM? NSG?
  -> Action: Generic HTTP call to Lambda / Azure Function / AWS API / FortiGate
  -> Verify: read back what changed and confirm it matches
  -> Write up: update ServiceNow with what happened, post to Slack
```

### Build it

1. Navigate to **Automation > Playbooks**
2. Click **+ Add Playbook**, **Name**: `Cloud CR Auto-Remediation`, and click **Create**
3. Trigger: **On Record Create or Update**, **Select Module** `ServiceNow Change` (or whatever
   module you use for change records), filter on **State**: `Approved`

4. Add a **Connector** step for the ServiceNow connector, **Action**: `get_record` or equivalent,
   to pull the full change record and its related items

5. Add a **Code Runner** step named `Extract Resources` that parses the CR body and extracts the
   target resource type, region, and identifiers:

```python
cr_body = params['cr_body']
# Example: the approved CR has a JSON field with the requested changes
changes = json.loads(cr_body.get('requested_changes', '{}'))
resources = changes.get('resources', [])

return {
    'count': len(resources),
    'resources': [
        {
            'type': r.get('resource_type', ''),
            'identifier': r.get('resource_id', ''),
            'region': r.get('region', ''),
            'action': r.get('requested_action', ''),
        }
        for r in resources
    ]
}
```

6. Add a **Decision** step named `Resource Type`:

     | Field           | Value                                                         |
     |-----------------|---------------------------------------------------------------|
     | **Condition 1** | `vars.steps.Extract_Resources.data.code_output.resources[0].type == 'security_group'` |
     | **Condition 2** | `vars.steps.Extract_Resources.data.code_output.resources[0].type == 'fortigate'` |
     | **Condition 3** | `vars.steps.Extract_Resources.data.code_output.resources[0].type == 'lambda_invoke'` |

Each condition branches to its own action step.

7. For the `security_group` branch, add a **Connector** step that calls a Lambda function:

     | Field             | Value                                                    |
     |-------------------|----------------------------------------------------------|
     | **Step Name**     | `Invoke Lambda - Security Group`                         |
     | **Connector**     | `generic-http`                                           |
     | **Action**        | `HTTP POST`                                              |
     | **URL**           | `https://lambda.us-east-1.amazonaws.com/2015-03-31/functions/<FUNCTION_ARN>/invocations` |

     Headers:
     - `Content-Type`: `application/json`

     Body:
```json
{
  "resource_id": "{{vars.steps.Extract_Resources.data.code_output.resources[0].identifier}}",
  "region": "{{vars.steps.Extract_Resources.data.code_output.resources[0].region}}",
  "action": "{{vars.steps.Extract_Resources.data.code_output.resources[0].action}}"
}
```

{{% notice note %}}
Invoke a Lambda's **sync** endpoint (the `/invocations` URL above) and the playbook waits for the
function to complete. The response body is the function's return value. For longer-running
workloads, invoke the sync endpoint but wrap it in a timeout -- the step will fail the playbook if
the function exceeds its duration, which is a signal that something is stuck, not that the
playbook is broken.
{{% /notice %}}

8. For the `fortigate` branch, the pattern is identical but the target is a FortiGate API call or
   a Lambda that pushes the rule. The point is the same: **the playbook decides, the Lambda acts**.

9. Add a **Connector** step, ServiceNow, **Action**: `update_record` -- write the outcome back to
   the change record with what happened, timestamps, and a link to the audit trail

10. Add a **Connector** step for **Slack** or **Teams** -- post to the operations channel with a
    summary

### Why this is worth doing

The playbook does not *do* the security-group change. Your Lambda does. The playbook provides:
- A consistent entry point that multiple sources (ServiceNow, email, webhook) can feed into
- Enrichment and context *before* the action runs (so the Lambda can assume it got good data)
- A human approval gate where the change is risky (see Pattern 2 below)
- An audit trail that records who approved, what changed, when, and whether it took effect
- A failure path that tells ServiceNow and Slack that things did not work

None of that is hard to build in glue code. All of it is tedious to build in glue code.

{{% notice tip %}}
**This pattern works identically with Azure.** Replace the Lambda invocation with an Azure Function
HTTP trigger URL or an Azure Resource Manager API call. The playbook does not care -- it is an
`HTTP POST` to a URL with a JSON payload. The generic-http connector is the abstraction layer.
{{% /notice %}}

---

## Pattern 2: Add a human gate between an event and an action

Automation without approval gates is risky. Automation with too many is slow. The right place for one
is between "we detected something" and "we are about to change production."

### Where to put it

```
ServiceNow alert -> Playbook enriches and routes -> Manual Input gate -> Action -> Verification
                                                       ^
                                              The human approves or declines
                                              before anything production changes
```

### Build it

Continue from Pattern 1's playbook. After the `Resource Type` decision and before the action step,
add a **Decision** step named `Risk Check`:

     | Field           | Value                                                        |
     |-----------------|--------------------------------------------------------------|
     | **Condition 1** | `vars.steps.Extract_Resources.data.code_output.resources[0].region == 'prod'` |
     | **Tooltip 1**   | `Production -- require approval`                              |

Condition 1 branches to a **Manual Input** step in approval mode:

     | Field         | Value                                                        |
     |---------------|--------------------------------------------------------------|
     | **Step Name** | `Production Approval`                                        |
     | **Title**     | `Approve automated change for production CR`                  |
     | **Options**   | `Proceed` (primary) -> `action step`; `Decline` -> `Decline Comment` |

```
The playbook has matched an approved ServiceNow change request to an automated action:

Resource: {{vars.steps.Extract_Resources.data.code_output.resources[0].identifier}}
Region: {{vars.steps.Extract_Resources.data.code_output.resources[0].region}}
Action: {{vars.steps.Extract_Resources.data.code_output.resources[0].action}}
Type: security group rule change

This will modify production cloud infrastructure.
```

Wire **Decline** to steps that write to ServiceNow ("Change declined by approver") and Slack,
leaving the infrastructure untouched.

{{% notice tip %}}
**Put the decision *before* the action, not after.** An approval that arrives after the Lambda has
already run is not an approval. The common mistake is "invoke the Lambda in async mode, then ask the
human" -- by which point the function has already changed the security group. The gate comes first,
the invocation comes second.
{{% /notice %}}

{{% notice tip %}}
**A declined action still writes up what happened.** It is not an error. It is an outcome that
ServiceNow, Slack, and the audit trail should have a record of. A playbook that goes silent on
decline is worse than one that does not run at all.
{{% /notice %}}

---

## Pattern 3: Infrastructure drift detection (Terraform-adjacent)

Terraform gives you `plan` and `apply`. But it cannot answer "is the thing we deployed last week
still in the state we intended?", because someone else changed it through the console. SOAR can
schedule that check and act on it.

### The pattern

```
Scheduled Trigger (every 4 hours)
  -> Code Runner: call AWS API / Azure ARM API / Terraform show to read current state
  -> Code Runner: compare current state against desired state (from S3, Git, or Terraform state)
  -> Decision: drift detected?
  -> If yes:
       -> Create ServiceNow Incident or update existing ticket
       -> Post to Slack with details
       -> Optional: invoke Lambda to auto-remediate or Terraform apply drift fix
       -> If no action taken: Manual Input gate for human review
  -> If no: end silently (no drift = no output)
```

### Why it lives here

You could script this in a cron job. The advantage of running it in the orchestrator is that it
feeds you an incident in ServiceNow, a Slack message in the right channel, and an approval gate
-- all without you wiring up those three systems from a Python script. The **scheduled trigger** is
the piece that matters most: you get a UI for managing when it runs, pausing it, and seeing which
runs succeeded.

{{% notice note %}}
This is not a replacement for `terraform plan` in CI. That catches drift at *commit time*. This
pattern catches drift at *runtime*. Both are valuable; they are not the same thing.
{{% /notice %}}

---

## Calling cloud services from a playbook

You do not need to build a custom connector to talk to AWS or Azure. The **Generic HTTP** connector
handles the common case, and a Lambda or Function with an HTTP endpoint is just a URL.

### Lambda invocation (sync)

```
POST https://lambda.<region>.amazonaws.com/2015-03-31/functions/<function-arn>/invocations
Body: {"key": "value"}
```

The `generic-http` connector makes this a two-step playbook: configure the IAM credentials as a
Bearer token (or use AWS Signature V4 in a Code Runner step to generate the auth), then POST.

{{% notice tip %}}
**Use the AWS connector's `Assume Role` checkbox if it is available.** It handles the
`sts:AssumeRole` dance and signature generation for you. If it is not available or you need an API
it does not cover, fall back to Generic HTTP with a Code Runner step that signs the request using
`boto3`'s `SigV4Auth`.
{{% /notice %}}

### Lambda invocation (async via EventBridge)

For longer-running actions, invoke through EventBridge and let the function run in the background.
The playbook treats it as fire-and-forget:

```
POST /events
Body: {"source": "fortisoar-orchestration", "detail-type": "soar-triggered-action", ...}
```

The playbook moves on. The function runs. The function's own observability (CloudWatch Logs, X-Ray)
tracks it.

### Azure Function invocation

Identical pattern. An HTTP-triggered function is a URL:

```
POST https://<function-app>.azurewebsites.net/api/<function-name>?code=<function-key>
Body: {"key": "value"}
```

### Azure Resource Manager (ARM) API

For direct Azure operations (modify NSG, scale app service, restart VM):

```
PATCH https://management.azure.com/subscriptions/<id>/resourceGroups/<rg>/providers/<type>/<name>?api-version=<version>
Headers: { "Authorization": "Bearer <access-token>", "Content-Type": "application/json" }
Body: { "properties": { ... } }
```

Again, **Generic HTTP + Code Runner** to sign the request and parse the response. The playbook
provides the trigger, the decision, the approval, and the follow-up. The rest is an HTTP call.

{{% notice warning %}}
**Do not store Azure access tokens as plain text in connector configurations.** Use the OAuth2
option in Generic HTTP to handle the token lifecycle: set up a service principal with a client ID,
client secret, and tenant ID, and let the connector fetch and cache the token automatically.
{{% /notice %}}

---

## Pattern 4: FortiGate automation from ITSM

Your team manages FortiGates but probably not FortiManager. A common ask: "When ServiceNow says
'allow vendor IP X to talk to port Y on subnet Z', do the FortiGate rule push."

### The playbook

```
Trigger: ServiceNow task created/updated (vendor access request)
  -> Validate: is the IP in a trusted range? Has someone approved it?
  -> Decision: approved -> proceed; else -> decline with explanation
  -> Action: Code Runner builds the FortiGate API call (or uses the FortiGate connector directly)
  -> Verify: read back the rule list and confirm the rule exists
  -> Notify: update ServiceNow with the rule ID
```

The FortiGate connector operations you need:

| Action | What it does | When to use |
|---|---|---|
| `Create Firewall Policy` | Adds a new policy rule | When the request is for a new connection |
| `Update Firewall Policy` | Modifies a policy rule | When adjusting an existing rule |
| `Delete Firewall Policy` | Removes a policy | When the vendor engagement ends |

{{% notice note %}}
A FortiGate policy change is idempotent if you identify the existing policy by a unique field
(source IP + destination + comment). Re-running the playbook should produce no change, just as
`terraform apply -refresh-only` is a way to confirm state matches. Build the idempotency into
the playbook, not into the Lambda that calls the API.
{{% /notice %}}

---

## Common pitfalls

**Treating the playbook as the action.** The playbook should not contain AWS SDK calls or Terraform
logic. It should contain *decisions about which action to take, who to ask, and when to proceed*.
If a step's body is 200 lines of boto3, it belongs in a Lambda, and the playbook should invoke the
Lambda.

**Embedding credentials.** Every connector configuration manages credentials. Use them. A playbook
that hardcodes an access key is one that will leak to the run log.

**Ignoring the response shape.** `generic-http` returns `{"status_code": 200, "headers": {...},
"body": {...}}`. If you reach for `vars.steps.Lambda_Invoke.data.body.result`, you get the Lambda
response. If you reach for `vars.steps.Lambda_Invoke.data.result`, you get nothing. Always branch
on `status_code` first -- a 403 from Lambda means "the function tried and IAM denied it", which is
different from a 403 from the connector (which means "the connector itself cannot authenticate").

**Async without observability.** A playbook that invokes an async Lambda and then ends successfully
is a playbook that can lie. The step goes green because the invocation URL accepted the request.
Either use sync invocation, or have the async function write its result somewhere the playbook can
read back (SQS queue, DynamoDB, S3) and add a follow-up step that checks that destination.

**Not writing up the failure.** A playbook that does nothing when something goes wrong is worse
than one that cannot run at all. The "declined" and "error" paths are the ones that matter at 2am.

---

## Summary

| Your existing automation does | The orchestrator adds |
|---|---|
| Terraform provisions infrastructure | Scheduled drift detection, incident creation on mismatch |
| Lambda / Functions compute | Trigger, enrichment, approval gate, audit trail around the invocation |
| ServiceNow stores work items | Watching for those items, routing decisions without touching your ServiceNow client code |
| CI/CD deploys code | Non-developer approval gates and status notification around the deployment |
| Slack notifies people | Structured, templated notification that ties back to the incident that triggered it |

### What to carry away

1. **SOAR is the glue, not the engine.** Your Lambda still runs the code. Your Terraform still
   manages state. The orchestrator decides *what* to invoke, *when*, and *who approved it*.

2. **Generic HTTP is your escape hatch.** You can invoke a Lambda, a Function, an ARM API, or any
   REST endpoint without building a connector. Use named connectors (ServiceNow, GitHub, AWS,
   FortiGate) when they exist; use Generic HTTP when they do not.

3. **A human gate is cheap and valuable.** One Manual Input step between "we detected" and "we
   changed production" separates you from a team that accidentally locked themselves out.

4. **Write up everything.** Approval, decline, success, failure -- the audit trail is what makes
   this reusable and defendable. Without it, you have a script.

---

## Challenges

#### Challenge 1

Build a playbook that watches a ServiceNow module. When a record reaches "Approved" state, invoke
an HTTP endpoint (your choice: Lambda, Function, or a test webhook) with the record's fields. On
completion, update the ServiceNow record with the outcome. Include an approval gate for any record
in a production region.

#### Challenge 2

Write a scheduled playbook that calls an AWS or Azure API to read the current state of a resource,
compares it to a desired state stored in a file (in S3, Git, or a module), and creates a
ServiceNow incident when the states do not match. Test it by making a manual change and running the
playbook.

#### Challenge 3

Build the end-to-end change-request flow: ServiceNow change -> playbook decision -> Lambda
invocation -> verification -> ServiceNow update -> Slack notification. Include the approval gate
for production and the decline path. Time how long it takes vs. the manual process and report the
delta.
