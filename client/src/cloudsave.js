// Cloud save — signed-in players keep their progress on every device.
// Only PROGRESS syncs (see core/src/progress.js): per-isle stars/best moves/best time
// (`klarbase.v2.progress`), dailies (`klarbase.v2.dailies`) and, once the map exists,
// `klarbase.v2.map`. Settings, sound, timer, builder draft, effort, guideSeen, GitHub
// name and lastProvider are DEVICE keys and never leave the browser.
// Local and remote are combined by the same mergeProgress the server runs, so a save
// can only gain. Everything here is silent on failure and a no-op when signed out.
import { mergeProgress } from '@klar/core';
import { api } from './net.js';

const K = { progress:'klarbase.v2.progress', dailies:'klarbase.v2.dailies', map:'klarbase.v2.map' };
const read = k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const warn = (...a) => { if(import.meta.env.DEV) console.warn('[cloudsave]', ...a); };

let ctx = null, signedIn = false, timer = 0;

// main.js hands over the live progress/dailies objects (mutated in place — the game holds
// references to them) plus a toast and a re-render callback.   hook(cloudsave)
export function initCloudSave(c){ ctx = c; }

const local = () => ({ v:1, progress:ctx.progress, dailies:ctx.dailies, ...(read(K.map) ? { map:read(K.map) } : {}) });

// write a merged save back into the live objects + localStorage; true when something changed
function apply(merged){
  const before = JSON.stringify(mergeProgress(local(), {}));
  if(JSON.stringify(merged) === before) return false;
  for(const [key, obj] of [['progress', ctx.progress], ['dailies', ctx.dailies]]){
    for(const k of Object.keys(obj)) delete obj[k];
    Object.assign(obj, merged[key] || {});
    write(K[key], obj);
  }
  if(merged.map){ write(K.map, merged.map); window.dispatchEvent(new CustomEvent('klarbase:map', { detail:merged.map })); }
  return true;
}

// after sign-in: pull, merge with this device, store, push the union back
export async function syncOnSignIn(session){
  signedIn = !!session;
  if(!signedIn || !ctx) return;
  try {
    const { data } = await api('/progress');
    const merged = mergeProgress(local(), data);
    const changed = apply(merged);
    const r = await api('/progress', { method:'PUT', body:{ data:merged } });
    if(r && r.data) apply(mergeProgress(local(), r.data));
    if(changed) ctx.refresh();
    let seen = false;
    try { seen = sessionStorage.getItem('klarbase.cloudToast') === '1'; sessionStorage.setItem('klarbase.cloudToast', '1'); } catch {}
    if(!seen) ctx.toast('Progress saved to your account ✓');
  } catch(e){ warn('sync failed', e); }
}

// after a clear: save to the account five seconds after the last one
export function pushSoon(){
  if(!signedIn || !ctx) return;
  clearTimeout(timer); timer = setTimeout(push, 5000);
}
async function push(keepalive = false){
  timer = 0;
  try {
    const r = await api('/progress', { method:'PUT', body:{ data:local() }, keepalive });
    if(r && r.data) apply(mergeProgress(local(), r.data));
  } catch(e){ warn('push failed', e); }
}
// don't lose a pending push when the tab is hidden or closed
document.addEventListener('visibilitychange', () => { if(document.visibilityState === 'hidden' && timer){ clearTimeout(timer); push(true); } });
