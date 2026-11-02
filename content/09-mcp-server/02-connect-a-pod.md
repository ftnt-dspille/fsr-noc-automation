---
title: "Connect a Pod"
linkTitle: "Connect a Pod"
weight: 20
description: "Register a Fabric Studio pod with its login so Claude can query it"
---

The server manages the pods in a small **registry** at `~/.fsh/instances.json`. It holds hostnames and who
you log in as, never a password. You add a pod once, from a terminal, before Claude is involved.

## 1. Add the pod

```bash
fabric-studio-mcp setup
```

It asks four things, checks the login against the pod, and remembers it:

```text
Pod hostname or IP (as in your browser): fabric-studio.example.com
Username [admin]:
Name for this pod [fabric-studio]: mypod
Password for admin@fabric-studio.example.com (not shown):
Registered 'mypod' (fabric-studio.example.com, hostname fabric-studio) as admin.
The password is kept in the system keychain; it is not in the registry.
Next: connect Claude (see the docs), then ask: List my managed Fabric Studio instances.
```

The hostname is the pod's address, the same one you open in the browser. The same command works on every
system. A wrong password fails here, with the pod's answer, and nothing is saved.

Where the password goes: the **system keychain** (macOS Keychain, Windows Credential Manager, or the Linux
Secret Service). Where there is no keychain, such as a headless Linux server, the login goes in a private
file, `~/.fsh/.env.<name>`, readable only by you. The password is never echoed, never in your shell history,
and never in the registry.

For scripts, give everything as options and pipe the password in:

```bash
printf '%s\n' "$POD_PASSWORD" | fabric-studio-mcp setup --host fabric-studio.example.com --name mypod --password-stdin
```

In PowerShell: `$env:POD_PASSWORD | fabric-studio-mcp setup --host fabric-studio.example.com --name mypod --password-stdin`.

`--user` and `--tag` are also available, and `--no-verify` skips the login check.

## 2. Check it

```bash
fabric-studio-mcp pods
```

```text
NAME             HOST                             USER         LOGIN
mypod            fabric-studio.example.com        admin        system keychain
```

To stop managing a pod, run `fabric-studio-mcp remove mypod`. That deletes the registry entry and the stored
password only. The pod itself is untouched.

## Other ways to add a pod

**From a login file.** For a team that already keeps logins in files, or for automation, create a file named
`.env.<name>` and let Claude register it once [Claude is connected]({{% relref "03-connect-claude" %}}):

Create `~/.fsh/.env.mypod` (any name after `.env.`) and lock it down:

{{< tabs groupid="os" >}}
{{% tab title="Linux" %}}
```bash
mkdir -p ~/.fsh
cat > ~/.fsh/.env.mypod <<'EOF'
FS_POD_HOST=fabric-studio.example.com
FS_POD_USER=admin
FS_POD_PASS=<your-password>
EOF
chmod 600 ~/.fsh/.env.mypod
```
{{% /tab %}}
{{% tab title="Windows" %}}
```powershell
New-Item -ItemType Directory -Force "$HOME\.fsh" | Out-Null
@"
FS_POD_HOST=fabric-studio.example.com
FS_POD_USER=admin
FS_POD_PASS=<your-password>
"@ | Set-Content -Encoding ascii "$HOME\.fsh\.env.mypod"
```

There is no `chmod` step: your user folder is already private to your account.
{{% /tab %}}
{{< /tabs >}}

`FS_POD_HOST` is the pod's hostname or IP, the same one you open in the browser.
The server also looks in any folder listed in `FS_ENV_DIRS`.

Then, in Claude, ask:

```text
Find my Fabric Studio env files and register the mypod one.
```

Claude calls `pods` (view `known`) to list the logins it can see, without showing passwords, then
`add_instance`. By default it logs in first and refuses a pod that rejects the login. To keep the password in
the OS keychain instead of the file, ask for `store="keychain"`: the server copies it in and the file is no
longer needed. The server also looks for login files in any folder listed in `FS_ENV_DIRS`.

**From Claude.** The `add_instance` tool never takes a password, so Claude can only register a pod whose login
is already in a login file or the keychain. Use `fabric-studio-mcp setup` to put it there.

## Guest logins (FortiSOAR)

The `vm` sections `guest_license`, `guest_config` and `license_match` SSH into a FortiSOAR VM through
the pod. They only work on FortiSOAR VMs and refuse any other device before connecting. The login comes
from the MCP server's environment and is never a tool argument: set `FS_SOAR_SSH_PASS` (and
`FS_SOAR_SSH_USER` if it is not `csadmin`). There is no built-in password; without one the section
says it is not configured.

{{% notice warning %}}
Fabric Studio pods rate-limit logins, and some ban a workstation that logs in
too often. The server reuses one session per pod and backs off after a failure.
If you see `LoginCooldown ... retry in Ns`, wait that long instead of retrying.
{{% /notice %}}
