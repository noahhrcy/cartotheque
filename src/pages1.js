/* ============================================================
   Cartothèque — shell, home, catalogue, sets, card page
   ============================================================ */
const isAdmin = () => S.mode === 'cloud' && (S.me.isOwner || S.me.canEdit);
const NAV = [
  { r: 'home', l: 'Accueil', i: 'home' },
  { r: 'cards', l: 'Cartes', i: 'search' },
  { r: 'sets', l: 'Extensions', i: 'layers' },
  { r: 'collection', l: 'Collection', i: 'binder' },
  { r: 'market', l: 'Marché', i: 'swap' },
  { r: 'scan', l: 'Scanner', i: 'scan' },
  { r: 'profile', l: 'Profil', i: 'user' },
];
const SECTION_OF = { set: 'sets', card: 'cards', binder: 'collection', trade: 'market', user: 'market', about: 'profile', admin: 'admin' };
const section = () => SECTION_OF[S.route.name] || S.route.name;

function TopBar() {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const notes = notifications();
  return html`<header class="top"><div class="top-in">
    <button class="brand" onClick=${() => go('home')} aria-label="Accueil Cartothèque"><span class="brand-mark"></span><span class="brand-name">Cartothèque</span></button>
    <nav class="nav" aria-label="Navigation principale">
      ${NAV.map(n => html`<button aria-current=${section() === n.r ? 'page' : null} onClick=${() => go(n.r)}>${n.l}</button>`)}
      ${isAdmin() ? html`<button aria-current=${section() === 'admin' ? 'page' : null} onClick=${() => go('admin')}>Admin</button>` : null}
    </nav>
    <form class="top-search" onSubmit=${e => { e.preventDefault(); if (q.trim()) go('cards', { q: q.trim() }); }}>
      <input id="top-q" type="search" placeholder="Rechercher une carte…" value=${q} onInput=${e => setQ(e.target.value)} aria-label="Rechercher une carte" />
    </form>
    <div class="top-actions" style="margin-left:auto">
      ${S.mode === 'local' ? html`<span class="chip" title="Vos données sont enregistrées sur cet appareil uniquement">${PF.text.chip}</span>` : null}
      <div style="position:relative">
        <button class="icon-btn" aria-label="Notifications" aria-expanded=${String(open)} onClick=${() => setOpen(!open)}><${Icon} n="bell" />${notes.length ? html`<span class="badge-dot">${notes.length}</span>` : null}</button>
        ${open ? html`<div class="dropdown" role="menu">
          <div class="eyebrow" style="padding:4px 8px 8px">Notifications</div>
          ${notes.length ? notes.map(n => html`<button class="notif" onClick=${() => { setOpen(false); go(...n.go); }}><span class="dot" style=${`background:${n.color}`}></span><span class="small">${n.text}</span></button>`) : html`<p class="small muted" style="padding:8px">Rien de nouveau. Vous serez prévenu ici des hausses de prix, des cartes de votre wishlist disponibles et des propositions d'échange.</p>`}
        </div>` : null}
      </div>
      <button class="icon-btn" style="padding:0;overflow:hidden" aria-label="Mon profil" onClick=${() => go('profile')}>${S.me.avatar ? html`<img class="avatar" src=${S.me.avatar} alt="" style="border:0" />` : html`<${Icon} n="user" />`}</button>
    </div>
  </div></header>`;
}

function TabBar() {
  const tabs = [{ r: 'home', l: 'Accueil', i: 'home' }, { r: 'collection', l: 'Collection', i: 'binder' }, { r: 'scan', l: 'Scanner', i: 'scan' }, { r: 'market', l: 'Marché', i: 'swap' }, { r: 'profile', l: 'Profil', i: 'user' }];
  return html`<nav class="tabbar" aria-label="Navigation">${tabs.map(t => t.r === 'scan'
    ? html`<button class="scan-tab" aria-current=${section() === 'scan' ? 'page' : null} onClick=${() => go('scan')}><span class="ring"><${Icon} n="scan" s=${22} /></span>${t.l}</button>`
    : html`<button aria-current=${section() === t.r || (t.r === 'home' && ['cards', 'sets'].includes(section())) ? 'page' : null} onClick=${() => go(t.r)}><${Icon} n=${t.i} />${t.l}</button>`)}</nav>`;
}

function Back() { return S.hist.length ? html`<button class="back" onClick=${back}><${Icon} n="left" s=${16} />Retour</button>` : null; }

