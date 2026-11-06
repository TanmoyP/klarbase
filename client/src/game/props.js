// Procedural low-poly building blocks. Everything is built from primitives at
// runtime — no model files — so an isle is a few KB of text plus this code.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PORTAL_COLORS } from './themes.js';
import { cached, soften, tint, bake, trunk, blob } from './softkit.js';

export const LV = 0.5;          // world units per height level
export const BASE = -0.9;       // bottom of every terrain column
export const surfaceY = cell => cell.h * LV + (cell.kind === 'ramp' ? LV / 2 : 0);

/* ---------------- deterministic randomness ---------------- */
export function rng(seed){
  let s = (seed >>> 0) || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
export function hashStr(str){ let h = 2166136261; for(let i = 0; i < str.length; i++){ h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

export const col = hex => new THREE.Color(hex);
export function paint(geo, fn){
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  const out = new Float32Array(pos.count * 3), p = new THREE.Vector3(), n = new THREE.Vector3();
  for(let i = 0; i < pos.count; i++){
    p.fromBufferAttribute(pos, i); n.fromBufferAttribute(nor, i);
    const c = fn(p, n); out[i*3] = c.r; out[i*3+1] = c.g; out[i*3+2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(out, 3));
  return geo;
}
export const flat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, flatShading:true, roughness:0.85, ...extra });
export const mesh = (geo, mat, shadow = true) => { const m = new THREE.Mesh(geo, mat); m.castShadow = shadow; m.receiveShadow = true; return m; };

/* ---------------- procedural textures ---------------- */
const texCache = new Map();
function rippleTexture(base, deep){
  const key = 'rip' + base + deep;
  if(texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 256, 256);
  const r = rng(hashStr(key));
  for(let i = 0; i < 70; i++){
    const x = r()*256, y = r()*256, rad = 10 + r()*40, light = r() < 0.55;
    for(const [dx, dy] of [[0,0],[256,0],[-256,0],[0,256],[0,-256]]){
      const grd = g.createRadialGradient(x+dx, y+dy, 0, x+dx, y+dy, rad);
      grd.addColorStop(0, light ? 'rgba(255,255,255,0.18)' : hexA(deep, 0.35));
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd; g.beginPath(); g.ellipse(x+dx, y+dy, rad, rad*0.6, 0.5, 0, Math.PI*2); g.fill();
    }
  }
  g.strokeStyle = 'rgba(255,255,255,0.22)'; g.lineWidth = 1.5;
  for(let i = 0; i < 18; i++){ const x = r()*256, y = r()*256; g.beginPath(); g.arc(x, y, 6 + r()*14, 0.2, 1.4); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, t); return t;
}
function fallTexture(base){
  const key = 'fall' + base;
  if(texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas'); c.width = 64; c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, hexA(base, 0.95)); grd.addColorStop(0.75, hexA(base, 0.7)); grd.addColorStop(1, hexA(base, 0));
  g.fillStyle = grd; g.fillRect(0, 0, 64, 256);
  const r = rng(7);
  for(let i = 0; i < 26; i++){ g.fillStyle = `rgba(255,255,255,${0.15 + r()*0.35})`; g.fillRect(r()*64, r()*256, 1 + r()*3, 20 + r()*70); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, t); return t;
}
function hexA(hex, a){ const c = col(hex); return `rgba(${c.r*255|0},${c.g*255|0},${c.b*255|0},${a})`; }

/* ---------------- keel & rim decor ---------------- */
// A keel lobe: a blunt, gently lumpy root-rock bulb hanging from the column
// bottom at (X, Z). Samples crowd the tip so it ends round, never in a point.
function keelLobe(len, R, c, r, X, Z){
  const n = Math.min(5, 3 + Math.round(len)), ph = r() * 6, pts = [];
  for(let k = 0; k <= n; k++){
    const t = Math.sin(k / n * Math.PI / 2);
    const rad = k === n ? 0 : R * Math.pow(1 - Math.pow(t, 1.2), 0.6) * (1 + 0.08 * Math.sin(t * 7 + ph));
    pts.push(new THREE.Vector2(rad, -t * len));
  }
  const g = new THREE.LatheGeometry(pts, 6);
  g.rotateY(r() * 6); g.rotateZ((r() - 0.5) * 0.16); g.rotateX((r() - 0.5) * 0.16);
  g.translate(X, BASE + 0.04, Z);
  return tint(soften(g, 0.55), c, { lo:0.5, hi:1.0, jitter:0.08 }, r);
}

// What hangs off the open-sky rim of each theme. p = share of rim faces dressed.
const RIM = {
  jungle:   { kind:'vine', p:0.5, moss:true },
  tropical: { kind:'vine', p:0.42, flower:true },
  night:    { kind:'vine', p:0.45, glow:true },
  mountain: { kind:'ice',  p:0.5 },
  oasis:    { kind:'root', p:0.28 },
  urban:    { kind:'pipe', p:0.12, max:3 },
};
// A lumpy cushion along a rim's top edge (moss, snow): a row of soft squashed
// blobs that rounds off the hard corner. f = the edge's midpoint.
function cushion(f, nx, nz, tx, tz, len, rad, color, r){
  const n = Math.max(3, Math.round(len / (rad * 1.6))), parts = [];
  for(let k = 0; k < n; k++){
    const u = (k / (n - 1) - 0.5) * len, s = rad * (0.8 + r() * 0.45);
    const g = blob(s, r, { detail:0, wobble:0.1, squash:0.62 });          // 20 tris: small enough to read soft
    g.translate(f.x + tx * u + nx * (0.01 + r() * 0.02), f.y - s * 0.2, f.z + tz * u + nz * (0.01 + r() * 0.02));
    parts.push(tint(soften(g, 1), color, { lo:0.78, hi:1.04, jitter:0.05 }, r));
  }
  return bake(parts);
}
// Bake every dressed rim face into ONE solid geometry (+ one glow geometry for
// night buds). Never casts shadows; bounded by the share in RIM.
function rimDecor(rims, T, r){
  const st = RIM[T.id] || RIM.jungle, solid = [], glow = [];
  const P = (x, y, z) => new THREE.Vector3(x, y, z);
  let used = 0;
  for(const f of rims){
    if(r() > st.p || (st.max && used >= st.max)) continue;
    used++;
    const nx = f.dx, nz = f.dz, tx = Math.abs(nz), tz = Math.abs(nx);
    const at = (u, out, y) => P(f.X + nx * (0.5 + out) + tx * u, y, f.Z + nz * (0.5 + out) + tz * u);
    if(st.kind === 'vine'){
      if(st.moss) solid.push(cushion(at(0, 0, f.top), nx, nz, tx, tz, 0.5 + r() * 0.35, 0.055, T.leafAlt, r));
      for(let v = 0, nv = 1 + (r() < 0.45 ? 1 : 0); v < nv; v++){
        const u = (r() - 0.5) * 0.76, L = 0.35 + r() * 0.8 + (r() < 0.25 ? 0.6 : 0), sw = (r() - 0.5) * 0.18;
        const curve = new THREE.CatmullRomCurve3([at(u, -0.06, f.top + 0.012), at(u, 0.03, f.top - 0.03),
          at(u + sw, 0.055, f.top - L * 0.5), at(u + sw * 0.4, 0.04, f.top - L)]);
        solid.push(tint(soften(trunk(curve, 0.024, 0.015, { segs:6, radial:4 }), 1), T.leaf, { lo:0.62, hi:0.95 }, r));
        for(let k = 1, n = Math.max(2, Math.round(L / 0.13)); k <= n; k++){
          const q = curve.getPointAt(Math.min(0.98, 0.12 + 0.86 * k / n)), side = k % 2 ? 1 : -1;
          const bud = st.glow ? k === n || r() < 0.25 : false, bloom = st.flower && r() < 0.22;
          if(bud){
            const b = new THREE.IcosahedronGeometry(0.022 + r() * 0.01, 1);
            b.translate(q.x + nx * 0.02, q.y - 0.01, q.z + nz * 0.02);
            glow.push(tint(soften(b, 1), T.flora[k % T.flora.length], { lo:1, hi:1 }));
            if(k === n) continue;
          }
          const leaf = new THREE.IcosahedronGeometry(bloom ? 0.04 : 0.05, 0);
          leaf.scale(1.3, 0.45, 0.95); leaf.rotateZ(side * 0.5); leaf.rotateY(Math.atan2(-tz, tx));
          leaf.translate(q.x + nx * 0.03 + tx * side * 0.03, q.y, q.z + nz * 0.03 + tz * side * 0.03);
          solid.push(tint(soften(leaf, 1), bloom ? T.flora[0] : k % 2 ? T.leaf : T.leafAlt, { lo:0.85, hi:1.05, jitter:0.06 }, r));
        }
      }
    } else if(st.kind === 'ice'){
      solid.push(cushion(at(0, 0, f.top), nx, nz, tx, tz, 0.6 + r() * 0.3, 0.06, '#ffffff', r));
      if(r() < 0.3) continue;
      for(let k = 0, n = 2 + (r() * 3 | 0); k < n; k++){
        const R = 0.026 + r() * 0.026, L = 0.1 + r() * 0.3, pts = [];
        for(let j = 0; j <= 5; j++){ const t = Math.sin(j / 5 * Math.PI / 2); pts.push(new THREE.Vector2(j === 5 ? 0 : R * Math.pow(1 - Math.pow(t, 1.3), 0.55), -t * L)); }
        const g = new THREE.LatheGeometry(pts, 5);
        const c = at((r() - 0.5) * 0.8, 0.02, f.top - 0.1);
        g.translate(c.x, c.y, c.z);
        solid.push(tint(soften(g, 1), T.ice, { lo:0.98, hi:1.12 }, r));
      }
    } else if(st.kind === 'root'){
      for(let k = 0, n = 1 + (r() < 0.4 ? 1 : 0); k < n; k++){
        const u = (r() - 0.5) * 0.7, y = f.top - 0.22 - r() * Math.max(0.1, Math.min(0.6, f.colTop - BASE - 0.4)), drop = 0.2 + r() * 0.3, sw = (r() - 0.5) * 0.2;
        const curve = new THREE.CatmullRomCurve3([at(u, -0.06, y), at(u, 0.06, y - 0.03), at(u + sw, 0.13, y - drop * 0.6), at(u + sw * 1.4, 0.1, y - drop)]);
        solid.push(tint(soften(trunk(curve, 0.03, 0.012, { segs:5, radial:5 }), 0.8), T.trunk, { lo:0.55, hi:0.9, jitter:0.06 }, r));
      }
    } else if(st.kind === 'pipe'){
      const u = (r() - 0.5) * 0.6, L = 0.55 + r() * 0.5, c = at(u, 0.04, f.top - 0.08 - L / 2);
      const pipe = new THREE.CylinderGeometry(0.026, 0.026, L, 7); pipe.translate(c.x, c.y, c.z);
      const elbow = new THREE.CylinderGeometry(0.026, 0.026, 0.07, 7); elbow.rotateX(Math.PI / 2); elbow.rotateY(Math.atan2(nx, nz));
      const e = at(u, 0.005, f.top - 0.08); elbow.translate(e.x, e.y, e.z);
      for(const g of [pipe, elbow]) solid.push(tint(soften(g, 0.7), T.metal, { lo:0.6, hi:0.85 }, r));
      for(const yy of [0.25, 0.75]){ const b = new THREE.BoxGeometry(0.07, 0.025, 0.07); const q = at(u, 0.03, f.top - 0.08 - L * yy); b.translate(q.x, q.y, q.z); solid.push(tint(soften(b, 0.4), T.woodDark, { lo:0.8, hi:0.9 })); }
    }
  }
  return { solid:solid.length ? bake(solid) : null, glow:glow.length ? bake(glow) : null };
}

/* ---------------- terrain: the floating isle itself ---------------- */
// Returns { group, animated:[{update(t)}], centre:[cx,cz] }. Columns show
// layered strata on their cut sides, roots hang below, crystals glint, and
// water at the rim pours off the edge as a waterfall.
export function buildTerrain(level, T){
  const W = level.w, H = level.h, cx = (W - 1) / 2, cz = (H - 1) / 2;
  const r = rng(hashStr(level.cells.map(c => c.ch + c.h).join('')));
  const strata = T.strata.map(col), top = col(T.top), topAlt = col(T.topAlt), lip = col(T.lip), keelC = col(T.keel);
  const body = [], caps = [], ice = [], keel = [], crystals = [], waterTiles = [], falls = [], rims = [];
  const solid = (x, z) => x >= 0 && z >= 0 && x < W && z < H && level.cells[z*W + x].kind !== 'void';
  // a rim face that looks out to open sky: nothing solid beyond it in a straight
  // line. Notches (pan slots are cut out as void) stay bare, so a basket riding
  // its slot never brushes a vine.
  const openSky = (x, z, dx, dz) => { for(let k = 1; ; k++){ const a = x + dx * k, b = z + dz * k; if(a < 0 || b < 0 || a >= W || b >= H) return true; if(solid(a, b)) return false; } };
  let maxD = 1;
  for(let z = 0; z < H; z++) for(let x = 0; x < W; x++) if(solid(x, z)) maxD = Math.max(maxD, Math.hypot(x - cx, z - cz));

  for(let z = 0; z < H; z++) for(let x = 0; x < W; x++){
    const cell = level.cells[z*W + x];
    if(cell.kind === 'void') continue;
    const X = x - cx, Z = z - cz, topY = cell.h * LV;
    const wet = cell.kind === 'water' || cell.kind === 'bridge';
    const colTop = wet ? topY - 0.32 : topY - 0.12;
    const hgt = colTop - BASE;
    const g = new THREE.BoxGeometry(1, hgt, 1, 1, Math.max(1, Math.round(hgt / 0.22)), 1);
    g.translate(X, BASE + hgt / 2, Z);
    const jitter = r() * 0.6;
    paint(g, (p, n) => {
      if(n.y > 0.5) return wet ? col(T.waterDeep) : lip;
      const band = Math.max(0, Math.floor((topY - p.y) / 0.3 + jitter));
      return strata[band % strata.length].clone().multiplyScalar(0.92 + 0.08 * Math.sin(band * 2.3 + x));
    });
    body.push(g);

    if(cell.kind === 'ramp'){
      // a little stair flight: 4 treads climbing toward the ramp's facing
      const d = { U:[0,-1], D:[0,1], L:[-1,0], R:[1,0] }[cell.dir];
      for(let k = 0; k < 4; k++){
        const th = topY + (k + 1) * LV / 4;
        const s = new THREE.BoxGeometry(d[0] ? 0.25 : 1, th - colTop, d[1] ? 0.25 : 1);
        const off = -0.375 + k * 0.25;
        s.translate(X + d[0]*off, colTop + (th - colTop)/2, Z + d[1]*off);
        const c = (k % 2 ? top : topAlt).clone();
        paint(s, (p, n) => n.y > 0.5 ? c : lip);
        caps.push(s);
      }
    } else if(!wet){
      const capG = new THREE.BoxGeometry(1, 0.12, 1);
      capG.translate(X, topY - 0.06, Z);
      const checker = T.prop === 'planter' && ((x + z) % 2 === 0);
      const c = checker ? topAlt.clone() : top.clone().lerp(topAlt, r() * 0.8);
      paint(capG, (p, n) => n.y > 0.5 ? c : lip);
      (cell.kind === 'ice' ? ice : caps).push(capG);
    } else {
      waterTiles.push({ X, Z, y:topY - 0.1, x, z });
    }

    // keel: a rounded root-rock lobe under every column — longest under the middle
    // of the isle, blunt-tipped (no spikes), gently lumpy and soft-faceted
    const d = Math.hypot(x - cx, z - cz);
    const len = 0.35 + (1 - d / maxD) * 2.4 + r() * 0.7;
    keel.push(keelLobe(len, 0.58 + r() * 0.07, keelC, r, X + (r() - 0.5) * 0.15, Z + (r() - 0.5) * 0.15));

    // crystals glinting in the cut faces of the rim: stubby gems half sunk in the rock
    for(const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
      if(solid(x + dx, z + dz)) continue;
      if(!wet && openSky(x, z, dx, dz)) rims.push({ X, Z, dx, dz, top:topY, colTop });
      if(r() > 0.3) continue;
      const n = 1 + (r() * 2 | 0);
      for(let i = 0; i < n; i++){
        const o = new THREE.OctahedronGeometry(0.08 + r() * 0.06, 0);
        o.scale(1, 1.3, 1); o.rotateZ((r() - 0.5) * 0.6); o.rotateX((r() - 0.5) * 0.6);
        const yy = BASE + 0.15 + r() * Math.max(0.1, colTop - BASE - 0.35);
        o.translate(X + dx * 0.47 + (dz ? (r() - 0.5) * 0.7 : 0), yy, Z + dz * 0.47 + (dx ? (r() - 0.5) * 0.7 : 0));
        crystals.push(o);
      }
    }
    // waterfalls where water meets the rim
    if(cell.kind === 'water') for(const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
      if(!solid(x + dx, z + dz)) falls.push({ X: X + dx * 0.5, Z: Z + dz * 0.5, y: topY - 0.1, dx, dz });
    }
  }

  const group = new THREE.Group();
  const terrainMat = new THREE.MeshStandardMaterial({ vertexColors:true, flatShading:true, roughness:0.92 });
  group.add(mesh(mergeGeometries(body), terrainMat));
  if(caps.length) group.add(mesh(mergeGeometries(caps), terrainMat));
  if(ice.length) group.add(mesh(mergeGeometries(ice), new THREE.MeshStandardMaterial({
    vertexColors:false, color:T.ice, roughness:0.06, metalness:0.2, flatShading:true })));
  const keelMesh = mesh(bake(keel), new THREE.MeshStandardMaterial({ vertexColors:true, roughness:0.95 })); keelMesh.castShadow = false;
  group.add(keelMesh);
  const rim = rimDecor(rims, T, rng(hashStr('rim' + T.id + level.cells.map(c => c.ch + c.h).join(''))));
  if(rim.solid) group.add(mesh(rim.solid, new THREE.MeshStandardMaterial({ vertexColors:true, roughness:0.9, side:THREE.DoubleSide }), false));
  if(rim.glow) group.add(mesh(rim.glow, new THREE.MeshBasicMaterial({ vertexColors:true }), false));
  if(crystals.length){
    const cm = new THREE.MeshStandardMaterial({ color:T.crystal, emissive:T.crystal, emissiveIntensity:1.4, flatShading:true, roughness:0.3 });
    group.add(mesh(mergeGeometries(crystals), cm, false));
  }

  const animated = [];
  if(waterTiles.length){
    const tex = rippleTexture(T.water, T.waterDeep);
    const wm = new THREE.MeshStandardMaterial({ map:tex, transparent:true, opacity:0.9, roughness:0.12, metalness:0.05, color:'#ffffff' });
    for(const w of waterTiles){
      const p = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), wm);
      p.rotation.x = -Math.PI / 2; p.position.set(w.X, w.y, w.Z); p.receiveShadow = true;
      group.add(p);
    }
    animated.push({ update:t => { tex.offset.set(t * 0.018, t * 0.011); } });
  }
  if(falls.length){
    const ft = fallTexture(T.water);
    const fm = new THREE.MeshBasicMaterial({ map:ft, transparent:true, depthWrite:false, side:THREE.DoubleSide, fog:true });
    for(const f of falls){
      const len = 3.2;
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.78, len), fm);
      p.position.set(f.X + f.dx * 0.06, f.y - len / 2, f.Z + f.dz * 0.06);
      p.rotation.y = Math.atan2(f.dx, f.dz);
      group.add(p);
    }
    animated.push({ update:t => { ft.offset.y = -t * 0.9; } });
  }
  return { group, animated, centre:[cx, cz] };
}

