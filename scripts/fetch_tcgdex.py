# Cartothèque — © 2026 Noah Henricy, Yoni Safran et Tibo Amettler. Tous droits réservés (voir LICENSE).
"""Download the full French TCGdex catalogue (sets + every card detail with pricing) into JSONL files."""
import json, sys, os, time, threading
import urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed

OUT = sys.argv[1]
API = "https://api.tcgdex.net/v2/fr"
os.makedirs(OUT, exist_ok=True)

def get(url, tries=4):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "collection-prototype/0.1"})
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            time.sleep(1.5 * (i + 1))
        except Exception:
            time.sleep(1.5 * (i + 1))
    return None

def fetch_all(urls, path, workers):
    done = set()
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            for line in f:
                try:
                    done.add(json.loads(line)["_key"])
                except Exception:
                    pass
    todo = [u for u in urls if u[0] not in done]
    print(f"{path}: {len(done)} cached, {len(todo)} to fetch", flush=True)
    lock = threading.Lock()
    n = 0
    with open(path, "a", encoding="utf-8") as f, ThreadPoolExecutor(workers) as ex:
        futs = {ex.submit(get, url): key for key, url in todo}
        for fut in as_completed(futs):
            key = futs[fut]
            data = fut.result()
            if data is None:
                print("FAIL", key, flush=True)
                continue
            data["_key"] = key
            with lock:
                f.write(json.dumps(data, ensure_ascii=False) + "\n")
                n += 1
                if n % 1000 == 0:
                    print(f"  {n}/{len(todo)}", flush=True)

sets = get(f"{API}/sets")
fetch_all([(s["id"], f"{API}/sets/{s['id']}") for s in sets], os.path.join(OUT, "sets.jsonl"), 8)
series = get(f"{API}/series")
fetch_all([(s["id"], f"{API}/series/{s['id']}") for s in series], os.path.join(OUT, "series.jsonl"), 8)
cards = get(f"{API}/cards")
fetch_all([(c["id"], f"{API}/cards/{c['id']}") for c in cards], os.path.join(OUT, "cards.jsonl"), 12)
print("DONE", flush=True)
