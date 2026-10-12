/* ============================================================
   Cartothèque — shared UI components
   ============================================================ */
const ICONS = {
  home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
  scan: 'M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M4 12h16',
  binder: 'M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM8 3v18M11 8h5M11 12h5',
  swap: 'M7 7h13l-4-4M17 17H4l4 4',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  bell: 'M6 16v-5a6 6 0 1 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0',
  heart: 'M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  check: 'M5 12l5 5 9-10',
  x: 'M6 6l12 12M18 6L6 18',
  left: 'M15 6l-6 6 6 6',
  right: 'M9 6l6 6-6 6',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  trash: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13',
  flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
  camera: 'M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  image: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  euro: 'M17 6a7 7 0 1 0 0 12M4 10h9M4 14h9',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  ext: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5',
  box: 'M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10',
  info: 'M12 8h.01M11 12h1v5h1M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
  ban: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM5.6 5.6l12.8 12.8',
  send: 'M4 12l16-8-6 16-2-6z',
  edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  copy: 'M9 9h10v11H9zM5 15V4h10',
};
function Icon({ n, s }) {
  return html`<svg viewBox="0 0 24 24" width=${s || 18} height=${s || 18} fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d=${ICONS[n] || ''} /></svg>`;
}
const GLYPHS = {
  0: 'M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z',
  1: 'M12 2c1 4 5 5.5 5 11a5 5 0 0 1-10 0c0-2.5 1.2-4 2.5-5 .2 2 1 3 2 3.5C11 9 10.5 5.5 12 2z',
  2: 'M12 2.5C9 7 5.5 10.5 5.5 14.5a6.5 6.5 0 0 0 13 0C18.5 10.5 15 7 12 2.5z',
  3: 'M5 19C5 10 10 4 20 4c0 10-6 15-15 15zm2-1.5l7-7-.9-.9-7 7z',
  4: 'M13 2L4 14h7l-1 8 9-12h-7z',
  5: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zm10 3.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z',
  6: 'M8 3h8l5 5v8l-5 5H8l-5-5V8z',
  7: 'M15 3a9 9 0 1 0 6 15A8 8 0 0 1 15 3z',
  8: 'M12 2l8.7 5v10L12 22l-8.7-5V7zm0 6.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z',
  9: 'M12 2l7 10-7 10-7-10z',
  10: 'M12 2l2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2z',
  tr: 'M7 3h10a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm2 4v2h6V7zm0 4v1.6h6V11z',
  en: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 4.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9z',
};
function Glyph({ c }) {
  const key = c.cat === 1 ? 'tr' : (c.t >= 0 ? c.t : (c.cat === 2 ? 'en' : 0));
  return html`<svg viewBox="0 0 24 24" aria-hidden="true"><path d=${GLYPHS[key]} fill="currentColor" fill-rule="evenodd" /></svg>`;
}
const tileClass = c => c.cat === 1 ? 't-tr' : c.t >= 0 ? 't-' + c.t : (c.cat === 2 ? 't-en' : 't-0');
const finishClass = (c, vi) => { const l = norm((c.v[vi == null ? c.mv : vi] || c.v[c.mv]).l); return l.startsWith('holo') ? 'holo' : l.startsWith('reverse') ? 'reverse' : ''; };

