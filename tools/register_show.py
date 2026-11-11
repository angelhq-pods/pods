#!/usr/bin/env python3
"""Idempotent Radio catalog updater.

Each show's publish step can call this to register or refresh its entry.
Existing fields you do not pass are left as-is. Aliases are merged (union)
unless --replace-aliases is set. Safe to run on every publish.

  python3 /workspace/pods-site/tools/register_show.py \
      --id ventanita \
      --name "La Ventanita" \
      --feed https://angelhq-pods.github.io/pods/ventanita-…/feed.xml \
      --type dated \
      --format rss \
      --artwork https://angelhq-pods.github.io/pods/ventanita-…/cover-v1.jpg \
      --alias ventanita --alias "la ventanita" --alias "the cuba show"

The catalog lives in the unlisted Radio folder. Its relative path is stored
in tools/radio-catalog.path. If you also commit catalog.json, stage that file
alongside the show folder:

  git add -A -- "$SHOW_DIR" "$(cat /workspace/pods-site/tools/radio-catalog.path)"

Do not add this hook to the La Ventanita (cuba-pod) pipeline unless asked.
X Briefing and Market Analyst share /workspace/x-briefing/publish_episode.py;
this helper is not wired in yet, to keep that publish path unchanged.
Little Steps has no RSS publish step; point --format episodes-json at
episodes.json if you add a hook later.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATH_FILE = Path(__file__).resolve().parent / "radio-catalog.path"


def catalog_path() -> Path:
    if PATH_FILE.exists():
        rel = PATH_FILE.read_text(encoding="utf-8").strip()
        p = ROOT / rel
        if p.is_file():
            return p
    matches = sorted(ROOT.glob("radio-*/catalog.json"))
    if len(matches) == 1:
        return matches[0]
    if not matches:
        sys.exit("radio catalog.json not found")
    sys.exit("multiple radio-*/catalog.json files; set tools/radio-catalog.path")


def main() -> None:
    ap = argparse.ArgumentParser(description="Register or update a Radio catalog entry")
    ap.add_argument("--id", required=True)
    ap.add_argument("--name")
    ap.add_argument("--feed")
    ap.add_argument("--type", choices=["dated", "week-month"])
    ap.add_argument("--format", dest="fmt", choices=["rss", "episodes-json"])
    ap.add_argument("--artwork")
    ap.add_argument("--accent")
    ap.add_argument("--alias", action="append", default=[], dest="aliases")
    ap.add_argument("--replace-aliases", action="store_true")
    args = ap.parse_args()

    path = catalog_path()
    data = json.loads(path.read_text(encoding="utf-8"))
    shows = data.setdefault("shows", [])
    entry = next((s for s in shows if s.get("id") == args.id), None)
    created = entry is None
    if created:
        entry = {"id": args.id, "aliases": []}
        shows.append(entry)

    for key, val in (
        ("name", args.name),
        ("feed", args.feed),
        ("type", args.type),
        ("format", args.fmt),
        ("artwork", args.artwork),
        ("accent", args.accent),
    ):
        if val:
            entry[key] = val

    if args.replace_aliases:
        entry["aliases"] = list(args.aliases)
    elif args.aliases:
        seen = {a.strip().lower() for a in entry.get("aliases", [])}
        aliases = list(entry.get("aliases", []))
        for a in args.aliases:
            if a.strip().lower() not in seen:
                aliases.append(a)
                seen.add(a.strip().lower())
        entry["aliases"] = aliases

    if created and not entry.get("name"):
        sys.exit("new shows need --name")
    if created and not entry.get("feed"):
        sys.exit("new shows need --feed")
    entry.setdefault("type", "dated")
    entry.setdefault("format", "rss")
    entry.setdefault("aliases", [])

    path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    print(("created" if created else "updated") + f" {args.id} in {path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