/* ---------------- static props ---------------- */
// Trees, rocks, flora and ground scatter are per-theme biome art: biome.js.

/* ---------------- interactive pieces ---------------- */
export function makeCrate(T){
  const g = new THREE.Group();
  const s = 0.78, wood = flat(T.wood), dark = flat(T.woodDark);
  const box = mesh(new THREE.BoxGeometry(s - 0.04, s - 0.04, s - 0.04), wood); g.add(box);
  const e = 0.07, half = s / 2 - e / 2;
  for(const a of [-1, 1]) for(const b of [-1, 1]){               // the 12 framed edges
    const ex = mesh(new THREE.BoxGeometry(s, e, e), dark); ex.position.set(0, a * half, b * half); g.add(ex);
    const ey = mesh(new THREE.BoxGeometry(e, s, e), dark); ey.position.set(a * half, 0, b * half); g.add(ey);
    const ez = mesh(new THREE.BoxGeometry(e, e, s), dark); ez.position.set(a * half, b * half, 0); g.add(ez);
  }
  for(const sgn of [-1, 1]){
    const br = mesh(new THREE.BoxGeometry(0.06, s * 1.25, 0.03), dark);
    br.rotation.z = sgn * Math.PI / 4; br.position.z = sgn * (s / 2 + 0.005);
    g.add(br);
  }
  g.position.y = s / 2;
  const holder = new THREE.Group(); holder.add(g);
  return holder;
}

