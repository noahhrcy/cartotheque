/* ============================================================
   Cartothèque — state, persistence (through the platform adapter PF, or local fallback), community sync
   ============================================================ */
const S = {
  ver: 0,
  route: { name: 'home', params: {} },
  hist: [],
  mode: 'loading',            // loading | cloud | local
  db: null, user: null, sample: null, downloads: null,
  me: { id: null, name: '', avatar: '', color: '#888', isOwner: false, canEdit: false },
  docs: { settings: {}, wish: { items: {} }, binders: { list: {} }, sealed: { items: {} } },
  col: {},                    // serieId -> { items: { itemId: item } }
  pubs: new Map(),            // uid -> public profile doc
  trades: [],
  config: { scanQuota: 20, enforceQuota: false, banner: '', banned: {} },
  overrides: {},
  catalogLog: {},
  reports: [],
  trust: {},                  // uid -> { since, done, disputes, pos, neu, neg }
  myReviews: new Set(),       // trade ids I already reviewed
  toast: null,
  catError: null,
};
const listeners = new Set();
let emitQueued = false;
function emit() { S.ver++; if (emitQueued) return; emitQueued = true; queueMicrotask(flush); }
// draw now instead of at the end of the current task (view transitions need the new page in the same callback)
function flush() { if (!emitQueued) return; emitQueued = false; listeners.forEach(f => f(S.ver)); }
let toastTimer;
function toast(msg) { S.toast = msg; emit(); clearTimeout(toastTimer); toastTimer = setTimeout(() => { S.toast = null; emit(); }, 2600); }
const reduceMotion = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
// short vibration on meaningful actions: native haptics in the apps, vibration API on Android browsers
function haptic(kind) {
  try {
    const H = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Haptics;
    if (H && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) {
      if (kind === 'success') H.notification({ type: 'SUCCESS' }); else H.impact({ style: kind === 'strong' ? 'MEDIUM' : 'LIGHT' });
    } else if (navigator.vibrate) navigator.vibrate(kind === 'success' ? [10, 50, 14] : kind === 'strong' ? 24 : 8);
  } catch (e) { /* no haptics */ }
}

// ---------- navigation ----------
// Routes map to the address bar (#card/sv03.5-151, #cards/pikachu…): links can be shared and a reload stays on the same page.
const ROUTE_ARG = { card: 'id', set: 'id', binder: 'id', trade: 'id', user: 'uid', cards: 'q', collection: 'tab', market: 'tab' };
const ROUTE_NAMES = ['home', 'cards', 'sets', 'set', 'card', 'scan', 'collection', 'binder', 'market', 'trade', 'user', 'profile', 'admin', 'about'];
function routeHash(r) {
  if (!r || r.name === 'home' || !ROUTE_NAMES.includes(r.name)) return '';
  const k = ROUTE_ARG[r.name], a = k && r.params ? r.params[k] : '';
  return '#' + r.name + (a ? '/' + encodeURIComponent(a) : '');
}
function routeFromHash(h) {
  const m = /^#?([a-z]+)(?:\/(.*))?$/.exec(h || '');
  if (!m || !ROUTE_NAMES.includes(m[1])) return null;
  const params = {};
  if (m[2] && ROUTE_ARG[m[1]]) { try { params[ROUTE_ARG[m[1]]] = decodeURIComponent(m[2]); } catch (e) { return null; } }
  if (ROUTE_ARG[m[1]] === 'id' || m[1] === 'user') { if (!m[2]) return null; }
  return { name: m[1], params };
}
function go(name, params = {}) {
  S.route.y = window.scrollY || 0;
  S.hist.push(S.route);
  if (S.hist.length > 40) S.hist.shift();
  S.route = { name, params };
  S.navDir = 'fwd';
  if (PF.onNavigate) PF.onNavigate();
  emit();
  try { window.scrollTo({ top: 0 }); } catch (e) { /* ignore */ }
}
function back() {
  S.route = S.hist.pop() || { name: 'home', params: {} };
  S.navDir = 'back';
  const y = S.route.y || 0;
  emit();
  // put the previous list back where the user left it, once it is drawn again
  queueMicrotask(() => requestAnimationFrame(() => { try { window.scrollTo({ top: y }); } catch (e) { /* ignore */ } }));
}
// in-app « Retour » buttons: go through the browser history when there is one, so the address bar stays in step
function goBack() { if (PF.historyBack && S.hist.length) PF.historyBack(); else withTransition(back); }

