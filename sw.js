// Offline and installable: every file the page needs is cached on install; after that each request tries the
// network first (so a new version shows up at once) and falls back to the cache. A picture or design shared to
// the installed app arrives as a POST to ./?share and is handed to the page through a cache.
const CACHE = "needleworks-v2", SHARED = "needleworks-shared";
const FILES = [
  "./", "index.html", "manifest.webmanifest", "css/app.css",
  "assets/icon-192.png",
  "assets/icon-512.png",
  "assets/sample-flower.png",
  "fonts/AlexBrush-Regular.woff2",
  "fonts/AlfaSlabOne-Regular.woff2",
  "fonts/Allura-Regular.woff2",
  "fonts/Cookie-Regular.woff2",
  "fonts/Corinthia-Regular.woff2",
  "fonts/Ephesis-Regular.woff2",
  "fonts/Graduate-Regular.woff2",
  "fonts/GreatVibes-Regular.woff2",
  "fonts/Italianno-Regular.woff2",
  "fonts/JosefinSans-SemiBold.woff2",
  "fonts/LilitaOne-Regular.woff2",
  "fonts/MeowScript-Regular.woff2",
  "fonts/MsMadi-Regular.woff2",
  "fonts/Parisienne-Regular.woff2",
  "fonts/Quicksand-SemiBold.woff2",
  "fonts/RougeScript-Regular.woff2",
  "fonts/Sacramento-Regular.woff2",
  "fonts/Satisfy-Regular.woff2",
  "fonts/Yellowtail-Regular.woff2",
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
  // network first, but on weak Wi-Fi by the machine a fetch can hang for a long time: after 3 s the cached copy is
  // served and the fetch keeps going in the background to refresh the cache
  const cached = () => caches.match(req, { ignoreSearch: url.origin === location.origin });
  const net = fetch(req).then(async (res) => {
    if (res.ok || res.type === "opaque") await (await caches.open(CACHE)).put(req, res.clone());
    return res;
  });
  e.waitUntil(net.catch(() => {}));
  e.respondWith((async () => {
    try {
      const first = await Promise.race([net, new Promise((r) => setTimeout(r, 3000, "slow"))]);
      return first !== "slow" ? first : (await cached()) || (await net);
    } catch (err) {
      return (await cached()) || Promise.reject(err);
    }
  })());
});
