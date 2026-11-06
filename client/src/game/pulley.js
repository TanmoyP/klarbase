// Sky Scales rig (K1; art pass 2026-11). An old gnarled sky-branch grows out from
// under the rim of a pan's isle and arcs over the pans; a grooved wooden sheave
// hangs from it above every pan tile, and one hemp rope runs hook → sheave →
// along the branch → sheave → hook. The engine decides the tilt; the rig only
// shows it: each sheave turns by exactly the rope that ran over it, the settle is
// an underdamped spring (the heavy side drops, overshoots a touch, rebounds once)
// and the baskets rock from the jolt, then breathe in the breeze.
// buildRig(world, T) -> null | { settleTime, settle(t, delta), sync(), update(dt, t) }
import * as THREE from 'three';
import { LV, PAN_HOOK, HEMP, rng, hashStr } from './props.js';
import { blob, trunk, soften, tint, bake, cached, kitMesh } from './softkit.js';

const R = 0.16;                 // sheave radius; the rope rides its groove
const ROPE = 0.026;             // rope radius
const DROP = 0.27;              // branch centre-line -> sheave axle
const CLEAR = 0.7;              // highest hook (pan fully raised) -> just under the sheave
// settle spring: ζ 0.56, ω 14 -> 12 % overshoot at 0.27 s, a ~1 % rebound, snapped at 0.6 s
const SETTLE = 0.6, W = 14, Z = 0.56, SIG = Z * W, WD = W * Math.sqrt(1 - Z * Z);
const stepX = t => 1 - Math.exp(-SIG * t) * (Math.cos(WD * t) + SIG / WD * Math.sin(WD * t));
const stepA = t => W * W / WD * Math.exp(-SIG * t) * (WD * Math.cos(WD * t) - SIG * Math.sin(WD * t));
// basket swing: a ~1.2 Hz damped rock driven by the pan's vertical jolt, soft-capped at 3°;
// an idle breeze of ≤ 0.6° on top
const SW = 7.5, SZ = 0.22, KICK = 0.13, MAXT = 0.052, IDLE = 0.0105;

const UP = new THREE.Vector3(0, 1, 0), ZAX = new THREE.Vector3(0, 0, 1);
const hdist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const hdir = (from, to) => { const v = new THREE.Vector3(to.x - from.x, 0, to.z - from.z); return v.lengthSq() > 1e-6 ? v.normalize() : new THREE.Vector3(1, 0, 0); };

/* ---------------- parts ---------------- */
// A sheave in its own frame: axle along +Z, rope groove between two rims, spokes
// that stand proud of the disc so you can see it turn. Cached per theme.
function sheave(T){
  return cached('sheave:' + T.id, () => {
    const parts = [];
    for(const z of [-0.034, 0.034]){ const rim = new THREE.TorusGeometry(R, 0.026, 6, 20); rim.translate(0, 0, z); parts.push(tint(soften(rim, 0.8), T.woodDark, { lo:0.8, hi:1.05 })); }
    const core = new THREE.CylinderGeometry(R - 0.03, R - 0.03, 0.05, 18); core.rotateX(Math.PI / 2);
    parts.push(tint(soften(core, 0.6), T.wood, { lo:0.85, hi:1.0 }));
    for(let k = 0; k < 3; k++){
      const sp = new THREE.BoxGeometry(0.034, R * 1.72, 0.074); sp.rotateZ(k * Math.PI / 3);
      parts.push(tint(soften(sp, 0.6), T.wood, { lo:1.08, hi:1.2 }));
    }
    const hub = new THREE.CylinderGeometry(0.05, 0.05, 0.1, 10); hub.rotateX(Math.PI / 2);
    parts.push(tint(soften(hub, 0.7), T.metal, { lo:0.8, hi:1.1 }));
    return bake(parts);
  });
}