const BAD_IMG = new Set();
function CardTile({ c, vi, hq }) {
  const url = USE_IMAGES ? imgUrl(c, hq ? 'high' : 'low') : null;
  const [, setBad] = useState(0);
  if (url && !BAD_IMG.has(url)) {
    return html`<div class=${`tile photo ${finishClass(c, vi)}`}><img src=${url} alt=${`${cardName(c)}, ${c.set.n}, ${numLabel(c)}`} loading="lazy" decoding="async" onError=${() => { BAD_IMG.add(url); setBad(x => x + 1); }} /></div>`;
  }
  const rm = rarityMark(rarityName(c));
  return html`<div class=${`tile ${tileClass(c)} ${finishClass(c, vi)}`} aria-label=${`${cardName(c)}, ${c.set.n}, ${numLabel(c)}`}>
    <div class="tile-in">
      <div class="tile-top"><span class="tile-name">${cardName(c)}</span>${c.hp ? html`<span class="tile-hp">${c.hp}</span>` : null}</div>
      <div class="tile-art"><${Glyph} c=${c} />${c.dex ? html`<span class="tile-dex">N°${String(c.dex).padStart(3, '0')}</span>` : null}${c.cat ? html`<span class="tile-kind">${catName(c)}</span>` : null}</div>
      <div class="tile-bot"><span>${numLabel(c)}</span><span class="rar">${rm.s}</span><span>${c.set.a || ''}</span></div>
    </div>
  </div>`;
}

function statusOf(id) {
  const o = owned().get(id);
  return { own: o ? o.q : 0, want: inWish(id), trade: o ? o.trade : 0, sell: o ? o.sell : 0 };
}
function Pips({ id }) {
  const s = statusOf(id);
  if (!s.own && !s.want) return null;
  return html`<div class="state-pips">
    ${s.own ? html`<span class="pip own" title=${s.own > 1 ? `Possédée en ${s.own} exemplaires` : 'Possédée'}>${s.own > 1 ? s.own : '✓'}</span>` : null}
    ${s.want ? html`<span class="pip want" title="Recherchée">♥</span>` : null}
    ${s.trade ? html`<span class="pip trade" title="À échanger">⇄</span>` : null}
    ${s.sell ? html`<span class="pip sell" title="À vendre">€</span>` : null}
  </div>`;
}

function CardCell({ c, vi, sub, price, missing, onClick }) {
  const p = price != null ? price : (vi != null ? variantPrice(c, vi) : c.p);
  return html`<button class="ccell" onClick=${onClick || (() => go('card', { id: c.id }))}>
    <div class=${'tile-wrap' + (missing ? ' missing' : '')}><${CardTile} c=${c} vi=${vi} /><${Pips} id=${c.id} /></div>
    <div class="meta"><span class="nm">${cardName(c)}</span><span class="pr">${fmtEUR(p)}</span></div>
    ${sub ? html`<div class="tiny muted" style="margin-top:-4px">${sub}</div>` : null}
  </button>`;
}

function MiniTile({ c, vi, w }) {
  return html`<div style=${`width:${w || 44}px;flex:none`}><${CardTile} c=${c} vi=${vi} /></div>`;
}

function Delta({ x }) {
  if (x == null || !isFinite(x)) return html`<span class="muted num">—</span>`;
  return html`<span class=${'num ' + (x > 0.005 ? 'up' : x < -0.005 ? 'down' : 'muted')}>${fmtPct(x)}</span>`;
}

function ConfBadge({ conf }) {
  return html`<span class="small"><span class="conf-dot" style=${`background:${confColor(conf)}`}></span>Confiance ${conf} %</span>`;
}

function SetCode({ s }) { return html`<span class="set-code">${s.a || s.al || s.id.slice(0, 4).toUpperCase()}</span>`; }

function Empty({ title, children, action }) {
  return html`<div class="empty"><h3>${title}</h3>${children ? html`<p class="small" style="max-width:52ch">${children}</p>` : null}${action || null}</div>`;
}

function Avatar({ uid, size }) {
  const [src, setSrc] = useState(uid === S.me.id ? S.me.avatar : '');
  useEffect(() => {
    let alive = true;
    if (S.user && uid && uid !== 'local') S.user.profiles([uid]).then(ps => { if (alive && ps[uid]) { setSrc(ps[uid].avatarUrl); if (ps[uid].name && !nameCache.get(uid)) { nameCache.set(uid, ps[uid].name); emit(); } } }).catch(() => {});
    return () => { alive = false; };
  }, [uid]);
  const cls = 'avatar' + (size ? ' ' + size : '');
  return src ? html`<img class=${cls} src=${src} alt="" />` : html`<span class=${cls} style="display:inline-grid;place-items:center;font-weight:700">${(displayName(uid) || '?').slice(0, 1).toUpperCase()}</span>`;
}

