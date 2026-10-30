// Offline and installable: every file the page needs is cached on install; after that each request tries the
// network first (so a new version shows up at once) and falls back to the cache. A picture or design shared to
// the installed app arrives as a POST to ./?share and is handed to the page through a cache.
const CACHE = "needleworks-v1", SHARED = "needleworks-shared";
const FILES = [
  "./", "index.html", "manifest.webmanifest", "css/app.css",
  "assets/icon-192.png",
  "assets/icon-512.png",
  "assets/sample-flower.png",
  "fonts/AlexBrush-Regular.ttf",
  "fonts/AlfaSlabOne-Regular.ttf",
  "fonts/Allura-Regular.ttf",
  "fonts/Cookie-Regular.ttf",
  "fonts/Corinthia-Regular.ttf",
  "fonts/Ephesis-Regular.ttf",
  "fonts/Graduate-Regular.ttf",
  "fonts/GreatVibes-Regular.ttf",
  "fonts/Italianno-Regular.ttf",
  "fonts/JosefinSans-SemiBold.ttf",
  "fonts/LilitaOne-Regular.ttf",
  "fonts/MeowScript-Regular.ttf",
  "fonts/MsMadi-Regular.ttf",
  "fonts/Parisienne-Regular.ttf",
  "fonts/Quicksand-SemiBold.ttf",
  "fonts/RougeScript-Regular.ttf",
  "fonts/Sacramento-Regular.ttf",
  "fonts/Satisfy-Regular.ttf",
  "fonts/Yellowtail-Regular.ttf",
  "js/app.js",
  "js/core/bookmark.js",
  "js/core/brandcharts.js",
  "js/core/brands.js",
  "js/core/design.js",
  "js/core/digitize.js",
  "js/core/fonts.js",
  "js/core/formats.js",
  "js/core/geom.js",
  "js/core/machines.js",
  "js/core/raster.js",
  "js/core/text.js",
  "js/core/threads.js",
  "js/doctor.js",
  "js/render.js",
  "js/sheet.js",
  "js/studio/motifs.js",
  "js/studio/outline.js",
  "js/studio/pieces.js",
  "js/studio/quilt.js",
  "js/studio/ui.js",
  "js/worker.js",
  "js/zip.js",
];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE && k !== SHARED).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method === "POST" && url.searchParams.has("share") && url.origin === location.origin) {
    e.respondWith((async () => {
      const f = (await req.formData()).get("file");
      if (f) await (await caches.open(SHARED)).put("shared", new Response(f, { headers: { "x-name": encodeURIComponent(f.name || "shared"), "content-type": f.type || "application/octet-stream" } }));
      return Response.redirect("./?shared", 303);
    })());
    return;
  }
  if (req.method !== "GET") return;
  // the page's own files, and the Google fonts it uses for its text
  if (url.origin !== location.origin && !/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) return;
  e.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res.ok || res.type === "opaque") (await caches.open(CACHE)).put(req, res.clone());
      return res;
    } catch (err) {
      return (await caches.match(req, { ignoreSearch: url.origin === location.origin })) || Promise.reject(err);
    }
  })());
});
