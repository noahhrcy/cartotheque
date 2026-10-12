"""Assemble the app from src/.

usage:
  python build_html.py <src_dir> <out_dir>                   # Claude artifact page (content only, no document skeleton)
  python build_html.py <src_dir> <out_dir> --target web      # standalone installable web app (PWA) for GitHub Pages / Android
"""
import sys, os, hashlib, json, datetime

SRC, OUT = sys.argv[1], sys.argv[2]
TARGET = sys.argv[sys.argv.index("--target") + 1] if "--target" in sys.argv else "artifact"
PREACT = "https://cdn.jsdelivr.net/npm/htm@3.1.1/preact/standalone.umd.js"
SUPABASE = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js"
FONTS = "https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..900&family=Instrument+Sans:wght@400..700&family=Martian+Mono:wdth,wght@75..112.5,400..700&display=swap"

def read(name):
    with open(os.path.join(SRC, name), encoding="utf-8") as f:
        return f.read()

platform = "platform-claude.js" if TARGET == "artifact" else "platform-supabase.js"
modules = ["core.js", "store.js", platform] + (["visual.js"] if TARGET == "web" else []) + ["components.js", "trust.js", "pages1.js", "pages2.js", "pages3.js"]
js = "\n".join(read(f) for f in modules)
css = read("style.css")

if TARGET == "artifact":
    page = f"""<title>Cartothèque</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="{FONTS}">
<style>
{css}
</style>
<div id="root"></div>
<script src="{PREACT}"></script>
<script>
{js}
</script>
"""
    open(os.path.join(OUT, "index.html"), "w", encoding="utf-8").write(page)
    print("artifact index.html", len(page.encode("utf-8")))
    sys.exit(0)

# ---------- web / PWA ----------
cfg_path = os.path.join(OUT, "config.js")
if not os.path.exists(cfg_path):
    open(cfg_path, "w", encoding="utf-8").write("window.CARTO_CONFIG = { supabaseUrl: '', supabaseKey: '' };\n")
cfg_version = hashlib.sha1(open(cfg_path, "rb").read()).hexdigest()[:8]
base_css = """html{-webkit-text-size-adjust:100%}
:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}
body{margin:0}
img{max-width:100%}
[hidden]{display:none!important}
"""
page = f"""<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Cartothèque</title>
<meta name="description" content="Collection, cote et échanges de cartes Pokémon : catalogue français complet, scanner, classeurs virtuels.">
<meta name="theme-color" content="#12151b">
<meta name="color-scheme" content="light dark">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icons/icon-192.png" type="image/png">
<link rel="apple-touch-icon" href="icons/icon-180.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="{FONTS}">
<style>
{base_css}
{css}
</style>
</head>
<body>
<div id="root"></div>
<script src="{PREACT}"></script>
<script src="{SUPABASE}"></script>
<script src="config.js?v={cfg_version}"></script>
<script>
{js}
</script>
<script>
if ('serviceWorker' in navigator && location.protocol === 'https:') {{
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {{}}));
}}
</script>
</body>
</html>
"""
open(os.path.join(OUT, "index.html"), "w", encoding="utf-8").write(page)

version = hashlib.sha1((page + datetime.date.today().isoformat()).encode("utf-8")).hexdigest()[:10]
manifest = {
    "name": "Cartothèque",
    "short_name": "Cartothèque",
    "description": "Collection, cote et échanges de cartes Pokémon",
    "lang": "fr",
    "start_url": "./",
    "scope": "./",
    "display": "standalone",
    "orientation": "portrait",
    "background_color": "#0d1015",
    "theme_color": "#12151b",
    "icons": [
        {"src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png"},
        {"src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png"},
        {"src": "icons/maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"},
    ],
}
open(os.path.join(OUT, "manifest.webmanifest"), "w", encoding="utf-8").write(json.dumps(manifest, ensure_ascii=False, indent=2))

sw = """// Cartothèque service worker — app shell cached, data refreshed in the background, API calls never cached.
const VERSION = '__VERSION__';
const SHELL = 'shell-' + VERSION;
const DATA = 'data-v1';
const IMAGES = 'images-v1';
const SHELL_FILES = ['./', 'index.html', 'config.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(SHELL).then(c => c.addAll(SHELL_FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('shell-') && k !== SHELL).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
async function staleWhileRevalidate(cacheName, req) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  const fresh = fetch(req, { cache: 'no-cache' }).then(res => { if (res && res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
  return hit || (await fresh) || new Response('', { status: 504 });
}
async function cacheFirst(cacheName, req) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
  return res;
}
async function networkFirst(req) {
  const cache = await caches.open(SHELL);
  try { const res = await fetch(req, { cache: 'no-cache' }); if (res && res.ok) cache.put(req, res.clone()); return res; }
  catch (e) { return (await cache.match(req)) || (await cache.match('index.html')); }
}
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname.endsWith('supabase.co') || url.hostname.endsWith('supabase.in')) return;
  if (url.origin === location.origin) {
    if (url.pathname.includes('/data/')) { e.respondWith(staleWhileRevalidate(DATA, req)); return; }
    if (req.mode === 'navigate' || url.pathname.endsWith('/index.html') || url.pathname.endsWith('/config.js')) { e.respondWith(networkFirst(req)); return; }
    e.respondWith(cacheFirst(SHELL, req));
    return;
  }
  if (url.hostname === 'assets.tcgdex.net') { e.respondWith(cacheFirst(IMAGES, req)); return; }
  if (url.hostname === 'cdn.jsdelivr.net' || url.hostname.endsWith('gstatic.com') || url.hostname.endsWith('googleapis.com')) { e.respondWith(cacheFirst('cdn-v1', req)); }
});
""".replace("__VERSION__", version)
open(os.path.join(OUT, "sw.js"), "w", encoding="utf-8").write(sw)
print("web index.html", len(page.encode("utf-8")), "sw", version)