// ---------- page transitions ----------
const canTransition = () => typeof document !== 'undefined' && !!document.startViewTransition && !reduceMotion();
// card tile → card page: the tile grows into the card visual (View Transitions API where available)
function openCard(id, tileEl) {
  if (!tileEl || !canTransition()) { go('card', { id }); return; }
  tileEl.style.viewTransitionName = 'card-hero';
  const t = document.startViewTransition(() => { go('card', { id }); flush(); });
  t.ready.catch(() => {});   // skipped when the page is hidden or another transition starts
  t.finished.finally(() => { tileEl.style.viewTransitionName = ''; }).catch(() => {});
}
// any navigation function; when leaving a card page, the card shrinks back into its tile if that tile is on screen
function withTransition(fn) {
  const from = S.route;
  if (!canTransition()) { fn(); return; }
  let el = null;
  const t = document.startViewTransition(() => {
    fn(); flush();
    if (S.navDir === 'back') { try { window.scrollTo({ top: S.route.y || 0 }); } catch (e) { /* ignore */ } }
    if (from.name === 'card' && from.params.id) {
      const cand = document.querySelector(`[data-cid="${CSS.escape(from.params.id)}"] .tile`);
      const r = cand && cand.getBoundingClientRect();
      if (r && r.bottom > 0 && r.top < innerHeight) { el = cand; el.style.viewTransitionName = 'card-hero'; }
    }
  });
  t.ready.catch(() => {});
  t.finished.finally(() => { if (el) el.style.viewTransitionName = ''; }).catch(() => {});
}

// ---------- write queue: one write at a time per document, latest state wins ----------
const wq = new Map();   // path -> { busy, next }
const pendingPaths = new Set();
function queueWrite(path, op) {
  let e = wq.get(path);
  if (!e) { e = { busy: false, next: null }; wq.set(path, e); }
  e.next = op;
  pendingPaths.add(path);
  if (!e.busy) drain(path, e);
}
async function drain(path, e) {
  e.busy = true;
  while (e.next) {
    const op = e.next; e.next = null;
    try { await op(); }
    catch (err) {
      if (err && err.code === 'quota_exceeded') toast('Espace de stockage plein : supprimez des éléments puis réessayez.');
      else if (err && (err.code === 'invalid_argument' || err.code === '42501')) toast("Écriture refusée : vos droits ne permettent pas cette modification.");
      else { await new Promise(r => setTimeout(r, 600 + Math.random() * 800)); try { await op(); } catch (e2) { toast("Enregistrement impossible pour l'instant."); } }
    }
  }
  e.busy = false;
  pendingPaths.delete(path);
}

// ---------- private documents (own data) ----------
const PRIV_DOCS = ['settings', 'wish', 'binders', 'sealed'];
function savePriv(name) {
  const data = name.startsWith('col-') ? S.col[name.slice(4)] : S.docs[name];
  const snapshot = JSON.parse(JSON.stringify(data || {}));
  if (S.mode === 'cloud') {
    queueWrite('doc:' + name, () => PF.saveDoc(name, snapshot));
  } else {
    lsSet('doc:' + name, snapshot);
  }
  schedulePub();
}
function applyPrivDoc(name, data) {
  if (!data) return;
  if (name.startsWith('col-')) { S.col[name.slice(4)] = { items: {}, ...data }; touchCol(); }
  else if (PRIV_DOCS.includes(name)) S.docs[name] = { ...S.docs[name], ...data };
}

function startLocal() {
  S.mode = 'local';
  S.me = { ...S.me, id: 'local' };
  for (const n of PRIV_DOCS) applyPrivDoc(n, lsGet('doc:' + n, null));
  for (const s of CAT.series) { const d = lsGet('doc:col-' + s.id, null); if (d) applyPrivDoc('col-' + s.id, d); }
  S.privLoaded = true;
  emit();
}

