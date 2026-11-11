/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
// Offline, installable, and one release at a time. Every file of a release is listed here with its SHA-256
// (`node tests/sw.test.mjs --write` fills them in; CI fails when one is stale). Installing fetches each file past the
// browser's own cache and keeps it only if it is this release's: until every one is, the release already running goes
// on serving the page, whole. The page's files then come from that one set, never the network, so a page never runs
// one release's module beside another's (2026-10-31: a new ui.js with the last pieces.js, while the host still handed
// out old copies for ten minutes, drew the bookmark squashed). A new release waits until the page is reloaded (the
// page offers it: "Reload") or every tab is closed; it never takes over a page that is open, whose workers and fonts
// load later.
// A picture or design shared to the installed app arrives as a POST to ./?share and is handed to the page through a
// cache.
// (`SET`: a fingerprint of the list below, written with the hashes. It is part of the cache's name, so a release whose
// files changed can never install into the cache the running one is serving from, version number bumped or not.)
const SET = "5fa939312fa6";
const CACHE = `needleworks-v27-${SET}`, SHARED = "needleworks-shared";
const FILES = {
  "index.html": "2005aaaf618c23a7b4796e73c9bc7578c13a5f349078fd0eec79b5e92d3eca37",
  "manifest.webmanifest": "82f627e1def5254866cf364a55a1c2a85e2c3dd61abeeb890829362969fcfb63",
  "css/app.css": "b0cc2def55ffc31f6e3f71239e75aaca915d840ae4cfba8afabd500861dc7788",
  "assets/icon-192.png": "19ae131e0ea47270a4cd0eefdac045f1811f7b3b25966a08d27e3c94b3262c76",
  "assets/icon-512.png": "343d901ae82aef47b3c8313c36ad8c6c79609e8aa60d96ea983336fd170e863a",
  "assets/sample-flower.png": "ecacd191496defa4bd71af6d3570c7b67c30714002eaf1749f1a9d7eb2a52d00",
  "fonts/AlexBrush-Regular.woff2": "13355627e1cffe5334a3a7da592245ddce6766c71d2f31ee646bfb3542bdd768",
  "fonts/AlfaSlabOne-Regular.woff2": "121634140fc8d44b897aae51bc84d680a8605deb429b8fe147182bbc409aa83d",
  "fonts/Allura-Regular.woff2": "bb5da9592936eb819f6a487c6b865e2dbd4db4232333871a188ea11e1f114f91",
  "fonts/Cookie-Regular.woff2": "fd1100a94bb07178a21b24fc7561fcd1f51774492ba8a2e730cb5b72b56ad961",
  "fonts/Corinthia-Regular.woff2": "d1d3e154249bffde5764f6e3731fbe8166a44333e31c0eec5c578018cd4b7903",
  "fonts/Ephesis-Regular.woff2": "9b39111f6575e3c42ff80fdfc40be3521ae4609ce35f4ed2ddd135a945d37ea3",
  "fonts/Graduate-Regular.woff2": "285b1411d52908f48f328de6ace3944b65cf03d0d07885e52c687a5bcd2292f6",
  "fonts/GreatVibes-Regular.woff2": "9bf9dae316cddd16d9570266b598990cfc006139d0ba03d917cdc42db4bd2c1f",
  "fonts/Italianno-Regular.woff2": "5781eee363d24e677593173e91fd13144ac8cbd7f532b3f065fd2227dfbd0234",
  "fonts/JosefinSans-SemiBold.woff2": "2b0bde659880d12482100afe2df3a562021723d052bdb78105c280e5175370df",
  "fonts/LilitaOne-Regular.woff2": "59eab2e6dd52a13fc75c1a13fa9f25ebee85b70d2dbc6db3daaa2d1db2ff7a67",
  "fonts/MeowScript-Regular.woff2": "6474877a65e2abfb9ccb2d340f4b18388a40757a601f7e08b535d767973986db",
  "fonts/MsMadi-Regular.woff2": "2c1e1005cc16e15249f5c57946444544e070887074fd0c47445e543569539e00",
  "fonts/Parisienne-Regular.woff2": "bee4e3a50b562be2ff9d3fd3479046176b95022adf083a1ad0261f029a1736d6",
  "fonts/Quicksand-SemiBold.woff2": "e1aae18db74960291963ac48c289937d16a6d738a33ed9e60bd238d7d93e2be4",
  "fonts/RougeScript-Regular.woff2": "a1f1bd5aec6038a803a13b0e6e57c057786400df7e6aa49392677185962d8a31",
  "fonts/Sacramento-Regular.woff2": "299d61f6171d04bf3ffc19f45cf015ca50301d34df5425b5643cfe86c5742029",
  "fonts/Satisfy-Regular.woff2": "693c536670f722fc975f38664c4b87315e5b3b784e01200fe309ecaed9c090e3",
  "fonts/Yellowtail-Regular.woff2": "4be14e2b33416b292c558bbb36b6ca50ee7a44dab395fd475a7d45830c99b6f8",
  "js/app.js": "0bbc96b48375e4cba5c018a8e8f282cdba364a29c4447964d6ef81fe924fcc20",
  "js/words.js": "b1b24d18128fdf297034202390389cc7e3afcbab3416d362c76c611e900391bf",
  "js/core/brandcharts.js": "85f4772a2de19ab56691d984a8aad930b2c427cd34498c70f66933c6f09199be",
  "js/core/brands.js": "cb0a36b5fe3128de55654bdd350bdc86508f11fb089eb822bd73b7a26eba1c59",
  "js/core/design.js": "4fad331585a36ad275af19b0d116269b46e1763e980b79b4293dbdd9113f34b2",
  "js/core/digitize.js": "204f784ef73763dac4159a92bd92c1658d9753c358e1f36eeecb09dcb0c4f476",
  "js/core/fonts.js": "e94dcf912ca51ee364515f53cdf9921162995d2373b28738efc4e7de49e45707",
  "js/core/glyphs.js": "78a5bdc6a0e29406f34bba2a96e46cbcce21a2eac5f06a8533f54c4624134dc0",
  "js/core/formats.js": "b9f30a6509373963c4dbfc1ceeb713fe598974978e8d02ade7c742ce6598177d",
  "js/core/geom.js": "63e2280fc822305b2b65dc8822f567108e9df2ebdeb18a0f40b5ea9be929ef0a",
  "js/core/colour.js": "6d55cc04f540ea7ad064709d4c3bd5160d07a87ae4a6e60fa02d857312a7d559",
  "js/core/density.js": "0e712aeed7951c96a4d20e541a3480eeffd8295a80be90a3f00d3009d15f653c",
  "js/core/fill.js": "044fc0ed543fd3ee68ca21959965da634349013db3b769f3b1d8d3ed18c6b0fa",
  "js/core/machines.js": "7c84bc6638cc6e6fd5005e7f04ec7a166afc284e4f97f34759996649c6a67de5",
  "js/core/palette.js": "b7331ece1855474ab51d04225b58810ecfb19e9b2616e8736270eafc61d4c084",
  "js/core/recipes.js": "0f498f40c71cf3a5898d74fdb350eee7cb682776a989cdb42a232d4730956351",
  "js/core/raster.js": "5e07ce8cbce2cf4b990fe9b599bea23fbe52c743844858793ce52183821b8c7a",
  "js/core/text.js": "a253f11cfeafe6c9dd630fb3c2f010f0a88b37771923e92ffa9db70f32ff0378",
  "js/core/typed.js": "bca3a62351d99bff324c3012869f3910ec697bdc744906cf74a18f013df99e38",
  "js/core/threads.js": "2f843722671915cef7d2aad9344f171040e59d2cf70aa43b139da9dd4229fc1f",
  "js/doctor.js": "52f444739b26970a8c9f48f694bd9a7de219b794f5c2175c5cc64f1d4bec3d26",
  "js/opened.js": "8d03148bba892ce62a7051afb2e2649812dfc1785eaf3602023256fd5195b37c",
  "js/picture.js": "6dfde1ed7e110ae878aabf502d1264055406970366a8a5ec2f83d538866f08ed",
  "js/threadui.js": "8ceabd64367deaaa390dd1b99ff44ae7f6ee9a461d188c77e9c35263747af525",
  "js/along.js": "472c93e90e0887311608e514bfbb2a996d99e1f0ac7ba890c89f627096cdf3c8",
  "js/onitem.js": "e8f881bc81209ff19ee6a80c75afa0abb9a2f120077228d9370b5c864e054f6d",
  "js/focus.js": "a6526a6b42e5283aa7d6ff51fada31c98c001cf4240fd430d20c82c753e537be",
  "js/quality.js": "195942145d60801fdbef0940746642dcedc1cc2c78cef3f3f4a4aa26dc8345ed",
  "js/render.js": "f312aaacfb0321c9ee3e9cd9bc78c23fb93272c6ef69ae598a1f62308d930780",
  "js/sheet.js": "27290ea9399e4d587c9a7ed5889603026a51bc0e5edc675c35d6bd2691de4678",
  "js/state.js": "8224a7fa790cb9d554da2d3c61942287af26aaddd900b815336e4a737c92c216",
  "js/studio/motifs.js": "4f60c90573db9bd4f3affcc9d1b845f3a353c08f53c74f4e41f9e141745928cb",
  "js/studio/layout.js": "",
  "js/studio/names.js": "b27454005de5aa56f118d550f890008913fdcb63de1035151a3a9527ba301e79",
  "js/studio/outline.js": "a40044337aa3875af73b8b8d3551ca4c233319d42ea75fd53b00406edf49f8fa",
  "js/studio/compose.js": "9015855c5789e57e3aac379b34dab458521f945e05f719d6deb0f09fcb49c552",
  "js/studio/fabrics.js": "8eb75afaa2462adae20b1a454164a003bfd1506b815aa82d6942a621632f0685",
  "js/studio/files.js": "3c1d1c2798c1f8d7e3611d83312886ce1a0555ff9ecb773808a67275cccdedb5",
  "js/studio/lettering.js": "0fc8fe042797fe4d0c72e533a0cb1a5c12da99cae067963eaf28a59c5862af89",
  "js/studio/pieces.js": "53f0d393bfd302ccb3068268558ed1c2b638fbd19b35b1eabcf58d7a0131ff8f",
  "js/studio/placing.js": "aa15695f0477947cbede8007c25a810a7a1ca750718c9169b9517982e997c6b4",
  "js/studio/shapes.js": "9ede9a6f7460cfa3a85b78fab945e1ee4d8ab344ec5a4886d1a44dc201326f6e",
  "js/studio/starters.js": "b273c60f0076ef6f68ef4e25720e7f796b908c262d878b03982a7f39288af1d2",
  "js/studio/quilt.js": "05184d2979699b79ef5f258919b74f1bc73633c776abb5684fc96312083e7475",
  "js/studio/recent.js": "e07113e8d84dc02706cc97784682c835be08c128a6d13bdd1a1d936781689ebd",
  "js/studio/threadsaid.js": "848f611cd42126b84096a1c2293c9a0fc08e697f0feaf4dd79ec581868fdfaf2",
  "js/studio/toobig.js": "7990f73316cfb63e70fb89ad2910e1cd15cfc2dba871b77ecd0f958c6513ecd8",
  "js/studio/fixes.js": "bc5b432f83643b45398329b696a4d357b9f9ec286c790c6e3aed87b6c42a860f",
  "js/studio/stepsui.js": "8960066581345e300b615f19694ce84815b78fb95f80cecb6c7e16b04ddff2d9",
  "js/studio/offpage.js": "879ccd83e56f756c83eed3808249b61c27c0abadb7383db2f20f4c5278cfc6ff",
  "js/studio/problems.js": "72fe1151fe547c3df31dc2709b0d43d5b5e57f3ba524483c86f5dac52c905f7a",
  "js/studio/editor.js": "3f89a49b4c59e1ef317be3bafa923525e86ff6365e63ec4dd7af1f69963fd2ca",
  "js/studio/ui.js": "09155dfa7bc8e48eaf81581f94c23979196d5bb904e39465cc8df4e31d7c13e9",
  "js/doctor-worker.js": "3317fbb8ef871771b787b51a9778e16fe4b0d0269e3bedbcc4128c482beed8fc",
  "js/quilt-worker.js": "75ae9e71b130b2bafcb5fee6e169ffdd39e7cea9de949cbb344900bc5b6da76c",
  "js/worker.js": "58a84e06b5badb84d74e446e569b917f4892419c0a8aad783a11cf038ea8a3b6",
  "js/zip.js": "d3d529808cf0618975057f7a71bf6044059204da36a7ffc62d4679f627c6fcb3",
  "js/gate.js": "9973e406c59f1ee0cb66bdc51cf65fe246bfc98616de66e1e35fd551f27c451a",
  "js/jobs.js": "1309a0a2ad6edd8d872c0e7af21e48da0041406b1f901d8a95c3af157a6d6617",
};
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await Promise.all(Object.entries(FILES).map(async ([f, want]) => {
      const res = await fetch(new Request(f, { cache: "reload" }));
      if (!res.ok) throw new Error(`${f}: ${res.status}`);
      const buf = await res.clone().arrayBuffer();
      // (the host can still be handing out another release's copy of a file: not installed, tried again at the next visit)
      if (hex(await crypto.subtle.digest("SHA-256", buf)) !== want) throw new Error(`${f} isn't this release's yet`);
      await c.put(f, res);
      if (f === "index.html") await c.put("./", new Response(buf, { headers: { "content-type": "text/html; charset=utf-8" } }));
    }));
    // (the very first install has nothing to wait behind: it starts serving at once)
    if (!self.registration.active) await self.skipWaiting();
  })());
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE && k !== SHARED).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// the page's "Reload" for a new release: take over, and the page reloads when it has
self.addEventListener("message", (e) => { if (e.data === "activate") self.skipWaiting(); });
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
  if (url.origin === location.origin) {
    // this release's copy; anything that isn't part of it (a test page) comes from the network
    e.respondWith((async () => (await (await caches.open(CACHE)).match(req, { ignoreSearch: true })) || fetch(req))());
    return;
  }
  // the Google fonts the page uses for its text: the network first, but on weak Wi-Fi by the machine a fetch can hang
  // for a long time, so after 3 s the cached copy is served and the fetch keeps going to refresh it
  if (!/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) return;
  const cached = () => caches.match(req);
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
