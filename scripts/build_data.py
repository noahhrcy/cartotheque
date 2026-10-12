"""Turn the raw TCGdex dump into the compact data files the app loads.

usage: python -I build_data.py <raw_dir> <site_dir>
"""
import json, sys, os, statistics, re
from collections import Counter

RAW, SITE = sys.argv[1], sys.argv[2]
os.makedirs(os.path.join(SITE, "data", "sets"), exist_ok=True)

EXCLUDED_SERIES = {"tcgp"}  # Pokémon TCG Pocket: digital-only cards

def jl(name):
    with open(os.path.join(RAW, name), encoding="utf-8") as f:
        return [json.loads(l) for l in f if l.strip()]

series = {s["id"]: s for s in jl("series.jsonl")}
sets_raw = {s["id"]: s for s in jl("sets.jsonl")}
cards_raw = jl("cards.jsonl")

def r2(x):
    if x is None:
        return 0
    try:
        x = float(x)
    except Exception:
        return 0
    if x <= 0:
        return 0
    return round(x, 2)

TYPE_FR = {"normal": "Normale", "reverse": "Reverse", "holo": "Holo"}

def pretty(s):
    s = str(s)
    if re.match(r"^[a-z0-9]+(-[a-z0-9]+)+$", s):
        s = s.replace("-", " ")
        s = s[:1].upper() + s[1:]
    return s

def variant_label(v):
    parts = [TYPE_FR.get(str(v.get("type", "")).lower(), v.get("type") or "Normale")]
    if v.get("foil"):
        parts.append(pretty(v["foil"]))
    for st in v.get("stamp") or []:
        parts.append(pretty(st))
    if v.get("subtype"):
        parts.append(v["subtype"])
    if v.get("size") and v["size"] != "Standard":
        parts.append(v["size"])
    return " · ".join(parts)

def tp_pick(tp, vtype, first_ed):
    if not tp:
        return None
    t = vtype.lower()
    if t == "reverse":
        order = ["reverse-holofoil"]
    elif t == "holo":
        order = (["1st-edition-holofoil"] if first_ed else []) + ["holofoil", "unlimited-holofoil"]
    else:
        order = (["1st-edition"] if first_ed else []) + ["normal", "unlimited"]
    for k in order:
        if tp.get(k):
            return tp[k]
    return None

def cm_pick(cm, vtype):
    """Cardmarket fields for one variant. Reverse holos share the base product and use the -holo fields."""
    if not cm:
        return None
    keys = ["trend", "avg7", "avg30", "avg1", "low", "avg"]
    if vtype.lower() == "reverse":
        holo = [r2(cm.get(k + "-holo")) for k in keys]
        if any(holo):
            return holo
    return [r2(cm.get(k)) for k in keys]

labels, label_ix = [], {}
def lab(s):
    if s not in label_ix:
        label_ix[s] = len(labels)
        labels.append(s)
    return label_ix[s]

rarities, rar_ix = [], {}
def rar(s):
    s = s or "Sans Rareté"
    if s not in rar_ix:
        rar_ix[s] = len(rarities)
        rarities.append(s)
    return rar_ix[s]

TYPES = ["Incolore", "Feu", "Eau", "Plante", "Électrique", "Psy", "Combat", "Obscurité", "Métal", "Dragon", "Fée"]
CATS = ["Pokémon", "Dresseur", "Énergie"]

# keep sets in release order
set_list = [s for s in sets_raw.values() if s.get("serie", {}).get("id") not in EXCLUDED_SERIES]
set_list.sort(key=lambda s: (s.get("releaseDate") or "9999", s["id"]))
set_ix = {s["id"]: i for i, s in enumerate(set_list)}