// ---------- collection ----------
let ownedCache = { ver: -1, map: null, items: null };
let colVer = 0;
function allItems() {
  if (ownedCache.ver === colVer && ownedCache.items) return ownedCache.items;
  const items = [];
  for (const [serie, doc] of Object.entries(S.col)) for (const [id, it] of Object.entries(doc.items || {})) if (CAT.byId.has(it.c)) items.push({ id, serie, ...it });
  const map = new Map();
  for (const it of items) {
    let o = map.get(it.c);
    if (!o) { o = { q: 0, trade: 0, sell: 0, items: [] }; map.set(it.c, o); }
    o.q += it.q || 0; o.trade += it.tq || 0; o.sell += it.sq || 0; o.items.push(it);
  }
  ownedCache = { ver: colVer, map, items };
  return items;
}
function owned() { allItems(); return ownedCache.map; }
function touchCol() { colVer++; }
function serieOf(cardId) { const c = CAT.byId.get(cardId); return c ? c.set.s || 'misc' : 'misc'; }
function addItem(cardId, o = {}) {
  const serie = serieOf(cardId);
  const doc = S.col[serie] || (S.col[serie] = { items: {} });
  const v = o.v == null ? CAT.byId.get(cardId).mv : o.v, k = o.k || 'NM', g = o.g || 'fr', q = Math.max(1, o.q || 1);
  const same = Object.entries(doc.items).find(([, it]) => it.c === cardId && it.v === v && it.k === k && it.g === g && !it.gr);
  if (same && !o.gr) { same[1].q += q; if (o.pp) same[1].pp = o.pp; }
  else {
    const it = { c: cardId, v, k, g, q, at: Date.now() };
    if (o.pp) it.pp = o.pp;
    if (o.gr) it.gr = o.gr;
    doc.items[newId()] = it;
  }
  touchCol(); savePriv('col-' + serie); emit();
}
function updateItem(item, patch) {
  const doc = S.col[item.serie]; if (!doc || !doc.items[item.id]) return;
  const cur = { ...doc.items[item.id], ...patch };
  for (const k of Object.keys(cur)) if (cur[k] === undefined || cur[k] === null || cur[k] === '') delete cur[k];
  cur.q = Math.max(1, cur.q || 1);
  if (cur.tq) cur.tq = clamp(cur.tq, 0, cur.q);
  if (cur.sq) cur.sq = clamp(cur.sq, 0, cur.q);
  doc.items[item.id] = cur;
  touchCol(); savePriv('col-' + item.serie); emit();
}
function removeItem(item) {
  const doc = S.col[item.serie]; if (!doc) return;
  delete doc.items[item.id];
  touchCol(); savePriv('col-' + item.serie); emit();
}
function removeAllOfCard(cardId) {
  const serie = serieOf(cardId); const doc = S.col[serie]; if (!doc) return;
  for (const [id, it] of Object.entries(doc.items)) if (it.c === cardId) delete doc.items[id];
  touchCol(); savePriv('col-' + serie); emit();
}

// ---------- wishlist ----------
const wishItems = () => S.docs.wish.items || (S.docs.wish.items = {});
function inWish(cardId) { return !!wishItems()[cardId]; }
function toggleWish(cardId, o = {}) {
  const w = wishItems();
  if (w[cardId] && !o.keep) delete w[cardId];
  else w[cardId] = { ...(w[cardId] || { at: Date.now(), p: 2 }), ...o.patch };
  savePriv('wish'); emit();
}

// ---------- binders ----------
const binderList = () => S.docs.binders.list || (S.docs.binders.list = {});
function saveBinder(id, data) { binderList()[id] = data; savePriv('binders'); emit(); }
function deleteBinder(id) { delete binderList()[id]; savePriv('binders'); emit(); }

// ---------- sealed ----------
const sealedItems = () => S.docs.sealed.items || (S.docs.sealed.items = {});
function saveSealed(id, data) { if (data) sealedItems()[id] = data; else delete sealedItems()[id]; savePriv('sealed'); emit(); }

// ---------- settings & profile ----------
const DEFAULT_PROFILE = { pseudo: '', region: '', bio: '', colPublic: false, wishPublic: true, tradeOn: true, sellOn: true };
function profile() { return { ...DEFAULT_PROFILE, ...(S.docs.settings.profile || {}) }; }
function saveProfile(p) { S.docs.settings.profile = { ...profile(), ...p }; savePriv('settings'); emit(); }
function blocked() { return S.docs.settings.blocked || {}; }
function toggleBlock(uid) { const b = { ...blocked() }; if (b[uid]) delete b[uid]; else b[uid] = Date.now(); S.docs.settings.blocked = b; savePriv('settings'); emit(); }
function scansThisMonth() { return ((S.docs.settings.scans || {})[monthKey()]) || 0; }
function countScan() { const sc = { ...(S.docs.settings.scans || {}) }; sc[monthKey()] = (sc[monthKey()] || 0) + 1; S.docs.settings.scans = sc; savePriv('settings'); }

