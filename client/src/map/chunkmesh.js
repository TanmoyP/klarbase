// One Sky Atlas chunk -> meshes. A generator: it `yield`s between units of work (one isle's terrain, one
// isle's props, each merge ...) so the streamer can spread a chunk over frames (about 4 ms budget per frame).
//
// Art is the game's own: each isle (one 8x8 quadrant of the chunk) goes through `buildTerrain` - strata
// columns, hanging keels, rim vines, crystals, water, waterfalls - and the biome builders (`makeTree`,
// `makeRock`, `makeFlora`, `makeScatter`) with the isle's theme, so biomes read like the game's chapters.
// Overworld-only cells are adapted: `shrine` -> ground (the arch is a prop), `bridge` -> void in the
// terrain (a rope-and-plank span is drawn separately, below).
//
// Draw calls are kept low by MERGING: every mesh buildTerrain makes is merged per material signature across
// the chunk's isles (about 8-10 meshes per chunk); scatter is merged per kit material; trees / rocks / flora /
// shrines become InstancedMeshes (one per cached geometry - the cached variants are shared by every chunk).
// Props pop in on their own small springs (`pop`) via per-instance matrices after the chunk has landed.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CHUNK, ATLAS_SEED, cellAt, chunkCached } from '@klar/core';
import { buildTerrain, LV, rng, hashStr, HEMP } from '../game/props.js';
import { makeTree, makeRock, makeFlora, makeScatter } from '../game/biome.js';
import { themeOf } from '../game/themes.js';
import { tint, bake, soften } from '../game/softkit.js';
import { shrineStone } from './shrines.js';
import { pop } from './spring.js';

// materials that look the same share one mesh per chunk
const sig = m => [m.type, m.color && m.color.getHex(), m.emissive && m.emissive.getHex(), m.emissiveIntensity, m.vertexColors, m.flatShading,
  m.roughness, m.metalness, m.transparent, m.opacity, m.map && m.map.uuid, m.side, m.depthWrite, m.blending, m.fog].join('|');

// merge geometries transformed by their matrices; attribute sets are reduced to what they all share
function mergeParts(parts){
  let geos = parts.map(p => { const g = p.geo.clone(); g.applyMatrix4(p.m); return g; });
  if(!geos.every(g => !!g.index === !!geos[0].index)) geos = geos.map(g => g.index ? g.toNonIndexed() : g);
  const common = Object.keys(geos[0].attributes).filter(k => geos.every(g => g.attributes[k]));
  for(const g of geos) for(const k of Object.keys(g.attributes)) if(!common.includes(k)) g.deleteAttribute(k);
  const out = geos.length === 1 ? geos[0] : mergeGeometries(geos);
  if(geos.length > 1) for(const g of geos) g.dispose();
  return out;
}

// A rope-and-plank span: 5 planks per bridge tile, a hemp rope each side on posts at the span's ends.
function bridgeGeometry(data){
  const parts = [], X0 = data.cx * CHUNK, Z0 = data.cz * CHUNK;
  const isBridge = (x, z) => cellAt(ATLAS_SEED, x, z).kind === 'bridge';
  const box = (w, h, d, x, y, z, hex, o) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); parts.push(tint(soften(g, 0.35), hex, o)); };
  for(const b of data.bridges){
    const T = themeOf(data.cells[(b.z - Z0) * CHUNK + (b.x - X0)].theme), lx = b.x - X0, lz = b.z - Z0, y = b.h * LV - 0.04, east = b.axis === 'E';
    for(let i = 0; i < 5; i++){
      const o = -0.4 + i * 0.2, w = 0.17, l = 0.98, hex = i % 2 ? T.wood : T.woodDark;
      if(east) box(w, 0.07, l, lx + o, y - 0.035, lz, hex, { lo:0.8, hi:1.02 }); else box(l, 0.07, w, lx, y - 0.035, lz + o, hex, { lo:0.8, hi:1.02 });
    }
    for(const s of [-1, 1]){
      if(east) box(1.0, 0.035, 0.035, lx, y + 0.2, lz + s * 0.44, HEMP, { lo:0.8, hi:1.05 }); else box(0.035, 0.035, 1.0, lx + s * 0.44, y + 0.2, lz, HEMP, { lo:0.8, hi:1.05 });
      for(const e of [-1, 1]){                                               // posts where the span ends (the next tile is not a bridge)
        if(isBridge(b.x + (east ? e : 0), b.z + (east ? 0 : e))) continue;
        if(east) box(0.06, 0.34, 0.06, lx + e * 0.47, y + 0.1, lz + s * 0.44, T.woodDark, { lo:0.6, hi:1 }); else box(0.06, 0.34, 0.06, lx + s * 0.44, y + 0.1, lz + e * 0.47, T.woodDark, { lo:0.6, hi:1 });
      }
    }
  }
  return parts.length ? bake(parts) : null;
}

