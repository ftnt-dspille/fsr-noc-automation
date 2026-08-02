---
title: "DevOps Automation"
linkTitle: "DevOps Automation"
weight: 80
description: "Drive a Linux host, a Git repository, and a content-promotion pipeline from FortiSOAR playbooks -- and fall back to raw HTTP plus Python when no connector exists."
tags: ["hands-on", "knowledge"]
---

Every other chapter drives a Fortinet appliance. This one uses FortiSOAR as a **general
orchestration layer**: a shell on a Linux host, a Git repository, a content-promotion pipeline,
and -- when nothing else fits -- an arbitrary REST call with Python in the middle.

Four jobs, four tools. Reach for them in this order:

| You need to... | Use | Connector |
|---|---|---|
| Run a shell command or script on a Linux host | **SSH** | `ssh` |
| Read, commit, branch, or open a PR/MR | **GitHub** / **GitLab** | `github`, `gitlab` |
| Promote FortiSOAR content from dev to prod | **CICD Utils** | `cicd-utils` |
| Call a REST API with no dedicated connector | **Generic HTTP** + **Code Runner** | `generic-http`, `code-runner` |

{{% notice tip %}}
The ordering is the lesson. A named connector gives you typed parameters, a health check, and
documented operations. Hand-rolling the same call through Generic HTTP gives you a URL string you
have to maintain. Only drop down a level when the level above genuinely has nothing for you.
{{% /notice %}}

---

## Part 1: Run commands on a Linux host

The SSH connector opens a session from the FortiSOAR appliance to a target host and runs a
command. Its two operations are the whole surface:

| Action | What it does | Parameters |
|---|---|---|
| **Execute remote command** | Runs a shell command, returns stdout/stderr and an exit code | `cmd` (required), `allowed_exit`, `is_super_user` |
| **Execute a python script** | Ships a Python script to the host and runs it there | `script` (required), `version` |

### The target host: your own appliance

You do not need a separate Linux VM for this chapter. **FortiSOAR is itself a Rocky Linux host**,
and the SSH connector runs *from* that appliance -- so pointing it at `127.0.0.1` gives you a real,
fully privileged shell target with nothing extra to provision.

{{% notice warning %}}
This is a **lab convenience**, not a production pattern. In production the SSH connector points at
the servers you actually want to automate, and it should authenticate with an **SSH key** and a
dedicated least-privilege service account -- not with a shell password stored in a connector
configuration. We use localhost and a password here purely so everyone has a working target.
{{% /notice %}}

### Configure the connector

1. Navigate to **Content Hub** and open the **Manage** tab
2. Find **SSH** and click **Configure**
3. Fill in the fields:

    | Field | Value |
    |---|---|
    | **Configuration Name** | `Local Appliance Shell` |
    | **Host** | `127.0.0.1` |
    | **Port** | `22` |
    | **Username** | your appliance shell account (`csadmin` on a standard appliance) |
    | **Password** | `<password from your instructor>` |
    | **Timeout** | `30` |

4. Click **Save**, then run the health check and confirm it passes

The configuration form also offers **Private Key** (upload a key file instead of a password) and
**Super User Password**, which is the password used when a step ticks **Is Super User**. Leave both
empty for now.

> **Verify:** the connector's health check reports **Available**.

{{% notice note %}}
If the health check fails, the usual cause is that the host's `sshd` has password authentication
disabled. Confirm with `sudo sshd -T | grep -i passwordauthentication` on the target -- it must
report `yes` for a password-based configuration to connect at all. If it reports `no`, use the
**Private Key** field instead.
{{% /notice %}}

### Run your first command

1. Navigate to **Automation > Playbooks**
2. Click **+ New Collection**, **Name**: `02 - DevOps`, and click **Create**
3. Click **+ Add Playbook**, **Name**: `Check Host Disk`, and click **Create**
4. Trigger: **Manual**, **Select Module** `Alerts`, **Does not require a record Input** `Yes`
5. Drag a **Connector** step from the Start step:

    | Field | Value |
    |---|---|
    | **Step Name** | `Check Disk` |
    | **Connector** | `SSH -- Local Appliance Shell` |
    | **Action** | `Execute remote command` |
    | **Command** | `df -Ph / \| tail -1` |

