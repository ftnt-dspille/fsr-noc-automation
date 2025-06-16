---
title: "NetShot"
linkTitle: "Netshot"
weight: 60
---

![img.png](netshot_intro_pic.png?height=600px)

## Overview

Network device maintainers often need to audit and validate that devices have the configurations they should have, and receive alerts when discrepancies occur. The Netshot SP addresses this need by providing a comprehensive framework for defining how to obtain, normalize, analyze, and alert on network anomalies.

Netshot helps you gather network data using any method and format. Raw network data is then normalized to simplify reporting and identify unexpected anomalies and exceptions to defined rules.

## Key Capabilities

**Data Collection**: Netshot supports multiple collection methods including SSH, API calls, NMAP scans, and custom scripts. Data can be stored in various formats such as text, JSON, YAML, or CSV.

**Data Normalization**: Raw network data is converted into normalized formats (text, text lists, JSON, configuration blocks, or custom formats) to simplify reporting and analysis.

**Rule-Based Auditing**: Normalized data is used in report outputs that can audit configurations based on predefined rules or compare against previously obtained data to detect changes.

**Exception Alerting**: Report outputs include exception status indicators that flag when something is not as expected or desired from the network.

## Use Cases

**Configuration Auditing**: Collect device configurations as text files, normalize them into configuration blocks, and audit against compliance rules with importance scoring.

**Status Monitoring**: Gather device status information such as ARP tables, BGP peers, and VPN statistics, then audit for operational anomalies.

**Change Detection**: When network data is collected multiple times, compare current and previous data to identify unexpected changes.

## Real-World Application

A practical example involved a customer with 100+ manual audit checks required before and after device upgrades. Using Netshot, they automated the validation process to quickly determine if unexpected changes occurred during upgrades that could indicate outage-causing events.

This automation transformed a time-intensive manual process into an efficient, reliable system for maintaining network integrity and preventing service disruptions.

