---
title: NOC Automation with FortiSOAR
weight: 1
description: |
  This Document is a 101 for Network and DevOps focused people to pick up automation and FortiSOAR
archetype: home
---

![waste_management plus fortinet](fortinet.svg?height=100px)

## **Automation with FortiSOAR - Workshop Agenda**

---

## **Day 1 - Foundations & Core Automation Concepts**

### 1. **SOAR Fundamentals Overview** (~1.5 hours - Presentation)

Understand the platform's foundational structure:

* System Architecture: **Modules, Fields, Records**
* Access Control: **Users, Roles, Teams**
* Navigation & Usability Tips
* Incident Response Lifecycle
* Exploring Content Hub & Solution Packs
* Data Transfer: **Import/Export Wizard**

> **Automation Design Pattern Introduced:**
> *System Object Awareness* - Understand the building blocks you'll manipulate in automation.

**Reference:** [Lab Access](/chapter-01-lab-access/) · [Record Management](/chapter-01b-record-management/)

---

### 2. **SOAR GUI Workshop** (~1.5 hours - Hands-on)

Hands-on introduction to working in FortiSOAR:

* Converting "How to Demo" into workshop-friendly workflows
* Navigating playbooks and records
* Small guided scenario using the GUI

> **Goal:** Build comfort with the interface before introducing logic-based design.

**Reference:** [Lab Access](/chapter-01-lab-access/) · [Record Management](/chapter-01b-record-management/)

---
### **Lunch Break**
---

### 3. **Automation Basics** (~1.5 hours - Mixed Presentation + Hands-on)

Introduces the building blocks of automation logic:

* **Scheduling & Triggers**:

    * Time-based
    * Record-based (On Create/Update)
    * External (via API)
* **Playbook Step Types**:

    * Decisions
    * Manual Input
    * Connectors/API (FortiNet APIs)
* **Jinja Templating**:

    * Syntax, Loops, Variables
    * Accessing and manipulating data
    * **ENV variables and SOAR-specific notation**
    * Jinja Playground usage

> **Automation Design Patterns Introduced:**
>
> * *Event-Driven Automation* (trigger-based)
> * *Declarative Logic with Conditions & Remediation*
> * *Data Parsing & Dynamic Input via Jinja Templates*

**Reference:** [FortiNet APIs](/chapter-02-ftnt-apis/) · [ServiceNow / ITSM Connectors](/chapter-02b-itsm-connectors/) · [Playbooks](/chapter-03-playbooks/) · [Jinja](/chapter-04-jinja/)

---

### 4. **Workshop: Build a Simple Automation Flow** (~1.5 hours - Hands-on)

Put theory into practice:

* Create a basic triggered playbook (e.g., notify on record creation)
* Use connector + decision step
* Parse input using Jinja
* Implement basic remediation or tagging logic

> **Goal:** Apply generalized patterns in a structured task.

**Reference:** [Playbooks](/chapter-03-playbooks/) · [Jinja](/chapter-04-jinja/)

---

## **Day 2 - Real Use Cases & Scenario-Based Learning**

### 5. **Lab 1: Policy Automation -- Safe Delete with ServiceNow** (~2 hours - Hands-on)

Build a **Policy Lifecycle - Safe Delete** playbook that drives a complete FortiManager policy deletion workflow from ServiceNow. The playbook validates safety before touching anything, uses a two-step disable-then-delete process with a cool-off wait, and writes up every outcome back to ServiceNow.

**What you'll build:**

* A ServiceNow-triggered playbook that runs when a policy request is approved for deletion
* Python (Code Runner) enrichment that extracts the policy comment for ServiceNow ticket references
* Safety gate: check FortiManager policy hit count, query FortiAnalyzer for historical traffic logs over the last 7 days
* Route based on verdict: safe path, caution (human approval), hard stop
* Two-phase deletion: disable first, wait a configurable cool-off period, check for breakage, then permanently delete
* Push the FortiManager package to the device and verify install status
* Update the ServiceNow ticket and write a complete audit trail in FortiSOAR comments

**Design patterns demonstrated:**

* *Action-As-A-Service* -- ServiceNow as the source of truth, FortiSOAR as the orchestrator, FortiManager/FortiAnalyzer as the action targets
* *Safety Gates Before Actions* -- the playbook refuses to proceed when traffic data shows the policy is actively in use
* *Idempotent Operations* -- the playbook can safely re-run if the policy wasn't cleanly deleted
* *Audit-First* -- every branch writes a comment and updates ServiceNow, so at 2am the oncall knows exactly what happened

