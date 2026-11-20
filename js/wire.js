/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
// How a job and its reply cross to the server (docs/paid-version.md): one block of bytes, a JSON text with every
// typed array lifted out and laid after it, so a picture's pixels and a file's bytes go as they are (not as text),
// exactly. [4 bytes: the text's length][the text: the arrays' lengths on its first line, then the JSON][each array's bytes]. The sender gzips the block.
// A number JSON can't write (Infinity, NaN) goes as { $n }, an array of bytes as { $b: its place, t: its type }.
const TYPES = { Uint8Array, Uint8ClampedArray, Int8Array, Int16Array, Uint16Array, Int32Array, Uint32Array, Float32Array, Float64Array };

export function pack(value) {
  const blobs = [];
  const body = JSON.stringify(value, (k, v) => {
    if (typeof v === "number" && !Number.isFinite(v)) return { $n: String(v) };
    if (ArrayBuffer.isView(v)) { blobs.push(new Uint8Array(v.buffer, v.byteOffset, v.byteLength)); return { $b: blobs.length - 1, t: v.constructor.name }; }
    return v;
  });
  // (the text's first line: each array's length, in the order they lie)
  const text = new TextEncoder().encode(JSON.stringify(blobs.map((b) => b.length)) + "\n" + body);
  const out = new Uint8Array(4 + text.length + blobs.reduce((a, b) => a + b.length, 0));
  new DataView(out.buffer).setUint32(0, text.length);
  out.set(text, 4);
  let at = 4 + text.length;
  for (const b of blobs) { out.set(b, at); at += b.length; }
  return out;
}

export function unpack(bytes) {
  const n = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0);
  const text = new TextDecoder().decode(bytes.subarray(4, 4 + n)), cut = text.indexOf("\n"), sizes = JSON.parse(text.slice(0, cut)), starts = [];
  let at = 4 + n;
  for (const size of sizes) { starts.push(at); at += size; }
  return JSON.parse(text.slice(cut + 1), (k, v) => {
    if (v && typeof v === "object" && typeof v.$n === "string") return Number(v.$n);
    if (v && typeof v === "object" && Number.isInteger(v.$b) && TYPES[v.t]) {
      // (copied: a typed array must start on its own size's boundary. Not `bytes.slice`: Node's Buffer answers that
      // with a view of the same memory)
      const copy = Uint8Array.prototype.slice.call(bytes, starts[v.$b], starts[v.$b] + sizes[v.$b]);
      return new TYPES[v.t](copy.buffer, 0, sizes[v.$b] / TYPES[v.t].BYTES_PER_ELEMENT);
    }
    return v;
  });
}