export function makePlate(T){
  const g = new THREE.Group();
  const base = mesh(new THREE.CylinderGeometry(0.4, 0.42, 0.08, 16), flat(T.rock)); base.position.y = 0.02; g.add(base);
  const ringMat = new THREE.MeshStandardMaterial({ color:T.accent, emissive:T.accent, emissiveIntensity:0.15, roughness:0.4 });
  const ring = mesh(new THREE.TorusGeometry(0.25, 0.035, 6, 24), ringMat, false); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.07; g.add(ring);
  g.userData = { base, ring, ringMat, pressed:0 };
  return g;
}

export function makeGate(T){
  const g = new THREE.Group();
  const post = flat(T.woodDark), metal = flat(T.metal, { metalness:0.6, roughness:0.35 });
  for(const sx of [-0.44, 0.44]){ const p = mesh(new THREE.BoxGeometry(0.12, 1.0, 0.16), post); p.position.set(sx, 0.5, 0); g.add(p); const k = mesh(new THREE.SphereGeometry(0.08, 8, 6), metal); k.position.set(sx, 1.04, 0); g.add(k); }
  const bars = new THREE.Group();
  for(let i = 0; i < 5; i++){ const b = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.86, 6), metal); b.position.set(-0.3 + i * 0.15, 0.45, 0); bars.add(b); }
  for(const y of [0.2, 0.75]){ const rail = mesh(new THREE.BoxGeometry(0.76, 0.05, 0.05), metal); rail.position.y = y; bars.add(rail); }
  g.add(bars);
  g.userData = { bars, open:0 };
  return g;
}

