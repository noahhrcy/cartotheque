/* ============================================================
   Cartothèque — market, trades, profiles, admin, about, app
   ============================================================ */
function CloudOnly({ what }) {
  return html`<${Empty} title=${`${what} demande un compte`} action=${PF.LoginButton ? html`<${PF.LoginButton} />` : null}>${PF.text.cloudOnly}<//>`;
}

function MarketPage({ tab: tab0 }) {
  const [tab, setTab] = useState(tab0 || 'matches');
  if (S.mode !== 'cloud') return html`<div class="stack l"><h1>Marché</h1><${CloudOnly} what="Le marché" /></div>`;
  const unread = S.trades.filter(tradeUnread).length;
  const tabs = [['matches', 'Correspondances'], ['listings', 'Annonces'], ['trades', `Mes échanges${unread ? ` (${unread})` : ''}`], ['members', 'Membres']];
  return html`<div class="stack l">
    <div class="spread"><h1>Marché</h1><span class="small muted">${plural(communityPubs().length, 'membre actif', 'membres actifs')} · échanges et ventes entre collectionneurs</span></div>
    <div class="tabs" role="tablist">${tabs.map(([k, l]) => html`<button role="tab" aria-selected=${String(tab === k)} onClick=${() => setTab(k)}>${l}</button>`)}</div>
    ${tab === 'matches' ? html`<${Matches} />` : tab === 'listings' ? html`<${Listings} />` : tab === 'trades' ? html`<${TradesList} />` : html`<${Members} />`}
  </div>`;
}

function Matches() {
  const ms = matchesForMe();
  useEffect(() => { resolveNames(ms.map(m => m.uid)); }, [ms.length]);
  const want = Object.keys(wishItems()).length;
  const myTrade = allItems().filter(it => it.tq > 0).length;
  return html`<div class="stack">
    <p class="small muted" style="max-width:70ch">Vos recherches sont croisées en permanence avec les cartes que les autres membres proposent, et vos doubles avec ce qu'ils recherchent.</p>
    ${!want && !myTrade ? html`<p class="notice">Ajoutez des cartes à vos recherches et marquez vos doubles « à échanger » pour faire apparaître des correspondances.</p>` : null}
    ${ms.length ? ms.map(m => html`<div class="match" key=${m.uid}>
      <${Avatar} uid=${m.uid} />
      <div class="stack s" style="min-width:0">
        <div class="row tight"><b>${displayName(m.uid, m.pub)}</b>${m.pub.region ? html`<span class="small muted">${m.pub.region}</span>` : null}${m.compatible ? html`<span class="chip pill-own">Échange potentiellement compatible</span>` : null}</div>
        ${m.offerMatch.length ? html`<span class="small">Propose <b>${plural(m.offerMatch.length, 'carte')}</b> que vous recherchez : ${m.offerMatch.slice(0, 4).map(id => cardName(CAT.byId.get(id))).join(', ')}${m.offerMatch.length > 4 ? '…' : ''}</span>` : null}
        ${m.haveMatch.length ? html`<span class="small muted">Possède aussi ${plural(m.haveMatch.length, 'carte')} de votre wishlist (pas encore proposée${m.haveMatch.length > 1 ? 's' : ''})</span>` : null}
        ${m.theyWantMine.length ? html`<span class="small">Recherche <b>${plural(m.theyWantMine.length, 'de vos doubles', 'de vos doubles')}</b> : ${m.theyWantMine.slice(0, 4).map(id => cardName(CAT.byId.get(id))).join(', ')}</span>` : null}
      </div>
      <div class="row tight" style="justify-content:flex-end"><button class="btn sm" onClick=${() => go('user', { uid: m.uid })}>Profil</button><button class="btn primary sm" onClick=${() => openModal('trade', { to: m.uid, wantIds: m.offerMatch, offerIds: m.theyWantMine })}>Proposer</button></div>
    </div>`) : html`<${Empty} title="Pas encore de correspondance">${communityPubs().length ? "Aucun membre ne propose pour l'instant les cartes que vous recherchez. Vous serez prévenu dans les notifications dès que ça change." : "Vous êtes parmi les premiers membres. Partagez la page à d'autres collectionneurs : leurs listes apparaîtront ici automatiquement."}<//>`}
  </div>`;
}

function Listings() {
  const [f, setF] = useState('');
  const [max, setMax] = useState('');
  const [sort, setSort] = useState('recent');
  const all = listings();
  useEffect(() => { resolveNames([...new Set(all.map(l => l.uid))]); }, [all.length]);
  let rows = all.filter(l => (!f || norm(cardName(l.c)).includes(norm(f)) || norm(l.c.set.n).includes(norm(f))) && (!max || l.price <= parseFloat(max.replace(',', '.'))));
  rows.sort((a, b) => sort === 'price-asc' ? a.price - b.price : sort === 'deal' ? (a.price / (variantPrice(a.c, a.v) || 1e9)) - (b.price / (variantPrice(b.c, b.v) || 1e9)) : (b.pub.upd || 0) - (a.pub.upd || 0));
  return html`<div class="stack">
    <div class="row tight"><input id="lst-f" type="search" placeholder="Carte ou extension" value=${f} onInput=${e => setF(e.target.value)} style="flex:1;min-width:160px" /><input id="lst-max" type="text" inputmode="decimal" placeholder="Prix max €" value=${max} onInput=${e => setMax(e.target.value)} style="width:110px" /><select id="lst-sort" aria-label="Tri" value=${sort} onChange=${e => setSort(e.target.value)}><option value="recent">Plus récentes</option><option value="price-asc">Prix croissant</option><option value="deal">Meilleur rapport prix / cote</option></select></div>
    ${rows.length ? html`<div class="grid-cards">${rows.slice(0, 120).map(l => html`<${CardCell} key=${l.uid + l.c.id} c=${l.c} vi=${l.v} price=${l.price} sub=${`${l.k} · ${langS(l.g)} · ${displayName(l.uid, l.pub)}`} onClick=${() => openModal('listing', { l })} />`)}</div>`
      : html`<${Empty} title="Aucune annonce">${all.length ? 'Aucune annonce ne correspond à ces filtres.' : "Les cartes que les membres mettent en vente apparaîtront ici. Pour vendre les vôtres : fiche de la carte → « Je la vends »."}<//>`}
  </div>`;
}

const TRADE_STATUS = { open: ['En attente', 'var(--warn)'], accepted: ['Acceptée', 'var(--st-trade)'], refused: ['Refusée', 'var(--down)'], cancelled: ['Annulée', 'var(--muted)'], done: ['Conclue', 'var(--up)'] };
function StatusChip({ s }) { const [l, c] = TRADE_STATUS[s] || [s, 'var(--muted)']; return html`<span class="chip" style=${`color:${c};border-color:${c};background:transparent`}>${l}</span>`; }

function TradesList() {
  const ts = S.trades.filter(t => !blocked()[t.a === S.me.id ? t.b : t.a]);
  useEffect(() => { resolveNames(ts.map(t => t.a === S.me.id ? t.b : t.a)); }, [ts.length]);
  if (!ts.length) return html`<${Empty} title="Aucun échange en cours">Proposez un échange depuis une correspondance, une annonce ou le profil d'un membre.<//>`;
  return html`<div class="stack s">${ts.map(t => {
    const other = t.a === S.me.id ? t.b : t.a;
    const mine = t.a === S.me.id;
    return html`<button class="match" style="cursor:pointer;text-align:left;color:inherit" onClick=${() => go('trade', { id: t.id })}>
      <${Avatar} uid=${other} />
      <div class="stack s" style="min-width:0"><div class="row tight"><b>${displayName(other)}</b><${StatusChip} s=${t.status} />${tradeUnread(t) ? html`<span class="chip" style="background:var(--st-want);color:#fff;border-color:transparent">Nouveau</span>` : null}</div>
        <span class="small muted">${mine ? 'Vous proposez' : 'On vous propose'} ${t.kind === 'buy' ? `un achat de ${plural((t.get || []).length, 'carte')} · ${fmtEUR(t.price)}` : `${plural((mine ? t.give : t.get || []).length, 'carte')} contre ${plural((mine ? t.get : t.give || []).length, 'carte')}`}</span></div>
      <span class="tiny muted num">${fmtDT(t.upd)}</span>
    </button>`;
  })}</div>`;
}

