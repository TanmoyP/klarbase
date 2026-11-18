// Graphics quality tiers (visual finesse pass).
//   fancy  everything: HDR chain, contact AO, tilt-shift DoF (24 taps), 2-level bloom, soft PCSS (2048)
//   cozy   no AO, lighter DoF (12 taps), single bloom, MSAA 2, fewer shadow taps (2048)
//   fast   NO post chain — direct render with the renderer's own ACES (the old look) + 1024 shadows
// The tier is picked from the device, and the player's explicit choice (the ✨ button) wins
// and is remembered in localStorage `klarbase.v2.quality`. Without an explicit choice, a
// rolling average frame time above 22 ms for 3 s drops one tier, once, silently.
// Dev: ?quality=fancy|cozy|fast in the URL forces a tier for that visit (no auto-drop, not saved).
import { createPost } from './post.js';
import { KLAR } from './lightpatch.js';
import { reapply } from './look.js';

export const TIERS = ['fancy', 'cozy', 'fast'];
export const LABEL = { fancy:'Fancy', cozy:'Cozy', fast:'Fast' };
export const ICON = { fancy:'✨', cozy:'🌿', fast:'⚡' };
const KEY = 'klarbase.v2.quality';
// dpr = pixel-ratio cap, shadow = map size, taps = [blocker search, PCF] for the soft sun shadow
const SPEC = {
  fancy:{ dpr:1.5,  shadow:2048, taps:[12, 16] },
  cozy: { dpr:1.25, shadow:2048, taps:[8, 10] },
  fast: { dpr:1.5,  shadow:1024, taps:[4, 6] },
};

const read = () => { try { const v = JSON.parse(localStorage.getItem(KEY)); return TIERS.includes(v) ? v : null; } catch { return null; } };
const save = v => { try { v ? localStorage.setItem(KEY, JSON.stringify(v)) : localStorage.removeItem(KEY); } catch {} };

// Half-float HDR targets need EXT_color_buffer_float (or _half_float) — without them: fast.
function canHDR(r){ try { return r.capabilities.isWebGL2 && (r.extensions.has('EXT_color_buffer_float') || r.extensions.has('EXT_color_buffer_half_float')); } catch { return false; } }
function autoPick(r){
  if(!canHDR(r)) return 'fast';
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer:coarse)').matches;
  const small = Math.min(innerWidth, innerHeight) < 820;
  return coarse || ((devicePixelRatio || 1) > 2 && small) ? 'cozy' : 'fancy';
}

function apply(world, tier){
  const S = SPEC[tier], r = world.renderer, sh = world.sun.shadow;
  world.tier = tier;
  r.setPixelRatio(Math.min(devicePixelRatio || 1, S.dpr));
  if(sh.mapSize.x !== S.shadow){ sh.mapSize.set(S.shadow, S.shadow); if(sh.map){ sh.map.dispose(); sh.map = null; } }
  KLAR.shq.value.x = S.taps[0]; KLAR.shq.value.y = S.taps[1];
  if(tier === 'fast'){ if(world.post){ world.post.dispose(); world.post = null; } }
  else if(!world.post) world.post = createPost(r, world.scene, world.camera, { quality:tier });
  else world.post.setQuality(tier);
  world.resize();            // canvas + post targets at the new pixel ratio
  reapply(world);            // the glow boost depends on whether the chain is on
}

export function initQuality(world){
  const forced = (() => { try { const v = new URLSearchParams(location.search).get('quality'); return TIERS.includes(v) ? v : null; } catch { return null; } })();
  const stored = read();
  let chosen = forced || stored || autoPick(world.renderer);       // what the player / device asked for
  let explicit = !!(forced || stored);
  let cap = null;                                                   // e.g. the builder never runs above 'cozy'
  let current = null, win = 0, sum = 0, n = 0, warm = 2;
  const effective = () => cap && TIERS.indexOf(cap) > TIERS.indexOf(chosen) ? cap : chosen;
  const sync = () => {
    const t = effective(); if(t === current) return;
    current = t; win = sum = n = 0; warm = 2; apply(world, t); q.onChange && q.onChange(t);
  };
  const q = {
    onChange:null,
    get tier(){ return current; },
    get chosen(){ return chosen; },
    get explicit(){ return explicit; },
    // an explicit player choice: persisted, and it switches the auto-drop off
    set(t, { persist = true } = {}){ if(!TIERS.includes(t)) return; chosen = t; explicit = true; if(persist) save(t); sync(); },
    cycle(){ q.set(TIERS[(TIERS.indexOf(effective()) + 1) % TIERS.length]); return current; },
    setCap(c){ cap = TIERS.includes(c) ? c : null; sync(); },
    // called once a frame with the raw frame time (s)
    tick(dt){
      if(explicit || document.hidden || dt > 0.25) return;           // a background tab / hitch is not "slow"
      if(warm > 0){ warm -= dt; return; }                            // shader compiles, first-frame uploads
      sum += dt; n++; win += dt;
      if(win < 3) return;
      const avg = sum / n; win = sum = n = 0;
      if(avg > 0.022 && TIERS.indexOf(chosen) < TIERS.length - 1){
        chosen = TIERS[TIERS.indexOf(chosen) + 1]; explicit = true;  // drop one tier, once (not persisted: next visit re-picks)
        sync();
      }
    },
  };
  world.quality = q;
  sync();
  return q;
}
