---
title: "Run Anything on a Device"
linkTitle: "Run on a Device"
weight: 100
description: "Ask Claude to run a command over SSH or make an API call on any device of a fabric, with read-only requests running at once and everything else shown to you first"
---

Sometimes you want the device itself, not a tidy summary of it: the output of a command, a log, a disk figure, an
API answer. The **run** tool reaches any device of a fabric, by name, over its public SSH or HTTPS access. For
configuring a FortiGate prefer [the device tool]({{% relref "09-configure-a-fortigate" %}}), which shows a real
before and after; **run** is for everything else, and for the FortiGate in ways **device** does not cover.

You need a [pod registered]({{% relref "02-connect-a-pod" %}}) and a built fabric. The device must be **powered
on** and have its **SSH** access set to **public** (HTTPS too, for an API call).

## Ask in plain words

```text
What is the firmware version of fgt and faz on pod-a?
```

```text
How much disk is free on faz?
```

```text
Get the status of fgt from its API.
```

Claude picks the device and sends either a *command* or an *api* request. A FortiGate, FortiManager and
FortiAnalyzer get a FortiOS command line, with its pager handled for you. Any other device gets a shell.

| You give | It sends | Example |
|---|---|---|
| *command* | A command over SSH | `get system status`, `show system interface`, `df -h` |
| *api* | An HTTPS request. The method defaults to GET. POST, PUT and DELETE take a *body* | `GET /api/v2/monitor/system/status` |

## What runs without asking

A request that only **reads** runs at once. That means a known read-only command, optionally piped into a plain
filter, and any GET:

- On a FortiGate, FortiManager or FortiAnalyzer: *get*, *show*, and a few *execute* commands such as ping and
  traceroute, piped into grep.
- On other devices: commands such as *ls*, *cat*, *ps*, *df*, *uptime*, *ip addr show* and *systemctl status*,
  piped into grep, head, tail, wc, sort or uniq.

The rule is strict on purpose. A command is read-only only when its **arguments** are known to be read-only, not
just its name: *ifconfig* alone reads, *ifconfig eth0 down* does not; *date* reads, *date -s* does not.

## What is shown to you first

Everything else returns a **plan** and does nothing. The plan holds the exact command or request, as it will be
sent, and why it needs your approval. This includes any command with shell syntax (a semicolon, *&&*, a pipe into
anything but a plain filter, a redirect, a backtick), any command Claude cannot call read-only, and every POST,
PUT and DELETE. A script of several lines is a change too, and runs line by line, stopping at the first line the
device refuses.

When you say to go ahead, Claude calls it again with *confirm=true*. Claude asks your permission to run it:
choose **Yes** (Enter takes the default). **No** or Esc sends nothing.

## What it never does

- **Pass you a password.** The login is the one Fabric Studio holds for the device. It never appears in a prompt,
  a result or an error, and the tool tries it once: a refused login is not retried for two minutes.
- **Touch administrator accounts over a FortiGate's API.** Writing to the admin, API-user or access-profile
  sections is refused, because they are what the tool signs in with.
- **Change a locked pod.** A lockout is a deliberate freeze: anything that is not a read refuses, and the plan
  still shows.
- **Hide everything.** FortiOS secrets (*set password ENC ...*, pre-shared keys) are hidden in the output. Output
  from a shell is returned as the device prints it, so *cat* of a file that holds a secret shows the secret.

Long answers are cut at 20,000 characters and say so; ask for a narrower path, or filter the command with grep.

## If it does not work

| You see | What it means |
|---|---|
| "access is not PUBLIC" | Make the device's SSH or HTTPS access public on the pod (**set_vm_access_public**). |
| "is powered off" | A pod runs one fabric at a time, and the device's fabric is not the one running. |
| "is still booting" | Ask again in a minute. |
| "the API is not available" | An unlicensed FortiGate refuses API keys. Run a command over SSH instead. |
| "refused the login ... will not retry for 2 minutes" | The password Fabric Studio holds no longer matches the device (it was changed by hand). Fix it on the device, then ask again. |
| *hint* on an API answer from a non-FortiGate | The device did not accept its login over HTTP basic authentication; many appliances need their own API token. Use a command over SSH. |
