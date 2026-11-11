#!/usr/bin/env python3
"""Rebuild Little Steps feed.xml from episodes.json. Idempotent.

  python3 /workspace/pods-site/tools/build_little_steps_feed.py

Does not commit or publish. Stage baby-d12cd852cfe6c9ac9ae8/feed.xml
when the episode list or audio files change.

Titles and descriptions come from title + subtitle only. Do not add
personal names or private details to the feed.
"""
from __future__ import annotations

import datetime
import email.utils
import json
import sys
from pathlib import Path
from xml.sax.saxutils import escape

ROOT = Path(__file__).resolve().parents[1]
BABY = ROOT / "baby-d12cd852cfe6c9ac9ae8"
BASE = "https://angelhq-pods.github.io/pods"
TZ = datetime.timezone(datetime.timedelta(hours=-7))


def fmt_dur(sec: int) -> str:
    sec = int(sec or 0)
    h, rem = divmod(sec, 3600)
    m, s = divmod(rem, 60)
    return f"{h:02d}:{m:02d}:{s:02d}"


def main() -> None:
    data = json.loads((BABY / "episodes.json").read_text(encoding="utf-8"))
    episodes = data["episodes"]
    cover = f"{BASE}/baby-d12cd852cfe6c9ac9ae8/covers/week-0-1-v1.jpg"
    site = f"{BASE}/baby-d12cd852cfe6c9ac9ae8/"
    feed_url = site + "feed.xml"
    title = "Little Steps"
    desc = (
        "A private listen-ahead guide to a baby's first year. "
        "Weekly episodes through the twelfth week, then monthly through month twelve. "
        "Each chapter starts with a mainstream baseline, then a clearly labeled natural lens."
    )
    now = datetime.datetime.now(TZ)
    base_pub = datetime.datetime(2026, 11, 1, 6, 0, 0, tzinfo=TZ)
    items = []
    for e in episodes:
        fp = BABY / e["audio"]
        if not fp.is_file():
            sys.exit(f"missing audio {fp}")
        url = site + e["audio"]
        pub = base_pub + datetime.timedelta(days=int(e.get("order") or 0))
        eid = escape(e["id"])
        etitle = escape(e["title"])
        sub = escape((e.get("subtitle") or "").strip())
        items.append(f"""    <item>
      <title>{etitle}</title>
      <description>{sub}</description>
      <enclosure url="{escape(url)}" length="{fp.stat().st_size}" type="audio/mpeg"/>
      <guid isPermaLink="false">{eid}</guid>
      <pubDate>{email.utils.format_datetime(pub)}</pubDate>
      <link>{escape(url)}</link>
      <itunes:title>{etitle}</itunes:title>
      <itunes:summary>{sub}</itunes:summary>
      <itunes:duration>{fmt_dur(e.get("duration"))}</itunes:duration>
      <itunes:episode>{int(e.get("order") or 0) + 1}</itunes:episode>
      <itunes:episodeType>full</itunes:episodeType>
      <itunes:explicit>false</itunes:explicit>
    </item>""")
    xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>{escape(title)}</title>
    <link>{escape(site)}</link>
    <atom:link href="{escape(feed_url)}" rel="self" type="application/rss+xml"/>
    <description>{escape(desc)}</description>
    <language>en-us</language>
    <lastBuildDate>{email.utils.format_datetime(now)}</lastBuildDate>
    <itunes:author>{escape(title)}</itunes:author>
    <itunes:owner><itunes:name>{escape(title)}</itunes:name></itunes:owner>
    <itunes:image href="{escape(cover)}"/>
    <image><url>{escape(cover)}</url><title>{escape(title)}</title><link>{escape(site)}</link></image>
    <itunes:category text="Kids &amp; Family"/>
    <itunes:explicit>false</itunes:explicit>
    <itunes:type>serial</itunes:type>
    <itunes:block>Yes</itunes:block>
{chr(10).join(items)}
  </channel>
</rss>
"""
    (BABY / "feed.xml").write_text(xml, encoding="utf-8")
    print(f"wrote {BABY.relative_to(ROOT)}/feed.xml ({len(episodes)} episodes)")


if __name__ == "__main__":
    main()
