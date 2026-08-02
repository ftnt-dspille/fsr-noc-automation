---
title: "FortiCloud Asset Management Connector"
menuTitle: "2 - FortiCloud"
weight: 20
tags: ["hands-on", "connector"]
---

Every NOC eventually asks the same two questions: *what do we own,* and *when does its support
run out?* The answers live in FortiCloud Asset Management -- the portal where every Fortinet serial
number, contract, and entitlement your organization owns is registered.

In this lab you install the FortiCloud Asset Management connector, configure it against a real
FortiCloud account, and pull your live asset inventory into FortiSOAR.

{{% notice info %}}
**Which FortiSOAR version are you on?** Look at the bottom of the left navigation pane. This
workshop is written for **7.6.5** and calls out **8.0** differences. For this lab the only
difference is where Content Hub lives:

| | 7.6.5 | 8.0 |
|---|---|---|
| Content Hub | `Automation > Content Hub` | top-level **Content Hub** |
| Connector list | `Automation > Connectors` | `Orchestration > Connectors` |
| Configuration Target options | Self / **Agent** | Self / **Access Node** |

Every configuration field, action name, and parameter is identical on both -- this lab was run on
both versions. The Content Hub screenshot in Step 1 is from a 7.6.5 appliance; the connector
screenshots after it are from 8.0.
{{% /notice %}}

## What you need

| Item | Where it comes from |
|---|---|
| A FortiCloud **IAM API user** (API ID + password) | Your instructor |
| FortiSOAR access | Chapter 1 |

{{% notice warning %}}
**The API user must have the Asset Management permission -- and you cannot tell by looking.**

FortiCloud permissions are granted per API user through an IAM *permission profile*. The credential
file FortiCloud gives you lists a set of `clientId` values, and **that list does not tell you which
permissions the user actually has.** While building this lab we tested four API users: two whose
credential files listed `assetmanagement` were refused, and the one that worked did not list it at
all. Authentication succeeds either way -- you get a token, it looks fine, and then every asset call
fails. The health check in Step 4 is the only reliable test.
{{% /notice %}}

## Step 1: Install the connector

Unlike ServiceNow, this connector is **not** pre-installed. You install it yourself from Content Hub.

1. Expand the left navigation pane, then:
   - **On 7.6.5:** go to **Automation > Content Hub**.
   - **On 8.0:** go to **Content Hub** (it sits at the top level; the automation menus were
     renamed to **Orchestration**).
2. Stay on the **Discover** tab and type `FortiCloud` in the search box, then press Enter.
3. You get exactly one result -- unlike ServiceNow, there is no wrong tile to pick:
   **FortiCloud Asset Management**, Version `1.0.0`, Published By **Fortinet CSE**,
   Certified **Yes**.

   ![Content Hub Discover tab on 7.6.5, searched for FortiCloud, returning one connector result](images/forticloud_content_hub_search_765.jpg?height=400px)

4. Click the tile, then click **Install**. Installation takes 30-60 seconds.

{{% notice warning %}}
**The install job can report `Error` even when the install succeeded.** We saw exactly this on a
live appliance -- the job banner said `Error`, the connector was installed and fully working, and
re-running the install returned "Solution Pack already installed."

Do not trust the banner. Judge success by the **connector tile itself**: reopen it and confirm it
shows the **ACTIVE** toggle and a **Configurations** tab. If it does, you are installed -- move on.
{{% /notice %}}

## Step 2: Add a configuration

1. On the connector, open the **Configurations** tab and click **+ Add New Configuration**.
2. Leave **Configuration Target** on **Self**.
3. Fill in the fields:

   | Field | Value |
   |---|---|
   | **Configuration Name** | `Workshop` |
   | **Server URL** | `https://support.fortinet.com` |
   | **API ID** | the API ID from your instructor (a UUID) |
   | **Password** | the password from your instructor |
   | **Client ID** | `assetmanagement` (pre-filled -- leave it) |
   | **Verify SSL** | checked |

4. Click **Save**.

{{% notice tip %}}
**Server URL is the bare host -- do not paste the API path.** The connector appends
`/ES/api/registration/v3` itself. If you enter the full path you get
`https://support.fortinet.com/ES/api/registration/v3/ES/api/registration/v3/...` and every call
fails with a confusing 404. This is a genuinely easy mistake, because the FortiCloud API
documentation shows the full path everywhere.
{{% /notice %}}

