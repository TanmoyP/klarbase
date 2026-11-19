// Shrines on the Sky Atlas: a small crossed-arch pedestal on its tile (baked, cached per theme, drawn as
// an instanced prop with the chunk), a soft light column visible from afar, and — once the isle is
// cleared — a warm star-lantern BEACON floating over the arch (that IS the "lit" state).
// The columns and beacons are two InstancedMeshes for the whole map (2 draw calls however many shrines).
import * as THREE from 'three';
import { soften, tint, bake } from '../game/softkit.js';

const C = new THREE.Color();

/* ---------------- the arch ---------------- */
// -> { solid, glow } geometries, origin at the tile floor, 1 tile wide. Cached per theme (userData.keep, so
// chunk disposal leaves them alone; `freeShrineStones` releases them when the map closes).
const STONES = new Map();
export function freeShrineStones(){ for(const s of STONES.values()){ s.solid.dispose(); s.glow.dispose(); } STONES.clear(); }
export function shrineStone(T){
  let r = STONES.get(T.id);
  if(!r){
    r = (() => {
    const solid = [], paint = (g, hex, o = {}) => solid.push(tint(soften(g, 0.6), hex, { lo:0.62, hi:1.04, ...o }));
    const stone = C.set(T.rock).lerp(new THREE.Color('#ffffff'), 0.35).getStyle();
    const lip = C.set(T.lip).lerp(new THREE.Color('#ffffff'), 0.2).getStyle();
    const ped = new THREE.CylinderGeometry(0.4, 0.46, 0.06, 12); ped.translate(0, 0.03, 0); paint(ped, lip, { lo:0.8, hi:1.0 });
    
    for(const [x, z] of [[0.43, 0], [-0.43, 0], [0, 0.43], [0, -0.43]]){
      const p = new THREE.CylinderGeometry(0.05, 0.06, 0.46, 7); p.translate(x, 0.3, z); paint(p, stone);
      const cap = new THREE.SphereGeometry(0.068, 7, 5); cap.scale(1, 0.6, 1); cap.translate(x, 0.55, z); paint(cap, stone, { lo:0.95, hi:1.05 });
    }
    for(const ry of [0, Math.PI / 2]){
      const a = new THREE.TorusGeometry(0.43, 0.05, 6, 18, Math.PI); a.rotateY(ry); a.translate(0, 0.55, 0); paint(a, stone, { lo:0.85, hi:1.08 });
    }
    const gem = new THREE.OctahedronGeometry(0.1, 0); gem.scale(1, 1.45, 1); gem.translate(0, 1.0, 0);
    return { solid:bake(solid), glow:bake([tint(soften(gem, 1), T.accent, { lo:1, hi:1 })]) };
    })();
    r.solid.userData.keep = r.glow.userData.keep = true; STONES.set(T.id, r);
  }
  return r;
}

/* ---------------- columns + beacons ---------------- */
// capacity = most shrines alive at once (≈ 2 per chunk, 25 chunks, plus slack)
const CAP = 96;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler();

function columnGeometry(){
  const g = new THREE.CylinderGeometry(0.1, 0.24, 8, 14, 8, true), p = g.attributes.position, col = new Float32Array(p.count * 3);
  for(let i = 0; i < p.count; i++){
    const u = (p.getY(i) + 4) / 8, k = Math.pow(1 - u, 2.2) * 0.9 + (u < 0.04 ? u * 6 : 0);   // bright foot, long soft fade, no hard cut at the bottom
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.deleteAttribute('uv'); g.translate(0, 4.05, 0);
  return g;
}
function starGeometry(){
  const a = new THREE.OctahedronGeometry(0.13, 0); a.scale(1, 1.55, 1);
  const b = new THREE.OctahedronGeometry(0.13, 0); b.scale(1.7, 0.5, 1.7); b.rotateY(Math.PI / 4);
  const warm = ['#ffe9a0', '#ffc94d'], out = [a, b].map((g, k) => tint(soften(g, 0.3), warm[k], { lo:0.9, hi:1.15 }));
  return bake(out);
}

export function createShrineFx(scene){
  const colMat = new THREE.MeshBasicMaterial({ vertexColors:true, transparent:true, opacity:0.4, blending:THREE.AdditiveBlending, depthWrite:false, side:THREE.DoubleSide });
  const starMat = new THREE.MeshBasicMaterial({ vertexColors:true, userData:{ glow:true } });
  const cols = new THREE.InstancedMesh(columnGeometry(), colMat, CAP), stars = new THREE.InstancedMesh(starGeometry(), starMat, CAP);
  for(const im of [cols, stars]){ im.frustumCulled = false; im.count = 0; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(im); }
  cols.renderOrder = 2;
  const none = new THREE.Color(0, 0, 0);
  return {
    count: () => cols.count,
    // list: [{ x, y, z, accent:'#hex', lit:bool, vis:0..1 }] (y = tile floor, already including the chunk's rise)
    update(list, t, night){
      let n = 0, nl = 0;
      for(const s of list){
        if(n >= CAP) break;
        const v = s.vis; if(v <= 0.001) continue;
        _p.set(s.x, s.y, s.z); _s.set(1, 1, 1).multiplyScalar(v); _q.identity();
        cols.setMatrixAt(n, _m.compose(_p, _q, _s)); cols.setColorAt(n, C.set(s.accent).multiplyScalar(s.lit ? 1.3 : 1)); n++;
        if(s.lit){
          const bob = Math.sin(t * 1.9 + s.x * 1.3 + s.z) * 0.06;
          _p.set(s.x, s.y + 1.5 + bob, s.z); _s.setScalar(v * 1.7 * (1 + 0.06 * Math.sin(t * 3.1 + s.x)));
          _q.setFromEuler(_e.set(0, t * 1.1 + s.x, 0));
          stars.setMatrixAt(nl, _m.compose(_p, _q, _s)); nl++;
        }
      }
      cols.count = n; stars.count = nl;
      cols.instanceMatrix.needsUpdate = true; stars.instanceMatrix.needsUpdate = true;
      if(cols.instanceColor) cols.instanceColor.needsUpdate = true;
      colMat.opacity = 0.3 + 0.5 * night;               // the columns glow stronger after dark
    },
    dispose(){ for(const im of [cols, stars]){ scene.remove(im); im.geometry.dispose(); im.material.dispose(); im.dispose(); } },
  };
}
