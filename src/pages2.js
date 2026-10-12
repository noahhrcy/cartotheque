/* ============================================================
   Cartothèque — scanner, collection, binders
   ============================================================ */
// engine: 'free' = on-device recognition (visual.js, unlimited, works offline); 'ai' = optional paid vision model
const SCAN = { items: [], tier: 'quick', engine: null, busy: false, disabled: false };
const scanEngine = () => SCAN.engine || (PF.freeScan ? 'free' : 'ai');
const SCAN_ERRORS = {
  not_granted: "L'accès à la reconnaissance a été refusé pour cette page : elle est désactivée pendant cette visite. Utilisez la saisie rapide ci-dessous.",
  not_configured: "La lecture IA n'est pas activée sur le serveur (clé API à ajouter). Le scanner gratuit reste disponible.",
  quota: 'Vous avez atteint votre quota de lectures IA du mois. Le scanner gratuit reste disponible.',
  auth: 'Votre session a expiré. Reconnectez-vous puis relancez cette photo.',
  too_large: 'Cette photo est trop lourde. Réessayez avec une photo plus petite.',
  sampling_disabled: "La reconnaissance n'est pas disponible pour votre compte. Utilisez la saisie rapide ci-dessous.",
  images_unavailable: "L'envoi de photos n'est pas disponible dans cette vue. Utilisez la saisie rapide ci-dessous.",
  rate_limited: 'Trop de scans en peu de temps. Patientez un moment puis relancez cette photo.',
  image_rejected: "Cette image n'a pas pu être lue (format ou taille). Essayez une autre photo, en JPEG ou PNG.",
  invalid_json: 'La réponse du module de reconnaissance était incomplète. Relancez cette photo.',
  refused: "Cette photo n'a pas pu être analysée. Essayez une autre prise de vue.",
  empty_completion: "Aucune carte n'a été lue sur cette photo. Rapprochez-vous et évitez les reflets.",
  session_expired: 'Votre session a expiré. Reconnectez-vous puis relancez.',
  free_index: "Le scanner gratuit n'a pas pu charger ses données. Vérifiez votre connexion puis relancez.",
};
// files: File/Blob, or { blob, hint } where hint is the guide-frame rectangle as fractions of the photo
function queueScans(files) {
  for (const f of files) {
    const blob = f instanceof Blob ? f : f.blob;
    SCAN.items.unshift({ id: newId(), url: URL.createObjectURL(blob), file: blob, hint: f instanceof Blob ? null : f.hint || null, status: 'pending', tier: SCAN.tier, engine: scanEngine(), dets: [], sealed: [], note: '' });
  }
  emit();
  runScans();
}
const toDetection = (det, m, extra = {}) => ({ id: newId(), det, m, choice: m.ambiguous ? null : (m.best && m.best.id), vi: m.vi, k: 'NM', g: 'fr', q: 1, state: 'todo', gr: '', ...extra });
async function runScans() {
  if (SCAN.busy) return;
  SCAN.busy = true;
  for (;;) {
    const it = [...SCAN.items].reverse().find(x => x.status === 'pending');
    if (!it) break;
    it.status = 'running'; it.step = ''; it.t0 = performance.now(); emit();
    try {
      if (it.engine === 'free') {
        let res;
        try { res = await freeScan(it.file, it.hint, step => { it.step = step; emit(); }); }
        catch (e) { throw (e && e.code) ? e : { code: /visual|fetch|network/i.test(String(e && e.message)) ? 'free_index' : 'upstream_error' }; }
        it.dets = res.dets.map(x => toDetection(x.det, x.m));
        it.sealed = []; it.note = '';
        it.status = 'done'; it.ms = res.ms;
      } else {
        const blob = await prepareImage(it.file);
        const res = await PF.scan(blob, it.tier === 'default');
        const cards = Array.isArray(res && res.cards) ? res.cards : [];
        it.dets = cards.slice(0, 12).map(d => toDetection(d || {}, matchDetection(d || {}), {
          k: CONDS.some(x => x.k === d.condition) ? d.condition : 'NM', g: LANGS.some(l => l.k === d.language) ? d.language : 'fr',
          gr: d.graded && d.graded.company ? `${d.graded.company} ${d.graded.grade || ''}`.trim() : '',
        }));
        it.sealed = Array.isArray(res && res.sealed) ? res.sealed : [];
        it.note = (res && res.note) || '';
        it.status = 'done'; it.ms = performance.now() - it.t0;
        countScan();
      }
    } catch (e) {
      it.status = 'error';
      it.error = SCAN_ERRORS[e && e.code] || 'Le module de reconnaissance ne répond pas. Relancez cette photo dans un instant.';
      if (it.engine === 'ai' && e && ['not_granted', 'sampling_disabled', 'images_unavailable', 'not_configured'].includes(e.code)) { SCAN.disabled = true; SCAN.engine = PF.freeScan ? 'free' : null; }
    }
    emit();
  }
  SCAN.busy = false;
}
function addDetection(d) {
  if (!d.choice) return;
  addItem(d.choice, { v: d.vi, k: d.k, g: d.g, q: d.q, gr: d.gr || undefined });
  if (inWish(d.choice)) toggleWish(d.choice);
  d.state = 'added';
  emit();
}

