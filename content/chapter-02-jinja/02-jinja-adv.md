---
title: "Jinja Advanced Features"
date: 2025-06-09
draft: false
weight: 20
description: "Advanced Jinja templating with conditionals, loops, and filters for FortiGate configuration management."
tags: [ "knowledge", "hands-on" ]
---

## Course Introduction

Welcome to the advanced Jinja templating guide! Building on the basics, we'll explore conditionals, loops, and filters - the powerful features that make Jinja templates truly dynamic and efficient for FortiGate configuration management.

## Chapter 1: Conditionals and Tests

Conditionals allow your templates to make decisions and generate different configurations based on your data.

### Basic If Statements

Jinja uses `{% if %}`, `{% elif %}`, and `{% else %}` for conditional logic:

```jinja2
{% if condition %}
    {# Configuration when condition is true #}
{% elif other_condition %}
    {# Alternative configuration #}
{% else %}
    {# Default configuration #}
{% endif %}
```

### Comparison Operators

- `==` (equal), `!=` (not equal)
- `>`, `>=`, `<`, `<=` (comparisons)
- `and`, `or`, `not` (logical operators)

### Hands-On Exercise 1: Version-Based Configuration

**Task:** Create a template that uses different SSL VPN configurations based on FortiOS version.

**JSON Data:**

```json
{
  "hostname": "FW-BRANCH-01",
  "fortios_version": 7.4,
  "ssl_vpn_port": 8443,
  "users": [
    "alice",
    "bob",
    "charlie"
  ]
}
```

**Expected Output for FortiOS 7.4:**

```
config system global
    set hostname "FW-BRANCH-01"
end

config vpn ssl settings
    set port 8443
    set tunnel-ip-pools "SSLVPN_TUNNEL_ADDR1"
    set tunnel-ipv6-pools "SSLVPN_TUNNEL_IPv6_ADDR1"
    set source-interface "port1"
end
```

**Expected Output for FortiOS 7.0:**

```
config system global
    set hostname "FW-BRANCH-01"
end

config vpn ssl settings
    set port 8443
    set tunnel-ip-pools "SSLVPN_TUNNEL_ADDR1"
    set source-interface "port1"
end
```

**Your Task:** Write a template that includes IPv6 pools only for FortiOS 7.2 and above.

{{% expand "Show Solution" %}}

```jinja2
config system global
    set hostname "{{ hostname }}"
end

config vpn ssl settings
    set port {{ ssl_vpn_port }}
    set tunnel-ip-pools "SSLVPN_TUNNEL_ADDR1"
{% if fortios_version >= 7.2 %}
    set tunnel-ipv6-pools "SSLVPN_TUNNEL_IPv6_ADDR1"
{% endif %}
    set source-interface "port1"
end
```

{{% /expand %}}

### Using Tests

Tests check properties of variables and return True/False:

- `is defined` - Check if variable exists
- `is string`, `is number` - Check data types
- `is iterable` - Check if can be looped over

### Hands-On Exercise 2: Safe Configuration with Tests

**Task:** Create a template that safely handles optional configuration parameters.

**JSON Data:**

```json
{
  "hostname": "FW-TEST-01",
  "timezone": "America/New_York",
  "admin_timeout": 480,
  "ntp_servers": [
    "pool.ntp.org",
    "time.google.com"
  ]
}
```

**Your Task:** Write a template that:

1. Only configures timezone if it's defined
2. Only configures admin timeout if it's a number
3. Only configures NTP if servers list is not empty

{{% expand "Show Solution" %}}

```jinja2
config system global
    set hostname "{{ hostname }}"
{% if timezone is defined %}
    set timezone "{{ timezone }}"
{% endif %}
{% if admin_timeout is defined and admin_timeout is number %}
    set admin-timeout {{ admin_timeout }}
{% endif %}
end

{% if ntp_servers is defined and ntp_servers|length > 0 %}
config system ntp
    set ntpsync enable
    config ntpserver
{% for server in ntp_servers %}
        edit {{ loop.index }}
            set server "{{ server }}"
        next
{% endfor %}
    end
end
{% endif %}
```

{{% /expand %}}

---

## Chapter 2: Loops

Loops let you generate repetitive configurations efficiently using arrays and objects in your JSON data.

### Basic For Loop

```jinja2
{% for item in collection %}
    {{ item }}
{% endfor %}
```

### Loop Variables

Inside loops, Jinja provides helpful variables:

- `loop.index` - Current iteration (1-based)
- `loop.index0` - Current iteration (0-based)
- `loop.first` - True on first iteration
- `loop.last` - True on last iteration