**Connectors used:** ServiceNow, FortiManager (`get_package_policies` / `json_rpc_get` / `json_rpc_set` / `json_rpc_delete` / `install_policy`), FortiAnalyzer (`start_log_search_request` / `fetch_log_search_result_by_task_id`), Code Runner

**Reference:** [Policy Request Automation (chapter-08-policy-automation)](/chapter-08-policy-automation/) · [ServiceNow / ITSM Connectors](/chapter-02b-itsm-connectors/) · [DevOps Automation](/chapter-08-gitops-devops/) (Generic HTTP, Code Runner)

---

### 6. **Lab 2: ServiceNow-Driven ITSM Automation** (~1.5 hours - Hands-on)

Build a playbook that watches ServiceNow for change requests. When a CR of a certain type is approved, the playbook enriches the record, routes by resource type, and invokes the right action -- a Lambda, an Azure Function, a FortiGate API call -- without any glue code.

**What you'll build:**

* A ServiceNow record-update trigger (filter on approved change requests)
* Python enrichment that parses the CR body and determines what cloud resource is being changed
* Decision gate that routes by resource type: security group, FortiGate, Lambda invocation, FortiGate policy
* Lambda / Azure Function invocation via Generic HTTP (no custom connector needed)
* Production approval gate -- one Manual Input step before any action touches production resources
* Write-up: update ServiceNow with outcome, post to Slack

**Design patterns demonstrated:**

* *Watch-and-Act* -- ServiceNow drives the process, the playbook doesn't poll
* *Approval Gating* -- the right place for one Manual Input step: between "we detected" and "we changed production"
* *Cloud-Adjacent Automation* -- invoke Lambda or Azure Function from a FortiSOAR playbook without replacing your existing code

**Connectors used:** ServiceNow, Generic HTTP, Code Runner, Slack/Teams

{{% notice tip %}}
This pattern works identically with Azure. Replace the Lambda invocation with an Azure Function HTTP trigger URL or an Azure Resource Manager API call. The playbook does not care -- it is an HTTP POST to a URL with a JSON payload.
{{% /notice %}}

**Reference:** [Cloud Ops & DevOps Automation](/chapter-09-cloudops-aws/) (Patterns 1 & 2) · [DevOps Automation](/chapter-08-gitops-devops/) (Generic HTTP, Code Runner, Custom API Endpoint)

---

### **Lunch Break**

---

### 7. **Lab 3: Cloud Ops -- What an Orchestrator Brings to Your Stack** (~1 hour - Demo + Discussion)

For teams that already use Terraform, Lambda, and cloud-native tooling: what does FortiSOAR add that you don't already build in glue code?

**Topics covered (demo-based, not hands-on):**

* ServiceNow webhook → FortiSOAR → Lambda invocation → verification → write-up (the "watch and act" pattern from Lab 2, end-to-end)
* Scheduled drift detection: a playbook that runs on a schedule, calls an AWS/Azure API to read current state, compares against desired state, and opens incidents when they don't match
* FortiGate automation from ITSM: "Vendor needs access to subnet Z" → playbook validates → pushes FortiGate rule → verifies → notifies ServiceNow
* When to use named connectors vs. Generic HTTP (and why `code-runner` is your escape hatch for data transforms)

**Key takeaways:**

* SOAR is the **glue between systems**, not the engine -- your Lambda still does the work, your Terraform still manages state
* The value is standardized triggers, enrichment, approval gates, audit trails, and multi-source orchestration without wiring three separate Python scripts
* A human gate is cheap and valuable -- one Manual Input step between detection and action separates you from a team that accidentally locked themselves out

**Reference:** [Cloud Ops & DevOps Automation](/chapter-09-cloudops-aws/) (Patterns 3 & 4) · [DevOps Automation](/chapter-08-gitops-devops/) (Generic HTTP, Code Runner, SSH, CICD Utils)

---

### 8. **Ad Hoc Playbook Building Session** (~3.5 hours - Live Co-Creation)

Build new playbooks live based on requested scenarios from the audience:

* Facilitate real-time problem solving
* Emphasize reusable step creation, naming conventions, error handling
* Encourage attendees to **abstract** use cases into reusable logic flows

> *Reinforce thinking: "How do I turn a manual task into an event-driven, validated, and auditable process?"*

**Reference:** All chapters · [Playbooks](/chapter-03-playbooks/) · [Jinja](/chapter-04-jinja/) · [DevOps Automation](/chapter-08-gitops-devops/) · [Cloud Ops & DevOps Automation](/chapter-09-cloudops-aws/)

---
