---
title: "Approvals and Error Handling"
linkTitle: "Approvals & Errors"
weight: 45
description: "Pause playbooks for human reviews, route on approval/rejection, and handle step failures with ignore_errors, retry loops, and decision branching."
tags: ["hands-on", "knowledge"]
---

## Why this matters

So far you've built playbooks that run straight through from trigger to end. Real production playbooks need two things:

1. **Gatekeeper steps** — pause for a human to approve or reject before taking action
2. **Error handling** — keep running when a step fails, retry on transient errors, and route differently on failure

This chapter covers both.

---

## Prerequisites

- Completed [Playbook fundamentals](/chapter-03-playbooks) and the [Hands-on playbook exercises](/chapter-03-playbooks/04-hands-on)
- A configured connector for testing (FortiGate, FortiManager, Generic HTTP, or Utilities)
- Familiarity with Jinja expressions from the [Jinja chapter](/chapter-04-jinja)

---

## Manual Input: the gatekeeper step

The **Manual Input** step pauses a running playbook and waits for a human to click a button or submit a form. It's the building block for approvals, analyst review, and yes/no confirmations.

### Manual Input without approvals

Set up a basic two-button manual input:

1. Create a new playbook called `Manual Input — Yes/No`.
2. Add a **Manual** trigger step.
3. Add a **Manual Input** step:

| Field | Value |
|-------|-------|
| **Step Name** | `Confirm Action` |
| **Step Title** | `Proceed with firewall change?` |
| **Description** | `Block 10.200.1.50 on Enterprise_Core?` |
| **Options** | *(see below)* |

Add two options:

| Option | Label | Primary? | Next Step |
|--------|-------|----------|-----------|
| 1 | `Yes — Block it` | Yes | *(the success path step)* |
| 2 | `No — Skip` | No | *(the skip path step)* |

Add two connector steps — one for `Yes` (e.g., FortiGate `add_firewall_address`) and one for `No` (e.g., Utilities `No-Op`). Connect the Manual Input's Yes branch to the blocker step and the No branch to the no-op step.

{{% notice note %}}
The **Primary** button is styled as the default/highlighted action. It does not auto-execute — it's purely visual.
{{% /notice %}}

### How the playbook pauses

When a playbook hits a Manual Input step, the run status changes to **paused** and the step status changes to **awaiting**. The playbook sits there until someone clicks a button. During that pause:

- All subsequent steps are skipped
- The playbook is visible in the execution history as pending
- The person who clicks the button must have permission to interact with the workflow

---

## Approval steps

When you need a formal approve/reject gate with team routing, notifications, and timeout — you use an **approval**. Under the hood it's the same Manual Input step with `is_approval: true`. This unlocks:

- **Team assignment** — the prompt is owned by a specific team; only team members can answer it
- **Timeout auto-routing** — if no one responds before the deadline, the playbook auto-continues on the timeout path
- **Notification channels** — in-app and email notifications when the approval prompt opens

### Configure an approval

Add a **Manual Input** step and enable the approval mode:

| Field | Value |
|-------|-------|
| **Step Name** | `Security Approval` |
| **Is Approval** | `True` |
| **Step Title** | `Open port to application` |
| **Description** | `Approve opening {{ app_name }} to {{ host }}:{{ port }}` |
| **Assign To** | *(select a team)* |
| **Options** | `Approve` (primary) and `Reject` |
| **Timeout** | *(optional — days/hours/minutes)* |

Connect the `Approve` branch to the steps that should run on approval. Connect the `Reject` branch to cleanup or notification steps.

{{% notice warning %}}
**Team assignment gotcha:** the approval `assign_to` field must be a **team IRI**, not a team name. If you set `assign_to` to a plain string or leave it unset, the prompt becomes invisible to the approval polling mechanism and no team member will see it. Use the team selection UI in the step editor to get the IRI right.
{{% /notice %}}

### Timeout behavior

When you set a timeout on an approval:

- The playbook waits up to the deadline
- If no one responds, the playbook auto-resumes following the step's `step_iri` target (usually the rejection or skip path)
- The run does not fail — it continues on the configured path

### Two-tier approval chain

Common pattern: run an approval gate for one team, then for another, sequentially.

```
Start → SOC Tier 1 Approval
         → Approve → Security Tier 2 Approval
              → Approve → [proceed with change]
              → Reject → [send rejection notice]
         → Reject → [send rejection notice]
```

Each approval step is a separate Manual Input step with `is_approval: true` and different `assign_to` teams.

---

## Decision steps for error branching