export function makeLever(T){
  const g = new THREE.Group();
  const base = mesh(new THREE.BoxGeometry(0.36, 0.12, 0.26), flat(T.rock)); base.position.y = 0.06; g.add(base);
  const pivot = new THREE.Group(); pivot.position.y = 0.12; g.add(pivot);
  const stick = mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.46, 6), flat(T.woodDark)); stick.position.y = 0.23; pivot.add(stick);
  const knob = mesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshStandardMaterial({ color:T.accent, emissive:T.accent, emissiveIntensity:0.35 })); knob.position.y = 0.47; pivot.add(knob);
  g.userData = { pivot, angle:0.6 };
  pivot.rotation.z = 0.6;
  return g;
}

export function makeBridge(T){
  const g = new THREE.Group();
  const mat = flat(T.wood, { transparent:true }), dark = flat(T.woodDark, { transparent:true });
  for(let i = 0; i < 5; i++){ const p = mesh(new THREE.BoxGeometry(0.18, 0.07, 0.98), i % 2 ? mat : dark); p.position.set(-0.4 + i * 0.2, -0.035, 0); g.add(p); }
  g.userData = { mats:[mat, dark], up:1 };
  return g;
}

export function makeKey(T){
  const g = new THREE.Group();
  const gold = new THREE.MeshStandardMaterial({ color:'#ffd35c', metalness:0.85, roughness:0.25, emissive:'#7a4f00', emissiveIntensity:0.35 });
  const ring = mesh(new THREE.TorusGeometry(0.1, 0.035, 8, 16), gold); ring.position.y = 0.12; g.add(ring);
  const shaft = mesh(new THREE.BoxGeometry(0.05, 0.26, 0.05), gold); shaft.position.y = -0.08; g.add(shaft);
  for(const y of [-0.16, -0.08]){ const t = mesh(new THREE.BoxGeometry(0.09, 0.04, 0.05), gold); t.position.set(0.06, y, 0); g.add(t); }
  const holder = new THREE.Group(); holder.add(g); g.position.y = 0.55;
  holder.userData = { spin:g };
  return holder;
}

