// The living isle: renderer, camera rig, sky, light, atmosphere, and every
// visual that mirrors engine state. The engine (@klar/core) decides what
// happens; this file only shows it — beautifully, and never differently.
import * as THREE from 'three';
import { bridgeUp, gatesOpen, panTilt, heightAt, cellPlace, pipWeight, floating, windAt, hazardCellsAt } from '@klar/core';
import { themeOf, PORTAL_COLORS } from './themes.js';
import {
  LV, rng, hashStr, buildTerrain, makeRock, makeTree, makeFlora, makeTufts,
  makeCrate, makePlate, makeGate, makeLever, makeBridge, makeKey, makeDoor, makePortal,
  makeGoal, makeStart, makeCloud, makeFlyer, makePan, PAN_HOOK,
  makeBalloon, makePost, makePile, makeBuoy, makeVent, makeSeed, makeBoulder, makeThorn, makeWarning,
} from './props.js';
import { Pip } from './pip.js';
import { sfx, setScale, ambient } from './audio.js';

const CW = { U:'R', R:'D', D:'L', L:'U' }, OPPD = { U:'D', D:'U', L:'R', R:'L' };
const FORWARD = ['U', 'R', 'D', 'L'];
const YAW_OF = { D:0, U:Math.PI, R:Math.PI / 2, L:-Math.PI / 2 };       // a +Z-facing prop turned to face a move direction
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
    this.target = new THREE.Vector3(); this.targetTo = new THREE.Vector3();   // eased: the camera glides between storeys
    this.view = 0; this.yaw = YAW0; this.yawTo = YAW0; this.dist = this.distTo = 16; this.spin = 0;
    this.mapView = false;               // archipelago maps: false = frame Pip's storey, true = the whole map
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
    this.frameIsle(true);
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
  setShowcase(on){ this.showcase = on; this.frameIsle(); }
  get storeyCount(){ return this.level ? this.level.storeys.length : 1; }
  setMapView(on){ this.mapView = !!on; this.frameIsle(); }

  /* ---------------- isle construction ---------------- */
  // storey: the builder frames the storey being edited instead of Pip's.
  load(level, themeName, { showcase = false, storey = null } = {}){
    this.level = level;
    const T = this.T = themeOf(themeName);
    this.showcase = showcase; this.editStorey = storey;
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

    // terrain: every storey is its own floating isle, placed at its map offset and
    // altitude (K4). A v5 isle is one storey at [0,0,0] — exactly the old scene.
    const S = level.storeys;
    const minX = Math.min(...S.map(s => s.at[0])), maxX = Math.max(...S.map(s => s.at[0] + s.w - 1));
    const minZ = Math.min(...S.map(s => s.at[1])), maxZ = Math.max(...S.map(s => s.at[1] + s.h - 1));
    this.centre = [(minX + maxX) / 2, (minZ + maxZ) / 2];
    this.mapSpan = Math.max(maxX - minX + 1, maxZ - minZ + 1);
    this.tiltShown = 0; this.mapView = false;
    this.pipStorey = Math.max(0, level.sid[level.start] ?? 0);
    this.storeyGroups =S.map(() => { const g = new THREE.Group(); g.userData = { fade:1, fadeTo:1 }; this.isle.add(g); return g; });
    this.storeyTop = S.map(() => 0);
    this.animated = [];
    S.forEach((s, k) => {
      // the storey as a plain grid; pans are cut out (they hang in their own baskets)
      const cells = [];
      for(let z = 0; z < s.h; z++) for(let x = 0; x < s.w; x++){
        const c = level.cells[z*level.w + s.x0 + x];
        cells.push(c.kind === 'pan' ? { kind:'void', h:0, ch:'-' } : c);
        if(c.kind !== 'void') this.storeyTop[k] = Math.max(this.storeyTop[k], c.h);
      }
      const sub = { w:s.w, h:s.h, cells }, terr = buildTerrain(sub, T);
      const off = new THREE.Vector3(s.at[0] + terr.centre[0] - this.centre[0], s.at[2] * LV, s.at[1] + terr.centre[1] - this.centre[1]);
      terr.group.position.copy(off); this.storeyGroups[k].add(terr.group);
      this.animated.push(...terr.animated);
      const tufts = makeTufts(sub, T, terr.centre); if(tufts){ tufts.position.copy(off); this.storeyGroups[k].add(tufts); }
    });

    // props and pieces
    const r = rng(hashStr(level.cells.map(c => c.ch + c.h).join('|')));
    this.sway = []; this.keys = new Map(); this.doors = new Map(); this.bridges = new Map();
    this.levers = []; this.gates = []; this.plates = new Map(); this.portals = []; this.goals = []; this.pans = new Map();
    this.posts = new Map(); this.vents = new Map(); this.seedMeshes = new Map(); this.seedsGot = new Set();
    for(let i = 0; i < level.cells.length; i++){
      if(level.sid[i] < 0) continue;              // padding between storeys
      const c = level.cells[i], p = this.cellPos(i, false), home = this.groupOf(i);
      const put = obj => { obj.position.copy(p); home.add(obj); return obj; };
      switch(c.kind){
        case 'rock': put(makeRock(T, r)); break;
        case 'tree': { const t = put(makeTree(T, r)); if(t.userData.sway) this.sway.push([t.userData.sway, r() * 6]); break; }
        case 'goal': this.goals.push(put(makeGoal(T))); break;
        case 'plate': this.plates.set(i, put(makePlate(T))); break;
        case 'gate': { const g = put(makeGate(T)); g.rotation.y = this.sideways(i) ? Math.PI / 2 : 0; this.gates.push(g); break; }
        case 'lever': this.levers.push(put(makeLever(T))); break;
        case 'door': { const d = put(makeDoor(T)); d.rotation.y = this.sideways(i) ? Math.PI / 2 : 0; this.doors.set(i, d); break; }
        case 'portal': { const pr = put(makePortal(T, c.ch)); pr.rotation.y = this.sideways(i) ? Math.PI / 2 : 0; this.portals.push(pr); break; }
        case 'bridge': { const b = put(makeBridge(T)); b.rotation.y = this.sideways(i) ? 0 : Math.PI / 2; b.userData.baseY = b.position.y; b.userData.storey = level.sid[i]; this.bridges.set(i, b); break; }
        case 'pan': this.pans.set(i, put(makePan(T))); break;
        case 'post': this.posts.set(i, put(makePost(T))); break;
        case 'pile': put(makePile(T, r)); break;
        case 'vent': { const v = put(makeVent(T)); v.rotation.y = YAW_OF[c.blow]; this.vents.set(i, v); break; }
      }
      if(c.flora) put(makeFlora(T, r));
      if(level.start === i) put(makeStart(T));
      if(level.keys.includes(i)) this.keys.set(i, put(makeKey(T)));
      if(level.seeds && level.seeds.includes(i)) this.seedMeshes.set(i, put(makeSeed(T)));
    }
    this.buildVine(T);
    this.buildThreads();
    this.buildGusts();
    this.buildHazards(T);

    this.buildAtmosphere(T, r);
    this.frameIsle(true);
    this.yaw = this.yawTo = YAW0 - this.view * Math.PI / 2;
  }

  groupOf(i){ return this.storeyGroups[Math.max(0, this.level.sid[i])]; }
  fadeOf(obj){ return obj.parent ? obj.parent.userData.fade ?? 1 : 1; }

  // Sky Scales: one vine over a sky branch, a rope down to every pan tile's hook.
  // Rope lengths follow the pans; the branch stays put at a height clear of both.
  buildVine(T){
    this.vine = null;
    const L = this.level;
    if(!L.pans) return;
    const tiles = [...L.pans.a, ...L.pans.b];
    const top = Math.max(...tiles.map(i => (L.storeys[L.sid[i]].at[2] + L.cells[i].h + 1) * LV)) + PAN_HOOK + 0.7;
    const pts = tiles.map(i => { const p = this.cellPos(i, false); return new THREE.Vector3(p.x, top, p.z); });
    if(pts.length === 2) pts.splice(1, 0, pts[0].clone().lerp(pts[1], 0.5).add(new THREE.Vector3(0, 0.35, 0)));
    const curve = new THREE.CatmullRomCurve3(pts);
    const wood = new THREE.MeshStandardMaterial({ color:T.trunk, flatShading:true, roughness:0.9 });
    const branch = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.075, 6, false), wood); branch.castShadow = true;
    this.isle.add(branch);
    const leaf = new THREE.MeshStandardMaterial({ color:T.leafAlt, flatShading:true, roughness:0.8 });
    for(let k = 1; k < 9; k++){
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 4), leaf);
      m.scale.set(1.4, 0.45, 0.8); m.position.copy(curve.getPoint(k / 9)); m.position.y += 0.06; m.rotation.y = k * 1.9; this.isle.add(m);
    }
    const vineMat = new THREE.MeshStandardMaterial({ color:T.leaf, roughness:1 }), knot = new THREE.MeshStandardMaterial({ color:T.woodDark, flatShading:true });
    const ropes = new Map();
    for(const i of tiles){
      const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1, 5), vineMat); rope.castShadow = true;
      const k = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.035, 6, 14), knot);
      const p = this.cellPos(i, false); k.position.set(p.x, top, p.z); k.rotation.y = Math.PI / 4;
      this.isle.add(rope, k); ropes.set(i, rope);
    }
    this.vine = { top, ropes };
  }
  updateVine(){
    if(!this.vine) return;
    for(const [i, rope] of this.vine.ropes){
      const pan = this.pans.get(i), y0 = pan.position.y + PAN_HOOK, len = Math.max(0.01, this.vine.top - y0);
      rope.position.set(pan.position.x, y0 + len / 2, pan.position.z); rope.scale.set(1, len, 1);
    }
  }
  // Pans (and whatever rides them) for a scales lean f — fractional while settling.
  setPans(f, state){
    for(const [i, m] of this.pans){
      const c = this.level.cells[i], y = (this.level.storeys[this.level.sid[i]].at[2] + c.h + (c.pan === 'a' ? -f : f)) * LV;
      m.position.y = y;
      if(state && state.p === i) this.pip.group.position.y = y;
      const cm = this.crateMeshes && this.crateMeshes.get(i); if(cm) cm.position.y = y;
      const bm = this.buoyMeshes && this.buoyMeshes.get(i); if(bm) bm.position.y = y;
    }
    this.updateVine();
  }
  settleScales(from, to, state){
    return new Promise(res => {
      let t = 0;
      this.fx.push({ update:dt => {
        t = Math.min(1, t + dt / 0.45);
        this.setPans(from + (to - from) * easeIO(t), state);
        if(t >= 1){ this.tiltShown = to; res(); return false; }
        return true;
      } });
    });
  }
  // Gateways: a faint thread of light between the two arches of a pair that links storeys.
  buildThreads(){
    this.threads = [];
    const L = this.level, done = new Set();
    for(const [a, b] of Object.entries(L.twin).map(([u, v]) => [+u, v])){
      if(!L.cells[a].gateway || done.has(a)) continue;
      done.add(a); done.add(b);
      const p = this.cellPos(a, false).add(new THREE.Vector3(0, 0.5, 0)), q = this.cellPos(b, false).add(new THREE.Vector3(0, 0.5, 0));
      const d = new THREE.Vector3().subVectors(q, p);
      const mat = new THREE.MeshBasicMaterial({ color:PORTAL_COLORS[L.cells[a].ch], transparent:true, opacity:0.2, blending:THREE.AdditiveBlending, depthWrite:false });
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, d.length(), 6, 1, true), mat);
      m.position.copy(p).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
      this.isle.add(m); this.threads.push(mat);
    }
  }

  // Gusts (K6): pale streaks run along each line, from the vent to where the wind
  // stops — at the line's end or at the first crate sheltering it (applyState).
  buildGusts(){
    this.gustFx = [];
    const L = this.level, mat = new THREE.MeshBasicMaterial({ color:'#ffffff', transparent:true, opacity:0.75, depthWrite:false });
    for(const g of L.gusts || []){
      const [dx, dz] = { U:[0, -1], D:[0, 1], L:[-1, 0], R:[1, 0] }[g.dir];
      const start = this.cellPos(g.cells[0], false), streaks = [];
      for(let k = 0; k < g.cells.length * 2 + 2; k++){
        const m = new THREE.Mesh(new THREE.BoxGeometry(dx ? 0.5 : 0.05, 0.05, dz ? 0.5 : 0.05), mat);
        m.userData = { ph:k / (g.cells.length * 2 + 2), lane:(k % 3 - 1) * 0.22, hy:0.15 + (k * 0.37 % 1) * 0.45 };
        this.groupOf(g.cells[0]).add(m); streaks.push(m);
      }
      this.gustFx.push({ g, dx, dz, start, streaks, reach:g.cells.length });
    }
  }
  // Cozy hazards (K5): boulders and thorn arms sit where the turn counter says;
  // warning rings mark every tile a hazard will cover after your next move.
  buildHazards(T){
    this.hazardMeshes = []; this.warnings = []; this.turnShown = 0;
    const L = this.level;
    for(const hz of L.hazards || []){
      const m = hz.kind === 'boulder' ? makeBoulder(T) : makeThorn(T);
      if(hz.kind === 'thorn') m.position.copy(this.cellPos(hz.at, false));
      this.groupOf(hz.at).add(m); this.hazardMeshes.push(m);
    }
    const most = (L.hazards || []).reduce((n, hz) => n + (hz.kind === 'boulder' ? 1 : 2), 0);
    for(let k = 0; k < most; k++){ const w = makeWarning(); w.visible = false; this.isle.add(w); this.warnings.push(w); }
  }
  boulderAt(hz, t){ return hazardCellsAt({ hazards:[hz] }, t)[0]; }
  thornYaw(t){ return Math.PI - (t % 4) * Math.PI / 2; }       // arm: north, then a quarter clockwise per beat
  placeHazards(t){
    const L = this.level; this.turnShown = t;
    (L.hazards || []).forEach((hz, k) => {
      const m = this.hazardMeshes[k];
      if(hz.kind === 'boulder') m.position.copy(this.cellPos(this.boulderAt(hz, t)));
      else m.userData.pivot.rotation.y = this.thornYaw(t);
    });
    this.warn((t + 1) % (L.cycle || 1));
  }
  warn(t){
    const cells = this.level.hazards && this.level.hazards.length ? hazardCellsAt(this.level, t) : [];
    this.warnings.forEach((w, k) => { const i = cells[k]; w.visible = i != null && this.level.cells[i].kind !== 'void';
      if(w.visible){ w.position.copy(this.cellPos(i)); w.position.y += 0.03; } });
  }
  // One beat: boulders roll a tile, thorn arms turn a quarter. Pip (at p) ducks when an arm
  // swings over a tile between two arms — those tiles are safe, so it must not look like a hit.
  stepHazards(t0, t1, speed, p){
    const L = this.level, jobs = [], W = L.w;
    const QUAD = [[1, -1], [1, 1], [-1, 1], [-1, -1]];          // the quarter swept leaving N, E, S, W
    const under = hz => { if(p == null || L.sid[p] !== L.sid[hz.at]) return false;
      const dx = p % W - hz.at % W, dz = ((p / W) | 0) - ((hz.at / W) | 0), [qx, qz] = QUAD[t0 % 4];
      return dx * qx > 0 && dz * qz > 0 && dx * dx + dz * dz <= 5; };
    if((L.hazards || []).some(hz => hz.kind === 'thorn' && under(hz))) jobs.push(this.pip.duck(0.24 * speed));
    (L.hazards || []).forEach((hz, k) => {
      const m = this.hazardMeshes[k];
      if(hz.kind === 'boulder'){
        const a = this.cellPos(this.boulderAt(hz, t0)), b = this.cellPos(this.boulderAt(hz, t1)), d = b.clone().sub(a), spin = m.userData.spin;
        const ax = new THREE.Vector3(d.z, 0, -d.x).normalize(), q0 = spin.quaternion.clone();
        jobs.push(new Promise(res => { let t = 0; this.fx.push({ update:dt => { t = Math.min(1, t + dt / (0.24 * speed)); const e = easeIO(t);
          m.position.lerpVectors(a, b, e); if(d.lengthSq() > 0) spin.quaternion.copy(q0).premultiply(new THREE.Quaternion().setFromAxisAngle(ax, e * d.length() / 0.36));
          if(t >= 1){ res(); return false; } return true; } }); }));
      } else {
        const pv = m.userData.pivot, y0 = pv.rotation.y;
        jobs.push(new Promise(res => { let t = 0; this.fx.push({ update:dt => { t = Math.min(1, t + dt / (0.24 * speed)); pv.rotation.y = y0 - easeIO(t) * Math.PI / 2; if(t >= 1){ pv.rotation.y = this.thornYaw(t1); res(); return false; } return true; } }); }));
      }
    });
    this.turnShown = t1;
    return Promise.all(jobs).then(() => this.warn((t1 + 1) % (L.cycle || 1)));
  }
  // A hazard bonk: the tile flashes where it would have hit.
  hazardBonk(at){
    const w = makeWarning(); w.material.color.set('#ff6a5a'); w.position.copy(this.cellPos(at)); w.position.y += 0.05; this.scene.add(w);
    let t = 0; this.fx.push({ update:dt => { t += dt / 0.5; w.scale.setScalar(1 + t * 0.8); w.material.opacity = Math.max(0, 0.8 * (1 - t)); if(t >= 1){ w.removeFromParent(); w.geometry.dispose(); w.material.dispose(); return false; } return true; } });
  }

  updateGusts(t){
    for(const f of this.gustFx || []){
      for(const m of f.streaks){
        const u = m.userData, d = ((t * 0.9 + u.ph * f.g.cells.length) % (f.g.cells.length + 0.5)) - 0.5;
        m.visible = d < f.reach - 0.3;
        const fade = Math.min(1, (d + 0.5) * 2, (f.reach - 0.3 - d) * 2);
        m.scale.setScalar(Math.max(0.05, fade));
        m.position.set(f.start.x + f.dx * d + (f.dz ? u.lane : 0), f.start.y + u.hy + Math.sin(t * 3 + u.ph * 9) * 0.04, f.start.z + f.dz * d + (f.dx ? u.lane : 0));
      }
    }
  }

  // Doors, gates, portals and bridges face along the walkway they sit in.
  sideways(i){
    const L = this.level, x = i % L.w, z = (i / L.w) | 0;
    const open = (xx, zz) => xx >= 0 && zz >= 0 && xx < L.w && zz < L.h && !['void', 'rock', 'tree', 'water'].includes(L.cells[zz*L.w + xx].kind);
    const ew = open(x - 1, z) || open(x + 1, z), ns = open(x, z - 1) || open(x, z + 1);
    return ew && !ns;
  }

  // World position of cell i: its map tile, its storey's altitude, and its height
  // (a pan's height follows the scales as currently shown).
  cellPos(i, standing = true){
    const L = this.level, c = L.cells[i], { storey, mx, mz } = cellPlace(L, i);
    const h = (L.storeys[storey].at[2] + heightAt(L, i, this.tiltShown || 0)) * LV;
    return new THREE.Vector3(mx - this.centre[0], h + (standing && c.kind === 'ramp' ? LV / 2 : 0), mz - this.centre[1]);
  }

  // Frame the storey Pip is on (or the one being edited); the map view and the
  // title showcase frame every storey. snap = jump there instead of gliding.
  frameIsle(snap = false){
    if(!this.level) return;
    const L = this.level, S = L.storeys;
    const focus = this.editStorey ?? this.pipStorey ?? 0, all = this.mapView || this.showcase || S.length === 1;
    const ks = all ? S.map((_, k) => k) : [focus];
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for(const k of ks){
      const s = S[k];
      x0 = Math.min(x0, s.at[0]); x1 = Math.max(x1, s.at[0] + s.w - 1); z0 = Math.min(z0, s.at[1]); z1 = Math.max(z1, s.at[1] + s.h - 1);
      y0 = Math.min(y0, s.at[2]); y1 = Math.max(y1, s.at[2] + this.storeyTop[k]);
    }
    const radius = Math.hypot(x1 - x0 + 1, z1 - z0 + 1) / 2 + 0.8 + (y1 - y0) * LV * 0.4;
    // Fit to the visible window only (smaller than the canvas when a bottom sheet covers it).
    const vf = this.visFrac, fov = 2 * Math.atan(Math.tan(this.camera.fov * Math.PI / 360) * vf), aspect = Math.max(0.5, this.camera.aspect / vf);
    const fit = radius / Math.sin(fov / 2) / Math.min(1, aspect * 0.95);
    this.distTo = fit * (this.compact ? 1.25 : 1.02);
    this.targetTo.set((x0 + x1) / 2 - this.centre[0], (y0 + (y1 - y0) * 0.35) * LV - 0.4, (z0 + z1) / 2 - this.centre[1]);
    if(snap){ this.dist = this.distTo; this.target.copy(this.targetTo); }
    this.scene.fog.near = this.distTo * 1.4; this.scene.fog.far = this.distTo * 4.5;
    // shadows cover the whole map, wherever the camera looks
    const s = this.sun.shadow.camera, ext = this.mapSpan * 0.75 + 0.8 + this.targetTo.length() + 1.5;
    s.left = -ext; s.right = ext; s.top = ext; s.bottom = -ext; s.near = 0.5; s.far = 60 + ext; s.updateProjectionMatrix();
    // a storey floating over the framed one fades, so the lower isle stays readable
    for(let k = 0; k < S.length; k++){
      const a = S[k], b = S[focus], over = !all && k !== focus && a.at[2] > b.at[2]
        && a.at[0] < b.at[0] + b.w && b.at[0] < a.at[0] + a.w && a.at[1] < b.at[1] + b.h && b.at[1] < a.at[1] + a.h;
      this.storeyGroups[k].userData.fadeTo = over ? 0.22 : 1;
    }
  }
  fadeStorey(g, f){
    g.userData.fade = f;
    g.traverse(o => { if(!o.material) return; for(const m of Array.isArray(o.material) ? o.material : [o.material]){
      const b = m.userData.fb || (m.userData.fb = { o:m.opacity, t:m.transparent, d:m.depthWrite });
      const t = b.t || f < 0.999;
      if(t !== m.transparent){ m.transparent = t; m.needsUpdate = true; }
      m.opacity = b.o * f; m.depthWrite = b.d && f > 0.98;
    } });
  }

  buildAtmosphere(T, r){
    // clouds drifting around and below the isle
    this.clouds = [];
    const isleSpan = this.mapSpan;
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
    const span = this.mapSpan * 0.8 + 2;
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
    for(const m of this.crateMeshes?.values() || []) m.removeFromParent();
    for(const m of this.fillers || []) m.removeFromParent();
    for(const m of this.buoyMeshes?.values() || []) m.removeFromParent();
    this.tiltShown = panTilt(this.level, state);       // heights first: crates and Pip stand on them
    this.pipStorey = this.level.sid[state.p];
    this.crateMeshes = new Map(); this.fillers = [];
    for(const i of state.crates){ const m = makeCrate(this.T); m.position.copy(this.cellPos(i)); m.userData.cell = i; this.groupOf(i).add(m); this.crateMeshes.set(i, m); }
    for(const i of state.filled){ this.addFiller(i, true); }
    this.buoyMeshes = new Map();
    for(const i of state.buoys || []){ const m = makeBuoy(this.T); m.position.copy(this.buoyPos(i, state)); this.groupOf(i).add(m); this.buoyMeshes.set(i, m); }
    this.pip.setHold(state.hold, this.T);
    if(this.hazardMeshes && this.hazardMeshes.length) this.placeHazards(state.t || 0);
    for(const [i, k] of this.keys) k.visible = !state.got.includes(i);
    this.applyState(state, true);
    this.pip.placeAt(this.cellPos(state.p)); this.pip.group.visible = true;
    this.setPans(this.tiltShown);
    this.frameIsle();
    for(const g of this.storeyGroups) if(g.userData.fade < 1) this.fadeStorey(g, g.userData.fade);   // new crates join a faded storey
  }
  addFiller(i, instant, mesh){
    const m = mesh || makeCrate(this.T);
    const c = this.level.cells[i];
    const y = c.h * LV - 0.78;
    m.traverse(o => { if(o.material && !o.userData.mossy){ o.material = o.material.clone(); o.material.color.lerp(new THREE.Color(this.T.waterDeep), 0.35); o.userData.mossy = true; } });
    m.userData.cell = i;
    if(!mesh) this.groupOf(i).add(m);
    const p = this.cellPos(i, false); p.y = y;
    if(instant) m.position.copy(p);
    else this.tweenObj(m, m.position.clone(), p, 0.35);
    this.fillers.push(m);
  }
  // A buoy sits on its tile — or, floating, low in the water with its top at the surface.
  buoyPos(i, state){ const p = this.cellPos(i); if(floating(this.level, state, i)) p.y -= 0.46; return p; }
  // Seeds are not engine state: the session says which ones Pip has picked.
  setSeeds(got){ this.seedsGot = new Set(got); for(const [i, m] of this.seedMeshes) m.visible = !this.seedsGot.has(i); }
  collectSeed(i){
    const m = this.seedMeshes.get(i); if(!m || !m.visible) return;
    this.seedsGot.add(i); sfx.seed(); this.sparkle(i, '#b6ff7a');
    const y0 = m.position.y; let t = 0;
    this.fx.push({ update:dt => { t += dt / 0.5; m.position.y = y0 + easeIO(Math.min(1, t)) * 0.9; m.scale.setScalar(Math.max(0.001, 1 - t)); if(t >= 1){ m.visible = false; m.position.y = y0; m.scale.setScalar(1); return false; } return true; } });
  }
  // A released balloon drifts up and away.
  letGo(at){
    const b = makeBalloon(this.T.accent, 0.62); b.position.copy(this.cellPos(at)).add(new THREE.Vector3(0.17, 0.22, -0.06)); this.scene.add(b);
    let t = 0; const x0 = b.position.x, y0 = b.position.y;
    this.fx.push({ update:dt => { t += dt; b.position.y = y0 + t * 1.6 + t * t * 0.4; b.position.x = x0 + Math.sin(t * 2) * 0.25; b.rotation.z = Math.sin(t * 3) * 0.2;
      if(t > 3.5){ b.removeFromParent(); b.traverse(o => { o.geometry && o.geometry.dispose(); }); return false; } return true; } });
  }

  // Targets for the pieces that ease toward their state each frame.
  applyState(state, instant = false){
    this.state = state;
    const open = gatesOpen(this.level, state);
    for(const g of this.gates){ g.userData.target = open ? 1 : 0; if(instant) g.userData.open = g.userData.target; }
    for(const [i, p] of this.plates){ p.userData.target = ((state.p === i && pipWeight(state) > 0) || state.crates.includes(i)) ? 1 : 0; if(instant) p.userData.pressed = p.userData.target; }
    for(const [i, b] of this.bridges){ b.userData.target = (bridgeUp(this.level.cells[i], state)) ? 1 : 0; if(instant) b.userData.up = b.userData.target; }
    for(const l of this.levers){ l.userData.target = state.flip ? -0.6 : 0.6; if(instant) l.userData.angle = l.userData.target; }
    for(const [i, d] of this.doors){ d.userData.target = state.opened.includes(i) ? 1 : 0; if(instant) d.userData.open = d.userData.target; }
    for(const [i, pst] of this.posts) pst.userData.balloon.visible = !(state.posts || []).includes(i);
    for(const [i, v] of this.vents) v.userData.capped = state.crates.includes(i);
    for(const f of this.gustFx || []){ let n = 0; for(const c of f.g.cells){ if(windAt(this.level, state, c)) n++; else break; } f.reach = n; }
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
          const pieces = e.buoy ? this.buoyMeshes : this.crateMeshes;
          const m = pieces.get(e.from); if(!m) continue;
          pieces.delete(e.from); pieces.set(e.to, m); m.userData.cell = e.to;
          const a = m.position.clone(), b = e.buoy ? this.buoyPos(e.to, res.state) : this.cellPos(e.to);
          const drop = this.level.cells[e.to].h !== this.level.cells[e.from].h;
          if(e.t === 'push') sfx.push(); else sfx.slide();
          await this.tweenObj(m, a, b, (e.t === 'push' ? 0.2 : 0.09) * speed, drop ? 0.15 : 0);
        } else if(e.t === 'float'){ sfx.float(); this.splash(e.at); }
        else if(e.t === 'sink'){
          const m = this.crateMeshes.get(e.at); this.crateMeshes.delete(e.at);
          sfx.sink(); this.splash(e.at); this.addFiller(e.at, false, m);
        }
      }
    })();

    const glide = ev.find(e => e.t === 'glide');
    if(glide){
      sfx.glide();
      const a = this.cellPos(glide.from), b = this.cellPos(glide.to), tiles = Math.abs(a.x - b.x) + Math.abs(a.z - b.z);
      await this.pip.float(a, b, (0.22 + 0.16 * tiles) * speed);
      this.dust(glide.to);
    }
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
      if(e.t === 'tp'){
        sfx.tp(); this.sparkle(e.from, '#ffffff');
        if(e.gateway){ this.pipStorey = this.level.sid[e.to]; this.frameIsle(); }   // the camera follows Pip to the new storey
        await this.pip.teleport(this.cellPos(e.from), this.cellPos(e.to)); this.sparkle(e.to, '#ffffff');
      }
      if(e.t === 'key'){ sfx.key(); this.collectKey(e.at); }
      if(e.t === 'toggle'){ sfx.toggle(); }
      if(e.t === 'wait'){ sfx.wait(); await this.pip.hop(this.cellPos(e.at), this.cellPos(e.at), 'flat', 0.22 * speed); }
      if(e.t === 'take'){ sfx.take(e.what); this.pip.setHold(e.what, this.T); if(e.what === 'balloon') this.posts.get(e.at).userData.balloon.visible = false; }
      if(e.t === 'drop'){ sfx.drop(); this.pip.setHold('', this.T); }
      if(e.t === 'release'){ sfx.release(); this.pip.setHold('', this.T); this.letGo(e.at); }
      if(e.t === 'gust'){
        if(e.buoy){ const m = this.buoyMeshes.get(e.from); if(m){ this.buoyMeshes.delete(e.from); this.buoyMeshes.set(e.to, m); sfx.gust(); await this.tweenObj(m, m.position.clone(), this.buoyPos(e.to, res.state), 0.3 * speed, 0.08); } }
        else { sfx.gust(); await this.pip.drift(this.cellPos(e.from), this.cellPos(e.to), 0.32 * speed); }
      }
      if(e.t === 'fall'){
        const m = this.crateMeshes.get(e.at); this.crateMeshes.delete(e.at);
        sfx.fall(); this.splash(e.at); if(m) this.addFiller(e.at, false, m);
      }
    }
    await crateJobs;
    const sc = ev.find(e => e.t === 'scales'), hz = ev.find(e => e.t === 'hazard');
    const beat = hz ? this.stepHazards((hz.turn - 1 + this.level.cycle) % this.level.cycle, hz.turn, speed, res.state.p) : null;
    if(hz) sfx.roll();
    if(sc){ sfx.scales(sc.tilt > sc.from); await this.settleScales(sc.from, sc.tilt, res.state); }
    if(beat) await beat;
    this.applyState(res.state);
    if(ev.some(e => e.t === 'gate')) sfx.gate(ev.find(e => e.t === 'gate').open);
  }
  bonk(hit){ sfx.bonk(); if(hit){ sfx.thorn(); this.hazardBonk(hit.at); } return this.pip.bonk(); }
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
    const ease = Math.min(1, dt * 3.5);
    this.dist += (this.distTo - this.dist) * ease; this.target.lerp(this.targetTo, ease);
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
      for(const p of this.portals){ const u = p.userData; u.swirl.rotation.z = -t * 3; u.glowMat.opacity = (0.45 + Math.sin(t * 3) * 0.12) * this.fadeOf(p); u.gem.rotation.y = t * 2; }
      for(const m of this.threads) m.opacity = 0.16 + Math.sin(t * 2.2) * 0.07;
      for(const g of this.storeyGroups){ const u = g.userData; if(Math.abs(u.fade - u.fadeTo) > 0.002) this.fadeStorey(g, u.fade + (u.fadeTo - u.fade) * Math.min(1, dt * 5)); }
      for(const v of this.vents.values()) if(!v.userData.capped) v.userData.fan.rotation.y = t * 7;
      for(const m of this.seedMeshes.values()) if(m.visible){ m.userData.spin.rotation.y = t * 1.6; m.userData.spin.position.y = 0.32 + Math.sin(t * 2.2) * 0.05; }
      for(const pst of this.posts.values()){ const b = pst.userData.balloon; b.rotation.z = Math.sin(t * 1.5 + pst.position.x) * 0.12; }
      for(const m of this.buoyMeshes?.values() || []){ const b = m.userData.balloon; b.rotation.z = Math.sin(t * 1.7 + m.position.z) * 0.1; m.userData.box.rotation.z = Math.sin(t * 1.2 + m.position.x) * 0.03; }
      this.updateGusts(t);
      for(const w of this.warnings || []) if(w.visible){ w.material.opacity = 0.35 + Math.sin(t * 5) * 0.2; w.scale.setScalar(1 + Math.sin(t * 5) * 0.06); }
      for(const m of this.hazardMeshes || []) if(m.userData.body) m.userData.body.scale.y = 1 + Math.sin(t * 2.2 + m.position.x) * 0.03;
      for(const k of this.keys.values()){ if(k.visible){ k.userData.spin.rotation.y = t * 2; k.userData.spin.position.y = 0.55 + Math.sin(t * 2.5) * 0.07; } }
      const lerp = (o, key, rate) => { o.userData[key] += (o.userData.target - o.userData[key]) * Math.min(1, dt * rate); return o.userData[key]; };
      for(const g of this.gates){ if(g.userData.target == null) continue; const o = lerp(g, 'open', 6); g.userData.bars.position.y = -o * 0.86; }
      for(const p of this.plates.values()){ if(p.userData.target == null) continue; const v = lerp(p, 'pressed', 10); p.userData.base.position.y = 0.02 - v * 0.04; p.userData.ringMat.emissiveIntensity = 0.15 + v * 1.6; }
      for(const b of this.bridges.values()){ if(b.userData.target == null) continue; const v = lerp(b, 'up', 5); b.position.y = b.userData.baseY - (1 - v) * 0.42; b.userData.mats.forEach(m => m.opacity = (0.35 + v * 0.65) * this.fadeOf(b)); }
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
