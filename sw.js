/* Softever Around The World — offline support.
   Page: network first (always fresh when online, cached copy when offline).
   Images, fonts, scripts: cache first. Map tiles: cached as you view them, capped. */
const V = "atw-v1";
const CORE = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./img/logo/secondary.svg",
  "./img/logo/SECONDARY-LOGO-LIGHT.svg",
  "./img/icon-192.png",
  "./img/icon-512.png"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => !k.startsWith(V)).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function trim(name, max) {
  const c = await caches.open(name);
  const keys = await c.keys();
  for (let i = 0; i < keys.length - max; i++) await c.delete(keys[i]);
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // the page itself: network first
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then(r => { const copy = r.clone(); caches.open(V).then(c => c.put("./index.html", copy)); return r; })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  // map tiles (OpenStreetMap): cache as viewed, keep the newest 400
  if (url.hostname === "tile.openstreetmap.org") {
    e.respondWith(
      caches.open(V + "-tiles").then(async c => {
        const hit = await c.match(req);
        if (hit) return hit;
        try {
          const r = await fetch(req);
          if (r.ok || r.type === "opaque") { c.put(req, r.clone()); trim(V + "-tiles", 400); }
          return r;
        } catch (err) { return hit || Response.error(); }
      })
    );
    return;
  }

  // same-origin assets, Google Fonts, cdnjs: cache first
  if (url.origin === location.origin || /fonts\.(googleapis|gstatic)\.com$|cdnjs\.cloudflare\.com$/.test(url.hostname)) {
    e.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(r => {
        if (r.ok || r.type === "opaque") { const copy = r.clone(); caches.open(V).then(c => c.put(req, copy)); }
        return r;
      }))
    );
  }
});
