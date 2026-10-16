---
title: "Shrink a Firmware Image"
linkTitle: "Shrink Firmware"
weight: 40
description: "Reclaim home-repository disk by recompressing qcow2 firmware in place"
---

## Overview

Large qcow2 firmware images can be **recompressed in place** in the home
repository to reclaim disk. This is a byte-preserving repack: only the qcow2
container's compression codec changes, so a VM deployed from the repacked image
boots identically. No in-guest work at all.

**The payoff varies enormously - from 50% to nothing - and you can predict it in
about a minute.** Measured on real images:

| Image | Compressed clusters | Before | After | Saved | Convert time |
|---|---|---|---|---|---|
| FortiSOAR 8.0.0 | 0.00% | 13 GB | 6.1 GB | **50%** | 3m20s |
| FortiSOAR 7.6.6 | 75.75% | 6.1 GB | 6.0 GB | **1.8%** | 2m56s |

Same product, same command, wildly different result. The predictor is the
**compressed clusters** percentage - an image that was never written compressed
has everything to gain; one that's already compressed has almost nothing. Step 2
shows how to read it *before* committing to a repack.

{{% notice warning %}}
**Work on a copy, verify, then delete the backup.** Never edit a served firmware
file in place without a rollback path.
{{% /notice %}}

---

## What you're working with

- The home-repo shell's working directory is `/home/home`; firmware lives under `firmwares/`.
- A firmware is either a single `.qcow2` file or a **directory** per image
  (`firmwares/<Name>/`) containing one or more qcow2 disks, an `active.meta`
  (XML rooted at `<model>`), an `original.meta`, and sometimes a `.split` marker.
- The top-level `size="<bytes>"` in `active.meta` is what the UI reports as the
  image size. It's the **sum of all disk file bytes** and must be updated after a
  repack.

---

## Step 0 - Check that `qemu-img` exists

{{% notice warning %}}
**`qemu-img` is not present on every pod.** The home-repo shell is a restricted
environment and its toolset varies by pod. Check before you plan any of this - if
it's missing, none of the procedure below is available to you.
{{% /notice %}}

```bash
(cmm-master-fs-001) # system repository home shell
admin@cmm-master-fs-001:~$ command -v qemu-img && qemu-img --version | head -1
/usr/bin/qemu-img
qemu-img version 7.2.17 (Debian 1:7.2+dfsg-7+deb12u13)
```

If instead you get:

```bash
admin@cmm-master-fs-001:~$ qemu-img info firmwares/some-image.qcow2
bash: qemu-img: command not found
```

then stop - this pod can't repack images from the repo shell.

The shell is unprivileged and minimal. It has `sed`, `awk`, `stat`, `coreutils`,
`base64` and `curl`, but **no `python3` and no `bc`** - which is why the commands
below stick to `sed` and `awk`.

---

## Step 1 - Find the big images

```bash
admin@cmm-master-fs-001:~$ du -sh firmwares/* | sort -h | tail -6
3.1G	firmwares/fsr-7.6.6-clean-nolicense
3.2G	firmwares/fsr-7.6.6-shutdown-only
6.1G	firmwares/fortisoar-kvm-enterprise-7.6.6-5675.qcow2
7.6G	firmwares/fortisoar-kvm-enterprise-8.0.0-6034.qcow2
9.0G	firmwares/FSR-8.0.0-20260614-140757.qcow2
13G	firmwares/fortisoar-8.0.0.qcow2
```

Check you have room to work - the convert writes a second copy before you swap:

```bash
admin@cmm-master-fs-001:~$ df -h /home/home | tail -1
-               324G   87G  221G  29% /home/home
```

---

## Step 2 - Will it actually shrink?

This is the step that saves you an hour. `qemu-img check` reports the share of
clusters already compressed:

```bash
admin@cmm-master-fs-001:~$ qemu-img check firmwares/fortisoar-8.0.0.qcow2
No errors were found on the image.
198542/3276800 = 6.06% allocated, 0.00% fragmented, 0.00% compressed clusters
Image end offset: 13020102656
```

**`0.00% compressed clusters`** - nothing in this image is compressed, so a repack
has everything to gain. This one went 13 GB → 6.1 GB.

Compare:

```bash
admin@cmm-master-fs-001:~$ qemu-img check firmwares/fortisoar-kvm-enterprise-7.6.6-5675.qcow2
No errors were found on the image.
176616/7200000 = 2.45% allocated, 78.31% fragmented, 75.75% compressed clusters
Image end offset: 6544752640
```

**`75.75% compressed clusters`** - already compressed. Repacking this saved 1.8%
for three minutes of CPU. Not worth it.

Rule of thumb: **near 0% compressed → expect a large win. Already high → skip it.**

