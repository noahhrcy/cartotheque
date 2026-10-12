/* ============================================================
   Cartothèque — platform adapter: standalone web / Android app backed by Supabase
   (auth, Postgres with row-level security, realtime, edge function for the scanner)
   ============================================================ */
const PLATFORM = 'supabase';
const USE_IMAGES = true;
const CFG = window.CARTO_CONFIG || {};
let sb = null;
const hasBackend = () => !!(CFG.supabaseUrl && CFG.supabaseKey && window.supabase && window.supabase.createClient);
const msOf = t => (t ? new Date(t).getTime() : 0);
const isNative = () => !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
async function blobToBase64(blob) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  return btoa(s);
}
function sbFail(error) { if (error) throw error; }

const PF = {
  camera: true,
  freeScan: true,
  text: {
    chip: 'Invité',
    local: 'Mode invité : votre collection reste sur ce téléphone. Créez un compte gratuit pour la sauvegarder, la retrouver partout et accéder aux échanges.',
    scanLocal: 'La reconnaissance photo est réservée aux membres connectés. En attendant, utilisez la saisie rapide : nom ou numéro imprimé en bas de la carte.',
    cloudOnly: 'Créez un compte gratuit ou connectez-vous : les membres, les correspondances et les échanges sont partagés en temps réel.',
    account: 'Compte connecté · données synchronisées',
    deleteTitle: 'Supprimer mon compte et toutes mes données ?',
    deleteText: 'Votre compte, votre collection, vos recherches, vos classeurs, vos produits scellés, votre profil public et vos échanges seront supprimés définitivement.',
  },
  canScan: () => S.mode === 'cloud' && !!sb,
  async scan(blob, precise) {
    const image = await blobToBase64(blob);
    if (image.length > 7_000_000) throw { code: 'too_large' };
    const { data, error } = await sb.functions.invoke('scan', { body: { image, mediaType: blob.type || 'image/jpeg', precise: !!precise } });
    if (error) {
      let code = 'upstream_error';
      try { const body = await error.context.json(); code = body.error || code; } catch (e) { /* not a JSON error body */ }
      if (code === 'not_configured') SCAN.reason = SCAN_ERRORS.not_configured;
      throw { code };
    }
    return data;
  },
  async saveDoc(name, data) { const { error } = await sb.from('user_docs').upsert({ user_id: S.me.id, name, data, updated_at: new Date().toISOString() }); sbFail(error); },
  async savePub(pub) { const { error } = await sb.from('profiles').update({ pub, pseudo: pub.pseudo || null, updated_at: new Date().toISOString() }).eq('id', S.me.id); sbFail(error); },
  async createTrade({ to, give, get, kind, price, text }) {
    const { data, error } = await sb.from('trades').insert({ a: S.me.id, b: to, give, get, kind, price }).select('id').single();
    sbFail(error);
    if (text) await sb.rpc('post_trade_message', { p_trade: data.id, p_body: text });
    await loadTrades();
    return data.id;
  },
  async tradeSay(t, text) { const { error } = await sb.rpc('post_trade_message', { p_trade: t.id, p_body: text }); sbFail(error); loadTradesSoon(); },
  async tradeStatus(t, s, extra) { const { error } = await sb.rpc('set_trade_status', { p_trade: t.id, p_status: s, p_final_price: extra && extra.finalPrice ? extra.finalPrice : null }); sbFail(error); loadTradesSoon(); },
  async tradeSeen(t) { await sb.rpc('mark_trade_seen', { p_trade: t.id }); loadTradesSoon(); },
  async tradeConfirm(t, finalPrice) { const { data, error } = await sb.rpc('confirm_received', { p_trade: t.id, p_final_price: finalPrice || null }); sbFail(error); loadTradesSoon(); return data; },
  async tradeDispute(t, reason) { const { error } = await sb.rpc('open_dispute', { p_trade: t.id, p_reason: reason }); sbFail(error); loadTradesSoon(); },
  async review(t, rating, comment) { const { error } = await sb.from('trade_reviews').insert({ trade_id: t.id, target: t.a === S.me.id ? t.b : t.a, rating, comment: comment || null }); sbFail(error); },
  async trust(ids) {
    const { data, error } = await sb.rpc('member_trust', { p_ids: ids }); sbFail(error);
    return (data || []).map(r => ({ id: r.id, since: msOf(r.member_since), done: r.done_trades, disputes: r.disputes, pos: r.positive, neu: r.neutral, neg: r.negative }));
  },
  async uploadProof(blob, path) { const { error } = await sb.storage.from('proofs').upload(path, blob, { contentType: 'image/jpeg', upsert: false }); sbFail(error); return path; },
  proofUrl: path => sb ? sb.storage.from('proofs').getPublicUrl(path).data.publicUrl : '',
  recordSale: null,   // purchases are recorded server-side when a trade is concluded
  async fetchSales(id) {
    const { data } = await sb.from('sales').select('price, condition, created_at').eq('card_id', id).order('created_at', { ascending: false }).limit(20);
    return (data || []).map(r => ({ p: +r.price, k: r.condition, at: msOf(r.created_at) }));
  },
  async report(target, reason, ctx) { const { error } = await sb.from('reports').insert({ target, reason, context: ctx }); sbFail(error); },
  async deleteAll() { const { error } = await sb.rpc('delete_my_account'); sbFail(error); await sb.auth.signOut(); },
  async download(filename, data) {
    const type = filename.endsWith('.csv') ? 'text/csv;charset=utf-8' : 'application/json';
    const blob = data instanceof Blob ? data : new Blob([data], { type });
    const cap = window.Capacitor;
    if (isNative() && cap.Plugins && cap.Plugins.Filesystem && cap.Plugins.Share) {
      const res = await cap.Plugins.Filesystem.writeFile({ path: filename, data: await blobToBase64(blob), directory: 'CACHE' });
      await cap.Plugins.Share.share({ title: filename, url: res.uri });
      return true;
    }
    const file = typeof File === 'function' ? new File([blob], filename, { type }) : null;
    if (file && navigator.canShare && /Android|iPhone|iPad/i.test(navigator.userAgent) && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: filename }); return true; } catch (e) { if (e && e.name === 'AbortError') return false; }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return true;
  },
  async listAllTrades() { const { data } = await sb.from('trades').select('status').limit(5000); return data || []; },
  async saveOverride(cardId, value, entry) {
    if (value) { const { error } = await sb.from('catalog_overrides').upsert({ card_id: cardId, name: value.n || null, rarity: value.r || null, updated_by: S.me.id, updated_at: new Date().toISOString() }); sbFail(error); }
    else { const { error } = await sb.from('catalog_overrides').delete().eq('card_id', cardId); sbFail(error); }
    await sb.from('catalog_log').insert({ card_id: cardId, before: entry.before, after: entry.after, note: entry.note || null });
    await Promise.all([loadOverrides(), loadCatalogLog()]);
  },
  async setConfig(patch) {
    const row = {};
    if ('scanQuota' in patch) row.scan_quota = patch.scanQuota;
    if ('enforceQuota' in patch) row.enforce_quota = patch.enforceQuota;
    if ('banner' in patch) row.banner = patch.banner;
    const { error } = await sb.from('app_config').update(row).eq('id', 1); sbFail(error);
    await loadConfig();
  },
  async toggleBan(uid, on) { const { error } = await sb.rpc('admin_moderate', { p_user: uid, p_action: on ? 'ban' : 'unban' }); sbFail(error); await loadPubs(); },
  async handleReport(r) { const { error } = await sb.from('reports').update({ handled_at: new Date().toISOString() }).eq('id', r.rid); sbFail(error); await loadReports(); },
  async hideListings(uid) { const { error } = await sb.rpc('admin_moderate', { p_user: uid, p_action: 'hide_listings' }); sbFail(error); await loadPubs(); },
  onNavigate() { try { history.pushState({ d: S.hist.length }, '', routeHash(S.route) || location.pathname + location.search); } catch (e) { /* history unavailable */ } },
  historyBack() { history.back(); },
  // share a page of the site: system share sheet on phones (native in the apps), copied link elsewhere
  async shareLink(title, hash) {
    const url = location.origin + location.pathname + hash;
    const cap = window.Capacitor;
    try {
      if (isNative() && cap.Plugins && cap.Plugins.Share) { await cap.Plugins.Share.share({ title, text: title, url }); return; }
      if (navigator.share) { await navigator.share({ title, url }); return; }
    } catch (e) { if (e && (e.name === 'AbortError' || /cancel/i.test(e.message || ''))) return; }
    try { await navigator.clipboard.writeText(url); toast('Lien copié'); } catch (e) { toast(url); }
  },
};