function Members() {
  const [f, setF] = useState('');
  const ps = communityPubs();
  useEffect(() => { resolveNames(ps.map(p => p.uid)); }, [ps.length]);
  const rows = ps.filter(p => !f || norm(displayName(p.uid, p)).includes(norm(f)) || norm(p.region).includes(norm(f))).sort((a, b) => (b.stats || {}).cards - (a.stats || {}).cards);
  return html`<div class="stack">
    <input id="mem-f" type="search" placeholder="Rechercher un membre ou une région" value=${f} onInput=${e => setF(e.target.value)} />
    ${rows.length ? html`<div class="grid-2">${rows.map(p => html`<button class="match" key=${p.uid} style="cursor:pointer;text-align:left;color:inherit" onClick=${() => go('user', { uid: p.uid })}>
      <${Avatar} uid=${p.uid} />
      <div style="min-width:0"><b>${displayName(p.uid, p)}</b><div class="small muted">${p.region || 'Région non précisée'}</div><div class="tiny muted">${p.colPublic ? `${fmtInt((p.stats || {}).cards)} cartes · ` : ''}${(p.stats || {}).wanted || 0} recherchées · ${(p.stats || {}).trade || 0} à l'échange · ${(p.stats || {}).sell || 0} en vente</div></div>
      <${Icon} n="right" />
    </button>`)}</div>` : html`<${Empty} title="Aucun membre trouvé">${ps.length ? 'Essayez un autre nom.' : "Aucun autre membre n'a encore de profil public."}<//>`}
  </div>`;
}

function TradeLines({ list, title }) {
  return html`<div class="panel flat stack s"><div class="eyebrow">${title}</div>${(list || []).length ? list.map(x => { const c = CAT.byId.get(x.c); return c ? html`<button class="mover" onClick=${() => go('card', { id: c.id })}><${MiniTile} c=${c} w=${36} /><span style="min-width:0"><span class="nm" style="display:block">${cardName(c)}</span><span class="tiny muted">${c.set.n} · ${numLabel(c)}</span></span><span class="num small">${fmtEUR(c.p)}</span></button>` : null; }) : html`<p class="small muted">Rien</p>`}</div>`;
}

function TradePage({ id }) {
  const t = S.trades.find(x => x.id === id);
  const [text, setText] = useState('');
  const [price, setPrice] = useState('');
  const endRef = useRef(null);
  useEffect(() => { if (t) tradeMarkSeen(t); }, [t && t.upd]);
  useEffect(() => { if (endRef.current) endRef.current.scrollTop = endRef.current.scrollHeight; }, [t && Object.keys(t.msgs || {}).length]);
  if (S.mode !== 'cloud') return html`<${CloudOnly} what="Cet échange" />`;
  if (!t) return html`<div><${Back} /><${Empty} title="Échange introuvable">Il a peut-être été supprimé, ou la page est encore en train de charger.<//></div>`;
  const mine = t.a === S.me.id;
  const other = mine ? t.b : t.a;
  const msgs = Object.values(t.msgs || {}).sort((a, b) => a.at - b.at);
  const events = Object.values(t.events || {}).sort((a, b) => a.at - b.at);
  const send = () => { if (!text.trim()) return; tradeSay(t, text.trim()); setText(''); };
  const conclude = () => {
    const p = parseFloat(String(price).replace(',', '.')) || (t.kind === 'buy' ? t.price : 0);
    tradeSetStatus(t, 'done', p ? { finalPrice: p } : {});
    if (p > 0 && (t.get || []).length === 1 && !(t.give || []).length) recordSale(t.get[0].c, p, 'NM');
    toast('Échange marqué comme conclu');
  };
  return html`<div class="stack l">
    <div><${Back} /><div class="spread"><div class="row"><${Avatar} uid=${other} /><div><div class="eyebrow">${mine ? 'Proposition envoyée à' : 'Proposition de'}</div><h2>${displayName(other)}</h2></div></div><div class="row tight"><${StatusChip} s=${t.status} /><span class="tiny muted">${fmtDT(t.at)}</span></div></div></div>
    <div class="grid-2">
      <${TradeLines} title=${mine ? (t.kind === 'buy' ? 'Vous achetez' : 'Vous demandez') : (t.kind === 'buy' ? 'On vous achète' : 'On vous demande')} list=${t.get} />
      ${t.kind === 'buy' ? html`<div class="panel flat stack s"><div class="eyebrow">Prix proposé</div><span class="num" style="font-size:1.6rem;font-weight:700">${fmtEUR(t.finalPrice || t.price)}</span><p class="small muted">Paiement et envoi à régler entre vous. La plateforme n'intervient pas encore dans les transactions.</p></div>` : html`<${TradeLines} title=${mine ? 'Vous proposez' : 'En échange, vous recevez'} list=${t.give} />`}
    </div>
    <div class="panel stack s">
      <div class="row tight">
        ${t.status === 'open' && !mine ? html`<button class="btn primary" onClick=${() => { tradeSetStatus(t, 'accepted'); toast('Proposition acceptée'); }}><${Icon} n="check" />Accepter</button><button class="btn" onClick=${() => tradeSetStatus(t, 'refused')}>Refuser</button>` : null}
        ${t.status === 'open' && mine ? html`<button class="btn" onClick=${() => tradeSetStatus(t, 'cancelled')}>Annuler ma proposition</button>` : null}
        ${t.status === 'accepted' ? html`<input id="trade-price" type="text" inputmode="decimal" placeholder=${t.kind === 'buy' ? 'Prix final (€)' : 'Soulte éventuelle (€)'} value=${price} onInput=${e => setPrice(e.target.value)} style="width:150px" /><button class="btn primary" onClick=${conclude}><${Icon} n="check" />Marquer comme conclu</button>` : null}
        <span class="grow"></span>
        <button class="btn ghost sm" onClick=${() => openModal('report', { target: other, ctx: { trade: t.id } })}><${Icon} n="flag" />Signaler</button>
        <button class="btn ghost sm" onClick=${() => { toggleBlock(other); toast(blocked()[other] ? 'Membre bloqué' : 'Membre débloqué'); if (blocked()[other]) go('market', { tab: 'trades' }); }}><${Icon} n="ban" />${blocked()[other] ? 'Débloquer' : 'Bloquer'}</button>
      </div>
      <p class="tiny muted">${events.map(e => `${fmtDT(e.at)} · ${(TRADE_STATUS[e.s] || [e.s])[0]} par ${e.by === S.me.id ? 'vous' : displayName(e.by)}`).join('  ·  ')}</p>
    </div>
    <div class="panel stack">
      <h3>Messages</h3>
      <div class="stack s" ref=${endRef} style="max-height:380px;overflow:auto">${msgs.length ? msgs.map(m => html`<div class=${'thread-msg' + (m.by === S.me.id ? ' mine' : '')}><div>${m.t}</div><div class="tiny muted" style="margin-top:2px">${fmtDT(m.at)}</div></div>`) : html`<p class="small muted">Aucun message.</p>`}</div>
      ${t.status !== 'cancelled' && t.status !== 'refused' ? html`<form class="row tight" style="flex-wrap:nowrap" onSubmit=${e => { e.preventDefault(); send(); }}><input id="trade-say" type="text" class="grow" maxlength="1000" placeholder="Votre message…" value=${text} onInput=${e => setText(e.target.value)} /><button class="btn primary" type="submit" disabled=${!text.trim()}><${Icon} n="send" />Envoyer</button></form>` : null}
      <p class="tiny muted">Ne partagez ni adresse complète ni coordonnées bancaires. Préférez la remise en main propre ou un envoi suivi.</p>
    </div>
  </div>`;
}

// ---------- public profile ----------
function UserPage({ uid }) {
  const p = pubOf(uid);
  const [tab, setTab] = useState('trade');
  useEffect(() => { resolveNames([uid]); }, [uid]);
  if (S.mode !== 'cloud') return html`<${CloudOnly} what="Ce profil" />`;
  if (uid === S.me.id) { return html`<${ProfilePage} />`; }
  if (!p) return html`<div><${Back} /><${Empty} title="Profil introuvable">Ce membre n'a pas de profil public.<//></div>`;
  const st = p.stats || {};
  const ids = tab === 'trade' ? Object.keys(p.trade || {}) : tab === 'sell' ? Object.keys(p.sell || {}) : tab === 'want' ? (p.wantIds || []) : tab === 'have' ? (p.have || []) : [];
  const cards = ids.map(id => CAT.byId.get(id)).filter(Boolean).sort((a, b) => b.p - a.p);
  const tabs = [['trade', `À l'échange (${st.trade || 0})`], ['sell', `En vente (${st.sell || 0})`], ['want', `Recherche (${(p.wantIds || []).length})`], ...(p.colPublic ? [['have', `Collection (${fmtInt(st.unique || (p.have || []).length)})`]] : []), ...((p.binders || []).length ? [['binders', `Classeurs (${p.binders.length})`]] : [])];
  const myWant = wishItems();
  const forMe = Object.keys(p.trade || {}).concat(Object.keys(p.sell || {})).filter(id => myWant[id]);
  return html`<div class="stack l">
    <div><${Back} />
      <div class="spread"><div class="row"><${Avatar} uid=${uid} size="lg" /><div class="stack s"><h1>${displayName(uid, p)}</h1><span class="muted small">${p.region || 'Région non précisée'} · Réputation : à venir avec la marketplace</span>${p.bio ? html`<p class="small" style="max-width:60ch">${p.bio}</p>` : null}</div></div>
        <div class="row"><button class="btn primary" onClick=${() => openModal('trade', { to: uid, wantIds: forMe })}><${Icon} n="swap" />Proposer un échange</button><button class="btn ghost sm" onClick=${() => openModal('report', { target: uid, ctx: { profile: uid } })}><${Icon} n="flag" />Signaler</button><button class="btn ghost sm" onClick=${() => { toggleBlock(uid); toast(blocked()[uid] ? 'Membre bloqué' : 'Membre débloqué'); }}><${Icon} n="ban" />${blocked()[uid] ? 'Débloquer' : 'Bloquer'}</button></div>
      </div>
    </div>
    <div class="statline panel" style="grid-template-columns:repeat(auto-fit,minmax(110px,1fr))">
      <div class="stat"><span class="eyebrow">Collection</span><span class="v">${p.colPublic ? fmtInt(st.cards) + ' cartes' : 'Privée'}</span></div>
      <div class="stat"><span class="eyebrow">Recherche</span><span class="v">${fmtInt((p.wantIds || []).length)}</span></div>
      <div class="stat"><span class="eyebrow">Échange</span><span class="v">${fmtInt(st.trade)}</span></div>
      <div class="stat"><span class="eyebrow">Vente</span><span class="v">${fmtInt(st.sell)}</span></div>
    </div>
    ${forMe.length ? html`<p class="notice"><b>${plural(forMe.length, 'carte')}</b> de votre wishlist ${forMe.length > 1 ? 'sont proposées' : 'est proposée'} par ce membre.</p>` : null}
    <div class="tabs" role="tablist">${tabs.map(([k, l]) => html`<button role="tab" aria-selected=${String(tab === k)} onClick=${() => setTab(k)}>${l}</button>`)}</div>
    ${tab === 'binders' ? html`<div class="grid-cards" style="grid-template-columns:repeat(auto-fill,minmax(170px,1fr))">${p.binders.map(b => html`<button class="binder-cover" style="background:#1f2a44" onClick=${() => go('binder', { id: b.id, uid })}><h3>${b.n}</h3><span class="num">${b.kind === 'set' ? (CAT.setById.get(b.set) || {}).n || '' : (b.slots || []).length + ' cartes'}</span></button>`)}</div>`
      : cards.length ? html`<div class="grid-cards">${cards.slice(0, 200).map(c => html`<${CardCell} key=${c.id} c=${c} price=${tab === 'sell' ? p.sell[c.id][3] : c.p} sub=${tab === 'trade' ? `${p.trade[c.id][1]} · ${langS(p.trade[c.id][2])}` : tab === 'sell' ? `${p.sell[c.id][1]} · ${langS(p.sell[c.id][2])}` : tab === 'want' && myWant[c.id] ? 'Vous la recherchez aussi' : tab === 'want' && owned().has(c.id) ? 'Vous la possédez' : c.set.n} />`)}</div>`
      : html`<p class="muted small">Rien à afficher.</p>`}
  </div>`;
}

