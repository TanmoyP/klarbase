// Ambient critters per theme (art pass 2026-11). Life around the isle that never
// touches the puzzle. FLYERS circle behind and beside the isle (seen against the
// sky, not over the tiles) and are instanced: one draw call for every body of a
// kind, one for every wing. A few SPECIALS live only on decor tiles — water, rock,
// tree — inside their storey's group, so they fade with it. Pure decor: nothing
// here reads or changes engine state, and nothing in update() allocates.
import * as THREE from 'three';
import { rng, hashStr, LV } from './props.js';
import { cached, soften, tint, bake, blob, trunk } from './softkit.js';

/* ---------------- who lives where ---------------- */
// fly: [kind, count] (≤ 6 flyers); special: decor-tile critters (≤ 2).
const CAST = {
  jungle:   { fly:[['butterfly', 3], ['dragonfly', 2]], special:['frog', 'fish'] },
  oasis:    { fly:[['swallow', 3], ['dragonfly', 2]],   special:['lizard'] },
  tropical: { fly:[['gull', 3], ['butterfly', 2]],      special:['crab', 'fish'] },
  urban:    { fly:[['pigeon', 3], ['butterfly', 2]],    special:['pigeons'] },
  mountain: { fly:[['eagle', 1], ['snowbird', 3]],      special:[] },
  night:    { fly:[['moth', 4]],                        special:['owl'] },
};

/* ---------------- scratch (never allocate per frame) ---------------- */
const V = new THREE.Vector3(), SC = new THREE.Vector3(), Q = new THREE.Quaternion(), E = new THREE.Euler(0, 0, 0, 'YXZ');
const B4 = new THREE.Matrix4(), L4 = new THREE.Matrix4(), W4 = new THREE.Matrix4();
const wrap = a => a - Math.PI * 2 * Math.floor((a + Math.PI) / (Math.PI * 2));
const ease = u => u * u * (3 - 2 * u);

/* ---------------- shapes ---------------- */
const part = (g, hex, o = {}, k = 1) => tint(soften(g, k), hex, { lo:0.85, hi:1.05, ...o });
const at = (g, x, y, z) => { g.translate(x, y, z); return g; };
const egg = (sx, sy, sz, ws = 10, hs = 7) => new THREE.SphereGeometry(1, ws, hs).scale(sx, sy, sz);
// Flat wing from a 2D outline (X = out from the hinge, Y = forward), laid in the
// XZ plane; shaded from `inner` at the hinge to `outer` at the tip.
function wing(shapes, inner, outer){
  const g = new THREE.ShapeGeometry(shapes, 8); g.rotateX(Math.PI / 2);
  g.computeBoundingBox();
  const p = g.attributes.position, out = new Float32Array(p.count * 3), a = new THREE.Color(inner), b = new THREE.Color(outer), c = new THREE.Color();
  const span = Math.max(1e-4, g.boundingBox.max.x);
  for(let i = 0; i < p.count; i++){ c.copy(a).lerp(b, Math.min(1, p.getX(i) / span)); out.set([c.r, c.g, c.b], i * 3); }
  g.setAttribute('color', new THREE.BufferAttribute(out, 3)); g.deleteAttribute('uv');
  return g;
}
const ellipse = (x, y, rx, ry, rot = 0) => new THREE.Shape().absellipse(x, y, rx, ry, 0, Math.PI * 2, false, rot);
const outline = pts => new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));

// bird bodies: [body, belly, head, beak, tail] colours
const BIRD = {
  gull:     ['#f4f4ef', '#ffffff', '#ffffff', '#ffc24a', '#8d929c'],
  swallow:  ['#2d3552', '#f1dcc0', '#2d3552', '#2a2433', '#232a44'],
  pigeon:   ['#8f93a6', '#a7abbd', '#6f7590', '#d9c7b0', '#6d7186'],
  snowbird: ['#6b6f7c', '#f4f1ea', '#3c3f4a', '#2a2433', '#4c505c'],
  eagle:    ['#6a4a2f', '#5a3e27', '#f6f1e6', '#ffc24a', '#f2ece0'],
};
function birdBody(kind){
  const [c, belly, head, beak, tail] = BIRD[kind];
  const forked = kind === 'swallow';
  const tl = forked ? outline([[0, 0], [0.045, -0.02], [0.06, -0.11], [0.02, -0.05], [-0.02, -0.05], [-0.06, -0.11], [-0.045, -0.02]])
                    : outline([[0, 0.01], [0.04, -0.01], [0.05, -0.07], [0, -0.08], [-0.05, -0.07], [-0.04, -0.01]]);
  const tg = new THREE.ShapeGeometry(tl, 4); tg.rotateX(Math.PI / 2); tg.translate(0, 0.005, -0.08); tg.deleteAttribute('uv');
  return bake([
    part(egg(0.045, 0.04, 0.1), c, { lo:1.0, hi:1.0 }),
    part(at(egg(0.036, 0.024, 0.07), 0, -0.016, 0.01), belly, { lo:1, hi:1 }),
    part(at(egg(0.034, 0.032, 0.036), 0, 0.022, 0.085), head, { lo:0.95, hi:1.05 }),
    part(at(new THREE.ConeGeometry(0.011, 0.04, 6).rotateX(Math.PI / 2), 0, 0.018, 0.13), beak, { lo:1, hi:1 }),
    tint(tg, tail, { lo:1, hi:1 }),
  ]);
}