Decision steps let you evaluate conditions and route to different branches. Combined with Jinja, they handle dynamic error routing.

### Decision step configuration

Add a **Decision** step and define conditions:

| Field | Value |
|-------|-------|
| **Step Name** | `Check Response` |
| **Conditions** | *(Jinja expressions, one per branch)* |

Example conditions:

| Label | Condition | Next Step |
|-------|-----------|-----------|
| **Success** | `{{ vars.steps.API_Call.data.status_code == 200 }}` | `Process Response` |
| **Rate Limited** | `{{ vars.steps.API_Call.data.status_code == 429 }}` | `Wait and Retry` |
| **Other Error** | *(else branch)* | `Log Error` |

### Decision evaluation order

Conditions are evaluated top-to-bottom. The first matching condition wins. The `else` branch catches everything that didn't match earlier conditions. Only one branch runs.

---

## Error handling mechanisms

Playbook steps can fail — connectors time out, APIs return errors, records aren't found. FortiSOAR provides three levels of error handling:

### 1. Per-step: `ignore_errors`

Set **Ignore Errors** on a step to prevent its failure from stopping the playbook:

- The step fails, but the playbook continues to the next step
- The step's output is still available (may be empty or contain error details)

Use this for non-essential steps — notifications, logging, enrichment — where failure shouldn't abort the entire workflow.

### 2. Per-step: Do-Until retry loop

Set a **Do Until** condition + **Delay** + **Max Retries** on connector steps to retry automatically:

| Field | Value |
|-------|-------|
| **Do Until Condition** | `{{ vars.steps.Step_Name.data.status_code == 200 }}` |
| **Delay (seconds)** | `30` |
| **Max Retries** | `5` |

The step reruns up to `max_retries` times, waiting `delay` seconds between attempts, until the condition evaluates to `true`. If retries are exhausted, the step fails and the playbook continues (or faults, if `ignore_errors` is not set).

{{% notice tip %}}
Combine `ignore_errors` with `do_until` — if the step fails after exhausting retries, the playbook continues rather than faulting.
{{% /notice %}}

### 3. Workflow-level: manual retry

When a whole playbook run fails from end to end, use the **Retry** action:

```
POST /api/wf/api/workflows/{pk}/retry/
```

This re-runs the entire workflow run from the beginning.

### Step and run status lifecycle

| Run Status | Meaning |
|------------|---------|
| `executing` | Playbook is actively running |
| `paused` | Waiting at a manual input / approval step |
| `finished` | Completed successfully |
| `failed` | A step failed and `ignore_errors` was not set |
| `terminated` | Manually stopped or timed-out |

| Step Status | Meaning |
|-------------|---------|
| `incipient` | Created but not yet reached |
| `active` | Currently executing |
| `awaiting` | Paused at manual input |
| `finished` | Completed successfully |
| `failed` | Execution raised an error |
| `skipped` | Sibling branch taken (by decision or earlier failure) |

---

## Hands-on: build an approval + error handling playbook

You'll build a playbook that:

1. Calls a connector (may fail)
2. If it fails, retries up to 3 times
3. If retries are exhausted, pauses for approval to decide: retry manually or abort
4. On approval, proceeds; on rejection, logs the failure

### Step-by-step

1. Navigate to **Automation > Playbooks**.
2. Create a new collection: `03 - Approvals and Errors`.
3. Create a playbook: `Approval with Retry`.
4. Add a **Manual** trigger step.

5. **Connector** step — a call that might fail:

| Field | Value |
|-------|-------|
| **Step Name** | `Check API Health` |
| **Connector** | *(any configured connector — Generic HTTP, FortiGate, etc.)* |
| **Operation** | *(health check or GET operation)* |
| **Do Until Condition** | `{{ vars.steps.Check_API_Health.data.status_code == 200 }}` |
| **Delay** | `5` |
| **Max Retries** | `3` |

6. **Decision** step — check if it succeeded:

| Field | Value |
|-------|-------|
| **Step Name** | `Did It Work?` |
| **Conditions** | *(see below)* |

| Label | Condition | Next Step |
|-------|-----------|-----------|
| **Success** | `{{ vars.steps.Check_API_Health.data.status_code == 200 }}` | `Mark Success` |
| **Failure** | *(else)* | `Request Approval` |

7. **Manual Input** — the approval gate:

| Field | Value |
|-------|-------|
| **Step Name** | `Request Approval` |
| **Is Approval** | `True` |
| **Step Title** | `API call failed after retries` |
| **Description** | `Check API Health failed 3 times. Retry or abort?` |
| **Options** | `Retry` (primary) → `Check API Health`; `Abort` → `Log Failure` |

