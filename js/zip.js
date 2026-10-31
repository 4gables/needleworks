/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
// A plain ZIP (stored, no compression: PES files barely compress) for downloading several files at once.
const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
function crc32(b) { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

// files: [{ name (ASCII), bytes: Uint8Array }] -> Uint8Array
export function zip(files) {
  const enc = new TextEncoder(), parts = [], central = [], t = new Date();
  const time = (t.getHours() << 11) | (t.getMinutes() << 5) | (t.getSeconds() >> 1), date = ((t.getFullYear() - 1980) << 9) | ((t.getMonth() + 1) << 5) | t.getDate();
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name), crc = crc32(f.bytes), n = f.bytes.length;
    const local = new DataView(new ArrayBuffer(30));
    [[0, 0x04034b50, 4], [4, 20, 2], [8, 0, 2], [10, time, 2], [12, date, 2], [14, crc, 4], [18, n, 4], [22, n, 4], [26, name.length, 2]].forEach(([o, v, s]) => (s === 4 ? local.setUint32(o, v, true) : local.setUint16(o, v, true)));
    const cen = new DataView(new ArrayBuffer(46));
    [[0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [12, time, 2], [14, date, 2], [16, crc, 4], [20, n, 4], [24, n, 4], [28, name.length, 2], [42, offset, 4]].forEach(([o, v, s]) => (s === 4 ? cen.setUint32(o, v, true) : cen.setUint16(o, v, true)));
    parts.push(new Uint8Array(local.buffer), name, f.bytes); central.push(new Uint8Array(cen.buffer), name);
    offset += 30 + name.length + n;
  }
  const size = central.reduce((a, b) => a + b.length, 0), end = new DataView(new ArrayBuffer(22));
  [[0, 0x06054b50, 4], [8, files.length, 2], [10, files.length, 2], [12, size, 4], [16, offset, 4]].forEach(([o, v, s]) => (s === 4 ? end.setUint32(o, v, true) : end.setUint16(o, v, true)));
  const all = [...parts, ...central, new Uint8Array(end.buffer)], out = new Uint8Array(all.reduce((a, b) => a + b.length, 0));
  let at = 0; for (const b of all) { out.set(b, at); at += b.length; }
  return out;
}
