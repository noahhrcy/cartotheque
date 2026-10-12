/* Cartothèque — © 2026 Noah Henricy, Yoni Safran et Tibo Amettler. Tous droits réservés (voir LICENSE). */
/* ============================================================
   Cartothèque — trust and fraud prevention
   reputation badges, price sanity, risky-message warnings, safety guidance, proof photos
   ============================================================ */
const PROOF_MIN_PRICE = 30;          // listings at or above this price need a real photo with a verification code

// ---------- reputation ----------
async function loadTrust(ids) {
  if (!PF.trust || S.mode !== 'cloud') return;
  const want = [...new Set(ids)].filter(Boolean);
  if (!want.length) return;
  try {
    const rows = await PF.trust(want);
    for (const r of rows) S.trust[r.id] = r;
    emit();
  } catch (e) { S.trustUnavailable = true; }
}
function trustOf(uid) { return S.trust[uid] || null; }
function trustLevel(uid) {
  const t = trustOf(uid);
  if (!t) return null;
  const ageDays = (Date.now() - t.since) / 864e5;
  const rated = t.pos + t.neu + t.neg;
  if (t.disputes > 0 || t.neg > t.pos) return { k: 'risk', label: t.disputes ? `${plural(t.disputes, 'litige')} en cours` : 'Avis négatifs', color: 'var(--down)' };
  if (t.done === 0 || ageDays < 14) return { k: 'new', label: ageDays < 14 ? 'Nouveau membre' : 'Aucun échange conclu', color: 'var(--warn)' };
  return { k: 'ok', label: `${plural(t.done, 'échange conclu', 'échanges conclus')}${rated ? ` · ${Math.round(100 * t.pos / rated)} % positifs` : ''}`, color: 'var(--up)' };
}
function TrustBadge({ uid, long }) {
  const lv = trustLevel(uid);
  if (!lv) return null;
  const t = trustOf(uid);
  return html`<span class="chip trust" style=${`color:${lv.color};border-color:currentColor;background:transparent`} title=${`Membre depuis le ${fmtDate(t.since)}`}>${lv.k === 'ok' ? '✓ ' : '⚠ '}${lv.label}${long ? ` · membre depuis ${fmtDate(t.since)}` : ''}</span>`;
}

// ---------- price sanity ----------
function priceRisk(price, c, vi, cond) {
  const market = variantPrice(c, vi) * condF(cond || 'NM');
  if (!(price > 0) || !(market > 0)) return null;
  const r = price / market;
  if (r < 0.5) return { level: 'danger', text: `Prix ${Math.round((1 - r) * 100)} % sous la cote (${fmtEUR(market)}). Un prix trop beau est le premier signe d'arnaque : exigez une photo réelle et un paiement protégé.` };
  if (r < 0.75) return { level: 'info', text: `Bonne affaire : ${Math.round((1 - r) * 100)} % sous la cote (${fmtEUR(market)}). Vérifiez la photo réelle et l'état annoncé.` };
  if (r > 1.6) return { level: 'warn', text: `Prix ${Math.round((r - 1) * 100)} % au-dessus de la cote (${fmtEUR(market)}).` };
  return null;
}

// ---------- risky messages ----------
const MSG_RISKS = [
  { re: /paypal\s*(?:en\s*)?(?:entre\s*)?(?:proches?|amis?|friends?|famille)|\bf\s?&\s?f\b|envoi\s+(?:à|a)\s+un\s+proche/i, text: "Paiement « entre proches » : aucun recours en cas d'arnaque. Exigez PayPal « Biens et services » ou une remise en main propre." },
  { re: /western\s*union|mandat\s*cash|transcash|\bpcs\b|neosurf|carte\s*cadeau|gift\s*card|bitcoin|\bcrypto|usdt/i, text: 'Moyen de paiement intraçable : refusez-le, il est typique des arnaques.' },
  { re: /\bvirement\b|\biban\b|\brib\b|lydia|paylib|\bwero\b/i, text: "Virement ou paiement mobile : pas de protection acheteur. Réservez-le aux membres que vous connaissez." },
  { re: /whats\s*app|telegram|\bsignal\b|snap(?:chat)?|insta(?:gram)?|discord|messenger/i, text: "Proposition de continuer ailleurs : restez sur Cartothèque, l'historique sert en cas de litige." },
  { re: /(?:\+33|\b0)\s?[1-9](?:[\s.-]?\d{2}){4}\b/, text: 'Numéro de téléphone dans le message : ne partagez vos coordonnées qu\'une fois l\'échange accepté et la réputation vérifiée.' },
  { re: /[\w.+-]+@[\w-]+\.[a-z]{2,}/i, text: 'Adresse e-mail dans le message : méfiez-vous des faux e-mails de paiement ou de livraison.' },
  { re: /https?:\/\/|www\.|\b[\w-]+\.(?:com|fr|net|io|ly|me|xyz|shop)\b/i, text: "Lien externe : n'y saisissez jamais vos identifiants ni vos coordonnées bancaires." },
  { re: /acompte|payer\s+(?:d'abord|avant)|frais\s+de\s+(?:douane|déblocage|livraison)\s+(?:d'abord|à\s+régler)/i, text: 'Paiement demandé avant tout envoi ou frais inattendus : schéma d\'arnaque fréquent.' },
];
function messageRisks(text) { return MSG_RISKS.filter(r => r.re.test(String(text || ''))).map(r => r.text); }

