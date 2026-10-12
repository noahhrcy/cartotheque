/* Cartothèque — © 2026 Noah Henricy, Yoni Safran et Tibo Amettler. Tous droits réservés (voir LICENSE). */
/* ============================================================
   Cartothèque — platform adapter: Claude artifact (db, user, sample, downloads capabilities)
   ============================================================ */
const PLATFORM = 'claude';
const USE_IMAGES = false;   // the artifact frame blocks external images
const privPath = name => `data/users/${S.me.id}/${name}`;
const PF = {
  text: {
    chip: 'Mode local',
    local: 'Mode local : votre collection est enregistrée sur cet appareil. Ouvrez la page depuis Claude pour la synchroniser et accéder aux échanges.',
    scanLocal: 'La reconnaissance photo fonctionne lorsque la page est ouverte depuis Claude. Ici, utilisez la saisie rapide : nom ou numéro imprimé en bas de la carte.',
    cloudOnly: 'Ouvrez Cartothèque depuis Claude, connecté à votre compte : les membres, les correspondances et les échanges y sont partagés en temps réel.',
    account: 'Compte Claude connecté · données synchronisées',
    deleteTitle: 'Supprimer toutes mes données ?',
    deleteText: 'Votre collection, vos recherches, vos classeurs, vos produits scellés et votre profil public seront supprimés définitivement. Les échanges en cours restent visibles par vos correspondants.',
  },
  canScan: () => !!S.sample,
  async scan(blob, precise) { return S.sample.json(SCAN_PROMPT, { images: [blob], modelTier: precise ? 'default' : 'quick' }); },
  saveDoc: (name, data) => S.db.doc(privPath(name)).set(data),
  savePub: pub => S.db.doc('pub/' + S.me.id).set(pub),
  async createTrade({ to, give, get, kind, price, text }) {
    const id = newId(); const now = Date.now(); const mid = newId();
    await S.db.doc('trades/' + id).set({ parties: [S.me.id, to], a: S.me.id, b: to, give, get, kind, price, status: 'open', at: now, upd: now, lastBy: S.me.id, seen: { [S.me.id]: now }, msgs: text ? { [mid]: { by: S.me.id, t: text, at: now } } : {}, events: { [newId()]: { by: S.me.id, s: 'open', at: now } } });
    return id;
  },
  tradeSay(t, text) { const now = Date.now(); return S.db.doc('trades/' + t.id).update({ msgs: { [newId()]: { by: S.me.id, t: text, at: now } }, upd: now, lastBy: S.me.id, seen: { [S.me.id]: now } }); },
  tradeStatus(t, s, extra) { const now = Date.now(); return S.db.doc('trades/' + t.id).update({ status: s, events: { [newId()]: { by: S.me.id, s, at: now } }, ...extra, upd: now, lastBy: S.me.id, seen: { [S.me.id]: now } }); },
  tradeSeen: t => S.db.doc('trades/' + t.id).update({ seen: { [S.me.id]: Date.now() } }),
  tradeConfirm(t, finalPrice) { const now = Date.now(); const rec = { ...(t.received || {}), [S.me.id]: now }; const both = rec[t.a] && rec[t.b]; return S.db.doc('trades/' + t.id).update({ received: { [S.me.id]: now }, ...(both ? { status: 'done' } : {}), ...(finalPrice ? { finalPrice } : {}), events: { [newId()]: { by: S.me.id, s: both ? 'done' : 'received', at: now } }, upd: now, lastBy: S.me.id, seen: { [S.me.id]: now } }).then(() => both ? 'done' : 'waiting'); },
  tradeDispute(t, reason) { const now = Date.now(); return S.db.doc('trades/' + t.id).update({ status: 'disputed', events: { [newId()]: { by: S.me.id, s: 'disputed', at: now, t: reason } }, upd: now, lastBy: S.me.id }).then(() => PF.report(t.a === S.me.id ? t.b : t.a, 'Litige : ' + reason, { trade: t.id, dispute: true })); },
  async recordSale(cardId, p, k) {
    const ref = S.db.doc('sales/' + cardId); const entry = { [newId()]: { p, k, at: Date.now() } };
    const snap = await ref.get();
    if (snap.exists) await ref.update({ s: entry }); else await ref.set({ s: entry });
  },
  async fetchSales(id) { const sn = await S.db.doc('sales/' + id).get(); return sn.exists ? Object.values(sn.data().s || {}).sort((a, b) => b.at - a.at) : []; },
  async report(target, reason, ctx) {
    const ref = S.db.doc('reports/' + S.me.id); const entry = { [newId()]: { target, reason, ctx, at: Date.now() } };
    const snap = await ref.get();
    if (snap.exists) await ref.update({ items: entry }); else await ref.set({ items: entry });
  },
  async deleteAll(names) {
    for (const n of names) { try { await S.db.doc(privPath(n)).delete(); } catch (e) { /* keep going */ } }
    try { await S.db.doc('pub/' + S.me.id).delete(); } catch (e) { /* ignore */ }
  },
  async download(filename, data) {
    if (!S.downloads) { toast("Le téléchargement n'est pas disponible dans cette vue."); return false; }
    await S.downloads.save({ filename, data }); return true;
  },
  async listAllTrades() { const s = await S.db.collection('trades').limit(1000).get(); return s.docs.map(d => d.data()); },
  async saveOverride(cardId, value, entry) {
    const map = { ...S.overrides }; if (value) map[cardId] = value; else delete map[cardId];
    await S.db.doc('catalog/overrides').set({ map });
    const ref = S.db.doc('catalog/log'); const snap = await ref.get(); const e = { [newId()]: entry };
    if (snap.exists) await ref.update({ e }); else await ref.set({ e });
  },
  setConfig: patch => S.db.doc('config/app').set(JSON.parse(JSON.stringify({ scanQuota: S.config.scanQuota, enforceQuota: !!S.config.enforceQuota, banner: S.config.banner || '', banned: S.config.banned || {}, ...patch }))),
  toggleBan(uid, on) { const b = { ...(S.config.banned || {}) }; if (on) b[uid] = Date.now(); else delete b[uid]; return PF.setConfig({ banned: b }); },
  handleReport: r => S.db.doc('reports/' + r.from).update({ items: { [r.rid]: { handled: Date.now() } } }),
  hideListings: uid => S.db.doc('pub/' + uid).update({ sell: null, sellIds: [], trade: null, tradeIds: [] }),
};