// Every flyer kind: body + wing geometry, wing hinges/sweeps, size and motion.
const KINDS = {
  butterfly:{ path:'flutter', scale:1, wings:2, hinge:[0.006, 0.004, 0], flap:34, amp:1.15, open:0.2,
    body:() => part(new THREE.CapsuleGeometry(0.01, 0.07, 2, 6).rotateX(Math.PI / 2), '#2b2433'),
    wing:() => wing([ellipse(0.075, 0.03, 0.078, 0.058, 0.45), ellipse(0.055, -0.04, 0.052, 0.044, -0.5)], '#b9b2b5', '#ffffff'),
    tinted:true },
  moth:     { path:'lamp', scale:1.05, wings:2, hinge:[0.008, 0.006, 0], flap:26, amp:0.95, open:0.35,
    body:() => part(new THREE.CapsuleGeometry(0.016, 0.045, 2, 6).rotateX(Math.PI / 2), '#cbb894'),
    wing:() => wing([ellipse(0.06, 0.012, 0.066, 0.052, 0.25), ellipse(0.045, -0.035, 0.045, 0.036, -0.3)], '#d8cdb4', '#f5efe0'),
    glow:0.18 },
  dragonfly:{ path:'dart', scale:1.15, wings:4, hinge:[0.008, 0.012, 0.014], flap:52, amp:0.32, open:0.12, sweep:[-0.12, 0.38],
    body:() => bake([part(at(new THREE.CapsuleGeometry(0.009, 0.16, 2, 6).rotateX(Math.PI / 2), 0, 0, -0.1), '#2a8fa0', { lo:0.8, hi:1.1 }),
      part(egg(0.02, 0.02, 0.028), '#1f6f86'), part(at(egg(0.022, 0.018, 0.018), 0, 0.006, 0.03), '#7fe0ff', { lo:1, hi:1.1 })]),
    wing:() => wing([ellipse(0.065, 0, 0.066, 0.015)], '#d6fbff', '#ffffff'), clear:true },
  gull:     { path:'patrol', bird:true, scale:2.1, wings:2, hinge:[0.03, 0.02, 0.02], flap:7, amp:0.6, open:0.12, gap:0.45, d:4.6, rho:[2.2, 3.2], h:[2.4, 3.6], sp:[0.42, 0.56] },
  swallow:  { path:'patrol', bird:true, scale:1.5, wings:2, hinge:[0.03, 0.02, 0.02], flap:12, amp:0.7, open:0.05, gap:0.15, d:3.4, rho:[1.6, 2.4], h:[1.4, 2.4], sp:[0.95, 1.25], swoop:0.7 },
  pigeon:   { path:'patrol', bird:true, scale:1.6, wings:2, hinge:[0.03, 0.02, 0.02], flap:10, amp:0.65, open:0.1, gap:0.3, d:4, rho:[2, 2.8], h:[2.2, 3.2], sp:[0.5, 0.62] },
  snowbird: { path:'patrol', bird:true, scale:1.3, wings:2, hinge:[0.03, 0.02, 0.02], flap:12, amp:0.7, open:0.08, gap:0.25, d:3.6, rho:[1.6, 2.3], h:[1.8, 2.8], sp:[0.8, 1.0], swoop:0.35 },
  eagle:    { path:'patrol', bird:true, scale:3.6, wings:2, hinge:[0.03, 0.02, 0.02], flap:3.2, amp:0.42, open:0.16, gap:0.85, d:7.5, rho:[4.2, 4.8], h:[5.2, 6], sp:[0.17, 0.2] },
};
const BIRD_WING = {
  gull:     [[[0, 0.05], [0.09, 0.065], [0.19, 0.045], [0.27, 0.005], [0.25, -0.03], [0.15, -0.035], [0.06, -0.05], [0, -0.04]], '#f7f7f2', '#5f6470'],
  swallow:  [[[0, 0.045], [0.1, 0.05], [0.2, 0.02], [0.26, -0.03], [0.2, -0.03], [0.1, -0.035], [0, -0.035]], '#2f3858', '#1d2336'],
  pigeon:   [[[0, 0.05], [0.1, 0.06], [0.19, 0.04], [0.24, 0.0], [0.21, -0.035], [0.1, -0.045], [0, -0.04]], '#9aa0b4', '#5c6178'],
  snowbird: [[[0, 0.045], [0.09, 0.05], [0.17, 0.03], [0.22, -0.01], [0.18, -0.035], [0.08, -0.04], [0, -0.035]], '#5f6470', '#ffffff'],
  eagle:    [[[0, 0.07], [0.12, 0.09], [0.24, 0.075], [0.3, 0.035], [0.315, -0.005], [0.28, -0.045], [0.17, -0.065], [0.06, -0.075], [0, -0.06]], '#6e4d31', '#3c2a1b'],
};
const geoOf = (kind, which) => cached(`fauna:${kind}:${which}`, () => {
  const K = KINDS[kind];
  if(K.bird) return which === 'body' ? birdBody(kind) : wing([outline(BIRD_WING[kind][0])], BIRD_WING[kind][1], BIRD_WING[kind][2]);
  return K[which]();
});