// ---------- safety guidance for a trade ----------
function SafetyPanel({ t }) {
  const value = Math.max(t.finalPrice || t.price || 0, [...(t.get || []), ...(t.give || [])].reduce((a, x) => a + ((CAT.byId.get(x.c) || {}).p || 0), 0));
  const tips = [];
  if (t.status === 'open') {
    tips.push('Vérifiez la réputation du membre et la date de création de son compte.');
    if (value >= PROOF_MIN_PRICE) tips.push(`Plus de ${PROOF_MIN_PRICE} € en jeu : demandez une photo de la carte à côté d'un papier portant votre pseudo et la date du jour.`);
  }
  if (t.status === 'accepted') {
    if (t.kind === 'buy') {
      tips.push('Payez uniquement avec un moyen protégé : PayPal « Biens et services » ou en main propre. Jamais « entre proches », virement, mandat ni carte cadeau.');
      tips.push('Le vendeur expédie en lettre ou colis suivi, carte en sleeve et toploader, et partage le numéro de suivi ici.');
    } else {
      tips.push('Envoyez le même jour, en suivi, et échangez vos numéros de suivi ici. Le membre qui a le moins d\'échanges conclus envoie en premier.');
    }
    if (value >= 100) tips.push('Plus de 100 € : privilégiez la remise en main propre dans un lieu public ou une boutique de cartes.');
    tips.push("Ne confirmez la réception qu'une fois la carte (ou le paiement) en main et vérifiée. En cas de problème, ouvrez un litige : la modération est prévenue.");
  }
  if (t.status === 'disputed') tips.push("Le litige est transmis à la modération. Gardez les preuves (photos du colis, suivi, captures du paiement) et répondez ici aux questions.");
  if (!tips.length) return null;
  return html`<div class="safety stack s"><div class="row tight"><${Icon} n="shield" /><b>Échanger en sécurité</b>${value ? html`<span class="tiny muted">valeur estimée ${fmtEUR(value)}</span>` : null}</div><ul>${tips.map(x => html`<li>${x}</li>`)}</ul></div>`;
}

// ---------- reviews ----------
function ReviewBox({ t }) {
  const [rating, setRating] = useState(1);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  if (t.status !== 'done' || !PF.review) return null;
  if (S.myReviews && S.myReviews.has(t.id)) return html`<p class="small muted">Merci, votre avis sur cet échange est enregistré.</p>`;
  const other = t.a === S.me.id ? t.b : t.a;
  return html`<div class="panel stack s"><h3>Votre avis sur ${displayName(other)}</h3>
    <${Seg} label="Avis" options=${[{ v: 1, l: '👍 Positif' }, { v: 0, l: 'Neutre' }, { v: -1, l: '👎 Négatif' }]} value=${rating} onChange=${setRating} />
    <input autocomplete="off" id="review-comment" type="text" maxlength="300" placeholder="Un mot sur l'échange (facultatif)" value=${comment} onInput=${e => setComment(e.target.value)} />
    <button class="btn primary sm" style="align-self:flex-start" disabled=${busy} onClick=${async () => { setBusy(true); try { await PF.review(t, rating, comment.trim()); S.myReviews.add(t.id); loadTrust([other]); toast('Avis enregistré'); } catch (e) { toast(trustError(e)); } setBusy(false); }}>Publier l'avis</button>
    <p class="tiny muted">Les avis ne sont possibles qu'après un échange conclu des deux côtés : ils ne peuvent pas être achetés ou inventés.</p>
  </div>`;
}
const trustError = e => /function|relation|does not exist|schema cache/i.test(String(e && (e.message || e.code)))
  ? "Fonction pas encore activée sur le serveur : l'administrateur doit exécuter supabase/migrations/002_confiance.sql."
  : /too many/i.test(String(e && e.message)) ? 'Limite atteinte pour aujourd\'hui : réessayez plus tard.' : "L'action n'a pas pu être enregistrée.";