6. **Save**, **Save Playbook**, then run it

Expand the step output. You get the command's stdout, its stderr, and its **exit code** -- and the
exit code is the part that matters for the next step.

{{% notice note %}}
Step input and output are only recorded in **DEBUG** mode. Click **Running In INFO Mode** in the
designer's top bar, set **Select Execution Log Level** to `DEBUG`, and **Apply**. In INFO mode the
log keeps each step's status and duration but never the payloads.
{{% /notice %}}

### Exit codes: `allowed_exit`

By default a non-zero exit code fails the step. That is usually right, but plenty of perfectly
healthy commands return non-zero -- `grep` returns `1` when it simply finds no match, and `diff`
returns `1` when two files differ.

**Allowed Exit** takes the exit codes you want treated as success. Add a second step:

| Field | Value |
|---|---|
| **Step Name** | `Search Logs` |
| **Action** | `Execute remote command` |
| **Command** | `grep -c ERROR /var/log/messages` |
| **Allowed Exit** | `0,1` |

Without `0,1`, a clean log file fails your playbook. This is the single most common mistake when
wrapping shell commands in automation: treating "found nothing" as an error.

### Privilege: `is_super_user`

Tick **Is Super User** and the command runs with elevated privilege, using the **Super User
Password** from the connector configuration. Use it only for the steps that genuinely need root,
not as a blanket setting -- a playbook that runs everything as root is one bad Jinja substitution
away from a very bad day.

### Act on the result

The point of a shell command in a playbook is deciding something from its output.

7. Add a **Set Variable** step to pull the used-percentage out of the `df` output:

    ```jinja2
    Name: disk_pct
    Value: {{vars.steps.Check_Disk.data.output | regex_search('(\d+)%') | int}}
    ```

8. Add a **Decision** step:

    | Field | Value |
    |---|---|
    | **Step Name** | `Disk Over Threshold` |
    | **Condition 1** | `vars.disk_pct > 80` |
    | **Branch Tooltip** | `Disk critical` |

9. Wire **Condition 1** to a follow-up step -- a cleanup command, a ServiceNow ticket, or a Slack
   message -- and leave the default branch to end the playbook

{{% notice note %}}
Write the Decision condition **without** `{{ }}`. Decision, Condition, and Loop boxes take a bare
advanced expression and FortiSOAR wraps it on save; adding your own braces produces a
doubly-wrapped expression that never matches. Every other Jinja field on this page wants the braces.
{{% /notice %}}

> **Verify:** the playbook reads a real disk percentage off the host and takes the correct branch.
> Temporarily lower the threshold to `1` to prove the critical branch fires.

### Running Python on the host

**Execute a python script** ships a script to the target and runs it there, with an optional
`version` to pick the interpreter. Note the distinction that trips people up:

| | Runs where | Use it for |
|---|---|---|
| **SSH > Execute a python script** | on the **target host** | anything needing that host's filesystem, packages, or local services |
| **Code Runner / Code Snippet** | on the **FortiSOAR appliance** | transforming data already inside the playbook |

---

## Part 2: Git operations

FortiSOAR ships **GitHub** and **GitLab** connectors. Both are broad -- repositories, files,
branches, commits, pull/merge requests, issues, and releases are all first-class actions, so there
is no reason to hand-build these calls in Generic HTTP.

The operations you will actually use in automation:

| Job | GitHub action | GitLab action |
|---|---|---|
| Read a file from a repo | `Get File` | `Get File` |
| Commit a file | `Create or Update File Contents` | `Create File` / `Update File` |
| Branch | `Create Branch` | `Create Repository Branch` |
| Propose a change | `Create Pull Request` | `Create Merge Request` |
| Comment on a change | `Create Issue Comment` | `Create Merge Request Comment` |
| Merge it | `Merge Pull Request` | `Merge a Merge Request` |
| Tag a release | `Create Release` | `Create Release` |
| Clone / push a working tree | `Clone Repository` / `Push Changes` | `Clone Repository` / `Push Changes` |

### Configuration differences

