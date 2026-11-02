---
title: "Install"
linkTitle: "Install"
weight: 10
description: "Download fabric-studio, then install the fabric-studio-mcp command with uv"
---

The server ships as a Python package that installs one command,
`fabric-studio-mcp`. You install it once, and Claude starts it on demand.

## Before you start

- **[uv](https://docs.astral.sh/uv/)**, which installs the command in its own
  isolated environment and fetches Python 3.11 or later if you lack it.
- **Network reach to your pods** on HTTPS 443, from the machine that runs
  Claude.

Pick your system. The choice is remembered for the rest of the page.

{{< tabs groupid="os" >}}
{{% tab title="Linux" %}}
Open a terminal (macOS uses the same commands) and install uv:

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```
{{% /tab %}}
{{% tab title="Windows (WSL2)" %}}
The server runs on Linux, so on Windows you run it inside WSL2. In an administrator PowerShell:

```powershell
wsl --install
```

Restart when asked, then open **Ubuntu** from the Start menu. **Do everything from here on in that Ubuntu
terminal, including Claude Code**: install Claude Code inside WSL too, so it can start the server. Then install uv and unzip:

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
sudo apt update && sudo apt install -y unzip
```
{{% /tab %}}
{{< /tabs >}}

## Install

Download the repository as a zip:

{{% resources title="Download fabric-studio" style="info" pattern=".*\.zip" /%}}

Unzip it and install from the folder:

{{< tabs groupid="os" >}}
{{% tab title="Linux" %}}
From the folder the zip downloaded to:

```bash
unzip fabric-studio.zip
uv tool install "./fabric-studio[mcp]"
```
{{% /tab %}}
{{% tab title="Windows (WSL2)" %}}
The browser saves the zip on the Windows side. Copy it into your WSL home folder (replace `<you>` with your
Windows user name), then install from there:

```bash
cp /mnt/c/Users/<you>/Downloads/fabric-studio.zip ~/
cd ~
unzip fabric-studio.zip
uv tool install "./fabric-studio[mcp]"
```
{{% /tab %}}
{{< /tabs >}}

The server is part of **fabric-studio**, which is not on PyPI, so it installs from this download. The
`[mcp]` part adds the MCP SDK. Once it is installed you can delete the zip and the folder, but keep the folder
if you want the agent skill below. Check the command landed on your `PATH`:

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
MCP tool to use. The installed command does not include it, so for Claude Code copy the folder from the
unzipped download into your skills folder:

```bash
mkdir -p ~/.claude/skills
cp -r fabric-studio/skills/fabric-studio ~/.claude/skills/
```

## Update and remove

To update, download the new zip, unzip it over the old folder, and reinstall:

```bash
uv tool install --force "./fabric-studio[mcp]"
```

To remove it:

```bash
uv tool uninstall fabric-studio
```

Your pod registry in `~/.fsh/` is left alone by both.

The source is on the Fortinet Git server if you want to read it or contribute.

## Working from a checkout instead

If you work in the lab repository (`fabric_studio_terraform`) with its sibling projects, you don't
need the installed command. Its `.mcp.json` starts the server straight from the checkout with
`uv run python -m tools.fs_mcp.server`, so Claude Code picks it up when you open that directory. That
build also adds the device configuration phase of a build and the connector tools, which need that repository.
