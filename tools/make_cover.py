#!/usr/bin/env python3
"""Series cover template for Angel's private podcasts (see COVER_STYLE.md).

python3 tools/make_cover.py --mark X --title BRIEFING --subtitle DAILY \
    --byline "MR. X" --accent "#1FA2FF" --bg tools/art/x-briefing-bg.jpg \
    --out e3be17b285832ee8cf1c74da/x-briefing-cover-v2.jpg
"""
import argparse, os
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance

S = 3000
G = "/usr/share/fonts/truetype/sand-box/google"
F_MARK = f"{G}/Anton/Anton-Regular.ttf"
F_TITLE = f"{G}/Anton/Anton-Regular.ttf"
F_SMALL = f"{G}/Barlow Condensed/BarlowCondensed-Black.ttf"
INK = (255, 255, 255)
BASE = (6, 10, 20)  # #060A14


def hex2rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def fit(font_path, text, max_w, max_h, start):
    sz = start
    while sz > 20:
        f = ImageFont.truetype(font_path, sz)
        l, t, r, b = f.getbbox(text)
        if r - l <= max_w and b - t <= max_h:
            return f
        sz -= 10
    return ImageFont.truetype(font_path, sz)


def centered(d, text, font, cy, fill, cx=S / 2):
    l, t, r, b = d.textbbox((0, 0), text, font=font)
    d.text((cx - (l + r) / 2, cy - (t + b) / 2), text, font=font, fill=fill)


def spaced(text, n=1):
    return (" " * n).join(text)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--mark", required=True, help="huge glyph, 1-3 chars")
    ap.add_argument("--title", required=True, help="one word, e.g. BRIEFING")
    ap.add_argument("--subtitle", default="DAILY", help="kicker in accent pill")
    ap.add_argument("--byline", default="", help="small bottom line")
    ap.add_argument("--accent", default="#1FA2FF")
    ap.add_argument("--bg", default="", help="background image path or #hex")
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    acc = hex2rgb(a.accent)

    # background
    if a.bg and os.path.exists(a.bg):
        bg = Image.open(a.bg).convert("RGB")
        w, h = bg.size
        m = min(w, h)
        bg = bg.crop(((w - m) // 2, (h - m) // 2, (w + m) // 2, (h + m) // 2)).resize((S, S), Image.LANCZOS)
        bg = ImageEnhance.Brightness(bg).enhance(0.85)
    else:
        bg = Image.new("RGB", (S, S), hex2rgb(a.bg) if a.bg.startswith("#") else BASE)
    # bottom fade for title legibility
    fade = Image.new("L", (1, S))
    for y in range(S):
        fade.putpixel((0, y), int(235 * max(0, (y - S * 0.55) / (S * 0.45)) ** 1.3))
    bg = Image.composite(Image.new("RGB", (S, S), BASE), bg, fade.resize((S, S)))
    img = bg.convert("RGBA")

    # MARK with accent glow
    mark_f = fit(F_MARK, a.mark, 2300, 1400, 1900)
    cy_mark = 1160
    glow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    centered(gd, a.mark, mark_f, cy_mark, acc + (255,))
    glow = glow.filter(ImageFilter.GaussianBlur(70))
    img = Image.alpha_composite(img, glow)
    img = Image.alpha_composite(img, glow)
    layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    # hard accent drop shadow then white face
    l, t, r, b = ld.textbbox((0, 0), a.mark, font=mark_f)
    ox, oy = S / 2 - (l + r) / 2, cy_mark - (t + b) / 2
    ld.text((ox + 40, oy + 40), a.mark, font=mark_f, fill=acc + (255,))
    ld.text((ox, oy), a.mark, font=mark_f, fill=INK + (255,))
    img = Image.alpha_composite(img, layer)

    d = ImageDraw.Draw(img)
    # TITLE
    title_f = fit(F_TITLE, a.title, 2600, 620, 760)
    centered(d, a.title, title_f, 2290, INK)
    # accent rule under title
    d.rectangle([S / 2 - 700, 2650, S / 2 + 700, 2680], fill=acc)

    # SUBTITLE pill (top-left)
    if a.subtitle:
        sf = ImageFont.truetype(F_SMALL, 230)
        txt = spaced(a.subtitle.upper())
        l, t, r, b = d.textbbox((0, 0), txt, font=sf)
        px, py, padx, pady = 170, 170, 70, 40
        d.rounded_rectangle([px, py, px + (r - l) + 2 * padx, py + (b - t) + 2 * pady], 30, fill=acc)
        d.text((px + padx - l, py + pady - t), txt, font=sf, fill=BASE)

    # BYLINE
    if a.byline:
        bf = ImageFont.truetype(F_SMALL, 150)
        centered(d, spaced(a.byline.upper()), bf, 2800, (210, 220, 235))

    # frame
    d.rectangle([60, 60, S - 61, S - 61], outline=acc, width=24)

    img = img.convert("RGB")
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    q = 90
    while True:
        img.save(a.out, "JPEG", quality=q, optimize=True, progressive=True)
        if os.path.getsize(a.out) < 1_000_000 or q <= 60:
            break
        q -= 5
    print(a.out, os.path.getsize(a.out), "bytes q", q)


if __name__ == "__main__":
    main()