// ---------- collection statistics ----------
function colStats() {
  const items = allItems();
  let cards = 0, value = 0, value7 = 0, spent = 0;
  const sets = new Set();
  for (const it of items) {
    const c = CAT.byId.get(it.c); if (!c) continue;
    cards += it.q || 0;
    const v = c.v[it.v] || c.v[c.mv];
    const est = estimate(v); const f = condF(it.k) * (it.q || 1);
    value += (est ? est.value : 0) * f;
    value7 += (v.cm.a7 > 0 ? v.cm.a7 : (est ? est.value : 0)) * f;
    if (it.pp) spent += it.pp * (it.q || 1);
    sets.add(c.si);
  }
  const om = owned();
  let doubles = 0; for (const o of om.values()) if (o.q > 1) doubles += o.q - 1;
  const sealedVal = Object.values(sealedItems()).reduce((a, s) => a + (s.est || s.pp || 0) * (s.q || 1), 0);
  return { cards, unique: om.size, value, d7: value7 > 0 ? value / value7 - 1 : null, sets: sets.size, doubles, spent, sealedVal, wanted: Object.keys(wishItems()).length };
}
function setProgress(set) {
  const om = owned(); let have = 0, haveOfficial = 0;
  for (const c of set.cards) if (om.has(c.id)) { have++; if (/^\d+$/.test(c.lid) && +c.lid <= set.o) haveOfficial++; }
  return { have, total: set.cards.length, haveOfficial };
}

// ---------- public profile projection ----------
let pubTimer = null, lastPubJson = '';
function schedulePub() { if (S.mode !== 'cloud') return; clearTimeout(pubTimer); pubTimer = setTimeout(writePub, 1800); }
function buildPub() {
  const p = profile(); const st = colStats(); const om = owned();
  const trade = {}, sell = {};
  for (const it of allItems()) {
    if (it.tq > 0 && p.tradeOn) trade[it.c] = [(trade[it.c] ? trade[it.c][0] : 0) + it.tq, it.k, it.g, it.v];
    // a listing at or above PROOF_MIN_PRICE is only published with a real photo
    if (it.sq > 0 && p.sellOn && (!(it.sp >= 30) || (it.proof && it.proof.p))) sell[it.c] = [(sell[it.c] ? sell[it.c][0] : 0) + it.sq, it.k, it.g, it.sp || 0, it.v, it.proof || null];
  }
  const want = {};
  if (p.wishPublic) for (const [id, w] of Object.entries(wishItems())) want[id] = w.mx || 0;
  const binders = Object.entries(binderList()).filter(([, b]) => b.vis === 'public').slice(0, 12).map(([id, b]) => ({ id, n: b.n, d: b.d || '', layout: b.layout, kind: b.kind, set: b.set || null, slots: b.kind === 'custom' ? (b.slots || []).slice(0, 400) : null }));
  return {
    v: 1, pseudo: p.pseudo || '', region: p.region || '', bio: p.bio || '',
    colPublic: !!p.colPublic, wishPublic: !!p.wishPublic, tradeOn: !!p.tradeOn, sellOn: !!p.sellOn,
    stats: { cards: st.cards, unique: st.unique, value: Math.round(st.value), sets: st.sets, wanted: Object.keys(want).length, trade: Object.keys(trade).length, sell: Object.keys(sell).length },
    have: p.colPublic ? [...om.keys()] : [],
    tradeIds: Object.keys(trade), sellIds: Object.keys(sell), wantIds: Object.keys(want),
    trade, sell, want, binders,
  };
}
function stableJson(x) {
  if (Array.isArray(x)) return '[' + x.map(stableJson).join(',') + ']';
  if (x && typeof x === 'object') return '{' + Object.keys(x).sort().map(k => JSON.stringify(k) + ':' + stableJson(x[k])).join(',') + '}';
  return JSON.stringify(x);
}
function writePub() {
  if (S.mode !== 'cloud' || !S.me.id || !S.privLoaded || !S.pubLoaded) return;
  const pub = buildPub();
  const json = stableJson(pub);
  if (json === lastPubJson) return;
  const existing = S.pubs.get(S.me.id);
  if (existing) { const { upd, ...rest } = existing; if (stableJson(rest) === json) { lastPubJson = json; return; } }
  else if (!pub.stats.cards && !pub.wantIds.length && !profile().pseudo && !pub.binders.length) return;
  lastPubJson = json;
  queueWrite('pub', () => PF.savePub({ ...pub, upd: Date.now() }));
}
function pubOf(uid) { return S.pubs.get(uid) || null; }
function communityPubs() {
  const out = [];
  const bl = blocked();
  for (const [uid, p] of S.pubs) { if (uid === S.me.id || bl[uid] || (S.config.banned || {})[uid]) continue; out.push({ uid, ...p }); }
  return out;
}

