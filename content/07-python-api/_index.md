---
title: "Fabric Studio API"
linkTitle: "Fabric Studio API"
weight: 60
description: "Discover and use the Fabric Studio REST API and Python client"
---

Fabric Studio provides comprehensive API support with multiple discovery methods to help you understand and utilize available endpoints effectively.

## API Discovery Methods

There are two primary approaches to explore the available API endpoints:

### Method 1: Swagger Documentation

Browse the comprehensive API documentation at [Fabric Studio OpenAPI](https://register.fabricstudio.net/docs/fabric-studio/2.0.2/openapi/)

**Advantages:**
- Complete API reference with detailed documentation
- All endpoints, parameters, and response schemas documented
- Interactive testing capabilities

**Considerations:**
- Extensive information that may be overwhelming for beginners
- Technical terminology requires familiarity with Fabric Studio concepts

### Method 2: Browser Network Analysis

Use your browser's developer tools to inspect real API calls made by the Fabric Studio interface.

**How to use this method:**

1. Open your browser's Developer Tools (F12)
2. Navigate to the Network tab
3. Interact with the Fabric Studio UI
4. Observe the API calls being made

**Example: Discovering the Fabrics Endpoint**

When you click "Fabric Workspace" in the UI, the network debug reveals:

- **Endpoint:** `/api/v1/model/fabric`
- **Method:** GET
- **Purpose:** Lists available fabrics

![Browser Headers](browser_headers.png?height=400px)
*Network request showing the API endpoint used*

![Browser Response](browser_response.png?height=500px)
*JSON response containing fabric information*

**Advantages:**
- Practical, real-world API usage examples
- Understand exactly what the UI is doing behind the scenes
- Immediate context for API calls

**Best Practice:**
Start with browser network analysis to understand basic patterns, then reference the Swagger documentation for detailed parameter information and advanced usage.