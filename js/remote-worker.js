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

export function serve(kind) {
  self.onmessage = async (e) => {
    const { id, ...msg } = e.data;
    let reply;
    try {
      for (const k of ["learn", "img"]) if (msg[k]) msg[k] = plain(msg[k]);
      const res = await fetch(`${API}/job/${kind}`, { method: "POST", headers: { "content-type": "application/octet-stream" }, body: await pipe(pack(msg), new CompressionStream("gzip")) });
      const body = new Uint8Array(await res.arrayBuffer());
      reply = (res.headers.get("content-type") || "").includes("json") ? JSON.parse(new TextDecoder().decode(body)) : unpack(await pipe(body, new DecompressionStream("gzip")));
    } catch (err) {
      reply = { ok: false, code: "offline", error: OFFLINE };
    }
    self.postMessage({ ...reply, id });
  };
}
