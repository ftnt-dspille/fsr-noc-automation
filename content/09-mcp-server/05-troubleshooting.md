---
title: "Troubleshooting"
linkTitle: "Troubleshooting"
weight: 50
description: "Fixes for the install, Claude registration and pod login problems you are most likely to hit"
---

| Symptom | Go to |
|---|---|
| `uv tool install` fails | [Install fails](#install-fails) |
| `fabric-studio-mcp: command not found` | [Not on PATH](#command-not-found) |
| `claude mcp add` says `missing required argument` | [Wrong argument order](#missing-required-argument-commandorurl) |
| The server is listed but shows no tools, or fails | [Won't connect](#the-server-shows-failed-in-mcp) |
| Claude finds no pods | [No pods](#claude-says-it-has-no-pods) |
| A pod is `online: false` | [Pod offline](#a-pod-is-offline-or-rejects-the-login) |
| A change says the client cannot ask, or the pod is locked | [Changes refused](#a-change-is-refused) |
| `cannot reach <pod> over HTTPS`, or `retry in Ns` | [Pod offline](#a-pod-is-offline-or-rejects-the-login) |

## Install fails

Run the install from the folder you unzipped, the one that contains `pyproject.toml`:

```bash
ls fabric-studio/pyproject.toml
uv tool install "./fabric-studio[mcp]"
```

If `ls` finds nothing, the zip unpacked somewhere else: `cd` to where it landed. If uv says no Python
matches, run `uv python install 3.11` and try again. A message about a package that "requires a different
Python" means your uv is picking an older interpreter than 3.11: `uv tool install --python 3.12 "./fabric-studio[mcp]"`.

## Command not found

uv puts tools in `~/.local/bin` (`%USERPROFILE%\.local\bin` on Windows). Run `uv tool update-shell`, open a new
terminal, and check `which fabric-studio-mcp` (`where.exe fabric-studio-mcp` in PowerShell). For Claude Desktop, use the full
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

Nothing is registered yet. Follow [Connect a Pod]({{% relref "02-connect-a-pod" %}}).
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
- **`cannot reach <pod> over HTTPS: it timed out` (or `refused the connection`, `does not resolve`)**: the
  server could not open a connection. Check the pod is on and reachable from this machine (`pods` view
  `reach`); a VPN is often the cause.
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
  `FS_SOAR_SSH_PASS` in the server's environment. See [Connect a Pod]({{% relref "02-connect-a-pod" %}}).
- **`<tool>: invalid arguments. limit: Input should be a valid integer (you sent 'lots')`**: Claude sent
  an argument of the wrong type or left a required one out. It names the argument and what it sent, and Claude
  normally corrects it and tries again.
