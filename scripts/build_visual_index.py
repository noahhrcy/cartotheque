# Cartothèque — © 2026 Noah Henricy, Yoni Safran et Tibo Amettler. Tous droits réservés (voir LICENSE).
"""Build the visual index used by the free on-device scanner.

usage: python build_visual_index.py <public_dir> <image_cache_dir>

For every card that has an official image, the artwork box is reduced to three small descriptors:
  - a 63-bit perceptual hash (DCT of a 32x32 grey image),
  - a 64-bit difference hash (9x8 grey image),
  - a 5x5 colour grid (75 signed bytes), normalised per channel so exposure and colour casts cancel out.
The phone computes exactly the same descriptors (src/visual.js) and looks for the nearest card.

Output: public/data/visual.bin   header "CVI2", uint32 count, then per card: 8 bytes pHash, 8 bytes dHash, 75 bytes colour grid (int8)
        public/data/visual.json  card ids, in the same order as the records
Incremental: records of cards already indexed are kept, so a daily run only downloads and computes new cards.
"""
import io, json, os, struct, sys, time, urllib.request
from concurrent.futures import ThreadPoolExecutor

import numpy as np
from PIL import Image

PUB, CACHE = sys.argv[1], sys.argv[2]
os.makedirs(CACHE, exist_ok=True)

CW, CH = 252, 352                                   # canonical card size (63:88)
ART = (20, 35, 232, 183)                            # artwork box in canonical pixels (x0, y0, x1, y1)
GRID = 5
RECORD = 8 + 8 + GRID * GRID * 3


_WEIGHTS = {}


def area_weights(n_in, n_out):
    """Exact box-filter resampling matrix (n_out x n_in): each output pixel averages the input pixels it covers."""
    if (n_in, n_out) in _WEIGHTS:
        return _WEIGHTS[(n_in, n_out)]
    w = np.zeros((n_out, n_in))
    scale = n_in / n_out
    for o in range(n_out):
        a, b = o * scale, (o + 1) * scale
        i = int(a)
        while i < b and i < n_in:
            w[o, i] = min(b, i + 1) - max(a, i)
            i += 1
        w[o] /= w[o].sum()
    _WEIGHTS[(n_in, n_out)] = w
    return w


def resize(a, w_out, h_out):
    """a: H x W x C float array -> h_out x w_out x C, box filter (identical to src/visual.js)."""
    wy = area_weights(a.shape[0], h_out)
    wx = area_weights(a.shape[1], w_out)
    rows = np.tensordot(wy, a, axes=(1, 0))                      # oh x W x C
    return np.tensordot(rows, wx, axes=(1, 1)).transpose(0, 2, 1)  # oh x ow x C


def dct_matrix(n):
    k = np.arange(n)[:, None]
    i = np.arange(n)[None, :]
    m = np.cos(np.pi * (i + 0.5) * k / n) * np.sqrt(2 / n)
    m[0] /= np.sqrt(2)
    return m


D32 = dct_matrix(32)


def grey(a):
    return 0.299 * a[..., 0] + 0.587 * a[..., 1] + 0.114 * a[..., 2]


def descriptors(card):
    """card: CH x CW x 3 float array (0..255). Returns (phash bytes, dhash bytes, colour int8 array)."""
    x0, y0, x1, y1 = ART
    art = card[y0:y1, x0:x1]
    g32 = grey(resize(art, 32, 32))
    d = D32 @ g32 @ D32.T
    low = d[:8, :8].flatten()[1:]
    ph = np.append(low > np.median(low), False)
    g98 = grey(resize(art, 9, 8))
    dh = (g98[:, 1:] > g98[:, :-1]).flatten()
    c = resize(art, GRID, GRID).reshape(-1, 3)
    c = (c - c.mean(0)) / (c.std(0) + 1e-6)
    v = c.flatten()
    q = np.clip(np.round(v * 127 / max(np.abs(v).max(), 1e-6)), -127, 127).astype(np.int8)
    return np.packbits(ph).tobytes(), np.packbits(dh).tobytes(), q


def load_card(data):
    img = Image.open(io.BytesIO(data))
    if img.mode in ("RGBA", "LA", "P"):
        img = img.convert("RGBA")
        bg = Image.new("RGBA", img.size, (255, 255, 255, 255))
        img = Image.alpha_composite(bg, img)
    img = img.convert("RGB").resize((CW, CH), Image.BILINEAR)
    return np.asarray(img, dtype=np.float64)


cat = json.load(open(os.path.join(PUB, "data", "catalogue.json"), encoding="utf-8"))
sets = cat["sets"]
bin_path = os.path.join(PUB, "data", "visual.bin")
ids_path = os.path.join(PUB, "data", "visual.json")
known = {}
if os.path.exists(bin_path) and os.path.exists(ids_path):
    blob = open(bin_path, "rb").read()
    old_ids = json.load(open(ids_path, encoding="utf-8"))
    if blob[:4] == b"CVI2" and struct.unpack("<I", blob[4:8])[0] == len(old_ids):
        for i, cid in enumerate(old_ids):
            known[cid] = blob[8 + i * RECORD: 8 + (i + 1) * RECORD]

jobs = []
for row in cat["cards"]:
    if not row[10] or row[0] in known:
        continue
    s = sets[row[1]]
    base = row[10] if isinstance(row[10], str) else f"https://assets.tcgdex.net/fr/{s['s']}/{s['id']}/{row[2]}"
    jobs.append((row[0], base + "/low.webp"))


def fetch(job):
    cid, url = job
    path = os.path.join(CACHE, cid.replace("/", "_") + ".webp")
    if os.path.exists(path) and os.path.getsize(path) > 0:
        return cid, open(path, "rb").read()
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "cartotheque-visual-index/1.0"})
            with urllib.request.urlopen(req, timeout=30) as r:
                data = r.read()
            open(path, "wb").write(data)
            return cid, data
        except Exception:
            time.sleep(1 + attempt)
    return cid, None


t0 = time.time()
fresh = {}
failed = 0
with ThreadPoolExecutor(8) as ex:
    for n, (cid, data) in enumerate(ex.map(fetch, jobs), 1):
        if data is None:
            failed += 1
            continue
        try:
            ph, dh, col = descriptors(load_card(data))
        except Exception:
            failed += 1
            continue
        fresh[cid] = ph + dh + col.tobytes()
        if n % 2000 == 0:
            print(f"  {n}/{len(jobs)} ({time.time() - t0:.0f} s)", flush=True)

order = [row[0] for row in cat["cards"] if row[0] in known or row[0] in fresh]
with open(bin_path, "wb") as f:
    f.write(b"CVI2" + struct.pack("<I", len(order)))
    for cid in order:
        rec = fresh.get(cid) or known[cid]
        assert len(rec) == RECORD
        f.write(rec)
    f.write(b"CRTQ" + "CRTQ-HSA26-F3E5CA13 · Cartothèque © 2026 Noah Henricy, Yoni Safran et Tibo Amettler. Tous droits réservés.".encode("utf-8"))   # signature after the records (ignored by the reader)
with open(ids_path, "w", encoding="utf-8") as f:
    json.dump(order, f, separators=(",", ":"))
print(f"visual index: {len(order)} cards ({len(fresh)} new, {failed} failed), {os.path.getsize(bin_path)} bytes, {time.time() - t0:.0f} s")
