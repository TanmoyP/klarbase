// Builder thumbnails: one prop, rendered in its theme, so the palette shows what
// a tile becomes there (a Lagoon tree is a palm, a Rooftops rock is a house).
// Drawn on the World's own renderer into a small target — no second WebGL
// context — and cached per theme + kind as { url, canvas }.
import * as THREE from 'three';
import { makeTree, makeRock, makeFlora, makeKit } from './biome.js';
import { rng, makeCrate, makePile, makeBoulder, makeThorn, makePost, makeBuoy, makeSeed } from './props.js';

const PX = 128;
// Render targets skip tone mapping, so the lights are scaled by K (keeps the
// 8-bit target out of clipping) and ACES is applied on the CPU after readback.
const K = 0.5;
const YAW = 0.62, EL = 0.5;             // a 3/4 view, close to the game camera's
const WHITE = new THREE.Color('#ffffff');

// kind = the palette tool id whose look follows the theme (boulder ↕ shares ↔)
const BUILD = {
  'T':(T, r, kit) => makeTree(T, r, kit),
  '#':(T, r, kit) => makeRock(T, r, kit),
  ',':(T, r, kit) => makeFlora(T, r, kit),
  'C':T => makeCrate(T),
  'P':(T, r) => makePile(T, r),
  'H':T => makeBoulder(T),
  'Y':T => makeThorn(T, 1),
  'B':T => makePost(T),
  'u':T => makeBuoy(T),
  '+':T => makeSeed(T),
};
export const thumbKind = tool => tool === 'I' ? 'H' : BUILD[tool] ? tool : null;

const cache = new Map();
let rt = null, scene, cam, hemi, sun, fill, buf, lut;

function setup(){
  rt = new THREE.WebGLRenderTarget(PX, PX, { samples:4, colorSpace:THREE.SRGBColorSpace });
  scene = new THREE.Scene();
  cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 40);
  hemi = new THREE.HemisphereLight(); sun = new THREE.DirectionalLight(); fill = new THREE.DirectionalLight('#9fb6ff');
  scene.add(hemi, sun, sun.target, fill);
  buf = new Uint8Array(PX * PX * 4);
  lut = new Float32Array(256);
  for(let i = 0; i < 256; i++){ const v = i / 255; lut[i] = v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
}

// three's ACESFilmicToneMapping, per channel triple (linear in, linear out)
const fit = v => (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.432951) + 0.238081);
const enc = v => { v = Math.min(1, Math.max(0, v)); return 255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055) + 0.5 | 0; };

export function propThumb(renderer, T, kind){
  const key = T.id + kind;
  if(cache.has(key)) return cache.get(key);
  let out = null;
  try { out = render(renderer, T, kind); } catch(e){ if(import.meta.env.DEV) console.warn('[klarbase] thumb failed', kind, e); }
  if(out) cache.set(key, out);
  return out;
}

function render(renderer, T, kind){
  if(!BUILD[kind] || renderer.getContext().isContextLost()) return null;
  if(!rt) setup();
  // a throwaway kit and cloned materials: lit-free colours get scaled by K below,
  // and nothing the game shares is ever touched
  const kit = makeKit(), obj = BUILD[kind](T, rng(1234 + kind.charCodeAt(0)), kit), mats = [];
  obj.traverse(o => {
    if(!o.material) return;
    o.material = Array.isArray(o.material) ? o.material.map(m => m.clone()) : o.material.clone();
    for(const m of Array.isArray(o.material) ? o.material : [o.material]){
      if(m.isMeshBasicMaterial) m.color.multiplyScalar(K);
      if(m.emissive) m.emissiveIntensity *= K;
      mats.push(m);
    }
  });
  scene.add(obj); obj.updateMatrixWorld(true);

  // frame the prop's exact silhouette in an orthographic 3/4 view
  const box = new THREE.Box3().setFromObject(obj, true), centre = box.getCenter(new THREE.Vector3());
  const dir = new THREE.Vector3(Math.sin(YAW) * Math.cos(EL), Math.sin(EL), Math.cos(YAW) * Math.cos(EL));
  cam.position.copy(centre).addScaledVector(dir, 10); cam.lookAt(centre); cam.updateMatrixWorld();
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  const v = new THREE.Vector3();
  for(let i = 0; i < 8; i++){
    v.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).applyMatrix4(cam.matrixWorldInverse);
    x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y);
  }
  const half = Math.max(x1 - x0, y1 - y0) / 2 * 1.06, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  Object.assign(cam, { left:cx - half, right:cx + half, top:cy + half, bottom:cy - half }); cam.updateProjectionMatrix();

  // the theme's light, a little lifted (dusk themes would read as silhouettes on
  // the pale panel), with a key from front-left so every prop reads
  hemi.color.set(T.hemi.sky); hemi.groundColor.set(T.hemi.ground); hemi.intensity = Math.max(1.05, T.hemi.intensity) * K;
  sun.color.set(T.sun.color).lerp(WHITE, 0.3); sun.intensity = Math.max(2.2, T.sun.intensity) * K; fill.intensity = 0.35 * K;
  sun.position.copy(centre).add(new THREE.Vector3(-0.35, 1, 0.75).multiplyScalar(10)); sun.target.position.copy(centre);
  fill.position.copy(centre).add(new THREE.Vector3(6, 3, -6));

  const prev = renderer.getRenderTarget(), clear = renderer.getClearColor(new THREE.Color()), alpha = renderer.getClearAlpha();
  renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.clear();
  renderer.render(scene, cam);
  renderer.readRenderTargetPixels(rt, 0, 0, PX, PX, buf);
  renderer.setRenderTarget(prev); renderer.setClearColor(clear, alpha);

  scene.remove(obj);
  obj.traverse(o => { if(o.geometry && !o.geometry.userData.keep) o.geometry.dispose(); });
  for(const m of mats) m.dispose();

  // readback is bottom-up, premultiplied by coverage at the edges, sRGB-encoded
  const c = document.createElement('canvas'); c.width = c.height = PX;
  const g = c.getContext('2d'), img = g.createImageData(PX, PX), d = img.data, ex = renderer.toneMappingExposure / (0.6 * K);
  for(let y = 0; y < PX; y++) for(let x = 0; x < PX; x++){
    const s = ((PX - 1 - y) * PX + x) * 4, o = (y * PX + x) * 4, a = buf[s + 3];
    if(!a) continue;
    const k = ex * 255 / a, r = lut[buf[s]] * k, gg = lut[buf[s + 1]] * k, b = lut[buf[s + 2]] * k;
    const fr = fit(0.59719 * r + 0.35458 * gg + 0.04823 * b), fg = fit(0.076 * r + 0.90834 * gg + 0.01566 * b), fb = fit(0.0284 * r + 0.13383 * gg + 0.83777 * b);
    d[o] = enc(1.60475 * fr - 0.53108 * fg - 0.07367 * fb);
    d[o + 1] = enc(-0.10208 * fr + 1.10813 * fg - 0.00605 * fb);
    d[o + 2] = enc(-0.00327 * fr - 0.07276 * fg + 1.07602 * fb);
    d[o + 3] = a;
  }
  g.putImageData(img, 0, 0);
  return { url:c.toDataURL('image/png'), canvas:c };
}
