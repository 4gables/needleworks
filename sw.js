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
const SET = "f6cdeeb13393";
const CACHE = `needleworks-v34-${SET}`, SHARED = "needleworks-shared";
const FILES = {
  "index.html": "69ccd54db6f31aa2777f50dcb1c8c2f0d14343de27abe57e3efbf62664e4cbc7",
  "manifest.webmanifest": "82f627e1def5254866cf364a55a1c2a85e2c3dd61abeeb890829362969fcfb63",
  "css/app.css": "4dc644a0e4bb2ede40dc6e0efe659306b0c466d38a2f79ec71ca98518fc1d205",
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
  "js/app.js": "fd85d3cc23c7e90840a2fe013dfa66a7c2f011f07069cf497af1b817f65314f7",
  "js/words.js": "32351ae8626fa69c73fbb07762152d451d8c812b98a9172210705a9fa2fc6ac4",
  "js/core/brandcharts.js": "85f4772a2de19ab56691d984a8aad930b2c427cd34498c70f66933c6f09199be",
  "js/core/brands.js": "cb0a36b5fe3128de55654bdd350bdc86508f11fb089eb822bd73b7a26eba1c59",
  "js/core/design.js": "524343b1e64430e00794de16ca112806f34725c49e18755d2bf02416ef276fbb",
  "js/core/digitize.js": "91b1d6ab7561f7d8f3326736e014e8282cea1c8750a2c5b1525f7df025cc1e9e",
  "js/core/fonts.js": "17f00207b7a5ae85ec8ae5059a1a7122a0ab059cd27a70f27e607db74790e5ce",
  "js/core/glyphs.js": "5923a80f5f9c7d8be7e271af557783d7b3ee46c00bf0c4185f8840f344e99433",
  "js/core/formats.js": "6c635b29d843e7eb112ad773f92f79b26ea0ad17769889104b271faa2915b76e",
  "js/core/formats-out.js": "6c340ec9036e5a7efc78ced8b6a7e3d9af9dd8e8773d230c8120302da33e333c",
  "js/core/geom.js": "63e2280fc822305b2b65dc8822f567108e9df2ebdeb18a0f40b5ea9be929ef0a",
  "js/core/colour.js": "ceb89ab0511bd2c9673945b2c90f71565ffd0a934bc5b299dab1279fc9758da2",
  "js/core/density.js": "fc507b2818e7cdb700d52d88ac328a784b89ddac6f609fcc469b95c4805a237e",
  "js/core/fill.js": "fff1727d72b777eadd8df6b8d848c0d360beedc1ccee7f6df81328cdae6a664f",
  "js/core/machines.js": "afd9fe6fc812a0b03d903fc54a374b3246ac27539c9cff7d5ea546ed9e81c135",
  "js/core/artcheck.js": "d87f37fe199495fc0d2150af4afe4f67abb7af58e656adaab7c62148645d3693",
  "js/core/palette.js": "203f0a1f4ab9e67c28b34d09a2bbab022891add2e86cc8f14445b9a4d2feb928",
  "js/core/recipes.js": "4e93e643a10ba2c4f3e493891b0799ec201ceee59eabc245741c261140247f01",
  "js/core/raster.js": "b7f39ab3343d79066522fa5a4ef65bd4719e06fdb165c67f6b9dae88042ab93d",
  "js/core/regions.js": "4e24ba2c2d89c91a51bf3952db56ff4346d73783921a877911b97e1d45ad5813",
  "js/core/shade.js": "e084b382f33bed0469790a7b1d58cb44cac159bc889742302ff0b4a65ac106b3",
  "js/core/text.js": "a253f11cfeafe6c9dd630fb3c2f010f0a88b37771923e92ffa9db70f32ff0378",
  "js/core/typed.js": "bca3a62351d99bff324c3012869f3910ec697bdc744906cf74a18f013df99e38",
  "js/core/threads.js": "2f843722671915cef7d2aad9344f171040e59d2cf70aa43b139da9dd4229fc1f",
  "js/doctor.js": "ff80ece0fa4d29d7523fd2d5c2af3247e184fe49d2e6220dba286af39281e64c",
  "js/opened.js": "4a56f6bbcd1d67639d19ca1f052ec421d32b7cde6fedf5a016f827f11ccd4b84",
  "js/artwords.js": "ceaa16cdfcf9f20f929df194a4439ff3521f9bd407aa5271f56a0f6b7d12d038",
  "js/picture.js": "474ace728862762f3f8d80582f989a1e8acdec471c872416d73d646dc9c8d94c",
  "js/threadui.js": "8ceabd64367deaaa390dd1b99ff44ae7f6ee9a461d188c77e9c35263747af525",
  "js/along.js": "5332fceae5092f2989d8fe09ddf64167bbd7d6e0004fb3eed174a149ecd03545",
  "js/onitem.js": "e8f881bc81209ff19ee6a80c75afa0abb9a2f120077228d9370b5c864e054f6d",
  "js/focus.js": "a6526a6b42e5283aa7d6ff51fada31c98c001cf4240fd430d20c82c753e537be",
  "js/quality.js": "195942145d60801fdbef0940746642dcedc1cc2c78cef3f3f4a4aa26dc8345ed",
  "js/render.js": "e4d21a8dcc5f6bf039dc6c4fa009b8848ad50a522a06224b4d152db2d52becf1",
  "js/sheet.js": "27290ea9399e4d587c9a7ed5889603026a51bc0e5edc675c35d6bd2691de4678",
  "js/state.js": "25b389297e88d65e5d7d5cc25903f2013414b79947272670f3f122e6ad5d132a",
  "js/studio/motifs.js": "4f60c90573db9bd4f3affcc9d1b845f3a353c08f53c74f4e41f9e141745928cb",
  "js/studio/ownfont.js": "755f1c910f9c13b18bc0691fe3c86cfeabe3bfbd5d393e5b9ce69f8df0f2fb43",
  "js/studio/layout.js": "db1920b82ccbd7b04359e51cc8295a4e9abab86f7d569c29f7e049c692ff65b1",
  "js/studio/names.js": "50d46f2e9959fbdbc6ad62436f18854f5948811b064decff6e4d4c3c89d42b9d",
  "js/studio/outline.js": "a40044337aa3875af73b8b8d3551ca4c233319d42ea75fd53b00406edf49f8fa",
  "js/studio/borders.js": "47c447abfef9d824b104fba0d75bd1e816f5f38197783535fe7f3e63bdad4703",
  "js/studio/compose.js": "66cf92e7148d2cf234babc7c7b07d6cb7f738695e324ac96508d658d96fe315d",
  "js/studio/fabrics.js": "164cab091bcee138dbeb614844ad2592bc1b2bbf1b587f387d454b4514905475",
  "js/studio/files.js": "3c1d1c2798c1f8d7e3611d83312886ce1a0555ff9ecb773808a67275cccdedb5",
  "js/studio/lettering.js": "8f5a8cdc39e886c80b948a9df6f0c50224bcb5e75a77ba71d31f0ce23b39c88b",
  "js/studio/pieces.js": "e8c25a92732c6f56b2d9343b37595ac73b9dcb2922fb3f2552f39bf4fbb9efbb",
  "js/studio/placing.js": "7c7febc418dec709f6bdb1fa6f9d30e4e7f720c672922cc4cc66bab353f43cdb",
  "js/studio/shapes.js": "b93cba0d68d3d4ba6ef497d6f984ca1912778fe01d5149d683c10f8f2d0b9257",
  "js/studio/starters.js": "b273c60f0076ef6f68ef4e25720e7f796b908c262d878b03982a7f39288af1d2",
  "js/studio/quilt.js": "2708de734505793e694c8a922ade05c41be0b5d9549ddb41a9f5bb77a237a74a",
  "js/studio/recent.js": "e07113e8d84dc02706cc97784682c835be08c128a6d13bdd1a1d936781689ebd",
  "js/studio/threadsaid.js": "848f611cd42126b84096a1c2293c9a0fc08e697f0feaf4dd79ec581868fdfaf2",
  "js/studio/toobig.js": "7990f73316cfb63e70fb89ad2910e1cd15cfc2dba871b77ecd0f958c6513ecd8",
  "js/studio/fixes.js": "bc5b432f83643b45398329b696a4d357b9f9ec286c790c6e3aed87b6c42a860f",
  "js/studio/stepsui.js": "195c4f60a2da7a38af9e909171f615b93e630b64f5a0207a84c47884488c8962",
  "js/studio/offpage.js": "c0b87847ff2ae9b4eb42edb737aed59d999f426d3a7912e4614790ec329c0374",
  "js/studio/problems.js": "a6d1419257661a946781747f2006bd501bfdb9aaf87eb2c65ecce07ac897a701",
  "js/studio/settings.js": "fc4eedf71ed227d6154caab373b73f360039d66a68863073761e3acf80764408",
  "js/studio/editor.js": "042374ad358c045e63d124fc05c24e8c1e7261c08deda32796de2c2bd8236d5a",
  "js/studio/ui.js": "6176bfbaa9b4c1b3057ff615989a8eb30f863ad9ebb722edd28aa4f18e03643d",
  "js/doctor-worker.js": "3317fbb8ef871771b787b51a9778e16fe4b0d0269e3bedbcc4128c482beed8fc",
  "js/quilt-worker.js": "75ae9e71b130b2bafcb5fee6e169ffdd39e7cea9de949cbb344900bc5b6da76c",
  "js/worker.js": "f4598f7a1483ab69dc888df1953ea2db25791e91c07b2b2811043721d78ac474",
  "js/zip.js": "d3d529808cf0618975057f7a71bf6044059204da36a7ffc62d4679f627c6fcb3",
  "js/gate.js": "938788b4ff6f1ef97b0ded2d32c29c9dcada1159df4d91c5e0c96eb4bb48bcef",
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
