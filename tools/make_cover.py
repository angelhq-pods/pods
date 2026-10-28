#!/usr/bin/env python3
"""Series cover template for Angel's private podcasts (see COVER_STYLE.md).

Cinematic scene, darkened bottom third, big white Barlow Condensed Black title,
accent rule, colored subtitle.

python3 tools/make_cover.py --title "X BRIEFING" --subtitle "DAILY  ·  BY MR. X" \
    --accent "#FF2D55" --subcolor "#FFB3C1" --bg tools/art/x-briefing-scene.jpg \
    --out e3be17b285832ee8cf1c74da/x-briefing-cover-v3.jpg
"""
import argparse, os
from PIL import Image, ImageDraw, ImageFont

S = 3000
G = "/usr/share/fonts/truetype/sand-box/google/Barlow Condensed"
F_TITLE = f"{G}/BarlowCondensed-Black.ttf"
F_SUB = f"{G}/BarlowCondensed-SemiBold.ttf"
BASE = (6, 10, 20)  # #060A14


def hex2rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def fit(path, text, max_w, start):
    sz = start
    while sz > 40:
        f = ImageFont.truetype(path, sz)
        l, t, r, b = f.getbbox(text)
        if r - l <= max_w:
            return f
        sz -= 8
    return ImageFont.truetype(path, sz)


def centered(d, text, font, cy, fill):
    l, t, r, b = d.textbbox((0, 0), text, font=font)
    d.text((S / 2 - (l + r) / 2, cy - (t + b) / 2), text, font=font, fill=fill)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--title", required=True, help="short, caps, 1-2 words")
    ap.add_argument("--subtitle", default="")
    ap.add_argument("--accent", default="#FF2D55", help="rule color")
    ap.add_argument("--subcolor", default="", help="subtitle color (defaults to accent)")
    ap.add_argument("--bg", default="", help="scene image path, or #hex for a flat background")
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    acc = hex2rgb(a.accent)
    sub = hex2rgb(a.subcolor) if a.subcolor else acc

    if a.bg and os.path.exists(a.bg):
        bg = Image.open(a.bg).convert("RGB")
        w, h = bg.size
        m = min(w, h)
        bg = bg.crop(((w - m) // 2, (h - m) // 2, (w + m) // 2, (h + m) // 2)).resize((S, S), Image.LANCZOS)
    else:
        bg = Image.new("RGB", (S, S), hex2rgb(a.bg) if a.bg.startswith("#") else BASE)

    # darkened bottom third: ramps from 0 at y=58% to ~92% opacity by y=74%, holds to the bottom
    mask = Image.new("L", (1, S))
    for y in range(S):
        t = (y - 0.58 * S) / (0.16 * S)
        mask.putpixel((0, y), int(235 * min(1, max(0, t)) ** 1.2))
    img = Image.composite(Image.new("RGB", (S, S), BASE), bg, mask.resize((S, S)))
    d = ImageDraw.Draw(img)

    title_f = fit(F_TITLE, a.title.upper(), 2650, 520)
    # soft dark shadow for the title
    l, t, r, b = d.textbbox((0, 0), a.title.upper(), font=title_f)
    centered(d, a.title.upper(), title_f, 2350, (255, 255, 255))
    d.rectangle([175, 2570, S - 175, 2592], fill=acc)
    if a.subtitle:
        sf = fit(F_SUB, a.subtitle.upper(), 2650, 200)
        centered(d, a.subtitle.upper(), sf, 2735, sub)

    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    q = 90
    while True:
        img.save(a.out, "JPEG", quality=q, optimize=True, progressive=True)
        if os.path.getsize(a.out) < 1_000_000 or q <= 60:
            break
        q -= 5
    print(a.out, img.size, os.path.getsize(a.out), "bytes q", q)


if __name__ == "__main__":
    main()