/* ---------------- flyers ---------------- */
function makeFlock(kind, n, T, ctx, r){
  const K = KINDS[kind], mats = ctx.mats;
  const wingMat = K.clear ? mats.clear : K.glow ? mats.pale : mats.fly;
  const body = new THREE.InstancedMesh(geoOf(kind, 'body'), mats.fly, n), wings = new THREE.InstancedMesh(geoOf(kind, 'wing'), wingMat, n * K.wings);
  for(const m of [body, wings]){ m.frustumCulled = false; m.castShadow = false; ctx.world.atmos.add(m); }
  // per-wing pre-transform: mirror for the right side, sweep for dragonfly pairs
  const pre = [], hinge = [], sign = [];
  for(let j = 0; j < K.wings; j++){
    const right = j % 2, sweep = K.sweep ? K.sweep[j >> 1] : 0, m = new THREE.Matrix4().makeRotationY(right ? -sweep : sweep);
    if(right) m.multiply(new THREE.Matrix4().makeScale(-1, 1, 1));
    pre.push(m); sign.push(right ? -1 : 1);
    hinge.push(new THREE.Vector3(right ? -K.hinge[0] : K.hinge[0], K.hinge[1], K.wings > 2 ? (j >> 1 ? -K.hinge[2] : K.hinge[2]) : K.hinge[2]));
  }
  const pick = ([a, b]) => a + r() * (b - a);
  const birds = [];
  for(let k = 0; k < n; k++){
    const b = { ph:r() * 6, x:0, y:0, z:0, hd:r() * 6, bank:0, pitch:0, flap:1, dir:r() < 0.5 ? -1 : 1, a:r() * 6 };
    if(K.path === 'patrol'){ Object.assign(b, { off:(n > 1 ? (k / (n - 1) - 0.5) * 1.8 : 0) + (r() - 0.5) * 0.4, rho:pick(K.rho), h:pick(K.h), sp:pick(K.sp) }); }
    if(K.path === 'dart'){ Object.assign(b, { from:new THREE.Vector3(), to:new THREE.Vector3(), u:1, hold:r() * 1.5 }); b.to.copy(ctx.anchor(r)); b.from.copy(b.to); }
    if(K.path === 'lamp') b.lamp = ctx.lamps[k % ctx.lamps.length];
    birds.push(b);
  }
  if(K.tinted){ const c = new THREE.Color(); for(let k = 0; k < n; k++){ c.set(T.flora[k % T.flora.length]); for(let j = 0; j < K.wings; j++) wings.setColorAt(k * K.wings + j, c); } }
  const s = K.scale;

  const update = (dt, t) => {
    for(let k = 0; k < n; k++){
      const b = birds[k];
      let flapping = 1, px = b.x, pz = b.z, py = b.y;
      if(K.path === 'patrol'){
        // circle a point behind/beside the isle, so birds cross the sky, not the tiles
        const ca = ctx.yaw + Math.PI + b.off, D = ctx.span * 0.5 + K.d;
        b.a += dt * b.sp * b.dir;
        b.x = Math.sin(ca) * D + Math.sin(b.a) * b.rho; b.z = Math.cos(ca) * D + Math.cos(b.a) * b.rho;
        b.y = ctx.top + b.h + (K.swoop || 0) * Math.sin(b.a * 2 + b.ph) + Math.sin(t * 0.6 + b.ph) * 0.2;
        b.hd = Math.atan2(Math.cos(b.a) * b.dir, -Math.sin(b.a) * b.dir);
        b.bank += (-b.dir * 0.42 - b.bank) * Math.min(1, dt * 2);
        flapping = Math.sin(t * (0.5 + b.sp * 0.3) + b.ph) > K.gap * 2 - 1 ? 1 : 0;        // flap a while, then glide
      } else if(K.path === 'flutter'){
        // a wandering loop over the back half of the isle, bobbing as it beats
        b.a += dt * 0.33;
        const R = ctx.span * 0.42 + 0.4, by = ctx.yaw + Math.PI;
        b.x = Math.sin(by) * ctx.span * 0.22 + Math.sin(b.a + b.ph) * R + Math.sin(t * 1.3 + b.ph) * 0.35;
        b.z = Math.cos(by) * ctx.span * 0.22 + Math.cos((b.a + b.ph) * 1.3) * R * 0.8;
        b.y = ctx.top + 0.75 + Math.sin(t * 0.8 + b.ph) * 0.35 + Math.sin(t * 6 + b.ph) * 0.07;
        flapping = Math.sin(t * 0.9 + b.ph * 3) > 0.55 ? 0 : 1;
      } else if(K.path === 'lamp'){
        // moths circle the nearest light (a goal), erratic and close
        const L = b.lamp; b.a += dt * (1.5 + 0.5 * Math.sin(t * 0.7 + b.ph)) * b.dir;
        const R = 0.42 + 0.22 * Math.sin(t * 1.1 + b.ph);
        b.x = L.x + Math.sin(b.a) * R; b.z = L.z + Math.cos(b.a) * R;
        b.y = L.y + 0.85 + Math.sin(t * 1.7 + b.ph * 2) * 0.32 + Math.sin(t * 8 + b.ph) * 0.06;
      } else {
        // dragonfly: hover, then dart to the next spot over water or the rim
        if(b.u < 1){ b.u = Math.min(1, b.u + dt / 0.38); V.lerpVectors(b.from, b.to, ease(b.u)); b.x = V.x; b.y = V.y; b.z = V.z; }
        else {
          b.hold -= dt; b.x = b.to.x + Math.sin(t * 3 + b.ph) * 0.02; b.y = b.to.y + Math.sin(t * 4.2 + b.ph) * 0.03; b.z = b.to.z + Math.cos(t * 2.6 + b.ph) * 0.02;
          if(b.hold <= 0){ b.from.copy(b.to); b.to.copy(ctx.anchor(ctx.r)); b.u = 0; b.hold = 0.7 + ctx.r() * 1.8; }
        }
      }
      if(K.path !== 'patrol'){
        const dx = b.x - px, dz = b.z - pz;
        if(dx * dx + dz * dz > 1e-7) b.hd += wrap(Math.atan2(dx, dz) - b.hd) * Math.min(1, dt * 7);
        b.pitch += (Math.max(-0.5, Math.min(0.5, -(b.y - py) / Math.max(1e-3, dt) * 0.08)) - b.pitch) * Math.min(1, dt * 5);
      }
      b.flap += (flapping - b.flap) * Math.min(1, dt * 3);
      const beat = Math.sin(t * K.flap + b.ph);
      const ang = K.bird ? K.open + b.flap * K.amp * (beat > 0 ? beat : beat * 0.7) + (1 - b.flap) * 0.04 * Math.sin(t * 2 + b.ph)
                         : K.open + b.flap * K.amp * (0.5 + 0.5 * beat);
      E.set(b.pitch, b.hd, b.bank); Q.setFromEuler(E); SC.set(s, s, s); V.set(b.x, b.y, b.z);
      B4.compose(V, Q, SC); body.setMatrixAt(k, B4);
      for(let j = 0; j < K.wings; j++){
        L4.makeRotationZ(sign[j] * (K.wings > 2 ? ang + 0.1 * Math.sin(t * K.flap + j * 1.3) : ang)).multiply(pre[j]).setPosition(hinge[j]);
        W4.multiplyMatrices(B4, L4); wings.setMatrixAt(k * K.wings + j, W4);
      }
    }
    body.instanceMatrix.needsUpdate = true; wings.instanceMatrix.needsUpdate = true;
  };
  return { update };
}

