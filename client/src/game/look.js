// The look: the ONLY writer of look tunables (visual finesse pass). Every theme has a
// DAY and a NIGHT grade — light rig, fog, sky, shadow leak and the post grade — and
// `applyLook` blends any mix of them (in linear RGB) into the world:
//
//     applyLook(world, { jungle:0.7, oasis:0.3 }, nightAmount)     // 0 = day … 1 = night
//
// Play mode calls it with one theme at weight 1 and night = (theme === 'night').
// The endless MAP mode will feed it blended biome weights and a day/night clock — the
// signature stays exactly this. Readers (post.js, lightpatch.js uniforms) only look at
// `OUT`, the blended result; nothing else in the client writes lights, fog or grade.
//
// DAY starts from each theme's themes.js values (nothing regresses); the overrides below
// are the tuning: warmer key, softer contrast, a mood per theme. Tune live from the
// console: edit GRADE.oasis.day.post.exposure = 1.1; __klar.look.rebuild().
// Technique after papertrails (MIT, github.com/xikhar/papertrails) biomegrade/daynight.
import * as THREE from 'three';
import { THEMES } from './themes.js';
import { KLAR } from './lightpatch.js';

/* ---------------- the grades ---------------- */
// Colours are sRGB hex strings; [n,n,n] arrays are raw linear vectors (leak, tint, sun dir).
const baseOf = id => { const T = THEMES[id]; return {
  sun:{ color:T.sun.color, intensity:T.sun.intensity, dir:[...T.sun.dir] },
  hemi:{ sky:T.hemi.sky, ground:T.hemi.ground, intensity:T.hemi.intensity },
  fill:{ color:'#9fb6ff', intensity:0.35 },
  fog:{ color:T.fog, near:1.4, far:4.5 },             // near/far × camera distance
  sky:{ top:T.sky[0], mid:T.sky[1], bot:T.sky[2] },
  wrap:0.25,                                         // soft terminator (lightpatch)
  leak:[0.12, 0.09, 0.05],                           // sun-colour fraction bleeding into shadow
  soft:0.2,                                          // penumbra growth per unit of blocker distance
  glow:1.6,                                          // HDR boost of glowing materials (bloom only)
  post:{
    exposure:1.0, contrast:1.0, saturation:1.0, tint:[1, 1, 1],          // tint = white balance
    shadowTint:'#10182c', shadowLift:0.02, vignette:0.18, bloom:0.3, grain:0.018,
    ao:0.9, aoTint:'#1c2230',
    dofBand:0.22, dofRamp:0.36, dofDepth:0.6, dofMax:8,                 // tilt-shift: sharp half-band, blur ramp (frame heights), depth share, px @1080p
  },
}; };

const merge = (a, b) => { for(const [k, v] of Object.entries(b)){
  if(v && typeof v === 'object' && !Array.isArray(v)) merge(a[k] || (a[k] = {}), v); else a[k] = Array.isArray(v) ? [...v] : v;
} return a; };
const grade = (id, over = {}) => merge(baseOf(id), over);

// shared by every theme's night (the night theme is its own day)
const NIGHT = {
  sun:{ color:'#a9bcff', intensity:1.2, dir:[-0.4, 1, 0.35] },
  hemi:{ sky:'#8a9cf0', ground:'#1a1838', intensity:0.9 },
  fill:{ color:'#6f8cff', intensity:0.3 },
  fog:{ color:'#26306a', near:1.1, far:4.0 },
  sky:{ top:'#070b24', mid:'#22306a', bot:'#4a4486' },
  leak:[0.05, 0.07, 0.17], glow:3.0, soft:0.24,
  post:{ exposure:0.97, saturation:0.82, tint:[0.92, 0.98, 1.1], shadowTint:'#080e30', shadowLift:0.03, vignette:0.28, bloom:0.55, grain:0.022, aoTint:'#0a1030' },
};
const night = (id, over = {}) => merge(merge(baseOf(id), NIGHT), over);

