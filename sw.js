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
const SET = "85b25a19c969";
const CACHE = `needleworks-v51-${SET}`, SHARED = "needleworks-shared";
const FILES = {
  "index.html": "3548c7c1922462dc061258df315b66d6318d45d014a973685caf0228f89d472f",
  "manifest.webmanifest": "82f627e1def5254866cf364a55a1c2a85e2c3dd61abeeb890829362969fcfb63",
  "css/app.css": "1c7d8c982f85243b3f2e3c6cd910a7b1601d1b2c9362adfa518f114061165938",
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
  "fonts/Poppins-SemiBold.woff2": "53748661c28ed6adb3bc673ac2ad1351a3943c1b153dea3e6c97b00f1cf83518",
  "fonts/Quicksand-SemiBold.woff2": "e1aae18db74960291963ac48c289937d16a6d738a33ed9e60bd238d7d93e2be4",
  "fonts/RougeScript-Regular.woff2": "a1f1bd5aec6038a803a13b0e6e57c057786400df7e6aa49392677185962d8a31",
  "fonts/Sacramento-Regular.woff2": "299d61f6171d04bf3ffc19f45cf015ca50301d34df5425b5643cfe86c5742029",
  "fonts/Satisfy-Regular.woff2": "693c536670f722fc975f38664c4b87315e5b3b784e01200fe309ecaed9c090e3",
  "fonts/Yellowtail-Regular.woff2": "4be14e2b33416b292c558bbb36b6ca50ee7a44dab395fd475a7d45830c99b6f8",
  "fonts/ZillaSlab-SemiBold.woff2": "b7e8f316b83ba8889baf7a9993fb5805c845a04d985a08b3df483efddf9a99aa",
  "js/app.js": "d678906ebc5226e0853ea187acddf97924f3cc4bce936234677dc9b6201c8e93",
  "js/words.js": "32351ae8626fa69c73fbb07762152d451d8c812b98a9172210705a9fa2fc6ac4",
  "js/core/brandcharts.js": "85f4772a2de19ab56691d984a8aad930b2c427cd34498c70f66933c6f09199be",
  "js/core/brands.js": "cb0a36b5fe3128de55654bdd350bdc86508f11fb089eb822bd73b7a26eba1c59",
  "js/core/design.js": "616cd759d665209a80236e18de9b230675db3626efb8ea08846cffbd7bb15e18",
  "js/core/digitize.js": "639b6cbfe07885e4778e21628ef1871793b4020c1c34f27389a70f28b68e1e61",
  "js/core/fonts.js": "eff92c64949a5983d3d2ae4804ff6cbf7ca1a6547998767f276c8d07b9cd26f9",
  "js/core/glyphs.js": "1aa94c2a28d8343fa6837d8f0591e325a9128063bfce81d968bf592feda6cbf3",
  "js/core/formats.js": "6c635b29d843e7eb112ad773f92f79b26ea0ad17769889104b271faa2915b76e",
  "js/core/formats-out.js": "6c340ec9036e5a7efc78ced8b6a7e3d9af9dd8e8773d230c8120302da33e333c",
  "js/core/geom.js": "67e8e62be163f9e2995e1c13d18bad7fb7e82646c132545d249668112c8c0c90",
  "js/core/colour.js": "ceb89ab0511bd2c9673945b2c90f71565ffd0a934bc5b299dab1279fc9758da2",
  "js/core/density.js": "fc507b2818e7cdb700d52d88ac328a784b89ddac6f609fcc469b95c4805a237e",
  "js/core/fill.js": "48d998b7c5188af34d929e04c4c5e28df9d9aeb462160232b64392c7ee4a54e4",
  "js/core/machines.js": "afd9fe6fc812a0b03d903fc54a374b3246ac27539c9cff7d5ea546ed9e81c135",
  "js/core/artcheck.js": "99346174e72d835c8f68fcf3ea48e781caa14b126328a6b7be804dd3d6f60aa4",
  "js/core/palette.js": "be3c5634876b2154853b75ca866eb9dbf23d94e11ea6d04f17a5e43193755403",
  "js/core/recipes.js": "e6e3c690272684973585f0ec9f7fe96c31cac8a2c26dd9f33d534da602f07587",
  "js/core/raster.js": "fffd64cd4bf85d96ebbc3bb69f16a76f439415d176850625ea3294e9a9a54fa6",
  "js/core/regions.js": "4e24ba2c2d89c91a51bf3952db56ff4346d73783921a877911b97e1d45ad5813",
  "js/core/shade.js": "2eb89bf74a39de6a3d403d2e9e7c356931cc25fc8e7bd2351750f40ce30b477f",
  "js/core/text.js": "a253f11cfeafe6c9dd630fb3c2f010f0a88b37771923e92ffa9db70f32ff0378",
  "js/core/typed.js": "bca3a62351d99bff324c3012869f3910ec697bdc744906cf74a18f013df99e38",
  "js/core/threads.js": "2f843722671915cef7d2aad9344f171040e59d2cf70aa43b139da9dd4229fc1f",
  "js/doctor.js": "5653d26f544b9f11cd96ee2381bebae5c5c98ae74a6d78f690d70b2045820b83",
  "js/opened.js": "c0e40a9c5328d974ba46d62d25fcd49ce8308ef1b33f16ff829bef5fd225dc71",
  "js/artwords.js": "41c08b6a95918621f461dbb9a2eff08f808618b252c160d7316ce6da82c06751",
  "js/picture.js": "3a83bfec598bf043fb21133276ce05e5cc8c3ecbf9b243d253fea3772eacca81",
  "js/threadui.js": "8ceabd64367deaaa390dd1b99ff44ae7f6ee9a461d188c77e9c35263747af525",
  "js/along.js": "5877433450bc9b2e8c474a46829e506b62a16b805fee20dc6bd68284239e4c7c",
  "js/onitem.js": "e8f881bc81209ff19ee6a80c75afa0abb9a2f120077228d9370b5c864e054f6d",
  "js/focus.js": "a6526a6b42e5283aa7d6ff51fada31c98c001cf4240fd430d20c82c753e537be",
  "js/quality.js": "884c358c4f924c97f158c52722b18add1dd5f44e97d848a59743b52be068e4ee",
  "js/render.js": "d4dea231700c46bc70c82d24e1db88abe84dd0929343cd1329d6629ff1b2e1cf",
  "js/sheet.js": "27290ea9399e4d587c9a7ed5889603026a51bc0e5edc675c35d6bd2691de4678",
  "js/state.js": "3e294bba527f0066248fe15e75fd5b208f7c14e75d2e1a1d42b26d1b379bfe6c",
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
  "js/studio/starters.js": "e036db5d21a94a6cec9c9844bf1c26048e5242b4fcd986b793b9c4159fdf6d32",
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
  "js/studio/ui.js": "e94038143bac327569a56117f7577974437a0c4f6184ecfaafdf7063165905a8",
  "js/doctor-worker.js": "9b89e2871b66cb2129bc0ace1cf6803f73e58878e7947e176ffc876d49d0e651",
  "js/quilt-worker.js": "75ae9e71b130b2bafcb5fee6e169ffdd39e7cea9de949cbb344900bc5b6da76c",
  "js/worker.js": "5743b354a5d37803ac9a1d94261ad458d2a98b15b478d3fbcc0de3071068d942",
  "js/zip.js": "d3d529808cf0618975057f7a71bf6044059204da36a7ffc62d4679f627c6fcb3",
  "js/gate.js": "938788b4ff6f1ef97b0ded2d32c29c9dcada1159df4d91c5e0c96eb4bb48bcef",
  "js/jobs.js": "1309a0a2ad6edd8d872c0e7af21e48da0041406b1f901d8a95c3af157a6d6617",
  "js/api.js": "c82d95b22440729c5a7d92cc494d7eebb851f2c926c76692de9db617d4b9dd06",
  "js/checkup.js": "c6429ff76bf84b41de061aa727031e63ff8de2b7120b09834f2e0998dbd87766",
  "js/common.js": "06ad65797e7434f27724001cb1fdd63970506ac785d36041d279c82a6fc42c4c",
  "js/docjob.js": "45b38fc1478cb83475fac8c33ac0bf52400628b021cdc5f8481f08840f4f426a",
  "js/engine-remote.js": "2837be697ddb7d072dbd443af9a47908c30754cce755332610ca36fe8d943438",
  "js/engine.js": "54ebce28d057c475ef63437b508256e0455f97c2081250a0fd98e2fb11c8d71c",
  "js/picjob.js": "18322d642fb004d46beb73c0114f8dd372b95b7d5e2c98c1dbe255fe1e8c51ad",
  "js/remote-doctor.js": "6d020d6b9fac3b75ac9099a3f4b9cbd39b430d010112e1cb16da128d228db8f7",
  "js/remote-picture.js": "2e11a1b7a2d22e285576f8ccc3b05b903a1fb603df2b7cf285c4485848d67543",
  "js/remote-worker.js": "4a5f0b8a153cc8e9066638f3c27c3822fed7277c3979f1c15fc4a6af00774cf9",
  "js/wire.js": "425d2623b9bb3f28d35c109996c01d8ddf7f540c92f359ba3dcf1c9a6e57298f",
  "js/core/areas.js": "0e5729ec0ae789f426adc49ecc1f2d3e9a21b8c47dd3cc06639f8e9db49801e4",
  "js/core/grid.js": "c213a2103ab299554d805123c3172f7a2aa2a5283c894154aa8dda76008167cb",
  "js/core/limits.js": "65e92548afe9e1278a38f87324de126048c83713e30c4eb6cdf66bd3dc8ced39",
  "js/core/picprep.js": "66d84de80b018aa3b1d5dcf440c668ca9650d75cbf82816a8c4cd506678e6bc8",
  "js/core/turn.js": "6b2c99d6192fef78e95e488126776194a368a0e89b1bd48009f2123ce7394081",
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
