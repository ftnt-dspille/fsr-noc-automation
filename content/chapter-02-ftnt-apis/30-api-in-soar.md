---
title: "API in FortiSOAR"
draft: false
weight: 30
description: "Using API knowledge in SOAR"
tags: [ "knowledge", "hands-on" ]
---

This guide demonstrates how to make generic API calls directly within SOAR playbooks when specific connectors aren't available. We'll use the Dad Joke API as a practical example.

## Dad Joke API Overview

**Base URL:** `https://icanhazdadjoke.com/`

**Key Features:**

- Multiple response formats supported
- Custom User-Agent header recommended

**API Response Formats:**

- `application/json` - JSON response

**Example JSON Response:**

```json
{
  "id": "R7UfaahVfFd",
  "joke": "My dog used to chase people on a bike a lot. It got so bad I had to take his bike away.",
  "status": 200
}
```

![img.png](images/dad_joke_api_curl_picture.png)

## Creating the SOAR Playbook

### Step 1: Set Up Collection and Playbook

1. Navigate to **Automation > Playbooks**
2. Click **New Collection**
    - **Name:** "Jokes"
3. Click **Create**
4. Click **Add Playbook**
    - **Name:** "Dad Joke Example"
5. Click **Create**

### Step 2: Configure Manual Trigger

You should now see this screen:
![img.png](images/choose_start_step_dad_joke.png?height=400px)

1. Select the **Manual** trigger start step
2. Configure the following settings:
    - **Trigger Button Label:** `Get Dad Joke`
    - **Does not require a record Input:** `Yes`
    - **Select Module:** `Alerts`
3. (Optional) Add a custom popup message

![img.png](images/filled_out_manual_input.png?height=400px)

### Step 3: Add API Call Step

1. Click and drag from the blue arrows to create a new action step
   ![Description](images/drag_playbook_step.gif?height=400px)
2. Select **Utilities Step**
   ![img.png](images/utiliites_step.png)
3. Configure the API call:
    - **Name:** `Make API Call`
    - **Action:** "Utils: Make Rest API Call"
    - **URL:** `https://icanhazdadjoke.com/`
    - **HTTP Method:** `GET`
    - **Headers:** `{"Accept": "application/json"}`
4. Click **Save**

Your step should look like this:
![img.png](images/dad_joke_query_api.png?height=500px)

## Testing the Playbook

### Run the Playbook

1. Click the **Play** button (top right)
   ![img.png](images/play_button.png)
2. Click **Save and Test**
   ![img.png](images/save_and_test.png)
3. Click **Trigger Playbook** (bottom left)
   ![img.png](images/trigger_playbook.png)

The execution history will display automatically, showing real-time playbook execution with input/output details for each step.
![img.png](images/executed_playbook_logs.png?height=200px)

### Review Results

1. **Double-click** the "Make API Call" step to view results
   ![img.png](images/make_api_call_results.png?height=300px)
2. Click **Expand** to view the complete JSON response
   ![img.png](images/expand_json.png)
   ![img.png](images/make_api_call_results_full.png?height=400px)
3. Verify the API call returned the expected joke data structure

### Trigger from Alerts Page

1. Navigate to **Incident Response > Alerts**
2. Select **Execute** and click the drop down item "Get Dad Joke"
   ![img.png](images/execute_dad_joke.png?height=400px)
3. Open the playbook execution history at the top right
   ![img.png](images/playbook_history_icon.png)
4. Open the step **Make API Call** results and see what joke you got this time.

Having SOAR make API calls internally is fun and all, but what if you wanted to display the joke with a pop-up, or add the joke to an Alert? Or what if we wanted to schedule this playbook to run twice a day? These concepts and more will be covered in the Playbooks section.

## Takeaways

- Any product with API capability can be integrated into SOAR. No coding experience required
- Playbooks can be turned buttons on any page in SOAR that users can run. End users don't need playbook knowledge to execute automations