/* ---------------- specials: decor-tile critters ---------------- */
const ray = new THREE.Raycaster(), DOWN = new THREE.Vector3(0, -1, 0);
// The top of whatever stands on tile i (rock, roof, canopy), in its storey's
// coordinates; null if nothing rises clear of the ground.
function topOf(world, i, dx = 0, dz = 0){
  const g = world.groupOf(i), p = world.cellPos(i, false);
  g.updateMatrixWorld(true);                                    // built this load: no render has placed it yet
  ray.set(g.localToWorld(new THREE.Vector3(p.x + dx, p.y + 8, p.z + dz)), DOWN);
  for(const h of ray.intersectObject(g, true)){
    if(!h.object.isMesh || !h.object.visible || h.object.material.transparent || h.object.isInstancedMesh) continue;
    const q = g.worldToLocal(h.point.clone());
    return q.y > p.y + 0.06 ? { q, object:h.object } : null;
  }
  return null;
}
function tiles(world, kind){
  const L = world.level, out = [];
  for(let i = 0; i < L.cells.length; i++) if(L.sid[i] >= 0 && L.cells[i].kind === kind) out.push(i);
  return out;
}
// Is a water tile taken (a crate sank into it, a buoy floats there)?
function taken(world, i){
  for(const m of world.fillers || []) if(m.userData.cell === i) return true;
  return !!(world.buoyMeshes && world.buoyMeshes.has(i));
}
const specialMat = (glow = false) => glow ? new THREE.MeshBasicMaterial({ vertexColors:true }) : new THREE.MeshStandardMaterial({ vertexColors:true, roughness:0.7 });
const critter = (geo, mat, name = '') => { const m = new THREE.Mesh(geo, mat); m.name = 'fauna:' + name; m.castShadow = false; m.receiveShadow = true; m.rotation.order = 'YXZ'; return m; };
const shuffle = (a, r) => { for(let i = a.length - 1; i > 0; i--){ const j = r() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };

const SPECIAL = {
  // a fish that leaps in an arc out of a free water tile, with a splash ring
  fish(world, T, r, used){
    const spots = shuffle(tiles(world, 'water').filter(i => !used.has(i)), r);
    if(!spots.length) return null;
    const tropical = T.id === 'tropical';
    const geo = cached('fauna:fish:' + (tropical ? 't' : 'j'), () => {
      const fin = new THREE.ShapeGeometry(outline([[0, 0], [0.035, -0.05], [0.012, -0.045], [0, -0.03], [-0.012, -0.045], [-0.035, -0.05]]), 2);
      // outline x -> up, y -> back along the body: a vertical tail fin
      fin.applyMatrix4(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0))); fin.translate(0, 0, -0.05); fin.deleteAttribute('uv');
      return bake([part(egg(0.024, 0.032, 0.06), tropical ? '#ff9a3c' : '#7fc9a8', { lo:1.15, hi:0.8 }), tint(fin, tropical ? '#ffd25e' : '#6f9c88', { lo:1, hi:1 })]);
    });
    const mat = specialMat(), fish = critter(geo, mat, 'fish'); fish.visible = false;
    const rmat = new THREE.MeshBasicMaterial({ color:'#ffffff', transparent:true, opacity:0, depthWrite:false });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.06, 0.085, 20).rotateX(-Math.PI / 2), rmat); ring.visible = false;
    const s = { wait:1 + r() * 2, u:-1, i:-1, g:null, x0:0, z0:0, dx:0, dz:0, y:0, ringT:9, rx:0, rz:0 };
    const P = spots.map(i => world.cellPos(i, false));
    return { update(dt, t){
      if(s.u < 0){
        s.wait -= dt; if(s.wait > 0) return;
        const k = ctxPick(spots, world, r);
        if(k < 0){ s.wait = 2; return; }
        s.i = spots[k]; s.g = world.groupOf(s.i); s.g.add(fish, ring);
        if(mat.transparent){ mat.transparent = false; mat.opacity = 1; mat.depthWrite = true; mat.needsUpdate = true; }
        const a = r() * Math.PI * 2; s.dx = Math.sin(a); s.dz = Math.cos(a);
        s.x0 = P[k].x - s.dx * 0.26; s.z0 = P[k].z - s.dz * 0.26; s.y = P[k].y - 0.1; s.u = 0; fish.visible = true;
        s.rx = s.x0; s.rz = s.z0; s.ringT = 0; fish.rotation.y = a;
      }
      if(s.u >= 0){
        s.u += dt / 0.85;
        const u = Math.min(1, s.u);
        fish.position.set(s.x0 + s.dx * 0.52 * u, s.y - 0.05 + Math.sin(Math.PI * u) * 0.5, s.z0 + s.dz * 0.52 * u);
        fish.rotation.x = -Math.atan2(Math.PI * 0.5 * Math.cos(Math.PI * u), 0.52) * 0.9;
        fish.rotation.z = Math.sin(t * 28) * 0.15;
        if(s.u >= 1){ fish.visible = false; s.u = -1; s.wait = 2.5 + r() * 4.5; s.rx = s.x0 + s.dx * 0.52; s.rz = s.z0 + s.dz * 0.52; s.ringT = 0; }
      }
      if(s.ringT < 0.6 && s.g){
        s.ringT += dt; const k = s.ringT / 0.6;
        ring.visible = true; ring.position.set(s.rx, s.y + 0.012, s.rz); ring.scale.setScalar(0.6 + k * 2.4);
        rmat.opacity = (1 - k) * 0.7 * (s.g.userData.fade ?? 1);
      } else ring.visible = false;
    } };
  },

  // a frog on a lily pad near the bank of a water tile; leaves when the tile is
  // filled. It sits by the bank AWAY from the camera, so a cliff never hides it.
  frog(world, T, r, used){
    const L = world.level, bank = [], cx = Math.sin(world.yawTo), cz = Math.cos(world.yawTo);
    for(const i of tiles(world, 'water')){
      const x = i % L.w, z = i / L.w | 0;
      for(const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]){
        const a = x + dx, b = z + dz; if(a < 0 || b < 0 || a >= L.w || b >= L.h) continue;
        const j = b * L.w + a, c = L.cells[j];
        if(L.sid[j] === L.sid[i] && c.kind !== 'void' && c.kind !== 'water' && c.kind !== 'bridge' && dx * cx + dz * cz < 0){ bank.push([i, dx, dz]); break; }
      }
    }
    if(!bank.length) return null;
    const [i, dx, dz] = bank[r() * bank.length | 0]; used.add(i);
    const geo = cached('fauna:frog', () => bake([
      part(egg(0.06, 0.04, 0.065), '#5fb04f', { lo:0.75, hi:1.1 }),
      ...[-1, 1].flatMap(sx => [part(at(egg(0.02, 0.02, 0.02), sx * 0.032, 0.035, 0.03), '#ffffff', { lo:1, hi:1 }),
        part(at(egg(0.01, 0.012, 0.008), sx * 0.034, 0.038, 0.047), '#1d1724', { lo:1, hi:1 }),
        part(at(egg(0.022, 0.014, 0.034), sx * 0.05, -0.022, -0.02), '#4c9a3f', { lo:0.8, hi:1 })]),
      part(at(egg(0.03, 0.012, 0.02), 0, -0.012, 0.045), '#e9f2c0', { lo:1, hi:1 }),
    ]));
    const pad = cached('fauna:pad', () => { const g = new THREE.CircleGeometry(0.16, 14, 0.35, Math.PI * 2 - 0.7); g.rotateX(-Math.PI / 2); g.deleteAttribute('uv'); return part(g, '#3f9a52', { lo:1, hi:1 }); });
    const p = world.cellPos(i, false), g = world.groupOf(i), mat = specialMat();
    const lily = critter(pad, mat, 'lily'), frog = critter(geo, mat, 'frog');
    lily.position.set(p.x + dx * 0.22, p.y - 0.095, p.z + dz * 0.22); lily.rotation.y = r() * 6;
    frog.position.set(lily.position.x, lily.position.y + 0.03, lily.position.z); frog.rotation.y = Math.atan2(-dx, -dz) + (r() - 0.5);
    g.add(lily, frog);
    const s = { hop:-1, wait:3 + r() * 4, from:frog.rotation.y, to:0, check:0 };
    return { update(dt, t){
      if((s.check -= dt) <= 0){ s.check = 0.25; lily.visible = frog.visible = !taken(world, i); }
      if(!frog.visible) return;
      frog.scale.set(1, 1 + Math.sin(t * 3.1) * 0.05, 1);
      if(s.hop < 0){ if((s.wait -= dt) <= 0){ s.hop = 0; s.from = frog.rotation.y; s.to = s.from + (r() - 0.5) * 2.4; } return; }
      s.hop += dt / 0.4; const u = Math.min(1, s.hop);
      frog.position.y = lily.position.y + 0.03 + Math.sin(Math.PI * u) * 0.1; frog.rotation.y = s.from + (s.to - s.from) * ease(u);
      if(u >= 1){ s.hop = -1; s.wait = 4 + r() * 6; }
    } };
  },

  // a lizard basking on a rock top (or clinging to a sun-warmed cliff), doing push-ups
  lizard(world, T, r){
    const geo = cached('fauna:lizard', () => {
      const tail = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, -0.06), new THREE.Vector3(0.02, 0, -0.13), new THREE.Vector3(0.06, 0, -0.2), new THREE.Vector3(0.05, 0, -0.26)]);
      const legs = [];
      for(const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]){
        const l = new THREE.CapsuleGeometry(0.008, 0.035, 2, 4); l.rotateZ(sx * 1.2); l.rotateY(sz * 0.5 * sx); l.translate(sx * 0.04, -0.008, sz * 0.04);
        legs.push(part(l, '#b98a46', { lo:1, hi:1 }));
      }
      return bake([part(egg(0.032, 0.018, 0.075), '#d6a85c', { lo:1.1, hi:0.82 }), part(at(egg(0.025, 0.017, 0.036), 0, 0.004, 0.095), '#cf9f55', { lo:1.05, hi:0.85 }),
        part(trunk(tail, 0.017, 0.004, { segs:6, radial:5 }), '#c79650', { lo:1, hi:0.85 }), ...legs,
        ...[-1, 1].map(sx => part(at(egg(0.006, 0.006, 0.006), sx * 0.02, 0.01, 0.11), '#1d1724', { lo:1, hi:1 }))]);
    });
    const liz = critter(geo, specialMat(), 'lizard');
    let home = null;
    for(const i of shuffle(tiles(world, 'rock'), r)){ const top = topOf(world, i); if(top){ home = world.groupOf(i); liz.position.copy(top.q); liz.position.y += 0.012; liz.rotation.y = r() * 6; break; } }
    if(!home){
      // no rock: cling to an open cliff face, head up, belly to the stone
      const L = world.level;
      for(const i of shuffle(tiles(world, 'ground'), r)){
        const x = i % L.w, z = i / L.w | 0, face = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([dx, dz]) => { const a = x + dx, b = z + dz; return a < 0 || b < 0 || a >= L.w || b >= L.h || L.cells[b * L.w + a].kind === 'void'; });
        if(!face) continue;
        const p = world.cellPos(i, false), n = new THREE.Vector3(face[0], 0, face[1]), up = new THREE.Vector3(0, 1, 0);
        liz.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(n, up), n, up));
        liz.position.set(p.x + face[0] * 0.505, p.y - 0.34, p.z + face[1] * 0.505); home = world.groupOf(i); break;
      }
    }
    if(!home) return null;
    home.add(liz);
    const base = liz.position.clone(), lift = new THREE.Vector3(0, 1, 0).applyQuaternion(liz.quaternion);
    const s = { push:-1, wait:2 + r() * 4 };
    return { update(dt){
      if(s.push < 0){ if((s.wait -= dt) <= 0) s.push = 0; return; }
      s.push += dt / 0.9; const u = Math.min(1, s.push);
      liz.position.copy(base).addScaledVector(lift, Math.abs(Math.sin(u * Math.PI * 3)) * 0.014);
      if(u >= 1){ s.push = -1; s.wait = 3 + r() * 5; liz.position.copy(base); }
    } };
  },

  // a crab scuttling sideways round the foot of a palm (or on a rock top)
  crab(world, T, r){
    const geo = cached('fauna:crab', () => {
      const red = '#ff6a4d', legs = [];
      for(const sx of [-1, 1]) for(let k = 0; k < 3; k++){
        const l = new THREE.CapsuleGeometry(0.006, 0.04, 2, 4); l.rotateZ(sx * 1.0); l.rotateY((k - 1) * 0.45 * sx); l.translate(sx * 0.055, 0.0, (k - 1) * 0.02);
        legs.push(part(l, '#e85a3f', { lo:1, hi:1 }));
      }
      return bake([part(egg(0.05, 0.026, 0.038), red, { lo:0.85, hi:1.1 }), ...legs,
        ...[-1, 1].flatMap(sx => [part(at(egg(0.02, 0.016, 0.022), sx * 0.045, 0.012, 0.05), red, { lo:0.9, hi:1.05 }),
          part(at(egg(0.008, 0.008, 0.008), sx * 0.014, 0.034, 0.03), '#1d1724', { lo:1, hi:1 })])]);
    });
    const crab = critter(geo, specialMat(), 'crab');
    let home = null, p = null, rad = 0;
    for(const i of shuffle(tiles(world, 'tree'), r)){ home = world.groupOf(i); p = world.cellPos(i, false); rad = 0.33; break; }
    if(!home) for(const i of shuffle(tiles(world, 'rock'), r)){ const top = topOf(world, i); if(top){ home = world.groupOf(i); p = top.q; rad = 0; break; } }
    if(!home) return null;
    home.add(crab);
    const s = { base:r() * 6, th:0, walk:0, wait:1 + r() * 2, dir:1 };
    const place = () => { const a = s.base + s.th; crab.position.set(p.x + Math.sin(a) * rad, p.y + 0.024, p.z + Math.cos(a) * rad); crab.rotation.y = a; };
    place();
    return { update(dt, t){
      if(s.walk > 0){
        s.walk -= dt; s.th = Math.max(-0.9, Math.min(0.9, s.th + s.dir * dt * (rad ? 1.4 : 0)));
        if(!rad) crab.rotation.y += s.dir * dt * 1.5;
        crab.rotation.z = Math.sin(t * 38) * 0.08; place(); if(!rad) crab.rotation.y = s.base + s.th;
        crab.position.y += Math.abs(Math.sin(t * 38)) * 0.006;
      } else if((s.wait -= dt) <= 0){ s.walk = 0.5 + r() * 0.8; s.wait = 1.2 + r() * 2.5; s.dir = s.th > 0.5 ? -1 : s.th < -0.5 ? 1 : r() < 0.5 ? -1 : 1; crab.rotation.z = 0; }
    } };
  },

  // two pigeons on a rooftop, pecking and turning
  pigeons(world, T, r){
    let home = null, spots = [];
    for(const i of shuffle(tiles(world, 'rock'), r)){
      const a = topOf(world, i, -0.13, 0), b = topOf(world, i, 0.13, 0);
      if(a && b && Math.abs(a.q.y - b.q.y) < 0.05){ spots = [a.q, b.q]; home = world.groupOf(i); break; }
      if(a || b){ spots = [(a || b).q]; home = world.groupOf(i); break; }
    }
    if(!home) return null;
    // perched: chest up, head high, tail low, an iridescent neck and pink feet
    const geo = cached('fauna:pigeon-perched', () => {
      const tail = new THREE.ShapeGeometry(outline([[0, 0.01], [0.03, -0.005], [0.035, -0.06], [-0.035, -0.06], [-0.03, -0.005]]), 2);
      tail.rotateX(Math.PI / 2 + 0.5); tail.translate(0, 0.0, -0.045); tail.deleteAttribute('uv');
      return bake([
        part(egg(0.04, 0.036, 0.058).rotateX(-0.35), '#9a9fb3', { lo:0.8, hi:1.05 }),
        part(at(egg(0.027, 0.024, 0.026), 0, 0.04, 0.03), '#6f8a86', { lo:1, hi:1.1 }),          // the green-violet neck
        part(at(egg(0.024, 0.024, 0.026), 0, 0.066, 0.042), '#7a7f96', { lo:0.95, hi:1.05 }),
        part(at(new THREE.ConeGeometry(0.007, 0.022, 6).rotateX(Math.PI / 2 + 0.25), 0, 0.062, 0.072), '#e6d6c3', { lo:1, hi:1 }),
        ...[-1, 1].map(sx => part(at(egg(0.005, 0.005, 0.004), sx * 0.018, 0.072, 0.058), '#ff9a3c', { lo:1, hi:1 })),
        tint(tail, '#6d7186', { lo:1, hi:1 }),
        ...[-1, 1].map(sx => part(at(new THREE.CapsuleGeometry(0.005, 0.022, 2, 4), sx * 0.016, -0.04, 0.005), '#e88a8a', { lo:1, hi:1 })),
      ]);
    });
    const im = new THREE.InstancedMesh(geo, specialMat(), spots.length); im.name = 'fauna:pigeons'; im.frustumCulled = false; im.castShadow = false;
    home.add(im);
    const birds = spots.map(q => ({ q, hd:r() * 6, peck:-1, wait:r() * 3, turn:0 }));
    return { update(dt, t){
      birds.forEach((b, k) => {
        let pitch = 0;
        if(b.peck >= 0){ b.peck += dt / 0.35; pitch = Math.sin(Math.min(1, b.peck) * Math.PI) * 0.75; if(b.peck >= 1) b.peck = -1; }
        else if((b.wait -= dt) <= 0){ if(r() < 0.6) b.peck = 0; else b.turn = (r() - 0.5) * 2.2; b.wait = 0.8 + r() * 2.6; }
        const step = b.turn * Math.min(1, dt * 4); b.hd += step; b.turn -= step;
        E.set(pitch, b.hd, 0); Q.setFromEuler(E); SC.set(1.15, 1.15, 1.15); V.set(b.q.x, b.q.y + 0.062 + Math.abs(Math.sin(t * 2 + k)) * 0.003, b.q.z);
        B4.compose(V, Q, SC); im.setMatrixAt(k, B4);
      });
      im.instanceMatrix.needsUpdate = true;
    } };
  },

  // an owl perched on a canopy, glowing eyes blinking, slowly looking around
  owl(world, T, r){
    let top = null, home = null;
    for(const i of shuffle(tiles(world, 'tree'), r)){ top = topOf(world, i); if(top){ home = world.groupOf(i); break; } }
    if(!top) return null;
    const geo = cached('fauna:owl', () => bake([
      part(egg(0.07, 0.085, 0.06), '#a88f74', { lo:0.75, hi:1.08 }), part(at(egg(0.055, 0.06, 0.03), 0, 0.012, 0.035), '#f0e4cc', { lo:0.95, hi:1.05 }),
      ...[-1, 1].map(sx => part(at(new THREE.ConeGeometry(0.018, 0.045, 6).rotateZ(-sx * 0.35), sx * 0.04, 0.085, 0), '#8a735c', { lo:0.9, hi:1 })),
      part(at(new THREE.ConeGeometry(0.01, 0.022, 6).rotateX(Math.PI * 0.6), 0, 0.012, 0.068), '#e8b04a', { lo:1, hi:1 }),
    ]));
    const eyesG = cached('fauna:owl-eyes', () => bake([-1, 1].map(sx => part(at(egg(0.016, 0.016, 0.008), sx * 0.024, 0.035, 0.062), '#ffd27a', { lo:1, hi:1 }))));
    const owl = critter(geo, specialMat(), 'owl'), eyes = critter(eyesG, specialMat(true), 'owl-eyes');
    // it faces the camera (give or take), so its glowing eyes read from the start
    const face = Math.atan2(Math.sin(world.yawTo), Math.cos(world.yawTo)) + (r() - 0.5) * 0.8;
    owl.add(eyes); owl.rotation.y = face;
    // perch on the canopy mesh itself, so the owl sways with its tree
    const holder = new THREE.Group(); holder.position.copy(top.q); holder.position.y += 0.06; holder.add(owl);
    home.add(holder); home.updateMatrixWorld(true); top.object.attach(holder);
    const s = { look:face, to:face, blink:2 + r() * 3, wait:2 + r() * 3 };
    return { update(dt){
      if((s.wait -= dt) <= 0){ s.to = s.look + (r() - 0.5) * 1.8; s.wait = 2.5 + r() * 4; }
      owl.rotation.y += (s.to - owl.rotation.y) * Math.min(1, dt * 2.5);
      s.blink -= dt; eyes.scale.y = s.blink < 0.12 ? 0.15 : 1; if(s.blink < 0) s.blink = 2.5 + r() * 4;
    } };
  },
};
// pick a free water spot (index into spots), preferring storeys in full view
function ctxPick(spots, world, r){
  const n = spots.length, k0 = r() * n | 0;
  for(let k = 0; k < n; k++){ const i = spots[(k0 + k) % n]; if(!taken(world, i) && (world.groupOf(i).userData.fade ?? 1) > 0.95) return (k0 + k) % n; }
  return -1;
}

