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
- **SSH access to Fortinet's internal GitLab.** The package pulls
  `fabric-studio-core` from there, so `git ls-remote
  ssh://git@svl-devops-gitlab01.fortilab.fortinet.com/dspille/fabric-studio-core.git`
  must work from your machine (VPN on, SSH key added to your GitLab profile).
- **Network reach to your pods** on HTTPS 443, from the machine that runs
  Claude.

## Install

```bash
uv tool install "fabric-studio-mcp @ git+ssh://git@svl-devops-gitlab01.fortilab.fortinet.com/dspille/fabric-studio-terraform.git#subdirectory=packaging/fs-mcp"
```

Check it landed on your `PATH`:

```bash
which fabric-studio-mcp
```

If that prints nothing, run `uv tool update-shell` and open a new terminal. uv
installs tools to `~/.local/bin`.

{{% notice tip %}}
Running `fabric-studio-mcp` by hand prints nothing and waits. That is correct:
it speaks MCP over stdin and stdout and expects a client. Press Ctrl+C to leave.
{{% /notice %}}

## Update and remove

```bash
uv tool upgrade fabric-studio-mcp      # newer version
uv tool uninstall fabric-studio-mcp    # remove it
```

Your pod registry in `~/.fsh/` is left alone by both.

## Working from a checkout instead

If you already have the `fabric_studio_terraform` repository with its sibling
projects, you don't need the packaged command. Its `.mcp.json` starts the server
straight from the checkout with `uv run python -m tools.fs_mcp.server`, so
Claude Code picks it up automatically when you open that directory.