// ---------- my profile ----------
function ProfilePage() {
  const p = profile();
  const [pseudo, setPseudo] = useState(p.pseudo);
  const [bio, setBio] = useState(p.bio);
  const st = colStats();
  const dirty = pseudo !== p.pseudo || bio !== p.bio;
  const exportJSON = () => offerDownload(`mes-donnees-cartotheque-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ exportedAt: new Date().toISOString(), profile: p, collection: S.col, wishlist: S.docs.wish, binders: S.docs.binders, sealed: S.docs.sealed, settings: { scans: S.docs.settings.scans || {}, blocked: S.docs.settings.blocked || {} } }, null, 2));
  return html`<div class="stack l">
    <div class="spread"><div class="row"><${Avatar} uid=${S.me.id} size="lg" /><div class="stack s"><h1>${p.pseudo || S.me.name || 'Mon profil'}</h1><span class="small muted">${S.mode === 'cloud' ? PF.text.account : 'Mode invité · données sur cet appareil'}</span></div></div>
      <div class="row">${S.mode === 'cloud' ? html`<button class="btn" onClick=${() => go('user', { uid: S.me.id })} disabled=${!pubOf(S.me.id)}>Voir mon profil public</button>` : null}<button class="btn ghost" onClick=${() => go('about')}><${Icon} n="info" />À propos</button>${isAdmin() ? html`<button class="btn dark" onClick=${() => go('admin')}><${Icon} n="shield" />Administration</button>` : null}</div>
    </div>
    ${PF.AccountPanel ? html`<${PF.AccountPanel} />` : null}
    <div class="grid-2">
      <div class="panel stack">
        <h2>Profil public</h2>
        <label class="field">Pseudo<input id="pf-pseudo" type="text" maxlength="30" placeholder=${S.me.name || 'ex. Rudy'} value=${pseudo} onInput=${e => setPseudo(e.target.value)} /></label>
        <label class="field">Région (approximative)<select id="pf-region" value=${p.region} onChange=${e => saveProfile({ region: e.target.value })}><option value="">Ne pas indiquer</option>${REGIONS.map(r => html`<option>${r}</option>`)}</select></label>
        <span class="tiny muted">Seule une région est demandée : votre localisation précise n'est jamais collectée ni affichée.</span>
        <label class="field">Présentation<textarea id="pf-bio" rows="3" maxlength="300" placeholder="Ce que vous collectionnez, vos conditions d'échange…" value=${bio} onInput=${e => setBio(e.target.value)}></textarea></label>
        <div class="row" style="justify-content:flex-end"><button class="btn primary" disabled=${!dirty} onClick=${() => { saveProfile({ pseudo: pseudo.trim().slice(0, 30), bio: bio.trim().slice(0, 300) }); toast('Profil enregistré'); }}>Enregistrer</button></div>
      </div>
      <div class="panel stack">
        <h2>Confidentialité</h2>
        <label class="switch"><input id="pf-colpub" type="checkbox" checked=${p.colPublic} onChange=${e => saveProfile({ colPublic: e.target.checked })} />Collection visible par les membres</label>
        <label class="switch"><input id="pf-wishpub" type="checkbox" checked=${p.wishPublic} onChange=${e => saveProfile({ wishPublic: e.target.checked })} />Wishlist visible (nécessaire aux correspondances)</label>
        <label class="switch"><input id="pf-trade" type="checkbox" checked=${p.tradeOn} onChange=${e => saveProfile({ tradeOn: e.target.checked })} />Échanges activés</label>
        <label class="switch"><input id="pf-sell" type="checkbox" checked=${p.sellOn} onChange=${e => saveProfile({ sellOn: e.target.checked })} />Ventes activées</label>
        <p class="tiny muted">Les classeurs se rendent publics un par un, dans leurs réglages. Votre collection complète, vos prix d'achat et vos produits scellés restent toujours privés.</p>
        <div class="stat"><span class="eyebrow">Membres bloqués</span><span class="small">${Object.keys(blocked()).length ? Object.keys(blocked()).map(uid => html`<button class="chip" onClick=${() => toggleBlock(uid)} title="Débloquer">${displayName(uid)} ✕</button>`) : 'Aucun'}</span></div>
      </div>
    </div>
    <div class="panel stack">
      <h2>Mes données</h2>
      <p class="small muted">${fmtInt(st.cards)} cartes, ${fmtInt(st.wanted)} recherches, ${Object.keys(binderList()).length} classeurs, ${Object.keys(sealedItems()).length} produits scellés · ${scansThisMonth()} scans ce mois-ci.</p>
      <div class="row">
        <button class="btn" disabled=${!st.cards} onClick=${() => offerDownload(`collection-cartotheque-${new Date().toISOString().slice(0, 10)}.csv`, collectionCSV())}><${Icon} n="download" />Collection (CSV / Excel)</button>
        <button class="btn" onClick=${exportJSON}><${Icon} n="download" />Toutes mes données (JSON)</button>
        <button class="btn danger" onClick=${() => openModal('confirm', { title: PF.text.deleteTitle, text: PF.text.deleteText, confirm: 'Tout supprimer', danger: true, onConfirm: async () => { await deleteMyData(); toast('Vos données ont été supprimées'); go('home'); } })}><${Icon} n="trash" />Supprimer mes données</button>
      </div>
    </div>
  </div>`;
}

// ---------- admin ----------
function AdminCardEditor({ c }) {
  const o = S.overrides[c.id] || {};
  const [n, setN] = useState(o.n || '');
  const [r, setR] = useState(o.r || '');
  const [note, setNote] = useState('');
  const save = async () => {
    const after = { n: n.trim() || undefined, r: r.trim() || undefined };
    const entry = { card: c.id, before: { n: o.n || c.n, r: o.r || CAT.meta.rarities[c.r] }, after: { n: after.n || c.n, r: after.r || CAT.meta.rarities[c.r] }, note: note.trim(), by: S.me.id, at: Date.now() };
    try {
      await PF.saveOverride(c.id, (after.n || after.r) ? JSON.parse(JSON.stringify({ ...after, at: Date.now() })) : null, entry);
      toast('Fiche corrigée · modification journalisée');
    } catch (e) { toast("La correction n'a pas pu être enregistrée."); }
  };
  return html`<div class="panel stack s" style="border-style:dashed">
    <div class="spread"><h3>Corriger la fiche (admin)</h3><span class="tiny muted">${o.at ? 'Corrigée le ' + fmtDate(o.at) : 'Valeurs TCGdex'}</span></div>
    <div class="row tight"><input id="adm-n" type="text" placeholder=${c.n} value=${n} onInput=${e => setN(e.target.value)} /><input id="adm-r" type="text" placeholder=${CAT.meta.rarities[c.r]} value=${r} onInput=${e => setR(e.target.value)} /><input id="adm-note" type="text" placeholder="Motif de la correction" value=${note} onInput=${e => setNote(e.target.value)} style="flex:1;min-width:150px" /><button class="btn sm dark" onClick=${save}>Enregistrer</button></div>
  </div>`;
}

function AdminPage() {
  const [tab, setTab] = useState('dash');
  if (!isAdmin()) return html`<${Empty} title="Accès réservé">Cette section est réservée aux administrateurs de la page.<//>`;
  const tabs = [['dash', 'Tableau de bord'], ['prices', 'Prix & anomalies'], ['catalog', 'Catalogue'], ['moderation', `Modération${S.reports.filter(r => !r.handled).length ? ` (${S.reports.filter(r => !r.handled).length})` : ''}`], ['settings', 'Réglages']];
  return html`<div class="stack l">
    <div class="spread"><h1>Administration</h1><span class="small muted">visible uniquement par les éditeurs de la page</span></div>
    <div class="tabs" role="tablist">${tabs.map(([k, l]) => html`<button role="tab" aria-selected=${String(tab === k)} onClick=${() => setTab(k)}>${l}</button>`)}</div>
    ${tab === 'dash' ? html`<${AdminDash} />` : tab === 'prices' ? html`<${AdminPrices} />` : tab === 'catalog' ? html`<${AdminCatalog} />` : tab === 'moderation' ? html`<${AdminModeration} />` : html`<${AdminSettings} />`}
  </div>`;
}

function AdminDash() {
  const ps = [...S.pubs.entries()].map(([uid, p]) => ({ uid, ...p }));
  const sum = k => ps.reduce((a, p) => a + ((p.stats || {})[k] || 0), 0);
  const count = key => { const m = new Map(); for (const p of ps) for (const id of (p[key] || [])) m.set(id, (m.get(id) || 0) + 1); return [...m].sort((a, b) => b[1] - a[1]).slice(0, 8); };
  const [allTrades, setAllTrades] = useState(null);
  useEffect(() => { PF.listAllTrades().then(setAllTrades).catch(() => setAllTrades([])); }, []);
  const priced = CAT.cards.filter(c => c.p > 0).length;
  const Top = ({ list, title }) => html`<div class="panel stack s"><h3>${title}</h3>${list.length ? list.map(([id, n]) => { const c = CAT.byId.get(id); return c ? html`<button class="mover" onClick=${() => go('card', { id })}><${MiniTile} c=${c} w=${30} /><span class="nm">${cardName(c)}</span><span class="num small">${n}</span></button>` : null; }) : html`<p class="small muted">Pas encore de données.</p>`}</div>`;
  return html`<div class="stack l">
    <div class="statline panel" style="grid-template-columns:repeat(auto-fit,minmax(130px,1fr))">
      <div class="stat"><span class="eyebrow">Profils publics</span><span class="v">${fmtInt(ps.length)}</span></div>
      <div class="stat"><span class="eyebrow">Cartes déclarées</span><span class="v">${fmtInt(sum('cards'))}</span></div>
      <div class="stat"><span class="eyebrow">Valeur suivie</span><span class="v">${fmtEUR(sum('value'))}</span></div>
      <div class="stat"><span class="eyebrow">Annonces</span><span class="v">${fmtInt(sum('sell'))}</span></div>
      <div class="stat"><span class="eyebrow">À l'échange</span><span class="v">${fmtInt(sum('trade'))}</span></div>
      <div class="stat"><span class="eyebrow">Échanges</span><span class="v">${allTrades ? fmtInt(allTrades.length) : '…'}</span></div>
      <div class="stat"><span class="eyebrow">Conclus</span><span class="v">${allTrades ? fmtInt(allTrades.filter(t => t.status === 'done').length) : '…'}</span></div>
      <div class="stat"><span class="eyebrow">Signalements</span><span class="v">${fmtInt(S.reports.length)}</span></div>
    </div>
    <div class="grid-3"><${Top} title="Les plus recherchées" list=${count('wantIds')} /><${Top} title="Les plus proposées" list=${count('tradeIds')} /><${Top} title="Les plus mises en vente" list=${count('sellIds')} /></div>
    <div class="panel stack s">
      <h3>Catalogue et données de marché</h3>
      <dl class="kv"><dt>Cartes</dt><dd>${fmtInt(CAT.meta.cards)} (${fmtInt(priced)} avec une cote, ${Math.round(100 * priced / CAT.meta.cards)} %)</dd><dt>Extensions</dt><dd>${CAT.meta.sets}</dd><dt>Instantané des prix</dt><dd>${fmtDT(CAT.meta.snapshot)}</dd><dt>Source</dt><dd>${CAT.meta.source}</dd><dt>Normalisation US → EU</dt><dd>× ${String(CAT.meta.tpFactor).replace('.', ',')} (médiane de ${fmtInt(CAT.meta.tpPairs)} paires de prix)</dd><dt>Corrections manuelles</dt><dd>${Object.keys(S.overrides).length}</dd></dl>
      <p class="tiny muted">Les statistiques d'usage détaillées (scans, rétention J7/J30, conversion) seront branchées avec l'outil d'analytics de la V1 ; les collections privées ne sont jamais lisibles ici.</p>
    </div>
  </div>`;
}

function AdminPrices() {
  const rows = useMemo(() => {
    const out = [];
    for (const c of CAT.cards) c.v.forEach((v, vi) => { const e = estimate(v); if (!e || !e.value) return; for (const p of e.pts) if (p.anomaly) out.push({ c, vi, v, e, p, ratio: p.v / e.med }); });
    return out.sort((a, b) => Math.abs(Math.log(b.ratio)) * Math.sqrt(b.e.value) - Math.abs(Math.log(a.ratio)) * Math.sqrt(a.e.value)).slice(0, 80);
  }, []);
  return html`<div class="stack">
    <p class="small muted" style="max-width:75ch">Chaque source est comparée à la médiane des autres. Une valeur plus de 2,2 fois au-dessus (ou 0,45 fois en dessous) est automatiquement écartée du calcul et listée ici pour vérification : par exemple un marché à 40 € qui reçoit une donnée à 400 €.</p>
    <div class="table-wrap panel" style="padding:0"><table class="data"><thead><tr><th>Carte</th><th>Source écartée</th><th class="r">Valeur reçue</th><th class="r">Médiane</th><th class="r">Écart</th><th class="r">Prix calculé</th><th class="r">Conf.</th></tr></thead><tbody>
      ${rows.map(r => html`<tr style="cursor:pointer" onClick=${() => go('card', { id: r.c.id })}><td><b>${cardName(r.c)}</b><div class="tiny muted">${r.c.set.n} · ${numLabel(r.c)} · ${r.v.l}</div></td><td class="small">${r.p.l}</td><td class="r num">${fmtEUR(r.p.v, false)}</td><td class="r num">${fmtEUR(r.e.med, false)}</td><td class="r num" style="color:var(--warn)">×${r.ratio.toFixed(2).replace('.', ',')}</td><td class="r num">${fmtEUR(r.e.value, false)}</td><td class="r num">${r.e.conf}</td></tr>`)}
    </tbody></table></div>
  </div>`;
}

function AdminCatalog() {
  const [q, setQ] = useState('');
  const res = useMemo(() => q.trim().length >= 2 ? searchCards(q).slice(0, 12) : [], [q]);
  const log = Object.values(S.catalogLog).sort((a, b) => b.at - a.at);
  return html`<div class="stack l">
    <div class="panel stack s"><h3>Corriger une fiche</h3><input id="adm-q" type="search" placeholder="Rechercher la carte à corriger" value=${q} onInput=${e => setQ(e.target.value)} />${res.map(c => html`<div class="stack s" key=${c.id}><span class="small"><b>${cardName(c)}</b> · ${c.set.n} · ${numLabel(c)}</span><${AdminCardEditor} c=${c} /></div>`)}</div>
    <div class="panel stack s"><h3>Historique des modifications</h3>${log.length ? html`<div class="table-wrap"><table class="data"><thead><tr><th>Date</th><th>Carte</th><th>Avant</th><th>Après</th><th>Motif</th></tr></thead><tbody>${log.map(e => html`<tr><td class="num small">${fmtDT(e.at)}</td><td class="small">${e.card}</td><td class="small">${e.before.n} · ${e.before.r}</td><td class="small">${e.after.n} · ${e.after.r}</td><td class="small">${e.note || '—'}</td></tr>`)}</tbody></table></div>` : html`<p class="small muted">Aucune modification. Chaque correction est journalisée ici.</p>`}</div>
    <p class="tiny muted">Ajout d'extensions et de cartes : le catalogue est régénéré depuis TCGdex à chaque mise à jour des données ; les corrections manuelles s'appliquent par-dessus.</p>
  </div>`;
}

function AdminModeration() {
  useEffect(() => { resolveNames([...new Set(S.reports.flatMap(r => [r.from, r.target]))]); }, [S.reports.length]);
  const banned = S.config.banned || {};
  const toggleBan = uid => PF.toggleBan(uid, !banned[uid]).then(() => toast(banned[uid] ? 'Ban levé' : 'Membre banni')).catch(() => toast('Action impossible'));
  const handle = r => PF.handleReport(r).catch(() => toast('Action impossible'));
  const hideListings = uid => PF.hideListings(uid).then(() => toast('Annonces masquées')).catch(() => toast('Action impossible'));
  return html`<div class="stack">
    ${S.reports.length ? S.reports.map(r => html`<div class="match" key=${r.rid} style=${r.handled ? 'opacity:.55' : ''}>
      <${Avatar} uid=${r.target} />
      <div class="stack s" style="min-width:0"><div class="row tight"><b>${displayName(r.target)}</b>${banned[r.target] ? html`<span class="chip" style="color:var(--down)">banni</span>` : null}${r.handled ? html`<span class="chip">traité</span>` : null}</div><span class="small">${r.reason}</span><span class="tiny muted">Signalé par ${displayName(r.from)} · ${fmtDT(r.at)}${r.ctx && r.ctx.trade ? ' · échange ' + r.ctx.trade : ''}${r.ctx && r.ctx.card ? ' · carte ' + r.ctx.card : ''}</span></div>
      <div class="row tight" style="justify-content:flex-end"><button class="btn sm" onClick=${() => go('user', { uid: r.target })}>Profil</button><button class="btn sm" onClick=${() => hideListings(r.target)}>Masquer ses annonces</button><button class="btn sm danger" onClick=${() => toggleBan(r.target)}>${banned[r.target] ? 'Lever le ban' : 'Bannir'}</button>${!r.handled ? html`<button class="btn sm dark" onClick=${() => handle(r)}>Marquer traité</button>` : null}</div>
    </div>`) : html`<${Empty} title="Aucun signalement">Les signalements des membres (profil, annonce, échange) arrivent ici.<//>`}
  </div>`;
}

function AdminSettings() {
  const [quota, setQuota] = useState(String(S.config.scanQuota || 20));
  const [enforce, setEnforce] = useState(!!S.config.enforceQuota);
  const [banner, setBanner] = useState(S.config.banner || '');
  const save = () => {
    PF.setConfig({ scanQuota: Math.max(1, parseInt(quota, 10) || 20), enforceQuota: enforce, banner: banner.trim().slice(0, 200) }).then(() => toast('Réglages enregistrés')).catch(() => toast("Échec de l'enregistrement"));
  };
  return html`<div class="panel stack" style="max-width:640px">
    <label class="field">Scans gratuits par mois<input id="adm-quota" type="number" min="1" value=${quota} onInput=${e => setQuota(e.target.value)} style="width:120px" /></label>
    <label class="switch"><input id="adm-enforce" type="checkbox" checked=${enforce} onChange=${e => setEnforce(e.target.checked)} />Appliquer la limite (sinon le compteur est seulement affiché, utile pendant la bêta)</label>
    <label class="field">Bandeau d'annonce (vide = aucun)<input id="adm-banner" type="text" maxlength="200" placeholder="ex. Bêta ouverte : vos retours sont les bienvenus !" value=${banner} onInput=${e => setBanner(e.target.value)} /></label>
    <div class="row" style="justify-content:flex-end"><button class="btn primary" onClick=${save}>Enregistrer</button></div>
  </div>`;
}

// ---------- about / roadmap ----------
function AboutPage() {
  const V1 = [
    ['done', 'Catalogue complet en français', `${fmtInt(CAT.meta.cards)} cartes, ${CAT.meta.sets} extensions, variantes (normale, reverse, holo, 1re édition, tampons)`],
    ['done', 'Recherche rapide', 'par nom, numéro imprimé (125/197) ou code d\'extension'],
    ['done', 'Scanner', 'photo d\'une carte ou d\'une page entière, confirmation, ajout direct, mode rafale, gestion des doutes'],
    ['done', 'Cotation expliquée', 'Cardmarket + TCGplayer, anomalies écartées, score de confiance'],
    ['done', 'Collection', 'quantité, état, langue, variante, gradation, prix d\'achat, valeur totale'],
    ['done', 'Classeurs virtuels', 'pages 2×2 à 4×4, extension complète ou sélection libre'],
    ['done', 'Wishlist et progression de set', 'budget pour compléter, cartes disponibles chez les membres'],
    ['done', 'Profils et confidentialité', 'collection publique ou privée, région approximative'],
    ['done', 'Possédé / recherché / à échanger', 'correspondances automatiques entre membres'],
    ['part', 'Échanges et messagerie simple', 'propositions, accepter/refuser, signaler, bloquer · sans paiement'],
    ['part', 'Historique des prix', 'moyennes 1/7/30 jours ; historique long à constituer'],
    ['part', 'Produits scellés', 'suivi manuel ; cote marché à brancher'],
    ['done', 'Administration', 'tableau de bord, anomalies de prix, corrections journalisées, modération, quotas'],
    ['done', 'Export et RGPD', 'CSV compatible Excel, export JSON, suppression des données'],
  ];
  const label = { done: ['Fait', 'st-done'], part: ['Partiel', 'st-part'], todo: ['Prévu', 'st-todo'] };
  return html`<div class="stack l" style="max-width:980px">
    <div><${Back} /><div class="eyebrow">À propos</div><h1>Le compte unique du collectionneur Pokémon</h1>
      <p style="margin-top:10px;max-width:68ch">Cartothèque réunit ce que les collectionneurs font aujourd'hui sur plusieurs sites : identifier une carte, connaître sa valeur, ranger sa collection, suivre ses recherches et trouver les membres avec qui échanger. Collection → cotation → recherche → échange → marketplace → professionnels.</p></div>
    <section class="stack"><h2>Ce que contient cette version</h2>
      <div class="table-wrap panel" style="padding:0"><table class="data"><tbody>${V1.map(([s, t, d]) => html`<tr><td style="width:84px"><span class=${label[s][1]}>${label[s][0]}</span></td><td><b>${t}</b><div class="small muted">${d}</div></td></tr>`)}</tbody></table></div>
    </section>
    <section class="stack"><h2>Feuille de route</h2>
      <div class="roadmap">
        <div class="panel"><div class="eyebrow">Phase 0 · 2–4 sem.</div><h3>Validation</h3><ul><li>Prototype (cette page)</li><li>Tests utilisateurs et boutiques</li><li>Étude juridique, nom et marque</li><li>Contrats fournisseurs de prix</li></ul></div>
        <div class="panel"><div class="eyebrow">Phase 1 · 3–5 mois</div><h3>MVP</h3><ul><li>Apps iOS / Android</li><li>Scanner caméra en continu</li><li>Historique long des prix</li><li>Comptes et abonnements</li></ul></div>
        <div class="panel"><div class="eyebrow">Phase 2</div><h3>Communauté</h3><ul><li>Messagerie complète</li><li>Forum et sorties</li><li>Alertes de prix</li></ul></div>
        <div class="panel"><div class="eyebrow">Phase 3</div><h3>Marketplace</h3><ul><li>Paiement sécurisé, séquestre</li><li>Commissions, livraison</li><li>Litiges, notation, vérification</li></ul></div>
        <div class="panel"><div class="eyebrow">Phase 4</div><h3>Professionnels</h3><ul><li>Stock, achats, ventes, marges</li><li>Scan de lots, emplacements</li><li>Multi-employés, import/export</li></ul></div>
        <div class="panel"><div class="eyebrow">Phase 5</div><h3>Multi-TCG</h3><ul><li>One Piece, Lorcana</li><li>Yu-Gi-Oh!, Magic</li></ul></div>
      </div>
    </section>
    <section class="grid-2">
      <div class="panel stack s"><h3>Données et sources</h3><p class="small">Catalogue : TCGdex (base ouverte, version française). Prix : indicateurs Cardmarket (EUR) et TCGplayer (USD, ramené au marché européen × ${String(CAT.meta.tpFactor).replace('.', ',')}), relayés par TCGdex. Instantané du ${fmtDate(CAT.meta.snapshot)}.</p><p class="small muted">Avant toute commercialisation : licence de données avec Cardmarket, eBay ou un agrégateur (droits de stockage, d'affichage, de recalcul et d'historique).</p></div>
      <div class="panel stack s"><h3>Confidentialité</h3><p class="small">Votre collection, vos prix d'achat et vos scellés sont privés. Seuls les éléments que vous rendez publics (wishlist, cartes à l'échange ou à vendre, classeurs choisis) sont visibles des membres. Aucune localisation précise n'est collectée. Les photos du scanner ne sont pas conservées.</p></div>
    </section>
    <p class="small muted" style="max-width:80ch">Cartothèque est un projet indépendant, non affilié à Nintendo, The Pokémon Company, Creatures ou GAME FREAK. Pokémon et les noms de cartes sont des marques de leurs détenteurs respectifs. Les visuels de cartes affichés ici sont des fiches générées ; les illustrations officielles s'ouvrent via le lien « Image officielle ».</p>
  </div>`;
}

// ---------- app ----------
const PAGES = { home: HomePage, cards: CardsPage, sets: SetsPage, set: SetPage, card: CardPage, scan: ScanPage, collection: CollectionPage, binder: BinderPage, market: MarketPage, trade: TradePage, user: UserPage, profile: ProfilePage, admin: AdminPage, about: AboutPage };
function App() {
  if (S.catError) return html`<div class="loading"><h2>Le catalogue n'a pas pu être chargé</h2><p class="small">Vérifiez votre connexion puis rechargez la page. (${S.catError})</p></div>`;
  if (!CAT.ready) return html`<div class="loading"><div class="spinner"></div><div><b>Ouverture du catalogue…</b><p class="small">plus de 20 000 cartes et leurs cotes</p></div></div>`;
  const P = PAGES[S.route.name] || HomePage;
  if (S.route.name === 'auth') return html`<div class="app"><${P} />${S.toast ? html`<div class="toast" role="status">${S.toast}</div>` : null}</div>`;
  return html`<div class="app">
    <${TopBar} />
    ${S.config.banner ? html`<div class="notice" style="border-radius:0;text-align:center">${S.config.banner}</div>` : null}
    <main id="main"><${P} key=${S.route.name + ':' + JSON.stringify(S.route.params)} ...${S.route.params} /></main>
    <footer style="max-width:1180px;margin:0 auto;padding:0 16px 120px;width:100%"><p class="tiny muted">Cartothèque · projet indépendant, non affilié à The Pokémon Company · prix au ${fmtDate(CAT.meta.snapshot)} (Cardmarket, TCGplayer via TCGdex) · <button class="btn ghost sm" style="padding:2px 6px" onClick=${() => go('about')}>À propos et feuille de route</button></p></footer>
    <${TabBar} />
    ${S.toast ? html`<div class="toast" role="status">${S.toast}</div>` : null}
    <${ModalHost} />
  </div>`;
}

(async function boot() {
  const root = document.getElementById('root');
  const draw = () => render(html`<${App} v=${S.ver} />`, root);
  listeners.add(draw);
  draw();
  try { await loadCatalogue(); } catch (e) { S.catError = String((e && e.message) || e); }
  emit();
  const hash = (location.hash || '').slice(1);
  if (['scan', 'collection', 'market', 'cards', 'sets', 'profile', 'about'].includes(hash)) { S.route = { name: hash, params: {} }; emit(); }
  if (!S.catError) initPlatform().catch(e => { console.warn('platform', e); startLocal(); });
})();