// ---------- loaders ----------
async function loadConfig() {
  const { data } = await sb.from('app_config').select('*').eq('id', 1).maybeSingle();
  if (data) { S.config = { ...S.config, scanQuota: data.scan_quota, enforceQuota: data.enforce_quota, banner: data.banner || '' }; emit(); }
}
async function loadOverrides() {
  const { data } = await sb.from('catalog_overrides').select('*').limit(5000);
  const m = {};
  for (const r of data || []) m[r.card_id] = JSON.parse(JSON.stringify({ n: r.name || undefined, r: r.rarity || undefined, at: msOf(r.updated_at) }));
  S.overrides = m; emit();
}
async function loadCatalogLog() {
  if (!isAdmin()) return;
  const { data } = await sb.from('catalog_log').select('*').order('created_at', { ascending: false }).limit(300);
  const m = {};
  for (const r of data || []) m[r.id] = { card: r.card_id, before: r.before || {}, after: r.after || {}, note: r.note || '', by: r.author, at: msOf(r.created_at) };
  S.catalogLog = m; emit();
}
async function loadReports() {
  if (!isAdmin()) return;
  const { data } = await sb.from('reports').select('*').order('created_at', { ascending: false }).limit(500);
  S.reports = (data || []).map(r => ({ rid: r.id, from: r.reporter, target: r.target, reason: r.reason, ctx: r.context || {}, at: msOf(r.created_at), handled: r.handled_at ? msOf(r.handled_at) : 0 }));
  emit();
}
async function loadPubs() {
  if (!sb || S.mode !== 'cloud') return;
  const { data, error } = await sb.from('profiles').select('id, pseudo, pub, banned').not('pub', 'is', null).limit(2000);
  if (error) { console.warn('profiles', error); return; }
  const m = new Map(); const banned = {};
  for (const r of data) {
    if (r.banned) banned[r.id] = 1;
    m.set(r.id, { ...(r.pub || {}), pseudo: r.pseudo || (r.pub || {}).pseudo || '' });
  }
  S.pubs = m; S.config = { ...S.config, banned }; S.pubLoaded = true;
  schedulePub(); emit();
  loadTrust([...m.keys()]);
}
async function loadTrades() {
  if (!sb || S.mode !== 'cloud') return;
  const { data: ts } = await sb.from('trades').select('*').or(`a.eq.${S.me.id},b.eq.${S.me.id}`).order('updated_at', { ascending: false }).limit(200);
  const ids = (ts || []).map(t => t.id);
  let msgs = [];
  if (ids.length) { const r = await sb.from('trade_messages').select('*').in('trade_id', ids).order('created_at').limit(5000); msgs = r.data || []; }
  S.trades = (ts || []).map(t => {
    const o = { id: t.id, parties: [t.a, t.b], a: t.a, b: t.b, give: t.give || [], get: t.get || [], kind: t.kind, price: +t.price || 0, finalPrice: t.final_price != null ? +t.final_price : undefined, status: t.status, received: t.received || {}, at: msOf(t.created_at), upd: msOf(t.updated_at), lastBy: t.last_by, seen: t.seen || {}, msgs: {}, events: {} };
    for (const x of msgs) if (x.trade_id === t.id) {
      if (x.kind === 'event') o.events[x.id] = { by: x.author, s: x.status, at: msOf(x.created_at), t: x.body || '' };
      else o.msgs[x.id] = { by: x.author, t: x.body, at: msOf(x.created_at) };
    }
    return o;
  });
  emit();
  loadTrust(S.trades.map(t => (t.a === S.me.id ? t.b : t.a)));
  if (S.trades.some(t => t.status === 'done')) {
    const { data } = await sb.from('trade_reviews').select('trade_id').eq('author', S.me.id).limit(1000);
    S.myReviews = new Set((data || []).map(r => r.trade_id)); emit();
  }
}
let tradeTimer = null;
function loadTradesSoon() { clearTimeout(tradeTimer); tradeTimer = setTimeout(loadTrades, 250); }
async function loadDocs() {
  const { data, error } = await sb.from('user_docs').select('name, data').eq('user_id', S.me.id);
  if (error) { toast('Impossible de charger votre collection. Vérifiez votre connexion.'); return; }
  for (const d of data) if (!pendingPaths.has('doc:' + d.name)) applyPrivDoc(d.name, d.data);
  S.privLoaded = true;
  if (!data.length) migrateLocalData();
  schedulePub(); emit();
}
function localDocNames() {
  const names = ['settings', 'wish', 'binders', 'sealed', ...CAT.series.map(s => 'col-' + s.id)];
  return names.filter(n => lsGet('doc:' + n, null));
}
function migrateLocalData() {
  const names = localDocNames();
  if (!names.length) return;
  for (const n of names) applyPrivDoc(n, lsGet('doc:' + n, null));
  for (const n of names) { savePriv(n); try { localStorage.removeItem('cartotheque:doc:' + n); } catch (e) { /* ignore */ } }
  toast('Votre collection invitée a été transférée sur votre compte.');
}
function resetUserState() {
  S.col = {}; S.docs = { settings: {}, wish: { items: {} }, binders: { list: {} }, sealed: { items: {} } };
  S.trades = []; S.pubs = new Map(); S.reports = []; S.catalogLog = {};
  S.privLoaded = false; S.pubLoaded = false; lastPubJson = '';
  touchCol();
}

