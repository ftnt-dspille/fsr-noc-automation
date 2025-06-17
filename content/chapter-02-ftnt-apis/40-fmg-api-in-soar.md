---
title: FMG API in SOAR
linkTitle: FMG API in SOAR
weight: 40
---

The FortiManager JSON RPC connector was created by myself (Dylan Spille) to better work with the RPC actions that foritmanager supports. In order to use this connector, you do need to have familarity with FMG API endpoints, and how to format the request data. Make sure you've read the FMG API section before this chapter. 

## Setup

1. Navigate to Content Hub > Connectors. 
2. Search for `FortiManager JSON RPC`
3. Open the connector. 
4. Confirm that the health check is green.

## Register Enterprise Core to FMG

1. Login to Enterprise_Core Fortigate. Follow the steps outlined [here](/chapter-05-ztp/06-page-onboard-fortigate)

## Basic Queries

Get list of devices
URL: `/dvmdb/device`
data:
```json
{
  "fields": [
    "name",
    "sn",
    "extra info",
    "os_ver",
    "mr",
    "patch"
  ],
  "option": [
    "extra info"
  ]
}
```

Get config from FMG cmdb

Update config on cmdb

Kick off a device install


## Advanced Cases

Getting AP Memory from Fortigate via FMG

Create and Exec a CLI script on a device

