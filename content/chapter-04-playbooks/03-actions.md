---
title: Actions
menuTitle: Actions
weight: 30
tags: [ "knowledge" ]
# Add the following for carousel effects with 4 images
carousel:
  - image: images/01-playbook-actions-core.png
    caption: Core Actions
  - image: images/02-playbook-actions-evaluate.png
    caption: Evaluate Actions
  - image: images/03-playbook-actions-execute.png
    caption: Execute Actions
  - image: images/04-playbook-actions-reference.png
    caption: Reference Actions
---

Actions are the building blocks of playbooks. They are the individual steps that connect together after the trigger to form a playbook. There are many different types of actions, and they can be used to perform a wide variety of tasks such as but not limited to, sending an email, creating a ticket in a ticketing system, creating and updating FortiSOAR records, or even running a script on a remote server.

{{< carousel >}}

## Core Actions

Core actions are used to do things like creating, updating, and searching for records in SOAR. You can also create variables and use them in other actions within the same playbook

## Evaluate Actions

Evaluate actions are used to make decisions, gather input from analysts, or halt a playbook. They can be used to check if a condition is true or false and then take different actions based on the result. 

## Execute Actions

Execute actions let you use any of the configured **Connectors** to perform actions on external systems. **Utilities** is a special connector that has common utility-like actions. The **Code Snippet** connector allows you to write and execute raw Python code.

## Reference Actions

Reference a Playbook lets you execute another playbook from within the current playbook. This is useful for reusing common tasks across multiple playbooks. In that context, the playbook being called is often referred to a child playbook, and the playbook calling it is referred to as the parent playbook.

{{% notice note %}}
There is a lot more that could be said about actions, but this is a high-level overview. Future workshops will go more in depth on this topic
{{% /notice %}} 
