"""Append today's Cardmarket trend (main variant of each card) to public/data/history/<set>.json.

usage: python update_history.py <public_dir>
File format: {"d": ["2026-10-09", ...], "p": {"<card id>": [price or null, ...]}} — one column per day.
Days are kept sorted; running twice on the same day overwrites that day's column.
"""
import json, os, sys, datetime

PUB = sys.argv[1]
cat = json.load(open(os.path.join(PUB, "data", "catalogue.json"), encoding="utf-8"))
day = datetime.datetime.now(datetime.timezone.utc).date().isoformat()   # date of the observation
out_dir = os.path.join(PUB, "data", "history")
os.makedirs(out_dir, exist_ok=True)

def main_price(variants):
    for v in variants:
        trend, a7, tp = v[1], v[2], v[7]
        if trend > 0 or a7 > 0 or tp > 0:
            return trend if trend > 0 else (a7 if a7 > 0 else None)
    return None

by_set = {}
for row in cat["cards"]:
    set_id = cat["sets"][row[1]]["id"]
    by_set.setdefault(set_id, {})[row[0]] = main_price(row[9])

written = 0
for set_id, prices in by_set.items():
    path = os.path.join(out_dir, set_id + ".json")
    columns = {}                                   # day -> {card id: price}
    if os.path.exists(path):
        old = json.load(open(path, encoding="utf-8"))
        for i, d in enumerate(old.get("d", [])):
            columns[d] = {cid: series[i] for cid, series in old.get("p", {}).items() if i < len(series)}
    columns[day] = {cid: (round(p, 2) if p else None) for cid, p in prices.items()}
    days = sorted(columns)
    ids = sorted({cid for col in columns.values() for cid in col})
    series = {cid: [columns[d].get(cid) for d in days] for cid in ids}
    series = {k: v for k, v in series.items() if any(x is not None for x in v)}
    with open(path, "w", encoding="utf-8") as f:
        json.dump({"d": days, "p": series}, f, separators=(",", ":"))
    written += 1
print(f"history: {written} sets, day {day}")
