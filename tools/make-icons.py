"""Draws Pitkit's home-screen icon (pink folder with a list) into docs/. Run: python3 tools/make-icons.py"""
from PIL import Image, ImageDraw
import os

OUT = os.path.join(os.path.dirname(__file__), "..", "docs")
S, k = 1024, 4                       # final size, supersampling
BG, BACK, FRONT, WHITE = "#fefefe", "#d77e9e", "#f5abc4", "#ffffff"

im = Image.new("RGB", (S * k, S * k), BG)
d = ImageDraw.Draw(im)
R = lambda x0, y0, x1, y1, r, c: d.rounded_rectangle([x0 * k, y0 * k, x1 * k, y1 * k], r * k, fill=c)
E = lambda x0, y0, x1, y1, c: d.ellipse([x0 * k, y0 * k, x1 * k, y1 * k], fill=c)
P = lambda pts, c: d.polygon([(x * k, y * k) for x, y in pts], fill=c)

L, Rt, T, B = 132, 892, 230, 800     # folder bounds
# back panel with the tab on the left and a slanted edge
R(L, T, L + 270, T + 160, 40, BACK)
P([(L + 230, T), (L + 270, T), (L + 330, T + 52), (L + 230, T + 52)], BACK)
R(L, T + 52, Rt, T + 200, 46, BACK)
# front panel
R(L, T + 110, Rt, B, 54, FRONT)
# list: dots and lines
for y in (T + 270, T + 370, T + 470):
    E(L + 92, y - 33, L + 158, y + 33, WHITE)
    R(L + 205, y - 22, L + 600, y + 22, 22, WHITE)

im = im.resize((S, S), Image.LANCZOS)
im.save(os.path.join(os.path.dirname(__file__), "icon-source.png"))
# versioned names so phones never reuse a cached older icon
VER = "v2"
for old in [f for f in os.listdir(OUT) if f.startswith("icon-") and f.endswith(".png")]:
    os.remove(os.path.join(OUT, old))
for size in (1024, 512, 192, 180, 167, 152):
    im.resize((size, size), Image.LANCZOS).save(os.path.join(OUT, f"icon-{VER}-{size}.png"), optimize=True)
print("icons written")
