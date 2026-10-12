/* Cartothèque — © 2026 Noah Henricy, Yoni Safran et Tibo Amettler. Tous droits réservés (voir LICENSE). */
/* ============================================================
   Cartothèque — free on-device scanner
   1. artwork recognition: the same descriptors as scripts/build_visual_index.py, compared with the
      whole catalogue for several slightly shifted crops of the photo;
   2. printed number reading (« 125/197 ») with Tesseract.js, to separate reprints with the same artwork.
   Nothing leaves the phone and nothing is paid per scan.
   ============================================================ */
const VIS = { CW: 252, CH: 352, ART: [20, 35, 232, 183], GRID: 5, REC: 91, idx: null, loading: null };
const TESS_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js';
const TESS_CORE = 'https://cdn.jsdelivr.net/npm/tesseract.js-core@7.0.0';

// ---------- exact box-filter resampling (identical to the Python index builder) ----------
const AW_CACHE = new Map();
function areaWeights(nIn, nOut) {
  const key = nIn + ':' + nOut;
  if (AW_CACHE.has(key)) return AW_CACHE.get(key);
  const scale = nIn / nOut, res = [];
  for (let o = 0; o < nOut; o++) {
    const a = o * scale, b = (o + 1) * scale, i0 = Math.floor(a), ws = [];
    let sum = 0;
    for (let i = i0; i < b && i < nIn; i++) { const w = Math.min(b, i + 1) - Math.max(a, i); ws.push(w); sum += w; }
    res.push({ i0, w: ws.map(x => x / sum) });
  }
  AW_CACHE.set(key, res);
  return res;
}
// src: Float64Array (h x w x c) -> Float64Array (oh x ow x c)
function resizeArea(src, w, h, c, ow, oh) {
  const wx = areaWeights(w, ow), wy = areaWeights(h, oh);
  const tmp = new Float64Array(h * ow * c);
  for (let y = 0; y < h; y++) {
    for (let ox = 0; ox < ow; ox++) {
      const { i0, w: ws } = wx[ox];
      for (let ch = 0; ch < c; ch++) {
        let s = 0;
        for (let k = 0; k < ws.length; k++) s += src[(y * w + i0 + k) * c + ch] * ws[k];
        tmp[(y * ow + ox) * c + ch] = s;
      }
    }
  }
  const out = new Float64Array(oh * ow * c);
  for (let oy = 0; oy < oh; oy++) {
    const { i0, w: ws } = wy[oy];
    for (let x = 0; x < ow; x++) {
      for (let ch = 0; ch < c; ch++) {
        let s = 0;
        for (let k = 0; k < ws.length; k++) s += tmp[((i0 + k) * ow + x) * c + ch] * ws[k];
        out[(oy * ow + x) * c + ch] = s;
      }
    }
  }
  return out;
}

const D8x32 = (() => {
  const n = 32, m = [];
  for (let k = 0; k < 8; k++) {
    const row = new Float64Array(n);
    for (let i = 0; i < n; i++) row[i] = Math.cos(Math.PI * (i + 0.5) * k / n) * Math.sqrt(2 / n) / (k === 0 ? Math.SQRT2 : 1);
    m.push(row);
  }
  return m;
})();
const greyOf = (a, n) => { const g = new Float64Array(n); for (let i = 0; i < n; i++) g[i] = 0.299 * a[3 * i] + 0.587 * a[3 * i + 1] + 0.114 * a[3 * i + 2]; return g; };
function packBits(bits) { const out = new Uint8Array(bits.length / 8); for (let i = 0; i < bits.length; i++) if (bits[i]) out[i >> 3] |= 128 >> (i & 7); return out; }