// ---------- names ----------
const nameCache = new Map();
function displayName(uid, pub) {
  const p = pub || pubOf(uid);
  if (p && p.pseudo) return p.pseudo;
  if (uid === S.me.id) return profile().pseudo || S.me.name || 'Vous';
  return nameCache.get(uid) || 'Collectionneur';
}
async function resolveNames(ids) {
  if (!S.user || !S.user.profiles || !ids.length) return;
  const missing = ids.filter(id => !nameCache.has(id));
  if (!missing.length) return;
  try {
    const ps = await S.user.profiles(missing);
    let changed = false;
    for (const id of missing) { const n = (ps[id] && ps[id].name) || ''; nameCache.set(id, n || 'Collectionneur'); if (n) changed = true; }
    if (changed) emit();
  } catch (e) { /* names stay generic */ }
}

// ---------- matching ----------
function matchesForMe() {
  const want = wishItems();
  const myTrade = new Set(allItems().filter(it => it.tq > 0).map(it => it.c));
  const myDoubles = new Set([...owned()].filter(([, o]) => o.q > 1).map(([id]) => id));
  const out = [];
  for (const p of communityPubs()) {
    const theyOffer = new Set([...(p.tradeIds || []), ...(p.sellIds || [])]);
    const theyHave = new Set(p.have || []);
    const offerMatch = Object.keys(want).filter(id => theyOffer.has(id));
    const haveMatch = Object.keys(want).filter(id => theyHave.has(id) && !theyOffer.has(id));
    const theyWantMine = (p.wantIds || []).filter(id => myTrade.has(id) || myDoubles.has(id));
    if (offerMatch.length || haveMatch.length || theyWantMine.length) out.push({ uid: p.uid, pub: p, offerMatch, haveMatch, theyWantMine, compatible: offerMatch.length > 0 && theyWantMine.length > 0 });
  }
  return out.sort((a, b) => (b.compatible - a.compatible) || (b.offerMatch.length + b.theyWantMine.length) - (a.offerMatch.length + a.theyWantMine.length));
}
function whoHas(cardId) {
  const res = { trade: [], sell: [], have: [], want: [] };
  for (const p of communityPubs()) {
    if (p.trade && p.trade[cardId]) res.trade.push({ uid: p.uid, pub: p, d: p.trade[cardId] });
    if (p.sell && p.sell[cardId]) res.sell.push({ uid: p.uid, pub: p, d: p.sell[cardId] });
    else if (!(p.trade && p.trade[cardId]) && (p.have || []).includes(cardId)) res.have.push({ uid: p.uid, pub: p });
    if (p.want && cardId in p.want) res.want.push({ uid: p.uid, pub: p, mx: p.want[cardId] });
  }
  return res;
}
function availability(cardId) { let n = 0; for (const p of communityPubs()) if ((p.trade && p.trade[cardId]) || (p.sell && p.sell[cardId])) n++; return n; }
function listings() {
  const out = [];
  for (const p of communityPubs()) for (const [id, d] of Object.entries(p.sell || {})) { const c = CAT.byId.get(id); if (c) out.push({ c, uid: p.uid, pub: p, q: d[0], k: d[1], g: d[2], price: d[3], v: d[4], proof: d[5] || null }); }
  return out;
}

// ---------- trades ----------
function tradeUnread(t) { const seen = (t.seen || {})[S.me.id] || 0; return (t.upd || 0) > seen && t.lastBy !== S.me.id; }
async function createTrade({ to, give = [], get = [], kind = 'trade', price = 0, text = '' }) {
  if (S.mode !== 'cloud') { toast('Les échanges nécessitent un compte connecté.'); return null; }
  return PF.createTrade({ to, give, get, kind, price: price || 0, text: String(text || '').slice(0, 1000) });
}
function tradeSay(t, text) { queueWrite('trade:' + t.id + ':' + newId(), () => PF.tradeSay(t, text.slice(0, 1000))); }
function tradeSetStatus(t, s, extra = {}) { queueWrite('trade:' + t.id, () => PF.tradeStatus(t, s, extra)); }
function tradeMarkSeen(t) { if (tradeUnread(t)) queueWrite('trade-seen:' + t.id, () => PF.tradeSeen(t)); }
async function recordSale(cardId, price, cond) {
  if (S.mode !== 'cloud' || !(price > 0) || !PF.recordSale) return;
  try { await PF.recordSale(cardId, round2(price), cond || 'NM'); } catch (e) { console.warn('sale', e); }
}
async function report(target, reason, ctx = {}) {
  if (S.mode !== 'cloud') { toast('Connectez-vous pour signaler un membre.'); return; }
  try { await PF.report(target, String(reason).slice(0, 500), ctx); toast('Signalement envoyé à la modération.'); }
  catch (e) { toast("Le signalement n'a pas pu être envoyé."); }
}