| | GitHub | GitLab |
|---|---|---|
| Fields | **GitHub Account** (select), **Username**, **Password**, **Verify SSL** | **Server URL**, **Username**, **API Key**, **Verify SSL** |
| Secret | a personal access token goes in **Password** | a personal access token goes in **API Key** |
| Self-hosted | chosen via **GitHub Account** | set **Server URL** to your instance |

Nearly every action takes a **repo_type** parameter first -- it decides whether the repository is
addressed as a user's or an organisation's, and it changes which of the remaining fields apply.
Set it before filling anything else in.

### The pattern worth remembering

A network-config-as-code workflow reduces to four steps:

```
Get File (current config from repo)
  -> Code Runner / Jinja (apply the change)
  -> Create or Update File Contents (commit to a branch)
  -> Create Pull Request (a human approves the change)
```

That final step is the whole point. The playbook does the work; a person still approves the diff.
Pair it with the approval gate from
[Approvals and Error Handling](/chapter-03-playbooks/05-approvals-and-error-handling) when the
change should not even reach the repository without sign-off.

---

## Part 3: CI/CD for FortiSOAR content

The **CICD Utils** connector answers a question most teams hit in month two: *how do we promote
playbooks from a development FortiSOAR to production without clicking through the export wizard
every time?*

It needs **no configuration** -- there are zero configuration fields.

| Action | What it does |
|---|---|
| **Export FortiSOAR Template** | Exports a named export template to a file, with optional `ignore_keys` |
| **Unzip Export Template** | Unpacks the export archive so its contents can be inspected |
| **Split Export Template** | Separates portable **content** from environment-specific **settings**, writing dev and prod settings out separately |
| **Import FortiSOAR Template** | Imports a template file into this appliance |
| **Review & Import FortiSOAR Template** | Imports with a review pass first |

**Split Export Template** is the interesting one, and the reason this is genuinely CI/CD rather
than a glorified backup. An export bundle mixes two very different things: the playbooks and
modules you want to promote, and the connector configurations, IP addresses, and credentials that
must *not* leave the environment they belong to. Splitting them lets the content go into Git and
travel between appliances while each environment keeps its own settings file.

### The promotion pipeline

```
Dev FortiSOAR
  Export FortiSOAR Template   -> bundle
  Unzip Export Template       -> contents
  Split Export Template       -> content.json + dev-settings.json + prod-settings.json
  GitHub Create or Update File Contents + Create Pull Request
                              -> content reviewed and merged in Git
Prod FortiSOAR
  Review & Import FortiSOAR Template  -> content lands, prod settings stay prod
```

This is where Parts 2 and 3 join up: CICD Utils produces the artifact, the Git connector
version-controls and reviews it, and a playbook on the production appliance imports it. The
approval lives in the pull request, where change review already happens.

{{% notice tip %}}
Trigger the production-side import from a **Custom API Endpoint** trigger and your Git host's
merge webhook becomes the deploy button -- merge the PR, content deploys. See Part 5.
{{% /notice %}}

---

## Part 4: When no connector exists

Now the fallback. For a service with no dedicated connector -- an internal API, a niche SaaS, your
own tooling -- combine two connectors.

### Generic HTTP

The Swiss-army knife for REST. Operations are one per verb (`HTTP GET`, `HTTP POST`, `HTTP PUT`,
`HTTP PATCH`, `HTTP DELETE`, `HTTP HEAD`), plus `HTTP Request` where you pick the method per call,
`Paginate` for walking paged endpoints, `Upload File`, and `Fetch Records` for scheduled ingestion.

Beyond the verbs, four features do most of the work:

- **Authentication**: None, Basic, Bearer Token, API Key (header or query param), OAuth2 Client
  Credentials with token caching, and Token Login (POST credentials to a login endpoint and extract
  the token from the response)
- **Response Path**: pluck a value out of a nested body with dot notation. For a body of
  `{"data": {"items": [...]}}`, setting `response_path` to `data.items` makes `body` just the
  items array. `status_code` and `headers` still come back alongside it
- **Retry with backoff**: configurable status codes and backoff factor
- **Return On HTTP Error**: hands non-2xx responses back as data instead of raising

Every operation returns the same shape:

