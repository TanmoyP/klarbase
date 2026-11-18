// Follow camera target (visual finesse pass). A critically damped spring chases the
// look target — exact integration, so it feels identical at 30, 60 or 144 fps — with
//   · a small LOOK-AHEAD in the last move direction (fades out when idle, so framing
//     rules are unchanged once the player stops), and
//   · a very slow, tiny, deterministic DRIFT: the tripod-head feel of a hand-set camera.
// Standalone on purpose: the endless MAP mode drives it with Pip's position directly.
//
//   const f = createFollow({ stiffness:4.5, lookAhead:0.3 });
//   target.copy(f.update(dt, wantedTarget, moveDir));    // moveDir: {x,z} of the last step, or null
//
// `update` returns an internal Vector3 that is reused every call — copy it, don't keep it.
// Technique after papertrails src/camera/follow.js (MIT); the code is ours.
import * as THREE from 'three';

export function createFollow({ stiffness = 4.5, lookAhead = 0.3, drift = 0.035, reduced = null } = {}){
  const pos = new THREE.Vector3(), vel = new THREE.Vector3(), out = new THREE.Vector3(), lead = new THREE.Vector3(), dir = new THREE.Vector3();
  let started = false, clock = 0, idle = 99;
  const still = () => reduced ? reduced() : false;        // prefers-reduced-motion: no drift

  // exact critically damped step for one axis: returns the new position, writes the new velocity into `vel[k]`
  function step(k, goal, dt, w){
    const d = pos[k] - goal, tmp = (vel[k] + w * d) * dt, e = Math.exp(-w * dt);
    vel[k] = (vel[k] - w * tmp) * e;
    return goal + (d + tmp) * e;
  }

  return {
    // Jump to a target with no glide (new isle, resize, first frame).
    snap(target){ pos.copy(target); vel.set(0, 0, 0); lead.set(0, 0, 0); started = true; },
    update(dt, target, moveDir){
      if(!started) this.snap(target);
      if(moveDir && (moveDir.x || moveDir.z)){ dir.set(moveDir.x, 0, moveDir.z).normalize(); idle = 0; }
      idle += dt;
      // lead eases toward (last direction × lookAhead), then back to 0 once Pip has stood still a while
      const k = lookAhead * (1 - Math.min(1, Math.max(0, (idle - 1.2) / 1.6)));
      const a = 1 - Math.exp(-2.2 * dt);
      lead.x += (dir.x * k - lead.x) * a; lead.z += (dir.z * k - lead.z) * a;
      const w = Math.max(0.5, stiffness);
      pos.x = step('x', target.x + lead.x, dt, w); pos.y = step('y', target.y, dt, w); pos.z = step('z', target.z + lead.z, dt, w);
      out.copy(pos);
      if(drift && !still()){
        clock += dt;
        out.x += drift * (Math.sin(clock * 0.131) * 0.6 + Math.sin(clock * 0.0713 + 1.3) * 0.4);
        out.z += drift * (Math.sin(clock * 0.097 + 2.1) * 0.6 + Math.sin(clock * 0.0529 + 0.4) * 0.4);
        out.y += drift * 0.5 * Math.sin(clock * 0.083 + 0.7);
      }
      return out;
    },
  };
}