// ---------- proof photo for listings ----------
const PROOF_CHARS = 'ACDEFGHJKMNPQRTUVWXY3479';
const newProofCode = () => Array.from({ length: 4 }, () => PROOF_CHARS[Math.floor(Math.random() * PROOF_CHARS.length)]).join('');
function ProofModal({ item }) {
  const c = CAT.byId.get(item.c);
  const [code] = useState(newProofCode());
  const [file, setFile] = useState(null);
  const [url, setUrl] = useState('');
  const [check, setCheck] = useState(null);       // null | 'checking' | { ok, label }
  const [busy, setBusy] = useState(false);
  const pickRef = useRef(null);
  const day = fmtShort(Date.now());
  const pick = async e => {
    const f = (e.target.files || [])[0]; e.target.value = '';
    if (!f) return;
    setFile(f); setUrl(URL.createObjectURL(f)); setCheck('checking');
    if (typeof freeScan !== 'function') { setCheck({ ok: null, label: 'Vérification automatique indisponible ici.' }); return; }
    try {
      const res = await freeScan(f, null);
      const m = res.dets[0].m;
      const ok = !!m.best && (m.best.id === c.id || cardName(m.best) === cardName(c) || m.candidates.slice(0, 2).some(x => x.id === c.id));
      setCheck(ok ? { ok: true, label: 'La photo montre bien cette carte.' } : { ok: false, label: `La photo ne semble pas montrer cette carte${m.best ? ` (reconnue : ${cardName(m.best)}, ${m.best.set.n})` : ''}. Reprenez-la, carte bien visible.` });
    } catch (err) { setCheck({ ok: null, label: "La vérification automatique n'a pas pu se faire ; la photo sera relue par les acheteurs." }); }
  };
  const save = async () => {
    setBusy(true);
    try {
      const blob = await prepareImage(file, 1400);
      const path = await PF.uploadProof(blob, `${S.me.id}/${c.id}-${code}-${Date.now().toString(36)}.jpg`);
      updateItem(item, { proof: { p: path, code, at: Date.now(), ok: check && check.ok === true ? 1 : check && check.ok === false ? -1 : 0 } });
      closeModal(); toast('Photo réelle ajoutée à votre annonce');
    } catch (e) { toast(trustError(e)); }
    setBusy(false);
  };
  return html`<${Modal} title="Photo réelle de la carte">
    <div class="stack">
      <p class="small">Les acheteurs voient cette photo avec l'annonce. Pour prouver que vous avez la carte en main, posez à côté un papier sur lequel vous écrivez :</p>
      <div class="proof-code"><span class="num">${code}</span><span class="small muted">et la date : ${day}</span></div>
      <p class="tiny muted">Une photo trouvée sur internet ne peut pas porter ce code : c'est ce qui protège les acheteurs.</p>
      <input ref=${pickRef} type="file" accept="image/*" capture="environment" hidden onChange=${pick} />
      ${url ? html`<img src=${url} alt="Photo de preuve" style="max-height:260px;object-fit:contain;border-radius:8px;background:var(--surface-2)" />` : null}
      ${check === 'checking' ? html`<p class="small muted">Vérification de la carte sur la photo…</p>` : check ? html`<p class=${'small notice' + (check.ok === false ? ' warn' : '')}>${check.ok ? '✓ ' : check.ok === false ? '⚠ ' : ''}${check.label}</p>` : null}
      <div class="row" style="justify-content:space-between">
        <button class="btn" onClick=${() => pickRef.current && pickRef.current.click()}><${Icon} n="camera" />${file ? 'Reprendre la photo' : 'Prendre la photo'}</button>
        <button class="btn primary" disabled=${!file || busy || check === 'checking'} onClick=${save}>${busy ? 'Envoi…' : 'Publier la photo'}</button>
      </div>
    </div>
  <//>`;
}
function ProofView({ proof, compact }) {
  if (!proof || !proof.p || !PF.proofUrl) return null;
  const badge = proof.ok === 1 ? html`<span class="chip pill-own">✓ carte vérifiée par le scanner</span>` : proof.ok === -1 ? html`<span class="chip" style="color:var(--down);border-color:currentColor;background:transparent">⚠ carte non reconnue sur la photo</span>` : null;
  return html`<div class="stack s">
    ${compact ? null : html`<a href=${PF.proofUrl(proof.p)} target="_blank" rel="noopener"><img src=${PF.proofUrl(proof.p)} alt="Photo réelle fournie par le vendeur" loading="lazy" style="width:100%;max-height:300px;object-fit:contain;border-radius:8px;background:var(--surface-2)" /></a>`}
    <div class="row tight"><span class="chip">📷 Photo réelle · code ${proof.code} · ${fmtShort(proof.at)}</span>${badge}</div>
  </div>`;
}
MODALS.proof = ProofModal;
