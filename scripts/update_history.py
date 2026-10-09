"""Append today's Cardmarket trend (main variant of each card) to public/data/history/<set>.json.

usage: python update_history.py <public_dir>
File format: {"d": ["2026-10-09", ...], "p": {"<card id>": [price or null, ...]}} — one column per day.
Running twice on the same day overwrites that day's column instead of adding a new one.
"""
import json, os, sys, datetime

PUB = sys.argv[1]
cat = json.load(open(os.path.join(PUB, "data", "catalogue.json"), encoding="utf-8"))
day = (cat["meta"].get("snapshot") or datetime.datetime.utcnow().isoformat())[:10]
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
    hist = {"d": [], "p": {}}
    if os.path.exists(path):
        hist = json.load(open(path, encoding="utf-8"))
    days = hist["d"]
    if days and days[-1] == day:
        col = len(days) - 1
    else:
        days.append(day)
        col = len(days) - 1
    for cid, series in hist["p"].items():
        while len(series) < len(days):
            series.append(None)
    for cid, price in prices.items():
        series = hist["p"].setdefault(cid, [None] * len(days))
        while len(series) < len(days):
            series.append(None)
        series[col] = round(price, 2) if price else None
    # drop cards that never had a price to keep files small
    hist["p"] = {k: v for k, v in hist["p"].items() if any(x is not None for x in v)}
    with open(path, "w", encoding="utf-8") as f:
        json.dump(hist, f, separators=(",", ":"))
    written += 1
print(f"history: {written} sets, day {day}")
