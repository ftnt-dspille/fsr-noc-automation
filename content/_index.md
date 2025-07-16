---
title: NOC Automation with FortiSOAR
weight: 1
description: |
  This Document is a 101 for Network focused people to pick up automation and FortiSOAR
archetype: home
---

![waste_management plus fortinet](fortinet.svg?height=100px)

## **Automation with FortiSOAR – Workshop Agenda**

---

## **Day 1 – Foundations & Core Automation Concepts**

### 1. **SOAR Fundamentals Overview** (\~1.5 hours – Presentation)

Understand the platform’s foundational structure:

* System Architecture: **Modules, Fields, Records**
* Access Control: **Users, Roles, Teams**
* Navigation & Usability Tips
* Incident Response Lifecycle
* Exploring Content Hub & Solution Packs
* Data Transfer: **Import/Export Wizard**

> **Automation Design Pattern Introduced:**
> *System Object Awareness* – Understand the building blocks you'll manipulate in automation.

---

### 2. **SOAR GUI Workshop** (\~1.5 hours – Hands-on)

Hands-on introduction to working in FortiSOAR:

* Converting “How to Demo” into workshop-friendly workflows
* Navigating playbooks and records
* Small guided scenario using the GUI

> **Goal:** Build comfort with the interface before introducing logic-based design.

---
### **Lunch Break**
---

### 3. **Automation Basics** (\~1.5 hours – Mixed Presentation + Hands-on)

Introduces the building blocks of automation logic:

* **Scheduling & Triggers**:
    
    * Time-based
    * Record-based (On Create/Update)
    * External (via API)
* **Playbook Step Types**:
    
    * Decisions
    * Manual Input
    * Connectors/API
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

---

### 4. **Workshop: Build a Simple Automation Flow** (\~1.5 hours – Hands-on)

Put theory into practice:

* Create a basic triggered playbook (e.g., notify on record creation)
* Use connector + decision step
* Parse input using Jinja
* Implement basic remediation or tagging logic

> **Goal:** Apply generalized patterns in a structured task.

---

## **Day 2 – Real Use Cases & Scenario-Based Learning**

### 5. **Use Case Implementation Workshop** (\~4 hours – Hands-on Labs)

Work through real-world automation examples with extensible architecture in mind:

* **Automating FortiManager (FMG) Devices**
    
    * Trigger-based change deployment
    * FMG API vs Sys Proxy vs CLI Script logic
    * *Pattern: Action Enforcement Based on Input Source*

* **ZTP Provisioning**
    
    * From asset record to full config push
    * Matching profiles based on metadata
    * *Pattern: Conditional Provisioning Based on Attributes*

* **NetShot Integration**
    
    * Configuration drift detection
    * *Pattern: Drift Detection & Reporting*

> **Design Mindset Emphasis:** Reusability, abstraction, and validation checks.

---

### **Lunch Break**

---

### 6. **Ad Hoc Playbook Building Session** (\~3 hours – Live Co-Creation)

Build new playbooks live based on requested scenarios:

* Facilitate real-time problem solving
* Emphasize reusable step creation, naming conventions, error handling
* Encourage attendees to **abstract** use cases into reusable logic flows

> *Reinforce thinking: “How do I turn a manual task into an event-driven, validated, and auditable process?”*

---

### 7. **Optional Advanced Content** (As Time Allows)

* **Connector Building** (Advanced Integration Topics)
    
    * Python-based connectors
    * Input/output schemas
    * Auth handling and logging

---