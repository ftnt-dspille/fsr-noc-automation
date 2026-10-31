---
title: "Troubleshooting"
linkTitle: "Troubleshooting"
weight: 50
description: "Fixes for the install, Claude registration and pod login problems you are most likely to hit"
---

| Symptom | Go to |
|---|---|
| `uv tool install` fails fetching `fabric-studio` | [Install fails](#install-fails-on-git-or-ssh) |
| `fabric-studio-mcp: command not found` | [Not on PATH](#command-not-found) |
| `claude mcp add` says `missing required argument` | [Wrong argument order](#missing-required-argument-commandorurl) |
| The server is listed but shows no tools, or fails | [Won't connect](#the-server-shows-failed-in-mcp) |
| Claude finds no pods | [No pods](#claude-says-it-has-no-pods) |
| A pod is `online: false` | [Pod offline](#a-pod-is-offline-or-rejects-the-login) |
| A change says the client cannot ask, or the pod is locked | [Changes refused](#a-change-is-refused) |

## Install fails on git or SSH

The package pulls `fabric-studio` from internal GitLab over SSH. Run:

```bash
git ls-remote ssh://git@svl-devops-gitlab01.fortilab.fortinet.com/dspille/fabric-studio-core.git HEAD
```

If that fails, you are off the VPN or your SSH key is not on your GitLab
profile. Fix that first, then rerun the install.

## Command not found

uv puts tools in `~/.local/bin`. Run `uv tool update-shell`, open a new
terminal, and check `which fabric-studio-mcp`. For Claude Desktop, use the full
path in the config, since the app does not read your shell `PATH`.

## `missing required argument 'commandOrUrl'`

`--env` takes several values and swallowed the server name. Put the name first:
`claude mcp add fabric-studio --scope user --env KEY=value -- fabric-studio-mcp`.

## The server shows Failed in /mcp

Run the command yourself to see its error:

```bash
fabric-studio-mcp < /dev/null
```

A clean start prints nothing and exits. A Python traceback names what is
missing, usually a broken install. Reinstall with `uv tool install --reinstall`
and the same command as before. After a fix, restart Claude or run `/mcp` and
reconnect.

## Claude says it has no pods

Nothing is registered yet. Follow [Connect a Pod]({{% relref "03-connect-a-pod" %}}).
If you did, check the login file is in `~/.fsh/` (or a folder in
`FS_ENV_DIRS`) and its name starts with `.env`. The server ignores files
elsewhere on purpose.

## A pod is offline or rejects the login

`pods` (view `instances`) shows the error beside the pod. Common causes:

- **Unreachable**: the pod is off, or your network cannot reach HTTPS 443. Try
  the pod's URL in a browser from the same machine.
- **Login rejected**: the user or password in the env file is wrong, or the
  password changed since you registered. Edit the file; the server reads it on
  the next call.
- **`LoginCooldown ... retry in Ns`**: the pod rate-limits logins and the
  server is backing off after a failure. Wait that long. Retrying in a loop
  makes it worse.

## A change is refused

- **"this client cannot ask the person to approve"**: every tool that changes a pod asks you first
  (an MCP elicitation prompt), and your client cannot show one. Use Claude Code, or another client that
  supports elicitation. For an unattended run that you operate yourself, set `FS_MCP_ASSUME_CONFIRMED=1`
  in the server's environment (`claude mcp add ... --env FS_MCP_ASSUME_CONFIRMED=1`). An agent cannot set it.
- **"... is locked"**: the pod carries a lockout, a deliberate freeze by whoever set it. `pods` (view
  `lockouts`) shows who and why. The server cannot lift it; ask them.
- **"the person declined"**: you answered no to the approval prompt, so nothing changed.
- **A guest section says it is not configured**: `guest_license`, `guest_config` and `license_match` need
  `FS_SOAR_SSH_PASS` in the server's environment. See [Connect a Pod]({{% relref "03-connect-a-pod" %}}).