export function makeDoor(T){
  const g = new THREE.Group();
  const frame = flat(T.rock);
  for(const sx of [-0.45, 0.45]){ const p = mesh(new THREE.BoxGeometry(0.12, 1.05, 0.2), frame); p.position.set(sx, 0.52, 0); g.add(p); }
  const lintel = mesh(new THREE.BoxGeometry(1.02, 0.14, 0.22), frame); lintel.position.y = 1.08; g.add(lintel);
  const hinge = new THREE.Group(); hinge.position.set(-0.39, 0, 0); g.add(hinge);
  const slab = new THREE.Group(); slab.position.x = 0.39; hinge.add(slab);
  const wood = flat(T.wood), dark = flat(T.woodDark);
  for(let i = 0; i < 4; i++){ const pl = mesh(new THREE.BoxGeometry(0.19, 0.96, 0.08), i % 2 ? wood : dark); pl.position.set(-0.29 + i * 0.195, 0.5, 0); slab.add(pl); }
  const gold = new THREE.MeshStandardMaterial({ color:'#ffd35c', metalness:0.85, roughness:0.3 });
  const lock = mesh(new THREE.BoxGeometry(0.14, 0.16, 0.12), gold); lock.position.set(0.2, 0.48, 0.03); slab.add(lock);
  const hole = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.14, 6), flat('#1b1410')); hole.rotation.x = Math.PI / 2; hole.position.set(0.2, 0.47, 0.05); slab.add(hole);
  g.userData = { hinge, open:0 };
  return g;
}

export function makePortal(T, pair){
  const g = new THREE.Group();
  const c = PORTAL_COLORS[pair];
  const stone = flat(T.rock);
  for(const sx of [-0.36, 0.36]){ const p = mesh(new THREE.BoxGeometry(0.12, 0.5, 0.14), stone); p.position.set(sx, 0.25, 0); g.add(p); }
  const arch = mesh(new THREE.TorusGeometry(0.36, 0.07, 8, 24, Math.PI), stone); arch.position.y = 0.5; g.add(arch);
  const glowMat = new THREE.MeshBasicMaterial({ color:c, transparent:true, opacity:0.55, blending:THREE.AdditiveBlending, depthWrite:false, side:THREE.DoubleSide });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.31, 28), glowMat); disc.position.y = 0.5; g.add(disc);
  const lower = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.5), glowMat); lower.position.y = 0.25; g.add(lower);
  const swirl = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.015, 4, 20, Math.PI * 1.4), new THREE.MeshBasicMaterial({ color:'#ffffff', transparent:true, opacity:0.7, blending:THREE.AdditiveBlending, depthWrite:false }));
  swirl.position.y = 0.42; g.add(swirl);
  const gem = mesh(new THREE.OctahedronGeometry(0.06, 0), new THREE.MeshStandardMaterial({ color:c, emissive:c, emissiveIntensity:2 }), false); gem.position.y = 0.92; g.add(gem);
  g.userData = { glowMat, swirl, gem };
  return g;
}

// Sky Scales (K1): a pan is a hanging basket of turf on four ropes that meet at a
// hook (PAN_HOOK above the floor). The world strings the hooks of both pans to
// one vine. Origin = the surface Pip stands on.
export const PAN_HOOK = 1.5;
export function makePan(T){
  const g = new THREE.Group();
  const slab = mesh(new THREE.BoxGeometry(0.92, 0.24, 0.92), flat(T.wood)); slab.position.y = -0.18; g.add(slab);
  const turf = mesh(new THREE.BoxGeometry(0.86, 0.07, 0.86), flat(T.top)); turf.position.y = -0.035; g.add(turf);
  const dark = flat(T.woodDark);
  for(const s of [-1, 1]){
    const a = mesh(new THREE.BoxGeometry(0.96, 0.06, 0.06), dark); a.position.set(0, -0.04, s * 0.45); g.add(a);
    const b = mesh(new THREE.BoxGeometry(0.06, 0.06, 0.96), dark); b.position.set(s * 0.45, -0.04, 0); g.add(b);
  }
  const root = new THREE.ConeGeometry(0.34, 0.55, 6); root.rotateX(Math.PI); root.translate(0, -0.57, 0);
  g.add(mesh(root, flat(T.keel)));
  const rope = flat(T.leaf, { roughness:1 });
  const strand = (a, b) => {                       // a thin rope between two points
    const d = new THREE.Vector3().subVectors(b, a), m = mesh(new THREE.CylinderGeometry(0.016, 0.016, d.length(), 4), rope, false);
    m.position.copy(a).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); g.add(m);
  };
  const hook = new THREE.Vector3(0, PAN_HOOK, 0);
  for(const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]){
    const low = new THREE.Vector3(x * 0.44, -0.02, z * 0.44), high = new THREE.Vector3(x * 0.44, 0.95, z * 0.44);
    strand(low, high); strand(high, hook);        // straight up past Pip and crates, then to the hook
  }
  const ring = mesh(new THREE.TorusGeometry(0.06, 0.018, 6, 12), flat(T.metal, { metalness:0.6, roughness:0.35 }), false);
  ring.position.y = PAN_HOOK; g.add(ring);
  return g;
}

