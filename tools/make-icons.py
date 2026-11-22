"""Draws Pitkit's home-screen icons into docs/. Run: python3 tools/make-icons.py"""
from PIL import Image, ImageDraw, ImageFont
import os, math

OUT = os.path.join(os.path.dirname(__file__), "..", "docs")
S = 1024

img = Image.new("RGB", (S, S), "#fbf6e8")
d = ImageDraw.Draw(img)
# lined paper + red margin
for y in range(140, S, 92):
    d.line([(0, y), (S, y)], fill="#d3dff1", width=6)
d.line([(S - 150, 0), (S - 150, S)], fill="#f1a7a3", width=8)

# tilted yellow sticky note
note = Image.new("RGBA", (600, 600), (0, 0, 0, 0))
nd = ImageDraw.Draw(note)
nd.rectangle([20, 34, 580, 594], fill=(0, 0, 0, 30))  # soft shadow
nd.rectangle([0, 0, 560, 560], fill="#fff1a6")
nd.rectangle([0, 0, 560, 70], fill="#ffe873")
for i, y in enumerate((180, 270, 360)):
    nd.line([(70, y), (490 - i * 90, y)], fill="#2c3a63", width=16)
note = note.rotate(-6, resample=Image.BICUBIC, expand=True)
img.paste(note, ((S - note.width) // 2 - 20, (S - note.height) // 2 + 10), note)

# pink heart
def heart(cx, cy, r):
    pts = []
    for k in range(200):
        t = 2 * math.pi * k / 200
        x = 16 * math.sin(t) ** 3
        y = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
        pts.append((cx + x * r, cy - y * r))
    return pts
d.polygon(heart(700, 690, 11.5), fill="#ffffff")
d.polygon(heart(700, 690, 10), fill="#ee5c9c")

for size, name in ((512, "icon-512.png"), (192, "icon-192.png"), (180, "icon-180.png")):
    img.resize((size, size), Image.LANCZOS).save(os.path.join(OUT, name))
print("icons written")