// ---------- session ----------
let channel = null, pubsTimer = null;
async function startCloud(user) {
  resetUserState();
  const { data: prof } = await sb.from('profiles').select('*').eq('id', user.id).maybeSingle();
  S.mode = 'cloud';
  S.me = { id: user.id, name: (prof && prof.pseudo) || (user.email || '').split('@')[0], email: user.email, avatar: '', color: '#888', isOwner: !!(prof && prof.is_admin), canEdit: !!(prof && prof.is_admin) };
  emit();
  await loadDocs();
  if (prof && prof.pseudo && !profile().pseudo) saveProfile({ pseudo: prof.pseudo });
  loadPubs(); loadTrades();
  if (isAdmin()) { loadReports(); loadCatalogLog(); }
  if (channel) sb.removeChannel(channel);
  channel = sb.channel('me-' + user.id)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'trades' }, loadTradesSoon)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'trade_messages' }, loadTradesSoon)
    .subscribe();
  clearInterval(pubsTimer);
  pubsTimer = setInterval(() => { if (document.visibilityState === 'visible') { loadPubs(); loadTrades(); } }, 90000);
  if (S.route.name === 'auth') { S.route = { name: 'home', params: {} }; S.hist = []; emit(); }
}

async function initPlatform() {
  window.addEventListener('popstate', e => {
    if (S.modal) { closeModal(); PF.onNavigate(); return; }
    const top = S.hist[S.hist.length - 1];
    // browser back to the page we came from: restore it (scroll, filters); otherwise (forward, history from before a reload) follow the address
    const nav = top && routeHash(top) === (location.hash || '') ? back : () => { S.route = routeFromHash(location.hash) || { name: 'home', params: {} }; S.navDir = 'back'; emit(); };
    // Safari and Chrome already animate their swipe-back gesture
    if (e.hasUAVisualTransition) nav(); else withTransition(nav);
  });
  // keep the address bar on the current page when the route changes without a navigation (sign-in, deletions…)
  listeners.add(() => {
    const h = routeHash(S.route);
    if ((location.hash || '') !== h) { try { history.replaceState(history.state, '', h || location.pathname + location.search); } catch (e) { /* history unavailable */ } }
  });
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); S.installPrompt = e; emit(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.mode === 'cloud') { loadPubs(); loadTrades(); } });
  PAGES.auth = AuthPage;
  MODALS.camera = CameraModal;
  if (!hasBackend()) {
    S.noBackend = true;
    PF.text.chip = 'Démo';
    PF.text.local = 'Version de démonstration sans serveur : votre collection reste sur cet appareil.';
    PF.text.scanLocal = "La reconnaissance photo sera disponible dès que le serveur sera branché. En attendant, utilisez la saisie rapide : nom ou numéro imprimé en bas de la carte.";
    PF.text.cloudOnly = 'Les échanges entre membres seront disponibles dès que le serveur sera branché.';
    startLocal(); return;
  }
  sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'cartotheque-auth' } });
  loadConfig(); loadOverrides();
  const { data } = await sb.auth.getSession();
  sb.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') { resetUserState(); startLocal(); go('home'); }
    else if (event === 'SIGNED_IN' && session && session.user.id !== S.me.id) startCloud(session.user);
  });
  if (data && data.session) await startCloud(data.session.user);
  else {
    startLocal();
    // first visit on the home page: welcome screen; a shared link opens its page directly
    if (!lsGet('welcomed', false) && S.route.name === 'home') { S.route = { name: 'auth', params: {} }; emit(); }
  }
}