8. **Send Email** or **No-Op** step — `Log Failure` branch.
9. **Set Variable** step — `Mark Success` branch:

| Variable | Value |
|----------|-------|
| `health_check` | `Passed` |

10. **End** step.

11. Connect the steps so the approval's `Retry` option loops back to `Check API Health`, and `Abort` goes to `Log Failure`.

### Verify

> **Verify:** Trigger the playbook. If the connector fails, it retries 3 times with 5-second delays, then pauses at the approval gate. Click `Retry` to try again or `Abort` to log the failure. Check the execution history — the run should show `paused` status while waiting at the approval step, and `finished` once a button is clicked.

---

## The complete YAML playbook

{{% expand "Click to view the approval with retry YAML" %}}

```yaml
collection: Approvals and Errors
description: Connector step with retry loop, approval gate, and error branching.
visible: true

playbooks:
  - name: Approval with Retry
    is_active: true
    parameters: []
    steps:
      - name: Start
        type: start
        next: Check API Health

      - name: Check API Health
        type: connector
        connector: your-connector-name
        operation: health_check
        config: "your-config-name"
        params: {}
        do_until:
          condition: "{{ vars.steps.Check_API_Health.status_code == 200 }}"
          delay: 5
          retries: 3
        next: Did It Work?

      - name: Did It Work?
        type: decision
        conditions:
          - label: "Success"
            condition: "{{ vars.steps.Check_API_Health.status_code == 200 }}"
            next: "Mark Success"
          - label: "Failure"
            condition: "true"
            next: "Request Approval"

      - name: Request Approval
        type: manual_input
        is_approval: true
        title: "API call failed after retries"
        description: "Check API Health failed 3 times. Retry or abort?"
        options:
          - option: "Retry"
            primary: true
            next: "Check API Health"
          - option: "Abort"
            next: "Log Failure"

      - name: Mark Success
        type: set_variable
        vars:
          health_check: "Passed"
        next: Done

      - name: Log Failure
        type: connector
        connector: utilities
        operation: noop
        next: Done

      - name: Done
        type: end
```

{{% /expand %}}

---

## Error handling pattern reference

| Scenario | Mechanism | Example |
|----------|-----------|---------|
| Non-critical step might fail | `ignore_errors: true` | Send notification email — don't abort if it fails |
| API is flaky, retry transient errors | `do_until` + `delay` + `retries` | Poll for a task completion with backoff |
| Unknown error, need human review | Decision → Manual Input | Connector returned unexpected status; ask if we should retry |
| Formalized yes/no gate | Manual Input with `is_approval: true` | Change management approval before modifying production |
| Multi-team review chain | Sequential approval steps | SOC approves → Security approves → execute |
| Whole playbook needs to be re-run | Workflow-level retry API | Infrastructure was down, rerun the workflow |

### Common mistake: error vs. expected path

Don't use `ignore_errors` for expected alternative outcomes. If a connector returns `status_code: 404` for "device not found," that's not an error — it's a valid response. Use a **Decision** step to branch on the response instead of suppressing it.

---

## Summary

| Concept | How it works |
|---------|-------------|
| **Manual Input** | Pauses the playbook; click a button to resume a specific branch |
| **Approval** | Manual Input + `is_approval: true` + team assignment + timeout |
| **Decision** | Evaluates Jinja conditions and routes to matching branch |
| **ignore_errors** | Step fails but playbook continues |
| **Do Until** | Step retries until condition is true or max retries exhausted |
| **Timeout** | Approval auto-resumes after deadline on a configured path |
| **Run failed** | Step faulted without `ignore_errors`; retry the whole workflow |

### Key takeaways

- Manual Input is versatile: basic yes/no, approval gates, analyst prompts, input forms
- `is_approval: true` unlocks team routing, timeouts, and notifications
- Always distinguish between expected outcomes (use Decision) and unexpected errors (use ignore_errors/do_until)
- Build error handling into your playbook design from the start — don't bolt it on after deployment

### Next steps

| What to explore | Where |
|-----------------|-------|
| Looping over multiple items | [Jinja: for loops](/chapter-04-jinja/02-jinja-adv) |
| Calling a child playbook | [Reference a Playbook](/chapter-03-playbooks/03-actions) |
| FMG provisioning with error handling | [FMG Provisioning Ladder](/chapter-02-ftnt-apis/45-fmg-provisioning-ladder) |
