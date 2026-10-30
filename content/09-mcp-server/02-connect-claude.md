---
title: "Connect Claude"
linkTitle: "Connect Claude"
weight: 20
description: "Register fabric-studio-mcp with Claude Code or Claude Desktop"
---

## Claude Code

```bash
claude mcp add fabric-studio --scope user -- fabric-studio-mcp
```

Everything after `--` is the command Claude Code runs. `--scope user` makes the
server available in every project. Without it the server is registered for you
in the current project only; `--scope project` writes a `.mcp.json` you can
commit for your team.

{{% notice warning %}}
Put the server name **before** any `--env` option. `--env` accepts several
values, so `claude mcp add --env KEY=value fabric-studio ...` swallows the name
and fails with `missing required argument 'commandOrUrl'`.
{{% /notice %}}

To point the server at a different registry file or extra env-file folders, add
them when you register:

```bash
claude mcp add fabric-studio --scope user \
  --env FS_ENV_DIRS=$HOME/pods -- fabric-studio-mcp
```

### Check that it connected

```bash
claude mcp list
```

You should see `fabric-studio: fabric-studio-mcp - ✔ Connected`. Inside a
session, `/mcp` shows the same and lists the 39 tools.

The first time Claude uses a tool it asks permission. To pre-approve the
read-only ones, add `mcp__fabric-studio__list_instances` and its siblings to
`permissions.allow` in your Claude Code settings. Leave the mutating tools out
so Claude keeps asking.

## Claude Desktop

Claude Desktop starts with a minimal `PATH`, so give it the full path from
`which fabric-studio-mcp`. Edit `claude_desktop_config.json` (on macOS,
`~/Library/Application Support/Claude/`):

```json
{
  "mcpServers": {
    "fabric-studio": {
      "command": "/Users/you/.local/bin/fabric-studio-mcp"
    }
  }
}
```

Restart Claude Desktop afterwards.

## Other MCP clients

Any client that can launch a stdio MCP server works. Give it the command
`fabric-studio-mcp` and no arguments.