### Hands-On Exercise 3: Multiple Interface Configuration

**Task:** Generate configuration for multiple interfaces using a loop.

**JSON Data:**

```json
{
  "interfaces": [
    {
      "name": "port1",
      "ip": "192.168.1.1",
      "netmask": "255.255.255.0",
      "description": "LAN Interface",
      "allowaccess": [
        "ping",
        "https",
        "ssh"
      ]
    },
    {
      "name": "port2",
      "ip": "203.0.113.10",
      "netmask": "255.255.255.252",
      "description": "WAN Interface",
      "allowaccess": [
        "ping"
      ]
    },
    {
      "name": "port3",
      "ip": "10.10.10.1",
      "netmask": "255.255.255.0",
      "description": "DMZ Interface",
      "allowaccess": [
        "ping",
        "https"
      ]
    }
  ]
}
```

**Your Task:** Create a template that configures all interfaces.

{{% expand "Show Solution" %}}

```jinja2
config system interface
{% for intf in interfaces %}
    edit "{{ intf.name }}"
        set ip {{ intf.ip }} {{ intf.netmask }}
        set description "{{ intf.description }}"
        set allowaccess {{ intf.allowaccess | join(' ') }}
    next
{% endfor %}
end
```

{{% /expand %}}

### Looping Over Dictionaries

When your JSON uses objects instead of arrays, you can loop over key-value pairs:

```jinja2
{% for key, value in dictionary.items() %}
    Key: {{ key }}, Value: {{ value }}
{% endfor %}
```

### Hands-On Exercise 4: VLAN Configuration with Dictionary

**Task:** Configure VLANs using a dictionary structure.

**JSON Data:**

```json
{
  "vlans": {
    "10": {
      "name": "USERS",
      "description": "User workstations",
      "interface": "port1"
    },
    "20": {
      "name": "SERVERS",
      "description": "Server network",
      "interface": "port1"
    },
    "30": {
      "name": "GUESTS",
      "description": "Guest network",
      "interface": "port1"
    }
  }
}
```

**Expected Output:**

```
config system interface
    edit "USERS"
        set vdom "root"
        set vlanid 10
        set interface "port1"
        set description "User workstations"
    next
    edit "SERVERS"
        set vdom "root"
        set vlanid 20
        set interface "port1"
        set description "Server network"
    next
    edit "GUESTS"
        set vdom "root"
        set vlanid 30
        set interface "port1"
        set description "Guest network"
    next
end
```

{{% expand "Show Solution" %}}

```jinja2
config system interface
{% for vlan_id, vlan_data in vlans.items() %}
    edit "{{ vlan_data.name }}"
        set vdom "root"
        set vlanid {{ vlan_id }}
        set interface "{{ vlan_data.interface }}"
        set description "{{ vlan_data.description }}"
    next
{% endfor %}
end
```

{{% /expand %}}

### Loop Filtering

You can filter items during loops using `if`:

```jinja2
{% for item in collection if item.status == 'active' %}
    {{ item.name }}
{% endfor %}
```

### Hands-On Exercise 5: Conditional Interface Configuration

**Task:** Configure only interfaces that have IP addresses assigned.

**JSON Data:**

```json
{
  "interfaces": [
    {
      "name": "port1",
      "ip": "192.168.1.1",
      "netmask": "255.255.255.0",
      "description": "LAN Interface"
    },
    {
      "name": "port2",
      "description": "Unused port"
    },
    {
      "name": "port3",
      "ip": "10.10.10.1",
      "netmask": "255.255.255.0",
      "description": "DMZ Interface"
    }
  ]
}
```

**Your Task:** Only configure interfaces that have an `ip` field defined.

{{% expand "Show Solution" %}}

```jinja2
config system interface
{% for intf in interfaces if intf.ip is defined %}
    edit "{{ intf.name }}"
        set ip {{ intf.ip }} {{ intf.netmask }}
        set description "{{ intf.description }}"
    next
{% endfor %}
end
```

{{% /expand %}}

---

## Chapter 3: Filters

Filters transform data in your templates. They're applied using the pipe `|` symbol.

### Essential Filters

#### join

Combines array elements into a string:

```jinja2
{{ servers | join(' ') }}
```

#### default

Provides fallback values:

```jinja2
{{ timeout | default(300) }}
```

#### length

Gets the count of items:

```jinja2
{% if users | length > 10 %}
```

#### upper/lower

Changes text case:

```jinja2
{{ hostname | upper }}
```

#### replace

```jinja2
{{ "branch-office-firewall" | replace('-', '_') | upper }}
> BRANCH_OFFICE_FIREWALL
```