// card: Float64Array CH x CW x 3 (0..255) -> { hash: Uint8Array(16), col: Int8Array(75), norm }
function visualDescriptors(card) {
  const [x0, y0, x1, y1] = VIS.ART, aw = x1 - x0, ah = y1 - y0;
  const art = new Float64Array(aw * ah * 3);
  for (let y = 0; y < ah; y++) for (let x = 0; x < aw; x++) for (let c = 0; c < 3; c++) art[(y * aw + x) * 3 + c] = card[((y0 + y) * VIS.CW + x0 + x) * 3 + c];
  // perceptual hash: 8x8 low frequencies of the DCT of a 32x32 grey image, DC dropped, median threshold
  const g = greyOf(resizeArea(art, aw, ah, 3, 32, 32), 1024);
  const t = D8x32.map(row => { const r = new Float64Array(32); for (let j = 0; j < 32; j++) { let s = 0; for (let i = 0; i < 32; i++) s += row[i] * g[i * 32 + j]; r[j] = s; } return r; });
  const low = [];
  for (let u = 0; u < 8; u++) for (let v = 0; v < 8; v++) { let s = 0; for (let j = 0; j < 32; j++) s += t[u][j] * D8x32[v][j]; low.push(s); }
  low.shift();
  const med = [...low].sort((a, b) => a - b)[31];
  const ph = packBits([...low.map(x => x > med), false]);
  // difference hash: 9x8 grey image, left/right comparisons
  const g98 = greyOf(resizeArea(art, aw, ah, 3, 9, 8), 72);
  const db = [];
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) db.push(g98[r * 9 + c + 1] > g98[r * 9 + c]);
  const dh = packBits(db);
  // colour grid: 5x5, normalised per channel, quantised to int8
  const cg = resizeArea(art, aw, ah, 3, VIS.GRID, VIS.GRID), n = VIS.GRID * VIS.GRID;
  const v = new Float64Array(n * 3);
  for (let ch = 0; ch < 3; ch++) {
    let m = 0; for (let i = 0; i < n; i++) m += cg[i * 3 + ch]; m /= n;
    let sd = 0; for (let i = 0; i < n; i++) sd += (cg[i * 3 + ch] - m) ** 2; sd = Math.sqrt(sd / n);
    for (let i = 0; i < n; i++) v[i * 3 + ch] = (cg[i * 3 + ch] - m) / (sd + 1e-6);
  }
  let mx = 1e-6; for (const x of v) mx = Math.max(mx, Math.abs(x));
  const col = new Int8Array(n * 3); let norm = 0;
  for (let i = 0; i < v.length; i++) { const q = Math.max(-127, Math.min(127, Math.round(v[i] * 127 / mx))); col[i] = q; norm += q * q; }
  const hash = new Uint8Array(16); hash.set(ph, 0); hash.set(dh, 8);
  return { hash, col, norm: Math.sqrt(norm) || 1 };
}

// ---------- index ----------
const POP8 = (() => { const t = new Uint8Array(256); for (let i = 0; i < 256; i++) t[i] = (i & 1) + t[i >> 1]; return t; })();
async function loadVisualIndex() {
  if (VIS.idx) return VIS.idx;
  if (VIS.loading) return VIS.loading;
  VIS.loading = (async () => {
    const [bin, ids] = await Promise.all([
      fetch('data/visual.bin').then(r => { if (!r.ok) throw new Error('visual.bin ' + r.status); return r.arrayBuffer(); }),
      fetch('data/visual.json').then(r => { if (!r.ok) throw new Error('visual.json ' + r.status); return r.json(); }),
    ]);
    const u8 = new Uint8Array(bin);
    if (String.fromCharCode(u8[0], u8[1], u8[2], u8[3]) !== 'CVI2') throw new Error('visual index format');
    const n = new DataView(bin).getUint32(4, true);
    const hashes = new Uint8Array(n * 16), col = new Int8Array(n * 75), norms = new Float32Array(n), cards = new Array(n);
    for (let i = 0; i < n; i++) {
      const off = 8 + i * VIS.REC;
      hashes.set(u8.subarray(off, off + 16), i * 16);
      const c = new Int8Array(bin, off + 16, 75);
      col.set(c, i * 75);
      let s = 0; for (let k = 0; k < 75; k++) s += c[k] * c[k];
      norms[i] = Math.sqrt(s) || 1;
      cards[i] = CAT.byId.get(ids[i]) || null;
    }
    VIS.idx = { n, hashes, col, norms, cards };
    return VIS.idx;
  })().catch(e => { VIS.loading = null; throw e; });
  return VIS.loading;
}
// distance of one query to every indexed card, folded into best (min over crops)
function scoreAll(idx, q, best, bestVar, vi) {
  const { n, hashes, col, norms } = idx;
  for (let i = 0; i < n; i++) {
    const o = i * 16;
    let hp = 0, hd = 0;
    for (let k = 0; k < 8; k++) hp += POP8[hashes[o + k] ^ q.hash[k]];
    for (let k = 8; k < 16; k++) hd += POP8[hashes[o + k] ^ q.hash[k]];
    const co = i * 75;
    let dot = 0;
    for (let k = 0; k < 75; k++) dot += col[co + k] * q.col[k];
    const d = hp / 63 + hd / 64 + 1.5 * (1 - dot / (norms[i] * q.norm));
    if (d < best[i]) { best[i] = d; bestVar[i] = vi; }
  }
}

