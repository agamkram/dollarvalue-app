#!/usr/bin/env python3
"""DollarValue icons — dark field, gold dollar as a yardstick."""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
BG = (7, 9, 12)
GOLD = (230, 193, 90)
GREEN = (45, 122, 84)
PANEL = (18, 22, 28)


def _font(size: int) -> ImageFont.ImageFont:
    for p in (
        "/System/Library/Fonts/Supplemental/Georgia Bold.ttf",
        "/System/Library/Fonts/Supplemental/Times New Roman Bold.ttf",
        "/Library/Fonts/Georgia Bold.ttf",
    ):
        try:
            return ImageFont.truetype(p, size)
        except OSError:
            continue
    return ImageFont.load_default()


def build_icon(size: int, maskable: bool = False) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), (*BG, 255))
    draw = ImageDraw.Draw(canvas)
    pad = int(size * (0.18 if maskable else 0.10))
    draw.rounded_rectangle(
        (pad, pad, size - pad, size - pad),
        radius=int(size * 0.14),
        fill=(*PANEL, 255),
        outline=(255, 255, 255, 28),
        width=max(1, size // 128),
    )

    # vertical gold rule (yardstick)
    x0 = int(size * 0.30)
    y0 = int(size * 0.22)
    y1 = int(size * 0.78)
    w = max(2, size // 42)
    draw.rounded_rectangle((x0, y0, x0 + w, y1), radius=w // 2, fill=(*GOLD, 255))
    for i, t in enumerate((0.0, 0.25, 0.5, 0.75, 1.0)):
        yy = y0 + int((y1 - y0) * t)
        tick = int(size * (0.07 if i in (0, 4) else 0.045))
        draw.rectangle((x0 + w, yy - max(1, size // 180), x0 + w + tick, yy + max(1, size // 180)), fill=(*GOLD, 230))

    f = _font(int(size * 0.42))
    s = "$"
    bbox = draw.textbbox((0, 0), s, font=f)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    tx = int(size * 0.46)
    ty = int(size * 0.50 - th / 2 - bbox[1] * 0.15)
    # green glow
    glow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.text((tx, ty), s, font=f, fill=(*GREEN, 90))
    canvas = Image.alpha_composite(canvas, glow.filter(ImageFilter.GaussianBlur(radius=size // 16)))
    draw = ImageDraw.Draw(canvas)
    draw.text((tx, ty), s, font=f, fill=(*GOLD, 255))
    return canvas


def save_icons() -> None:
    icon_512 = build_icon(512).convert("RGB")
    icon_512.save(ROOT / "icon-512.png", "PNG")
    icon_512.resize((192, 192), Image.Resampling.LANCZOS).save(ROOT / "icon-192.png", "PNG")
    icon_512.resize((180, 180), Image.Resampling.LANCZOS).save(
        ROOT / "apple-touch-icon.png", "PNG"
    )
    icon_512.resize((32, 32), Image.Resampling.LANCZOS).save(ROOT / "favicon-32.png", "PNG")
    build_icon(512, maskable=True).convert("RGB").save(ROOT / "icon-maskable-512.png", "PNG")
    print("Wrote icons in", ROOT)


if __name__ == "__main__":
    save_icons()
