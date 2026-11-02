#!/bin/sh
# Rebuild the downloadable copy of the fabric-studio repository that the MCP server install page offers.
#   scripts/build-mcp-zip.sh /path/to/fabric_studio_core
# The page links it with the download shortcode. It zips the tracked files of the checked-out commit (git archive), so nothing untracked or ignored ships.
set -eu
src="${1:?usage: build-mcp-zip.sh <path to the fabric-studio repository>}"
out="$(cd "$(dirname "$0")/.." && pwd)/static/downloads/fabric-studio.zip"
git -C "$src" diff --quiet HEAD || { echo "commit your changes first: the zip is built from HEAD" >&2; exit 1; }
git -C "$src" archive --format=zip --prefix=fabric-studio/ -o "$out" HEAD
echo "wrote $out ($(git -C "$src" rev-parse --short HEAD), $(du -h "$out" | cut -f1))"