// ---------- image helpers ----------
async function toBitmap(blob) {
  try { return await createImageBitmap(blob, { imageOrientation: 'from-image' }); } catch (e) { return createImageBitmap(blob); }
}
// work image: whole photo scaled so its height is about `target` px; returns RGB Float64Array + size
function workImage(bmp, target) {
  const s = Math.min(1, target / bmp.height);
  const w = Math.round(bmp.width * s), h = Math.round(bmp.height * s);
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  cx.imageSmoothingQuality = 'high';
  cx.drawImage(bmp, 0, 0, w, h);
  const d = cx.getImageData(0, 0, w, h).data;
  const rgb = new Float64Array(w * h * 3);
  for (let i = 0, j = 0; i < d.length; i += 4, j += 3) { rgb[j] = d[i]; rgb[j + 1] = d[i + 1]; rgb[j + 2] = d[i + 2]; }
  return { rgb, w, h, scale: s };
}
// crop (x, y, w, h in work-image pixels, may overflow: padded with grey) -> canonical card
function canonicalCrop(img, r) {
  const x0 = Math.round(r.x), y0 = Math.round(r.y), cw = Math.max(8, Math.round(r.w)), ch = Math.max(8, Math.round(r.h));
  const buf = new Float64Array(cw * ch * 3);
  for (let y = 0; y < ch; y++) {
    const sy = y0 + y;
    for (let x = 0; x < cw; x++) {
      const sx = x0 + x, j = (y * cw + x) * 3;
      if (sx < 0 || sy < 0 || sx >= img.w || sy >= img.h) { buf[j] = buf[j + 1] = buf[j + 2] = 128; continue; }
      const i = (sy * img.w + sx) * 3;
      buf[j] = img.rgb[i]; buf[j + 1] = img.rgb[i + 1]; buf[j + 2] = img.rgb[i + 2];
    }
  }
  return resizeArea(buf, cw, ch, 3, VIS.CW, VIS.CH);
}
// Card outline: the 63:88 rectangle whose four sides sit on the strongest edges of the photo.
// Side strengths come from cumulative sums of the gradient, so each rectangle costs O(1) to score.
function detectCardRect(img, near) {
  const s = Math.min(1, 360 / img.h), W = Math.max(16, Math.round(img.w * s)), H = Math.max(16, Math.round(img.h * s));
  const g = resizeArea(greyOf(img.rgb, img.w * img.h), img.w, img.h, 1, W, H);
  const gx = new Float64Array(W * H), gy = new Float64Array(W * H);
  let mean = 0;
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x;
    const a = g[i - W - 1], b = g[i - W], c = g[i - W + 1], d = g[i - 1], f = g[i + 1], h = g[i + W - 1], k = g[i + W], l = g[i + W + 1];
    gx[i] = Math.abs((c + 2 * f + l) - (a + 2 * d + h));
    gy[i] = Math.abs((h + 2 * k + l) - (a + 2 * b + c));
    mean += gx[i] + gy[i];
  }
  mean /= 2 * W * H;
  // tolerate 1 px of misalignment: max over neighbours, then cumulative sums along the edge direction
  const cx = new Float64Array(W * (H + 1)), cy = new Float64Array((W + 1) * H);
  for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) {
    const v = Math.max(gx[y * W + x], x > 0 ? gx[y * W + x - 1] : 0, x < W - 1 ? gx[y * W + x + 1] : 0);
    cx[x * (H + 1) + y + 1] = cx[x * (H + 1) + y] + v;
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const v = Math.max(gy[y * W + x], y > 0 ? gy[(y - 1) * W + x] : 0, y < H - 1 ? gy[(y + 1) * W + x] : 0);
    cy[y * (W + 1) + x + 1] = cy[y * (W + 1) + x] + v;
  }
  // integral image of the gradient energy: a card is busier than the surface it lies on
  const ii = new Float64Array((W + 1) * (H + 1));
  for (let y = 0; y < H; y++) { let row = 0; for (let x = 0; x < W; x++) { row += gx[y * W + x] + gy[y * W + x]; ii[(y + 1) * (W + 1) + x + 1] = ii[y * (W + 1) + x + 1] + row; } }
  const box = (x0, y0, x1, y1) => ii[y1 * (W + 1) + x1] - ii[y0 * (W + 1) + x1] - ii[y1 * (W + 1) + x0] + ii[y0 * (W + 1) + x0];
  const vert = (x, y0, y1) => (cx[x * (H + 1) + y1] - cx[x * (H + 1) + y0]) / Math.max(1, y1 - y0);
  const horz = (y, x0, x1) => (cy[y * (W + 1) + x1] - cy[y * (W + 1) + x0]) / Math.max(1, x1 - x0);
  let hMin = 0.3 * H, hMax = Math.min(H - 2, (W - 2) * 88 / 63), cxMin = 0, cxMax = W, cyMin = 0, cyMax = H;
  if (near) {
    const nh = near.h * s;
    hMin = Math.max(hMin, nh * 0.82); hMax = Math.min(hMax, nh * 1.18);
    const ncx = (near.x + near.w / 2) * s, ncy = (near.y + near.h / 2) * s;
    cxMin = ncx - 0.15 * nh; cxMax = ncx + 0.15 * nh; cyMin = ncy - 0.15 * nh; cyMax = ncy + 0.15 * nh;
  }
  // keep the few best rectangles that do not overlap much (non-maximum suppression)
  const top = [];
  const iou = (a, b) => { const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)), iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)); const i = ix * iy; return i / (a.w * a.h + b.w * b.h - i); };
  const offer = r => {
    if (top.length >= 3 && r.sc <= top[top.length - 1].sc) return;
    for (let i = 0; i < top.length; i++) if (iou(top[i], r) > 0.5) { if (r.sc > top[i].sc) { top.splice(i, 1); break; } return; }
    top.push(r); top.sort((a, b) => b.sc - a.sc); if (top.length > 3) top.pop();
  };
  const stepH = Math.max(1, Math.round(H * 0.012));
  for (let hh = Math.round(hMin); hh <= hMax; hh += stepH) {
    const ww = Math.round(hh * 63 / 88);
    for (let y0 = 1; y0 + hh < H - 1; y0 += 2) {
      const ccy = y0 + hh / 2; if (ccy < cyMin || ccy > cyMax) continue;
      for (let x0 = 1; x0 + ww < W - 1; x0 += 2) {
        const ccx = x0 + ww / 2; if (ccx < cxMin || ccx > cxMax) continue;
        const L = vert(x0, y0, y0 + hh), R = vert(x0 + ww, y0, y0 + hh), T = horz(y0, x0, x0 + ww), B = horz(y0 + hh, x0, x0 + ww);
        const edges = Math.sqrt(Math.sqrt(L * R * T * B)) / (2 * mean || 1);
        const m = Math.max(2, Math.round(0.07 * hh));
        const ex0 = Math.max(0, x0 - m), ey0 = Math.max(0, y0 - m), ex1 = Math.min(W, x0 + ww + m), ey1 = Math.min(H, y0 + hh + m);
        const inner = box(x0, y0, x0 + ww, y0 + hh), ringArea = (ex1 - ex0) * (ey1 - ey0) - ww * hh;
        const ring = ringArea > 0.25 * (2 * m * (ww + hh)) ? (box(ex0, ey0, ex1, ey1) - inner) / ringArea : inner / (ww * hh);
        const contrast = (inner / (ww * hh) - ring) / (mean || 1);
        const sc = Math.max(0, contrast) * Math.sqrt(edges);
        if (sc > 0) offer({ sc, contrast, x: x0, y: y0, w: ww, h: hh });
      }
    }
  }
  return top.map(b => ({ x: b.x / s, y: b.y / s, w: b.w / s, h: b.h / s, strength: b.contrast }));
}
// candidate card rectangles (work-image pixels)
function aroundRect(r, out, scales, shift) {
  for (const sc of scales) for (const dx of [-shift, 0, shift]) for (const dy of [-shift, 0, shift]) {
    const h = r.h * sc, w = h * 63 / 88;
    out.push({ x: r.x + r.w / 2 - w / 2 + dx * w, y: r.y + r.h / 2 - h / 2 + dy * h, w, h });
  }
  return out;
}
// successive sets of crops to try, most likely first; the scan stops as soon as the artwork matches well
function cropPasses(img, hint) {
  const near = hint ? { x: hint.x * img.w, y: hint.y * img.h, w: hint.w * img.w, h: hint.h * img.h } : null;
  const found = detectCardRect(img, near).filter(r => r.strength > 0.8);
  const passes = [];
  if (near) passes.push(aroundRect(found[0] || near, [], [0.97, 1, 1.03], 0.03));
  if (near && found[0]) passes.push(aroundRect(near, [], [0.96, 1, 1.04], 0.035));
  if (!near && found[0]) {
    // the photo may also be a tight crop of the card: keep the full-frame candidate too
    const fit = Math.min(img.h, img.w * 88 / 63);
    passes.push(aroundRect(found[0], [], [0.97, 1, 1.03], 0.025).concat([{ x: (img.w - fit * 63 / 88) / 2, y: (img.h - fit) / 2, w: fit * 63 / 88, h: fit }]));
  }
  for (const r of found.slice(near ? 0 : 1)) if (!near) passes.push(aroundRect(r, [], [0.97, 1, 1.03], 0.025));
  if (!near) passes.push(cropGrid(img));
  return passes;
}
function cropGrid(img) {
  const out = [];
  const push = (cx, cy, h) => { const w = h * 63 / 88; out.push({ x: cx - w / 2, y: cy - h / 2, w, h }); };
  const fit = Math.min(img.h, img.w * 88 / 63);          // largest card that fits the photo
  for (const s of [1, 0.88, 0.76, 0.64]) {
    const h = fit * s;
    const mx = (img.w - h * 63 / 88) / 2, my = (img.h - h) / 2;
    for (const fx of [-0.5, 0, 0.5]) for (const fy of [-0.5, 0, 0.5]) push(img.w / 2 + fx * mx, img.h / 2 + fy * my, h);
  }
  out.coarse = true;
  return out;
}

