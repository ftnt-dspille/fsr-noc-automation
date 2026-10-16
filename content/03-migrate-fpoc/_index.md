---
title: "Migration Options"
linkTitle: "Migration Options"
weight: 30
description: "Ways to migrate an existing FortiPOC environment to Fabric Studio"
---

There are two different ways to migrate from fortipoc to fabric studio.

The method you choose will depend on if you have custom firmware or use snapshots. Fabric studio doesn't support snapshots directly, so some extra work is required to migrate that.

If your fabric studio uses custom firmware (custom defined as anything not supported explicitly in the fabric studio [supported devices](https://register.fabricstudio.net/docs/fabric-studio/2.0.2/supported.html) docs), then you need to use the Remote Import method. 

{{% children %}}


## How to tell if you're using custom firmware
Any device that's not a fortinet firmware is treated as custom, as there's no way for fabric studio to configure them. 
Examples of custom firmware:
- WAN-EM
- Any linux vm (Ubuntu, Lubuntu, debian)

## How to tell if you're using snapshots
When saving config in fortipoc you have two options, create a snapshot, or export the config.

Even if you're using a fortinet product, that os could still be a snapshot. 