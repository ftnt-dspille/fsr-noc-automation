---
title: "Python Client"
linkTitle: "Python Client"
date: 2025-05-28T11:09:55-05:00
weight: 10
---

Welcome to the Python client documentation for Fabric Studio! This comprehensive wrapper simplifies HTTP requests to the Fabric Studio API, making it easy to integrate Fabric Studio functionality into your Python applications.

## Overview

The Fabric Studio Python client provides:

- **Session management** with automatic cookie handling
- **CSRF token** management for requests
- **Simple HTTP methods** (GET, POST, PUT, DELETE)
- **Automatic authentication** upon initialization

## Getting Started

Choose one of the following options to get the Python client:

### Option 1: Download Pre-packaged Files

Download the complete client and example files in a convenient ZIP package:

{{% resources title="Python Client and Example Zip" style="info" pattern=".*\.zip" /%}}

**What's included:**

```text
fabric_api_example
├── example_fabric_api.py  - Api examples
└── fabric_studio_client
    ├── __init__.py
    └── client.py          - The main client library
```

### Option 2: Copy the Client Code

```python
#!/usr/bin/env python3
"""
Simple FortiPOC REST Client

A simplified single-file class for making REST API calls to FortiPOC instances.
"""

from typing import Dict, Optional, Union

import requests


class FabricStudioClient:
    """
    A simple client for interacting with FortiPOC REST API.
    
    This client maintains a session with cookies in memory only and provides
    methods for making REST API calls to a FortiPOC instance.
    """

    def __init__(self, server: str, username: str, password: str, verify_ssl: bool = False):
        """
        Initialize a FortiPOC REST client.
        
        Args:
            server: The FortiPOC server URL or IP address
            username: Username for authentication
            password: Password for authentication
            verify_ssl: Whether to verify SSL certificates. Default is False.
        """
        self.server = server.rstrip('/')

        if not self.server.startswith(('http://', 'https://')):
            self.server = f'https://{self.server}'

        self.username = username
        self.password = password
        self.verify_ssl = verify_ssl

        # Create a session to maintain cookies in memory
        self.session = requests.Session()
        self.session.verify = verify_ssl

        # CSRF token will be stored here after login
        self.csrf_token = None

        # Login automatically when the client is instantiated
        self.login()

    def _get_full_url(self, endpoint: str) -> str:
        """
        Build the full URL for an API endpoint.
        
        Args:
            endpoint: API endpoint path
            
        Returns:
            Full URL including server address
        """
        # Remove leading slash if present to avoid double slashes
        if endpoint.startswith('/'):
            endpoint = endpoint[1:]

        return f"{self.server}/{endpoint}"

    def _extract_csrf_token(self) -> Optional[str]:
        """
        Extract the CSRF token from the session cookies.
        
        Returns:
            The CSRF token value or None if not found.
        """
        for cookie in self.session.cookies:
            if cookie.name == 'fortipoc-csrftoken':
                return cookie.value
        return None

    def request(self, method: str, endpoint: str, data: Optional[Union[Dict, str]] = None,
                headers: Optional[Dict[str, str]] = None, json_data: Optional[Dict] = None) -> requests.Response:
        """
        Make a REST API request to the FortiPOC instance.
        
        Args:
            method: HTTP method (GET, POST, PUT, DELETE, etc.)
            endpoint: API endpoint to call (e.g., 'api/v1/session/check')
            data: Form data or raw string data to send
            headers: Additional HTTP headers
            json_data: JSON data to send (will be converted to string)
            
        Returns:
            The response object from the request
            
        Raises:
            Exception: If there's an error with the request
        """
        # Prepare headers
        if headers is None:
            headers = {}

        # Add common headers
        headers['Referer'] = f'{self.server}/'

        # Add CSRF token if available
        if self.csrf_token:
            headers['X-FortiPoC-CSRFToken'] = self.csrf_token

        # Make the request
        url = self._get_full_url(endpoint)

        try:
            response = self.session.request(
                method=method,
                url=url,
                headers=headers,
                data=data,
                json=json_data,
                allow_redirects=True
            )

            # Check for CSRF token in response cookies and update if found
            new_token = self._extract_csrf_token()
            if new_token:
                self.csrf_token = new_token

            return response

        except requests.RequestException as e:
            raise Exception(f"Request failed: {str(e)}")

    def get(self, endpoint: str, headers: Optional[Dict[str, str]] = None) -> requests.Response:
        """Make a GET request to the API."""
        return self.request('GET', endpoint, headers=headers)

    def post(self, endpoint: str, data: Optional[Union[Dict, str]] = None,
             headers: Optional[Dict[str, str]] = None, json_data: Optional[Dict] = None) -> requests.Response:
        """Make a POST request to the API."""
        return self.request('POST', endpoint, data=data, headers=headers, json_data=json_data)

    def put(self, endpoint: str, data: Optional[Union[Dict, str]] = None,
            headers: Optional[Dict[str, str]] = None, json_data: Optional[Dict] = None) -> requests.Response:
        """Make a PUT request to the API."""
        return self.request('PUT', endpoint, data=data, headers=headers, json_data=json_data)

    def delete(self, endpoint: str, headers: Optional[Dict[str, str]] = None) -> requests.Response:
        """Make a DELETE request to the API."""
        return self.request('DELETE', endpoint, headers=headers)

    def login(self) -> Dict:
        """
        Login to the FortiPOC instance.
        
        Returns:
            The JSON response as a dictionary
        """
        # First, get cookies and possibly a CSRF token
        self.get('api/v1/session/check')

        # Now login with credentials
        endpoint = 'api/v1/session/open'
        headers = {'Content-Type': 'application/json'}

        response = self.post(
            endpoint,
            json_data={'username': self.username, 'password': self.password},
            headers=headers
        )

        # Update CSRF token after login
        self.csrf_token = self._extract_csrf_token()

        return response.json()
```