// ---------- printed number (Tesseract.js, loaded on first use) ----------
let TESS = null;
function loadScript(src) {
  return new Promise((ok, ko) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => ko(new Error('script ' + src)); document.head.appendChild(s); });
}
function tessWorker() {
  if (TESS) return TESS;
  TESS = (async () => {
    if (!window.Tesseract) await loadScript(TESS_URL);
    const w = await window.Tesseract.createWorker('eng', 1, { corePath: TESS_CORE });
    await w.setParameters({ tessedit_pageseg_mode: '11', tessedit_char_whitelist: '0123456789/ABCDEFGHIJKLMNOPQRSTUVWXYZ', user_defined_dpi: '300' });
    return w;
  })().catch(e => { TESS = null; throw e; });
  return TESS;
}
// band of the card (fractions of the card rectangle) from the full-resolution photo, contrast-stretched, ~40 px text
function ocrBand(bmp, card, fx0, fy0, fx1, fy1, invert) {
  const sx = card.x + fx0 * card.w, sy = card.y + fy0 * card.h, sw = (fx1 - fx0) * card.w, sh = (fy1 - fy0) * card.h;
  const scale = Math.max(1, Math.min(5, 120 / sh));
  const w = Math.round(sw * scale), h = Math.round(sh * scale);
  const cv = document.createElement('canvas'); cv.width = w + 40; cv.height = h + 40;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height);
  cx.imageSmoothingQuality = 'high';
  cx.drawImage(bmp, sx, sy, sw, sh, 20, 20, w, h);
  const im = cx.getImageData(20, 20, w, h), d = im.data, hist = new Uint32Array(256);
  const g = new Uint8Array(w * h);
  for (let i = 0, j = 0; i < d.length; i += 4, j++) { g[j] = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000; hist[g[j]]++; }
  let lo = 0, hi = 255, acc = 0;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc > g.length * 0.04) { lo = v; break; } }
  acc = 0;
  for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc > g.length * 0.04) { hi = v; break; } }
  const span = Math.max(1, hi - lo);
  for (let i = 0, j = 0; i < d.length; i += 4, j++) {
    let v = Math.max(0, Math.min(255, (g[j] - lo) * 255 / span));
    if (invert) v = 255 - v;
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  cx.putImageData(im, 20, 20);
  return cv;
}
const OCR_FIX = { O: '0', Q: '0', D: '0', I: '1', L: '1', T: '7', Z: '2', S: '5', B: '8', G: '6' };
function parseNumber(text) {
  const t = String(text || '').toUpperCase().replace(/\s+/g, ' ');
  const out = [];
  const re = /([A-Z]{0,4}[0-9OQDILZSBG]{1,3})\s?\/\s?([A-Z]{0,4}[0-9OQDILZSBG]{1,3})/g;
  let m;
  while ((m = re.exec(t))) {
    for (const fix of [false, true]) {
      const clean = s => { const mm = s.match(/^([A-Z]*?)([0-9OQDILZSBG]+)$/); if (!mm) return s; return mm[1] + (fix ? mm[2].replace(/[OQDILZSBG]/g, ch => OCR_FIX[ch]) : mm[2]); };
      const num = normLid(clean(m[1])), tot = clean(m[2]);
      const totN = parseInt(tot.replace(/\D/g, ''), 10) || null;
      if (/\d/.test(num) && CAT.byLid.has(num)) out.push({ number: num, total: totN, raw: m[0] });
    }
  }
  const codes = (t.match(/\b[A-Z]{3,4}\b/g) || []).filter(w => CAT.sets.some(s => (s.a || '').toUpperCase() === w));
  return { list: out, setCode: codes[0] || null };
}
// OCR of the bottom of the card, used to tell apart the few cards the artwork points to (reprints share their artwork)
async function ocrTokens(bmp, card) {
  const w = await tessWorker();
  const { data } = await w.recognize(ocrBand(bmp, card, 0, 0.88, 1, 0.995, false));
  const text = String(data.text || '').toUpperCase();
  const toks = new Set();
  for (const raw of text.split(/[^A-Z0-9]+/)) {
    if (!raw || raw.length > 6) continue;
    toks.add(raw);
    if (/\d/.test(raw)) toks.add(raw.replace(/[OQDILZSBG]/g, ch => OCR_FIX[ch]));
  }
  return { text, toks: [...toks], parsed: parseNumber(text) };
}
function lev(a, b) {
  const m = a.length, n = b.length, d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[m][n];
}
const digitsKey = s => String(s).toUpperCase().replace(/^([A-Z]*)0+(?=\d)/, '$1');
function tokenSim(toks, expected) {
  const e = digitsKey(expected);
  let best = 0;
  for (const t of toks) { const k = digitsKey(t); if (!k) continue; best = Math.max(best, 1 - lev(k, e) / Math.max(k.length, e.length)); }
  return best;
}
// how well the OCR tokens agree with what is printed on card c (number, total, extension code)
function ocrAgreement(o, c) {
  const num = tokenSim(o.toks, c.lid);
  const tot = c.set.o ? tokenSim(o.toks, String(c.set.o)) : 0;
  const code = (c.set.a && o.toks.includes(c.set.a.toUpperCase())) || (c.set.al && o.toks.includes(String(c.set.al).toUpperCase())) ? 1 : 0;
  const keep = x => (x >= 0.6 ? x : 0);
  return 0.55 * keep(num) + 0.25 * keep(tot) + 0.2 * code;
}

