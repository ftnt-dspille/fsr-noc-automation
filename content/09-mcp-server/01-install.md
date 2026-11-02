---
title: "Install"
linkTitle: "Install"
weight: 10
description: "Install the fabric-studio-mcp command with uv"
---

The server ships as a Python package that installs one command,
`fabric-studio-mcp`. You install it once, and Claude starts it on demand.

## Before you start

- **[uv](https://docs.astral.sh/uv/)**, which installs the command in its own
  isolated environment and fetches Python 3.13 or later if you lack it.
  `curl -LsSf https://astral.sh/uv/install.sh | sh`
- **SSH access to the Fortinet Git server (git.fndn.fortinet.net).** The server installs
  from there, so `git ls-remote
  ssh://git@git.fndn.fortinet.net:2222/dspille/fabric-studio.git`
  must work from your machine (VPN on, SSH key added to your profile on that server).
- **Network reach to your pods** on HTTPS 443, from the machine that runs
  Claude.

## Install

```bash
uv tool install "fabric-studio[mcp] @ git+ssh://git@git.fndn.fortinet.net:2222/dspille/fabric-studio.git"
```

The server is part of **fabric-studio**, which is not on PyPI, so it installs from git. The
`[mcp]` part adds the MCP SDK. Check it landed on your `PATH`:

```bash
which fabric-studio-mcp
```

If that prints nothing, run `uv tool update-shell` and open a new terminal. uv installs tools to
`~/.local/bin`.

{{% notice tip %}}
Running `fabric-studio-mcp` by hand prints nothing and waits. That is correct:
it speaks MCP over stdin and stdout and expects a client. Press Ctrl+C to leave.
{{% /notice %}}

## Give your agent the skill

The repository carries an agent skill, `skills/fabric-studio/`, that tells an agent how Fabric Studio
works (one fabric per pod, model versus runtime, what a bare `254` means) and which library function or
MCP tool to use. The installed command does not include it, so for Claude Code clone the repository once and
copy the folder into your skills folder:

```bash
git clone ssh://git@git.fndn.fortinet.net:2222/dspille/fabric-studio.git
cp -r fabric-studio/skills/fabric-studio ~/.claude/skills/
```

## Update and remove

```bash
uv tool upgrade fabric-studio     # newer version
uv tool uninstall fabric-studio   # remove it
```

Your pod registry in `~/.fsh/` is left alone by both.

## Working from a checkout instead

If you work in the lab repository (`fabric_studio_terraform`) with its sibling projects, you don't
need the installed command. Its `.mcp.json` starts the server straight from the checkout with
`uv run python -m tools.fs_mcp.server`, so Claude Code picks it up when you open that directory. That
build also has the tools that build a fabric from the repository's topologies, which need that repository.
