// The sea of cloud under the Sky Atlas, plus the day/night clock.
//
// CLOUD SEA: 3 InstancedMeshes (the game's own soft cumulus shapes, makeCloud) with ~140 puffs wrapped
// around the camera focus on a torus, so the sea is endless without a single object ever being created or
// destroyed. They drift slowly with the "wind". Below them a very large haze disc in the fog colour hides
// the sky's lower pole, so the world fades softly to the same colour as the streaming-edge fog.
//
// CLOCK: ~12 minutes a day. DAY 0-0.60, dusk 0.60-0.72, NIGHT 0.72-0.90, dawn 0.90-1.0. `nightAmount` goes
// to look.applyLook; `sunDirection` swings the sun over the day and puts the moon up at night.
import * as THREE from 'three';
import { makeCloud, rng } from '../game/props.js';
import { themeOf } from '../game/themes.js';
import { OUT } from '../game/look.js';
import { smooth } from './spring.js';

export const CYCLE = 720;                 // seconds per day

export const nightAmount = f => Math.min(1, smooth(0.60, 0.72, f) + (1 - smooth(0.90, 1.0, f)) * 0 ) * (1 - smooth(0.90, 1.0, f));
const _sun = new THREE.Vector3(), _moon = new THREE.Vector3(0.28, 0.95, -0.55).normalize();
// direction TO the light (world.sunDir): the sun climbs from the east, falls to the west; the moon is fixed and high
export function sunDirection(f, n, out = _sun){
  const u = Math.min(1, Math.max(0, f / 0.72)), e = 0.24 + 0.95 * Math.sin(Math.PI * u), az = -0.7 + u * 3.0;
  out.set(Math.cos(az) * Math.cos(e), Math.sin(e), Math.sin(az) * Math.cos(e));
  return out.lerp(_moon, n).normalize();
}

const SPAN = 96, COUNT = 240, Y = -3.9;
const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), white = new THREE.Color('#ffffff'), tmp = new THREE.Color();

export function createSky(world){
  const T = themeOf('tropical');
  const src = makeCloud(T, rng(77), 10);                         // only for its cached geometries
  const geos = src.group.children.map(c => c.geometry);
  for(const c of src.group.children){ c.dispose(); c.material.dispose(); }
  const mat = new THREE.MeshStandardMaterial({ vertexColors:true, emissive:'#ffffff', emissiveIntensity:0.3, roughness:1, transparent:true, opacity:0.94, depthWrite:false });
  const r = rng(4242), puffs = [], meshes = geos.map((g, v) => { const im = new THREE.InstancedMesh(g, mat, COUNT / geos.length | 0); im.frustumCulled = false; im.renderOrder = 0; world.scene.add(im); return im; });
  for(let i = 0; i < COUNT; i++){
    const k = 3 + r() * 3.6;
    puffs.push({ im:meshes[i % meshes.length], slot:(i / meshes.length) | 0, bx:r() * SPAN, bz:r() * SPAN, y:Y + (r() - 0.5) * 1.1, sx:k, sy:k * (0.55 + r() * 0.25), rot:r() * 6.28, sp:0.12 + r() * 0.2, bob:r() * 6 });
  }
  // haze: a big disc under everything, in the fog colour (fogged out to the same colour at its rim)
  const hazeMat = new THREE.MeshBasicMaterial({ color:'#ffffff', fog:true, depthWrite:false });
  const haze = new THREE.Mesh(new THREE.CircleGeometry(260, 48), hazeMat); haze.rotation.x = -Math.PI / 2; haze.renderOrder = -1; world.scene.add(haze);

  let drift = 0;
  return {
    // focus = camera target (the sea wraps around it)
    update(dt, t, focus){
      drift += dt;
      for(const p of puffs){
        // wrap each puff into [focus - SPAN/2, focus + SPAN/2) on both axes
        let x = p.bx + drift * p.sp * 1.4 - focus.x + SPAN / 2, z = p.bz + drift * p.sp * 0.7 - focus.z + SPAN / 2;
        x = ((x % SPAN) + SPAN) % SPAN; z = ((z % SPAN) + SPAN) % SPAN;
        pos.set(focus.x - SPAN / 2 + x, p.y + Math.sin(t * 0.25 + p.bob) * 0.12, focus.z - SPAN / 2 + z);
        const edge = Math.min(x, SPAN - x, z, SPAN - z), s = Math.min(1, edge / 10);          // shrink to nothing at the seam
        q.setFromAxisAngle(up, p.rot); sc.set(p.sx * s, p.sy * s, p.sx * s); m4.compose(pos, q, sc); p.im.setMatrixAt(p.slot, m4);
      }
      for(const im of meshes) im.instanceMatrix.needsUpdate = true;
      // follow the look: clouds take the fog colour (so night clouds are navy, not white), the haze is the fog
      tmp.copy(OUT.fog.color).lerp(white, 0.42); mat.color.copy(tmp);
      mat.emissive.copy(OUT.hemi.sky); mat.emissiveIntensity = 0.28;
      hazeMat.color.copy(OUT.fog.color).lerp(white, 0.42);
      haze.position.set(focus.x, Y - 2.4, focus.z);
      world.sky.position.copy(world.camera.position);
    },
    dispose(){
      for(const im of meshes){ world.scene.remove(im); im.dispose(); }
      mat.dispose(); world.scene.remove(haze); haze.geometry.dispose(); hazeMat.dispose();
      world.sky.position.set(0, 0, 0);
    },
  };
}