// ---------- the scan ----------
// blob: the photo; hint: guide-frame rectangle as fractions of the photo (camera) or null (imported photo)
const visSim = d => clamp((VIS_FAR - d) / (VIS_FAR - VIS_NEAR), 0, 1);
const VIS_NEAR = 0.35, VIS_FAR = 1.05;
async function freeScan(blob, hint, onStep) {
  const t0 = performance.now();
  onStep && onStep('Préparation…');
  const [idx, bmp] = await Promise.all([loadVisualIndex(), toBitmap(blob)]);
  const img = workImage(bmp, Math.min(bmp.height, hint ? 1100 : 900));
  onStep && onStep("Reconnaissance de l'illustration…");
  let variants = [];
  const best = new Float64Array(idx.n).fill(Infinity), bestVar = new Int16Array(idx.n);
  const run = list => { const base = variants.length; variants = variants.concat(list); list.forEach((r, k) => scoreAll(idx, visualDescriptors(canonicalCrop(img, r)), best, bestVar, base + k)); };
  const topIndex = () => { let t = 0; for (let i = 1; i < idx.n; i++) if (best[i] < best[t]) t = i; return t; };
  for (const pass of cropPasses(img, hint)) {
    run(pass);
    if (pass.coarse) run(aroundRect(variants[bestVar[topIndex()]], [], [0.95, 1, 1.05], 0.03));   // refine around the best grid crop
    if (visSim(best[topIndex()]) >= 0.6) break;
  }
  const order = Array.from(best.keys()).filter(i => idx.cards[i]).sort((a, b) => best[a] - best[b]).slice(0, 30);
  const visual = order.map(i => ({ c: idx.cards[i], d: best[i], v: visSim(best[i]), r: variants[bestVar[i]] }));
  // contenders: cards almost as close as the best one (usually reprints sharing the artwork)
  const d1 = visual[0].d;
  const contenders = visual.filter(x => x.d <= d1 + 0.12).slice(0, 12);
  const clear = contenders.length === 1 && visual[0].v >= 0.55 && (!visual[1] || visual[1].d - d1 >= 0.15);
  let ocr = null;
  if (!clear) {
    const r = visual[0].r, k = 1 / img.scale;
    try { onStep && onStep('Lecture du numéro…'); ocr = await ocrTokens(bmp, { x: r.x * k, y: r.y * k, w: r.w * k, h: r.h * k }); } catch (e) { ocr = null; }
  }
  const m = fuseScan(visual, ocr);
  const p = ocr && ocr.parsed && ocr.parsed.list[0];
  return {
    dets: [{ det: { number: p ? p.number : '', total: p && p.total ? String(p.total) : '', setCode: ocr && ocr.parsed ? ocr.parsed.setCode : '', printedName: '', where: '', source: 'free', ocrUsed: !!ocr }, m }],
    sealed: [], note: '', ms: performance.now() - t0,
  };
}
function fuseScan(visual, ocr) {
  const pool = new Map();
  for (const v of visual) pool.set(v.c.id, { c: v.c, v: v.v });
  // a number read exactly can bring in cards the artwork missed (no official image, heavy glare)
  if (ocr && ocr.parsed) for (const p of ocr.parsed.list) for (const c of CAT.byLid.get(p.number) || []) if (p.total && (c.set.o === p.total || c.set.t === p.total) && !pool.has(c.id)) pool.set(c.id, { c, v: 0 });
  const scored = [...pool.values()].map(x => ({ c: x.c, s: ocr ? 0.6 * x.v + 0.4 * ocrAgreement(ocr, x.c) : x.v })).sort((a, b) => b.s - a.s);
  const top = scored[0], second = scored[1];
  const ambiguous = !top || top.s < (ocr ? 0.5 : 0.55) || (second && top.s - second.s < 0.05);
  return { candidates: scored.slice(0, 4).map(x => x.c), best: top ? top.c : null, ambiguous, conf: top ? Math.round(100 * Math.min(1, top.s)) : 0, vi: top ? top.c.mv : 0 };
}
