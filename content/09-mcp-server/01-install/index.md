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
{{% tab title="Windows" %}}
Open **PowerShell** and install uv:

```powershell
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
```

Close and reopen PowerShell so `uv` is on your `PATH`.
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
{{% tab title="Windows" %}}
In PowerShell, from the folder the zip downloaded to (usually Downloads):

```powershell
cd $HOME\Downloads
Expand-Archive fabric-studio.zip -DestinationPath .
uv tool install ".\fabric-studio[mcp]"
```
{{% /tab %}}
{{< /tabs >}}

The server is part of **fabric-studio**, which is not on PyPI, so it installs from this download. The
`[mcp]` part adds the MCP SDK. Once it is installed you can delete the zip and the folder, but keep the folder
if you want the agent skill below. Check the command landed on your `PATH`:

{{< tabs groupid="os" >}}
{{% tab title="Linux" %}}
```bash
which fabric-studio-mcp
```
{{% /tab %}}
{{% tab title="Windows" %}}
```powershell
where.exe fabric-studio-mcp
```
{{% /tab %}}
{{< /tabs >}}

If that prints nothing, run `uv tool update-shell` and open a new terminal. uv installs tools to
`~/.local/bin` (`%USERPROFILE%\.local\bin` on Windows).

{{% notice tip %}}
Running `fabric-studio-mcp` by hand prints nothing and waits. That is correct:
it speaks MCP over stdin and stdout and expects a client. Press Ctrl+C to leave.
{{% /notice %}}

## Give your agent the skill

The repository carries an agent skill, `skills/fabric-studio/`, that tells an agent how Fabric Studio
works (one fabric per pod, model versus runtime, what a bare `254` means) and which library function or
MCP tool to use. The installed command does not include it, so for Claude Code copy the folder from the
unzipped download into your skills folder:

{{< tabs groupid="os" >}}
{{% tab title="Linux" %}}
```bash
mkdir -p ~/.claude/skills
cp -r fabric-studio/skills/fabric-studio ~/.claude/skills/
```
{{% /tab %}}
{{% tab title="Windows" %}}
```powershell
New-Item -ItemType Directory -Force "$HOME\.claude\skills" | Out-Null
Copy-Item -Recurse .\fabric-studio\skills\fabric-studio "$HOME\.claude\skills\"
```
{{% /tab %}}
{{< /tabs >}}

## Update and remove

To update, download the new zip, unzip it over the old folder, and reinstall (on Windows,
`.\fabric-studio[mcp]`):

```bash
uv tool install --force "./fabric-studio[mcp]"
```

To remove it:

```bash
uv tool uninstall fabric-studio
```

Your pod registry in `~/.fsh/` is left alone by both.

Prefer a Linux shell on Windows? WSL2 works too: run the Linux commands inside it, and run Claude Code there.

The source is on the Fortinet Git server if you want to read it or contribute.

## Working from a checkout instead

If you work in the lab repository (`fabric_studio_terraform`) with its sibling projects, you don't
need the installed command. Its `.mcp.json` starts the server straight from the checkout with
`uv run python -m tools.fs_mcp.server`, so Claude Code picks it up when you open that directory. That
build also adds the device configuration phase of a build and the connector tools, which need that repository.
