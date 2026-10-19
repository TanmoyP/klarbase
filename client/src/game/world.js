// The living isle: renderer, camera rig, sky, light, atmosphere, and every
// visual that mirrors engine state. The engine (@klar/core) decides what
// happens; this file only shows it — beautifully, and never differently.
import * as THREE from 'three';
import { bridgeUp, gatesOpen } from '@klar/core';
import { themeOf } from './themes.js';
import {
  LV, surfaceY, rng, hashStr, buildTerrain, makeRock, makeTree, makeFlora, makeTufts,
  makeCrate, makePlate, makeGate, makeLever, makeBridge, makeKey, makeDoor, makePortal,
  makeGoal, makeStart, makeCloud, makeFlyer,
} from './props.js';
import { Pip } from './pip.js';
import { sfx, setScale, ambient } from './audio.js';

const CW = { U:'R', R:'D', D:'L', L:'U' }, OPPD = { U:'D', D:'U', L:'R', R:'L' };
const FORWARD = ['U', 'R', 'D', 'L'];
const YAW0 = 28 * Math.PI / 180, ELEV = 40 * Math.PI / 180;
const easeIO = t => t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3) / 2;

function softDot(){
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.4, 'rgba(255,255,255,0.55)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export class World {
  constructor(container){
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias:true, alpha:false, powerPreference:'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 400);
    this.target = new THREE.Vector3();
    this.view = 0; this.yaw = YAW0; this.yawTo = YAW0; this.dist = 16; this.spin = 0;
    this.insetB = 0; this.visFrac = 1;   // px of canvas covered by a bottom sheet (phone builder)

    this.hemi = new THREE.HemisphereLight('#ffffff', '#333333', 1);
    this.sun = new THREE.DirectionalLight('#ffffff', 2.4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0006; this.sun.shadow.normalBias = 0.02;
    this.fill = new THREE.DirectionalLight('#9fb6ff', 0.35);
    this.scene.add(this.hemi, this.sun, this.sun.target, this.fill);

    // sky dome
    this.skyMat = new THREE.ShaderMaterial({
      side:THREE.BackSide, depthWrite:false, fog:false,
      uniforms:{ top:{ value:new THREE.Color() }, mid:{ value:new THREE.Color() }, bot:{ value:new THREE.Color() } },
      vertexShader:'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader:`uniform vec3 top; uniform vec3 mid; uniform vec3 bot; varying vec3 vP;
        void main(){ float h = vP.y; vec3 c = h > 0.0 ? mix(mid, top, pow(h, 0.7)) : mix(mid, bot, pow(-h, 0.6));
        gl_FragColor = vec4(c, 1.0); }`,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(180, 32, 16), this.skyMat);
    this.scene.add(this.sky);
    this.scene.fog = new THREE.Fog('#ffffff', 30, 90);

    this.isle = new THREE.Group(); this.scene.add(this.isle);
    this.atmos = new THREE.Group(); this.scene.add(this.atmos);
    this.pip = new Pip(); this.scene.add(this.pip.group);
    this.dot = softDot();
    this.fx = [];                      // short-lived effects { update(dt,t) -> alive }
    this.clock = new THREE.Clock();
    this.onFrame = null;

    this.hintMesh = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.34, 4), new THREE.MeshBasicMaterial({ color:'#ffffff', transparent:true, opacity:0.9 }));
    this.hintMesh.visible = false; this.scene.add(this.hintMesh);

    // follow the container, not just window resizes (rotations, split panes, embeds)
    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  resize(){
    const w = this.container.clientWidth || innerWidth, h = this.container.clientHeight || innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    // Shift the projection so the isle centres in the part NOT under the bottom sheet.
    const ib = Math.min(this.insetB, h * 0.7); this.visFrac = (h - ib) / h;
    if(ib > 0) this.camera.setViewOffset(w, h, 0, ib / 2, w, h); else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
    this.frameIsle();
  }
  setInsetBottom(px){ px = Math.max(0, Math.round(px)); if(px !== this.insetB){ this.insetB = px; this.resize(); } }

  /* ---------------- controls mapping ---------------- */
  // Screen arrow -> world move, for the current camera view. ↑ always means
  // "away from the camera", so controls stay intuitive after turning.
  arrowToMove(arrow){
    const F = FORWARD[this.view];
    return { up:F, right:CW[F], down:OPPD[F], left:CW[OPPD[F]] }[arrow];
  }
  turn(d){ this.view = (this.view + d + 4) % 4; this.yawTo = YAW0 - this.view * Math.PI / 2; this.spin = 0; }
  setShowcase(on){ this.showcase = on; }

  /* ---------------- isle construction ---------------- */
  load(level, themeName, { showcase = false } = {}){
    this.level = level;
    const T = this.T = themeOf(themeName);
    this.showcase = showcase;
    this.disposeGroup(this.isle); this.disposeGroup(this.atmos);
    this.fx = [];
    this.hintMesh.visible = false;

    // light & sky
    this.skyMat.uniforms.top.value.set(T.sky[0]); this.skyMat.uniforms.mid.value.set(T.sky[1]); this.skyMat.uniforms.bot.value.set(T.sky[2]);
    this.scene.fog.color.set(T.fog);
    this.hemi.color.set(T.hemi.sky); this.hemi.groundColor.set(T.hemi.ground); this.hemi.intensity = T.hemi.intensity;
    this.sun.color.set(T.sun.color); this.sun.intensity = T.sun.intensity;
    this.sunDir = new THREE.Vector3(...T.sun.dir).normalize();
    setScale(T.scale);
    if(this.themeName !== themeName){ ambient(T); this.themeName = themeName; }   // no pad restart while editing
    this.pip.setScarf(T.accent);

    // terrain
    const terr = buildTerrain(level, T);
    this.centre = terr.centre;
    this.isle.add(terr.group);
    this.animated = [...terr.animated];
    const tufts = makeTufts(level, T, this.centre); if(tufts) this.isle.add(tufts);

    // props and pieces
    const r = rng(hashStr(level.cells.map(c => c.ch + c.h).join('|')));
    this.sway = []; this.keys = new Map(); this.doors = new Map(); this.bridges = new Map();
    this.levers = []; this.gates = []; this.plates = new Map(); this.portals = []; this.goals = [];
    for(let i = 0; i < level.cells.length; i++){
      const c = level.cells[i], p = this.cellPos(i, false);
      const put = obj => { obj.position.copy(p); this.isle.add(obj); return obj; };
      switch(c.kind){
        case 'rock': put(makeRock(T, r)); break;
        case 'tree': { const t = put(makeTree(T, r)); if(t.userData.sway) this.sway.push([t.userData.sway, r() * 6]); break; }
        case 'goal': this.goals.push(put(makeGoal(T))); break;
        case 'plate': this.plates.set(i, put(makePlate(T))); break;
        case 'gate': { const g = put(makeGate(T)); g.rotation.y = this.sideways(i) ? Math.PI / 2 : 0; this.gates.push(g); break; }
        case 'lever': this.levers.push(put(makeLever(T))); break;
        case 'door': { const d = put(makeDoor(T)); d.rotation.y = this.sideways(i) ? Math.PI / 2 : 0; this.doors.set(i, d); break; }
        case 'portal': { const pr = put(makePortal(T, c.ch)); pr.rotation.y = this.sideways(i) ? Math.PI / 2 : 0; this.portals.push(pr); break; }
        case 'bridge': { const b = put(makeBridge(T)); b.rotation.y = this.sideways(i) ? 0 : Math.PI / 2; b.userData.baseY = b.position.y; this.bridges.set(i, b); break; }
      }
      if(c.flora) put(makeFlora(T, r));
      if(level.start === i) put(makeStart(T));
      if(level.keys.includes(i)) this.keys.set(i, put(makeKey(T)));
    }

    this.buildAtmosphere(T, r);
    this.frameIsle();
    this.yaw = this.yawTo = YAW0 - this.view * Math.PI / 2;
  }

  // Doors, gates, portals and bridges face along the walkway they sit in.
  sideways(i){
    const L = this.level, x = i % L.w, z = (i / L.w) | 0;
    const open = (xx, zz) => xx >= 0 && zz >= 0 && xx < L.w && zz < L.h && !['void', 'rock', 'tree', 'water'].includes(L.cells[zz*L.w + xx].kind);
    const ew = open(x - 1, z) || open(x + 1, z), ns = open(x, z - 1) || open(x, z + 1);
    return ew && !ns;
  }

  cellPos(i, standing = true){
    const L = this.level, c = L.cells[i];
    const x = i % L.w - this.centre[0], z = ((i / L.w) | 0) - this.centre[1];
    return new THREE.Vector3(x, standing ? surfaceY(c) : c.h * LV, z);
  }

  frameIsle(){
    if(!this.level) return;
    const L = this.level;
    let maxH = 0; for(const c of L.cells) if(c.kind !== 'void') maxH = Math.max(maxH, c.h);
    const radius = Math.hypot(L.w, L.h) / 2 + 0.8 + maxH * LV * 0.4;
    // Fit to the visible window only (smaller than the canvas when a bottom sheet covers it).
    const vf = this.visFrac, fov = 2 * Math.atan(Math.tan(this.camera.fov * Math.PI / 360) * vf), aspect = Math.max(0.5, this.camera.aspect / vf);
    const fit = radius / Math.sin(fov / 2) / Math.min(1, aspect * 0.95);
    this.dist = fit * (this.compact ? 1.25 : 1.02);
    this.target.set(0, maxH * LV * 0.35 - 0.4, 0);
    this.scene.fog.near = this.dist * 1.4; this.scene.fog.far = this.dist * 4.5;
    const s = this.sun.shadow.camera, ext = radius + 1.5;
    s.left = -ext; s.right = ext; s.top = ext; s.bottom = -ext; s.near = 0.5; s.far = 60; s.updateProjectionMatrix();
  }

  buildAtmosphere(T, r){
    // clouds drifting around and below the isle
    this.clouds = [];
    const isleSpan = Math.max(this.level.w, this.level.h);
    for(let i = 0; i < 12; i++){
      const c = makeCloud(r);
      // a sea of cloud BELOW the isle, plus a few far-off puffs on the horizon —
      // never between the camera and the puzzle
      const a = r() * Math.PI * 2, low = i < 9;
      const rad = low ? isleSpan * 0.6 + 3 + r() * isleSpan : isleSpan * 1.6 + 10 + r() * 8;
      const y = low ? -3.2 - r() * 2.6 : 1 + r() * 3;
      c.position.set(Math.cos(a) * rad, y, Math.sin(a) * rad);
      c.scale.set(1, 0.55, 1).multiplyScalar(0.7 + r() * 1.1);
      c.userData = { a, rad, y, speed:0.008 + r() * 0.012, bob:r() * 6 };
      this.atmos.add(c); this.clouds.push(c);
    }
    // theme particles
    const n = { fireflies:70, dust:90, petals:60, lanterns:46, snow:170 }[T.particles] || 60;
    const pos = new Float32Array(n * 3), colors = new Float32Array(n * 3), seeds = [];
    const base = new THREE.Color({ fireflies:'#eaff8a', dust:'#ffe3b0', petals:'#ffc0d4', lanterns:'#ffcf7a', snow:'#ffffff' }[T.particles]);
    const span = Math.max(this.level.w, this.level.h) * 0.8 + 2;
    for(let i = 0; i < n; i++){
      seeds.push({ x:(r() - 0.5) * span * 2, y:-1 + r() * 5, z:(r() - 0.5) * span * 2, ph:r() * 6, sp:0.3 + r() * 0.7 });
      const c = T.particles === 'lanterns' && r() < 0.35 ? new THREE.Color(T.crystal) : base;
      colors.set([c.r, c.g, c.b], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const glow = T.particles === 'fireflies' || T.particles === 'lanterns';
    const pm = new THREE.PointsMaterial({ size:T.particles === 'snow' ? 0.12 : glow ? 0.16 : 0.1, map:this.dot, vertexColors:true,
      transparent:true, opacity:glow ? 0.95 : 0.8, depthWrite:false, blending:glow ? THREE.AdditiveBlending : THREE.NormalBlending });
    this.particles = { mesh:new THREE.Points(geo, pm), seeds, kind:T.particles, span, baseColors:colors.slice() };
    this.atmos.add(this.particles.mesh);
    // critters
    this.flyers = [];
    for(let i = 0; i < 3; i++){
      const f = makeFlyer(T.critter, T.critter === 'butterfly' ? T.flora[i % T.flora.length] : '#2b2433');
      f.userData.path = { a:r() * 6, rad:T.critter === 'butterfly' ? 2 + r() * 2 : 6 + r() * 4, y:T.critter === 'butterfly' ? 0.8 + r() : 3 + r() * 2, sp:T.critter === 'butterfly' ? 0.35 : 0.22 + r() * 0.1, ph:r() * 6 };
      if(T.critter === 'bird') f.scale.setScalar(1.6);
      this.atmos.add(f); this.flyers.push(f);
    }
  }

  disposeGroup(g){
    g.traverse(o => { if(o.geometry) o.geometry.dispose(); if(o.material){ (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose()); } });
    g.clear();
  }

  /* ---------------- state mirror ---------------- */
  // Snap every dynamic piece to a state (load, undo, restart, replay start).
  reset(state){
    for(const m of this.crateMeshes?.values() || []) this.isle.remove(m);
    for(const m of this.fillers || []) this.isle.remove(m);
    this.crateMeshes = new Map(); this.fillers = [];
    for(const i of state.crates){ const m = makeCrate(this.T); m.position.copy(this.cellPos(i)); m.userData.cell = i; this.isle.add(m); this.crateMeshes.set(i, m); }
    for(const i of state.filled){ this.addFiller(i, true); }
    for(const [i, k] of this.keys) k.visible = !state.got.includes(i);
    this.applyState(state, true);
    this.pip.placeAt(this.cellPos(state.p)); this.pip.group.visible = true;
  }
  addFiller(i, instant, mesh){
    const m = mesh || makeCrate(this.T);
    const c = this.level.cells[i];
    const y = c.h * LV - 0.78;
    m.traverse(o => { if(o.material && !o.userData.mossy){ o.material = o.material.clone(); o.material.color.lerp(new THREE.Color(this.T.waterDeep), 0.35); o.userData.mossy = true; } });
    m.userData.cell = i;
    if(!mesh) this.isle.add(m);
    const p = this.cellPos(i, false); p.y = y;
    if(instant) m.position.copy(p);
    else this.tweenObj(m, m.position.clone(), p, 0.35);
    this.fillers.push(m);
  }
  // Targets for the pieces that ease toward their state each frame.
  applyState(state, instant = false){
    this.state = state;
    const open = gatesOpen(this.level, state);
    for(const g of this.gates){ g.userData.target = open ? 1 : 0; if(instant) g.userData.open = g.userData.target; }
    for(const [i, p] of this.plates){ p.userData.target = (state.p === i || state.crates.includes(i)) ? 1 : 0; if(instant) p.userData.pressed = p.userData.target; }
    for(const [i, b] of this.bridges){ b.userData.target = (bridgeUp(this.level.cells[i], state)) ? 1 : 0; if(instant) b.userData.up = b.userData.target; }
    for(const l of this.levers){ l.userData.target = state.flip ? -0.6 : 0.6; if(instant) l.userData.angle = l.userData.target; }
    for(const [i, d] of this.doors){ d.userData.target = state.opened.includes(i) ? 1 : 0; if(instant) d.userData.open = d.userData.target; }
  }

  tweenObj(obj, a, b, dur, arc = 0){
    return new Promise(res => {
      let t = 0;
      this.fx.push({ update:dt => { t = Math.min(1, t + dt / dur); const e = easeIO(t); obj.position.lerpVectors(a, b, e); obj.position.y += Math.sin(Math.PI * t) * arc; if(t >= 1){ res(); return false; } return true; } });
    });
  }

  /* ---------------- move playback ---------------- */
  // Animate one engine step. Resolves when the beat is finished.
  async play(move, res, { fast = false } = {}){
    const ev = res.events, speed = fast ? 0.7 : 1;
    if(move !== 'X') this.pip.face(move);
    for(const e of ev) if(e.t === 'door'){ sfx.door(); }
    // crates move alongside the first step
    const crateJobs = (async () => {
      for(const e of ev){
        if(e.t === 'push' || e.t === 'cslide'){
          const m = this.crateMeshes.get(e.from); if(!m) continue;
          this.crateMeshes.delete(e.from); this.crateMeshes.set(e.to, m); m.userData.cell = e.to;
          const a = m.position.clone(), b = this.cellPos(e.to);
          const drop = this.level.cells[e.to].h < this.level.cells[e.from].h;
          if(e.t === 'push') sfx.push(); else sfx.slide();
          await this.tweenObj(m, a, b, (e.t === 'push' ? 0.2 : 0.09) * speed, drop ? 0.15 : 0);
        } else if(e.t === 'sink'){
          const m = this.crateMeshes.get(e.at); this.crateMeshes.delete(e.at);
          sfx.sink(); this.splash(e.at); this.addFiller(e.at, false, m);
        }
      }
    })();

    const walk = ev.find(e => e.t === 'walk');
    if(walk){
      const pushing = ev.some(e => e.t === 'push');
      const h = this.level.cells[walk.to].h;
      if(walk.kind === 'down') sfx.hopDown(); else sfx.step(h, walk.to);
      await this.pip.hop(this.cellPos(walk.from), this.cellPos(walk.to), pushing ? 'push' : walk.kind, (walk.kind === 'down' ? 0.26 : 0.2) * speed);
      this.dust(walk.to);
    }
    let slid = false;
    for(const e of ev){
      if(e.t === 'slide'){ if(!slid){ sfx.slide(); slid = true; } await this.pip.glide(this.cellPos(e.from), this.cellPos(e.to), 0.085 * speed); }
      if(e.t === 'tp'){ sfx.tp(); this.sparkle(e.from, '#ffffff'); await this.pip.teleport(this.cellPos(e.from), this.cellPos(e.to)); this.sparkle(e.to, '#ffffff'); }
      if(e.t === 'key'){ sfx.key(); this.collectKey(e.at); }
      if(e.t === 'toggle'){ sfx.toggle(); }
      if(e.t === 'fall'){
        const m = this.crateMeshes.get(e.at); this.crateMeshes.delete(e.at);
        sfx.fall(); this.splash(e.at); if(m) this.addFiller(e.at, false, m);
      }
    }
    await crateJobs;
    this.applyState(res.state);
    if(ev.some(e => e.t === 'gate')) sfx.gate(ev.find(e => e.t === 'gate').open);
  }
  bonk(){ sfx.bonk(); return this.pip.bonk(); }
  async celebrate(){
    sfx.win();
    for(const g of this.goals) this.confetti(g.position);
    await this.pip.celebrate();
  }

  showHint(move, state){
    if(!move){ this.hintMesh.visible = false; return; }
    const m = this.hintMesh, p = this.cellPos(state.p);
    m.visible = true;
    if(move === 'X'){ m.userData = { at:p.clone(), dir:null }; m.rotation.set(Math.PI, 0, 0); }
    else {
      const d = { U:[0,-1], D:[0,1], L:[-1,0], R:[1,0] }[move];
      m.userData = { at:p.clone().add(new THREE.Vector3(d[0] * 0.62, 0, d[1] * 0.62)), dir:d };
      m.rotation.set(0, 0, 0);
      m.rotation.x = d[1] ? Math.PI / 2 * d[1] : 0; m.rotation.z = d[0] ? -Math.PI / 2 * d[0] : 0;
    }
  }

  /* ---------------- little effects ---------------- */
  collectKey(i){
    const k = this.keys.get(i); if(!k) return;
    const y0 = k.position.y; let t = 0;
    this.fx.push({ update:dt => { t += dt / 0.6; k.position.y = y0 + easeIO(Math.min(1, t)) * 1.2; k.scale.setScalar(Math.max(0.001, 1 - t)); if(t >= 1){ k.visible = false; k.position.y = y0; k.scale.setScalar(1); return false; } return true; } });
    this.sparkle(i, '#ffd35c');
  }
  burst(at, { n = 14, color = '#ffffff', speed = 2, life = 0.7, size = 0.06, gravity = 4, up = 1.5 } = {}){
    const mats = new THREE.MeshBasicMaterial({ color, transparent:true });
    const parts = [];
    for(let i = 0; i < n; i++){
      const m = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), mats);
      m.position.copy(at);
      const a = Math.random() * Math.PI * 2;
      m.userData.v = new THREE.Vector3(Math.cos(a) * speed * Math.random(), up + Math.random() * up, Math.sin(a) * speed * Math.random());
      this.scene.add(m); parts.push(m);
    }
    let t = 0;
    this.fx.push({ update:dt => {
      t += dt;
      for(const m of parts){ m.userData.v.y -= gravity * dt; m.position.addScaledVector(m.userData.v, dt); m.rotation.x += dt * 5; }
      mats.opacity = Math.max(0, 1 - t / life);
      if(t >= life){ parts.forEach(m => { this.scene.remove(m); m.geometry.dispose(); }); mats.dispose(); return false; }
      return true;
    } });
  }
  dust(i){ const p = this.cellPos(i); p.y += 0.04; this.burst(p, { n:6, color:this.T.lip, speed:0.9, up:0.5, life:0.35, size:0.05, gravity:3 }); }
  splash(i){ const p = this.cellPos(i, false); this.burst(p, { n:16, color:this.T.water, speed:1.4, up:2, life:0.6, size:0.07, gravity:7 }); }
  sparkle(i, color){ const p = this.cellPos(i); p.y += 0.4; this.burst(p, { n:12, color, speed:1.2, up:1, life:0.6, size:0.045, gravity:1 }); }
  confetti(at){
    const p = at.clone(); p.y += 0.8;
    for(const c of [this.T.accent, ...this.T.flora]) this.burst(p, { n:10, color:c, speed:2.4, up:3, life:1.4, size:0.07, gravity:5 });
  }

  /* ---------------- frame ---------------- */
  frame(){
    const dt = Math.min(0.05, this.clock.getDelta()), t = this.clock.elapsedTime;
    // camera: eased 90° turns, or a slow orbit in showcase mode
    if(this.showcase) this.yawTo -= dt * 0.12;
    this.yaw += (this.yawTo - this.yaw) * Math.min(1, dt * 6);
    const d = this.dist;
    const breathe = this.showcase ? 0 : Math.sin(t * 0.35) * 0.06;
    this.camera.position.set(
      this.target.x + Math.sin(this.yaw) * Math.cos(ELEV) * d,
      this.target.y + Math.sin(ELEV + breathe * 0.02) * d,
      this.target.z + Math.cos(this.yaw) * Math.cos(ELEV) * d);
    this.camera.lookAt(this.target);
    if(this.sunDir){
      this.sun.position.copy(this.target).addScaledVector(this.sunDir, 25);
      this.sun.target.position.copy(this.target);
      this.fill.position.set(-this.sunDir.x * 20, 8, -this.sunDir.z * 20);
    }
    if(this.level){
      for(const a of this.animated) a.update(t);
      for(const [crown, ph] of this.sway){ crown.rotation.z = Math.sin(t * 1.2 + ph) * 0.05; crown.rotation.x = Math.sin(t * 0.9 + ph) * 0.03; }
      for(const g of this.goals){ const u = g.userData; u.gem.rotation.y = t * 1.4; u.gem.position.y = 0.75 + Math.sin(t * 2) * 0.06; u.ring.rotation.z = t; u.ring.scale.setScalar(1 + Math.sin(t * 2.4) * 0.08); u.beamMat.opacity = 0.11 + Math.sin(t * 1.7) * 0.04; }
      for(const p of this.portals){ const u = p.userData; u.swirl.rotation.z = -t * 3; u.glowMat.opacity = 0.45 + Math.sin(t * 3) * 0.12; u.gem.rotation.y = t * 2; }
      for(const k of this.keys.values()){ if(k.visible){ k.userData.spin.rotation.y = t * 2; k.userData.spin.position.y = 0.55 + Math.sin(t * 2.5) * 0.07; } }
      const lerp = (o, key, rate) => { o.userData[key] += (o.userData.target - o.userData[key]) * Math.min(1, dt * rate); return o.userData[key]; };
      for(const g of this.gates){ if(g.userData.target == null) continue; const o = lerp(g, 'open', 6); g.userData.bars.position.y = -o * 0.86; }
      for(const p of this.plates.values()){ if(p.userData.target == null) continue; const v = lerp(p, 'pressed', 10); p.userData.base.position.y = 0.02 - v * 0.04; p.userData.ringMat.emissiveIntensity = 0.15 + v * 1.6; }
      for(const b of this.bridges.values()){ if(b.userData.target == null) continue; const v = lerp(b, 'up', 5); b.position.y = b.userData.baseY - (1 - v) * 0.42; b.userData.mats.forEach(m => m.opacity = 0.35 + v * 0.65); }
      for(const l of this.levers){ if(l.userData.target == null) continue; l.userData.pivot.rotation.z = lerp(l, 'angle', 9); }
      for(const dr of this.doors.values()){ if(dr.userData.target == null) continue; dr.userData.hinge.rotation.y = -lerp(dr, 'open', 5) * 1.7; }
      if(this.hintMesh.visible){ const u = this.hintMesh.userData; this.hintMesh.position.copy(u.at); this.hintMesh.position.y += 0.75 + Math.sin(t * 5) * 0.08; }
      // clouds, particles, critters
      for(const c of this.clouds){ const u = c.userData; u.a += dt * u.speed; c.position.set(Math.cos(u.a) * u.rad, u.y + Math.sin(t * 0.3 + u.bob) * 0.15, Math.sin(u.a) * u.rad); }
      this.updateParticles(dt, t);
      for(const f of this.flyers){
        const u = f.userData.path; u.a += dt * u.sp;
        const x = Math.cos(u.a) * u.rad, z = Math.sin(u.a * (this.T.critter === 'butterfly' ? 1.6 : 1)) * u.rad;
        f.position.set(x, u.y + Math.sin(t * 2 + u.ph) * 0.25, z);
        f.rotation.y = -u.a - Math.PI / 2;
        const flap = Math.sin(t * (this.T.critter === 'butterfly' ? 14 : 8) + u.ph) * 0.9;
        f.userData.L.rotation.z = flap; f.userData.R.rotation.z = -flap;
      }
    }
    this.fx = this.fx.filter(e => e.update(dt, t) !== false);
    this.pip.update(dt, t);
    if(this.onFrame) this.onFrame(dt, t);
    this.renderer.render(this.scene, this.camera);
  }

  updateParticles(dt, t){
    const P = this.particles; if(!P) return;
    const pos = P.mesh.geometry.attributes.position, colAttr = P.mesh.geometry.attributes.color;
    for(let i = 0; i < P.seeds.length; i++){
      const s = P.seeds[i];
      if(P.kind === 'snow'){ s.y -= dt * 0.6 * s.sp; s.x += Math.sin(t + s.ph) * dt * 0.2; if(s.y < -4) s.y = 5; }
      else if(P.kind === 'petals'){ s.y -= dt * 0.25 * s.sp; s.x += Math.sin(t * 0.8 + s.ph) * dt * 0.4; s.z += dt * 0.1; if(s.y < -4) s.y = 5; }
      else if(P.kind === 'lanterns'){ s.y += dt * 0.18 * s.sp; if(s.y > 6) s.y = -2; }
      else if(P.kind === 'dust'){ s.x += dt * 0.35 * s.sp; s.y += Math.sin(t + s.ph) * dt * 0.05; if(s.x > P.span) s.x = -P.span; }
      else { s.x += Math.sin(t * 0.5 + s.ph) * dt * 0.15; s.y += Math.cos(t * 0.7 + s.ph) * dt * 0.1; s.z += Math.sin(t * 0.4 + s.ph * 2) * dt * 0.15; }
      pos.setXYZ(i, s.x, s.y, s.z);
      if(P.kind === 'fireflies' || P.kind === 'lanterns'){
        const k = 0.35 + 0.65 * Math.max(0, Math.sin(t * 2.2 * s.sp + s.ph));
        colAttr.setXYZ(i, P.baseColors[i*3] * k, P.baseColors[i*3+1] * k, P.baseColors[i*3+2] * k);
      }
    }
    pos.needsUpdate = true; colAttr.needsUpdate = true;
  }
}