export const GRADE = {
  jungle: {
    day:grade('jungle', {
      sun:{ color:'#ffeab8' }, leak:[0.11, 0.10, 0.05],
      post:{ contrast:0.97, saturation:1.05, tint:[1.02, 1.0, 0.97], shadowTint:'#0e2a28', vignette:0.2, bloom:0.28, ao:0.95, aoTint:'#18301c' },
    }),
    night:night('jungle', { post:{ saturation:0.86 } }),
  },
  oasis: {                      // hot and hazy
    day:grade('oasis', {
      sun:{ color:'#ffcc90' }, fill:{ color:'#e8b3a0', intensity:0.3 }, fog:{ near:0.9, far:3.3 },
      leak:[0.20, 0.12, 0.06], soft:0.28,
      post:{ exposure:1.04, contrast:0.98, saturation:1.02, tint:[1.05, 1.0, 0.92], shadowTint:'#34182a', bloom:0.42, vignette:0.2 },
    }),
    night:night('oasis', { sky:{ mid:'#3a2f6e', bot:'#6a4a7e' }, post:{ tint:[0.96, 0.96, 1.06] } }),
  },
  tropical: {                   // saturated teal
    day:grade('tropical', {
      sun:{ color:'#fff2d2' }, fill:{ color:'#9fe0ff', intensity:0.4 }, fog:{ near:1.5, far:5.0 },
      leak:[0.09, 0.12, 0.12],
      post:{ exposure:1.02, contrast:0.98, saturation:1.16, tint:[0.99, 1.01, 1.03], shadowTint:'#082a3c', bloom:0.3, aoTint:'#102a36' },
    }),
    night:night('tropical', { post:{ saturation:0.9 } }),
  },
  urban: {                      // dusk, warm windows
    day:grade('urban', {
      sun:{ color:'#ffbc8c' }, fill:{ color:'#ffa0b8', intensity:0.3 }, fog:{ near:1.3, far:4.2 },
      leak:[0.17, 0.09, 0.08], glow:2.4,
      post:{ exposure:0.99, tint:[1.04, 0.99, 0.96], shadowTint:'#2a1236', bloom:0.4, vignette:0.24 },
    }),
    night:night('urban', { glow:3.8, sky:{ bot:'#6a3a6a' }, post:{ bloom:0.68 } }),
  },
  mountain: {                   // cool and crisp
    day:grade('mountain', {
      sun:{ color:'#fffaf0' }, fill:{ color:'#a8c4ff', intensity:0.4 }, fog:{ near:1.7, far:5.6 },
      leak:[0.09, 0.11, 0.16], wrap:0.2, soft:0.14,
      post:{ contrast:1.05, saturation:0.97, tint:[0.98, 1.0, 1.04], shadowTint:'#0c1c3a', bloom:0.2, vignette:0.15 },
    }),
    night:night('mountain', { post:{ saturation:0.8 } }),
  },
  night: {                      // navy moonlight, warm lantern glow
    day:grade('night', {
      fill:{ color:'#8a9cff', intensity:0.3 }, leak:[0.05, 0.07, 0.17], glow:3.0, soft:0.24,
      post:{ exposure:0.98, contrast:1.02, saturation:0.85, tint:[0.92, 0.98, 1.1], shadowTint:'#080e30', shadowLift:0.03, vignette:0.28, bloom:0.55, grain:0.022, aoTint:'#0a1030' },
    }),
    night:null,                 // filled below: the night theme is its own night
  },
};
GRADE.night.night = merge({}, GRADE.night.day);

/* ---------------- compile: grades -> flat float buffers ---------------- */
// Every leaf is 1 float (number) or 3 floats (colour / vector); blending is then plain
// array arithmetic and never allocates, so map mode can call applyLook every frame.
const isColour = v => typeof v === 'string';
const flat = (o, pre = '', out = {}) => { for(const [k, v] of Object.entries(o)){ const p = pre ? pre + '.' + k : k; if(v && typeof v === 'object' && !Array.isArray(v)) flat(v, p, out); else out[p] = v; } return out; };