/* ---------------- the cast ---------------- */
export function makeFauna(world, T, r){
  const cast = CAST[T.id] || CAST.jungle, rr = rng(hashStr('fauna' + T.id) ^ (r() * 1e9));
  const L = world.level, top = Math.max(...L.storeys.map((s, k) => (s.at[2] + world.storeyTop[k]) * LV));
  const water = tiles(world, 'water').map(i => world.cellPos(i, false));
  const rimSpots = [];
  // no water: just off the open rim (never hovering over the tiles)
  for(let i = 0; i < L.cells.length && rimSpots.length < 16; i++){
    if(L.sid[i] < 0 || L.cells[i].kind === 'void') continue;
    const x = i % L.w, z = i / L.w | 0;
    for(const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]){
      const a = x + dx, b = z + dz;
      if(a >= 0 && b >= 0 && a < L.w && b < L.h && L.cells[b * L.w + a].kind !== 'void') continue;
      const p = world.cellPos(i, false); p.x += dx * 0.85; p.z += dz * 0.85; rimSpots.push(p); break;
    }
  }
  const lamps = world.goals.length ? world.goals.map(g => g.position.clone().add(new THREE.Vector3(0, 0.35, 0))) : [new THREE.Vector3(0, top + 0.6, 0)];
  const tmp = new THREE.Vector3();
  const ctx = {
    world, r:rr, top, span:world.mapSpan, yaw:world.yaw, lamps,
    mats:{
      fly:new THREE.MeshStandardMaterial({ vertexColors:true, side:THREE.DoubleSide, roughness:0.75 }),
      pale:new THREE.MeshStandardMaterial({ vertexColors:true, side:THREE.DoubleSide, roughness:0.9, emissive:'#ffffff', emissiveIntensity:0.18 }),
      clear:new THREE.MeshStandardMaterial({ vertexColors:true, side:THREE.DoubleSide, transparent:true, opacity:0.5, depthWrite:false, roughness:0.3, emissive:'#bff4ff', emissiveIntensity:0.2 }),
    },
    // dragonflies hover over water if there is any, else just off the rim
    anchor(rnd){
      const pool = water.length ? water : rimSpots, p = pool[rnd() * pool.length | 0];
      return tmp.set(p.x + (rnd() - 0.5) * 0.5, p.y + (water.length ? 0.32 : 0.55) + rnd() * 0.3, p.z + (rnd() - 0.5) * 0.5);
    },
  };
  const parts = cast.fly.map(([kind, n]) => makeFlock(kind, n, T, ctx, rr));
  const used = new Set();
  for(const k of cast.special){ const s = SPECIAL[k](world, T, rr, used); if(s){ s.kind = k; parts.push(s); } }
  return { parts, update(dt, t){
    ctx.yaw += wrap(world.yaw - ctx.yaw) * Math.min(1, dt * 0.6);        // birds drift round behind a turned camera slowly
    for(const p of parts) p.update(dt, t);
  } };
}
