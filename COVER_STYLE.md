# Cover art series style (Angel's private podcasts)

The two shows share one look: a cinematic generated scene, a darkened bottom third, a big white
Barlow Condensed Black title, a thin accent rule, and a colored subtitle. Each show gets its own
scene and accent color so they read as a set but stay distinct.

Generator: `tools/make_cover.py` (PIL). Each show names its cover file with `cover_file` in
`/workspace/x-briefing/feed_config.json` (the default is `cover.jpg`). The publisher writes that
name into `<itunes:image>` and `<image>`. Podcast apps cache artwork by URL, so **every redesign
needs a new filename** (v3, v4, ...).

## Canvas
- 3000x3000 RGB JPEG, progressive. Quality starts at 90 and steps down until the file is under 1 MB.
- Scene: a generated 1:1 cinematic image with no text, logos, real people or faces. It is
  center-cropped and resized to 3000.
- Darkened bottom third: base `#060A14` is overlaid starting at y=58% and ramps to ~92% opacity by
  y=74%, then holds to the bottom edge.

## Layout (px on the 3000 canvas)
| Element | Font | Position / size | Color |
|---|---|---|---|
| Title (caps, 1-2 words) | Barlow Condensed Black | auto-fit to 2650 wide (max 520 pt), centered at y=2350 | `#FFFFFF` |
| Rule | — | x 175 to 2825, y 2570 to 2592 (22 px) | show accent |
| Subtitle (caps, short, separated by `·`) | Barlow Condensed SemiBold | auto-fit to 2650 wide (max 200 pt), centered at y=2735 | show subtitle color |

Fonts are in `/usr/share/fonts/truetype/sand-box/google/Barlow Condensed/`
(`BarlowCondensed-Black.ttf`, `BarlowCondensed-SemiBold.ttf`).

## Per-show values
| Show | File | Title | Subtitle | Rule accent | Subtitle color | Scene |
|---|---|---|---|---|---|---|
| Daily X Briefing (`e3be17b285832ee8cf1c74da`) | `x-briefing-cover-v3.jpg` | `X BRIEFING` | `DAILY  ·  BY MR. X` | `#FF2D55` on-air red | `#FFB3C1` pale red | `tools/art/x-briefing-scene.jpg`: a night broadcast tower over a city skyline with blue signal rings and a red beacon |
| Market Analyst (`6a43a82a2a28f2f3d3a26f1e`) | `cover-v2.jpg` (owned by the Market Analyst bot) | `MARKET ANALYST` | `SPACE · AI · MADE IN AMERICA` | orange | cyan | a rocket launch over an industrial skyline at sunset |

For a new show, pick an accent that isn't red/pink or orange/cyan, such as `#00E08A` green or `#B36BFF` violet.

## Command
```
cd /workspace/pods-site
python3 tools/make_cover.py --title "X BRIEFING" --subtitle "DAILY  ·  BY MR. X" \
  --accent "#FF2D55" --subcolor "#FFB3C1" --bg tools/art/x-briefing-scene.jpg \
  --out e3be17b285832ee8cf1c74da/x-briefing-cover-v3.jpg
```
Next, set `cover_file` in the config and run `python3 /workspace/x-briefing/publish_episode.py --rebuild --show <key>`.
Before publishing, check 300 px and 150 px downscales to make sure the title is still legible.