// ---------- home ----------
function HomePage() {
  const st = colStats();
  const name = profile().pseudo || S.me.name;
  const [q, setQ] = useState('');
  const movers = useMemo(() => CAT.cards.filter(c => c.p >= 3 && c.conf >= 75 && c.d7 != null && c.d7 <= 1 && c.v[c.mv].cm.a1 > 0 && c.v[c.mv].cm.a7 > 0).sort((a, b) => b.d7 - a.d7).slice(0, 7), []);
  const latest = CAT.latestSets.slice(0, 5);
  const top = useMemo(() => [...CAT.latestSets[0].cards].sort((a, b) => b.p - a.p).slice(0, 12), []);
  const recent = lsGet('recent', []).map(id => CAT.byId.get(id)).filter(Boolean).slice(0, 12);
  const wishAvail = Object.keys(wishItems()).filter(id => availability(id) > 0).length;
  const snap = fmtDate(CAT.meta.snapshot);
  return html`<div class="stack l">
    <section class="hero">
      <div class="hero-main">
        <div class="hero-pocket" aria-hidden="true">${Array.from({ length: 9 }, () => html`<i></i>`)}</div>
        <div class="eyebrow">${name ? `Bonjour ${name}` : 'Bonjour'} · prix au ${snap}</div>
        <div>
          <div class="small" style="opacity:.75;margin-bottom:6px">Valeur estimée de votre collection</div>
          <div class="big">${st.cards ? fmtEUR(st.value) : '0 €'}</div>
          ${st.cards && st.d7 != null ? html`<div class="small" style="margin-top:6px">${fmtPct(st.d7)} par rapport à la moyenne 7 jours</div>` : null}
        </div>
        <div class="statline">
          <div class="stat"><span class="eyebrow">Cartes</span><span class="v">${fmtInt(st.cards)}</span></div>
          <div class="stat"><span class="eyebrow">Extensions</span><span class="v">${fmtInt(st.sets)}</span></div>
          <div class="stat"><span class="eyebrow">Recherchées</span><span class="v">${fmtInt(st.wanted)}</span></div>
        </div>
        <div class="row">
          <button class="btn scan" onClick=${() => go('scan')}><${Icon} n="scan" />Scanner une carte</button>
          <button class="btn alt" onClick=${() => go('collection')}>${st.cards ? 'Ma collection' : 'Commencer ma collection'}</button>
        </div>
      </div>
      <div class="panel stack">
        <form class="stack s" onSubmit=${e => { e.preventDefault(); go('cards', { q: q.trim() }); }}>
          <label class="eyebrow" for="home-q">Rechercher une carte</label>
          <div class="row tight" style="flex-wrap:nowrap"><input id="home-q" class="grow" type="search" placeholder="Dracaufeu, 125/197, MEW 6…" value=${q} onInput=${e => setQ(e.target.value)} /><button class="btn dark" type="submit">Chercher</button></div>
          <p class="tiny muted">${fmtInt(CAT.meta.cards)} cartes · ${CAT.meta.sets} extensions françaises, de 1999 à aujourd'hui</p>
        </form>
        ${wishAvail ? html`<button class="notice" style="border:0;text-align:left;cursor:pointer" onClick=${() => go('market', { tab: 'matches' })}><b>${wishAvail === 1 ? '1 carte' : wishAvail + ' cartes'} de votre wishlist ${wishAvail === 1 ? 'est disponible' : 'sont disponibles'}</b> chez des membres. Voir les correspondances →</button>` : null}
        <div class="stack s">
          <div class="eyebrow">Dernières extensions</div>
          <div class="row tight">${latest.map(s => html`<button class="chip" onClick=${() => go('set', { id: s.id })}>${s.n}</button>`)}<button class="chip" onClick=${() => go('sets')}>Toutes →</button></div>
        </div>
        ${S.mode === 'local' ? html`<div class="notice warn small stack s"><span>${PF.text.local}</span>${PF.LoginButton ? html`<${PF.LoginButton} />` : null}</div>` : null}
      </div>
    </section>

    ${!st.cards && S.privLoaded ? html`<${Empty} title="Votre classeur est encore vide" action=${html`<div class="row" style="justify-content:center"><button class="btn primary" onClick=${() => go('scan')}><${Icon} n="scan" />Scanner ma première carte</button><button class="btn" onClick=${() => go('sets')}>Parcourir les extensions</button></div>`}>Scannez une carte ou ajoutez-la depuis le catalogue : sa cote s'affiche, vous choisissez l'état et la quantité, et la valeur de votre collection se met à jour.<//>` : null}

    <section class="grid-2">
      <div class="panel">
        <div class="section-h"><h2>En hausse cette semaine</h2><span class="tiny muted">tendance vs moyenne 7 j · cartes > 3 €</span></div>
        ${movers.map(c => html`<button class="mover" onClick=${() => go('card', { id: c.id })}><${MiniTile} c=${c} w=${40} /><span style="min-width:0"><span class="nm" style="display:block">${cardName(c)}</span><span class="tiny muted">${c.set.n} · ${numLabel(c)}</span></span><span style="text-align:right"><span class="num small" style="display:block">${fmtEUR(c.p)}</span><${Delta} x=${c.d7} /></span></button>`)}
      </div>
      <div class="panel">
        <div class="section-h"><h2>Nouvelles extensions</h2><button class="btn ghost sm" onClick=${() => go('sets')}>Tout voir</button></div>
        <div class="stack s">${latest.map(s => html`<${SetRow} s=${s} />`)}</div>
      </div>
    </section>

    <section>
      <div class="section-h"><h2>Les plus cotées · ${CAT.latestSets[0].n}</h2><button class="btn ghost sm" onClick=${() => go('set', { id: CAT.latestSets[0].id })}>Voir l'extension</button></div>
      <div class="hscroll">${top.map(c => html`<${CardCell} c=${c} />`)}</div>
    </section>

    ${recent.length ? html`<section><div class="section-h"><h2>Consultées récemment</h2></div><div class="hscroll">${recent.map(c => html`<${CardCell} c=${c} />`)}</div></section>` : null}
  </div>`;
}

function SetRow({ s }) {
  const pr = setProgress(s);
  return html`<button class="set-row" onClick=${() => go('set', { id: s.id })}>
    <${SetCode} s=${s} />
    <span style="min-width:0"><b style="display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${s.n}</b><span class="tiny muted">${(CAT.serieById.get(s.s) || {}).n || ''} · ${s.d ? fmtDate(s.d) : ''}</span>${pr.have ? html`<div class="bar" style="margin-top:6px"><i style=${`width:${Math.round(100 * pr.have / pr.total)}%`}></i></div>` : null}</span>
    <span class="num small" style="text-align:right">${pr.have ? html`${pr.have}/${pr.total}` : html`${s.o || s.c}${s.t > s.o ? html`<span class="muted">+${s.t - s.o}</span>` : null}`}</span>
  </button>`;
}

// ---------- catalogue ----------
function CardsPage({ q: q0, serie: serie0 }) {
  const [q, setQ] = useState(q0 || '');
  const [dq, setDq] = useState(q0 || '');
  const [serie, setSerie] = useState(serie0 || '');
  const [setIdx, setSetIdx] = useState('');
  const [cat, setCat] = useState('');
  const [type, setType] = useState('');
  const [rarity, setRarity] = useState('');
  const [sort, setSort] = useState('relevance');
  const [n, setN] = useState(60);
  useEffect(() => { const t = setTimeout(() => { setDq(q); setN(60); }, 160); return () => clearTimeout(t); }, [q]);
  const res = useMemo(() => {
    if (!dq.trim() && setIdx === '' && !serie && cat === '' && type === '' && rarity === '') return null;
    return searchCards(dq, { setIdx: setIdx === '' ? null : +setIdx, serie, cat, type, rarity, sort });
  }, [dq, serie, setIdx, cat, type, rarity, sort]);
  const setsOfSerie = CAT.latestSets.filter(s => !serie || s.s === serie);
  return html`<div class="stack">
    <div class="spread"><h1>Toutes les cartes</h1><span class="small muted">${fmtInt(CAT.meta.cards)} cartes référencées</span></div>
    <div class="panel stack s">
      <input id="cards-q" type="search" placeholder="Nom de la carte, numéro (125/197) ou code d'extension (MEW 6)" value=${q} onInput=${e => setQ(e.target.value)} autofocus />
      <div class="row tight">
        <select id="f-serie" aria-label="Série" value=${serie} onChange=${e => { setSerie(e.target.value); setSetIdx(''); }}><option value="">Toutes les séries</option>${[...CAT.series].reverse().map(s => html`<option value=${s.id}>${s.n}</option>`)}</select>
        <select id="f-set" aria-label="Extension" value=${setIdx} onChange=${e => setSetIdx(e.target.value)}><option value="">Toutes les extensions</option>${setsOfSerie.map(s => html`<option value=${s.i}>${s.n}</option>`)}</select>
        <select id="f-cat" aria-label="Catégorie" value=${cat} onChange=${e => setCat(e.target.value)}><option value="">Pokémon, Dresseur, Énergie</option>${CAT.meta.cats.map((c, i) => html`<option value=${i}>${c}</option>`)}</select>
        <select id="f-type" aria-label="Type" value=${type} onChange=${e => setType(e.target.value)}><option value="">Tous les types</option>${CAT.meta.types.map((t, i) => html`<option value=${i}>${t}</option>`)}</select>
        <select id="f-rarity" aria-label="Rareté" value=${rarity} onChange=${e => setRarity(e.target.value)}><option value="">Toutes les raretés</option>${CAT.meta.rarities.map((r, i) => html`<option value=${i}>${r}</option>`)}</select>
        <select id="f-sort" aria-label="Tri" value=${sort} onChange=${e => setSort(e.target.value)}><option value="relevance">Pertinence</option><option value="price-desc">Prix décroissant</option><option value="price-asc">Prix croissant</option><option value="recent">Plus récentes</option><option value="number">Extension et numéro</option></select>
      </div>
    </div>
    ${res === null ? html`<div class="stack">
      <p class="muted small">Tapez un nom, un numéro ou choisissez une série pour commencer. Quelques idées :</p>
      <div class="row tight">${['Dracaufeu', 'Pikachu', '125/197', 'MEW 199', 'Mewtwo', 'Évoli', 'Lugia', 'Professeur'].map(x => html`<button class="chip" onClick=${() => setQ(x)}>${x}</button>`)}</div>
    </div>` : res.length ? html`<div class="stack">
      <p class="small muted">${plural(res.length, 'carte trouvée', 'cartes trouvées')}</p>
      <div class="grid-cards">${res.slice(0, n).map(c => html`<${CardCell} key=${c.id} c=${c} sub=${c.set.n} />`)}</div>
      ${res.length > n ? html`<button class="btn" style="align-self:center" onClick=${() => setN(n + 60)}>Afficher plus (${fmtInt(res.length - n)} restantes)</button>` : null}
    </div>` : html`<${Empty} title="Aucune carte ne correspond">Vérifiez l'orthographe ou essayez le numéro imprimé en bas de la carte, par exemple 125/197.<//>`}
  </div>`;
}

// ---------- sets ----------
function SetsPage() {
  const [f, setF] = useState('');
  const groups = [...CAT.series].reverse().map(se => ({ se, sets: CAT.latestSets.filter(s => s.s === se.id && (!f || norm(s.n).includes(norm(f)) || norm(s.a) === norm(f))) })).filter(g => g.sets.length);
  return html`<div class="stack l">
    <div class="spread"><h1>Extensions</h1><input id="sets-f" type="search" placeholder="Filtrer les extensions" value=${f} onInput=${e => setF(e.target.value)} style="max-width:260px" /></div>
    ${groups.map(g => html`<section key=${g.se.id}><div class="section-h"><h2>${g.se.n}</h2><span class="tiny muted">${plural(g.sets.length, 'extension')}</span></div><div class="grid-2">${g.sets.map(s => html`<${SetRow} s=${s} />`)}</div></section>`)}
  </div>`;
}

function SetPage({ id }) {
  const s = CAT.setById.get(id);
  const [view, setView] = useState('all');
  const [showMissing, setShowMissing] = useState(false);
  if (!s) return html`<${Empty} title="Extension introuvable" />`;
  const om = owned();
  const pr = setProgress(s);
  const missing = s.cards.filter(c => !om.has(c.id));
  const budget = missing.reduce((a, c) => a + (c.p || 0), 0);
  const avail = S.mode === 'cloud' ? missing.filter(c => availability(c.id) > 0) : [];
  const availBudget = avail.reduce((a, c) => a + (c.p || 0), 0);
  const list = view === 'own' ? s.cards.filter(c => om.has(c.id)) : view === 'missing' ? missing : s.cards;
  const value = s.cards.reduce((a, c) => a + (c.p || 0), 0);
  const existing = Object.entries(binderList()).find(([, b]) => b.kind === 'set' && b.set === s.id);
  return html`<div class="stack l">
    <div><${Back} />
      <div class="spread" style="align-items:flex-end">
        <div class="stack s"><div class="eyebrow">${(CAT.serieById.get(s.s) || {}).n} · ${s.d ? fmtDate(s.d) : ''}${s.a ? ' · ' + s.a : ''}</div><h1>${s.n}</h1>
          <p class="small muted">${s.o} cartes numérotées${s.t > s.o ? ` + ${s.t - s.o} secrètes` : ''} · valeur du set complet ≈ <b class="num">${fmtEUR(value)}</b>${s.lg.includes('S') ? ' · légal en Standard' : ''}</p></div>
        <div class="row">
          ${existing ? html`<button class="btn" onClick=${() => go('binder', { id: existing[0] })}><${Icon} n="binder" />Ouvrir mon classeur</button>` : html`<button class="btn" onClick=${() => openModal('binder', { set: s.id })}><${Icon} n="binder" />Créer un classeur pour ce set</button>`}
        </div>
      </div>
    </div>
    <div class="panel stack s">
      <div class="spread"><b>${pr.have} / ${pr.total} cartes · ${Math.round(100 * pr.have / Math.max(1, pr.total))} %</b><span class="small muted">Possédées : ${pr.have} · Manquantes : ${missing.length}</span></div>
      <div class="bar"><i style=${`width:${100 * pr.have / Math.max(1, pr.total)}%`}></i></div>
      <div class="row" style="justify-content:space-between">
        <span class="small">${missing.length ? html`Compléter ce set coûterait environ <b class="num">${fmtEUR(budget)}</b>${S.mode === 'cloud' ? html` · <b>${avail.length}</b> manquantes disponibles chez des membres${avail.length ? html` (≈ ${fmtEUR(availBudget)})` : null}` : null}` : 'Set complet, bravo.'}</span>
        ${missing.length ? html`<button class="btn sm" onClick=${() => setShowMissing(!showMissing)}>${showMissing ? 'Masquer' : 'Voir les cartes manquantes'}</button>` : null}
      </div>
      ${showMissing ? html`<div class="stack s" style="margin-top:6px">
        <div class="row tight"><button class="btn sm" onClick=${() => { for (const c of missing) if (!inWish(c.id)) wishItems()[c.id] = { at: Date.now(), p: 2 }; savePriv('wish'); emit(); toast(`${missing.length} cartes ajoutées à vos recherches`); }}><${Icon} n="heart" />Tout ajouter à mes recherches</button>${avail.length ? html`<button class="btn sm primary" onClick=${() => go('market', { tab: 'matches' })}>Voir qui les propose</button>` : null}</div>
        <div class="table-wrap"><table class="data"><thead><tr><th>N°</th><th>Carte</th><th>Rareté</th><th class="r">Cote</th><th class="r">Chez des membres</th></tr></thead><tbody>
          ${[...missing].sort((a, b) => b.p - a.p).slice(0, 80).map(c => html`<tr style="cursor:pointer" onClick=${() => go('card', { id: c.id })}><td class="num">${numLabel(c)}</td><td>${cardName(c)}</td><td class="small">${rarityName(c)}</td><td class="r num">${fmtEUR(c.p)}</td><td class="r num">${availability(c.id) || '—'}</td></tr>`)}
        </tbody></table></div>
      </div>` : null}
    </div>
    <div class="spread"><${Seg} options=${[{ v: 'all', l: `Toutes (${s.cards.length})` }, { v: 'own', l: `Possédées (${pr.have})` }, { v: 'missing', l: `Manquantes (${missing.length})` }]} value=${view} onChange=${setView} /></div>
    <div class="grid-cards">${list.map(c => html`<${CardCell} key=${c.id} c=${c} missing=${view === 'all' && pr.have > 0 && !om.has(c.id)} />`)}</div>
  </div>`;
}

// ---------- card page ----------
const RANGES = [{ v: 7, l: '7 j' }, { v: 30, l: '30 j' }, { v: 90, l: '3 m' }, { v: 180, l: '6 m' }, { v: 365, l: '1 an' }, { v: 0, l: 'Tout' }];
function HistoryChart({ hist }) {
  const [range, setRange] = useState(30);
  const last = hist[hist.length - 1][0];
  const pts = range ? hist.filter(p => p[0] >= last - range * 864e5) : hist;
  const use = pts.length >= 2 ? pts : hist.slice(-2);
  const ys = use.map(p => p[1]);
  const lo = Math.min(...ys), hi = Math.max(...ys), pad = Math.max((hi - lo) * 0.25, hi * 0.05);
  const min = Math.max(0, lo - pad), max = hi + pad;
  const t0 = use[0][0], t1 = use[use.length - 1][0];
  const W = 420, H = 170, L = 54, R = 10, T = 10, B = 24;
  const X = t => L + (t1 === t0 ? 1 : (t - t0) / (t1 - t0)) * (W - L - R);
  const Y = y => T + (1 - (y - min) / (max - min || 1)) * (H - T - B);
  const d = use.map((p, i) => `${i ? 'L' : 'M'}${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join(' ');
  const ticks = [min + (max - min) * 0.15, (min + max) / 2, max - (max - min) * 0.15];
  const ch = use[use.length - 1][1] / use[0][1] - 1;
  return html`<div class="stack s">
    <div class="spread"><${Seg} label="Période" options=${RANGES.map(r => ({ v: r.v, l: r.l }))} value=${range} onChange=${setRange} /><span class="small">Sur la période : <${Delta} x=${ch} /></span></div>
    <svg class="chart" viewBox=${`0 0 ${W} ${H}`} role="img" aria-label="Historique du prix">
      ${ticks.map(t => html`<g><line x1=${L} x2=${W - R} y1=${Y(t)} y2=${Y(t)} stroke="var(--line)" stroke-width="1" /><text x=${L - 8} y=${Y(t) + 4} text-anchor="end" font-size="11" fill="var(--muted)" font-family="var(--f-mono)">${fmtEUR(t, false)}</text></g>`)}
      <text x=${L} y=${H - 7} font-size="11" fill="var(--muted)" font-family="var(--f-mono)">${fmtShort(t0)}</text>
      <text x=${W - R} y=${H - 7} text-anchor="end" font-size="11" fill="var(--muted)" font-family="var(--f-mono)">${fmtShort(t1)}</text>
      <path d=${d + ` L${X(t1)},${H - B} L${X(t0)},${H - B} Z`} fill="var(--accent)" opacity="0.1" />
      <path d=${d} fill="none" stroke="var(--accent)" stroke-width="2.2" stroke-linejoin="round" />
      <circle cx=${X(t1)} cy=${Y(use[use.length - 1][1])} r="4.5" fill="var(--accent)" stroke="var(--surface)" stroke-width="2" />
    </svg>
    <p class="tiny muted">Tendance Cardmarket relevée chaque jour depuis le ${fmtDate(hist[0][0])} (variante principale).</p>
  </div>`;
}

function PriceChart({ v, est }) {
  const cm = v.cm;
  // Approximate daily levels from the rolling averages: days -30..-8, -7..-2, yesterday, today (trend).
  const a30 = cm.a30, a7 = cm.a7, a1 = cm.a1;
  const segs = [];
  if (a30 > 0 && a7 > 0) segs.push({ x0: -30, x1: -7, y: Math.max(0.01, (30 * a30 - 7 * a7) / 23) });
  else if (a30 > 0) segs.push({ x0: -30, x1: -7, y: a30 });
  if (a7 > 0 && a1 > 0) segs.push({ x0: -7, x1: -1, y: Math.max(0.01, (7 * a7 - a1) / 6) });
  else if (a7 > 0) segs.push({ x0: -7, x1: -1, y: a7 });
  if (a1 > 0) segs.push({ x0: -1, x1: 0, y: a1 });
  if (cm.trend > 0) segs.push({ x0: 0, x1: 0, y: cm.trend });
  if (segs.length < 2) return html`<p class="small muted">Pas assez de données de marché pour tracer l'évolution.</p>`;
  const ys = [...segs.map(p => p.y), est.value].filter(y => y > 0);
  const lo = Math.min(...ys), hi = Math.max(...ys), pad = Math.max((hi - lo) * 0.35, hi * 0.06);
  const min = Math.max(0, lo - pad), max = hi + pad;
  const W = 420, H = 170, L = 54, R = 10, T = 10, B = 24;
  const X = d => L + (d + 30) / 30 * (W - L - R);
  const Y = y => T + (1 - (y - min) / (max - min || 1)) * (H - T - B);
  let d = '';
  segs.forEach((p, i) => { d += (i ? ` L${X(p.x0)},${Y(p.y)}` : `M${X(p.x0)},${Y(p.y)}`) + ` L${X(p.x1)},${Y(p.y)}`; });
  const area = d + ` L${X(0)},${H - B} L${X(-30)},${H - B} Z`;
  const ticks = [min + (max - min) * 0.15, (min + max) / 2, max - (max - min) * 0.15];
  return html`<svg class="chart" viewBox=${`0 0 ${W} ${H}`} role="img" aria-label="Évolution approximative du prix sur 30 jours">
    ${ticks.map(t => html`<g><line x1=${L} x2=${W - R} y1=${Y(t)} y2=${Y(t)} stroke="var(--line)" stroke-width="1" /><text x=${L - 8} y=${Y(t) + 4} text-anchor="end" font-size="11" fill="var(--muted)" font-family="var(--f-mono)">${fmtEUR(t, false)}</text></g>`)}
    ${[-30, -21, -14, -7, 0].map(x => html`<text x=${X(x)} y=${H - 7} text-anchor=${x === 0 ? 'end' : x === -30 ? 'start' : 'middle'} font-size="11" fill="var(--muted)" font-family="var(--f-mono)">${x === 0 ? "aujourd'hui" : x + ' j'}</text>`)}
    <path d=${area} fill="var(--accent)" opacity="0.1" />
    <path d=${d} fill="none" stroke="var(--accent)" stroke-width="2.2" stroke-linejoin="round" />
    ${cm.trend > 0 ? html`<circle cx=${X(0)} cy=${Y(cm.trend)} r="4.5" fill="var(--accent)" stroke="var(--surface)" stroke-width="2" />` : null}
  </svg>`;
}

function CardPage({ id }) {
  const c = CAT.byId.get(id);
  const [vi, setVi] = useState(c ? c.mv : 0);
  const [det, setDet] = useState(null);
  const [sales, setSales] = useState(null);
  const [hist, setHist] = useState(null);
  useEffect(() => {
    if (!c) return;
    loadHistory(c.set.id).then(h => {
      if (!h || !h.p || !h.p[id]) return;
      const series = h.d.map((d, i) => [Date.parse(d + 'T12:00:00Z'), h.p[id][i]]).filter(p => p[1] > 0);
      if (series.length >= 2) setHist(series);
    });
    const r = lsGet('recent', []).filter(x => x !== id); r.unshift(id); lsSet('recent', r.slice(0, 20));
    loadDetails(c.set.id).then(d => setDet(d[id] || {}));
    if (S.mode === 'cloud') PF.fetchSales(id).then(setSales).catch(() => setSales([]));
  }, [id]);
  if (!c) return html`<${Empty} title="Carte introuvable" />`;
  const v = c.v[vi] || c.v[c.mv];
  const est = estimate(v);
  const st = statusOf(id);
  const who = S.mode === 'cloud' ? whoHas(id) : null;
  const serieId = (CAT.serieById.get(c.set.s) || {}).id;
  const img = det && det.im ? det.im + '/high.webp' : null;
  const tpF = CAT.meta.tpFactor;
  const d7 = v.cm.trend > 0 && v.cm.a7 > 0 ? v.cm.trend / v.cm.a7 - 1 : null;
  const d30 = v.cm.trend > 0 && v.cm.a30 > 0 ? v.cm.trend / v.cm.a30 - 1 : null;
  const d1 = v.cm.a1 > 0 && v.cm.a7 > 0 ? v.cm.a1 / v.cm.a7 - 1 : null;
  const needOwn = fn => () => st.own ? fn() : toast("Ajoutez d'abord la carte à votre collection.");
  return html`<div class="stack l">
    <div><${Back} /></div>
    <div class="card-page">
      <div class="stack card-visual">
        <div class="tile-wrap"><${CardTile} c=${c} vi=${vi} hq=${true} /></div>
        <div class="action-grid">
          <button class="action" onClick=${() => openModal('add', { id, vi })}><span class="ic" style="background:var(--st-own)">+</span>${st.own ? `Possédée ×${st.own}` : 'Ajouter à ma collection'}</button>
          <button class=${'action' + (st.want ? ' on' : '')} style=${st.want ? 'color:var(--st-want)' : ''} onClick=${() => { toggleWish(id); toast(st.want ? 'Retirée de vos recherches' : 'Ajoutée à vos recherches'); }}><span class="ic" style="background:var(--st-want)">♥</span>${st.want ? 'Recherchée' : 'Je la recherche'}</button>
          <button class=${'action' + (st.trade ? ' on' : '')} style=${st.trade ? 'color:var(--st-trade)' : ''} onClick=${needOwn(() => openModal('copies', { id, mode: 'trade' }))}><span class="ic" style="background:var(--st-trade)">⇄</span>${st.trade ? `${st.trade} à l'échange` : st.own > 1 ? 'Échanger un double' : "Je l'échange"}</button>
          <button class=${'action' + (st.sell ? ' on' : '')} style=${st.sell ? 'color:var(--st-sell)' : ''} onClick=${needOwn(() => openModal('copies', { id, mode: 'sell' }))}><span class="ic" style="background:var(--st-sell)">€</span>${st.sell ? `${st.sell} en vente` : 'Je la vends'}</button>
        </div>
        ${st.own ? html`<button class="btn sm" onClick=${() => openModal('copies', { id })}>Gérer mes ${st.own} exemplaires</button>` : null}
        <div class="row tight" style="justify-content:center">
          ${img ? html`<a class="btn ghost sm" href=${img} target="_blank" rel="noopener">Image officielle <${Icon} n="ext" s=${14} /></a>` : null}
          <a class="btn ghost sm" href=${'https://www.cardmarket.com/fr/Pokemon/Products/Search?searchString=' + encodeURIComponent(cardName(c))} target="_blank" rel="noopener">Cardmarket <${Icon} n="ext" s=${14} /></a>
        </div>
      </div>

      <div class="stack l" style="min-width:0">
        <div class="stack s">
          <div class="eyebrow">${(CAT.serieById.get(c.set.s) || {}).n} · ${c.set.n}</div>
          <h1>${cardName(c)}</h1>
          <div class="row tight">
            <span class="chip num">${numLabel(c)}</span>
            <span class="chip">${rarityName(c) || 'Sans rareté'}</span>
            ${c.t >= 0 ? html`<span class="chip">${typeName(c)}</span>` : null}
            <span class="chip">${catName(c)}</span>
            <span class="chip">Français</span>
            ${c.set.a ? html`<span class="chip num">${c.set.a}</span>` : null}
          </div>
        </div>
        ${c.v.length > 1 ? html`<div class="stack s"><span class="eyebrow">Variante</span><${Seg} label="Variante" options=${c.v.map((x, i) => ({ v: i, l: x.l }))} value=${vi} onChange=${setVi} /></div>` : null}

        <div class="slab">
          <div class="slab-band"></div>
          <div class="slab-body">
            <div class="stack s"><span class="eyebrow">Valeur estimée · état Near Mint</span><span class="slab-value">${est.value ? fmtEUR(est.value, false) : 'Cote indisponible'}</span>
              <span class="small muted">${est.value ? html`Prix au ${fmtDate(CAT.meta.snapshot)} · ${est.pts.filter(p => p.used).length} indicateurs retenus${est.pts.some(p => p.anomaly) ? ', ' + est.pts.filter(p => p.anomaly).length + ' écarté(s)' : ''}` : "Aucune transaction récente n'a été trouvée pour cette variante."}</span></div>
            ${est.value ? html`<div class="slab-grade"><div class="eyebrow">Confiance</div><div class="g">${est.conf}</div><div class="tiny" style=${`color:${confColor(est.conf)};font-weight:700`}>${confWord(est.conf)}</div></div>` : null}
          </div>
        </div>

        ${est.value ? html`<div class="grid-2">
          <div class="panel stack s">
            <h3>Indicateurs de marché</h3>
            <div class="table-wrap"><table class="data"><tbody>
              ${est.pts.map(p => html`<tr class=${p.anomaly ? 'dim' : ''}><td>${p.l}${p.k === 'tp' ? html`<span class="tiny muted"> (${p.raw.toFixed(2).replace('.', ',')} $ × ${String(tpF).replace('.', ',')})</span>` : null}${p.anomaly ? html` <span class="chip" style="color:var(--warn);text-decoration:none">anomalie écartée</span>` : null}</td><td class="r num">${fmtEUR(p.v, false)}</td></tr>`)}
              ${est.low ? html`<tr><td>Cardmarket · plus bas affiché</td><td class="r num">${fmtEUR(est.low, false)}</td></tr>` : null}
              <tr><td><b>Notre estimation</b></td><td class="r num"><b>${fmtEUR(est.value, false)}</b></td></tr>
            </tbody></table></div>
            <p class="tiny muted">Estimation pondérée : tendance 32 %, moyenne 7 j 22 %, 30 j 16 %, veille 10 %, prix moyen 8 %, TCGplayer 12 %. Une source qui s'écarte de plus de ×2,2 de la médiane est écartée.</p>
          </div>
          <div class="panel stack s">
            <h3>Évolution</h3>
            <dl class="kv"><dt>Veille vs 7 jours</dt><dd><${Delta} x=${d1} /></dd><dt>Tendance vs 7 jours</dt><dd><${Delta} x=${d7} /></dd><dt>Tendance vs 30 jours</dt><dd><${Delta} x=${d30} /></dd></dl>
            ${hist && vi === c.mv ? html`<${HistoryChart} hist=${hist} />` : html`<${PriceChart} v=${v} est=${est} />
            <p class="tiny muted">Courbe reconstituée à partir des moyennes Cardmarket sur 30 jours, 7 jours et la veille. L'historique long (3 mois, 1 an, tout) se construira au fil des mises à jour quotidiennes des prix.</p>`}
          </div>
        </div>` : null}

        <div class="panel stack s">
          <div class="spread"><h3>Dernières ventes déclarées</h3><span class="tiny muted">ventes conclues entre membres</span></div>
          ${S.mode !== 'cloud' ? html`<p class="small muted">Disponible dans la version en ligne.</p>` : sales === null ? html`<p class="small muted">Chargement…</p>` : sales.length ? html`<table class="data"><thead><tr><th>Date</th><th>État</th><th class="r">Prix</th></tr></thead><tbody>${sales.slice(0, 8).map(s => html`<tr><td class="num">${fmtShort(s.at)}</td><td>${s.k}</td><td class="r num">${fmtEUR(s.p, false)}</td></tr>`)}</tbody></table>` : html`<p class="small muted">Aucune vente déclarée pour l'instant. Les ventes individuelles Cardmarket et eBay nécessitent un accord de données (voir la feuille de route).</p>`}
        </div>

        ${who ? html`<div class="panel stack s">
          <div class="spread"><h3>Qui possède cette carte ?</h3><span class="tiny muted">membres ayant rendu leurs listes publiques</span></div>
          ${who.trade.length + who.sell.length + who.have.length === 0 && who.want.length === 0 ? html`<p class="small muted">Aucun membre ne l'a encore déclarée. Les correspondances apparaîtront ici dès que d'autres collectionneurs rejoindront la plateforme.</p>` : html`
            <p class="small"><b>${who.trade.length + who.sell.length + who.have.length}</b> membre(s) la possèdent · <b>${who.want.length}</b> la recherchent</p>
            <div class="stack s">${[...who.sell.map(w => ({ ...w, tag: 'sell' })), ...who.trade.map(w => ({ ...w, tag: 'trade' })), ...who.have.map(w => ({ ...w, tag: 'have' }))].slice(0, 12).map(w => html`<div class="row" style="flex-wrap:nowrap"><${Avatar} uid=${w.uid} size="sm" /><button class="btn ghost sm" style="padding-inline:4px" onClick=${() => go('user', { uid: w.uid })}>${displayName(w.uid, w.pub)}</button><span class="tiny muted grow">${w.pub.region || ''}</span>${w.tag === 'sell' ? html`<span class="chip pill-sell">${fmtEUR(w.d[3])} · ${w.d[1]}</span>` : w.tag === 'trade' ? html`<span class="chip pill-trade">à l'échange · ${w.d[1]}</span>` : html`<span class="chip">collection</span>`}${w.tag !== 'have' ? html`<button class="btn sm" onClick=${() => openModal('trade', { to: w.uid, wantIds: [id] })}>Contacter</button>` : null}</div>`)}</div>
            ${who.want.length ? html`<p class="small muted">Recherchée par ${who.want.slice(0, 6).map(w => displayName(w.uid, w.pub)).join(', ')}${who.want.length > 6 ? '…' : ''}${st.own ? ' : vous pourriez la leur proposer.' : '.'}</p>` : null}`}
        </div>` : null}

        <div class="panel">
          <h3 style="margin-bottom:10px">Fiche</h3>
          ${det === null ? html`<p class="small muted">Chargement…</p>` : html`<div class="stack">
            <dl class="kv">
              ${det.il ? html`<dt>Illustrateur</dt><dd>${det.il}</dd>` : null}
              ${c.hp ? html`<dt>Points de vie</dt><dd class="num">${c.hp}</dd>` : null}
              ${det.st ? html`<dt>Stade</dt><dd>${det.st}${det.ev ? ` · évolue de ${det.ev}` : ''}</dd>` : null}
              ${det.tt ? html`<dt>Type de Dresseur</dt><dd>${det.tt}</dd>` : null}
              ${det.wk ? html`<dt>Faiblesse</dt><dd>${det.wk}</dd>` : null}
              ${det.rt != null ? html`<dt>Retraite</dt><dd class="num">${det.rt}</dd>` : null}
              ${det.rm ? html`<dt>Marque de règlement</dt><dd class="num">${det.rm}</dd>` : null}
              <dt>Sortie</dt><dd>${c.set.d ? fmtDate(c.set.d) : '—'}</dd>
              <dt>Format</dt><dd>${det.lg === 'SE' ? 'Standard et Étendu' : det.lg === 'E' ? 'Étendu' : 'Hors format'}</dd>
              <dt>Référence</dt><dd class="num small">${c.id}</dd>
            </dl>
            ${(det.ab || []).map(a => html`<div class="stack s"><span class="eyebrow">${a[0] || 'Talent'}</span><b>${a[1]}</b><p class="small">${a[2]}</p></div>`)}
            ${(det.at || []).map(a => html`<div class="stack s"><div class="spread"><b>${a[0]}</b><span class="num">${a[2]}</span></div>${a[3] ? html`<p class="small">${a[3]}</p>` : null}</div>`)}
            ${det.ef ? html`<p class="small">${det.ef}</p>` : null}
            ${det.de ? html`<p class="small muted" style="font-style:italic">${det.de}</p>` : null}
          </div>`}
        </div>
        ${isAdmin() ? html`<${AdminCardEditor} c=${c} />` : null}
      </div>
    </div>
  </div>`;
}