function ScanPage() {
  const cam = useRef(null), lib = useRef(null);
  const [quick, setQuick] = useState('');
  useEffect(() => { if (PF.freeScan) { loadVisualIndex().catch(() => {}); tessWorker().catch(() => {}); } }, []);
  const canAI = PF.canScan() && !SCAN.disabled;
  const engine = scanEngine();
  const canShoot = engine === 'free' || canAI;
  const used = scansThisMonth();
  const quota = S.config.scanQuota || 20;
  const blocked = engine === 'ai' && S.config.enforceQuota && used >= quota;
  const allDets = SCAN.items.flatMap(it => it.dets);
  const ready = allDets.filter(d => d.choice && d.state === 'todo');
  const quickRes = useMemo(() => quick.trim().length >= 2 ? searchCards(quick).slice(0, 12) : [], [quick]);
  const pick = e => { const files = [...(e.target.files || [])]; e.target.value = ''; if (files.length) queueScans(files); };
  return html`<div class="stack l">
    <section class="scan-hero">
      <div class="stack">
        <div class="eyebrow" style="color:color-mix(in srgb,var(--hero-fg) 65%,transparent)">Scanner${engine === 'free' ? ' · gratuit et illimité' : ''}</div>
        <h1 style="color:var(--hero-fg)">Photographiez, on s'occupe du reste</h1>
        <p style="opacity:.8;max-width:52ch">${engine === 'free'
          ? "Cadrez une carte dans le viseur : son illustration est comparée aux 17 000 cartes du catalogue et son numéro imprimé est lu, directement sur votre appareil. Rien n'est envoyé, rien n'est facturé."
          : 'Une carte, plusieurs cartes étalées ou une page de classeur entière : chaque carte est identifiée (nom, extension, numéro, variante, état apparent) puis rapprochée du catalogue avec un indice de confiance.'}</p>
        ${canShoot ? html`<div class="row">
          ${PF.camera ? html`<button class="btn scan" disabled=${blocked} onClick=${() => openModal('camera')}><${Icon} n="scan" />Ouvrir le scanner</button>` : null}
          <button class=${'btn ' + (PF.camera ? 'alt' : 'scan')} disabled=${blocked} onClick=${() => cam.current && cam.current.click()}><${Icon} n="camera" />${PF.camera ? 'Appareil photo' : 'Prendre une photo'}</button>
          <button class="btn alt" disabled=${blocked} onClick=${() => lib.current && lib.current.click()}><${Icon} n="image" />Importer des photos</button>
          <input ref=${cam} type="file" accept="image/*" capture="environment" hidden onChange=${pick} />
          <input ref=${lib} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange=${pick} />
        </div>
        <div class="row small" style="opacity:.85">
          ${PF.freeScan && canAI ? html`<label class="switch" style="color:var(--hero-fg)"><input id="scan-ai" type="checkbox" checked=${engine === 'ai'} onChange=${e => { SCAN.engine = e.target.checked ? 'ai' : 'free'; emit(); }} />Lecture IA (pages de classeur, cartes difficiles)</label>` : null}
          ${engine === 'ai' ? html`<label class="switch" style="color:var(--hero-fg)"><input id="scan-precise" type="checkbox" checked=${SCAN.tier === 'default'} onChange=${e => { SCAN.tier = e.target.checked ? 'default' : 'quick'; emit(); }} />Lecture précise (plus lente)</label><span class="num">Lectures IA ce mois-ci : ${used}${S.config.enforceQuota ? ' / ' + quota : ''}</span>` : null}
        </div>
        ${blocked ? html`<p class="notice warn">Vous avez utilisé vos ${quota} lectures IA ce mois-ci. Le scanner gratuit reste disponible : décochez « Lecture IA ».</p>` : null}`
        : html`<div class="notice warn stack s"><span>${S.mode === 'local' ? PF.text.scanLocal : SCAN.disabled ? (SCAN.reason || 'La reconnaissance photo est désactivée pour cette visite. Utilisez la saisie rapide ci-dessous.') : 'Connexion au module de reconnaissance…'}</span>${S.mode === 'local' && PF.LoginButton ? html`<${PF.LoginButton} />` : null}</div>`}
      </div>
      <div class="scan-frame" aria-hidden="true"><i></i><i></i><i></i><i></i><span class="line"></span></div>
    </section>

    <section class="panel stack s">
      <div class="spread"><h3>Saisie rapide</h3><span class="tiny muted">pour une carte abîmée, mal éclairée ou sans appareil photo</span></div>
      <input autocomplete="off" id="scan-quick" type="search" placeholder="Numéro imprimé (125/197), code (MEW 6) ou nom" value=${quick} onInput=${e => setQuick(e.target.value)} />
      ${quickRes.length ? html`<div class="grid-cards">${quickRes.map(c => html`<${CardCell} c=${c} sub=${c.set.n} onClick=${() => openModal('add', { id: c.id })} />`)}</div>` : null}
    </section>

    ${SCAN.items.length ? html`<section class="stack">
      <div class="spread">
        <h2>Cette session · ${plural(allDets.length, 'carte détectée', 'cartes détectées')}</h2>
        <div class="row">
          ${ready.length > 1 ? html`<button class="btn primary" onClick=${() => { const n = ready.length; ready.forEach(addDetection); haptic('success'); toast(`${n} cartes ajoutées à votre collection`); }}><${Icon} n="check" />Ajouter les ${ready.length} à ma collection</button>` : null}
          <button class="btn ghost sm" onClick=${() => { SCAN.items.forEach(i => URL.revokeObjectURL(i.url)); SCAN.items = []; emit(); }}>Vider</button>
        </div>
      </div>
      ${SCAN.items.map(it => html`<${ScanItem} key=${it.id} it=${it} />`)}
    </section>` : html`<${Empty} title="Aucun scan pour l'instant">${engine === 'free'
      ? 'Conseil : posez la carte à plat sur un fond uni, sans reflet, et faites-la remplir le cadre du viseur. Une carte par photo ; enchaînez les photos sans quitter le viseur.'
      : "Conseil : posez la carte sur un fond uni, sans reflet, et cadrez le numéro en bas à gauche. Pour aller vite, photographiez une page de classeur 3 × 3 : jusqu'à 9 cartes reconnues d'un coup."}<//>`}
  </div>`;
}

function ScanItem({ it }) {
  return html`<div class="scan-item">
    <img class="ph" src=${it.url} alt="Photo scannée" />
    <div class="stack s" style="min-width:0">
      ${it.status === 'pending' ? html`<p class="small muted">En attente…</p>` : null}
      ${it.status === 'running' ? html`<div class="row"><div class="spinner" style="width:20px;height:20px;border-width:2px"></div><span class="small">${it.step || ('Identification en cours' + (it.tier === 'default' && it.engine === 'ai' ? ' (lecture précise)' : '') + '…')}</span></div>` : null}
      ${it.status === 'error' ? html`<div class="stack s"><p class="small" style="color:var(--down)">${it.error}</p><button class="btn sm" style="align-self:flex-start" onClick=${() => { it.engine = scanEngine(); it.status = 'pending'; emit(); runScans(); }}>Relancer</button></div>` : null}
      ${it.status === 'done' ? html`<div class="stack s">
        <div class="spread"><span class="small"><b>${it.engine === 'free' ? 'Analysée' : plural(it.dets.length, 'carte détectée', 'cartes détectées')}</b> en ${(it.ms / 1000).toFixed(1).replace('.', ',')} s${it.note ? html` · <span class="muted">${it.note}</span>` : null}</span>
          ${it.engine === 'free' && PF.canScan() && !SCAN.disabled ? html`<button class="btn ghost sm" onClick=${() => { it.engine = 'ai'; it.status = 'pending'; it.dets = []; emit(); runScans(); }}>Relancer avec l'IA</button>` : null}
          ${it.engine === 'ai' && it.tier !== 'default' ? html`<button class="btn ghost sm" onClick=${() => { it.tier = 'default'; it.status = 'pending'; it.dets = []; emit(); runScans(); }}>Relancer en lecture précise</button>` : null}</div>
        ${it.dets.map(d => html`<${Detection} key=${d.id} d=${d} />`)}
        ${it.sealed.length ? html`<div class="notice small">Produit scellé repéré : ${it.sealed.map(s => `${s.name || s.type}${s.set ? ' (' + s.set + ')' : ''}`).join(', ')}. <button class="btn sm" onClick=${() => go('collection', { tab: 'sealed' })}>L'ajouter à mes scellés</button></div>` : null}
        ${!it.dets.length && !it.sealed.length ? html`<p class="small muted">Aucune carte lisible. Essayez plus près, sans reflet, ou passez par la saisie rapide.</p>` : null}
      </div>` : null}
    </div>
  </div>`;
}

function Detection({ d }) {
  const c = d.choice ? CAT.byId.get(d.choice) : null;
  const det = d.det;
  const read = det.source === 'free'
    ? (det.number ? `son illustration et son numéro ${det.number}${det.total ? '/' + det.total : ''}` : det.ocrUsed ? 'son illustration (numéro illisible)' : 'son illustration')
    : [det.printedName, det.number ? det.number + (det.total ? '/' + det.total : '') : null, det.setCode].filter(Boolean).join(' · ');
  if (d.state === 'added') return html`<div class="det" style="grid-template-columns:40px minmax(0,1fr)"><${MiniTile} c=${c} vi=${d.vi} w=${40} /><div class="row"><span class="pip own">✓</span><span class="small"><b>${cardName(c)}</b> ajoutée (${d.k}, ${langS(d.g)}${d.q > 1 ? ', ×' + d.q : ''})</span></div></div>`;
  if (d.state === 'skipped') return html`<div class="small muted">Ignorée : ${read}</div>`;
  if (!c) return html`<div class="det" style="grid-template-columns:minmax(0,1fr)"><div class="stack s">
    <span class="small" style="color:var(--warn);font-weight:700">⚠ ${d.m.candidates.length > 1 ? `${d.m.candidates.length} cartes correspondent à cette lecture` : "Lecture incertaine"}</span>
    <span class="tiny muted">Lu sur la photo : ${read || 'rien de lisible'}${det.where ? ' · ' + det.where : ''}</span>
    <div class="stack s">${d.m.candidates.map(x => html`<button class="cand" onClick=${() => { d.choice = x.id; d.vi = x.mv; emit(); }}><${MiniTile} c=${x} w=${30} /><span class="grow small"><b>${cardName(x)}</b> · ${x.set.n} · ${numLabel(x)}</span><span class="num small">${fmtEUR(x.p)}</span></button>`)}</div>
    <div class="row tight"><button class="btn sm" onClick=${() => openModal('picker', { title: 'Rechercher la bonne carte', onPick: x => { d.choice = x.id; d.vi = x.mv; emit(); } })}><${Icon} n="search" />Rechercher manuellement</button><button class="btn ghost sm" onClick=${() => { d.state = 'skipped'; emit(); }}>Ignorer</button></div>
  </div></div>`;
  const price = variantPrice(c, d.vi) * condF(d.k);
  return html`<div class="det">
    <${MiniTile} c=${c} vi=${d.vi} w=${64} />
    <div class="stack s" style="min-width:0">
      <div class="spread"><span><b>${cardName(c)}</b> <span class="small muted">${c.set.n} · ${numLabel(c)}</span></span><span class="num">${fmtEUR(price)}</span></div>
      <span class="tiny"><span class="conf-dot" style=${`background:${confColor(d.m.conf)}`}></span>Confiance identification : ${d.m.conf} %${d.m.ambiguous ? ' · choisie manuellement' : ''}${d.gr ? ' · gradée ' + d.gr : ''}${det.source === 'free' ? ' · reconnue par ' + read : ''}</span>
      ${det.source === 'free' && d.m.candidates.length > 1 && d.m.conf < 85 ? html`<div class="row tight"><span class="tiny muted">Ou :</span>${d.m.candidates.filter(x => x.id !== c.id).slice(0, 3).map(x => html`<button class="chip" onClick=${() => { d.choice = x.id; d.vi = x.mv; emit(); }}>${cardName(x)} · ${x.set.a || x.set.n} ${numLabel(x)}</button>`)}</div>` : null}
      <div class="row tight">
        ${c.v.length > 1 ? html`<select aria-label="Variante" value=${d.vi} onChange=${e => { d.vi = +e.target.value; emit(); }}>${c.v.map((x, i) => html`<option value=${i}>${x.l}</option>`)}</select>` : null}
        <select aria-label="État" value=${d.k} onChange=${e => { d.k = e.target.value; emit(); }}>${CONDS.map(x => html`<option value=${x.k}>${x.k} · ${x.l}</option>`)}</select>
        <select aria-label="Langue" value=${d.g} onChange=${e => { d.g = e.target.value; emit(); }}>${LANGS.map(l => html`<option value=${l.k}>${l.s}</option>`)}</select>
        <${Stepper} value=${d.q} min=${1} onChange=${n => { d.q = n; emit(); }} />
      </div>
      <div class="row tight">
        <button class="btn primary sm" onClick=${() => { addDetection(d); haptic('success'); toast(`${cardName(c)} ajoutée`); }}><${Icon} n="plus" />Ajouter</button>
        <button class="btn sm" onClick=${() => openModal('picker', { title: 'Corriger la carte', onPick: x => { d.choice = x.id; d.vi = x.mv; emit(); } })}>Modifier</button>
        <button class="btn ghost sm" onClick=${() => go('card', { id: c.id })}>Voir la cote</button>
        <button class="btn ghost sm" onClick=${() => { d.state = 'skipped'; emit(); }}>Ignorer</button>
      </div>
    </div>
  </div>`;
}

// ---------- collection ----------
function CollectionPage({ tab: tab0 }) {
  const [tab, setTab] = useRouteState('tab', tab0 || 'cards');
  const st = colStats();
  const tabs = [['cards', 'Cartes'], ['binders', 'Classeurs'], ['wish', 'Recherches'], ['doubles', 'Doublons'], ['sealed', 'Scellés']];
  return html`<div class="stack l">
    <div class="spread"><h1>Ma collection</h1>
      <div class="row"><button class="btn" onClick=${() => offerDownload(`collection-cartotheque-${new Date().toISOString().slice(0, 10)}.csv`, collectionCSV())} disabled=${!st.cards}><${Icon} n="download" />Exporter (CSV / Excel)</button><button class="btn primary" onClick=${() => go('scan')}><${Icon} n="scan" />Scanner</button></div>
    </div>
    <div class="slab"><div class="slab-band"></div>
      <div class="slab-body" style="grid-template-columns:repeat(auto-fit,minmax(130px,1fr))">
        <div class="stack s"><span class="eyebrow">Valeur estimée</span><span class="slab-value" style="font-size:1.8rem">${st.cards ? fmtEUR(st.value) : '0 €'}</span>${st.d7 != null && st.cards ? html`<span class="small"><${Delta} x=${st.d7} /> vs 7 jours</span>` : null}</div>
        <div class="stack s"><span class="eyebrow">Cartes</span><span class="num" style="font-size:1.3rem;font-weight:700">${fmtInt(st.cards)}</span><span class="small muted">${fmtInt(st.unique)} différentes</span></div>
        <div class="stack s"><span class="eyebrow">Extensions</span><span class="num" style="font-size:1.3rem;font-weight:700">${fmtInt(st.sets)}</span><span class="small muted">${fmtInt(st.doubles)} doubles</span></div>
        ${st.spent ? html`<div class="stack s"><span class="eyebrow">Investi</span><span class="num" style="font-size:1.3rem;font-weight:700">${fmtEUR(st.spent)}</span><span class="small"><${Delta} x=${st.value / st.spent - 1} /> latente</span></div>` : null}
        ${st.sealedVal ? html`<div class="stack s"><span class="eyebrow">Scellés</span><span class="num" style="font-size:1.3rem;font-weight:700">${fmtEUR(st.sealedVal)}</span></div>` : null}
      </div>
    </div>
    <div class="tabs" role="tablist">${tabs.map(([k, l]) => html`<button role="tab" aria-selected=${String(tab === k)} onClick=${() => setTab(k)}>${l}${k === 'wish' && st.wanted ? ` (${st.wanted})` : ''}${k === 'binders' ? ` (${Object.keys(binderList()).length})` : ''}</button>`)}</div>
    ${tab === 'cards' ? html`<${ColCards} />` : tab === 'binders' ? html`<${ColBinders} />` : tab === 'wish' ? html`<${ColWish} />` : tab === 'doubles' ? html`<${ColDoubles} />` : html`<${ColSealed} />`}
  </div>`;
}

function ColCards() {
  const [f, setF] = useRouteState('f', '');
  const [setIdx, setSetIdx] = useRouteState('set', '');
  const [lang, setLang] = useRouteState('lang', '');
  const [cond, setCond] = useRouteState('cond', '');
  const [status, setStatus] = useRouteState('status', '');
  const [sort, setSort] = useRouteState('sort', 'value');
  const [view, setView] = useState(lsGet('colView', 'grid'));
  const [n, setN] = useRouteState('n', 90);
  const [showF, setShowF] = useRouteState('filters', false);
  const nF = [setIdx, lang, cond, status].filter(x => x !== '').length;
  const items = allItems();
  if (!items.length) return html`<${Empty} title="Aucune carte pour l'instant" action=${html`<div class="row" style="justify-content:center"><button class="btn primary" onClick=${() => go('scan')}>Scanner une carte</button><button class="btn" onClick=${() => go('cards')}>Chercher dans le catalogue</button></div>`}>Chaque carte ajoutée garde sa variante, sa langue, son état et sa quantité. La valeur se calcule à partir de la cote du jour.<//>`;
  const om = owned();
  let rows = items.filter(it => {
    const c = CAT.byId.get(it.c);
    if (f && !norm(cardName(c)).includes(norm(f)) && normLid(c.lid) !== normLid(f)) return false;
    if (setIdx !== '' && c.si !== +setIdx) return false;
    if (lang && it.g !== lang) return false;
    if (cond && it.k !== cond) return false;
    if (status === 'double' && !(om.get(it.c).q > 1)) return false;
    if (status === 'trade' && !(it.tq > 0)) return false;
    if (status === 'sell' && !(it.sq > 0)) return false;
    if (status === 'graded' && !it.gr) return false;
    return true;
  });
  rows = rows.map(it => ({ it, c: CAT.byId.get(it.c), val: itemValue(it) }));
  rows.sort((a, b) => sort === 'value' ? b.val - a.val : sort === 'recent' ? (b.it.at || 0) - (a.it.at || 0) : sort === 'name' ? cardName(a.c).localeCompare(cardName(b.c), 'fr') : (b.c.set.d || '').localeCompare(a.c.set.d || '') || a.c.k - b.c.k);
  const setOpts = [...new Set(items.map(it => CAT.byId.get(it.c).si))].map(i => CAT.sets[i]).sort((a, b) => (b.d || '').localeCompare(a.d || ''));
  return html`<div class="stack">
    <div class="row tight" style="flex-wrap:nowrap">
      <input autocomplete="off" id="col-f" type="search" enterkeyhint="search" placeholder="Filtrer par nom ou numéro" value=${f} onInput=${e => setF(e.target.value)} style="flex:1;min-width:0" />
      <button class=${'btn sm phone-inline' + (nF ? ' primary' : '')} aria-expanded=${String(showF)} aria-controls="col-filters" onClick=${() => setShowF(!showF)}><${Icon} n="layers" />Filtres${nF ? ` (${nF})` : ''}</button>
    </div>
    <div id="col-filters" class=${'row tight filters' + (showF ? ' open' : '')}>
      <select id="col-set" aria-label="Extension" value=${setIdx} onChange=${e => setSetIdx(e.target.value)}><option value="">Toutes les extensions</option>${setOpts.map(s => html`<option value=${s.i}>${s.n}</option>`)}</select>
      <select id="col-lang" aria-label="Langue" value=${lang} onChange=${e => setLang(e.target.value)}><option value="">Toutes langues</option>${LANGS.map(l => html`<option value=${l.k}>${l.l}</option>`)}</select>
      <select id="col-cond" aria-label="État" value=${cond} onChange=${e => setCond(e.target.value)}><option value="">Tous états</option>${CONDS.map(x => html`<option value=${x.k}>${x.k}</option>`)}</select>
      <select id="col-status" aria-label="Statut" value=${status} onChange=${e => setStatus(e.target.value)}><option value="">Tous statuts</option><option value="double">Doubles</option><option value="trade">À échanger</option><option value="sell">À vendre</option><option value="graded">Gradées</option></select>
      <select id="col-sort" aria-label="Tri" value=${sort} onChange=${e => setSort(e.target.value)}><option value="value">Valeur</option><option value="recent">Ajout récent</option><option value="set">Extension</option><option value="name">Nom</option></select>
      <${Seg} options=${[{ v: 'grid', l: 'Grille' }, { v: 'list', l: 'Liste' }]} value=${view} onChange=${v => { setView(v); lsSet('colView', v); }} />
    </div>
    <p class="small muted">${plural(rows.length, 'ligne')} · ${fmtEUR(rows.reduce((a, r) => a + r.val, 0))}</p>
    ${view === 'grid' ? html`<div class="grid-cards">${rows.slice(0, n).map(r => html`<${CardCell} key=${r.it.id} c=${r.c} vi=${r.it.v} price=${r.val} sub=${`${r.it.k} · ${langS(r.it.g)}${r.it.q > 1 ? ' · ×' + r.it.q : ''}${r.it.gr ? ' · ' + r.it.gr : ''}`} />`)}</div>`
      : html`<div class="table-wrap panel" style="padding:0"><table class="data"><thead><tr><th></th><th>Carte</th><th>Extension</th><th>Variante</th><th>Lang.</th><th>État</th><th class="r">Qté</th><th class="r">Valeur</th></tr></thead><tbody>
        ${rows.slice(0, n).map(r => html`<tr key=${r.it.id} style="cursor:pointer" onClick=${() => openModal('copies', { id: r.c.id })}><td style="width:40px"><${MiniTile} c=${r.c} vi=${r.it.v} w=${30} /></td><td><b>${cardName(r.c)}</b> <span class="num tiny muted">${numLabel(r.c)}</span><div class="state-pips" style="margin-top:3px">${r.it.tq ? html`<span class="chip pill-trade">⇄ ${r.it.tq}</span>` : null}${r.it.sq ? html`<span class="chip pill-sell">€ ${r.it.sq}</span>` : null}${r.it.gr ? html`<span class="chip">${r.it.gr}</span>` : null}</div></td><td class="small">${r.c.set.n}</td><td class="small">${(r.c.v[r.it.v] || r.c.v[r.c.mv]).l}</td><td>${langS(r.it.g)}</td><td>${r.it.k}</td><td class="r num">${r.it.q}</td><td class="r num">${fmtEUR(r.val)}</td></tr>`)}
      </tbody></table></div>`}
    ${rows.length > n ? html`<button class="btn" style="align-self:center" onClick=${() => setN(n + 90)}>Afficher plus</button>` : null}
  </div>`;
}

function binderSlots(b) {
  if (b.kind === 'set') { const s = CAT.setById.get(b.set); return s ? s.cards.map(c => c.id) : []; }
  return b.slots || [];
}
function ColBinders() {
  const list = Object.entries(binderList()).sort((a, b) => (b[1].at || 0) - (a[1].at || 0));
  const om = owned();
  return html`<div class="stack">
    <div class="spread"><p class="small muted">Un classeur reproduit vos pages réelles : une extension complète rangée dans l'ordre, ou une sélection libre (vos Dracaufeu, vos cartes japonaises…).</p><button class="btn primary" onClick=${() => openModal('binder', {})}><${Icon} n="plus" />Nouveau classeur</button></div>
    ${list.length ? html`<div class="grid-cards" style="grid-template-columns:repeat(auto-fill,minmax(170px,1fr))">${list.map(([id, b]) => {
      const slots = binderSlots(b); const have = slots.filter(x => x && om.has(x)).length;
      return html`<button class="binder-cover" style=${`background:${b.col || BINDER_COLORS[0]}`} onClick=${() => go('binder', { id })}>
        <div class="stack s"><span class="eyebrow" style="color:rgba(255,255,255,.7)">${b.kind === 'set' ? 'Extension' : 'Sélection libre'} · ${b.layout.replace('x', '×')}</span><h3>${b.n}</h3></div>
        <div class="stack s"><span class="num">${have} / ${slots.filter(Boolean).length} possédées</span><div class="bar" style="background:rgba(255,255,255,.2)"><i style=${`width:${slots.length ? 100 * have / slots.filter(Boolean).length : 0}%;background:#fff`}></i></div><span class="tiny" style="opacity:.75">${b.vis === 'public' ? 'Visible sur mon profil' : 'Privé'}</span></div>
      </button>`;
    })}</div>` : html`<${Empty} title="Pas encore de classeur" action=${html`<button class="btn primary" onClick=${() => openModal('binder', { set: CAT.latestSets[0].id })}>Créer « Master set ${CAT.latestSets[0].n} »</button>`}>Commencez par l'extension que vous complétez en ce moment : les emplacements vides vous montrent ce qu'il manque.<//>`}
  </div>`;
}

function ColWish() {
  const w = wishItems();
  const ids = Object.keys(w).filter(id => CAT.byId.has(id));
  if (!ids.length) return html`<${Empty} title="Aucune carte recherchée">Depuis une fiche, touchez « Je la recherche ». Vous serez prévenu quand un membre la propose, et les membres qui la possèdent vous verront dans leurs correspondances.<//>`;
  const rows = ids.map(id => ({ id, c: CAT.byId.get(id), w: w[id], avail: availability(id) })).sort((a, b) => (a.w.p || 2) - (b.w.p || 2) || b.c.p - a.c.p);
  const total = rows.reduce((a, r) => a + (r.c.p || 0), 0);
  const setW = (id, patch) => { w[id] = { ...w[id], ...patch }; savePriv('wish'); emit(); };
  return html`<div class="stack">
    <div class="spread"><p><b>${plural(ids.length, 'carte recherchée', 'cartes recherchées')}</b> · valeur estimée <b class="num">${fmtEUR(total)}</b>${S.mode === 'cloud' ? html` · <b>${rows.filter(r => r.avail).length}</b> disponibles chez des membres` : null}</p>
      <span class="tiny muted">${profile().wishPublic ? 'Votre wishlist est visible par les membres' : 'Wishlist privée'}</span></div>
    <div class="table-wrap panel" style="padding:0"><table class="data"><thead><tr><th></th><th>Carte</th><th class="r">Cote</th><th class="r">7 j</th><th>Priorité</th><th>Prix max</th><th class="r">Dispo</th><th></th></tr></thead><tbody>
      ${rows.map(r => html`<tr key=${r.id}>
        <td style="width:40px"><${MiniTile} c=${r.c} w=${30} /></td>
        <td><button class="btn ghost sm" style="padding:0;border:0" onClick=${() => go('card', { id: r.id })}><b>${cardName(r.c)}</b></button><div class="tiny muted">${r.c.set.n} · ${numLabel(r.c)}</div></td>
        <td class="r num">${fmtEUR(r.c.p)}</td>
        <td class="r"><${Delta} x=${r.c.d7} /></td>
        <td><select aria-label="Priorité" value=${r.w.p || 2} onChange=${e => setW(r.id, { p: +e.target.value })}><option value="1">Haute</option><option value="2">Normale</option><option value="3">Basse</option></select></td>
        <td><input autocomplete="off" aria-label="Prix maximum" type="text" inputmode="decimal" style="width:80px" placeholder="—" value=${r.w.mx ? String(r.w.mx).replace('.', ',') : ''} onChange=${e => setW(r.id, { mx: parseFloat(e.target.value.replace(',', '.')) || 0 })} /></td>
        <td class="r">${r.avail ? html`<button class="chip pill-own" onClick=${() => go('card', { id: r.id })}>${r.avail} membre${r.avail > 1 ? 's' : ''}</button>` : html`<span class="muted">—</span>`}</td>
        <td><button class="icon-btn" style="width:30px;height:30px" aria-label="Retirer" onClick=${() => toggleWish(r.id)}><${Icon} n="x" s=${14} /></button></td>
      </tr>`)}
    </tbody></table></div>
  </div>`;
}

function ColDoubles() {
  const rows = [...owned()].filter(([, o]) => o.q > 1).map(([id, o]) => ({ c: CAT.byId.get(id), o })).sort((a, b) => b.c.p - a.c.p);
  if (!rows.length) return html`<${Empty} title="Aucun double">Quand vous possédez plusieurs exemplaires d'une carte, elle apparaît ici pour la garder, la vendre ou l'échanger en un geste.<//>`;
  const extra = (o, key) => { let left = o.q - 1; for (const it of o.items) { const n = Math.min(left, it.q - (it.q === o.q ? 1 : 0)); if (n > 0) { updateItem(it, { [key]: n, ...(key === 'sq' ? { sp: it.sp || round2(itemValue({ ...it, q: 1 })) } : {}) }); left -= n; } if (left <= 0) break; } };
  return html`<div class="stack s">
    <p class="small muted">${plural(rows.reduce((a, r) => a + r.o.q - 1, 0), 'exemplaire en trop', 'exemplaires en trop')} · valeur ${fmtEUR(rows.reduce((a, r) => a + (r.o.q - 1) * r.c.p, 0))}</p>
    ${rows.map(r => html`<div class="match" key=${r.c.id}>
      <${MiniTile} c=${r.c} w=${40} />
      <div style="min-width:0"><b>${cardName(r.c)}</b><div class="small muted">${r.c.set.n} · Vous possédez ${r.o.q} exemplaires${r.o.trade ? ` · ${r.o.trade} à l'échange` : ''}${r.o.sell ? ` · ${r.o.sell} en vente` : ''}</div></div>
      <div class="row tight"><button class="btn sm" onClick=${() => { for (const it of r.o.items) updateItem(it, { tq: 0, sq: 0 }); toast('Vous gardez tous vos exemplaires'); }}>Garder</button><button class="btn sm" style="color:var(--st-sell)" onClick=${() => { extra(r.o, 'sq'); toast('Doubles mis en vente'); }}>Vendre</button><button class="btn sm" style="color:var(--st-trade)" onClick=${() => { extra(r.o, 'tq'); toast("Doubles proposés à l'échange"); }}>Échanger</button></div>
    </div>`)}
  </div>`;
}

function ColSealed() {
  const items = Object.entries(sealedItems());
  const [type, setType] = useState(SEALED_TYPES[0]);
  const [setId, setSetId] = useState(CAT.latestSets[0].id);
  const [name, setName] = useState('');
  const [q, setQ] = useState(1);
  const [pp, setPp] = useState('');
  const [est, setEst] = useState('');
  const num = s => parseFloat(String(s).replace(',', '.')) || 0;
  return html`<div class="stack">
    <div class="panel stack s">
      <h3>Ajouter un produit scellé</h3>
      <div class="row tight">
        <select id="sealed-type" aria-label="Type" value=${type} onChange=${e => setType(e.target.value)}>${SEALED_TYPES.map(t => html`<option>${t}</option>`)}</select>
        <select id="sealed-set" aria-label="Extension" value=${setId} onChange=${e => setSetId(e.target.value)}>${CAT.latestSets.map(s => html`<option value=${s.id}>${s.n}</option>`)}</select>
        <input autocomplete="off" id="sealed-name" type="text" placeholder="Précision (ex. édition Pokémon Center)" value=${name} onInput=${e => setName(e.target.value)} style="flex:1;min-width:160px" />
      </div>
      <div class="row tight">
        <${Stepper} value=${q} min=${1} onChange=${setQ} />
        <input autocomplete="off" id="sealed-pp" type="text" inputmode="decimal" placeholder="Prix d'achat unitaire" value=${pp} onInput=${e => setPp(e.target.value)} style="width:170px" />
        <input autocomplete="off" id="sealed-est" type="text" inputmode="decimal" placeholder="Valeur estimée unitaire" value=${est} onInput=${e => setEst(e.target.value)} style="width:170px" />
        <button class="btn primary" onClick=${() => { saveSealed(newId(), { type, set: setId, name: name.trim(), q, pp: num(pp), est: num(est), at: Date.now() }); setName(''); setPp(''); setEst(''); setQ(1); toast('Produit ajouté'); }}><${Icon} n="plus" />Ajouter</button>
      </div>
      <p class="tiny muted">La cote des produits scellés n'est pas encore fournie par nos sources : indiquez votre estimation, elle sera remplacée par une cote marché dès qu'un fournisseur sera branché.</p>
    </div>
    ${items.length ? html`<div class="table-wrap panel" style="padding:0"><table class="data"><thead><tr><th>Produit</th><th>Extension</th><th class="r">Qté</th><th class="r">Achat</th><th class="r">Estimation</th><th></th></tr></thead><tbody>
      ${items.map(([id, s]) => html`<tr key=${id}><td><b>${s.type}</b>${s.name ? html`<div class="tiny muted">${s.name}</div>` : null}</td><td class="small">${(CAT.setById.get(s.set) || {}).n || '—'}</td><td class="r num">${s.q}</td><td class="r num">${fmtEUR(s.pp)}</td><td class="r num">${fmtEUR((s.est || 0) * (s.q || 1))}</td><td><button class="icon-btn" style="width:30px;height:30px" aria-label="Supprimer" onClick=${() => saveSealed(id, null)}><${Icon} n="trash" s=${14} /></button></td></tr>`)}
    </tbody></table></div>` : html`<${Empty} title="Aucun produit scellé">Displays, ETB, coffrets, tripacks… gardez une trace de vos achats et de leur valeur.<//>`}
  </div>`;
}

// ---------- binder view ----------
function BinderPage({ id, uid }) {
  const foreign = uid && uid !== S.me.id;
  const b = foreign ? ((pubOf(uid) || {}).binders || []).find(x => x.id === id) : binderList()[id];
  const [page, setPage] = useState(0);
  const [edit, setEdit] = useState(false);
  const wide = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(min-width: 861px)').matches;
  if (!b) return html`<div><${Back} /><${Empty} title="Classeur introuvable" /></div>`;
  const [cols, rows] = b.layout.split('x').map(Number);
  const per = cols * rows;
  const slots = binderSlots(b);
  const custom = b.kind === 'custom';
  const showSlots = custom && !foreign ? [...slots, null] : slots;
  const pages = Math.max(1, Math.ceil(showSlots.length / per));
  const step = wide ? 2 : 1;
  const p0 = Math.min(page, pages - 1) - (Math.min(page, pages - 1) % step);
  const om = foreign ? new Set((pubOf(uid) || {}).have || []) : owned();
  const has = idc => foreign ? om.has(idc) : om.has(idc);
  const filled = slots.filter(Boolean);
  const have = filled.filter(has).length;
  const missing = filled.filter(x => !has(x));
  const budget = missing.reduce((a, x) => a + ((CAT.byId.get(x) || {}).p || 0), 0);
  const setSlots = s => saveBinder(id, { ...b, slots: s });
  const Page = ({ pi, second }) => html`<div class=${'binder-page' + (second ? ' second' : '')} style=${`grid-template-columns:repeat(${cols},minmax(0,1fr))`}>
    ${Array.from({ length: per }, (_, j) => {
      const idx = pi * per + j;
      if (idx >= showSlots.length) return html`<div class="pocket emptyslot" style="cursor:default"><div class="tile ghost"></div></div>`;
      const cid = showSlots[idx];
      if (!cid) return custom && !foreign ? html`<button class="pocket" onClick=${() => openModal('picker', { title: 'Ajouter une carte au classeur', onPick: c => { const s = [...slots]; if (idx < s.length) s[idx] = c.id; else s.push(c.id); setSlots(s); } })}><div class="tile ghost" style="visibility:visible"><${Icon} n="plus" s=${22} /></div></button>` : html`<div class="pocket emptyslot"><div class="tile ghost"></div></div>`;
      const c = CAT.byId.get(cid); if (!c) return html`<div class="pocket emptyslot"><div class="tile ghost"></div></div>`;
      const ok = has(cid); const wish = !foreign && !ok && inWish(cid);
      return html`<div class=${'pocket' + (ok ? '' : ' missingslot')} role="button" tabindex="0" onClick=${() => edit ? null : go('card', { id: cid })} onKeyDown=${e => { if (e.key === 'Enter' && !edit) go('card', { id: cid }); }}>
        <div class=${'tile-wrap' + (ok ? '' : ' missing')}><${CardTile} c=${c} /></div>
        ${!ok ? html`<span class="ghostnum">${numLabel(c)}<br/>${cardName(c)}</span>` : null}
        <span class=${'mark ' + (ok ? 'ok' : wish ? 'wish' : 'no')} aria-label=${ok ? 'Possédée' : wish ? 'Recherchée' : 'Manquante'}>${ok ? '✓' : wish ? '♥' : '✕'}</span>
        ${edit ? html`<div class="row tight" style="position:absolute;left:4px;top:4px;z-index:3"><button class="icon-btn" style="width:26px;height:26px" aria-label="Déplacer vers la gauche" onClick=${e => { e.stopPropagation(); if (idx > 0) { const s = [...slots]; [s[idx - 1], s[idx]] = [s[idx], s[idx - 1]]; setSlots(s); } }}><${Icon} n="left" s=${12} /></button><button class="icon-btn" style="width:26px;height:26px" aria-label="Retirer" onClick=${e => { e.stopPropagation(); const s = [...slots]; s.splice(idx, 1); setSlots(s); }}><${Icon} n="x" s=${12} /></button></div>` : null}
      </div>`;
    })}
  </div>`;
  return html`<div class="stack l">
    <div><${Back} />
      <div class="spread" style="align-items:flex-end"><div class="stack s"><div class="eyebrow">${foreign ? 'Classeur de ' + displayName(uid) : (b.kind === 'set' ? 'Extension' : 'Sélection libre')} · pages ${b.layout.replace('x', ' × ')}</div><h1>${b.n}</h1>${b.d ? html`<p class="muted">${b.d}</p>` : null}</div>
        ${!foreign ? html`<div class="row">${custom ? html`<button class=${'btn' + (edit ? ' dark' : '')} onClick=${() => setEdit(!edit)}>${edit ? 'Terminer' : 'Réorganiser'}</button>` : null}<button class="btn" onClick=${() => openModal('binder', { id })}><${Icon} n="edit" />Réglages</button></div>` : null}
      </div>
    </div>
    <div class="panel stack s">
      <div class="spread"><b>${have} / ${filled.length} possédées${filled.length ? ` · ${Math.round(100 * have / filled.length)} %` : ''}</b>${missing.length && !foreign ? html`<span class="small">Il manque ${missing.length} cartes · budget estimé <b class="num">${fmtEUR(budget)}</b>${S.mode === 'cloud' ? html` · ${missing.filter(x => availability(x) > 0).length} disponibles chez des membres` : null}</span>` : null}</div>
      <div class="bar"><i style=${`width:${filled.length ? 100 * have / filled.length : 0}%`}></i></div>
      ${missing.length && !foreign ? html`<div class="row tight"><button class="btn sm" onClick=${() => { for (const x of missing) if (!inWish(x)) wishItems()[x] = { at: Date.now(), p: 2 }; savePriv('wish'); emit(); toast('Cartes manquantes ajoutées à vos recherches'); }}><${Icon} n="heart" />Rechercher les ${missing.length} manquantes</button>${S.mode === 'cloud' ? html`<button class="btn sm" onClick=${() => go('market', { tab: 'matches' })}>Trouver les cartes manquantes</button>` : null}</div>` : null}
    </div>
    <div class=${'binder-spread' + (wide ? '' : ' single')}>
      <${Page} pi=${p0} />
      ${wide ? (p0 + 1 < pages ? html`<${Page} pi=${p0 + 1} second=${true} />` : html`<div class="binder-page second"></div>`) : null}
    </div>
    <div class="row" style="justify-content:center">
      <button class="btn" disabled=${p0 === 0} onClick=${() => setPage(Math.max(0, p0 - step))}><${Icon} n="left" />Page précédente</button>
      <span class="num small">Page ${p0 + 1}${wide && p0 + 1 < pages ? '–' + (p0 + 2) : ''} / ${pages}</span>
      <button class="btn" disabled=${p0 + step >= pages} onClick=${() => setPage(p0 + step)}>Page suivante<${Icon} n="right" /></button>
    </div>
  </div>`;
}