{{% notice tip %}}
`qemu-img info` also prints a `compression type:` line, but **don't use it to
decide** - it names the codec that *would* be used for compressed clusters, not
whether any clusters actually are. Both images above report `compression type:
zlib`; only one of them had anything to gain. `qemu-img check` is the honest
signal.
{{% /notice %}}

---

## Step 3 - Standalone or overlay?

Only **standalone base images** can be repacked. Check for a backing file:

```bash
admin@cmm-master-fs-001:~$ qemu-img info firmwares/fortisoar-kvm-enterprise-7.6.6-5675.qcow2
image: firmwares/fortisoar-kvm-enterprise-7.6.6-5675.qcow2
file format: qcow2
virtual size: 439 GiB (471859200000 bytes)
disk size: 6.1 GiB
cluster_size: 65536
Format specific information:
    compat: 1.1
    compression type: zlib
    lazy refcounts: false
    refcount bits: 16
    corrupt: false
    extended l2: false
```

No `backing file:` line → **standalone**. Safe to repack.

Now an overlay:

```bash
admin@cmm-master-fs-001:~$ qemu-img info firmwares/fsr-7.6.6-clean-nolicense/fortisoar-kvm-enterprise-7.6.6-5675.qcow2
image: firmwares/fsr-7.6.6-clean-nolicense/fortisoar-kvm-enterprise-7.6.6-5675.qcow2
file format: qcow2
virtual size: 439 GiB (471859200000 bytes)
disk size: 3.03 GiB
backing file: /opt/ftnt/resources/backingstore/home/fortisoar-kvm-enterprise-7.6.6-5675.qcow2/e3b0c44.../firmware/fortisoar-kvm-enterprise-7.6.6-5675.qcow2
backing file format: qcow2
Format specific information:
    compat: 1.1
    compression type: zlib
```

{{% notice warning %}}
**A `backing file:` means it's a diff/overlay - leave it alone.** The UI groups
these under "Diff". A plain `qemu-img convert` reads through the backing chain and
would *flatten* the overlay into a full image, inflating a 3 GB delta into a
full-size disk. Overlays are already small deltas, and recompressing their **base**
keeps them valid - the base's guest data is preserved bit-for-bit.
{{% /notice %}}

---

## Step 4 - Dry run: convert to scratch and compare

Don't touch the served file yet. Convert it to a scratch directory and measure -
this reads the source read-only, so it's safe to run any time.

{{% notice warning %}}
Put scratch **outside** `firmwares/`. Anything inside `firmwares/` gets picked up
by a repository refresh and registered as bogus firmware.
{{% /notice %}}

```bash
admin@cmm-master-fs-001:~$ mkdir -p /home/home/_shrink_demo
admin@cmm-master-fs-001:~$ time qemu-img convert -O qcow2 -o compression_type=zstd -c \
    firmwares/fortisoar-8.0.0.qcow2 /home/home/_shrink_demo/big.qcow2

real	3m19.697s
user	2m37.523s
sys	0m56.805s

admin@cmm-master-fs-001:~$ stat -c %s firmwares/fortisoar-8.0.0.qcow2 /home/home/_shrink_demo/big.qcow2
13020102656
6509852160
```

13,020,102,656 → 6,509,852,160 bytes: **50% reclaimed**. Worth doing.

Verify the new image before trusting it:

```bash
admin@cmm-master-fs-001:~$ qemu-img check /home/home/_shrink_demo/big.qcow2
No errors were found on the image.
176616/7200000 = 2.45% allocated, 71.44% fragmented, 70.06% compressed clusters
Image end offset: 6509852160
```

If the check fails, or the new file isn't meaningfully smaller, discard it and
keep the original.

{{% notice tip %}}
Stay **compressed** (`-c` with `compression_type=zstd`). Converting without `-c`
only reclaims zero clusters and usually ends up *larger* than a compressed
original.
{{% /notice %}}

---

## Step 5 - Swap in the repacked disk

Back up the original **outside** `firmwares/`, then promote the repacked file. An
`mv` is atomic - an in-flight read keeps the old inode, so a concurrent deploy
won't tear on the swap. Still, don't repack a firmware that's mid-install.

```bash
admin@cmm-master-fs-001:~$ mkdir -p /home/home/firmware_backup_orig
admin@cmm-master-fs-001:~$ mv firmwares/fortisoar-8.0.0.qcow2 /home/home/firmware_backup_orig/
admin@cmm-master-fs-001:~$ mv /home/home/_shrink_demo/big.qcow2 firmwares/fortisoar-8.0.0.qcow2
admin@cmm-master-fs-001:~$ chmod 0644 firmwares/fortisoar-8.0.0.qcow2
```

