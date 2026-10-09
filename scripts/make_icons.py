"""Draw the Cartothèque icon (a card on an ink background) as PNGs, with no third-party library.

usage: python make_icons.py <repo_root>
Writes public/icons/*.png (PWA) and mobile/res/** + mobile/splash.png (Android).
"""
import math, os, struct, sys, zlib

ROOT = sys.argv[1]
INK = (0x12, 0x15, 0x1B)
PAPER = (0xF7, 0xF8, 0xFA)
COBALT = (0x34, 0x46, 0xE6)
SPLASH_BG = (0x0D, 0x10, 0x15)


def png(path, w, h, rgba):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    raw = bytearray()
    stride = w * 4
    for y in range(h):
        raw.append(0)
        raw += rgba[y * stride:(y + 1) * stride]
    def chunk(t, d):
        c = struct.pack(">I", len(d)) + t + d
        return c + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    data = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(bytes(raw), 9)) + chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(data)


def sd_rrect(px, py, cx, cy, hw, hh, r):
    qx = abs(px - cx) - (hw - r)
    qy = abs(py - cy) - (hh - r)
    return math.hypot(max(qx, 0), max(qy, 0)) + min(max(qx, qy), 0) - r


def draw(w, h, bg, shape="square", scale=1.0, cx=None, cy=None, transparent=False):
    """bg shape: square | rounded | circle | none. scale: card width as a fraction of min(w, h) / 0.42."""
    n = min(w, h)
    cx = w / 2 if cx is None else cx
    cy = h / 2 if cy is None else cy
    cw = 0.42 * n * scale / 2          # card half width
    ch = cw * 88 / 63                  # card half height
    cr = 0.05 * n * scale
    inset = 0.035 * n * scale
    win_top = cy - ch + 0.06 * n * scale
    win_h = 0.27 * n * scale
    win = (cx, win_top + win_h / 2, cw - inset, win_h / 2, 0.02 * n * scale)
    line_h = 0.028 * n * scale
    l1 = (cx - cw + inset + 0.13 * n * scale, win_top + win_h + 0.06 * n * scale, 0.13 * n * scale, line_h / 2, line_h / 2)
    l2 = (cx - cw + inset + 0.075 * n * scale, l1[1] + 0.055 * n * scale, 0.075 * n * scale, line_h / 2, line_h / 2)
    buf = bytearray(w * h * 4)
    x0, x1 = int(max(0, cx - cw - 2)), int(min(w, cx + cw + 2))
    y0, y1 = int(max(0, cy - ch - 2)), int(min(h, cy + ch + 2))
    for y in range(h):
        py = y + 0.5
        for x in range(w):
            px = x + 0.5
            # background coverage
            if shape == "square":
                a_bg = 1.0
            elif shape == "rounded":
                a_bg = min(1.0, max(0.0, 0.5 - sd_rrect(px, py, w / 2, h / 2, w / 2, h / 2, 0.2 * n)))
            elif shape == "circle":
                a_bg = min(1.0, max(0.0, 0.5 - (math.hypot(px - w / 2, py - h / 2) - n / 2)))
            else:
                a_bg = 0.0
            r, g, b = bg
            a = a_bg
            if x0 <= x < x1 and y0 <= y < y1:
                a_card = min(1.0, max(0.0, 0.5 - sd_rrect(px, py, cx, cy, cw, ch, cr)))
                if a_card > 0:
                    col = PAPER
                    a_win = min(1.0, max(0.0, 0.5 - sd_rrect(px, py, *win)))
                    a_l = max(min(1.0, max(0.0, 0.5 - sd_rrect(px, py, *l1))), min(1.0, max(0.0, 0.5 - sd_rrect(px, py, *l2))))
                    cr_, cg_, cb_ = col
                    cr_ = cr_ * (1 - a_win) + COBALT[0] * a_win
                    cg_ = cg_ * (1 - a_win) + COBALT[1] * a_win
                    cb_ = cb_ * (1 - a_win) + COBALT[2] * a_win
                    cr_ = cr_ * (1 - a_l) + INK[0] * a_l
                    cg_ = cg_ * (1 - a_l) + INK[1] * a_l
                    cb_ = cb_ * (1 - a_l) + INK[2] * a_l
                    out_a = a_card + a * (1 - a_card)
                    if out_a > 0:
                        r = (cr_ * a_card + r * a * (1 - a_card)) / out_a
                        g = (cg_ * a_card + g * a * (1 - a_card)) / out_a
                        b = (cb_ * a_card + b * a * (1 - a_card)) / out_a
                    a = out_a
            i = (y * w + x) * 4
            buf[i] = int(r + 0.5)
            buf[i + 1] = int(g + 0.5)
            buf[i + 2] = int(b + 0.5)
            buf[i + 3] = int(a * 255 + 0.5)
    return buf


pub = os.path.join(ROOT, "public", "icons")
for size in (180, 192, 512):
    png(os.path.join(pub, f"icon-{size}.png"), size, size, draw(size, size, INK, "square"))
png(os.path.join(pub, "maskable-512.png"), 512, 512, draw(512, 512, INK, "square", scale=0.85))

res = os.path.join(ROOT, "mobile", "res")
for dens, px in (("mdpi", 48), ("hdpi", 72), ("xhdpi", 96), ("xxhdpi", 144), ("xxxhdpi", 192)):
    png(os.path.join(res, f"mipmap-{dens}", "ic_launcher.png"), px, px, draw(px, px, INK, "rounded"))
    png(os.path.join(res, f"mipmap-{dens}", "ic_launcher_round.png"), px, px, draw(px, px, INK, "circle"))
    fg = round(px * 108 / 48)
    png(os.path.join(res, f"mipmap-{dens}", "ic_launcher_foreground.png"), fg, fg, draw(fg, fg, INK, "none", scale=0.62))
png(os.path.join(ROOT, "mobile", "splash.png"), 960, 1600, draw(960, 1600, SPLASH_BG, "square", scale=0.55))
print("icons written")