{{% notice note %}}
FortiSOAR has documentation of all the available Jinja filters [here](https://docs.fortinet.com/document/fortisoar/latest/playbooks-guide/767891/jinja-filters-and-functions#Filters)
{{% /notice %}}

### Hands-On Exercise 6: Firewall Policy with Filters

**Task:** Use filters to create firewall policies with proper formatting.

**JSON Data:**

```json
{
  "policies": [
    {
      "name": "allow_web_traffic",
      "srcintf": [
        "port1",
        "port3"
      ],
      "dstintf": [
        "port2"
      ],
      "srcaddr": [
        "internal_users",
        "dmz_servers"
      ],
      "dstaddr": [
        "all"
      ],
      "service": [
        "HTTP",
        "HTTPS"
      ],
      "action": "accept",
      "log": true
    },
    {
      "name": "allow_dns",
      "srcintf": [
        "port1"
      ],
      "dstintf": [
        "port2"
      ],
      "srcaddr": [
        "internal_users"
      ],
      "dstaddr": [
        "all"
      ],
      "service": [
        "DNS"
      ],
      "action": "accept"
    }
  ]
}
```

**Your Task:** Create firewall policies using filters to join arrays and provide defaults.

{{% expand "Show Solution" %}}

```jinja2
config firewall policy
{% for policy in policies %}
    edit 0
        set name "{{ policy.name | upper }}"
        set srcintf {{ policy.srcintf | join(' ') }}
        set dstintf {{ policy.dstintf | join(' ') }}
        set srcaddr {{ policy.srcaddr | join(' ') }}
        set dstaddr {{ policy.dstaddr | join(' ') }}
        set service {{ policy.service | join(' ') }}
        set action {{ policy.action }}
{% if policy.log is defined %}
        set logtraffic all
{% endif %}
    next
{% endfor %}
end
```

{{% /expand %}}

### Advanced Filters

#### map

Extracts specific attributes from objects:

```jinja2
{{ interfaces | map(attribute='name') | join(' ') }}
```

#### select/reject

Filters items based on conditions:

```jinja2
{{ vlans | selectattr('active', 'equalto', true) }}
```

#### groupby

Groups items by an attribute:

```jinja2
{% for status, interfaces in all_interfaces | groupby('status') %}
```

### Hands-On Exercise 7: Advanced Policy Management

**Task:** Create a complex configuration using advanced filters.

**JSON Data:**

```json
{
  "interfaces": [
    {
      "name": "port1",
      "zone": "internal",
      "status": "up"
    },
    {
      "name": "port2",
      "zone": "external",
      "status": "up"
    },
    {
      "name": "port3",
      "zone": "dmz",
      "status": "down"
    },
    {
      "name": "port4",
      "zone": "internal",
      "status": "up"
    }
  ],
  "security_profiles": {
    "antivirus": "default",
    "webfilter": "strict",
    "ips": "protect"
  }
}
```

**Your Task:**

1. List all active interfaces grouped by zone
2. Create security profile configuration with proper formatting

{{% expand "Show Solution" %}}

```jinja2
{# Active interfaces by zone #}
{% for zone, intfs in interfaces | selectattr('status', 'equalto', 'up') | groupby('zone') %}
# {{ zone | title }} Zone Interfaces: {{ intfs | map(attribute='name') | join(', ') }}
{% endfor %}

{# Security profiles configuration #}
config antivirus profile
    edit "{{ security_profiles.antivirus }}"
        # Antivirus configuration
    next
end

config webfilter profile  
    edit "{{ security_profiles.webfilter }}"
        # Web filter configuration
    next
end

config ips sensor
    edit "{{ security_profiles.ips }}"
        # IPS configuration  
    next
end
```

{{% /expand %}}

### Chaining Filters

You can combine multiple filters:

```jinja2
{{ servers | map(attribute='name') | select('match', 'web.*') | join(', ') }}
```

---

## Summary

You've learned to use Jinja's most powerful features:

**Conditionals:**

- `{% if %}`, `{% elif %}`, `{% else %}`
- Tests like `is defined`, `is string`
- Comparison and logical operators

**Loops:**

- `{% for item in list %}`
- `{% for key, value in dict.items() %}`
- Loop filtering with `if`
- Loop variables (`loop.index`, `loop.first`, etc.)

**Filters:**

- Basic: `join`, `default`, `length`, `upper/lower`
- Advanced: `map`, `select/reject`, `groupby`
- Filter chaining with `|`

### Next Steps

Practice combining these features to create sophisticated FortiGate configurations. Start simple and gradually add complexity as you become more comfortable with the syntax and concepts.