#!/usr/bin/env python3
"""Flag screenshots that may no longer match the code they show.
    scripts/captures-fresh.py /path/to/fabric_studio_core
Reads docubot/09-mcp-server/capture-sources.tsv. A screenshot is STALE when fabric_studio_core changed one of its
paths after the picture was taken (its last commit, or its file time when it is uncommitted) or last checked.
Every capture marked in a page must have a row. Exit 1 when anything is stale or unmapped."""
import re
import subprocess
import sys
from datetime import datetime
from pathlib import Path

root = Path(__file__).resolve().parent.parent
chapter = root / "content" / "09-mcp-server"
core = Path(sys.argv[1] if len(sys.argv) > 1 else sys.exit(__doc__)).expanduser()


def git(repo: Path, *args: str) -> str:
    return subprocess.run(["git", "-C", str(repo), *args], capture_output=True, text=True, check=True).stdout.strip()


def taken(png: Path) -> int:
    rel = str(png.relative_to(root))
    if git(root, "status", "--porcelain", "--", rel):   # new or re-captured and not committed yet: the file's own time
        return int(png.stat().st_mtime)
    return int(git(root, "log", "-1", "--format=%ct", "--", rel) or png.stat().st_mtime)


pngs = {p.stem: p for p in chapter.rglob("fsm09-*.png")}
marked = sorted({m for f in chapter.rglob("*.md") for m in re.findall(r"<!-- capture: (\S+) -->", f.read_text())})
UNITS = {"mcp-tools": ["src/fabric_studio/mcp", ":(exclude)src/fabric_studio/mcp/cli.py",
                       ":(exclude)src/fabric_studio/mcp/connect.py", ":(exclude)src/fabric_studio/mcp/entry.py",
                       ":(exclude)src/fabric_studio/mcp/skill.py"]}


def latest(units: list[str]) -> int:
    """The newest commit in core touching any of these paths (a unit such as mcp-tools is one set of pathspecs)."""
    specs = [s for u in units for s in UNITS.get(u, [u])]
    return int(git(core, "log", "-1", "--format=%ct", "--", *specs) or 0) if specs else 0


rows = {}
for line in (root / "docubot" / "09-mcp-server" / "capture-sources.tsv").read_text().splitlines():
    if line.strip() and not line.startswith("#"):
        cid, checked, paths = (line.split("\t") + ["", ""])[:3]
        rows[cid] = (checked, [] if paths.strip() == "-" else paths.split())

bad = 0
print(f"{'capture':<36} {'taken':<11} {'checked':<11} verdict")
for cid in marked:
    if cid not in rows or cid not in pngs:
        print(f"{cid:<36} {'':<11} {'':<11} UNMAPPED ({'no row in capture-sources.tsv' if cid not in rows else 'no png'})")
        bad += 1
        continue
    checked, paths = rows[cid]
    t = taken(pngs[cid])
    c = int(datetime.strptime(checked, "%Y-%m-%dT%H:%M").timestamp()) if checked != "-" else 0
    newest = latest(paths)
    base = max(t, c)
    stale = newest > base
    bad += stale
    when = lambda s: datetime.fromtimestamp(s).strftime("%b %d") if s else "-"
    why = ""
    if stale:
        changed = [p for p in paths if latest([p]) > base]
        why = f" (core changed {', '.join(changed)} on {when(newest)})"
    print(f"{cid:<36} {when(t):<11} {when(c):<11} {'STALE' + why if stale else 'ok'}")
print(f"\n{bad} need attention" if bad else "\nall current")
sys.exit(1 if bad else 0)
