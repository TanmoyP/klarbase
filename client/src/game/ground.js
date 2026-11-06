// Ground-level biome art per theme: rocks, flora tiles and the scatter (tufts,
// pebbles, snow mounds) sprinkled over open ground. r = the cell's seeded rng;
// kit = the storey's shared materials (softkit).
import * as THREE from 'three';
import { LV, rng, hashStr, col, paint, flat, mesh } from './props.js';

export function makeRock(T, r, kit){
  const g = new THREE.Group();
  if(T.prop === 'planter'){                       // urban: a little building with lit windows
    const h = 0.7 + r() * 0.7, w = 0.82;
    const b = mesh(new THREE.BoxGeometry(w, h, w), flat(r() < 0.5 ? T.strata[0] : T.rock));
    b.position.y = h / 2; g.add(b);
    const roof = mesh(new THREE.BoxGeometry(w + 0.06, 0.06, w + 0.06), flat(T.lip)); roof.position.y = h + 0.03; g.add(roof);
    const winMat = new THREE.MeshStandardMaterial({ color:T.accent, emissive:T.accent, emissiveIntensity:1.3 });
    const darkMat = flat('#2a2433');
    for(let f = 0; f < 4; f++) for(let row = 0; row < Math.floor(h / 0.28); row++) for(let c = -1; c <= 1; c += 2){
      const wdw = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.02), r() < 0.6 ? winMat : darkMat);
      const a = f * Math.PI / 2;
      wdw.position.set(Math.sin(a) * (w/2 + 0.005) + Math.cos(a) * c * 0.2, 0.22 + row * 0.28, Math.cos(a) * (w/2 + 0.005) - Math.sin(a) * c * 0.2);
      wdw.rotation.y = a; g.add(wdw);
    }
    if(r() < 0.4){ const ant = mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.4), flat(T.metal)); ant.position.set(0.2, h + 0.2, 0.2); g.add(ant); }
    return g;
  }
  if(T.prop === 'palm' && T.label === 'Oasis'){   // sandstone mesa
    let y = 0;
    for(let i = 0; i < 3; i++){
      const hh = 0.22 + r() * 0.12, rad = 0.46 - i * 0.08;
      const s = mesh(new THREE.CylinderGeometry(rad * 0.92, rad, hh, 7), flat(i % 2 ? T.rock : T.rockTop));
      s.position.set((r() - 0.5) * 0.08, y + hh / 2, (r() - 0.5) * 0.08); s.rotation.y = r() * 3; g.add(s); y += hh;
    }
    return g;
  }
  const capColor = col(T.rockTop), rockColor = col(T.rock);
  for(let i = 0; i < 2 + (r() * 2 | 0); i++){
    const rad = i === 0 ? 0.38 : 0.16 + r() * 0.12;
    const geo = new THREE.DodecahedronGeometry(rad, 0);
    geo.scale(1, 0.75 + r() * 0.3, 1);
    paint(geo, (p, n) => n.y > 0.45 ? capColor : rockColor);
    const m = mesh(geo, new THREE.MeshStandardMaterial({ vertexColors:true, flatShading:true, roughness:0.95 }));
    m.position.set(i ? (r() - 0.5) * 0.6 : 0, rad * 0.6, i ? (r() - 0.5) * 0.6 : 0); m.rotation.set(r(), r() * 6, r());
    g.add(m);
  }
  return g;
}

export function makeFlora(T, r, kit){
  const g = new THREE.Group();
  const n = 2 + (r() * 3 | 0);
  for(let i = 0; i < n; i++){
    const x = (r() - 0.5) * 0.6, z = (r() - 0.5) * 0.6;
    if(T.prop === 'pine' && r() < 0.3){
      const s = mesh(new THREE.SphereGeometry(0.08 + r() * 0.05, 6, 4), flat('#ffffff')); s.scale.y = 0.5; s.position.set(x, 0.02, z); g.add(s); continue;
    }
    const stem = mesh(new THREE.ConeGeometry(0.05, 0.16 + r() * 0.12, 4), flat(r() < 0.5 ? T.leaf : T.leafAlt), false);
    stem.position.set(x, 0.08, z); stem.rotation.z = (r() - 0.5) * 0.5; g.add(stem);
    if(r() < 0.7){
      const f = mesh(new THREE.IcosahedronGeometry(0.045 + r() * 0.025, 0), new THREE.MeshStandardMaterial({ color:T.flora[i % T.flora.length], flatShading:true, emissive:T.flora[i % T.flora.length], emissiveIntensity:0.15 }), false);
      f.position.set(x, 0.19 + r() * 0.06, z); g.add(f);
    }
  }
  if(T.prop === 'planter' && r() < 0.5){
    const pot = mesh(new THREE.CylinderGeometry(0.1, 0.08, 0.14, 8), flat(T.strata[0])); pot.position.set(0.18, 0.07, -0.15); g.add(pot);
    const bush = mesh(new THREE.IcosahedronGeometry(0.11, 0), flat(T.leafAlt)); bush.position.set(0.18, 0.2, -0.15); g.add(bush);
  }
  return g;
}

// Small grass tufts / pebbles / snow mounds scattered on open ground.
export function makeScatter(level, T, centre, kit){
  const r = rng(hashStr('tuft' + level.cells.map(c => c.ch).join('')));
  const pts = [];
  for(let z = 0; z < level.h; z++) for(let x = 0; x < level.w; x++){
    const c = level.cells[z*level.w + x];
    if(c.kind !== 'ground' || c.flora) continue;
    for(let k = 0; k < 4; k++) if(r() < 0.6) pts.push([x - centre[0] + (r() - 0.5) * 0.85, c.h * LV, z - centre[1] + (r() - 0.5) * 0.85, r()]);
  }
  if(!pts.length) return null;
  const pebble = T.prop === 'planter' || T.label === 'Oasis', snow = T.prop === 'pine';
  const geo = pebble ? new THREE.DodecahedronGeometry(0.035, 0) : snow ? new THREE.SphereGeometry(0.05, 5, 3) : new THREE.ConeGeometry(0.025, 0.12, 3);
  if(!pebble && !snow) geo.translate(0, 0.06, 0);
  const mat = flat(pebble ? T.lip : snow ? '#ffffff' : T.leafAlt, { roughness:1 });
  const im = new THREE.InstancedMesh(geo, mat, pts.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3();
  pts.forEach(([x, y, z, k], i) => {
    q.setFromEuler(new THREE.Euler((k - 0.5) * 0.4, k * 6, (k - 0.5) * 0.4));
    sc.setScalar(0.7 + k * 0.8); if(snow) sc.y *= 0.45;
    ps.set(x, y, z); m4.compose(ps, q, sc); im.setMatrixAt(i, m4);
  });
  im.receiveShadow = true;
  return im;
}