export function makeGoal(T){
  const g = new THREE.Group();
  const ped = mesh(new THREE.CylinderGeometry(0.3, 0.36, 0.2, 8), flat(T.rock)); ped.position.y = 0.1; g.add(ped);
  const step = mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.08, 8), flat(T.lip)); step.position.y = 0.24; g.add(step);
  const gemMat = new THREE.MeshStandardMaterial({ color:T.accent, emissive:T.accent, emissiveIntensity:1.6, flatShading:true, roughness:0.2 });
  const gem = mesh(new THREE.OctahedronGeometry(0.17, 0), gemMat, false); gem.scale.y = 1.4; gem.position.y = 0.75; g.add(gem);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.02, 6, 32), new THREE.MeshBasicMaterial({ color:T.accent, transparent:true, opacity:0.8, blending:THREE.AdditiveBlending }));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.75; g.add(ring);
  const beamMat = new THREE.MeshBasicMaterial({ color:T.accent, transparent:true, opacity:0.13, blending:THREE.AdditiveBlending, depthWrite:false, side:THREE.DoubleSide });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, 4, 16, 1, true), beamMat); beam.position.y = 2.3; g.add(beam);
  g.userData = { gem, ring, beamMat };
  return g;
}

export function makeStart(T){
  const g = new THREE.Group();
  const pad = mesh(new THREE.CylinderGeometry(0.34, 0.36, 0.04, 14), flat(T.lip)); pad.position.y = 0.02; g.add(pad);
  const inner = mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.045, 14), flat(T.leafAlt)); inner.position.y = 0.025; g.add(inner);
  return g;
}

/* ---------------- ambient life ---------------- */
// Soft cumulus, one closed surface each: every vertex of a sphere is pushed out
// to the farthest puff its ray from the centre crosses (a union of puffs with no
// inner faces to show through the transparency), the underside is planed flat,
// and it shades white on top to the fog colour below. CLOUD_SHAPES per theme.
const CLOUD_SHAPES = 3;
function cloudGeometry(T, v){
  return cached('cloud:' + T.id + ':' + v, () => {
    // a ring of base puffs on a flat ellipse, then smaller puffs heaped on top
    const r = rng(9001 + v * 77), n = 6 + v, puffs = [], ax = 1.15 + v * 0.25, az = 0.62 + v * 0.08;
    for(let k = 0; k < n; k++){
      const a = k / n * Math.PI * 2 + r() * 0.4;
      puffs.push([Math.cos(a) * ax * 0.78, 0.05 + r() * 0.12, Math.sin(a) * az * 0.7, 0.42 + r() * 0.18]);
    }
    for(let k = 0; k < 3 + v; k++) puffs.push([(r() - 0.5) * ax * 1.1, 0.32 + r() * 0.22, (r() - 0.5) * az * 0.7, 0.4 + r() * 0.16]);
    puffs.push([(r() - 0.5) * 0.4, 0.5, (r() - 0.5) * 0.2, 0.5]);                         // the crown
    const g = new THREE.SphereGeometry(1, 24, 12), p = g.attributes.position, d = new THREE.Vector3();
    for(let i = 0; i < p.count; i++){
      d.fromBufferAttribute(p, i).normalize();
      let t = 1 / Math.hypot(d.x / ax, d.y / 0.3, d.z / az);              // flat core
      for(const [cx, cy, cz, R] of puffs){
        const b = d.x * cx + d.y * cy + d.z * cz, disc = b * b - (cx * cx + cy * cy + cz * cz - R * R);
        if(disc >= 0) t = Math.max(t, b + Math.sqrt(disc));
      }
      p.setXYZ(i, d.x * t, Math.max(d.y * t, -0.16), d.z * t);
    }
    const geo = soften(g, 1), q = geo.attributes.position, out = new Float32Array(q.count * 3);
    const lo = new THREE.Color('#ffffff').lerp(new THREE.Color(T.fog), 0.45), hi = new THREE.Color('#ffffff').lerp(new THREE.Color(T.hemi.sky), 0.25), c = new THREE.Color();
    for(let i = 0; i < q.count; i++){ c.copy(lo).lerp(hi, Math.min(1, Math.max(0, (q.getY(i) + 0.16) / 0.45))); out.set([c.r, c.g, c.b], i * 3); }
    geo.setAttribute('color', new THREE.BufferAttribute(out, 3));
    geo.deleteAttribute('uv');
    return geo;
  });
}
// The cloud deck: a sea of cloud BELOW the isle plus a few far-off puffs on the
// horizon — never between the camera and the puzzle. Instanced per shape (3 draw
// calls for all 12). Returns { group, update(dt, t) }.
export function makeCloud(T, r, span){
  const group = new THREE.Group(), meshes = [], clouds = [];
  // lit by the theme's own sky, so moonlit clouds stay soft instead of glaring white
  const mat = new THREE.MeshStandardMaterial({ vertexColors:true, emissive:T.hemi.sky, emissiveIntensity:0.32 * Math.min(1, T.sun.intensity / 2.4), roughness:1, transparent:true, opacity:0.92, depthWrite:false });
  for(let v = 0; v < CLOUD_SHAPES; v++){ const im = new THREE.InstancedMesh(cloudGeometry(T, v), mat, 4); im.frustumCulled = false; group.add(im); meshes.push(im); }
  for(let i = 0; i < 12; i++){
    const a = r() * Math.PI * 2, low = i < 9, k = 0.7 + r() * 1.1;
    clouds.push({ im:meshes[i % CLOUD_SHAPES], slot:i / CLOUD_SHAPES | 0, a, rad:low ? span * 0.6 + 3 + r() * span : span * 1.6 + 10 + r() * 8,
      y:low ? -3.2 - r() * 2.6 : 1 + r() * 3, speed:0.008 + r() * 0.012, bob:r() * 6, rot:r() * Math.PI * 2, sx:k, sy:k * 0.85 });
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const update = (dt, t) => {
    for(const c of clouds){
      c.a += dt * c.speed;
      pos.set(Math.cos(c.a) * c.rad, c.y + Math.sin(t * 0.3 + c.bob) * 0.15, Math.sin(c.a) * c.rad);
      q.setFromAxisAngle(up, c.rot); sc.set(c.sx, c.sy, c.sx); m4.compose(pos, q, sc); c.im.setMatrixAt(c.slot, m4);
    }
    for(const im of meshes) im.instanceMatrix.needsUpdate = true;
  };
  update(0, 0);
  return { group, update };
}

// Legacy: critters are fauna.js now. Unused — drop with its world.js import.
export function makeFlyer(kind, color){
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, side:THREE.DoubleSide, flatShading:true });
  const wing = () => {
    const geo = new THREE.BufferGeometry();
    const v = kind === 'butterfly' ? [0,0,0, 0.16,0.02,-0.1, 0.12,0,0.12] : [0,0,0, 0.22,0.04,-0.05, 0.05,0,0.08];
    geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); geo.computeVertexNormals();
    return new THREE.Mesh(geo, mat);
  };
  const L = wing(), R = wing(); R.scale.x = -1;
  g.add(L, R);
  g.userData = { L, R };
  return g;
}