async function initPlatform() {
  const hasClaude = typeof window !== 'undefined' && window.claude && typeof window.claude.use === 'function';
  if (!hasClaude) { startLocal(); return; }
  const [user, db, sample, downloads] = await Promise.all([
    window.claude.use('user').catch(() => null),
    window.claude.use('db').catch(() => null),
    window.claude.use('sample').catch(() => null),
    window.claude.use('downloads').catch(() => null),
  ]);
  S.user = user; S.sample = sample; S.downloads = downloads;
  if (user) {
    const me = await user.me();
    S.me = { id: me.id, name: me.name, avatar: me.avatarUrl, color: me.color, isOwner: me.isOwner, canEdit: me.canEdit };
  }
  if (!db || !S.me.id) { startLocal(); return; }
  S.db = db;
  S.mode = 'cloud';
  emit();
  db.collection(`data/users/${S.me.id}`).onSnapshot(snap => {
    for (const d of snap.docs) {
      if (pendingPaths.has('doc:' + d.id)) continue;
      applyPrivDoc(d.id, d.exists ? d.data() : null);
    }
    S.privLoaded = true;
    schedulePub();
    emit();
  }, err => { console.warn('private docs', err); S.privLoaded = true; emit(); });
  db.collection('pub').limit(1000).onSnapshot(snap => {
    S.pubs = new Map(snap.docs.filter(d => d.exists).map(d => [d.id, d.data()]));
    S.pubLoaded = true;
    schedulePub();
    emit();
  }, err => console.warn('pub', err));
  db.collection('trades').where('parties', 'array-contains', S.me.id).onSnapshot(snap => {
    S.trades = snap.docs.filter(d => d.exists).map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.upd || 0) - (a.upd || 0));
    emit();
  }, err => console.warn('trades', err));
  db.doc('config/app').onSnapshot(d => { if (d.exists) S.config = { ...S.config, ...d.data() }; emit(); }, () => {});
  db.doc('catalog/overrides').onSnapshot(d => { S.overrides = (d.exists && d.data().map) || {}; emit(); }, () => {});
  if (S.me.isOwner || S.me.canEdit) {
    db.collection('reports').onSnapshot(snap => {
      const list = [];
      for (const d of snap.docs) { const items = (d.data() || {}).items || {}; for (const [rid, r] of Object.entries(items)) list.push({ rid, from: d.id, ...r }); }
      S.reports = list.sort((a, b) => (b.at || 0) - (a.at || 0));
      emit();
    }, () => {});
    db.doc('catalog/log').onSnapshot(d => { S.catalogLog = (d.exists && d.data().e) || {}; emit(); }, () => {});
  }
}