## Quick Start Example

Here's a simple example of how to use the client:

```python
import urllib3

from fabric_studio_client import FabricStudioClient

# Disable insecure request warnings
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# Configuration
SERVER_URL = "your-fortipoc-server.example.com"
USERNAME = "admin"
PASSWORD = "your-password"


def main():
    # Create client instance
    client = FabricStudioClient(server=SERVER_URL, username=USERNAME, password=PASSWORD, verify_ssl=False)
    print("Connected to FortiPOC server")

    # List all devices
    print("\nListing all devices...")
    response = client.get('/api/v1/model/device')
    if response.status_code == 200:
        devices = response.json().get('object', [])
        print(f"Found {len(devices)} devices")
        for device in devices:
            print(
                f"- {device.get('name', 'Unnamed')} (ID: {device.get('id', 'Unknown')}) (Fabric ID: {device.get('fabric', 'Unknown')})")
    else:
        print(f"Error: {response.status_code}")

    # Get specific device by ID (example with ID 1)
    device_id = devices[0].get('id', 'Unknown')
    print(f"\nGetting details for device ID {device_id}...")
    response = client.get(f'/api/v1/model/device/{device_id}')
    if response.status_code == 200:
        device = response.json().get('object', {})
        print(f"Device: {device.get('name', 'Unnamed')}")
        print(f"Type: {device.get('vm_type', 'Unknown')}")
    else:
        print(f"Error: {response.status_code}")

    # List all fabrics
    print("\nListing all fabrics...")
    response = client.get('/api/v1/model/fabric')
    if response.status_code == 200:
        fabrics = response.json().get('object', [])
        print(f"Found {len(fabrics)} fabrics")
        for fabric in fabrics:
            print(f"- {fabric.get('name', 'Unnamed')} (ID: {fabric.get('id', 'Unknown')})")
            print(f"  Description: {fabric.get('description', 'No description')}")
            print(f"  Created: {fabric.get('create_date', 'Unknown')}")
    else:
        print(f"Error: {response.status_code}")


if __name__ == "__main__":
    main()
```

## Key Features

### Automatic Authentication

The client automatically handles login when instantiated, so you don't need to manually authenticate for each session.

### Session Persistence

Cookies and CSRF tokens are automatically managed throughout the session, ensuring secure and consistent API communication.

### Flexible Request Methods

The client provides convenient methods for all common HTTP operations:

- `client.get(endpoint)` - Retrieve data
- `client.post(endpoint, data/json_data)` - Create resources
- `client.put(endpoint, data/json_data)` - Update resources
- `client.delete(endpoint)` - Remove resources

### Error Handling

Built-in exception handling for network issues and HTTP errors, making your code more robust.

## Configuration Requirements

Before using the client, ensure you have:

1. **Server URL** - Your Fabric Studio server address
2. **Credentials** - Valid username and password
3**Python Dependencies** - The `requests` library
   
    ```bash
    pip install requests
    ```

## Example Use Cases

The included example script demonstrates several common scenarios:

- **Device Management** - List and retrieve device information
- **Fabric Operations** - Query fabric configurations and metadata

## Next Steps

1. Download the client files using Option 1 above
2. Update the configuration variables in the example script:
    - `SERVER_URL` - Your Fabric Studio server
    - `USERNAME` - Your username
    - `PASSWORD` - Your password
3. Run the example to verify connectivity
4. Explore the Fabric Studio API endpoints using your browser's developer tools
5. Adapt the client for your specific automation needs

## Support and Resources

- Review the included example script for comprehensive usage patterns
- Use browser developer tools to discover additional API endpoints
- Refer to the Fabric Studio API documentation for endpoint specifications

Happy automating with Fabric Studio!