---
title: "GitOps"
linkTitle: "GitOps"
weight: 80
---

This chapter covers **DevOps patterns** in FortiSOAR: using FortiSOAR as an orchestration layer to automate workflows across REST APIs, code execution, webhook event triggers, and version-controlled configuration management.

You already know how to use named connectors like FortiGate and FortiManager. This chapter teaches how to handle **any** external service you don't have a dedicated connector for.

## The two tools for arbitrary automation

When a named connector doesn't exist for the service you need -- GitHub, GitLab, Jenkins, Slack, a custom internal API -- you combine these two connectors:

| Connector | Name | What it does |
|-----------|------|-------------|
| **Generic HTTP** | `generic-http` | Make HTTP requests to any REST API. Supports GET/POST/PUT/PATCH/DELETE, multiple auth methods (None, Basic, Bearer, API Key, OAuth2, Token Login), pagination, file upload, and scheduled ingestion. |
| **Code Runner** | `code-runner` | Execute unrestricted Python code within a playbook step. Full builtins, top-level `return` works, `open()`/`import` allowed. For trusted operator-authored playbooks only. |

### Code Runner vs Code Snippet

FortiSOAR ships with a `code-snippet` connector. The `code-runner` connector is a custom alternative with two key differences:

| Feature | Stock `code-snippet` | `code-runner` |
|---------|---------------------|---------------|
| `return` statement | SyntaxError (executed at module level) | **Valid** -- snippet wrapped in a function body |
| Builtins | Restricted set | **Full, unrestricted** `__builtins__` |
| Snippet input | Ad-hoc | Normalized `params` dict from `input` argument |
| Output | Varies | Consistent `{"code_output": <return value>}` |

### The Generic HTTP connector

The Generic HTTP connector is the Swiss-army knife for REST API integration. Key features:

- **Auth methods**: None, Basic, Bearer Token, API Key Header, API Key Query Param, OAuth2 Client Credentials (with token caching), and Token Login (POST credentials to login endpoint, extract token from response)
- **Body types**: json, form, raw, multipart (file upload)
- **Response path**: Pluck a value from deeply nested JSON responses using dot notation (e.g. `data.results`)
- **Retry with backoff**: Automatic retry on transient failures (configurable status codes, backoff factor)
- **Pagination**: Walk paginated endpoints automatically (RFC 5988 Link header, next-URL-in-body, or page-param bumping)
- **Return on error**: Non-2xx responses returned to the playbook as data instead of raising exceptions

### Operations

The Generic HTTP connector exposes several operations:

| Operation | HTTP Method | When to use |
|-----------|------------|-------------|
| `http_request` | Any (selectable) | Most flexible -- pick method per call |
| `http_get` | GET | Read-only queries |
| `http_post` | POST | Create resources, send webhooks, trigger pipelines |
| `http_put` | PUT | Full resource replacement |
| `http_patch` | PATCH | Partial updates |
| `http_delete` | DELETE | Remove resources |
| `http_head` | HEAD | Health checks, existence checks |
| `http_paginate` | GET/POST | Walk paginated endpoints |
| `fetch_records` | GET/POST | Scheduled ingestion endpoint |
| `upload_file` | POST/PUT | Upload files via multipart or raw body |

---

## Webhooks and external triggers

You already learned about webhook-style triggers in the [Triggers](/chapter-03-playbooks/02-triggers) chapter (Custom API Endpoint Trigger). That trigger lets any external system fire a playbook by calling:

```
POST https://<FortiSOAR>/api/triggers/<id>/deferred/api_endpoint
```

In a DevOps workflow, this is your **event ingestion point**. CI/CD pipelines, Git webhooks, and monitoring tools can all push events into FortiSOAR through this endpoint.

{{% notice info %}}
A webhook trigger has no inherent payload schema. The incoming JSON body lands in `vars.input` and you use downstream steps to parse and act on it. Designing around webhook events means building your playbook to expect arbitrary payloads.
{{% /notice %}}

---

## Lab prerequisites

For the exercises below, you need two connectors configured:

1. **Generic HTTP** -- configured with Basic auth against any test HTTP service
2. **Code Runner** -- no configuration required (zero config fields)

To install the Code Runner connector:

1. Build the tarball from source or find `code-runner-1.0.0.tgz`
2. Navigate to **Content Hub > Connectors > Import**
3. Select the tarball and install

---

## Hands-on: Generic HTTP connector

You'll configure the Generic HTTP connector and use it to make API calls to an external service.

### Configure the connector

1. Navigate to **Content Hub > Connectors**.
2. Search for `Generic HTTP` and open the connector.
3. Click **Configure**.
4. Fill in the fields:

| Field | Value |
|-------|-------|
| **Name** | `Generic HTTP Lab` |
| **Server URL** | *(depends on your target API -- a test HTTP echo service, or the GitHub API base `https://api.github.com`)* |
| **Authentication Type** | *(depends on target)* |
| **Verify SSL** | `True` |
| **Return On HTTP Error** | `True` |
| **Max Retries** | `0` |

5. Click **Save**.
6. Run the health check to verify connectivity.

### Make your first request

1. Navigate to **Automation > Playbooks**.
2. Create a new collection called `02 - DevOps`.
3. Create a new playbook called `HTTP GET Request`.
4. Add a **Manual** trigger step (**Select Module**: `Alerts`, **Does not require a record Input**: `Yes`).
5. Drag a **Connector** step:

| Field | Value |
|-------|-------|
| **Step Name** | `Fetch Data` |
| **Connector** | `Generic HTTP -- (your connection)` |
| **Operation** | `HTTP GET` |
| **URL or Path** | *(endpoint path, e.g. `/repos/<owner>/<repo>/branches` for GitHub)* |

6. Click **Save**, then **Save Playbook**.
7. Trigger the playbook and examine the step output:

```json
{
  "status_code": 200,
  "headers": {
    "content-type": "application/json; charset=utf-8"
  },
  "body": [
    { "name": "main", "protected": true },
    { "name": "develop", "protected": false }
  ]
}
```

The response structure is consistent across all Generic HTTP operations: `status_code`, `headers`, and `body`.

{{% notice tip %}}
Use the **Response Path** parameter to skip manual parsing. The path is resolved **inside the response body**, so for a body of `{"data": {"items": [...]}}` you set `response_path: data.items` and `body` becomes just the items array. `status_code` and `headers` are still returned alongside it.
{{% /notice %}}

### Make a POST request with a JSON body

Add a **Connector** step:

| Field | Value |
|-------|-------|
| **Step Name** | `Send Webhook` |
| **Connector** | `Generic HTTP -- (your connection)` |
| **Operation** | `HTTP POST` |
| **URL or Path** | *(webhook endpoint URL)* |
| **Body Type** | `json` |
| **Body** | `{"event": "test", "source": "fortisoar"}` |

8. Click **Save**, then **Save Playbook** and trigger it.

### Verify

> **Verify:** The GET step output shows `status_code: 200` and returns the expected data in `body`. The POST step returns a successful HTTP status code from the target service.

---

## Hands-on: Code Runner connector

The Code Runner connector lets you execute unrestricted Python in a playbook step.

### Execute Python

1. Navigate to **Automation > Playbooks**.
2. Create a new playbook called `Code Runner Transform`.
3. Add a **Manual** trigger step.
4. Drag a **Connector** step:

| Field | Value |
|-------|-------|
| **Step Name** | `Transform Data` |
| **Connector** | `Code Runner (Unrestricted)` |
| **Operation** | `Run Python (Unrestricted)` |
| **Input** | `{"items": [3, 1, 4, 1, 5, 9, 2, 6]}` |
| **Python Code** | *(see below)* |

```python
numbers = params['items']
sorted_numbers = sorted(numbers, reverse=True)
unique_numbers = list(dict.fromkeys(sorted_numbers))
return {"sorted": sorted_numbers, "unique": unique_numbers, "count": len(unique_numbers)}
```

5. Click **Save**, then **Save Playbook** and trigger.

The step output will be:

```json
{
  "code_output": {
    "sorted": [9, 6, 5, 4, 3, 2, 1],
    "unique": [9, 6, 5, 4, 3, 2, 1],
    "count": 7
  }
}
```

In Jinja/variable references, the return value is at `vars.steps.Transform_Data.data.code_output`.

### Verify

> **Verify:** The `code_output` contains your returned dict with `sorted`, `unique`, and `count` keys.

{{% notice warning %}}
Code Runner executes as the FortiSOAR integrations user with full filesystem access. It is meant for **trusted, operator-authored playbooks**. Never expose Code Runner input to external users or unreviewed webhook payloads.
{{% /notice %}}

---

## Putting it together: GitOps workflow pattern

Now combine both connectors into a real DevOps workflow. The pattern:

1. **Webhook trigger** -- external CI/CD pipeline or Git push fires the playbook
2. **HTTP GET** -- fetch configuration or data from a remote API
3. **Code Runner** -- transform, validate, or enrich the data
4. **HTTP POST** -- push the processed result back

### Build the playbook

1. Create a new playbook called `GitOps: Fetch Transform Push`.
2. Add a **Referenced** trigger step.
3. **Set Variables** step:

```
remote_url: <URL to fetch from>
push_url: <URL to post to>
```

4. **Connector** -- Generic HTTP, `HTTP GET`:

| Field | Value |
|-------|-------|
| **Step Name** | `Fetch Config` |
| **URL or Path** | `{{ vars.remote_url }}` |

5. **Connector** -- Code Runner (Unrestricted), `Run Python (Unrestricted)`:

| Field | Value |
|-------|-------|
| **Step Name** | `Transform Config` |
| **Input** | `{"raw": {{ vars.steps.Fetch_Config.data.body | tojson }}}` |
| **Python Code** | *(example: filter, normalize, add timestamp)* |

```python
import json
from datetime import datetime

raw = params.get('raw', {})
if isinstance(raw, str):
    raw = json.loads(raw)

enriched = {
    "source": raw,
    "processed_at": datetime.utcnow().isoformat() + "Z",
    "version": "1.0"
}

return enriched
```

6. **Connector** -- Generic HTTP, `HTTP POST`:

| Field | Value |
|-------|-------|
| **Step Name** | `Push Config` |
| **URL or Path** | `{{ vars.push_url }}` |
| **Body Type** | `json` |
| **Body** | `{{ vars.steps.Transform_Config.data.code_output | tojson }}` |

7. Click **Save Playbook** and trigger.

### The complete flow

```
External event → Webhook trigger → Fetch Config (HTTP GET) → Transform Config (Python) → Push Config (HTTP POST) → done
```

This pattern is the backbone of most GitOps workflows:

| Step | Analogy in CI/CD | FortiSOAR equivalent |
|------|-----------------|---------------------|
| Event source | `git push`, CI trigger | Webhook / API endpoint trigger |
| Fetch latest | `git pull`, artifact download | Generic HTTP GET |
| Build / Transform | `Makefile`, `pip build` | Code Runner Python |
| Deploy | `kubectl apply`, `helm upgrade` | Generic HTTP POST/PUT/PATCH |
| Notify | Slack/pager notification | Another HTTP POST to chat webhook |

---

## Scheduled data ingestion

The Generic HTTP connector supports **scheduled data ingestion** -- periodically pulling data from an external API and creating FortiSOAR records. This is useful for continuous enrichment: pulling asset inventories, vulnerability lists, or threat intelligence feeds.

### Configure scheduled ingestion

1. Open your Generic HTTP connector configuration.
2. Find **Data Input** (scheduled ingestion).
3. Configure:

| Field | Value |
|-------|-------|
| **Enabled** | True |
| **Fetch URL** | *(the API endpoint)* |
| **Response Path** | *(dot-path to the records array, e.g. `data.items`)* |
| **Pagination Mode** | *(if the endpoint supports it)* |
| **Schedule** | *(cron expression or interval)* |

4. Configure the record mapping:

| Field | Value |
|-------|-------|
| **Target Module** | *(where records land, e.g. Assets)* |
| **Mapping** | *(map API response fields to module fields)* |

---

## Git integration examples

Here are practical Git integration patterns using the Generic HTTP connector:

### Create a pull request comment

| Field | Value |
|-------|-------|
| **Operation** | `HTTP POST` |
| **URL or Path** | `/repos/{owner}/{repo}/issues/{issue_number}/comments` |
| **Body Type** | `json` |
| **Body** | `{"body": "Security review: alert created in FortiSOAR."}` |

### Check branch protection

| Field | Value |
|-------|-------|
| **Operation** | `HTTP GET` |
| **URL or Path** | `/repos/{owner}/{repo}/branches/{branch}/protection` |

### List repository deployments

| Field | Value |
|-------|-------|
| **Operation** | `HTTP GET` |
| **URL or Path** | `/repos/{owner}/{repo}/deployments` |

### Delete a deployment status

| Field | Value |
|-------|-------|
| **Operation** | `HTTP DELETE` |
| **URL or Path** | `/repos/{owner}/{repo}/deployments/{deployment_id}/statuses/{status_id}` |

All use the configured auth method (Bearer Token or API Key works for GitHub).

---

## Summary

| Concept | FortiSOAR equivalent |
|---------|---------------------|
| Arbitrary REST API calls | Generic HTTP connector |
| Unrestricted Python in playbooks | Code Runner connector |
| External event ingestion | Custom API Endpoint trigger |
| Scheduled data enrichment | Generic HTTP scheduled ingestion |
| Config transformation | Code Runner + Jinja |
| Deploy push | Generic HTTP POST/PUT/PATCH |

### When to use what

- **Use a named connector** when one exists (FortiGate, FortiManager, ServiceNow, etc) -- it has better type safety and documented operations.
- **Use Generic HTTP** for any REST API without a dedicated connector. It covers 90% of integration needs.
- **Use Code Runner** for Python logic that doesn't fit Jinja (complex data structures, date math, external libraries).
- **Combine them** for full DevOps workflows: webhook trigger → HTTP fetch → Python transform → HTTP push.
