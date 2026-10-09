'use strict';
/* ============================================================
   Cartothèque — core: utils, catalogue, price engine, search, scan matching
   ============================================================ */
const { html, render, useState, useEffect, useMemo, useRef } = htmPreact;

// ---------- utils ----------
const NF2 = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const NF0 = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const NI = new Intl.NumberFormat('fr-FR');
const fmtEUR = (x, big) => (x == null || !isFinite(x) || x <= 0) ? '—' : ((big !== false && x >= 1000) ? NF0.format(x) : NF2.format(x));
const fmtInt = n => NI.format(Math.round(n || 0));
const fmtPct = x => (x == null || !isFinite(x)) ? '—' : (x > 0.0005 ? '+' : x < -0.0005 ? '−' : '±') + Math.abs(x * 100).toFixed(1).replace('.', ',') + ' %';
const DF = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
const DFS = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit' });
const DFT = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const fmtDate = d => { try { return DF.format(new Date(d)); } catch (e) { return ''; } };
const fmtShort = d => { try { return DFS.format(new Date(d)); } catch (e) { return ''; } };
const fmtDT = d => { try { return DFT.format(new Date(d)); } catch (e) { return ''; } };
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const words = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/[^a-z0-9/.-]+/).filter(Boolean);
const newId = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-5);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const round2 = x => Math.round(x * 100) / 100;
const median = arr => { const a = [...arr].sort((x, y) => x - y); const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
const monthKey = (d = new Date()) => d.toISOString().slice(0, 7);
const plural = (n, one, many) => `${fmtInt(n)} ${Math.abs(n) > 1 ? (many || one + 's') : one}`;
function bigrams(s) { const m = new Map(); for (let i = 0; i < s.length - 1; i++) { const b = s.slice(i, i + 2); m.set(b, (m.get(b) || 0) + 1); } return m; }
function dice(a, b) {
  if (!a || !b) return 0; if (a === b) return 1; if (a.length < 2 || b.length < 2) return 0;
  const A = bigrams(a), B = bigrams(b); let inter = 0;
  for (const [k, v] of A) { const w = B.get(k); if (w) inter += Math.min(v, w); }
  return 2 * inter / (a.length - 1 + b.length - 1);
}
const normLid = s => { s = String(s || '').toUpperCase().replace(/\s+/g, ''); const m = s.match(/^([A-Z]*)0*(\d+)([A-Z]*)$/); return m ? m[1] + m[2] + m[3] : s; };
const lsGet = (k, d) => { try { const v = localStorage.getItem('cartotheque:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem('cartotheque:' + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } };

// ---------- reference lists ----------
const CONDS = [
  { k: 'MT', l: 'Mint', f: 1.1 },
  { k: 'NM', l: 'Near Mint', f: 1 },
  { k: 'EX', l: 'Excellent', f: 0.8 },
  { k: 'GD', l: 'Good', f: 0.62 },
  { k: 'LP', l: 'Light Played', f: 0.5 },
  { k: 'PL', l: 'Played', f: 0.35 },
  { k: 'PO', l: 'Poor', f: 0.2 },
];
const condF = k => (CONDS.find(c => c.k === k) || CONDS[1]).f;
const LANGS = [
  { k: 'fr', l: 'Français', s: 'FR' }, { k: 'en', l: 'Anglais', s: 'EN' }, { k: 'ja', l: 'Japonais', s: 'JP' },
  { k: 'de', l: 'Allemand', s: 'DE' }, { k: 'it', l: 'Italien', s: 'IT' }, { k: 'es', l: 'Espagnol', s: 'ES' },
];
const langS = k => (LANGS.find(l => l.k === k) || LANGS[0]).s;
const REGIONS = ['Auvergne-Rhône-Alpes', 'Bourgogne-Franche-Comté', 'Bretagne', 'Centre-Val de Loire', 'Corse', 'Grand Est', 'Hauts-de-France', 'Île-de-France', 'Normandie', 'Nouvelle-Aquitaine', 'Occitanie', 'Pays de la Loire', "Provence-Alpes-Côte d'Azur", 'Outre-mer', 'Belgique', 'Suisse', 'Luxembourg', 'Canada', 'Autre'];
const SEALED_TYPES = ['Booster', 'Display (36 boosters)', 'Coffret Dresseur d\'Élite (ETB)', 'Bundle / Pack de 6 boosters', 'Tripack', 'Coffret', 'Pokébox / Tin', 'Blister', 'Collection premium', 'Autre'];

// ---------- catalogue ----------
const CAT = { ready: false, meta: null, sets: [], series: [], cards: [], byId: new Map(), byLid: new Map(), serieById: new Map(), setById: new Map(), details: new Map(), latestSets: [] };

async function loadCatalogue() {
  const res = await fetch('data/catalogue.json');
  if (!res.ok) throw new Error('catalogue ' + res.status);
  const j = await res.json();
  const labels = j.meta.labels;
  CAT.meta = j.meta;
  CAT.series = j.series;
  for (const s of j.series) CAT.serieById.set(s.id, s);
  CAT.sets = j.sets.map((s, i) => ({ ...s, i, cards: [] }));
  for (const s of CAT.sets) CAT.setById.set(s.id, s);
  CAT.cards = j.cards.map((r, k) => {
    const c = {
      k, id: r[0], si: r[1], lid: r[2], n: r[3], nn: norm(r[3]), r: r[4], cat: r[5], t: r[6], hp: r[7], dex: r[8],
      v: r[9].map(v => ({ l: labels[v[0]], cm: { trend: v[1], a7: v[2], a30: v[3], a1: v[4], low: v[5], avg: v[6] }, tp: v[7] })),
    };
    c.im = r[10] === undefined ? 0 : r[10];
    c.set = CAT.sets[c.si];
    c.set.cards.push(c);
    CAT.byId.set(c.id, c);
    const key = normLid(c.lid);
    if (!CAT.byLid.has(key)) CAT.byLid.set(key, []);
    CAT.byLid.get(key).push(c);
    let mv = c.v.findIndex(v => v.cm.trend > 0 || v.cm.a7 > 0 || v.tp > 0);
    if (mv < 0) mv = 0;
    c.mv = mv;
    const e = estimate(c.v[mv]);
    c.p = e ? e.value : 0;
    c.conf = e ? e.conf : 0;
    const cm = c.v[mv].cm;
    c.d7 = cm.trend > 0 && cm.a7 > 0 ? cm.trend / cm.a7 - 1 : null;
    c.d30 = cm.trend > 0 && cm.a30 > 0 ? cm.trend / cm.a30 - 1 : null;
    return c;
  });
  CAT.latestSets = [...CAT.sets].filter(s => s.cards.length).sort((a, b) => (b.d || '').localeCompare(a.d || ''));
  CAT.ready = true;
}

async function loadDetails(setId) {
  if (CAT.details.has(setId)) return CAT.details.get(setId);
  const p = fetch('data/sets/' + encodeURIComponent(setId) + '.json').then(r => r.ok ? r.json() : {}).catch(() => ({}));
  CAT.details.set(setId, p);
  const d = await p;
  CAT.details.set(setId, d);
  return d;
}

const imgUrl = (c, q) => !c.im ? null : (typeof c.im === 'string' ? c.im : `https://assets.tcgdex.net/fr/${c.set.s}/${c.set.id}/${c.lid}`) + '/' + q + '.webp';
const HIST = new Map();
async function loadHistory(setId) {
  if (HIST.has(setId)) return HIST.get(setId);
  const p = fetch('data/history/' + encodeURIComponent(setId) + '.json').then(r => r.ok ? r.json() : null).catch(() => null);
  HIST.set(setId, p);
  const h = await p; HIST.set(setId, h);
  return h;
}

const rarityName = c => (S.overrides[c.id] && S.overrides[c.id].r) || CAT.meta.rarities[c.r] || '';
const cardName = c => (S.overrides[c.id] && S.overrides[c.id].n) || c.n;
const catName = c => CAT.meta.cats[c.cat] || '';
const typeName = c => c.t >= 0 ? CAT.meta.types[c.t] : '';
const setLabel = s => s ? `${s.n}` : '';
const numLabel = c => `${c.lid}${c.set.o && /^\d+$/.test(c.lid) ? '/' + String(c.set.o).padStart(c.lid.length, '0') : ''}`;

function rarityMark(name) {
  const n = norm(name);
  if (!n || n === 'sansrarete') return { s: '—', tier: 0 };
  if (n === 'commune') return { s: '●', tier: 1 };
  if (n === 'peucommune') return { s: '◆', tier: 2 };
  if (n === 'promo') return { s: 'PR', tier: 2 };
  if (n === 'rare') return { s: '★', tier: 3 };
  if (n.includes('hyper') || n.includes('couronne') || n.includes('magnifique')) return { s: '★★★', tier: 7 };
  if (n.includes('illustrationspeciale') || n.includes('specialillustration')) return { s: '★★', tier: 7 };
  if (n.includes('illustration')) return { s: '★', tier: 6 };
  if (n.includes('ultra') || n.includes('secret') || n.includes('shiny') || n.includes('chromatique')) return { s: '★★', tier: 6 };
  if (n.includes('double') || n.includes('vmax') || n.includes('vstar') || n.includes('rarev') || n.includes('lvx') || n.includes('prime') || n.includes('legende') || n.includes('radieux')) return { s: '★★', tier: 5 };
  if (n.includes('holo')) return { s: '★H', tier: 4 };
  return { s: '★', tier: 4 };
}

// ---------- price engine ----------
// Normalises every source to EUR, drops outliers, weights what remains and scores the confidence.
function estimate(v) {
  if (!v) return null;
  const tpF = (CAT.meta && CAT.meta.tpFactor) || 0.65;
  const pts = [
    { k: 'trend', l: 'Cardmarket · tendance', v: v.cm.trend, w: 0.32 },
    { k: 'a7', l: 'Cardmarket · moyenne 7 jours', v: v.cm.a7, w: 0.22 },
    { k: 'a30', l: 'Cardmarket · moyenne 30 jours', v: v.cm.a30, w: 0.16 },
    { k: 'a1', l: 'Cardmarket · moyenne de la veille', v: v.cm.a1, w: 0.1 },
    { k: 'avg', l: 'Cardmarket · prix de vente moyen', v: v.cm.avg, w: 0.08 },
    { k: 'tp', l: 'TCGplayer (US) · ramené au marché européen', v: v.tp ? round2(v.tp * tpF) : 0, raw: v.tp, w: 0.12 },
  ].filter(p => p.v > 0);
  if (!pts.length) return { value: 0, conf: 0, pts: [], low: v.cm.low || 0 };
  const med = median(pts.map(p => p.v));
  for (const p of pts) { const r = p.v / med; p.anomaly = pts.length >= 3 && (r > 2.2 || r < 0.45); p.used = !p.anomaly; }
  const used = pts.filter(p => p.used);
  const W = used.reduce((a, p) => a + p.w, 0);
  const value = used.reduce((a, p) => a + p.v * p.w, 0) / W;
  const coverage = clamp(used.length / 5, 0, 1);
  const sd = Math.sqrt(used.reduce((a, p) => a + Math.log(p.v / value) ** 2, 0) / used.length);
  const agreement = used.length > 1 ? clamp(1 - sd / 0.35, 0, 1) : 0.35;
  const liquidity = (v.cm.a1 > 0 ? 0.4 : 0) + (v.cm.a7 > 0 ? 0.3 : 0) + (v.cm.low > 0 && v.cm.trend > 0 ? 0.3 * clamp(v.cm.low / v.cm.trend * 1.6, 0, 1) : 0);
  const cross = v.tp > 0 && (v.cm.trend > 0 || v.cm.a7 > 0) ? 1 : 0.5;
  let conf = 100 * (0.36 * agreement + 0.22 * coverage + 0.24 * liquidity + 0.18 * cross);
  if (pts.some(p => p.anomaly)) conf -= 6;
  return { value: round2(value), conf: Math.round(clamp(conf, 12, 98)), pts, low: v.cm.low || 0, med };
}
const confColor = c => c >= 80 ? 'var(--up)' : c >= 55 ? 'var(--warn)' : 'var(--down)';
const confWord = c => c >= 80 ? 'élevée' : c >= 55 ? 'moyenne' : 'faible';
function variantPrice(card, vi) { const v = card.v[vi == null ? card.mv : vi] || card.v[card.mv]; const e = estimate(v); return e ? e.value : 0; }
function itemValue(it) { const c = CAT.byId.get(it.c); if (!c) return 0; return variantPrice(c, it.v) * condF(it.k) * (it.q || 1); }

// ---------- search ----------
// A word is first looked up in card names. It only becomes an extension filter when it comes with a
// card number ("MEW 6") or when no card name contains it ("OBF", "dracaufeu obsidiennes", "dracaufeu 151").
const STOPWORDS = new Set(['et', 'de', 'des', 'du', 'la', 'le', 'les', 'l', 'd', 'en', 'a', 'au', 'aux', 'the', 'of', 'and']);
const setsNamed = n => new Set(CAT.sets.filter(s => s.cards.length && norm(s.n) === norm(n)).map(s => s.i));
function parseQuery(q) {
  q = String(q || '').trim();
  let number = null, total = null, rest = q, setNum = null;
  const m = q.match(/([a-z]*\d+[a-z]*)\s*\/\s*([a-z]*\d+)/i);
  if (m) { number = normLid(m[1]); total = parseInt(m[2].replace(/\D/g, ''), 10) || null; rest = q.replace(m[0], ' '); }
  const toks = [], nums = [];
  for (const w of words(rest)) {
    if (/\d/.test(w) && w.length <= 6) nums.push(normLid(w));
    else { const t = norm(w); if (t && !STOPWORDS.has(t)) toks.push(t); }
  }
  // two numbers, one of them an extension name: "151 6" is card 6 of the extension 151
  if (nums.length >= 2 || (number && nums.length)) setNum = nums.find(n => setsNamed(n).size) || null;
  if (!number) number = nums.find(n => n !== setNum) || (setNum ? null : nums[0]) || null;
  return { number, total, toks, setNum };
}
const isSetCode = t => /^[a-z0-9]{2,5}$/.test(t) && CAT.sets.some(s => norm(s.a) === t || norm(s.al) === t);
const setsMatching = toks => new Set(CAT.sets.filter(s => s.cards.length && toks.every(t => norm(s.a) === t || norm(s.al) === t || norm(s.n).includes(t))).map(s => s.i));
function runSearch(f, names, sets, number, total) {
  const pool = f.setIdx != null ? CAT.sets[f.setIdx].cards : CAT.cards;
  const joined = names.join('');
  const out = [];
  for (const c of pool) {
    if (f.cat != null && f.cat !== '' && c.cat !== +f.cat) continue;
    if (f.type != null && f.type !== '' && c.t !== +f.type) continue;
    if (f.rarity != null && f.rarity !== '' && c.r !== +f.rarity) continue;
    if (f.minPrice && c.p < f.minPrice) continue;
    if (f.serie && c.set.s !== f.serie) continue;
    if (sets && !sets.has(c.si)) continue;
    if (number && normLid(c.lid) !== number) continue;
    if (total && c.set.o !== total && c.set.t !== total) continue;
    let score = 0;
    if (names.length) {
      const nn = S.overrides[c.id] ? norm(cardName(c)) : c.nn;
      let ok = true;
      for (const t of names) {
        const i = nn.indexOf(t);
        if (i < 0) { ok = false; break; }
        score += i === 0 ? 3 + 2 * t.length / nn.length : 1;
      }
      if (!ok) continue;
      if (nn === joined) score += 6;
    }
    out.push({ c, score });
  }
  const sort = f.sort || 'relevance';
  out.sort((a, b) => {
    if (sort === 'price-desc') return b.c.p - a.c.p;
    if (sort === 'price-asc') return (a.c.p || 1e9) - (b.c.p || 1e9);
    if (sort === 'number') return a.c.k - b.c.k;
    if (sort === 'recent') return (b.c.set.d || '').localeCompare(a.c.set.d || '') || a.c.k - b.c.k;
    return b.score - a.score || (b.c.set.d || '').localeCompare(a.c.set.d || '') || a.c.k - b.c.k;
  });
  return out.map(o => o.c);
}
function searchCards(q, f = {}) {
  const { number, total, toks, setNum } = parseQuery(q);
  const codes = toks.filter(isSetCode);
  const others = toks.filter(t => !codes.includes(t));
  const tries = [];
  if (setNum) tries.push({ names: toks, sets: setsNamed(setNum), number });
  if (number && codes.length) tries.push({ names: others, sets: setsMatching(codes), number });
  tries.push({ names: toks, sets: null, number });
  if (codes.length) tries.push({ names: others, sets: setsMatching(codes), number });
  if (toks.length) tries.push({ names: [], sets: setsMatching(toks), number });   // the whole query names an extension
  const orphans = toks.filter(t => !CAT.cards.some(c => c.nn.includes(t)));
  if (orphans.length) tries.push({ names: toks.filter(t => !orphans.includes(t)), sets: setsMatching(orphans), number });
  if (number && !total && setsNamed(number).size) {
    // "151" alone is the extension 151; with other words it is tried as a card number first
    if (toks.length) tries.push({ names: toks, sets: setsNamed(number), number: null });
    else tries.unshift({ names: [], sets: setsNamed(number), number: null });
  }
  for (const t of tries) {
    if (t.sets && !t.sets.size) continue;
    const res = runSearch(f, t.names, t.sets, t.number, total);
    if (res.length) return res;
  }
  return [];
}

// ---------- scanner: match Claude's reading against the catalogue ----------
function matchDetection(det) {
  const num = normLid(det.number || '');
  const total = parseInt(String(det.total || '').replace(/\D/g, ''), 10) || null;
  const code = norm(det.setCode || '');
  const names = [det.frenchName, det.printedName].filter(Boolean).map(norm);
  let pool = num ? (CAT.byLid.get(num) || []) : [];
  if (!pool.length && names.length) {
    pool = CAT.cards.filter(c => names.some(n => n && (c.nn.includes(n) || dice(c.nn, n) > 0.7))).slice(0, 400);
  }
  const scored = pool.map(c => {
    let s = 0;
    if (num && normLid(c.lid) === num) s += 0.4;
    if (total) { if (c.set.o === total || c.set.t === total) s += 0.25; } else s += 0.08;
    const nameSim = names.length ? Math.max(...names.map(n => dice(c.nn, n))) : 0;
    s += 0.25 * nameSim;
    if (code && (norm(c.set.a) === code || norm(c.set.al) === code)) s += 0.1;
    return { c, s, nameSim };
  }).sort((a, b) => b.s - a.s || (b.c.set.d || '').localeCompare(a.c.set.d || ''));
  const best = scored[0];
  const second = scored[1];
  const ambiguous = !best || best.s < 0.72 || (second && best.s - second.s < 0.08);
  const conf = best ? Math.round(100 * clamp(best.s, 0, 1) * (0.6 + 0.4 * clamp(+det.confidence || 0.5, 0, 1))) : 0;
  let vi = 0;
  if (best) {
    const want = det.finish === 'reverse' ? 'reverse' : det.finish === 'holo' ? 'holo' : 'normale';
    const i = best.c.v.findIndex(v => norm(v.l).startsWith(want));
    vi = i >= 0 ? i : best.c.mv;
  }
  return { candidates: scored.slice(0, 4).map(x => x.c), best: best ? best.c : null, ambiguous, conf, vi };
}

const SCAN_PROMPT = `Tu es le module d'identification d'une application de collection de cartes Pokémon (jeu de cartes physique).
Regarde la photo jointe. Elle peut contenir une carte, plusieurs cartes (page de classeur, cartes étalées), une carte gradée dans un boîtier, ou un produit scellé.
Pour CHAQUE carte lisible (12 au maximum), relève ce qui est imprimé, sans inventer :
- printedName : le nom imprimé, tel quel
- frenchName : le nom français officiel de ce Pokémon ou de cette carte Dresseur/Énergie (traduis si la carte n'est pas en français)
- number : le numéro de collection en bas de la carte, partie avant la barre (ex. "125", "TG05", "SV049", "GG01")
- total : la partie après la barre (ex. "197"), ou null
- setCode : le code d'extension imprimé à côté du numéro s'il est lisible (ex. "MEW", "PAF", "OBF"), sinon null
- language : "fr", "en", "ja", "de", "it" ou "es"
- finish : "holo" si l'illustration brille, "reverse" si c'est le reste de la carte qui brille, "normal" sinon, "unknown" si impossible à dire
- condition : estimation prudente de l'état visible parmi "NM", "EX", "GD", "LP", "PL", "PO"
- graded : null, ou {"company": "PSA"|"PCA"|"CGC"|"BGS"|..., "grade": "10"} si la carte est dans un boîtier de gradation
- confidence : ta confiance entre 0 et 1 sur la lecture du nom ET du numéro
- where : position courte dans la photo (ex. "en haut à gauche")
Pour chaque produit scellé visible, ajoute dans "sealed" : {"type": "booster"|"display"|"etb"|"coffret"|"tripack"|"blister"|"tin"|"autre", "name": "...", "set": "nom de l'extension si lisible"}.
Si un numéro est illisible, mets null plutôt que de deviner.
Réponds uniquement avec ce JSON : {"cards": [...], "sealed": [...], "note": "remarque courte sur la photo (flou, reflets...) ou chaîne vide"}`;

async function prepareImage(file, maxSide = 1600) {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    cv.getContext('2d').drawImage(bmp, 0, 0, w, h);
    const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.88));
    return blob || file;
  } catch (e) { return file; }
}
