// Wild isles are generated off the main thread: wildIsle is p50 5 ms but p95 ~65 ms, which would hitch a frame.
import { ATLAS_SEED, wildIsle } from '@klar/core';
self.onmessage = e => {
  const { x, z } = e.data;
  let res = null;
  try { res = wildIsle(ATLAS_SEED, x, z); } catch { res = null; }
  self.postMessage({ x, z, res });
};