```json
{
  "status_code": 200,
  "headers": { "content-type": "application/json" },
  "body": { }
}
```

{{% notice warning %}}
**Return On HTTP Error is a false-all-clear trap.** With it enabled a `500` comes back as data and
the step goes **green**. If you turn it on, you must branch on `status_code` yourself -- otherwise
the playbook cheerfully continues past a failed call.
{{% /notice %}}

### Code Runner

`code-runner` executes unrestricted Python inside a playbook step. It does not ship with
FortiSOAR -- download the `.tgz` from
[its releases page](https://github.com/ftnt-dspille/connector-code-runner/releases/latest) and
import it from **Content Hub → Manage → Add Connector**. It is a community connector, so the
appliance needs the custom-connector gate on first.

It differs from the stock `code-snippet` connector in ways that matter:

| | Stock `code-snippet` | `code-runner` |
|---|---|---|
| `return` statement | SyntaxError (runs at module level) | **Valid** -- the snippet is wrapped in a function |
| Builtins | Restricted set | Full, unrestricted |
| Input | ad-hoc | normalised `params` dict |
| Output | varies | `{"code_output": <return value>}` |

| Field | Value |
|---|---|
| **Step Name** | `Transform Data` |
| **Connector** | `Code Runner (Unrestricted)` |
| **Action** | `Run Python (Unrestricted)` |
| **Input** | `{"items": [3, 1, 4, 1, 5, 9, 2, 6]}` |
| **Python Code** | see below |

```python
numbers = params['items']
ranked = sorted(numbers, reverse=True)
return {"sorted": ranked, "unique": list(dict.fromkeys(ranked)), "count": len(set(numbers))}
```

Reference the result at `vars.steps.Transform_Data.data.code_output`.

{{% notice warning %}}
Code Runner runs as the FortiSOAR integrations user with full filesystem access. It is for
**trusted, operator-authored playbooks only**. Never feed it a webhook payload or any other
externally controlled input -- that is remote code execution by design.
{{% /notice %}}

---

## Part 5: Event ingress

Everything above is FortiSOAR reaching out. The **Custom API Endpoint** trigger from the
[Triggers](/chapter-03-playbooks/02-triggers) chapter is how the outside world reaches in:

```
POST https://<FortiSOAR>/api/triggers/<id>/deferred/api_endpoint
```

CI pipelines, Git webhooks, and monitoring tools all push events through this endpoint. The
incoming JSON body lands in `vars.input`.

{{% notice info %}}
A webhook trigger has **no payload schema**. Whatever the sender posts is what you get, so parse
defensively and never pass the body to Code Runner or straight into a shell command.
{{% /notice %}}

---

## Summary

| Need | Tool |
|---|---|
| Shell command or script on a Linux host | SSH connector (`Execute remote command`) |
| Python on the target host | SSH connector (`Execute a python script`) |
| Python on the FortiSOAR appliance | Code Runner / Code Snippet |
| Read, commit, branch, review in Git | GitHub / GitLab connectors |
| Promote FortiSOAR content between environments | CICD Utils + Git connector |
| REST API with no connector | Generic HTTP |
| External systems triggering FortiSOAR | Custom API Endpoint trigger |

### Three things to carry away

1. **Non-zero is not always failure.** Set **Allowed Exit** deliberately on every SSH step.
2. **Use the named connector.** GitHub, GitLab, and CICD Utils exist; rebuilding them in Generic
   HTTP costs you the health check, the typed parameters, and every future upgrade.
3. **Keep a human in the loop where it is cheap.** A pull request is an approval gate you get for
   free, and it is the right place for a config change to be reviewed.

### Challenges

#### Challenge 1

Extend Part 1 so that when disk usage crosses the threshold, the playbook runs a second SSH command
to find the largest directories under `/var` and attaches the output to a ServiceNow ticket.

#### Challenge 2

Build the config-as-code loop from Part 2: read a file from a repository, modify it, commit it to a
new branch, and open a pull request -- with a Manual Input approval before the commit.

#### Challenge 3

Wire Part 3's promotion pipeline to a Custom API Endpoint trigger so that merging a pull request in
Git causes the production appliance to import the reviewed content.