---

## Step 6 - Update `size=` in the firmware's `.meta`

Every firmware has a `.meta` whose top-level `size` must match the new total
bytes of its disks. Which file that is depends on the firmware's layout:

| Firmware layout | Its `.meta` | Disk(s) to measure |
|---|---|---|
| A bare file, like the example `fortisoar-8.0.0.qcow2` | `firmwares/fortisoar-8.0.0.qcow2.meta` (same name plus `.meta`) | that one file |
| A directory (`firmwares/<Name>/`, e.g. a snapshot) | `firmwares/<Name>/active.meta` | `firmwares/<Name>/*.qcow2` |

Get the new total (`bc` isn't available, so use `awk`). For the example:

```bash
admin@cmm-master-fs-001:~$ stat -c %s firmwares/fortisoar-8.0.0.qcow2 | awk '{s+=$1} END {print s}'
6509852160
```

For a directory firmware, use `stat -c %s firmwares/<Name>/*.qcow2` instead.

The `size` attribute lives on the `<model>` root element, on line 1:

```xml
<model xmlns:fp="fp" core_version="2.2.25.dev.2" hexdigest="e3b0c44..." name="SOAR" size="3251905539" time="1780774835.32" ...>
```

Patch **only** that one (for a directory firmware, the file is
`firmwares/<Name>/active.meta`):

```bash
admin@cmm-master-fs-001:~$ sed -i '1s/ size="[0-9]*"/ size="6509852160"/' firmwares/fortisoar-8.0.0.qcow2.meta
```

{{% notice warning %}}
**Only the model-level `size`.** The file contains several other `size`-like
attributes - per-disk `fp:size` and `physical_size` are **MiB geometry**, not byte
counts. Writing a byte count into those makes Fabric Studio read a ~12-EiB disk
and reject the firmware. The `1s/ size="…"/` form above is deliberate: it's
anchored to line 1 and the leading space stops it matching `fp:size="…"`.
{{% /notice %}}

Confirm only the first value moved:

```bash
admin@cmm-master-fs-001:~$ grep -o 'size="[0-9]*"' firmwares/fortisoar-8.0.0.qcow2.meta | head -4
size="6509852160"      <- model-level, patched
size="3251896320"      <- fp:size, untouched
size="0"               <- untouched
size="471859200000"    <- virtual size, untouched
```

---

## Step 7 - Refresh the repository

Leave the shell and have Fabric Studio re-read the firmware rows:

```bash
admin@cmm-master-fs-001:~$ exit
(cmm-master-fs-001) # system repository home refresh
```

The refresh is asynchronous. Confirm the new size in the UI's Firmwares tab, and
that the firmware hasn't landed in an `unknown` status.

---

## Step 8 - Prove the image still works

A repack is byte-preserving, but prove it end to end **before** deleting your
backup. Deploy or reinstall a VM from the repacked firmware and confirm:

1. The refresh registered the firmware with its new size, no `unknown` status.
2. A VM installed from it completes its install task and boots.
3. The guest is reachable - console, or SSH on `11000+index` - and reports the
   expected version.
4. If you repacked a **base** that overlays depend on, deploy one of those
   overlays too. That proves the backing chain survived.

Only when all four pass is the repack proven.

---

## Step 9 - Delete the backup

This is where the disk is actually reclaimed:

```bash
admin@cmm-master-fs-001:~$ rm -rf /home/home/firmware_backup_orig
admin@cmm-master-fs-001:~$ rm -rf /home/home/_shrink_demo
```

---

## Going further

Recompression can't reclaim blocks that were deleted inside the guest but never
zeroed. To go further you need the guest itself: boot the VM, run `fstrim -a` (or
`zerofree`), shut it down, *then* repack. That's a live-VM operation, not a
repo-shell one - and it's what turns a "already compressed, nothing to gain" image
into one worth repacking.

---

## Troubleshooting

| Symptom | Cause |
|---|---|
| `qemu-img: command not found` | This pod's repo shell has no `qemu-img`. The procedure isn't available. |
| Repack saved almost nothing | The source was already compressed. Check `qemu-img check` first (Step 2). |
| Repacked file is *bigger* | You converted without `-c`, so it's now uncompressed. |
| Convert fails on an overlay | It has a `backing file:` outside `firmwares/`. Don't repack overlays. |
| FS reports a ~12-EiB disk / rejects the firmware | You patched a per-disk `fp:size`/`physical_size` instead of the model-level `size`. |
| Stray firmware rows after a refresh | Scratch or backup files were left inside `firmwares/`. Move them to a sibling directory. |
| UI still shows the old size | `system repository home refresh` hasn't run, or is still running. |