ratios = []
index = []
details = {}
snapshot = ""
missing_price = 0
for c in cards_raw:
    sid = c.get("set", {}).get("id")
    if sid not in set_ix:
        continue
    variants = []
    vd = c.get("variants_detailed") or []
    seen_labels = {}
    for v in vd:
        p = v.get("pricing") or {}
        cmd = p.get("cardmarket") or {}
        if cmd.get("updated", "") > snapshot:
            snapshot = cmd.get("updated", "")
        vtype = str(v.get("type") or "normal")
        first_ed = any("1re" in s or "1st" in s for s in (v.get("stamp") or []))
        cm = cm_pick(cmd, vtype) or [0] * 6
        tpv = tp_pick(p.get("tcgplayer"), vtype, first_ed)
        tpm = r2((tpv or {}).get("marketPrice")) or r2((tpv or {}).get("midPrice"))
        if cm[0] > 3 and tpm > 3:
            ratios.append(cm[0] / tpm)
        label = variant_label(v)
        seen_labels[label] = seen_labels.get(label, 0) + 1
        if seen_labels[label] > 1:
            label = f"{label} ({seen_labels[label]})"
        variants.append([lab(label)] + cm + [tpm])
    if not variants:
        vflags = c.get("variants") or {}
        for k, name in (("normal", "Normale"), ("reverse", "Reverse"), ("holo", "Holo"), ("firstEdition", "Holo · 1re Édition")):
            if vflags.get(k):
                variants.append([lab(name)] + [0] * 7)
        if not variants:
            variants.append([lab("Normale")] + [0] * 7)
    if not any(any(v[1:]) for v in variants):
        missing_price += 1
    types = c.get("types") or []
    t = TYPES.index(types[0]) if types and types[0] in TYPES else -1
    cat = CATS.index(c["category"]) if c.get("category") in CATS else 0
    dex = (c.get("dexId") or [0])[0]
    img = c.get("image") or ""
    std = f"https://assets.tcgdex.net/fr/{sets_raw[sid].get('serie', {}).get('id')}/{sid}/{c['localId']}"
    im = 1 if img == std else (img if img else 0)
    row = [c["id"], set_ix[sid], c["localId"], c["name"], rar(c.get("rarity")), cat, t, c.get("hp") or 0, dex, variants, im]
    index.append(row)

    d = {}
    if c.get("illustrator"): d["il"] = c["illustrator"]
    if c.get("stage"): d["st"] = c["stage"]
    if c.get("evolveFrom"): d["ev"] = c["evolveFrom"]
    if c.get("suffix"): d["sx"] = c["suffix"]
    if c.get("regulationMark"): d["rm"] = c["regulationMark"]
    if c.get("description"): d["de"] = c["description"]
    if c.get("effect"): d["ef"] = c["effect"]
    if c.get("trainerType"): d["tt"] = c["trainerType"]
    if c.get("energyType"): d["et"] = c["energyType"]
    if c.get("retreat") is not None: d["rt"] = c["retreat"]
    if c.get("image"): d["im"] = c["image"]
    if c.get("attacks"):
        d["at"] = [[a.get("name", ""), len(a.get("cost") or []), str(a.get("damage") or ""), a.get("effect") or ""] for a in c["attacks"]]
    if c.get("abilities"):
        d["ab"] = [[a.get("type", ""), a.get("name", ""), a.get("effect") or ""] for a in c["abilities"]]
    if c.get("weaknesses"):
        d["wk"] = " ".join(f"{w.get('type','')} {w.get('value','')}".strip() for w in c["weaknesses"])
    lg = c.get("legal") or {}
    d["lg"] = ("S" if lg.get("standard") else "") + ("E" if lg.get("expanded") else "")
    pr = (c.get("pricing") or {}).get("cardmarket") or {}
    if pr.get("idProduct"): d["cm"] = pr["idProduct"]
    details.setdefault(sid, {})[c["id"]] = d

def localsort(row):
    lid = row[2]
    m = re.match(r"^([A-Za-z]*)(\d+)(.*)$", lid)
    if m:
        return (row[1], 0 if not m.group(1) else 1, m.group(1), int(m.group(2)), m.group(3))
    return (row[1], 2, lid, 0, "")

index.sort(key=localsort)
tp_factor = round(statistics.median(ratios), 3) if ratios else 0.86

set_counts = Counter(r[1] for r in index)
sets_out = []
for s in set_list:
    sets_out.append({
        "id": s["id"],
        "n": re.sub(r"([a-zà-ÿ])(\d)", r"\1 \2", s["name"]),   # « Classique30ᵉ » -> « Classique 30ᵉ »
        "s": s.get("serie", {}).get("id"),
        "d": s.get("releaseDate"),
        "o": (s.get("cardCount") or {}).get("official") or 0,
        "t": (s.get("cardCount") or {}).get("total") or 0,
        "c": set_counts.get(set_ix[s["id"]], 0),
        "a": (s.get("abbreviation") or {}).get("official") or s.get("tcgOnline") or "",
        "al": (s.get("abbreviation") or {}).get("localized") or "",
        "lg": ("S" if (s.get("legal") or {}).get("standard") else "") + ("E" if (s.get("legal") or {}).get("expanded") else ""),
    })
series_out = sorted(
    [{"id": k, "n": v["name"], "d": v.get("releaseDate")} for k, v in series.items() if k not in EXCLUDED_SERIES],
    key=lambda x: x["d"] or "",
)

meta = {
    "snapshot": snapshot,
    "cards": len(index),
    "sets": len(sets_out),
    "tpFactor": tp_factor,
    "tpPairs": len(ratios),
    "missingPrice": missing_price,
    "labels": labels,
    "rarities": rarities,
    "types": TYPES,
    "cats": CATS,
    "source": "TCGdex API v2 (fr) — prix Cardmarket (EUR) et TCGplayer (USD) relayés par TCGdex",
}

def dump(obj, *path):
    with open(os.path.join(SITE, *path), "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))

dump({"meta": meta, "series": series_out, "sets": sets_out, "cards": index}, "data", "catalogue.json")
for sid, d in details.items():
    dump(d, "data", "sets", sid + ".json")

print(json.dumps({k: v for k, v in meta.items() if k not in ("labels", "rarities")}, ensure_ascii=False))
print("labels", len(labels), "rarities", len(rarities), "detail files", len(details))
print("catalogue.json", os.path.getsize(os.path.join(SITE, "data", "catalogue.json")))
