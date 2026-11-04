#!/bin/sh
# pre-push check: the download zip must be built from the fabric-studio repository's current commit.
#   install once:  ln -s ../../scripts/zip-is-current.sh .git/hooks/pre-push
#   where the repository is: git config fabricstudio.corePath /path/to/fabric_studio_core
# git archive writes the commit id into the zip's comment, so that is what is compared. When the repository has
# moved on, the zip is rebuilt and committed here, and the push stops so the next push carries it.
set -eu
root="$(git rev-parse --show-toplevel)"
zip="$root/content/09-mcp-server/01-install/fabric-studio.zip"
src="$(git config --get fabricstudio.corePath || true)"
if [ -z "$src" ] || ! git -C "$src" rev-parse HEAD >/dev/null 2>&1; then
    echo "pre-push: fabricstudio.corePath is not set to the fabric-studio repository; zip not checked" >&2
    exit 0
fi
head="$(git -C "$src" rev-parse HEAD)"
built="$(unzip -z "$zip" 2>/dev/null | tail -1 || true)"
[ "$built" = "$head" ] && exit 0
git -C "$src" diff --quiet HEAD || echo "pre-push: note: $src has uncommitted changes; the zip uses its last commit" >&2
ALLOW_DIRTY=1 "$root/scripts/build-mcp-zip.sh" "$src"
git -C "$root" add content/09-mcp-server/01-install/fabric-studio.zip
git -C "$root" commit -q -m "Download zip rebuilt from fabric-studio $(git -C "$src" rev-parse --short HEAD)" -- content/09-mcp-server/01-install/fabric-studio.zip
echo "pre-push: the zip was out of date, so it was rebuilt and committed ($(git -C "$root" rev-parse --short HEAD)). Push again." >&2
exit 1