/* ---------------- Weight II (Phase 3): balloons, stones, buoys, vents, seeds ---------------- */
// A round balloon on a string. `lift` = string length; the knot sits at the group origin.
export function makeBalloon(color = '#ff6f7d', lift = 0.75){
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color, roughness:0.35, metalness:0.05, emissive:color, emissiveIntensity:0.08 });
  const ball = mesh(new THREE.SphereGeometry(0.2, 18, 14), skin); ball.scale.set(1, 1.15, 1); ball.position.y = lift + 0.2; g.add(ball);
  const tie = mesh(new THREE.ConeGeometry(0.035, 0.06, 8), skin, false); tie.position.y = lift - 0.01; g.add(tie);
  const glint = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), new THREE.MeshBasicMaterial({ color:'#ffffff', transparent:true, opacity:0.7 }));
  glint.position.set(-0.08, lift + 0.3, 0.13); g.add(glint);
  const str = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, lift, 4), new THREE.MeshBasicMaterial({ color:'#f4f0e6' }));
  str.position.y = lift / 2; g.add(str);
  g.userData = { ball, str };
  return g;
}
// A wooden post with one balloon tied on; the balloon hides once taken.
export function makePost(T){
  const g = new THREE.Group();
  const post = mesh(new THREE.CylinderGeometry(0.05, 0.065, 0.62, 7), flat(T.woodDark)); post.position.y = 0.31; g.add(post);
  const cap = mesh(new THREE.SphereGeometry(0.075, 8, 6), flat(T.wood)); cap.position.y = 0.64; g.add(cap);
  const ring = mesh(new THREE.TorusGeometry(0.07, 0.016, 6, 12), flat(T.metal, { metalness:0.5, roughness:0.4 }), false);
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.5; g.add(ring);
  const balloon = makeBalloon(T.accent, 0.55); balloon.position.set(0.07, 0.5, 0); g.add(balloon);
  g.userData = { balloon };
  return g;
}
// A cairn of round river stones (the pile never runs out).
export function makePile(T, r = Math.random){
  const g = new THREE.Group(), mat = flat(T.rock), top = flat(T.rockTop);
  const spots = [[-0.18, 0, -0.1, 0.17], [0.16, 0, -0.14, 0.15], [0.02, 0, 0.16, 0.16], [-0.02, 0.17, -0.04, 0.13], [0.1, 0.13, 0.08, 0.1]];
  spots.forEach(([x, y, z, s], k) => { const m = mesh(new THREE.DodecahedronGeometry(s, 0), k > 2 ? top : mat); m.position.set(x, y + s * 0.8, z); m.rotation.set(r() * 3, r() * 3, 0); m.scale.y = 0.75; g.add(m); });
  return g;
}
// The stone Pip carries: held overhead, so the weight reads at a glance.
export function makeStone(T){
  const g = new THREE.Group();
  const m = mesh(new THREE.DodecahedronGeometry(0.17, 0), flat(T.rock)); m.scale.set(1.1, 0.8, 1); g.add(m);
  const band = mesh(new THREE.TorusGeometry(0.15, 0.018, 5, 14), flat(T.rockTop), false); band.rotation.x = Math.PI / 2; band.position.y = 0.04; g.add(band);
  return g;
}
// A buoy: a little crate lashed under a balloon (weight −1). Same footprint as a crate.
export function makeBuoy(T){
  const holder = new THREE.Group(), g = new THREE.Group();
  const s = 0.6, wood = flat(T.wood), dark = flat(T.woodDark);
  g.add(mesh(new THREE.BoxGeometry(s, s * 0.8, s), wood));
  for(const y of [-0.17, 0.17]){ const band = mesh(new THREE.BoxGeometry(s + 0.03, 0.06, s + 0.03), dark); band.position.y = y; g.add(band); }
  const float = mesh(new THREE.TorusGeometry(0.36, 0.07, 8, 20), flat('#ff7d6b')); float.rotation.x = Math.PI / 2; float.position.y = -0.12; g.add(float);
  for(const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]){ const st = mesh(new THREE.BoxGeometry(0.1, 0.075, 0.075), flat('#ffffff')); st.position.set(Math.cos(a) * 0.36, -0.12, Math.sin(a) * 0.36); st.rotation.y = -a; g.add(st); }
  g.position.y = s * 0.4;
  const balloon = makeBalloon('#7fd0ff', 0.5); balloon.position.y = s * 0.8; holder.add(g, balloon);
  holder.userData = { balloon, box:g };
  return holder;
}
// A gust vent: a stone mouth with turning vanes, set flush in the floor and pointing
// along its gust (+Z before the group is rotated).
export function makeVent(T){
  const g = new THREE.Group();
  const rim = mesh(new THREE.CylinderGeometry(0.36, 0.4, 0.08, 18), flat(T.rock)); rim.position.y = 0.03; g.add(rim);
  const hole = mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.02, 18), flat('#2b2433'), false); hole.position.y = 0.075; g.add(hole);
  const fan = new THREE.Group(); fan.position.y = 0.09; g.add(fan);
  for(let k = 0; k < 5; k++){ const v = mesh(new THREE.BoxGeometry(0.26, 0.015, 0.07), flat(T.metal, { metalness:0.5, roughness:0.4 }), false); v.position.x = 0.13; v.rotation.x = 0.5; const arm = new THREE.Group(); arm.rotation.y = k * Math.PI * 2 / 5; arm.add(v); fan.add(arm); }
  const arrow = mesh(new THREE.ConeGeometry(0.08, 0.16, 3), new THREE.MeshStandardMaterial({ color:T.accent, emissive:T.accent, emissiveIntensity:0.4 }), false);
  arrow.rotation.x = Math.PI / 2; arrow.position.set(0, 0.06, 0.42); g.add(arrow);
  g.userData = { fan };
  return g;
}
// A seed: a tiny glowing sprout in a nut-shell. Optional collectible.
export function makeSeed(T){
  const g = new THREE.Group(), spin = new THREE.Group(); spin.position.y = 0.32; g.add(spin);
  const shell = mesh(new THREE.SphereGeometry(0.1, 12, 10), flat(T.wood)); shell.scale.set(1, 0.7, 1); spin.add(shell);
  const glow = new THREE.MeshStandardMaterial({ color:'#b6ff7a', emissive:'#9dff5c', emissiveIntensity:0.8, roughness:0.5 });
  for(const s of [-1, 1]){ const leaf = mesh(new THREE.SphereGeometry(0.06, 8, 6), glow, false); leaf.scale.set(1.3, 0.3, 0.7); leaf.position.set(s * 0.05, 0.1, 0); leaf.rotation.z = s * -0.6; spin.add(leaf); }
  g.userData = { spin };
  return g;
}