export const OUT = {};                 // the blended look: OUT.sun.color (Color), OUT.post.exposure (number), OUT.leak ([r,g,b]) …
let LAYOUT = [], N = 0, PACK = {};
const tmpC = new THREE.Color();

export function rebuild(){
  const ref = flat(GRADE.jungle.day);
  LAYOUT = []; N = 0;
  for(const [key, v] of Object.entries(ref)){
    const type = isColour(v) ? 'c' : Array.isArray(v) ? 'v' : 'n', len = type === 'n' ? 1 : 3;
    const path = key.split('.'); let o = OUT;                   // build / reuse OUT's matching leaf holder
    for(let i = 0; i < path.length - 1; i++) o = o[path[i]] || (o[path[i]] = {});
    const last = path[path.length - 1];
    if(type === 'c' && !(o[last] instanceof THREE.Color)) o[last] = new THREE.Color();
    if(type === 'v' && !Array.isArray(o[last])) o[last] = [0, 0, 0];
    if(type === 'n' && typeof o[last] !== 'number') o[last] = 0;
    LAYOUT.push({ key, type, off:N, len, o, last }); N += len;
  }
  PACK = {};
  for(const [id, g] of Object.entries(GRADE)) PACK[id] = { day:pack(g.day), night:pack(g.night || g.day) };
  if(world_) reapply(world_);
}
function pack(g){
  const f = flat(g), out = new Float32Array(N);
  for(const L of LAYOUT){
    const v = f[L.key];
    if(L.type === 'n') out[L.off] = v;
    else if(L.type === 'c'){ tmpC.set(v); out[L.off] = tmpC.r; out[L.off + 1] = tmpC.g; out[L.off + 2] = tmpC.b; }   // Color.set converts sRGB -> linear working space
    else { out[L.off] = v[0]; out[L.off + 1] = v[1]; out[L.off + 2] = v[2]; }
  }
  return out;
}

const buf = () => new Float32Array(N);
let acc = null;
let world_ = null;                     // last world applyLook was called with (for reapply)

/* ---------------- apply ---------------- */
// weights: { themeId: weight } (any positive numbers; normalised here). nightAmount 0..1.
export function applyLook(world, weights, nightAmount = 0){
  world_ = world;
  if(!acc || acc.length !== N) acc = buf();
  acc.fill(0);
  let sum = 0;
  for(const id in weights) if(weights[id] > 0 && PACK[id]) sum += weights[id];
  if(!(sum > 0)){ weights = { jungle:1 }; sum = 1; }
  const n = Math.min(1, Math.max(0, nightAmount));
  for(const id in weights){
    const w = weights[id]; if(!(w > 0) || !PACK[id]) continue;
    const a = w / sum * (1 - n), b = w / sum * n, d = PACK[id].day, g = PACK[id].night;
    for(let i = 0; i < N; i++) acc[i] += a * d[i] + b * g[i];
  }
  for(const L of LAYOUT){
    if(L.type === 'n') L.o[L.last] = acc[L.off];
    else if(L.type === 'c') L.o[L.last].setRGB(acc[L.off], acc[L.off + 1], acc[L.off + 2]);
    else { const v = L.o[L.last]; v[0] = acc[L.off]; v[1] = acc[L.off + 1]; v[2] = acc[L.off + 2]; }
  }
  write(world);
  world._look = { weights, night:nightAmount };
}
export const reapply = world => { if(world && world._look) applyLook(world, world._look.weights, world._look.night); };