// An old twisted branch along a curve: radius r0 → r1, three ridges spiralling
// round it (bark), ridges a shade darker. Soft-faceted.
function gnarl(curve, r0, r1, T, seed){
  const len = curve.getLength(), segs = Math.max(12, Math.ceil(len * 5)), radial = 8;
  const g = new THREE.TubeGeometry(curve, segs, 1, radial, false), p = g.attributes.position, v = new THREE.Vector3();
  const col = new Float32Array(p.count * 3), dark = new THREE.Color(T.woodDark), light = new THREE.Color(T.trunk), c = new THREE.Color();
  for(let i = 0; i <= segs; i++){
    const t = i / segs, ctr = curve.getPointAt(t);
    const rad = (r0 + (r1 - r0) * Math.pow(t, 0.7)) * (1 + 0.1 * Math.sin(i * 0.9 + seed) * Math.sin(i * 0.37 + seed * 2));
    for(let j = 0; j <= radial; j++){
      const k = i * (radial + 1) + j, ridge = Math.sin(3 * (j / radial) * Math.PI * 2 + i * 0.5 + seed);
      v.fromBufferAttribute(p, k).sub(ctr).multiplyScalar(rad * (1 + 0.12 * ridge)).add(ctr); p.setXYZ(k, v.x, v.y, v.z);
      c.copy(dark).lerp(light, 0.55 + 0.45 * ridge).multiplyScalar(0.72 + 0.3 * Math.min(1, t * 2.5));
      col[k*3] = c.r; col[k*3+1] = c.g; col[k*3+2] = c.b;
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return soften(g, 0.55);
}

const leafClump = (T, r, at, s = 1) => [0, 1, 2].map(k => {
  const b = blob((0.15 + r() * 0.07) * s, r, { wobble:0.14, squash:0.72 });
  b.translate(at.x + (k - 1) * 0.15 * s, at.y + 0.06 + (k === 1 ? 0.08 : 0) * s, at.z + (r() - 0.5) * 0.18 * s);
  return tint(soften(b, 1), k === 1 ? T.leafAlt : T.leaf, { lo:0.7, hi:1.08, jitter:0.08 }, r);
});
const strand = (a, b, rad = ROPE) => {
  const d = new THREE.Vector3().subVectors(b, a), g = new THREE.CylinderGeometry(rad, rad, d.length(), 6, 1, true);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d.clone().normalize()));
  g.translate(a.x + d.x / 2, a.y + d.y / 2, a.z + d.z / 2);
  return tint(soften(g, 1), HEMP, { lo:0.88, hi:1.0 });
};