## Step 3: Verify the connection

After saving, the configuration row shows two badges. Both must be green:

- **CONFIGURATION: COMPLETED**
- **HEALTH CHECK: AVAILABLE**

![Connector configuration showing CONFIGURATION COMPLETED and HEALTH CHECK AVAILABLE](images/forticloud_config_health.png?height=450px)

{{% notice note %}}
**Verify:** you have `HEALTH CHECK: AVAILABLE` in green. If you do not, stop here -- nothing after
this point will work.
{{% /notice %}}

### If the health check fails

| What you see | What it means | Fix |
|---|---|---|
| Health check fails immediately after saving | Wrong API ID or password | Re-copy both from the credential file -- no leading/trailing spaces |
| Health check passes but actions return **"Access denied. No permission to access the requested action or resource."** (`errorCode 202`) | The API user authenticates but has no **Asset Management** permission | You need a different API user -- the profile has to be fixed in FortiCloud IAM. Tell your instructor |
| Actions return **"Request should include a positive number for accountId."** (`errorCode 301`) | Your API user is **Org-scope**, which requires an account ID the connector cannot send | Use a **Local-scope** API user for this lab (see the note below) |
| Actions return **"Both serialNumber and expireBefore cannot be empty at the same time."** (`errorCode 101`) | You left the action's input blank | See Step 4 -- this is the "Fetch Based On" trap |

{{% notice note %}}
**Org-scope vs Local-scope.** A FortiCloud API user scoped to an *organization* must send an
`accountId` on every call. Version 1.0.0 of this connector has no field for one, so Org-scope users
cannot use it -- they get `errorCode 301` on every asset call regardless of what you type. The lab
uses a Local-scope user, which never needs an account ID.
{{% /notice %}}

## Step 4: Pull your asset inventory

The connector ships with a sample playbook collection you can read to see each action wired up.
Open **Actions & Playbooks** on the connector to see them.

![Connector Actions and Playbooks tab listing the sample playbook collection and the List Assets action](images/forticloud_actions.png?height=400px)

{{% notice warning %}}
**Clone before you edit.** The sample playbook collection is deleted when the connector is upgraded
or removed. If you build on top of a sample playbook, copy it into your own collection first.
{{% /notice %}}

Now run the action. Add a **Connector** step to a playbook, choose **FortiCloud Asset Management**,
and select the **List Assets** action. You will see this:

![List Assets step showing only the Fetch Based On input with no value selected](images/forticloud_fetch_based_on_empty.png?height=340px)

That is the whole form. **There is no field to type a serial number or a date into** -- and this
trips up nearly everyone.

`Fetch Based On` is a selector that *reveals* the real input. Until you choose one, the input does
not exist on the form. Pick **Expire Before** and the date field appears:

![The same step after selecting Expire Before, now showing the Expire Before date field](images/forticloud_fetch_based_on_expire.png?height=240px)

If you run the action without choosing, it fails with:

```text
Invalid params provided :: Parameters Fetch Based On have either blank value or not provided
```

Fill in the revealed field:

- **Fetch Based On**: `Expire Before`
- **Expire Before**: `2030-01-01T00:00:00`

`Expire Before` means *support expiring before this date*, so a far-future date returns everything.

{{% notice note %}}
**Verify:** the step returns `"message": "Request processed successfully"` and an `assets` array.
On the workshop account this returns well over a hundred assets. Each entry carries
`serialNumber`, `productModel`, `registrationDate`, `status`, `folderPath`, `contracts`, and an
`entitlements` array.
{{% /notice %}}

### Choosing the other option

Selecting **Serial Number** instead reveals a serial-number field, and it matches on **prefix**,
not exact value -- searching `F` returns nearly every asset in the account. Useful for
"show me every FortiGate", surprising if you expected an exact-match lookup.

## What you built

You now have a health-checked connection to your organization's live Fortinet asset inventory.
Two actions are worth remembering for later chapters:

| Action | What it gives you |
|---|---|
| **List Assets** | Inventory sweep -- everything, or filtered by expiry date or serial prefix |
| **Get Product Details** | Deep detail on one serial: entitlements, license keys, warranty, location, partner |

The Day 3 FortiCloud sync use case builds directly on this configuration: it lists assets, compares
them against records in FortiSOAR, and opens a ticket for anything whose support is about to lapse.
