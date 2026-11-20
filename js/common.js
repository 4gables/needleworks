/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
// Small things the page and the Design tab both read (studio/ui.js hands them on): the thread colours offered for a
// line, and a file that is a design saved from Design your own. Both builds ship this file.
export const RED = "#ed171f", NAVY = "#0e1f7c", BLACK = "#000000";

export const COLORS = [RED, NAVY, "#00673e", "#770176", "#e8a900", "#f993bc", BLACK, "#f0f0f0"];

// A design saved from here (.needleworks.json), from a file's bytes, or null: dropped on the page, shared to it, opened on
// the Open tab or added with + Design file, it was called a damaged embroidery file.
export function savedDesign(bytes) {
  let i = 0; while (i < bytes.length && (bytes[i] === 0x20 || bytes[i] === 0x0a || bytes[i] === 0x0d || bytes[i] === 0x09 || bytes[i] === 0xef || bytes[i] === 0xbb || bytes[i] === 0xbf)) i++;
  if (bytes[i] !== 0x7b) return null;   // ({)
  try { const d = JSON.parse(new TextDecoder().decode(bytes)); return d?.needleworks === 1 && Array.isArray(d.pieces) ? d : null; } catch { return null; }
}