function write(w){
  const O = OUT;
  w.hemi.color.copy(O.hemi.sky); w.hemi.groundColor.copy(O.hemi.ground); w.hemi.intensity = O.hemi.intensity;
  w.sun.color.copy(O.sun.color); w.sun.intensity = O.sun.intensity;
  w.sunDir.set(O.sun.dir[0], O.sun.dir[1], O.sun.dir[2]).normalize();
  w.fill.color.copy(O.fill.color); w.fill.intensity = O.fill.intensity;
  w.scene.fog.color.copy(O.fog.color); w.fogK[0] = O.fog.near; w.fogK[1] = O.fog.far; w.applyFog();
  // The sky dome is unlit and not tone-mapped: its colours are shown as-is (that raw look is the
  // established one). With the post chain on, pre-compensate them so the chain lands on the same pixels.
  const sk = w.skyMat.uniforms;
  sk.top.value.copy(O.sky.top); sk.mid.value.copy(O.sky.mid); sk.bot.value.copy(O.sky.bot);
  sk.useLut.value = w.post ? 1 : 0;
  if(w.post) for(let k = 0; k < 17; k++){        // the gradient mixed in display space, then inverted stop by stop
    const s = k / 16, u = Math.abs(s - 0.5) * 2, A = s < 0.5 ? O.sky.bot : O.sky.top, M = O.sky.mid;
    inverseChain(M.r + (A.r - M.r) * u, M.g + (A.g - M.g) * u, M.b + (A.b - M.b) * u, sk.lut.value[k]);
  }
  KLAR.wrap.value = O.wrap;
  KLAR.leak.value.set(O.leak[0], O.leak[1], O.leak[2]);
  KLAR.sun.value.z = O.soft;
  KLAR.glow.value = w.post ? O.glow : 1;            // the boost only makes sense while bloom is on
}

/* ---------------- sky pre-compensation (JS mirror of post.js's final pass) ---------------- */
const RRT = v => { const a = v * (v + 0.0245786) - 0.000090537, b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; };
const clamp01 = v => Math.min(1, Math.max(0, v));
const sRGB = c => c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
const _x = [0, 0, 0], _got = [0, 0, 0], _want = [0, 0, 0];
function chain(x, P, out){                          // linear scene colour -> display (no vignette / grain / lift)
  const r = x[0] * P.exposure * P.tint[0] / 0.6, g = x[1] * P.exposure * P.tint[1] / 0.6, b = x[2] * P.exposure * P.tint[2] / 0.6;
  const ir = RRT(0.59719 * r + 0.35458 * g + 0.04823 * b), ig = RRT(0.07600 * r + 0.90834 * g + 0.01566 * b), ib = RRT(0.02840 * r + 0.13383 * g + 0.83777 * b);
  const tr = clamp01(1.60475 * ir - 0.53108 * ig - 0.07367 * ib), tg = clamp01(-0.10208 * ir + 1.10813 * ig - 0.00605 * ib), tb = clamp01(-0.00327 * ir - 0.07276 * ig + 1.07602 * ib);
  const l = 0.2126 * tr + 0.7152 * tg + 0.0722 * tb, s = P.saturation, k = P.contrast;
  out[0] = (sRGB(Math.max(0, l + (tr - l) * s)) - 0.42) * k + 0.42;
  out[1] = (sRGB(Math.max(0, l + (tg - l) * s)) - 0.42) * k + 0.42;
  out[2] = (sRGB(Math.max(0, l + (tb - l) * s)) - 0.42) * k + 0.42;
}
// The scene colour that the chain turns into (r, g, b) read as display values.
function inverseChain(r, g, b, out){
  const P = OUT.post; _want[0] = r; _want[1] = g; _want[2] = b;
  _x[0] = _x[1] = _x[2] = 0.1;
  for(let it = 0; it < 28; it++){
    chain(_x, P, _got);
    for(let i = 0; i < 3; i++) _x[i] = Math.min(8, Math.max(1e-5, _x[i] * Math.pow((_want[i] + 0.02) / (Math.max(_got[i], -0.015) + 0.02), 0.8)));
  }
  out.set(_x[0], _x[1], _x[2]);
}

rebuild();
export const LOOK = { GRADE, OUT, applyLook, reapply, rebuild };
