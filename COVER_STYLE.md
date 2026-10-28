# Cover art series style (Angel's private podcasts)

Generator: `tools/make_cover.py`. Each show sets its own cover filename with `cover_file` in
`/workspace/x-briefing/feed_config.json`. The publisher writes that name into `itunes:image`
and `<image>`. Apps cache artwork by URL, so **every redesign gets a new filename** (v3, v4, ...).

## Canvas
- 3000x3000 RGB JPEG, progressive. Quality starts at 90 and steps down until the file is under 1 MB.
- Background: a generated abstract image (no text, no logos, no faces), center-cropped and darkened to 85% brightness.
  The bottom 45% fades to base `#060A14` so the title reads cleanly. With no image, the background is solid `#060A14`.

## Layout (px on the 3000 canvas)
| Element | Font | Position / size | Color |
|---|---|---|---|
| Frame | — | 24 px stroke, inset 60 px | accent |
| Kicker pill (`--subtitle`, letter-spaced caps) | Barlow Condensed Black 230 | top-left at (170,170), 70/40 padding, 30 radius | pill = accent, text = `#060A14` |
| Mark (`--mark`, 1-3 chars) | Anton 400 (Regular) | auto-fit within 2300x1400, centered at y=1160 | `#FFFFFF` face, accent hard shadow offset +40/+40, accent glow (blur 70, x2) |
| Title (`--title`, one word) | Anton | auto-fit within 2600x620, centered at y=2290 | `#FFFFFF` |
| Rule | — | 1400x30 bar centered, y=2650-2680 | accent |
| Byline (`--byline`, letter-spaced caps) | Barlow Condensed Black 150 | centered at y=2800 | `#D2DCEB` |

Fonts: `/usr/share/fonts/truetype/sand-box/google/Anton/Anton-Regular.ttf`,
`/usr/share/fonts/truetype/sand-box/google/Barlow Condensed/BarlowCondensed-Black.ttf`.

## Per-show values
| Show | mark | title | subtitle | byline | accent | bg |
|---|---|---|---|---|---|---|
| Daily X Briefing (`e3be17b285832ee8cf1c74da`) | `X` | `BRIEFING` | `DAILY` | `MR. X` | `#1FA2FF` electric blue | `tools/art/x-briefing-bg.jpg` (radiating signal rings) |
| Market Analyst | (its choice; a different accent such as `#00E08A` green or `#FFB020` amber keeps the series distinct) | | | | | |

## Command
```
cd /workspace/pods-site
python3 tools/make_cover.py --mark X --title BRIEFING --subtitle DAILY --byline "MR. X" \
  --accent "#1FA2FF" --bg tools/art/x-briefing-bg.jpg \
  --out e3be17b285832ee8cf1c74da/x-briefing-cover-v2.jpg
```
Then set `cover_file` in the config and run `python3 /workspace/x-briefing/publish_episode.py --rebuild --show <key>`.
Always check a 300 px and a 150 px downscale for legibility.