// ---------- auth UI ----------
const AUTH_ERRORS = [
  [/invalid login credentials/i, 'E-mail ou mot de passe incorrect.'],
  [/already registered|already exists/i, 'Un compte existe déjà avec cet e-mail. Connectez-vous.'],
  [/password should be at least|weak password/i, 'Mot de passe trop court : 8 caractères minimum.'],
  [/email not confirmed/i, "Votre e-mail n'est pas encore confirmé."],
  [/rate limit|too many/i, 'Trop de tentatives. Patientez quelques minutes.'],
  [/invalid email|unable to validate email/i, 'Adresse e-mail invalide.'],
  [/signups not allowed/i, 'Les inscriptions sont fermées pour le moment.'],
  [/fetch|network/i, 'Pas de connexion au serveur. Vérifiez votre réseau.'],
];
const authMessage = e => { const m = String((e && e.message) || e || ''); const hit = AUTH_ERRORS.find(([re]) => re.test(m)); return hit ? hit[1] : 'Une erreur est survenue : ' + m; };

function AuthForm({ compact }) {
  const [mode, setMode] = useState('signup');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [pseudo, setPseudo] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  if (!sb) return html`<p class="notice warn small">Le serveur n'est pas encore configuré : l'application fonctionne en mode invité, sur cet appareil.</p>`;
  const submit = async e => {
    e.preventDefault(); setBusy(true); setMsg('');
    try {
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) throw new Error('invalid email');
      if (mode === 'signup') {
        if (!pseudo.trim()) { setMsg('Choisissez un pseudo.'); setBusy(false); return; }
        if (pw.length < 8) throw new Error('Password should be at least 8 characters');
        const { data, error } = await sb.auth.signUp({ email: email.trim(), password: pw, options: { data: { pseudo: pseudo.trim().slice(0, 30) } } });
        if (error) throw error;
        if (!data.session) setMsg('Compte créé. Confirmez votre adresse via le lien reçu par e-mail, puis connectez-vous.');
      } else {
        const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password: pw });
        if (error) throw error;
      }
      lsSet('welcomed', true);
    } catch (err) { setMsg(authMessage(err)); }
    setBusy(false);
  };
  return html`<form class="stack" novalidate onSubmit=${submit}>
    <${Seg} label="Compte" options=${[{ v: 'signup', l: 'Créer un compte' }, { v: 'login', l: 'Se connecter' }]} value=${mode} onChange=${m => { setMode(m); setMsg(''); }} />
    ${mode === 'signup' ? html`<label class="field">Pseudo<input id="auth-pseudo" name="cartotheque-pseudo" type="text" maxlength="30" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck=${false} data-lpignore="true" data-1p-ignore="true" data-bwignore="true" placeholder="ex. Rudy" value=${pseudo} onInput=${e => setPseudo(e.target.value)} /></label>` : null}
    <label class="field">E-mail<input id="auth-email" name="email" type="email" autocomplete="username" autocapitalize="off" spellcheck=${false} inputmode="email" value=${email} onInput=${e => setEmail(e.target.value)} /></label>
    <label class="field">Mot de passe<input id="auth-pw" name="password" type="password" autocomplete=${mode === 'signup' ? 'new-password' : 'current-password'} value=${pw} onInput=${e => setPw(e.target.value)} /></label>
    ${msg ? html`<p class="notice small" role="alert">${msg}</p>` : null}
    <button class="btn primary" type="submit" disabled=${busy}>${busy ? 'Un instant…' : mode === 'signup' ? 'Créer mon compte' : 'Me connecter'}</button>
    ${!compact && mode === 'signup' ? html`<p class="tiny muted">En créant un compte, vous acceptez que votre pseudo, votre région (facultative) et les cartes que vous rendez publiques soient visibles des autres membres. Votre collection reste privée par défaut. Version de test : vos données peuvent être réinitialisées.</p>` : null}
  </form>`;
}