/* ---------------- the rig ---------------- */
export function buildRig(world, T){
  const L = world.level;
  if(!L || !L.pans) return null;
  const all = [...L.pans.a, ...L.pans.b], at = new Map(all.map(i => [i, world.cellPos(i, false)]));   // built at tilt 0
  const r = rng(hashStr('rig' + all.join(',')));

  // chain: from the a-tile farthest from the b side, then nearest neighbour
  const bc = L.pans.b.reduce((v, i) => v.add(at.get(i)), new THREE.Vector3()).divideScalar(L.pans.b.length);
  const chain = [L.pans.a.reduce((m, i) => hdist(at.get(i), bc) > hdist(at.get(m), bc) ? i : m)];
  const left = new Set(all); left.delete(chain[0]);
  while(left.size){ const last = at.get(chain[chain.length - 1]); let best = null; for(const i of left) if(best === null || hdist(at.get(i), last) < hdist(at.get(best), last)) best = i; chain.push(best); left.delete(best); }

  const top = Math.max(...all.map(i => (L.storeys[L.sid[i]].at[2] + L.cells[i].h + 1) * LV)) + PAN_HOOK + CLEAR + DROP;
  // a sheave per pan, set so the rope drops plumb over the tile and runs to its neighbour
  const wheels = chain.map((i, k) => {
    const p = at.get(i), dir = hdir(p, at.get(chain[k === 0 ? 1 : k - 1])), axis = new THREE.Vector3().crossVectors(dir, UP);
    const axle = new THREE.Vector3(p.x + dir.x * R, top - DROP, p.z + dir.z * R);
    const base = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(dir, UP, axis));
    return { i, dir, axis, axle, base, drop:new THREE.Vector3(p.x, top - DROP, p.z), rest:p.y, side:L.cells[i].pan, ph:r() * 6 };
  });

  // root: a cut face of a pan's isle — near an end of the chain, pointing out along
  // it, low enough to arc up, and on the far side from the camera so the branch
  // never rises in front of the puzzle
  const cam = new THREE.Vector3(Math.sin(world.yawTo || 0), 0, Math.cos(world.yawTo || 0));
  const ends = [0, chain.length - 1].map(k => ({ k, p:wheels[k].axle, out:hdir(wheels[k === 0 ? 1 : k - 1].axle, wheels[k].axle) }));
  const homes = new Set(all.map(i => L.sid[i])), solid = j => L.sid[j] >= 0 && L.cells[j].kind !== 'void';
  let root = null;
  for(let j = 0; j < L.cells.length; j++){
    if(!homes.has(L.sid[j]) || !solid(j) || L.cells[j].kind === 'pan') continue;
    const x = j % L.w, z = (j / L.w) | 0, c = world.cellPos(j, false);
    for(const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]){
      const n = (x + dx >= 0 && x + dx < L.w && z + dz >= 0 && z + dz < L.h) ? j + dz * L.w + dx : -1;
      if(n >= 0 && L.sid[n] === L.sid[j] && (solid(n) || L.cells[n].kind === 'pan')) continue;   // not an edge
      let xx = x + dx, zz = z + dz, inner = false;          // an outer rim only: nothing of this isle further out
      for(; xx >= 0 && xx < L.w && zz >= 0 && zz < L.h; xx += dx, zz += dz){ const m = zz * L.w + xx; if(L.sid[m] === L.sid[j] && L.cells[m].kind !== 'void'){ inner = true; break; } }
      if(inner) continue;
      const nrm = new THREE.Vector3(dx, 0, dz), face = c.clone().addScaledVector(nrm, 0.5);
      for(const e of ends){
        const score = hdist(face, e.p) + 0.35 * (top - c.y) + 0.8 * (1 - nrm.dot(e.out)) + 1.6 * nrm.dot(cam) + 2 * Math.max(0, nrm.dot(cam));
        if(!root || score < root.score) root = { score, face, y:c.y, nrm, e };
      }
    }
  }

  if(!root) root = { face:at.get(chain[0]).clone(), y:at.get(chain[0]).y, nrm:ends[0].out, e:ends[0] };
  // the branch: in under the rim, out and up, over every sheave, a curling leafy tip
  const beam = wheels.map(w => new THREE.Vector3(w.axle.x, top, w.axle.z));
  if(root.e.k !== 0) beam.reverse();
  const pts = [], { face, y, nrm } = root, rise = top - y;
  pts.push(face.clone().addScaledVector(nrm, -0.06).setY(y - 0.4));
  pts.push(face.clone().addScaledVector(nrm, 0.32).setY(y - 0.05));
  pts.push(face.clone().addScaledVector(nrm, 0.5).setY(y + rise * 0.55));
  const join = beam[0], toRoot = hdir(join, face);
  if(hdist(face, join) > 0.9) pts.push(join.clone().addScaledVector(toRoot, Math.min(0.6, hdist(face, join) * 0.4)).setY(top + 0.14));
  for(let k = 0; k < beam.length; k++){
    pts.push(beam[k]);
    if(k < beam.length - 1){                              // a little lift and wander between sheaves
      const m = beam[k].clone().lerp(beam[k + 1], 0.5), side = new THREE.Vector3().crossVectors(hdir(beam[k], beam[k + 1]), UP);
      if(hdist(beam[k], beam[k + 1]) > 0.8) pts.push(m.addScaledVector(side, (r() - 0.5) * 0.12).setY(top + 0.08 + r() * 0.06));
    }
  }
  const last = beam[beam.length - 1], out = beam.length > 1 ? hdir(beam[beam.length - 2], last) : nrm.clone().negate();
  pts.push(last.clone().addScaledVector(out, 0.45).setY(top + 0.06), last.clone().addScaledVector(out, 0.68).setY(top + 0.3));
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');

  const parts = [gnarl(curve, 0.125, 0.04, T, r() * 6)];
  for(let k = 0; k < 3; k++){                               // roots splayed against the cut face
    const side = new THREE.Vector3().crossVectors(nrm, UP).multiplyScalar((k - 1) * 0.28), a = pts[0].clone().addScaledVector(nrm, 0.1);
    const c = new THREE.QuadraticBezierCurve3(a, a.clone().add(side).addScaledVector(nrm, 0.12).setY(a.y - 0.12), a.clone().add(side.multiplyScalar(1.4)).addScaledVector(nrm, 0.04).setY(a.y - 0.42 - r() * 0.2));
    parts.push(tint(soften(trunk(c, 0.06, 0.015, { segs:5, radial:6 }), 0.6), T.woodDark, { lo:0.55, hi:0.9 }));
  }
  for(const t of [0.18 + r() * 0.1, 0.55 + r() * 0.2]){    // burls
    const b = blob(0.075 + r() * 0.03, r, { wobble:0.2 }), q = curve.getPointAt(t); b.translate(q.x, q.y, q.z);
    parts.push(tint(soften(b, 0.6), T.woodDark, { lo:0.8, hi:1.0 }));
  }
  // leaves only where they can't hide a tile: the rising elbow (outside the isle) and the tip
  parts.push(...leafClump(T, r, pts[2].clone().addScaledVector(nrm, 0.2).add(new THREE.Vector3(0, -0.1, 0)), 0.9));
  parts.push(...leafClump(T, r, pts[pts.length - 1], 0.85));

  // yokes + the rope's run: over each sheave's groove, and taut from sheave to sheave
  const m4 = new THREE.Matrix4(), groove = R + ROPE - 0.012;
  for(const w of wheels){
    m4.compose(w.axle, w.base, new THREE.Vector3(1, 1, 1));
    for(const z of [-0.064, 0.064]){
      const cheek = new THREE.BoxGeometry(0.1, DROP + 0.04, 0.024); cheek.translate(0, DROP / 2 + 0.01, z); cheek.applyMatrix4(m4);
      parts.push(tint(soften(cheek, 0.6), T.woodDark, { lo:0.8, hi:1.0 }));
      const bolt = new THREE.CylinderGeometry(0.03, 0.03, 0.02, 8); bolt.rotateX(Math.PI / 2); bolt.translate(0, 0, z * 1.25); bolt.applyMatrix4(m4);
      parts.push(tint(soften(bolt, 0.8), T.metal, { lo:0.85, hi:1.1 }));
    }
    const band = new THREE.TorusGeometry(0.105, 0.02, 6, 14); band.rotateY(Math.PI / 2); band.translate(0, DROP, 0); band.applyMatrix4(m4);
    parts.push(tint(soften(band, 1), T.metal, { lo:0.8, hi:1.05 }));
    const arc = new THREE.CatmullRomCurve3([0, 1, 2, 3, 4].map(k => { const a = Math.PI / 2 + k / 4 * Math.PI / 2; return new THREE.Vector3(Math.cos(a) * groove, Math.sin(a) * groove, 0).applyMatrix4(m4); }));
    parts.push(tint(soften(new THREE.TubeGeometry(arc, 6, ROPE, 6, false), 1), HEMP, { lo:0.9, hi:1.0 }));
  }
  for(let k = 0; k < wheels.length - 1; k++) parts.push(strand(wheels[k].axle.clone().addScaledVector(UP, groove), wheels[k + 1].axle.clone().addScaledVector(UP, groove)));

  const group = new THREE.Group(), mat = new THREE.MeshStandardMaterial({ vertexColors:true, roughness:0.84 });
  group.add(kitMesh(bake(parts), mat));
  const wheelGeo = sheave(T), ropeGeo = tint(soften(new THREE.CylinderGeometry(ROPE, ROPE, 1, 6, 1, true), 1), HEMP, { lo:0.92, hi:0.92 });
  for(const w of wheels){
    w.mesh = kitMesh(wheelGeo, mat); w.mesh.position.copy(w.axle); w.mesh.quaternion.copy(w.base);
    w.rope = kitMesh(ropeGeo, mat); group.add(w.mesh, w.rope);
  }
  world.isle.add(group);

  // per-frame scratch (no allocation in the loops)
  const q = new THREE.Quaternion(), hook = new THREE.Vector3(), d = new THREE.Vector3();
  const swing = { a:{ th:0, om:0 }, b:{ th:0, om:0 } };
  let drive = 0, now = 0;
  const pose = () => {
    for(const w of wheels){
      const pan = world.pans.get(w.i); if(!pan) continue;
      const th = MAXT * Math.tanh(swing[w.side].th / MAXT) + IDLE * Math.sin(now * 1.3 + w.ph) * Math.sin(now * 0.47 + w.ph * 2);
      pan.quaternion.setFromAxisAngle(w.axis, th);
      hook.copy(pan.position).addScaledVector(UP, PAN_HOOK * Math.cos(th)).addScaledVector(w.dir, -PAN_HOOK * Math.sin(th));
      d.subVectors(w.drop, hook); const len = Math.max(0.01, d.length());
      w.rope.position.copy(hook).addScaledVector(d, 0.5); w.rope.scale.set(1, len, 1);
      w.rope.quaternion.setFromUnitVectors(UP, d.divideScalar(len));
    }
  };
  return {
    settleTime:SETTLE,
    // the settle curve at time t for a lean change `delta` (0 → 1 → ~1.12 → 1);
    // records the pans' jolt for the baskets' swing
    settle(t, delta){ drive = -delta * stepA(t) * LV; return stepX(t); },
    // after the world moves the pans: sheaves turn by the rope that ran over them
    sync(){
      for(const w of wheels){
        const pan = world.pans.get(w.i); if(!pan) continue;
        w.mesh.quaternion.multiplyQuaternions(w.base, q.setFromAxisAngle(ZAX, (w.rest - pan.position.y) / R));
      }
      pose();
    },
    update(dt, t){
      const h = Math.min(dt, 1 / 30); now = t;
      const kick = (o, a) => { o.om += (-SW * SW * o.th - 2 * SZ * SW * o.om + KICK * a) * h; o.th += o.om * h; };
      kick(swing.a, drive); kick(swing.b, -drive); drive = 0;
      pose();
    },
  };
}
