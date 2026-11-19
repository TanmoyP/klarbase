// Resolves the puzzle behind a wild shrine: a Web Worker running core's wildIsle, with an in-memory cache.
// get(x, z) -> Promise<result | null> (null = the quiet shrine); peek(x, z) -> result | null | undefined (undefined = not yet).
// If workers are unavailable the same function runs on the main thread in a timeout (one at a time).
import { ATLAS_SEED, wildIsle } from '@klar/core';

export function createWild(){
  let worker = null;
  try { worker = new Worker(new URL('./wild.worker.js', import.meta.url), { type:'module' }); } catch { worker = null; }
  const cache = new Map(), waiting = new Map();
  const settle = (k, res) => { cache.set(k, res); const w = waiting.get(k); waiting.delete(k); if(w) for(const f of w) f(res); };
  if(worker){
    worker.onmessage = e => settle(e.data.x + ',' + e.data.z, e.data.res);
    worker.onerror = () => { worker.terminate(); worker = null; for(const k of [...waiting.keys()]){ const [x, z] = k.split(',').map(Number); inline(x, z); } };
  }
  const inline = (x, z) => setTimeout(() => { let r = null; try { r = wildIsle(ATLAS_SEED, x, z); } catch {} settle(x + ',' + z, r); }, 0);
  return {
    peek:(x, z) => cache.get(x + ',' + z),
    get(x, z){
      const k = x + ',' + z;
      if(cache.has(k)) return Promise.resolve(cache.get(k));
      return new Promise(res => {
        const first = !waiting.has(k);
        if(first) waiting.set(k, []);
        waiting.get(k).push(res);
        if(first){ if(worker) worker.postMessage({ x, z }); else inline(x, z); }
      });
    },
    dispose(){ if(worker) worker.terminate(); worker = null; waiting.clear(); },
  };
}
