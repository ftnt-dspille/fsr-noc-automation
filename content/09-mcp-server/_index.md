---
title: "Fabric Studio MCP Server"
linkTitle: "MCP Server"
weight: 70
description: "Install the Fabric Studio MCP server and ask Claude what is running on your pods, who has a license, and why a task failed"
---

The **Fabric Studio MCP server** lets Claude (Claude Code, Claude Desktop, or
any MCP client) work with your Fabric Studio pods in plain language. Instead of
clicking through each pod's UI or writing API calls, you ask:

- *"Which of my pods have a fabric running, and what is up in it?"*
- *"Where is the FortiGate called `edge-fgt`?"*
- *"Why did the last install on this pod fail?"*
- *"Is the license FortiSOAR is using the one Fabric Studio assigned?"*

It talks to the same REST API the UI uses, with your own pod login. It has
12 broad tools, and most only read. The few that change a pod say so, refuse to run without
`confirm`, and then ask you to approve the exact plan before they do anything. See the [tool reference]({{% relref "04-tool-reference" %}}).

## Set it up

| Step | What you do | Page |
|---|---|---|
| 1 | Install the `fabric-studio-mcp` command | [Install]({{% relref "01-install" %}}) |
| 2 | Register it with Claude | [Connect Claude]({{% relref "02-connect-claude" %}}) |
| 3 | Give it a pod and a login | [Connect a Pod]({{% relref "03-connect-a-pod" %}}) |
| 4 | Ask a question | [Try it](#try-it) |

The whole thing takes a few minutes, and nothing is installed on the pod.

## Try it

Once a pod is registered, start Claude and ask:

```text
What's up on my Fabric Studio pods?
```

Claude calls `pods` (view `online`) and answers with each pod, its running fabric, and the
devices that are online. If it says it has no tools, or lists no pods, go to
[Troubleshooting]({{% relref "05-troubleshooting" %}}).

{{% notice note %}}
Your pod password never goes through the chat. It stays in a file on your
machine (or the OS keychain) and is read by the server process only. No tool
accepts a password argument or returns one.
{{% /notice %}}

{{% children description=true %}}