// ---------- notifications (computed) ----------
function notifications() {
  const out = [];
  for (const t of S.trades) if (tradeUnread(t)) out.push({ kind: 'trade', color: 'var(--st-trade)', text: t.status === 'open' && t.b === S.me.id && Object.keys(t.msgs || {}).length <= 1 ? `Nouvelle proposition de ${displayName(t.a)}` : `Du nouveau dans votre échange avec ${displayName(t.a === S.me.id ? t.b : t.a)}`, go: ['trade', { id: t.id }] });
  const want = wishItems();
  let avail = 0; let first = null;
  for (const id of Object.keys(want)) if (availability(id) > 0) { avail++; first = first || id; }
  if (avail) out.push({ kind: 'wish', color: 'var(--st-want)', text: avail === 1 ? `Une carte que vous recherchez est disponible : ${cardName(CAT.byId.get(first))}` : `${avail} cartes de votre wishlist sont disponibles chez des membres`, go: ['market', { tab: 'matches' }] });
  const risers = [];
  for (const [id] of owned()) { const c = CAT.byId.get(id); if (c && c.d7 != null && c.d7 >= 0.15 && c.p >= 1) risers.push(c); }
  risers.sort((a, b) => b.d7 - a.d7);
  for (const c of risers.slice(0, 3)) out.push({ kind: 'price', color: 'var(--up)', text: `${cardName(c)} a augmenté de ${fmtPct(c.d7)} sur 7 jours`, go: ['card', { id: c.id }] });
  return out;
}

// ---------- exports ----------
function csvCell(x) { const s = String(x == null ? '' : x); return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
function collectionCSV() {
  const rows = [['Nom', 'Extension', 'Série', 'Numéro', 'Variante', 'Langue', 'État', 'Quantité', 'À échanger', 'À vendre', 'Prix de vente demandé', "Prix d'achat unitaire", 'Valeur unitaire estimée', 'Valeur totale estimée', 'Identifiant']];
  let total = 0;
  for (const it of allItems()) {
    const c = CAT.byId.get(it.c); if (!c) continue;
    const unit = variantPrice(c, it.v) * condF(it.k); total += unit * it.q;
    rows.push([cardName(c), c.set.n, (CAT.serieById.get(c.set.s) || {}).n || '', numLabel(c), (c.v[it.v] || c.v[c.mv]).l, langS(it.g), it.k, it.q, it.tq || 0, it.sq || 0, it.sp ? String(it.sp).replace('.', ',') : '', it.pp ? String(it.pp).replace('.', ',') : '', unit.toFixed(2).replace('.', ','), (unit * it.q).toFixed(2).replace('.', ','), c.id]);
  }
  rows.push([]); rows.push(['Valeur totale estimée', '', '', '', '', '', '', '', '', '', '', '', '', total.toFixed(2).replace('.', ',')]);
  return '﻿' + rows.map(r => r.map(csvCell).join(';')).join('\r\n');
}
async function offerDownload(filename, data) {
  try { const ok = await PF.download(filename, data); if (ok) toast('Fichier prêt.'); }
  catch (e) { if (!e || e.code !== 'declined') toast("Le fichier n'a pas pu être généré."); }
}
async function deleteMyData() {
  const names = [...PRIV_DOCS, ...Object.keys(S.col).map(s => 'col-' + s)];
  if (S.mode === 'cloud') {
    await PF.deleteAll(names);
    lastPubJson = '';
  } else {
    for (const n of names) { try { localStorage.removeItem('cartotheque:doc:' + n); } catch (e) { /* ignore */ } }
  }
  S.col = {}; S.docs = { settings: {}, wish: { items: {} }, binders: { list: {} }, sealed: { items: {} } };
  touchCol(); emit();
}