function AuthPage() {
  return html`<div class="auth-wrap"><div class="auth-card">
    <div class="row"><span class="brand-mark"></span><span class="brand-name">Cartothèque</span></div>
    <div class="stack s"><h1>Votre collection Pokémon, au bon prix</h1><p class="muted">Scannez vos cartes, suivez leur cote, rangez-les dans des classeurs virtuels et trouvez les membres avec qui échanger.</p></div>
    <div class="panel"><${AuthForm} /></div>
    <button class="btn ghost" onClick=${() => { lsSet('welcomed', true); S.route = { name: 'home', params: {} }; emit(); }}>Explorer sans compte</button>
  </div></div>`;
}

function LoginButton() {
  if (!sb) return null;
  return html`<button class="btn primary sm" style="align-self:flex-start" onClick=${() => go('auth')}>Créer un compte ou se connecter</button>`;
}

function AccountPanel() {
  const install = S.installPrompt;
  return html`<div class="panel stack s">
    <div class="spread"><h2>Compte</h2>${S.mode === 'cloud' ? html`<button class="btn sm" onClick=${() => sb.auth.signOut()}>Se déconnecter</button>` : null}</div>
    ${S.mode === 'cloud' ? html`<p class="small">Connecté avec <b>${S.me.email}</b>${isAdmin() ? ' · administrateur' : ''}.</p>` : html`<${AuthForm} compact=${true} />`}
    ${install ? html`<button class="btn" style="align-self:flex-start" onClick=${async () => { install.prompt(); try { await install.userChoice; } catch (e) { /* dismissed */ } S.installPrompt = null; emit(); }}><${Icon} n="download" />Installer l'application sur cet appareil</button>` : null}
  </div>`;
}
PF.LoginButton = LoginButton;
PF.AccountPanel = AccountPanel;

// ---------- install invitation (Android: install prompt; iPhone: Safari has no prompt, so explain the share menu) ----------
const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => { try { return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; } catch (e) { return false; } };
function InstallHint() {
  const [hidden, setHidden] = useState(() => lsGet('installHint', 0) > Date.now());
  if (hidden || isNative() || isStandalone()) return null;
  const install = S.installPrompt, ios = isIOS();
  if (!install && !ios) return null;
  const dismiss = () => { lsSet('installHint', Date.now() + 30 * 864e5); setHidden(true); };
  return html`<section class="install-hint" aria-label="Installer l'application">
    <img src="icons/icon-192.png" alt="" width="44" height="44" />
    <div class="grow"><b>Installez Cartothèque sur votre ${ios ? 'iPhone' : 'téléphone'}</b>
      <p class="small muted">${ios ? html`Touchez <b>Partager</b> <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px" aria-hidden="true"><path d="M12 15V3M8 7l4-4 4 4M6 11H5v10h14V11h-1" /></svg> dans Safari, puis <b>Sur l'écran d'accueil</b> : Cartothèque s'ouvre en plein écran, comme une application.` : "Accès direct depuis l'écran d'accueil, en plein écran, avec le catalogue disponible hors connexion."}</p></div>
    ${install ? html`<button class="btn primary sm" onClick=${async () => { install.prompt(); try { await install.userChoice; } catch (e) { /* dismissed */ } S.installPrompt = null; emit(); }}>Installer</button>` : null}
    <button class="icon-btn" aria-label="Masquer pendant un mois" onClick=${dismiss}><${Icon} n="x" /></button>
  </section>`;
}
PF.InstallHint = InstallHint;

// ---------- live camera scanner ----------
function CameraModal() {
  const vid = useRef(null), frameRef = useRef(null);
  const [err, setErr] = useState('');
  const [n, setN] = useState(0);
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    let stream = null, alive = true;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
        if (!alive) { stream.getTracks().forEach(t => t.stop()); return; }
        vid.current.srcObject = stream;
        await vid.current.play();
      } catch (e) {
        setErr(e && e.name === 'NotAllowedError' ? "L'accès à la caméra a été refusé. Autorisez-le dans les réglages, ou utilisez « Appareil photo » / « Importer des photos »." : "Impossible d'ouvrir la caméra ici. Utilisez « Appareil photo » ou « Importer des photos ».");
      }
    })();
    return () => { alive = false; if (stream) stream.getTracks().forEach(t => t.stop()); };
  }, []);
  const shoot = async () => {
    const v = vid.current;
    if (!v || !v.videoWidth) return;
    const cv = document.createElement('canvas'); cv.width = v.videoWidth; cv.height = v.videoHeight;
    cv.getContext('2d').drawImage(v, 0, 0);
    const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.92));
    if (!blob) return;
    // guide frame in video pixels (the video is shown with object-fit: cover)
    let hint = null;
    const fr = frameRef.current && frameRef.current.getBoundingClientRect(), vr = v.getBoundingClientRect();
    if (fr && vr.width) {
      const s = Math.max(vr.width / v.videoWidth, vr.height / v.videoHeight);
      const ox = vr.left + (vr.width - v.videoWidth * s) / 2, oy = vr.top + (vr.height - v.videoHeight * s) / 2;
      hint = { x: (fr.left - ox) / s / v.videoWidth, y: (fr.top - oy) / s / v.videoHeight, w: fr.width / s / v.videoWidth, h: fr.height / s / v.videoHeight };
    }
    queueScans([{ blob, hint }]);
    setN(x => x + 1); setFlash(true); setTimeout(() => setFlash(false), 140);
    haptic('strong');
  };
  return html`<div class="cam" role="dialog" aria-modal="true" aria-label="Scanner">
    <video ref=${vid} class="cam-video" playsinline muted autoplay></video>
    <div class="cam-frame" ref=${frameRef} aria-hidden="true"><i></i><i></i><i></i><i></i></div>
    ${flash ? html`<div class="cam-flash"></div>` : null}
    <div class="cam-top"><span>${n ? `${n} photo${n > 1 ? 's' : ''} en cours d'identification` : (scanEngine() === 'free' ? 'Faites remplir le cadre par la carte' : 'Cadrez une carte ou une page de classeur')}</span><button class="icon-btn" aria-label="Fermer le scanner" onClick=${closeModal}><${Icon} n="x" /></button></div>
    ${err ? html`<p class="cam-err">${err}</p>` : null}
    <div class="cam-bar"><button class="btn" onClick=${closeModal}>${n ? 'Voir les résultats' : 'Fermer'}</button><button class="cam-shutter" aria-label="Prendre la photo" disabled=${!!err} onClick=${shoot}></button><span class="count">${n ? '×' + n : ''}</span></div>
  </div>`;
}
