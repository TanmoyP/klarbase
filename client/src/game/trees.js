// Trees per theme (biome art). makeTree(T, r, kit) -> THREE.Group standing on
// the tile surface at the origin; userData.sway = the part World sways.
// r = this cell's own seeded rng; kit = the storey's shared materials (softkit).
import * as THREE from 'three';
import { LV, rng, hashStr, col, paint, flat, mesh } from './props.js';

export function makeTree(T, r, kit){
  const g = new THREE.Group(), s = 0.85 + r() * 0.3;
  const leaf = flat(T.leaf), leafAlt = flat(T.leafAlt), trunk = flat(T.trunk);
  if(T.prop === 'palm'){
    let x = 0, y = 0; const bend = (r() - 0.5) * 0.1;
    for(let i = 0; i < 6; i++){
      const seg = mesh(new THREE.CylinderGeometry(0.055, 0.07, 0.2, 6), trunk);
      seg.position.set(x, y + 0.1, 0); seg.rotation.z = -bend * i * 1.2; g.add(seg);
      x += bend * 0.9; y += 0.19;
    }
    const crown = new THREE.Group(); crown.position.set(x, y, 0);
    for(let i = 0; i < 7; i++){
      const f = mesh(new THREE.ConeGeometry(0.09, 0.62, 4), i % 2 ? leaf : leafAlt);
      f.geometry.translate(0, 0.31, 0); f.scale.set(1, 1, 0.25);
      f.rotation.set(0, i / 7 * Math.PI * 2, 1.25 + r() * 0.25, 'YXZ');
      crown.add(f);
    }
    for(let i = 0; i < 3; i++){ const c = mesh(new THREE.SphereGeometry(0.05, 6, 5), flat('#6b4a2b')); c.position.set(Math.cos(i*2)*0.07, -0.05, Math.sin(i*2)*0.07); crown.add(c); }
    g.add(crown); g.userData.sway = crown;
  } else if(T.prop === 'pine'){
    const t = mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.25, 6), trunk); t.position.y = 0.12; g.add(t);
    const crown = new THREE.Group(); g.add(crown);
    const snow = flat('#ffffff');
    for(let i = 0; i < 3; i++){
      const c = mesh(new THREE.ConeGeometry(0.36 - i * 0.09, 0.42, 7), i % 2 ? leafAlt : leaf);
      c.position.y = 0.38 + i * 0.26; crown.add(c);
      const cap = mesh(new THREE.ConeGeometry(0.16 - i * 0.03, 0.12, 7), snow); cap.position.y = 0.56 + i * 0.26; crown.add(cap);
    }
    g.userData.sway = crown;
  } else if(T.prop === 'planter'){
    const box = mesh(new THREE.BoxGeometry(0.5, 0.22, 0.5), flat(T.woodDark)); box.position.y = 0.11; g.add(box);
    const soil = mesh(new THREE.BoxGeometry(0.44, 0.02, 0.44), flat('#3b2a1e')); soil.position.y = 0.22; g.add(soil);
    const t = mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.45, 6), trunk); t.position.y = 0.44; g.add(t);
    const crown = new THREE.Group(); crown.position.y = 0.72; g.add(crown);
    const b = mesh(new THREE.IcosahedronGeometry(0.26, 0), leaf); crown.add(b);
    const b2 = mesh(new THREE.IcosahedronGeometry(0.17, 0), leafAlt); b2.position.set(0.12, 0.12, 0.05); crown.add(b2);
    g.userData.sway = crown;
  } else {                                         // broadleaf jungle tree with vines
    const t = mesh(new THREE.CylinderGeometry(0.06, 0.1, 0.55, 6), trunk); t.position.y = 0.27; g.add(t);
    const crown = new THREE.Group(); crown.position.y = 0.6; g.add(crown);
    const blobs = [[0, 0.12, 0, 0.34, leaf], [0.2, 0, 0.08, 0.24, leafAlt], [-0.18, 0.02, -0.06, 0.22, leafAlt], [0.02, 0.32, -0.04, 0.22, leaf]];
    for(const [bx, by, bz, br, m] of blobs){ const b = mesh(new THREE.IcosahedronGeometry(br, 0), m); b.position.set(bx, by, bz); b.rotation.set(r(), r(), r()); crown.add(b); }
    for(let i = 0; i < 2; i++){ const v = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.35, 4), leafAlt); v.position.set((r()-0.5)*0.4, -0.12, (r()-0.5)*0.4); crown.add(v); }
    g.userData.sway = crown;
  }
  g.scale.setScalar(s); g.rotation.y = r() * 6;
  return g;
}
