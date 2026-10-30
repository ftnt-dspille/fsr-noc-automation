---
title: "Connect a Pod"
linkTitle: "Connect a Pod"
weight: 30
description: "Register a Fabric Studio pod with its login so Claude can query it"
---

The server manages the pods in a small **registry** at `~/.fsh/instances.json`.
It holds hostnames and where each login lives, never a password. You create a
login file once, then let Claude register it.

## 1. Put the login in a file

Create `~/.fsh/.env.mypod` (any name after `.env.`) and lock it down:

```bash
mkdir -p ~/.fsh
cat > ~/.fsh/.env.mypod <<'EOF'
FS_POD_HOST=fabric-studio.example.com
FS_POD_USER=admin
FS_POD_PASS=<your-password>
EOF
chmod 600 ~/.fsh/.env.mypod
```

`FS_POD_HOST` is the pod's hostname or IP, the same one you open in the browser.
The server also looks in any folder listed in `FS_ENV_DIRS`.

## 2. Register it

In Claude, ask:

```text
Find my Fabric Studio env files and register the mypod one.
```

Claude calls `discover_instances` to list the logins it can see (without
showing passwords), then `add_instance`. By default it logs in first and
refuses a pod that rejects the login, so a wrong password fails here and not
later.

To keep the password in the OS keychain instead of the file, ask for
`store="keychain"`. The server copies it in and from then on the file is not
needed.

## 3. Check it

```text
List my managed Fabric Studio instances.
```

Each row shows the host, the name, and whether the pod is `online`. A pod that
is offline or rejects the login shows the error beside it instead of failing
the whole call.

To stop managing a pod, ask Claude to `remove_instance` it. That deletes the
registry entry only. The pod and your login file are untouched.

## Guest logins (FortiSOAR)

The `read_guest_license`, `guest_config_status` and `validate_license_match`
tools SSH into a FortiSOAR VM through the pod. They use the appliance's default
login. For a different one, set `VM_USER_SOAR01` and `VM_PASS_SOAR01` in the
server's environment, or have Claude pass `ssh_user` and `ssh_pass` for that
call.

{{% notice warning %}}
Fabric Studio pods rate-limit logins, and some ban a workstation that logs in
too often. The server reuses one session per pod and backs off after a failure.
If you see `LoginCooldown ... retry in Ns`, wait that long instead of retrying.
{{% /notice %}}