/* ---------------- cozy hazards (Phase 4, K5) ---------------- */
// A rolling boulder: round, mossy and a little sleepy — it bonks, it never hurts.
// `spin` rolls; the face stays upright on `body`.
export function makeBoulder(T){
  const g = new THREE.Group(), body = new THREE.Group(); body.position.y = 0.36; g.add(body);
  const spin = new THREE.Group(); body.add(spin);
  const stone = mesh(new THREE.IcosahedronGeometry(0.36, 1), flat(T.rock)); spin.add(stone);
  const moss = mesh(new THREE.TorusGeometry(0.33, 0.06, 6, 16), flat(T.leafAlt), false); moss.rotation.y = Math.PI / 2; spin.add(moss);
  const ink = new THREE.MeshStandardMaterial({ color:'#1d1724', roughness:0.4 });
  for(const s of [-1, 1]){ const lid = mesh(new THREE.CapsuleGeometry(0.018, 0.06, 3, 6), ink, false); lid.rotation.z = Math.PI / 2; lid.position.set(s * 0.1, 0.06, 0.33); body.add(lid); }
  g.userData = { body, spin };
  return g;
}
// A thorn sweeper: a round bramble with one long thorny arm along +Z (turned by the world).
export function makeThorn(T, arm = 2){
  const g = new THREE.Group();
  const bush = flat(T.leaf), dark = flat(T.trunk), thornMat = flat('#f4e7c8');
  for(const [x, y, z, s] of [[0, 0.3, 0, 0.32], [0.16, 0.22, 0.1, 0.2], [-0.15, 0.24, -0.08, 0.22]]){ const b = mesh(new THREE.IcosahedronGeometry(s, 0), bush); b.position.set(x, y, z); g.add(b); }
  const pivot = new THREE.Group(); pivot.position.y = 0.42; g.add(pivot);
  const len = arm + 0.25;
  const stem = mesh(new THREE.CylinderGeometry(0.05, 0.07, len, 6), dark); stem.rotation.x = Math.PI / 2; stem.position.z = len / 2; pivot.add(stem);
  for(let k = 0; k < arm * 4; k++){
    const t = mesh(new THREE.ConeGeometry(0.035, 0.16, 4), thornMat, false);
    const a = k * 2.1; t.position.set(Math.cos(a) * 0.07, Math.sin(a) * 0.07, 0.35 + k * (len - 0.4) / (arm * 4));
    t.rotation.z = a - Math.PI / 2; pivot.add(t);                 // spikes point out from the stem
  }
  const bud = mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshStandardMaterial({ color:'#ff8fb1', emissive:'#ff6f9a', emissiveIntensity:0.3 }), false);
  bud.position.z = len; pivot.add(bud);
  g.userData = { pivot };
  return g;
}
// Where a hazard will be after your next move: a soft pulsing ring on the tile.
export function makeWarning(){
  const m = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.4, 28),
    new THREE.MeshBasicMaterial({ color:'#ff9a7a', transparent:true, opacity:0.55, depthWrite:false, side:THREE.DoubleSide }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.03;
  return m;
}
