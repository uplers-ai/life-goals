"""Builds the "top 1%" celebration GIFs posted to Google Chat when someone adds a quest.

One GIF per category, written to gifs/<cat>.gif and served by GitHub Pages.
Run from the repo root: python3 tools/make_gifs.py
"""
import math
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

W, H = 640, 320
FRAMES = 40
FRAME_MS = 60
OUT = Path(__file__).resolve().parent.parent / "gifs"

INK = (25, 27, 24)
WHITE = (255, 255, 255)
GOLD = (242, 192, 78)

# Category colours match the board's dark theme.
CATS = {
    "health": ("HEALTH QUEST", (108, 199, 150)),
    "exp": ("EXPERIENCE QUEST", (120, 168, 227)),
    "learn": ("LEARN QUEST", (181, 147, 230)),
    "stretch": ("STRETCH QUEST", (231, 165, 92)),
}

FONT_BIG = "/System/Library/Fonts/Supplemental/Arial Black.ttf"
FONT_SMALL = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"


def ease_out_back(t):
    c1, c3 = 1.70158, 2.70158
    return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2


def text_image(text, font, fill):
    box = font.getbbox(text)
    img = Image.new("RGBA", (box[2] - box[0] + 8, box[3] - box[1] + 8), (0, 0, 0, 0))
    ImageDraw.Draw(img).text((4 - box[0], 4 - box[1]), text, font=font, fill=fill)
    return img


def confetti(seed, colours):
    rnd = random.Random(seed)
    return [
        {
            "x": rnd.uniform(0, W),
            "y": rnd.uniform(-H, 0),
            "vy": rnd.uniform(4, 9),
            "vx": rnd.uniform(-1.2, 1.2),
            "w": rnd.randint(5, 9),
            "h": rnd.randint(9, 15),
            "spin": rnd.uniform(0.15, 0.4),
            "phase": rnd.uniform(0, math.tau),
            "colour": rnd.choice(colours),
        }
        for _ in range(80)
    ]


def build(cat):
    label, accent = CATS[cat]
    big = text_image("TOP 1%", ImageFont.truetype(FONT_BIG, 104), WHITE)
    sub = text_image("You wrote it down. Now go do it.", ImageFont.truetype(FONT_SMALL, 24), WHITE)
    chip_font = ImageFont.truetype(FONT_SMALL, 15)
    pieces = confetti(cat, [accent, GOLD, WHITE, accent])

    frames = []
    for f in range(FRAMES):
        img = Image.new("RGB", (W, H), INK)
        d = ImageDraw.Draw(img)

        # soft accent glow behind the headline
        for r in range(150, 0, -10):
            k = (150 - r) / 150 * 0.22
            col = tuple(int(INK[i] + (accent[i] - INK[i]) * k) for i in range(3))
            d.ellipse((W / 2 - r * 1.8, 150 - r, W / 2 + r * 1.8, 150 + r), fill=col)

        # confetti falls the whole time and wraps, so the loop has no seam
        for p in pieces:
            y = (p["y"] + p["vy"] * f * (H * 2 / (p["vy"] * FRAMES))) % (H + 40) - 20
            x = p["x"] + p["vx"] * f + 6 * math.sin(p["phase"] + f * 0.3)
            squash = abs(math.cos(p["phase"] + f * p["spin"]))
            w = max(1, p["w"] * squash)
            d.rectangle((x - w / 2, y - p["h"] / 2, x + w / 2, y + p["h"] / 2), fill=p["colour"])

        # category chip
        cw = chip_font.getlength(label) + 28
        d.rounded_rectangle((W / 2 - cw / 2, 26, W / 2 + cw / 2, 56), radius=15, fill=accent)
        d.text((W / 2, 41), label, font=chip_font, fill=INK, anchor="mm")

        # headline pops in, then holds
        t = min(1, f / 9)
        s = max(0.05, ease_out_back(t))
        bw, bh = int(big.width * s), int(big.height * s)
        if bw > 0 and bh > 0:
            b = big.resize((bw, bh), Image.LANCZOS)
            img.paste(b, (int(W / 2 - bw / 2), int(150 - bh / 2)), b)

        # subline fades in after the pop
        a = min(1, max(0, (f - 10) / 6))
        if a > 0:
            sb = sub.copy()
            sb.putalpha(sb.getchannel("A").point(lambda v: int(v * a)))
            img.paste(sb, (int(W / 2 - sb.width / 2), 236), sb)

        frames.append(img.quantize(colors=96, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE))

    OUT.mkdir(exist_ok=True)
    path = OUT / f"{cat}.gif"
    frames[0].save(path, save_all=True, append_images=frames[1:], duration=FRAME_MS, loop=0, optimize=True, disposal=1)
    return path


if __name__ == "__main__":
    for cat in CATS:
        p = build(cat)
        print(f"{p.name}: {p.stat().st_size // 1024} KB")