/*
 * buildChunk(cx, cz, env) - a generator; its return value is the chunk:
 *   { cx, cz, group, shrines:[{x,z,y,theme,accent}], materials, animated, pop(age), setFade(f), dispose(), stats }
 * env = { kit:{solid,glow} (shared, never disposed here), onUse(geo) }
 */
export function* buildChunk(cx, cz, env){
  const data = chunkCached(ATLAS_SEED, cx, cz), X0 = cx * CHUNK, Z0 = cz * CHUNK, kit = env.kit;
  const terr = [], scat = { solid:[], glow:[] }, inst = new Map(), shrines = [], animated = [];
  const t0 = performance.now();

  // The overworld is not aligned to chunks (isles are up to 80+ tiles, necks fuse isles), so a chunk is built in
  // four 8x8 sub-rectangles x the themes in them. Each job sees a PADded window of real neighbour cells: they
  // count as neighbours (no fake rims at the cut) but are not emitted (own()) - every tile belongs to exactly one
  // job, so chunks never overlap. Keels follow the distance to open sky, a global quantity, so they agree at seams.
  const PAD = 6, SUB = 8, WIN = SUB + 2 * PAD;
  for(let sz = 0; sz < 2; sz++) for(let sx = 0; sx < 2; sx++){
    const wx0 = X0 + sx * SUB - PAD, wz0 = Z0 + sz * SUB - PAD;
    const real = new Array(WIN * WIN), cells = new Array(WIN * WIN), dist = new Int8Array(WIN * WIN).fill(PAD), q = [];
    const owned = (x, z) => x >= PAD && x < PAD + SUB && z >= PAD && z < PAD + SUB;
    const themes = new Set();
    for(let z = 0; z < WIN; z++) for(let x = 0; x < WIN; x++){
      const gx = wx0 + x, gz = wz0 + z, c = gx >= X0 && gx < X0 + CHUNK && gz >= Z0 && gz < Z0 + CHUNK ? data.cells[(gz - Z0) * CHUNK + gx - X0] : cellAt(ATLAS_SEED, gx, gz);
      real[z * WIN + x] = c;
      const sky = c.kind === 'void' || c.kind === 'bridge';
      cells[z * WIN + x] = sky ? { kind:'void', h:0, ch:'-' } : c.kind === 'shrine' ? { kind:'ground', h:c.h, ch:'S' } : c;
      if(sky){ dist[z * WIN + x] = 0; q.push(z * WIN + x); } else if(owned(x, z)) themes.add(c.theme);
    }
    if(!themes.size) continue;
    for(let h = 0; h < q.length; h++){                                    // distance to open sky, capped at PAD
      const i = q[h], x = i % WIN, z = (i / WIN) | 0, d = dist[i];
      if(d >= PAD - 1) continue;
      for(const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]){
        const nx = x + dx, nz = z + dz; if(nx < 0 || nz < 0 || nx >= WIN || nz >= WIN) continue;
        const j = nz * WIN + nx; if(dist[j] > d + 1){ dist[j] = d + 1; q.push(j); }
      }
    }
    const keel = (x, z) => 0.35 + Math.min(1, dist[z * WIN + x] / PAD) * 2.4;
    const off = new THREE.Vector3(wx0 - X0 + (WIN - 1) / 2, 0, wz0 - Z0 + (WIN - 1) / 2);

    for(const id of themes){
      const T = themeOf(id), mine = (x, z) => owned(x, z) && real[z * WIN + x].theme === id;
      // 1. terrain (the game's own builder)
      const tr = buildTerrain({ w:WIN, h:WIN, cells }, T, { own:mine, keel });
      tr.group.position.copy(off); tr.group.updateMatrixWorld(true);
      for(const m of tr.group.children) terr.push({ geo:m.geometry, m:m.matrixWorld.clone(), mat:m.material, cast:m.castShadow, recv:m.receiveShadow });
      animated.push(...tr.animated);
      yield;

      // 2. props: trees, rocks, flora, shrines -> instance records; ground scatter -> merged
      for(let z = PAD; z < PAD + SUB; z++) for(let x = PAD; x < PAD + SUB; x++){
        if(!mine(x, z)) continue;
        const c = cells[z * WIN + x], rl = real[z * WIN + x];
        if(c.kind === 'void') continue;
        const gx = wx0 + x, gz = wz0 + z, lx = gx - X0, lz = gz - Z0;
        const rc = rng(hashStr(`${T.id}:${c.ch}:${gx},${gz}`)), base = new THREE.Vector3(lx, c.h * LV, lz), delay = 0.5 + rc() * 0.5;
        const put = g => {
          g.updateMatrixWorld(true);
          g.traverse(o => {
            if(!o.isMesh) return;
            const glow = o.material === kit.glow, key = o.geometry.uuid + (glow ? 'g' : 's') + (o.castShadow ? 'c' : '');
            let L = inst.get(key); if(!L) inst.set(key, L = { geo:o.geometry, mat:glow ? kit.glow : kit.solid, cast:o.castShadow, items:[] });
            L.items.push({ base, local:o.matrixWorld.clone(), delay });
          });
        };
        if(c.kind === 'rock') put(makeRock(T, rc, kit));
        else if(c.kind === 'tree') put(makeTree(T, rc, kit));
        else if(rl.flora) put(makeFlora(T, rc, kit));
        if(rl.kind === 'shrine'){
          const S = shrineStone(T), d2 = 0.3 + rc() * 0.2;
          for(const [geo, mat] of [[S.solid, kit.solid], [S.glow, kit.glow]]){
            const key = geo.uuid + (mat === kit.glow ? 'g' : 's') + 'c'; let L = inst.get(key);
            if(!L) inst.set(key, L = { geo, mat, cast:mat === kit.solid, items:[] });
            L.items.push({ base, local:new THREE.Matrix4(), delay:d2 });
          }
          shrines.push({ x:gx, z:gz, y:rl.h * LV, lx, lz, theme:rl.theme, accent:T.accent });
        }
      }
      // scatter sees only this job's tiles as ground ('x' = a neighbour: solid, but no tufts of its own)
      const sc = makeScatter({ w:WIN, h:WIN, cells:cells.map((c, i) => c.kind === 'void' || mine(i % WIN, (i / WIN) | 0) ? c : { ...c, ch:'x' }) }, T, [(WIN - 1) / 2, (WIN - 1) / 2], kit);
      if(sc){
        sc.position.copy(off); sc.updateMatrixWorld(true);
        for(const m of sc.children) scat[m.material === kit.glow ? 'glow' : 'solid'].push({ geo:m.geometry, m:m.matrixWorld.clone() });
      }
      yield;
    }
  }

  // 3. bridges
  const bridgeGeo = data.bridges.length ? bridgeGeometry(data) : null;
  yield;

  // 4. assemble. Terrain: merge by material signature (the first material is kept, duplicates are freed).
  const group = new THREE.Group(), materials = [], disposables = [], bySig = new Map();
  for(const p of terr){
    const k = sig(p.mat); let L = bySig.get(k);
    if(!L) bySig.set(k, L = { mat:p.mat, parts:[], cast:p.cast, recv:p.recv });
    L.parts.push(p); if(L.mat !== p.mat) p.mat.dispose();
  }
  for(const L of bySig.values()){
    const geo = mergeParts(L.parts);
    for(const p of L.parts) p.geo.dispose();
    const mesh = new THREE.Mesh(geo, L.mat); mesh.castShadow = L.cast; mesh.receiveShadow = L.recv; mesh.matrixAutoUpdate = false;
    if(L.mat.transparent) mesh.renderOrder = 1;
    L.mat.userData.o0 = { t:L.mat.transparent, o:L.mat.opacity, d:L.mat.depthWrite };
    group.add(mesh); materials.push(L.mat); disposables.push(geo);
  }
  yield;
  for(const shape of ['solid', 'glow']){
    if(!scat[shape].length) continue;
    const geo = mergeParts(scat[shape]); for(const p of scat[shape]) p.geo.dispose();
    const mesh = new THREE.Mesh(geo, kit[shape]); mesh.castShadow = false; mesh.receiveShadow = shape === 'solid'; mesh.matrixAutoUpdate = false;
    group.add(mesh); disposables.push(geo);
  }
  if(bridgeGeo){ const mesh = new THREE.Mesh(bridgeGeo, kit.solid); mesh.castShadow = true; mesh.receiveShadow = true; mesh.matrixAutoUpdate = false; group.add(mesh); disposables.push(bridgeGeo); }

  // props: one InstancedMesh per cached geometry. Matrices are first set to the final pose (so the bounding
  // sphere is right), then `popAge(age)` scales each instance about its own foot on its own spring.
  const pops = [], used = new Set(), S = new THREE.Matrix4(), M = new THREE.Matrix4();
  let tris = 0;
  for(const L of inst.values()){
    const im = new THREE.InstancedMesh(L.geo, L.mat, L.items.length);
    im.castShadow = L.cast; im.receiveShadow = true;
    L.items.forEach((it, i) => { M.makeTranslation(it.base.x, it.base.y, it.base.z).multiply(it.local); im.setMatrixAt(i, M); });
    im.computeBoundingSphere(); im.computeBoundingBox();
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    L.im = im; group.add(im); pops.push(L); used.add(L.geo);
    tris += (L.geo.index ? L.geo.index.count : L.geo.attributes.position.count) / 3 * L.items.length;
  }
  let done = false;
  const popAge = age => {
    if(done) return;
    for(const L of pops){
      L.items.forEach((it, i) => {
        const s = Math.max(1e-4, pop(age - it.delay));
        M.makeTranslation(it.base.x, it.base.y, it.base.z); M.multiply(S.makeScale(s, s, s)); M.multiply(it.local);
        L.im.setMatrixAt(i, M);
      });
      L.im.instanceMatrix.needsUpdate = true;
    }
    if(age > 2.4) done = true;
  };
  popAge(-1);
  if(env.onUse) for(const g of used) env.onUse(g);
  group.position.set(X0, 0, Z0);
  for(const m of group.children) if(m.isMesh || m.isInstancedMesh) tris += m.isInstancedMesh ? 0 : (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;

  return {
    cx, cz, group, shrines, materials, animated, pop:popAge,
    get popDone(){ return done; },
    // reduced motion: terrain fades in; props / kit meshes only show once the fade is complete
    setFade(f){
      for(const m of materials){
        const o = m.userData.o0, t = o.t || f < 0.999;
        if(m.transparent !== t){ m.transparent = t; m.needsUpdate = true; }
        m.opacity = o.o * f; m.depthWrite = o.d && f > 0.98;
      }
      for(const o of group.children) if(!materials.includes(o.material)) o.visible = f >= 0.999;
    },
    dispose(){
      for(const g of disposables) g.dispose();
      for(const m of materials) m.dispose();
      for(const im of group.children) if(im.isInstancedMesh) im.dispose();
      group.clear();
    },
    stats:{ calls:group.children.length, tris:Math.round(tris), ms:performance.now() - t0, shrines:shrines.length },
  };
}
