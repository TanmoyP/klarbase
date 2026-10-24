// Pip — the cozy critter. A round mochi spirit with a leaf sprout and a scarf.
// Cuteness lives in proportion and motion, not detail: squash & stretch on
// every hop, a sprout that lags behind, blinking, and a happy little spin.
import * as THREE from 'three';
import { makeBalloon, makeStone } from './props.js';

const ease = t => t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3) / 2;
const easeOutBack = t => 1 + 2.4 * Math.pow(t - 1, 3) + 1.4 * Math.pow(t - 1, 2);

function blobShadow(){
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(20,14,30,0.45)'); grd.addColorStop(1, 'rgba(20,14,30,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.62),
    new THREE.MeshBasicMaterial({ map:new THREE.CanvasTexture(c), transparent:true, depthWrite:false }));
  m.rotation.x = -Math.PI / 2;
  return m;
}

export class Pip {
  constructor(){
    this.group = new THREE.Group();        // world position (feet on the floor)
    this.body = new THREE.Group();         // squash / lean / spin
    this.group.add(this.body);
    const cream = new THREE.MeshStandardMaterial({ color:'#fff4e2', roughness:0.55 });
    const blob = new THREE.Mesh(new THREE.SphereGeometry(0.26, 24, 18), cream);
    blob.scale.set(1, 0.9, 1); blob.position.y = 0.25; blob.castShadow = true;
    this.body.add(blob);

    const ink = new THREE.MeshStandardMaterial({ color:'#1d1724', roughness:0.3 });
    const shine = new THREE.MeshBasicMaterial({ color:'#ffffff' });
    this.eyes = [];
    for(const sx of [-0.085, 0.085]){
      const e = new THREE.Group(); e.position.set(sx, 0.3, 0.215);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.038, 12, 10), ink);
      const glint = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 5), shine); glint.position.set(0.012, 0.014, 0.03);
      e.add(ball, glint); this.body.add(e); this.eyes.push(e);
    }
    const blush = new THREE.MeshBasicMaterial({ color:'#ff9db0', transparent:true, opacity:0.75 });
    for(const sx of [-0.15, 0.15]){
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 6), blush);
      b.scale.set(1.3, 0.6, 0.4); b.position.set(sx, 0.23, 0.2); this.body.add(b);
    }
    // sprout
    this.sprout = new THREE.Group(); this.sprout.position.y = 0.48; this.body.add(this.sprout);
    const leafMat = new THREE.MeshStandardMaterial({ color:'#6fcf5a', roughness:0.6 });
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.1, 6), leafMat); stem.position.y = 0.04;
    this.sprout.add(stem);
    for(const s of [-1, 1]){
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), leafMat);
      leaf.scale.set(1.25, 0.32, 0.65); leaf.position.set(s * 0.06, 0.1, 0); leaf.rotation.z = s * -0.5;
      this.sprout.add(leaf);
    }
    // scarf
    this.scarfMat = new THREE.MeshStandardMaterial({ color:'#ff7a6b', roughness:0.7 });
    const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.045, 8, 24), this.scarfMat);
    scarf.rotation.x = Math.PI / 2; scarf.position.y = 0.13; this.body.add(scarf);
    this.tail = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.15, 0.03), this.scarfMat);
    this.tail.position.set(0.08, 0.07, -0.2); this.tail.rotation.set(0.3, 0, 0.3); this.body.add(this.tail);
    // feet
    const foot = new THREE.MeshStandardMaterial({ color:'#f1dcc0', roughness:0.6 });
    this.feet = [];
    for(const sx of [-0.09, 0.09]){ const f = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), foot); f.scale.set(1, 0.6, 1.3); f.position.set(sx, 0.03, 0.06); this.body.add(f); this.feet.push(f); }

    this.shadow = blobShadow(); this.group.add(this.shadow); this.shadow.position.y = 0.012;
    this.yaw = 0; this.yawTo = 0;
    this.tweens = [];
    this.blinkAt = 2; this.lookAt = 4;
    this.squash = 1;
    // what Pip holds (Weight II): a balloon floats beside, a stone sits overhead
    this.held = null; this.holding = '';
  }

  setHold(what, T){
    if(this.held){ this.held.removeFromParent(); this.held = null; }
    this.holding = what || '';
    if(what === 'balloon'){ this.held = makeBalloon(T.accent, 0.62); this.held.position.set(0.17, 0.22, -0.06); this.group.add(this.held); }
    else if(what === 'stone'){ this.held = makeStone(T); this.held.position.set(0, 0.66, 0); this.body.add(this.held); }
  }

  setScarf(color){ this.scarfMat.color.set(color); }
  placeAt(v){ this.group.position.copy(v); this.body.position.set(0, 0, 0); this.body.rotation.set(0, 0, 0); this.body.scale.setScalar(1); this.tweens = []; }

  face(dir){
    const a = { U:Math.PI, D:0, L:-Math.PI / 2, R:Math.PI / 2 }[dir];
    if(a == null) return;
    let d = a - this.yawTo; while(d > Math.PI) d -= Math.PI * 2; while(d < -Math.PI) d += Math.PI * 2;
    this.yawTo += d;
  }

  tween(dur, fn){ return new Promise(res => this.tweens.push({ t:0, dur, fn, res })); }
  get busy(){ return this.tweens.length > 0; }

  // A hop from a to b (THREE.Vector3, floor positions). kind: flat|ramp|down|push
  hop(a, b, kind = 'flat', dur = 0.2){
    const arc = kind === 'down' ? 0.42 : kind === 'ramp' ? 0.12 : 0.2;
    return this.tween(dur, p => {
      const e = ease(p);
      this.group.position.lerpVectors(a, b, e);
      this.group.position.y += Math.sin(Math.PI * p) * arc;
      const sq = p < 0.18 ? 1 - p * 0.9 : p < 0.7 ? 1.1 : 1 - (1 - p) * 0.5;
      this.body.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
      this.body.rotation.x = kind === 'push' ? 0.28 : 0;
      this.feet[0].position.z = 0.06 + Math.sin(p * Math.PI * 2) * 0.05;
      this.feet[1].position.z = 0.06 - Math.sin(p * Math.PI * 2) * 0.05;
      if(p >= 1){ this.body.scale.setScalar(1); this.body.rotation.x = 0; this.squash = 0.82; }
    });
  }
  glide(a, b, dur = 0.09){
    return this.tween(dur, p => {
      this.group.position.lerpVectors(a, b, p);
      this.body.rotation.x = -0.22; this.body.scale.set(1.05, 0.95, 1.05);
      if(p >= 1){ this.body.rotation.x = 0; this.body.scale.setScalar(1); }
    });
  }
  // A balloon glide: a long, soft descent from a to b, sprout and scarf streaming.
  float(a, b, dur = 0.5){
    return this.tween(dur, p => {
      const e = p * (2 - p);
      this.group.position.lerpVectors(a, b, e);
      this.group.position.y = a.y + (b.y - a.y) * p * p + Math.sin(Math.PI * p) * 0.25;
      this.body.rotation.x = 0.15; this.body.scale.set(1.04, 0.97, 1.04);
      if(p >= 1){ this.body.rotation.x = 0; this.body.scale.setScalar(1); this.squash = 0.86; }
    });
  }
  // Nudged one tile by the wind.
  drift(a, b, dur = 0.32){
    return this.tween(dur, p => {
      this.group.position.lerpVectors(a, b, p * (2 - p));
      this.group.position.y += Math.sin(Math.PI * p) * 0.12;
      this.body.rotation.z = Math.sin(Math.PI * p) * 0.25;
      if(p >= 1) this.body.rotation.z = 0;
    });
  }
  async teleport(a, b){
    await this.tween(0.18, p => { this.body.scale.setScalar(Math.max(0.001, 1 - ease(p))); this.body.rotation.y = p * 6; });
    this.group.position.copy(b);
    await this.tween(0.26, p => { this.body.scale.setScalar(Math.max(0.001, easeOutBack(p))); this.body.rotation.y = (1 - p) * -6; });
    this.body.rotation.y = 0; this.body.scale.setScalar(1);
  }
  // A thorn arm swings overhead: squash down flat, then pop back up.
  duck(dur = 0.24){
    return this.tween(dur, p => { const k = Math.sin(p * Math.PI); this.body.scale.set(1 + 0.25 * k, 1 - 0.5 * k, 1 + 0.25 * k); });
  }
  bonk(){
    return this.tween(0.22, p => { this.body.rotation.x = Math.sin(p * Math.PI * 3) * 0.18 * (1 - p); this.body.scale.set(1 + 0.06 * Math.sin(p * Math.PI), 1 - 0.08 * Math.sin(p * Math.PI), 1); });
  }
  async celebrate(){
    for(let k = 0; k < 2; k++){
      await this.tween(0.42, p => {
        this.body.position.y = Math.sin(Math.PI * p) * 0.55;
        this.body.rotation.y = ease(p) * Math.PI * 2;
        const sq = p < 0.15 ? 0.8 : p > 0.9 ? 0.85 : 1.08;
        this.body.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
      });
    }
    this.body.position.y = 0; this.body.rotation.y = 0; this.body.scale.setScalar(1);
  }

  update(dt, t){
    // run tweens sequentially
    if(this.tweens.length){
      const tw = this.tweens[0];
      tw.t = Math.min(1, tw.t + dt / tw.dur);
      tw.fn(tw.t);
      if(tw.t >= 1){ this.tweens.shift(); tw.res(); }
    } else {
      // idle: breathe, recover from landing squash
      this.squash += (1 - this.squash) * Math.min(1, dt * 10);
      const br = 1 + Math.sin(t * 2.4) * 0.022;
      const s = this.squash * br;
      this.body.scale.set(1 / Math.sqrt(s), s, 1 / Math.sqrt(s));
    }
    // facing
    this.yaw += (this.yawTo - this.yaw) * Math.min(1, dt * 14);
    this.group.rotation.y = this.yaw;
    // sprout lags & sways, scarf tail flutters
    this.sprout.rotation.z = Math.sin(t * 2.1) * 0.12;
    this.sprout.rotation.x = Math.sin(t * 1.7 + 1) * 0.08;
    this.tail.rotation.z = 0.3 + Math.sin(t * 5) * 0.12;
    if(this.holding === 'balloon' && this.held){ this.held.rotation.z = Math.sin(t * 1.8) * 0.1; this.held.rotation.x = Math.sin(t * 1.3 + 1) * 0.08; }
    // blink & glance
    if(t > this.blinkAt){ this.blinkAt = t + 2.2 + Math.random() * 3.2; this.blinkEnd = t + 0.12; }
    const closed = this.blinkEnd && t < this.blinkEnd;
    for(const e of this.eyes) e.scale.y = closed ? 0.12 : 1;
    // shadow stays on the floor under a jump
    this.shadow.position.y = 0.012 - this.body.position.y;
    const lift = Math.max(0, this.body.position.y);
    this.shadow.scale.setScalar(1 - Math.min(0.5, lift));
  }
}
