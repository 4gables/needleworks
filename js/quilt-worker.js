/*! Needleworks (c) 2026 4Gables. All rights reserved. Proprietary, see LICENSE. https://4gables.com/needleworks/ */
// Quilting worked out off the page (the Design tab's stipple and echo): the same code as compose runs, so the same
// stitches. One job at a time, the newest waiting one next (a word typed letter by letter asks for each).
import { quiltOf } from "./studio/quilt.js";

onmessage = (e) => {
  const { key, job } = e.data;
  try { postMessage({ key, paths: quiltOf(job) }); } catch (err) { postMessage({ key, error: err.message }); }
};
