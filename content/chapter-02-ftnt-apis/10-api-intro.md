---
title: "REST API Introduction"
date: 2025-06-09
draft: false
weight: 10
description: "Learn REST APIs through langos ordering - then apply to network automation."
tags: [ "knowledge" ]
---

## What is a REST API?

Think of a REST API like ordering langos over the phone. You call the langos place (API endpoint), tell them what you want (HTTP request), and they respond with your order status or the langos itself (HTTP response).

**Key Concept:** REST APIs use standard HTTP methods to perform operations

![img_2.png](langos.png)

## The Four Essential HTTP Methods (langos Edition)

| Method     | langos Action                          | What It Does          | Network Equivalent               |
|------------|---------------------------------------|-----------------------|----------------------------------|
| **GET**    | "What langoss do you have?"            | View the menu         | Get device status, view policies |
| **POST**   | "I'd like to order a large pepperoni" | Create new order      | Add firewall rule, create VLAN   |
| **PUT**    | "Change my order to extra cheese"     | Update existing order | Modify interface config          |
| **DELETE** | "Cancel my order"                     | Remove the order      | Delete policies, remove devices  |

## REST API Structure (langos Restaurant)

**Base URL:** `https://tonys-langos.com/api/v1/`

**Example langos Endpoints:**

```
GET    /menu                       # See what's available
GET    /orders/12345              # Check your specific order
POST   /orders                    # Place a new order
PUT    /orders/12345              # Change your order
DELETE /orders/12345              # Cancel your order
```

**Example Network Endpoints:**

```
GET    /devices                   # List all devices
GET    /devices/fw-01            # Get specific device info
POST   /devices                  # Add new device
PUT    /devices/fw-01/config     # Update device config
DELETE /devices/fw-01            # Remove device
```

## HTTP Status Codes (langos Responses)

Response codes are important to understand since they indicate either a success or problem that occurred with the request. The table below describes the most common response codes you will see when working with API's

| Code    | langos Meaning                           | Network Meaning | When You See It           |
|---------|-----------------------------------------|-----------------|---------------------------|
| **200** | "Your langos is ready!"                  | Success         | Operation completed       |
| **201** | "Order placed successfully!"            | Created         | New resource created      |
| **400** | "We don't have pineapple langos"         | Bad Request     | Invalid data sent         |
| **401** | "You need to give us your phone number" | Unauthorized    | Authentication failed     |
| **404** | "That langos doesn't exist"              | Not Found       | Resource doesn't exist    |
| **500** | "Our oven is broken"                    | Server Error    | API/device internal error |

## Request/Response Format



**langos Order Request:**

```http
POST /api/v1/orders HTTP/1.1
Host: tonys-langos.com
Content-Type: application/json
Authorization: Bearer customer-loyalty-card-123

{
  "size": "large",
  "toppings": ["pepperoni", "mushrooms"],
  "crust": "thin",
  "delivery_address": "123 Main St"
}
```

**langos Order Response:**

```http
HTTP/1.1 201 Created
Content-Type: application/json

{
  "order_id": 12345,
  "status": "preparing",
  "estimated_time": "25 minutes",
  "total": "$18.99"
}
```

**Network Policy Request:**

```http
POST /api/v1/firewall/policies HTTP/1.1
Host: fortigate.company.com
Content-Type: application/json
Authorization: Bearer your-token-here

{
  "name": "Allow-Web-Traffic",
  "source": "LAN",
  "destination": "WAN", 
  "service": "HTTP"
}
```

## JSON Data Format (langos Menu Style)

```json
{
  "langos": {
    "name": "Supreme Deluxe",
    "size": "large",
    "price": 22.99,
    "toppings": [
      {
        "name": "pepperoni",
        "extra": false
      },
      {
        "name": "cheese",
        "extra": true
      }
    ]
  }
}
```

**Network Device Format:**

```json
{
  "device": {
    "hostname": "fw-branch-01",
    "ip_address": "192.168.1.1",
    "model": "FortiGate-60F",
    "interfaces": [
      {
        "name": "port1",
        "ip": "192.168.100.1/24",
        "status": "up"
      }
    ]
  }
}
```

## Practical Examples

### Check langos Menu (Get Device Info)

```bash
# langos version
curl -X GET "https://tonys-langos.com/api/v1/menu" \
     -H "Authorization: Bearer loyalty-card-123"

# Network version  
curl -X GET "https://fortimanager.company.com/api/v2/devices/fw-01" \
     -H "Authorization: Bearer your-api-key"
```

### Order a langos (Create Firewall Policy)

```bash
# langos version
curl -X POST "https://tonys-langos.com/api/v1/orders" \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer loyalty-card-123" \
     -d '{
       "size": "large",
       "toppings": ["pepperoni"],
       "delivery": true
     }'

# Network version
curl -X POST "https://fortigate.company.com/api/v2/policies" \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer your-api-key" \
     -d '{
       "name": "Block-Social-Media",
       "action": "deny",
       "source": "LAN-Users",
       "service": "Facebook"
     }'
```

### Change Your Order (Update Interface)

```bash
# langos version
curl -X PUT "https://tonys-langos.com/api/v1/orders/12345" \
     -H "Content-Type: application/json" \
     -d '{
       "special_instructions": "Extra cheese please!",
       "delivery_time": "ASAP"
     }'

# Network version
curl -X PUT "https://switch.company.com/api/v1/interfaces/GigE0/1" \
     -H "Content-Type: application/json" \
     -d '{
       "description": "Server Farm Connection",
       "vlan": 100
     }'
```

## Error Handling

**langos Error Response:**

```json
{
  "error": {
    "code": 400,
    "message": "Sorry, we're out of pineapple",
    "suggestion": "Try pepperoni instead?"
  }
}
```

**Network Error Response:**

```json
{
  "error": {
    "code": 400,
    "message": "Invalid VLAN ID",
    "details": "VLAN ID must be between 1-4094"
  }
}
```

Next we'll look at how to use the API in FortiManager