function Stepper({ value, min = 0, max = 999, onChange, label }) {
  return html`<div class="row tight" role="group" aria-label=${label || 'Quantité'}>
    <button class="icon-btn" style="width:30px;height:30px" aria-label="Moins" disabled=${value <= min} onClick=${() => onChange(Math.max(min, value - 1))}><${Icon} n="minus" s=${14} /></button>
    <span class="num" style="min-width:24px;text-align:center">${value}</span>
    <button class="icon-btn" style="width:30px;height:30px" aria-label="Plus" disabled=${value >= max} onClick=${() => onChange(Math.min(max, value + 1))}><${Icon} n="plus" s=${14} /></button>
  </div>`;
}

function Seg({ options, value, onChange, label }) {
  return html`<div class="seg" role="group" aria-label=${label || ''}>${options.map(o => html`<button aria-pressed=${String(o.v === value)} onClick=${() => onChange(o.v)}>${o.l}</button>`)}</div>`;
}

// ---------- modal host ----------
function openModal(type, props = {}) { S.modal = { type, props }; emit(); }
function closeModal() { S.modal = null; emit(); }
function Modal({ title, children, wide }) {
  useEffect(() => {
    const k = e => { if (e.key === 'Escape') closeModal(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);
  return html`<div class="modal-scrim" onClick=${e => { if (e.target === e.currentTarget) closeModal(); }}>
    <div class=${'modal' + (wide ? ' wide' : '')} role="dialog" aria-modal="true" aria-label=${title}>
      <div class="spread" style="margin-bottom:14px"><h2>${title}</h2><button class="icon-btn" aria-label="Fermer" onClick=${closeModal}><${Icon} n="x" /></button></div>
      ${children}
    </div>
  </div>`;
}

// ---------- add to collection ----------
function AddModal({ id, vi, preset }) {
  const c = CAT.byId.get(id);
  const [v, setV] = useState(vi != null ? vi : c.mv);
  const [k, setK] = useState((preset && preset.k) || 'NM');
  const [g, setG] = useState((preset && preset.g) || 'fr');
  const [q, setQ] = useState((preset && preset.q) || 1);
  const [pp, setPp] = useState('');
  const [graded, setGraded] = useState(false);
  const [gc, setGc] = useState('PSA');
  const [gg, setGg] = useState('10');
  const [binder, setBinder] = useState('');
  const customBinders = Object.entries(binderList()).filter(([, b]) => b.kind === 'custom');
  const unit = variantPrice(c, v) * condF(k);
  const submit = () => {
    addItem(id, { v, k, g, q, pp: parseFloat(String(pp).replace(',', '.')) || 0, gr: graded ? `${gc} ${gg}` : undefined });
    if (binder) { const b = binderList()[binder]; if (b) saveBinder(binder, { ...b, slots: [...(b.slots || []), id] }); }
    if (inWish(id)) toggleWish(id);
    closeModal();
    toast(`${cardName(c)} ajoutée à votre collection`);
  };
  return html`<${Modal} title="Ajouter à ma collection">
    <div class="stack">
      <div class="row" style="align-items:flex-start;flex-wrap:nowrap"><${MiniTile} c=${c} vi=${v} w=${70} /><div class="grow"><h3>${cardName(c)}</h3><p class="small muted">${c.set.n} · ${numLabel(c)}</p><p class="small">Valeur estimée dans cet état : <b class="num">${fmtEUR(unit)}</b></p></div></div>
      ${c.v.length > 1 ? html`<label class="field">Variante<select id="add-variant" value=${v} onChange=${e => setV(+e.target.value)}>${c.v.map((x, i) => html`<option value=${i}>${x.l}</option>`)}</select></label>` : null}
      <div class="field"><span class="small" style="font-weight:600;color:var(--ink-2)">État</span><${Seg} label="État" options=${CONDS.map(x => ({ v: x.k, l: x.k }))} value=${k} onChange=${setK} /><span class="tiny muted">${(CONDS.find(x => x.k === k) || {}).l} · ${Math.round(condF(k) * 100)} % de la cote NM</span></div>
      <div class="row">
        <label class="field">Langue<select id="add-lang" value=${g} onChange=${e => setG(e.target.value)}>${LANGS.map(l => html`<option value=${l.k}>${l.l}</option>`)}</select></label>
        <div class="field"><span>Quantité</span><${Stepper} value=${q} min=${1} onChange=${setQ} /></div>
        <label class="field">Prix d'achat unitaire (facultatif)<input autocomplete="off" id="add-pp" type="text" inputmode="decimal" placeholder="ex. 12,50" value=${pp} onInput=${e => setPp(e.target.value)} style="width:150px" /></label>
      </div>
      <label class="switch"><input id="add-graded" type="checkbox" checked=${graded} onChange=${e => setGraded(e.target.checked)} />Carte gradée</label>
      ${graded ? html`<div class="row"><label class="field">Société<select id="add-gc" value=${gc} onChange=${e => setGc(e.target.value)}>${['PSA', 'PCA', 'CGC', 'BGS', 'CCC', 'Autre'].map(x => html`<option>${x}</option>`)}</select></label><label class="field">Note<input autocomplete="off" id="add-gg" type="text" value=${gg} onInput=${e => setGg(e.target.value)} style="width:80px" /></label></div>` : null}
      ${customBinders.length ? html`<label class="field">Ranger dans un classeur (facultatif)<select id="add-binder" value=${binder} onChange=${e => setBinder(e.target.value)}><option value="">Aucun</option>${customBinders.map(([bid, b]) => html`<option value=${bid}>${b.n}</option>`)}</select></label>` : null}
      <div class="row" style="justify-content:flex-end"><button class="btn ghost" onClick=${closeModal}>Annuler</button><button class="btn primary" onClick=${submit}><${Icon} n="plus" />Ajouter ${q > 1 ? q + ' exemplaires' : ''}</button></div>
    </div>
  <//>`;
}

// ---------- card picker ----------
function PickerModal({ title, onPick, setIdx }) {
  const [q, setQ] = useState('');
  const res = useMemo(() => q.trim().length >= 2 ? searchCards(q, { setIdx }).slice(0, 30) : (setIdx != null ? CAT.sets[setIdx].cards.slice(0, 30) : []), [q]);
  return html`<${Modal} title=${title || 'Choisir une carte'} wide=${true}>
    <div class="stack">
      <input autocomplete="off" id="picker-q" type="search" placeholder="Nom, numéro (125/197) ou code (MEW 6)" value=${q} onInput=${e => setQ(e.target.value)} autofocus />
      ${res.length ? html`<div class="grid-cards">${res.map(c => html`<${CardCell} c=${c} onClick=${() => { onPick(c); closeModal(); }} sub=${c.set.n} />`)}</div>` : html`<p class="muted small">Tapez au moins deux caractères.</p>`}
    </div>
  <//>`;
}

// ---------- my copies of a card ----------
function CopiesModal({ id, mode }) {
  const c = CAT.byId.get(id);
  const items = (owned().get(id) || { items: [] }).items;
  return html`<${Modal} title=${mode === 'sell' ? 'Mettre en vente' : mode === 'trade' ? "Proposer à l'échange" : 'Mes exemplaires'} wide=${true}>
    <div class="stack">
      <p class="small muted">${mode === 'sell' ? "Indiquez combien d'exemplaires vous vendez et à quel prix. Ils apparaîtront dans les annonces si la vente est activée dans votre profil." : mode === 'trade' ? "Indiquez combien d'exemplaires vous proposez à l'échange. Les membres qui recherchent cette carte vous verront dans leurs correspondances." : "Chaque ligne correspond à une combinaison variante, langue et état."}</p>
      ${items.length ? html`<div class="table-wrap"><table class="data">
        <thead><tr><th>Variante</th><th>Langue</th><th>État</th><th>Qté</th><th>Échange</th><th>Vente</th><th>Prix demandé</th><th class="r">Valeur</th><th></th></tr></thead>
        <tbody>${items.map(it => html`<tr key=${it.id}>
          <td>${(c.v[it.v] || c.v[c.mv]).l}${it.gr ? html` <span class="chip">${it.gr}</span>` : null}</td>
          <td>${langS(it.g)}</td>
          <td><select aria-label="État" value=${it.k} onChange=${e => updateItem(it, { k: e.target.value })}>${CONDS.map(x => html`<option value=${x.k}>${x.k}</option>`)}</select></td>
          <td><${Stepper} value=${it.q} min=${1} onChange=${n => updateItem(it, { q: n })} /></td>
          <td><${Stepper} label="À échanger" value=${it.tq || 0} max=${it.q} onChange=${n => updateItem(it, { tq: n })} /></td>
          <td><${Stepper} label="À vendre" value=${it.sq || 0} max=${it.q} onChange=${n => updateItem(it, { sq: n, sp: it.sp || round2(variantPrice(c, it.v) * condF(it.k)) || undefined })} /></td>
          <td><input autocomplete="off" aria-label="Prix demandé" type="text" inputmode="decimal" style="width:84px" value=${it.sp ? String(it.sp).replace('.', ',') : ''} placeholder=${fmtEUR(variantPrice(c, it.v) * condF(it.k))} onChange=${e => updateItem(it, { sp: parseFloat(e.target.value.replace(',', '.')) || undefined })} /></td>
          <td class="r num">${fmtEUR(itemValue(it))}</td>
          <td><button class="icon-btn" style="width:32px;height:32px" aria-label="Retirer de la collection" onClick=${() => removeItem(it)}><${Icon} n="trash" s=${15} /></button></td>
        </tr>${it.sq > 0 ? html`<tr key=${it.id + '-proof'}><td colspan="9">
          <div class="row tight">
            ${it.proof && it.proof.p ? html`<${ProofView} proof=${it.proof} compact=${true} />` : (it.sp >= PROOF_MIN_PRICE ? html`<span class="small" style="color:var(--down)">⚠ Annonce non publiée : une photo réelle est obligatoire à partir de ${PROOF_MIN_PRICE} €.</span>` : html`<span class="tiny muted">Une photo réelle rassure les acheteurs (obligatoire à partir de ${PROOF_MIN_PRICE} €).</span>`)}
            ${S.mode === 'cloud' && PF.uploadProof ? html`<button class="btn sm" onClick=${() => openModal('proof', { item: it })}><${Icon} n="camera" />${it.proof && it.proof.p ? 'Changer la photo' : 'Ajouter une photo réelle'}</button>` : null}
          </div>
        </td></tr>` : null}`)}</tbody></table></div>` : html`<${Empty} title="Vous ne possédez pas encore cette carte" action=${html`<button class="btn primary" onClick=${() => openModal('add', { id })}>Ajouter à ma collection</button>`} />`}
      <div class="row" style="justify-content:space-between"><button class="btn sm" onClick=${() => openModal('add', { id })}><${Icon} n="plus" />Autre exemplaire</button><button class="btn dark" onClick=${closeModal}>Terminé</button></div>
    </div>
  <//>`;
}

// ---------- trade composer ----------
function TradeModal({ to, wantIds, offerIds, kind: kind0 }) {
  const pub = pubOf(to) || {};
  const theirs = [...new Set([...(pub.tradeIds || []), ...(pub.sellIds || [])])].filter(id => CAT.byId.has(id));
  const mine = [...new Set([...allItems().filter(it => it.tq > 0).map(it => it.c), ...[...owned()].filter(([, o]) => o.q > 1).map(([id]) => id)])];
  const [get, setGet] = useState(new Set(wantIds || []));
  const [give, setGive] = useState(new Set(offerIds || []));
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const kind = give.size === 0 && get.size > 0 && [...get].every(id => (pub.sellIds || []).includes(id)) ? 'buy' : (kind0 || 'trade');
  const askPrice = [...get].reduce((a, id) => a + ((pub.sell || {})[id] ? (pub.sell[id][3] || 0) : 0), 0);
  const giveV = [...give].reduce((a, id) => a + ((CAT.byId.get(id) || {}).p || 0), 0);
  const getV = [...get].reduce((a, id) => a + ((CAT.byId.get(id) || {}).p || 0), 0);
  const tog = (set, fn, id) => { const n = new Set(set); n.has(id) ? n.delete(id) : n.add(id); fn(n); };
  const send = async () => {
    setBusy(true);
    const id = await createTrade({ to, give: [...give].map(c => ({ c })), get: [...get].map(c => ({ c })), kind, price: kind === 'buy' ? askPrice : 0, text: text.trim() || (kind === 'buy' ? 'Bonjour, ces cartes sont-elles toujours disponibles ?' : "Bonjour, je vous propose cet échange.") }).catch(() => null);
    setBusy(false);
    if (id) { closeModal(); toast('Proposition envoyée'); go('trade', { id }); } else toast("La proposition n'a pas pu être envoyée.");
  };
  const List = ({ ids, sel, fn, empty }) => ids.length ? html`<div class="stack s" style="max-height:260px;overflow:auto">${ids.map(id => { const c = CAT.byId.get(id); return html`<label key=${id} class="row" style="flex-wrap:nowrap;cursor:pointer;padding:4px 0"><input type="checkbox" checked=${sel.has(id)} onChange=${() => tog(sel, fn, id)} /><${MiniTile} c=${c} w=${34} /><span class="grow small"><b>${cardName(c)}</b><br/><span class="muted">${c.set.n} · ${numLabel(c)}</span></span><span class="num small">${fmtEUR(c.p)}</span></label>`; })}</div>` : html`<p class="small muted">${empty}</p>`;
  return html`<${Modal} title=${`Proposer un échange à ${displayName(to)}`} wide=${true}>
    <div class="stack">
      <div class="grid-2">
        <div class="panel flat"><div class="eyebrow" style="margin-bottom:8px">Je demande · ${fmtEUR(getV)}</div><${List} ids=${theirs} sel=${get} fn=${setGet} empty="Ce membre ne propose aucune carte pour le moment." /></div>
        <div class="panel flat"><div class="eyebrow" style="margin-bottom:8px">Je propose · ${fmtEUR(giveV)}</div><${List} ids=${mine} sel=${give} fn=${setGive} empty="Marquez des cartes « à échanger » ou gardez des doubles pour pouvoir les proposer." /></div>
      </div>
      ${kind === 'buy' ? html`<p class="notice">Achat direct : prix demandé par le vendeur <b class="num">${fmtEUR(askPrice)}</b>. Le paiement et l'envoi se règlent entre vous ; la plateforme n'intervient pas en V1.</p>` : null}
      <label class="field">Message<textarea autocomplete="off" id="trade-msg" rows="3" maxlength="1000" placeholder="Bonjour, je vous propose…" value=${text} onInput=${e => setText(e.target.value)}></textarea></label>
      <p class="tiny muted">Ne partagez ni adresse ni coordonnées bancaires ici. Les messages restent lisibles par l'équipe de modération.</p>
      <div class="row" style="justify-content:flex-end"><button class="btn ghost" onClick=${closeModal}>Annuler</button><button class="btn primary" disabled=${busy || (!give.size && !get.size)} onClick=${send}><${Icon} n="send" />Envoyer la proposition</button></div>
    </div>
  <//>`;
}

// ---------- binder editor ----------
const BINDER_COLORS = ['#1f2a44', '#7a1f2b', '#0f5c4d', '#3d2a6b', '#8a5a14', '#2b2f36'];
function BinderModal({ id, set: presetSet }) {
  const cur = id ? binderList()[id] : null;
  const [n, setN] = useState(cur ? cur.n : (presetSet ? `Master set ${CAT.setById.get(presetSet).n}` : ''));
  const [d, setD] = useState(cur ? cur.d || '' : '');
  const [kind, setKind] = useState(cur ? cur.kind : (presetSet ? 'set' : 'custom'));
  const [setId, setSetId] = useState(cur ? cur.set || '' : (presetSet || CAT.latestSets[0].id));
  const [layout, setLayout] = useState(cur ? cur.layout : '3x3');
  const [vis, setVis] = useState(cur ? cur.vis : 'private');
  const [col, setCol] = useState(cur ? cur.col : BINDER_COLORS[0]);
  const save = () => {
    const bid = id || newId();
    saveBinder(bid, { ...(cur || { at: Date.now(), slots: [] }), n: n.trim() || 'Mon classeur', d: d.trim(), kind, set: kind === 'set' ? setId : null, layout, vis, col });
    closeModal();
    go('binder', { id: bid });
  };
  return html`<${Modal} title=${id ? 'Modifier le classeur' : 'Nouveau classeur'}>
    <div class="stack">
      <label class="field">Nom<input autocomplete="off" id="binder-name" type="text" value=${n} placeholder="ex. Master Set Méga-Évolution" onInput=${e => setN(e.target.value)} /></label>
      <label class="field">Description<input autocomplete="off" id="binder-desc" type="text" value=${d} placeholder="facultatif" onInput=${e => setD(e.target.value)} /></label>
      <div class="field"><span>Contenu</span><${Seg} options=${[{ v: 'set', l: "Une extension complète" }, { v: 'custom', l: 'Libre' }]} value=${kind} onChange=${setKind} /></div>
      ${kind === 'set' ? html`<label class="field">Extension<select id="binder-set" value=${setId} onChange=${e => setSetId(e.target.value)}>${CAT.latestSets.map(s => html`<option value=${s.id}>${s.n} (${(s.d || '').slice(0, 4)})</option>`)}</select></label>` : null}
      <div class="field"><span>Format de page</span><${Seg} options=${['2x2', '3x3', '4x3', '4x4'].map(x => ({ v: x, l: x.replace('x', ' × ') }))} value=${layout} onChange=${setLayout} /></div>
      <div class="field"><span>Visibilité</span><${Seg} options=${[{ v: 'private', l: 'Privé' }, { v: 'public', l: 'Visible sur mon profil' }]} value=${vis} onChange=${setVis} /></div>
      <div class="field"><span>Couleur</span><div class="row tight">${BINDER_COLORS.map(x => html`<button aria-label=${'Couleur ' + x} aria-pressed=${String(x === col)} onClick=${() => setCol(x)} style=${`width:30px;height:30px;border-radius:50%;background:${x};border:3px solid ${x === col ? 'var(--accent)' : 'transparent'};cursor:pointer`}></button>`)}</div></div>
      <div class="row" style="justify-content:space-between">
        ${id ? html`<button class="btn danger ghost" onClick=${() => { deleteBinder(id); closeModal(); go('collection', { tab: 'binders' }); }}><${Icon} n="trash" />Supprimer</button>` : html`<span></span>`}
        <div class="row"><button class="btn ghost" onClick=${closeModal}>Annuler</button><button class="btn primary" onClick=${save}>${id ? 'Enregistrer' : 'Créer le classeur'}</button></div>
      </div>
    </div>
  <//>`;
}

function ConfirmModal({ title, text, confirm, danger, onConfirm }) {
  return html`<${Modal} title=${title}><div class="stack"><p>${text}</p><div class="row" style="justify-content:flex-end"><button class="btn ghost" onClick=${closeModal}>Annuler</button><button class=${'btn ' + (danger ? 'danger' : 'primary')} onClick=${async () => { closeModal(); await onConfirm(); }}>${confirm || 'Confirmer'}</button></div></div><//>`;
}

function ReportModal({ target, ctx }) {
  const [reason, setReason] = useState('');
  return html`<${Modal} title="Signaler">
    <div class="stack">
      <p class="small muted">Expliquez ce qui pose problème (arnaque, contenu inapproprié, faux prix…). La modération reçoit votre signalement.</p>
      <textarea autocomplete="off" id="report-reason" rows="4" maxlength="500" value=${reason} onInput=${e => setReason(e.target.value)}></textarea>
      <div class="row" style="justify-content:flex-end"><button class="btn ghost" onClick=${closeModal}>Annuler</button><button class="btn primary" disabled=${!reason.trim()} onClick=${() => { report(target, reason, ctx || {}); closeModal(); }}>Envoyer</button></div>
    </div>
  <//>`;
}

function ListingModal({ l }) {
  const c = l.c;
  return html`<${Modal} title="Annonce">
    <div class="stack">
      <div class="row" style="align-items:flex-start;flex-wrap:nowrap"><${MiniTile} c=${c} vi=${l.v} w=${96} /><div class="grow stack s">
        <h3>${cardName(c)}</h3><p class="small muted">${c.set.n} · ${numLabel(c)} · ${(c.v[l.v] || c.v[c.mv]).l}</p>
        <div class="row tight"><span class="chip">${langS(l.g)}</span><span class="chip">${l.k}</span><span class="chip">${plural(l.q, 'exemplaire')}</span></div>
        <div class="row"><span class="num" style="font-size:1.5rem;font-weight:700">${fmtEUR(l.price)}</span><span class="small muted">cote ${fmtEUR(variantPrice(c, l.v) * condF(l.k))}</span></div>
      </div></div>
      <div class="row"><${Avatar} uid=${l.uid} size="sm" /><span><b>${displayName(l.uid, l.pub)}</b>${l.pub.region ? html` · <span class="muted">${l.pub.region}</span>` : null}</span><${TrustBadge} uid=${l.uid} long=${true} /></div>
      ${l.proof ? html`<${ProofView} proof=${l.proof} />` : html`<p class="small notice warn">Pas de photo réelle pour cette annonce : demandez au vendeur une photo de la carte avec votre pseudo et la date du jour avant de payer.</p>`}
      ${(() => { const r = priceRisk(l.price, c, l.v, l.k); return r ? html`<p class=${'small notice' + (r.level === 'danger' ? ' danger' : r.level === 'warn' ? ' warn' : '')}>${r.text}</p>` : null; })()}
      <p class="tiny muted">Paiement protégé uniquement (PayPal « Biens et services » ou en main propre), envoi suivi. La réception se confirme des deux côtés dans l'échange ; en cas de problème, ouvrez un litige.</p>
      <div class="row" style="justify-content:space-between"><button class="btn ghost sm" onClick=${() => openModal('report', { target: l.uid, ctx: { card: c.id } })}><${Icon} n="flag" />Signaler</button><div class="row"><button class="btn" onClick=${() => { closeModal(); go('card', { id: c.id }); }}>Voir la cote</button><button class="btn primary" disabled=${S.mode !== 'cloud'} onClick=${() => openModal('trade', { to: l.uid, wantIds: [c.id] })}>Contacter le vendeur</button></div></div>
    </div>
  <//>`;
}

const MODALS = { add: AddModal, picker: PickerModal, copies: CopiesModal, trade: TradeModal, binder: BinderModal, confirm: ConfirmModal, report: ReportModal, listing: ListingModal };
function ModalHost() {
  if (!S.modal) return null;
  const M = MODALS[S.modal.type];
  return M ? html`<${M} ...${S.modal.props} />` : null;
}
