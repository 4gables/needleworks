/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
// The paid build's worker: it takes the very messages worker.js and doctor-worker.js take and sends each to the server
// (docs/paid-version.md), so jobs.js and the page's job code are the same in both builds. Off the page's thread: a
// picture's pixels are packed and gzipped here.
import { API } from "./api.js";
import { pack, unpack } from "./wire.js";

const pipe = async (bytes, stream) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
// (a picture's copy crosses as its width, height and pixels: an ImageData has no fields JSON can see)
const plain = (v) => (v && typeof v === "object" && v.data && v.width && !Array.isArray(v) ? { width: v.width, height: v.height, data: v.data } : v);
const OFFLINE = "The stitching service couldn't be reached. Check your connection and try again.";
// (a request holds 6 MB as the server gets it, a third bigger than these bytes: a photo at the hoop's full size can pass it)
const MOST = 4.3 * 1024 * 1024, BIG = "This picture is too detailed to send at this Size. Try a smaller Size, or fewer colours.";

export function serve(kind) {
  self.onmessage = async (e) => {
    // (`$code`: the visitor's download code, if they have one: its previews aren't counted against the day's)
    const { id, $code, ...msg } = e.data;
    let reply;
    try {
      for (const k of ["learn", "img", "img2"]) if (msg[k]) msg[k] = plain(msg[k]);
      const sent = await pipe(pack(msg), new CompressionStream("gzip"));
      if (sent.length > MOST) { self.postMessage({ ok: false, code: "big", error: BIG, id }); return; }
      const res = await fetch(`${API}/job/${kind}`, { method: "POST", headers: { "content-type": "application/octet-stream", ...($code ? { "x-code": $code } : {}) }, body: sent });
      const body = new Uint8Array(await res.arrayBuffer());
      if (res.status === 413) reply = { ok: false, code: "big", error: BIG };
      else reply = (res.headers.get("content-type") || "").includes("json") ? JSON.parse(new TextDecoder().decode(body)) : unpack(await pipe(body, new DecompressionStream("gzip")));
    } catch (err) {
      reply = { ok: false, code: "offline", error: OFFLINE };
    }
    self.postMessage({ ...reply, id });
  };
}
