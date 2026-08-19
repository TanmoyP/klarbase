// ============================================================================
// Klarbase client — the Phase 1 sandbox, split out of prototypes/phase1.html.
// The logic core (Components / Validator / TraversalGraph) is IMPORTED from
// @klar/core — the single source of truth shared with the server publish gate.
// Renderer / Player / Editor / UI sections below are the verified Phase 1 code.
// ============================================================================
import * as THREE from 'three';
import {
  PAL, DIRS, TYPES, TYPE_ORDER, ROLE_ORDER, PLOT,
  ck, nk, buildOccupancy, validate, ERR_TEXT,
  rot, screenKey, seamKey, buildGraph, CURATED,
} from '@klar/core';

// Feature gates — main.js sets these from the session. Anonymous visitors may
// play presets only (Phase 2 gating rule): building and importing are locked.
export const gates = { canBuild:true };


/* =========================================================================
   PHASE 1 PROTOTYPE v4 — built against Phase 0 spec v4.5
   Scope: camera, grid, Block/Slab/Stairs/Column/Spawn/Goal, socket legality,
   traversal graph, ONE working illusion seam, avatar, grass on blocks,
   build/play toggle, v4 JSON export/import, three presets.

   EDITOR DOCTRINE (spec §12): placement is strict, deletion is free, and
   recovery is always visible. Build mode may hold broken drafts; play mode
   and the publish gate may not. Undo restores anything; shift+Backspace
   cascade-deletes a support together with everything it was holding up.

   MODULE MAP (single file; each module is a banner-delimited section):
     Components      — TYPES table: socket-derived occupancy + walk nodes
     Validator       — validate(): bounds, overlap, support, spawn/goal
     TraversalGraph  — buildGraph(): geometric, stair, and illusion edges
     Renderer        — camera, lights, scene rebuild, grass, seam markers
     Player          — movement, illusion crossing, win state, avatar
     Editor          — cursor, ghost, placement, pick/delete, undo/redo
     Schema          — v4 JSON export/import (toV4 / importJSON)
     UI              — bar, toasts, start screen, input routing, main loop

   PROJECTION NOTE (correction to spec convention B):
   The spec asked for 2:1 dimetric (elev 26.57 deg) AND for (1,1,1) to be the
   projection's null vector. Those are incompatible. At 2:1 dimetric the null
   vector is (1, 1/sqrt2, 1) — irrational, so illusion detection would need a
   float tolerance, which is exactly what conventions A and B exist to avoid.
   True isometric (elev atan(1/sqrt2) = 35.264 deg, camera on the (1,1,1) axis)
   makes (1,1,1) the null vector exactly, and screen keys fall out as integers:

       u = x - z                 (horizontal screen axis)
       v = h2 - x - z            (vertical screen axis, h2 = height in half-cells)

   Two nodes coincide on screen iff both integers match. No epsilon anywhere.

   STAIR MODEL (v4.4):
   A stair attaches on-axis only: a low socket on its entry face and a high
   socket on its exit face. Its top is NOT a general walk surface — nothing
   attaches to the flanks, and the flat pass below skips stair nodes entirely.
   Traversal over both socket edges stays bidirectional: attachment is
   directed, walking is not. And the treads ascend toward the facing
   direction — v1 rendered the mesh 180 degrees out of phase with the graph
   at every rotation, so the stairs visually descended where they climbed.
   ========================================================================= */

/* ---------------------------------------------------------------- palette */
let W = {          // the authored puzzle
  name:'Untitled',
  yaw:0,
  components:[],
  allow:[],        // authored illusion seams {a,b,yaw} — opt-in, never automatic
  nextId:1,
};

/* ==================== MODULE: Renderer — camera & lights =================== */
const stage = document.getElementById('stage');
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x6b5878, 34, 78);

const renderer = new THREE.WebGLRenderer({antialias:true, alpha:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
stage.appendChild(renderer.domElement);

// Deliberately no shadow map: a cast shadow would betray the true height of an
// illusion-merged block and expose the seam. Shading comes from face normals only.
scene.add(new THREE.AmbientLight(0xb9a9d0, 0.72));
const key = new THREE.DirectionalLight(0xfff0dc, 0.78); key.position.set(6,10,4); scene.add(key);
const fill= new THREE.DirectionalLight(0x8fa6d8, 0.28); fill.position.set(-6,4,-5); scene.add(fill);

let camDist = 40, frustum = 15;
const cam = new THREE.OrthographicCamera(-1,1,1,-1,0.1,250);
const camTarget = new THREE.Vector3(8,2,8);
let yawNow = 0, yawFrom = 0, yawTo = 0, yawT = 1;

function resize(){
  const w = innerWidth, h = innerHeight, a = w/h;
  cam.left=-frustum*a; cam.right=frustum*a; cam.top=frustum; cam.bottom=-frustum;
  cam.updateProjectionMatrix();
  renderer.setSize(w,h);
}
addEventListener('resize', resize);

function placeCamera(){
  const a = yawNow * Math.PI/2;
  // camera on the (1,1,1) axis, rotated about Y — true isometric
  const x = Math.cos(a)*1 + Math.sin(a)*1;
  const z = -Math.sin(a)*1 + Math.cos(a)*1;
  const d = camDist/Math.sqrt(3);
  cam.position.set(camTarget.x + x*d, camTarget.y + d, camTarget.z + z*d);
  cam.up.set(0,1,0);
  cam.lookAt(camTarget);
}

/* ==================== Renderer (cont.) — scene, grass, seam markers ======== */
let worldGroup = new THREE.Group(); scene.add(worldGroup);
let G = null;                                   // current graph
const grassGrowth = new Map();                  // blockCellKey -> 0..1 (monotonic)
const grassGroups = new Map();
let seamMeshes = [];

const mat = {};
for(const k in PAL) mat[k] = new THREE.MeshLambertMaterial({color:PAL[k]});
const edgeMat = new THREE.LineBasicMaterial({color:0x3b3252, transparent:true, opacity:.5});

function boxWithEdges(w,h,d,material){
  const g = new THREE.Group();
  const geo = new THREE.BoxGeometry(w,h,d);
  g.add(new THREE.Mesh(geo, material));
  g.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMat));
  return g;
}

// deterministic per-blade randomness: same plot grows identically for everyone
function hash3(a,b,c,d){
  let h = 2166136261;
  for(const v of [a,b,c,d]){ h ^= (v+9973); h = Math.imul(h, 16777619); }
  return ((h>>>0) % 100000) / 100000;
}

function makeGrass(cellKey, x, y, z){
  const g = new THREE.Group();
  const blades = 7;
  for(let i=0;i<blades;i++){
    const rx = hash3(x,y,z,i*3+1), rz = hash3(x,y,z,i*3+2), rs = hash3(x,y,z,i*3+3);
    const hgt = 0.16 + rs*0.20;
    const geo = new THREE.ConeGeometry(0.032, hgt, 4);
    const m = new THREE.Mesh(geo, i%3===0 ? mat.grassTip : mat.grass);
    m.position.set(x+0.16+rx*0.68, y+1+hgt/2, z+0.16+rz*0.68);
    m.userData.baseY = m.position.y; m.userData.h = hgt; m.userData.ph = rs*6.28;
    g.add(m);
  }
  g.scale.y = 0.001; g.visible = false;
  return g;
}

function rebuildScene(){
  scene.remove(worldGroup);
  worldGroup = new THREE.Group(); scene.add(worldGroup);
  grassGroups.clear(); seamMeshes = [];

  for(const c of W.components){
    const [x,y,z] = c.p;
    const role = (c.c && PAL[c.c]) ? c.c : TYPES[c.t].color;   // per-instance role wins
    const material = mat[role];
    let obj;

    if(c.t==='block' || c.t==='spawn'){
      obj = boxWithEdges(1,1,1, material);
      obj.position.set(x+.5, y+.5, z+.5);
      if(c.t==='spawn'){
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3,0.035,6,20), mat.accent);
        ring.rotation.x = Math.PI/2; ring.position.y = 0.52; obj.add(ring);
      }
    }
    else if(c.t==='slab'){
      obj = boxWithEdges(1,.5,1, material);
      obj.position.set(x+.5, y+.25, z+.5);
    }
    else if(c.t==='column'){
      const h = (c.v&&c.v.h)||3;
      obj = boxWithEdges(.72,h,.72, material);
      obj.position.set(x+.5, y+h/2, z+.5);
    }
    else if(c.t==='goal'){
      obj = boxWithEdges(1,1,1, material);
      obj.position.set(x+.5, y+.5, z+.5);
      const bea = new THREE.Mesh(new THREE.OctahedronGeometry(0.26), mat.accent);
      bea.position.y = 1.05; bea.userData.spin = true; obj.add(bea);
    }
    else if(c.t==='stairs'){
      obj = new THREE.Group();
      const steps = 2;
      for(let i=0;i<steps;i++){
        const h = (i+1)/steps;
        const s = boxWithEdges(1, h, 1/steps, material);
        // treads ascend toward the facing direction: r=0 climbs -z (north).
        // v1 had this mirrored, so the mesh descended where the graph climbed.
        s.position.set(0, h/2, 0.5 - (i+0.5)/steps);
        obj.add(s);
      }
      obj.rotation.y = -(c.r||0) * Math.PI/2;
      obj.position.set(x+.5, y, z+.5);
    }

    obj.userData.cid = c.i;
    worldGroup.add(obj);

    if(TYPES[c.t].grass){
      const k = ck(x,y,z);
      const gg = makeGrass(k, x, y, z);
      grassGroups.set(k, gg);
      worldGroup.add(gg);
      if(!grassGrowth.has(k)) grassGrowth.set(k, 0);
    }
  }
  refreshGrass();
  buildSeamMarkers();
}

// shimmer plane on any node that currently has an active illusion partner
function buildSeamMarkers(){
  if(!G) return;
  const shown = new Set();
  for(const s of G.illusion){ if(s.yaw===yawTo){ shown.add(s.a); shown.add(s.b); } }
  if(MODE==='build') for(const s of G.candidates){ if(s.yaw===yawTo){ shown.add(s.a); shown.add(s.b); } }
  for(const [k,n] of G.nodes){
    if(!shown.has(k)) continue;
    const authored = G.illusion.some(s => s.yaw===yawTo && (s.a===k||s.b===k));
    const geo = new THREE.PlaneGeometry(0.96, 0.96);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      color:PAL.accent, transparent:true, opacity:0.0, side:THREE.DoubleSide,
      depthWrite:false
    }));
    m.rotation.x = -Math.PI/2;
    m.position.set(n.x+.5, n.h2/2 + 0.02, n.z+.5);
    m.userData.authored = authored;
    worldGroup.add(m);
    seamMeshes.push(m);
  }
}

function refreshGrass(){
  for(const [k,g] of grassGroups){
    const v = grassGrowth.get(k) || 0;
    g.visible = v > 0.02;
    g.scale.y = Math.max(0.001, v);
    g.scale.x = g.scale.z = 0.6 + 0.4*v;
  }
}

/* ------------------------------------------------------------------ avatar */
const avatar = new THREE.Group();
{
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.15,0.19,0.26,10), mat.avatar);
  body.position.y = 0.14; avatar.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.235,16,12), mat.avatar);
  head.position.y = 0.47; avatar.add(head);
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.16,0.045,6,14), mat.avatarAcc);
  scarf.rotation.x = Math.PI/2; scarf.position.y = 0.29; avatar.add(scarf);
}
scene.add(avatar);
avatar.visible = false;

/* ------------------------------------------------------------------- audio */
let AC = null;
function audio(){ if(!AC) AC = new (window.AudioContext||window.webkitAudioContext)(); return AC; }
const PENT = [0,2,4,7,9,12,14,16];
function tone(semi, {t=0, dur=0.5, gain=0.16, type='sine', detune=0}={}){
  const a = audio(), now = a.currentTime + t;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.value = 220 * Math.pow(2, (semi+detune)/12);
  g.gain.setValueAtTime(0, now);
  g.gain.linearRampToValueAtTime(gain, now+0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, now+dur);
  o.connect(g).connect(a.destination); o.start(now); o.stop(now+dur+0.05);
}
const sfxStep  = () => tone(PENT[(Math.random()*4)|0]-12, {dur:0.11, gain:0.05, type:'triangle'});
const sfxStair = () => tone(PENT[2]-12, {dur:0.16, gain:0.06, type:'triangle'});
const sfxPlace = () => tone(PENT[1], {dur:0.13, gain:0.07, type:'square'});
const sfxNo    = () => tone(-6, {dur:0.12, gain:0.05, type:'sawtooth'});
const sfxTurn  = () => tone(PENT[3]-12, {dur:0.2, gain:0.04, type:'sine'});
// the most important sound in the game
function sfxSeam(){
  tone(PENT[4], {dur:1.5, gain:0.10});
  tone(PENT[6], {t:0.09, dur:1.5, gain:0.085});
  tone(PENT[7], {t:0.19, dur:1.9, gain:0.07});
}
function sfxGoal(){ [0,2,4,7].forEach((s,i)=>tone(PENT[i+2],{t:i*0.11,dur:1.4,gain:0.11})); }

/* ==================== MODULE: Player — game state ========================== */
let MODE = 'play';                 // 'play' | 'build'
let cur = null;                    // current node key
let moving = null;                 // {from,to,t,dur,kind}
let won = false;
let visited = new Set();
const cursor = { x:4, y:0, z:4 };
let selType = 'block', selRot = 0;
let selCol = null;                 // null = type default; otherwise a palette role
let selIndex = 0;                  // index into the spatially sorted component list
const SELECT = '__select';
const undoStack = [];
const redoStack = [];

function nodeAt(k){ return G.nodes.get(k); }
function nodePos(n){ return new THREE.Vector3(n.x+.5, n.h2/2, n.z+.5); }

function recompute(){
  G = buildGraph(W.components, W.allow);
  rebuildScene();
}

function startPlay(){
  MODE='play'; won=false; moving=null; visited.clear();
  document.getElementById('winflash').style.opacity = 0;
  recompute();
  const sp = W.components.find(c=>c.t==='spawn');
  cur = sp ? ck(sp.p[0], sp.p[1]+1, sp.p[2]) : (G.nodes.keys().next().value||null);
  if(cur && G.nodes.has(cur)){
    avatar.visible = true;
    avatar.position.copy(nodePos(nodeAt(cur)));
    markVisit(cur);
  } else { avatar.visible=false; }
  const n = cur && nodeAt(cur);
  if(n) camTarget.set(n.x+.5, n.h2/2, n.z+.5);
  syncUI();
}

function markVisit(k){
  const n = nodeAt(k); if(!n) return;
  visited.add(k);
  // grass grows on the block you stand on, and a little on its neighbours.
  // monotonic: it never recedes, including after a reset.
  const bump = (x,y,z,amt)=>{
    const key = ck(x,y,z);
    if(!grassGrowth.has(key)) return;
    grassGrowth.set(key, Math.max(grassGrowth.get(key), amt));
  };
  bump(n.x, n.y-1, n.z, 1);
  for(const [dx,,dz] of DIRS) bump(n.x+dx, n.y-1, n.z+dz, 0.4);
}

/* ==================== Player (cont.) — movement ============================ */
function worldDir(idx){
  const [dx,,dz] = DIRS[idx];
  const [rx,rz] = rot(dx, dz, (4 - yawTo) % 4);
  return [rx, rz];
}

function tryMove(idx){
  if(moving || won || !cur) return;
  const [dx,dz] = worldDir(idx);
  const n = nodeAt(cur);
  const es = G.edges.get(cur) || [];

  // 1. a real edge in that direction
  for(const e of es){
    if(e.kind==='illusion') continue;
    const m = nodeAt(e.to);
    if(!m) continue;
    if(m.x - n.x === dx && m.z - n.z === dz){
      begin(e.to, e.kind); return;
    }
    // stairs move one cell horizontally AND one level
    if(e.kind==='stair' && Math.sign(m.x-n.x)===dx && Math.sign(m.z-n.z)===dz
       && Math.abs(m.x-n.x)+Math.abs(m.z-n.z)===1){
      begin(e.to, 'stair'); return;
    }
  }
  // 2. nothing there — but the camera says otherwise
  for(const e of es){
    if(e.kind!=='illusion') continue;
    if(!(e.yawMask & (1<<yawTo))) continue;
    begin(e.to, 'illusion'); return;
  }
  sfxNo();
}

function begin(to, kind){
  moving = { from:cur, to, t:0, kind,
             dur: kind==='illusion' ? 0.34 : (kind==='stair' ? 0.30 : (kind==='half' ? 0.25 : 0.22)) };
  if(kind==='illusion') sfxSeam();
  else if(kind==='stair') sfxStair();
  else if(kind==='half') tone(PENT[1]-12,{dur:0.13,gain:0.05,type:'triangle'});
  else sfxStep();
}

function finishMove(){
  cur = moving.to; moving = null;
  markVisit(cur);
  const n = nodeAt(cur);
  if(n && n.comp.t === 'goal' && !won){
    won = true; sfxGoal();
    // the quiet success state: a colour bloom that rises and lets go
    const wf = document.getElementById('winflash');
    wf.style.opacity = 1; setTimeout(()=>wf.style.opacity = 0, 1500);
    toast('You made it. The courtyard remembers.', false, 4200);
  }
}

const easeIO = t => t<.5 ? 4*t*t*t : 1-Math.pow(-2*t+2,3)/2;

/* ==================== MODULE: Editor ======================================= */
const ghost = new THREE.Group(); scene.add(ghost); ghost.visible=false;
const ghostMatOK  = new THREE.MeshLambertMaterial({color:PAL.accent, transparent:true, opacity:.5});
const ghostMatBad = new THREE.MeshLambertMaterial({color:0xd97a72, transparent:true, opacity:.45});
const gridGroup = new THREE.Group(); scene.add(gridGroup); gridGroup.visible=false;
{
  const g = new THREE.GridHelper(PLOT.size[0], PLOT.size[0], 0x8a7cb0, 0x5d5280);
  g.position.set(PLOT.size[0]/2, 0.002, PLOT.size[2]/2);
  // soft edge fade: dissolve the grid toward the fog colour radially, so the
  // plane reads as ground haze rather than a hard-edged overlay
  {
    const pos = g.geometry.attributes.position, col = g.geometry.attributes.color;
    const fogC = new THREE.Color(0x6b5878), base = new THREE.Color(0x7a6c9e);
    const half = PLOT.size[0]/2;
    for(let i=0;i<pos.count;i++){
      const dx = pos.getX(i)/half, dz = pos.getZ(i)/half;
      const t = Math.min(1, Math.sqrt(dx*dx+dz*dz));
      const c = base.clone().lerp(fogC, t*t);
      col.setXYZ(i, c.r, c.g, c.b);
    }
    col.needsUpdate = true;
  }
  g.material.transparent = true; g.material.opacity = 0.5;
  gridGroup.add(g);
}

function ghostComponent(){
  return { i:-1, t:selType, p:[cursor.x,cursor.y,cursor.z], r:selRot,
           c: selCol || undefined,
           v: selType==='column' ? {h:3} : undefined };
}
function placementOK(){
  if(selType===SELECT) return false;    // the pick tool is never "placed"
  const test = W.components.concat([ghostComponent()]);
  const v = validate(test);
  return !v.errors.some(e => e.id === -1 || e.code==='E_OVERLAP' || e.code==='E_BOUNDS' || e.code==='E_FLOATING');
}
function updateGhost(){
  while(ghost.children.length) ghost.remove(ghost.children[0]);
  if(selType===SELECT) return;          // no ghost for the pick tool
  const ok = placementOK();
  const m = ok ? ghostMatOK : ghostMatBad;
  ghostMatOK.color.setHex(PAL[selCol || TYPES[selType].color]);   // ghost wears the held colour
  const c = ghostComponent();
  const [x,y,z] = c.p;
  let o;
  if(selType==='column'){ o = new THREE.Mesh(new THREE.BoxGeometry(.72,3,.72), m); o.position.set(x+.5,y+1.5,z+.5); }
  else if(selType==='slab'){ o = new THREE.Mesh(new THREE.BoxGeometry(1,.5,1), m); o.position.set(x+.5,y+.25,z+.5); }
  else if(selType==='stairs'){
    o = new THREE.Group();
    for(let i=0;i<2;i++){ const h=(i+1)/2;
      const s = new THREE.Mesh(new THREE.BoxGeometry(1,h,1/2), m);
      s.position.set(0,h/2,0.5-(i+0.5)/2); o.add(s); }   // ascends toward facing, v4.4
    // arrow showing which way it climbs — the one thing you cannot read off the shape
    const ar = new THREE.Mesh(new THREE.ConeGeometry(0.16,0.32,4),
                new THREE.MeshBasicMaterial({color:PAL.accent}));
    ar.rotation.x = -Math.PI/2; ar.position.set(0,1.35,-0.2); o.add(ar);   // points uphill
    o.rotation.y = -selRot*Math.PI/2; o.position.set(x+.5,y,z+.5);
  }
  else { o = new THREE.Mesh(new THREE.BoxGeometry(1,1,1), m); o.position.set(x+.5,y+.5,z+.5); }
  ghost.add(o);
  // a faint column down to the ground so height is readable
  const post = new THREE.Mesh(new THREE.BoxGeometry(.06, Math.max(y,0.01), .06),
                new THREE.MeshBasicMaterial({color:PAL.accent, transparent:true, opacity:.22}));
  post.position.set(x+.5, y/2, z+.5); ghost.add(post);
}

// The editor's whole job around illusions: surface candidates, let the author
// promote the ones they meant. Nothing is traversable until they say so.
function toggleSeamAtCursor(){
  const k = ck(cursor.x, cursor.y+1, cursor.z);
  const here = G.candidates.filter(s => (s.a===k||s.b===k) && s.yaw===yawTo);
  if(!here.length){
    const any = G.candidates.filter(s => s.a===k||s.b===k);
    toast(any.length ? 'alignment here, but not at this angle — turn the world'
                     : 'no alignment detected on this block', true);
    sfxNo(); return;
  }
  snapshot();
  const on = new Set(W.allow.map(s=>seamKey(s.a,s.b,s.yaw)));
  const allOn = here.every(s => on.has(seamKey(s.a,s.b,s.yaw)));
  for(const s of here){
    const key = seamKey(s.a,s.b,s.yaw);
    if(allOn) W.allow = W.allow.filter(x => seamKey(x.a,x.b,x.yaw) !== key);
    else if(!on.has(key)) W.allow.push({a:s.a, b:s.b, yaw:s.yaw});
  }
  recompute();
  if(allOn){ toast('seam withdrawn'); tone(-4,{dur:.14,gain:.05,type:'square'}); }
  else { toast('seam authored — '+here.length+' link'+(here.length>1?'s':'')); sfxSeam(); }
}

const hilite = new THREE.Group(); scene.add(hilite); hilite.visible=false;
const hiliteMat = new THREE.LineBasicMaterial({color:PAL.accent});

// Spatial ordering so that cycling left/right feels like scanning the scene
// rather than walking an arbitrary insertion list.
function sortedComponents(){
  return W.components.map((c,i)=>({c,i})).sort((A,B)=>{
    const [ax,az] = rot(A.c.p[0], A.c.p[2], yawTo);
    const [bx,bz] = rot(B.c.p[0], B.c.p[2], yawTo);
    const au = ax-az, bu = bx-bz;
    if(au!==bu) return au-bu;
    return (2*A.c.p[1]-ax-az) - (2*B.c.p[1]-bx-bz);
  }).map(o=>o.c);
}
function selectedComponent(){
  const list = sortedComponents();
  if(!list.length) return null;
  selIndex = ((selIndex % list.length) + list.length) % list.length;
  return list[selIndex];
}
function updateHilite(){
  while(hilite.children.length) hilite.remove(hilite.children[0]);
  const c = selType===SELECT ? selectedComponent() : null;
  hilite.visible = !!c && MODE==='build';
  if(!c) return;
  for(const [x,y,z] of TYPES[c.t].occ(c)){
    const box = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1.06,1.06,1.06)), hiliteMat);
    box.position.set(x+.5,y+.5,z+.5);
    hilite.add(box);
  }
  const [x,y,z] = c.p;
  camTarget.set(x+.5, y+.6, z+.5);
}
function deleteSelected(){
  const c = selectedComponent();
  if(!c){ sfxNo(); return; }
  snapshot();
  W.components = W.components.filter(k=>k.i!==c.i);
  recompute();
  const orphans = validate(W.components).errors.filter(e=>e.code==='E_FLOATING').length;
  tone(-2,{dur:.1,gain:.05,type:'square'});
  toast(orphans ? 'removed — '+orphans+' cell(s) now floating (ctrl+Z restores, shift+⌫ cascades)'
                : 'removed '+TYPES[c.t].label.toLowerCase(), !!orphans);
  updateHilite(); syncUI();
}

// Cascade delete: remove the picked component AND everything whose support
// chain ran through it. The author sees the consequence of removing a support
// immediately, instead of discovering a broken build at the play toggle.
// One pass suffices: validate() already computes the full non-grounded set.
function deleteSelectedCascade(){
  const c = selectedComponent();
  if(!c){ sfxNo(); return; }
  snapshot();
  const rest = W.components.filter(k=>k.i!==c.i);
  const floaters = new Set(validate(rest).errors
    .filter(e=>e.code==='E_FLOATING').map(e=>e.id));
  W.components = rest.filter(k=>!floaters.has(k.i));
  recompute();
  tone(-2,{dur:.14,gain:.06,type:'square'});
  toast(floaters.size
    ? 'cascade: removed '+TYPES[c.t].label.toLowerCase()+' + '+floaters.size+' dependent'+(floaters.size>1?'s':'')+' (ctrl+Z restores)'
    : 'removed '+TYPES[c.t].label.toLowerCase(), !!floaters.size);
  updateHilite(); syncUI();
}

function snapshot(){
  undoStack.push(JSON.stringify({c:W.components, a:W.allow}));
  if(undoStack.length>80) undoStack.shift();
  redoStack.length = 0;                 // a fresh edit kills the redo future
}
function place(){
  if(!placementOK()){ sfxNo(); toast('Cannot place there — '+(validate(W.components.concat([ghostComponent()])).errors[0]||{code:''}).code.replace('E_','').toLowerCase(), true); return; }
  snapshot();
  const c = ghostComponent(); c.i = W.nextId++;
  if(c.t==='spawn') W.components = W.components.filter(k=>k.t!=='spawn');
  W.components.push(c);
  recompute(); sfxPlace(); syncUI();
  // W_STAIR_OPEN: a stair mated on neither side is legal but almost always
  // a misunderstanding of the on-axis rule — tell the author immediately.
  if(c.t==='stairs'){
    const es = G.edges.get(ck(c.p[0], c.p[1]+1, c.p[2])) || [];
    if(!es.length) toast('stair connects to nothing yet — it only joins end to end', true);
  }
}
function erase(){
  const solid = buildOccupancy(W.components);
  const hit = solid.get(ck(cursor.x,cursor.y,cursor.z));
  if(!hit){ sfxNo(); return; }
  snapshot();
  W.components = W.components.filter(c=>c.i!==hit.i);
  recompute(); tone(-2,{dur:.1,gain:.05,type:'square'});
}
function undo(){
  if(!undoStack.length) return;
  redoStack.push(JSON.stringify({c:W.components, a:W.allow}));
  const prev = JSON.parse(undoStack.pop());
  W.components = prev.c; W.allow = prev.a || [];
  recompute(); toast('undone');
}
function redo(){
  if(!redoStack.length){ sfxNo(); return; }
  undoStack.push(JSON.stringify({c:W.components, a:W.allow}));
  const next = JSON.parse(redoStack.pop());
  W.components = next.c; W.allow = next.a || [];
  recompute(); toast('redone');
}

/* ==================== MODULE: Schema — v4 export/import ==================== */
function toV4(){
  return {
    schemaVersion:4,
    id:'pzl_local',
    meta:{ name:W.name, author:'local', created:new Date().toISOString(),
           editorVersion:'0.1.0-phase1', tags:[] },
    plot:{ size:PLOT.size, ports:[] },
    palette:{ family:'dusk-ochre', roles:{ground:2,structure:5,accent:11,void:0} },
    audio:{ bed:'hollow', key:3 },
    components: W.components.map(c=>({
      i:c.i, t:c.t, p:c.p, r:c.r||0,
      c:c.c || TYPES[c.t].color, ...(c.v?{v:c.v}:{})
    })),
    illusionAllowlist: W.allow.slice()
  };
}
function exportJSON(){
  const v = validate(W.components);
  const blob = new Blob([JSON.stringify(toV4(),null,2)],{type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (W.name||'puzzle').toLowerCase().replace(/\s+/g,'-')+'.json';
  a.click();
  // revoking synchronously races the browser's blob fetch and can cancel the
  // download — defer it well past the click
  setTimeout(()=>URL.revokeObjectURL(a.href), 5000);
  // exporting a broken draft is fine — it is a draft. The play toggle and the
  // publish gate are the two places validity is enforced. But say so.
  if(v.ok) toast('exported');
  else toast('exported as draft — '+v.errors.length+' problem(s): '
             +(ERR_TEXT[v.errors[0].code]||v.errors[0].code), true, 3800);
}
function importJSON(text){
  let d;
  try { d = JSON.parse(text); } catch(e){ toast('not valid JSON', true); return; }
  if(!d || !Array.isArray(d.components)){ toast('no components array', true); return; }
  if(d.schemaVersion !== 4) toast('schemaVersion '+d.schemaVersion+' — loading anyway', true);
  const comps = d.components.filter(c=>TYPES[c.t]).map((c,i)=>({
    i: c.i ?? i+1, t:c.t, p:c.p, r:c.r||0, v:c.v, c:c.c
  }));
  const v = validate(comps);
  if(!v.ok){ toast('loaded with '+v.errors.length+' problem(s): '+ (ERR_TEXT[v.errors[0].code]||v.errors[0].code), true); }
  W.components = comps;
  W.allow = Array.isArray(d.illusionAllowlist) ? d.illusionAllowlist : [];
  W.name = (d.meta && d.meta.name) || 'Imported';
  W.nextId = Math.max(0,...comps.map(c=>c.i))+1;
  grassGrowth.clear();
  hideStart(); setTitle(W.name, 'imported');
  startPlay();
}

/* ---------------------------------------------------------------- presets */
function B(x,y,z){ return {t:'block', p:[x,y,z]}; }
function build(list){
  return list.map((c,i)=>({ i:i+1, t:c.t, p:c.p, r:c.r||0, v:c.v }));
}

// The Playset — 8 curated maquettes, rising complexity, all verified against
// @klar/core (validate + solve; every seam confirmed load-bearing). `grass` is a
// per-maquette greenery density seeded client-side on load (never serialized).
// Seam node keys are "x,y,z"; each authored pair is +(d,d,d) apart — the
// (1,1,1) null vector that makes two walk nodes share one screen pixel at yaw 0.
// The Playset is the single source of truth in @klar/core (also drives
// tools/author.mjs + the generated content/maquettes/*.json). Never fork it.
const PRESETS = CURATED;

function loadPreset(i){
  const p = PRESETS[i];
  W = { name:p.name, yaw:p.yaw, components:p.make(), allow:(p.allow||[]).slice(), nextId:200 };
  grassGrowth.clear();
  // Prepopulate greenery: seed each block with a deterministic, position-varied
  // level around the maquette's density (client-side only, never serialized).
  const gd = p.grass || 0;
  if(gd > 0) for(const c of W.components){
    if(!TYPES[c.t].grass) continue;
    const [x,y,z] = c.p;
    const n = Math.abs((Math.sin(x*12.9898 + z*78.233) * 43758.5453) % 1);   // 0..1
    grassGrowth.set(ck(x,y,z), Math.min(1, gd * (0.45 + 0.55*n)));
  }
  yawNow = yawFrom = yawTo = p.yaw; yawT = 1;
  hideStart(); setTitle(p.name, p.sub);
  startPlay();
  showHint(p.hint);
  clearShareHash();
}

/* ==================== MODULE: UI — bar, toasts, start screen =============== */
const bar = document.getElementById('bar');
const modeLabel = document.getElementById('modeLabel');
const paletteEl = document.getElementById('palette');
const keysEl = document.getElementById('keys');
const palSep = document.getElementById('palSep');
const titleEl = document.getElementById('title');
const hintEl = document.getElementById('hint');
const toastEl = document.getElementById('toast');
const startEl = document.getElementById('start');

TYPE_ORDER.forEach(t=>{
  const d = document.createElement('div');
  d.className='swatch'; d.dataset.t=t;
  d.innerHTML = '<b>'+TYPES[t].key+'</b>'+TYPES[t].label.slice(0,5);
  d.onclick = ()=>{ selType=t; syncUI(); updateGhost(); updateHilite(); };
  paletteEl.appendChild(d);
});
{
  const d = document.createElement('div');
  d.className='swatch'; d.dataset.t=SELECT;
  d.innerHTML = '<b>0</b>pick';
  d.onclick = ()=>{ selType=SELECT; syncUI(); updateGhost(); updateHilite(); };
  paletteEl.appendChild(d);
}

function seamBadge(){
  if(!G) return '';
  const c = G.candidates.filter(s=>s.yaw===yawTo).length;
  const a = G.illusion.filter(s=>s.yaw===yawTo).length;
  if(!c) return '';
  return ' <b>'+a+'/'+c+'</b>';
}
function syncUI(){
  bar.classList.add('on');
  modeLabel.textContent = MODE;
  const isBuild = MODE==='build';
  paletteEl.style.display = isBuild?'flex':'none';
  palSep.style.display = isBuild?'block':'none';
  [...paletteEl.children].forEach(c=>c.classList.toggle('sel', c.dataset.t===selType));
  if(isBuild && selType===SELECT) updateHilite();
  keysEl.innerHTML = isBuild
    ? (selType===SELECT
        ? '<span><b>←→</b> pick piece</span><span><b>C</b> recolour</span>'
          +'<span><b>⌫</b> delete</span><span><b>⇧⌫</b> cascade</span>'
          +'<span><b>1-6</b> back to placing</span><span><b>tab</b> play</span>'
        : '<span><b>↑↓←→</b> move</span><span><b>⇧↑↓</b> height</span><span><b>space</b> place</span>'
          +(TYPES[selType].rotatable?'<span><b>R</b> rotate</span>':'')
          +'<span><b>C</b> colour</span>'
          +'<span><b>0</b> pick</span>'
          +'<span><b>T</b> seam'+seamBadge()+'</span>'
          +'<span><b>tab</b> play</span>')
    : '<span><b>↑↓←→</b> walk</span><span><b>Q/E</b> turn world</span>'
      +'<span><b>R</b> restart</span><span><b>S</b> save</span>'
      +'<span><b>tab</b> build</span><span><b>esc</b> menu</span>';
  ghost.visible = isBuild && selType!==SELECT;
  hilite.visible = isBuild && selType===SELECT;
  gridGroup.visible = isBuild;
  avatar.visible = !isBuild && !!cur;
}
function setTitle(a,b){ titleEl.querySelector('b').textContent=a;
  titleEl.querySelector('span').textContent=b||''; titleEl.classList.add('on'); }
let toastT;
function toast(msg, err, ms){
  toastEl.textContent = msg; toastEl.classList.toggle('err', !!err);
  toastEl.classList.add('on'); clearTimeout(toastT);
  toastT = setTimeout(()=>toastEl.classList.remove('on'), ms||2200);
}
let hintT;
function showHint(msg){
  hintEl.textContent = msg; hintEl.classList.add('on');
  clearTimeout(hintT); hintT = setTimeout(()=>hintEl.classList.remove('on'), 7000);
}
function hideStart(){ startEl.style.opacity=0; setTimeout(()=>startEl.style.display='none',450); }
// Clear a stale share-link hash (#/p/…) when moving to local content, so the URL
// reflects what's on screen (fix: returning home / to a preset kept the old /#/p/<hash>).
function clearShareHash(){ if(location.hash) history.replaceState(null,'',location.pathname+location.search); }
function showStart(){ startEl.style.display='flex'; requestAnimationFrame(()=>startEl.style.opacity=1);
  bar.classList.remove('on'); titleEl.classList.remove('on'); clearShareHash(); }

// Playset picker — one card per curated maquette, opened from the "Play" button.
// Anonymous-playable (presets need no login). Kept out of the home screen so it
// doesn't grow into a wall of buttons as the Playset expands.
const playsetList = document.getElementById('playsetList');
PRESETS.forEach((p,i)=>{
  const card = document.createElement('button');
  card.className = 'pcard';
  card.innerHTML = '<b></b><small></small>';
  card.querySelector('b').textContent = (i+1)+' · '+p.name;
  card.querySelector('small').textContent = p.sub;
  card.onclick = ()=>{ audio(); document.getElementById('playset').classList.remove('open'); loadPreset(i); };
  playsetList.appendChild(card);
});
document.getElementById('btnPlay').onclick = ()=>{ audio(); document.getElementById('playset').classList.add('open'); };
document.getElementById('btnBuild').onclick = ()=>{
  audio();
  W = { name:'Untitled', yaw:0, allow:[],
        components:build([{t:'spawn',p:[4,0,4]},B(5,0,4),B(6,0,4)]), nextId:50 };
  grassGrowth.clear(); yawNow=yawFrom=yawTo=0; yawT=1;
  hideStart(); setTitle('Untitled','build mode');
  recompute(); MODE='build'; cur=null; syncUI(); updateGhost();
  camTarget.set(6,1,5);
  showHint('Place blocks with space. Press tab to walk what you made.');
  clearShareHash();
};
document.getElementById('btnImport').onclick = ()=>document.getElementById('fileIn').click();
document.getElementById('btnExport').onclick = ()=>{
  if(!W.components.length){ toast('nothing to export yet — build or load something first', true); return; }
  exportJSON();
};
document.getElementById('fileIn').onchange = e=>{
  const f = e.target.files[0]; if(!f) return;
  const r = new FileReader(); r.onload = ()=>{ importJSON(r.result); clearShareHash(); }; r.readAsText(f);
};

/* ------------------------------------------------------------------ input */
const KEYDIR = { ArrowUp:0, ArrowRight:1, ArrowDown:2, ArrowLeft:3 };

addEventListener('keydown', e=>{
  if(startEl.style.display!=='none') return;
  audio();

  if(e.key==='q'||e.key==='Q'){ turn(-1); e.preventDefault(); return; }
  if(e.key==='e'||e.key==='E'){ turn(+1); e.preventDefault(); return; }
  if(e.key==='Tab'){ e.preventDefault(); toggleMode(); return; }
  if(e.key==='Escape'){ showStart(); return; }

  if(MODE==='play'){
    if(e.key in KEYDIR){ e.preventDefault(); tryMove(KEYDIR[e.key]); }
    if(e.key==='r'||e.key==='R'){ startPlay(); toast('restarted'); }
    if(e.key==='s'||e.key==='S'){ exportJSON(); }   // export is never hidden by mode
    return;
  }

  // build mode
  if((e.ctrlKey||e.metaKey) && (e.key==='z'||e.key==='Z')){
    e.preventDefault();
    if(e.shiftKey){ redo(); } else { undo(); }
    updateGhost(); updateHilite(); return;
  }
  if((e.ctrlKey||e.metaKey) && (e.key==='y'||e.key==='Y')){
    e.preventDefault(); redo(); updateGhost(); updateHilite(); return;
  }
  if(selType===SELECT && e.key in KEYDIR){
    e.preventDefault();
    const n = W.components.length; if(!n){ sfxNo(); return; }
    selIndex += (e.key==='ArrowRight'||e.key==='ArrowDown') ? 1 : -1;
    updateHilite(); tone(PENT[0],{dur:.06,gain:.03,type:'sine'});
    return;
  }
  if(e.key in KEYDIR){
    e.preventDefault();
    if(e.shiftKey && (e.key==='ArrowUp'||e.key==='ArrowDown')){
      cursor.y = Math.max(0, Math.min(PLOT.size[1]-1, cursor.y + (e.key==='ArrowUp'?1:-1)));
    } else {
      const [dx,dz] = worldDir(KEYDIR[e.key]);
      cursor.x = Math.max(0, Math.min(PLOT.size[0]-1, cursor.x+dx));
      cursor.z = Math.max(0, Math.min(PLOT.size[2]-1, cursor.z+dz));
    }
    camTarget.set(cursor.x+.5, cursor.y*0.6+1, cursor.z+.5);
    updateGhost(); return;
  }
  if(e.key===' '){
    e.preventDefault();
    if(selType===SELECT) deleteSelected(); else { place(); updateGhost(); }
    return;
  }
  if(e.key==='Backspace'||e.key==='Delete'){
    e.preventDefault();
    if(selType===SELECT){ if(e.shiftKey) deleteSelectedCascade(); else deleteSelected(); }
    else { erase(); updateGhost(); }
    return;
  }
  if(e.key==='c'||e.key==='C'){
    e.preventDefault();
    const cycle = cur => cur==null ? ROLE_ORDER[0]
                 : (ROLE_ORDER[(ROLE_ORDER.indexOf(cur)+1) % (ROLE_ORDER.length+1)] || null);
    if(selType===SELECT){
      // recolour the picked component in place
      const c = selectedComponent();
      if(!c){ sfxNo(); return; }
      snapshot();
      c.c = cycle(c.c || null);
      recompute(); updateHilite();
      toast(TYPES[c.t].label.toLowerCase()+' → '+(c.c||'type colour'));
    } else {
      selCol = cycle(selCol);
      updateGhost();
      toast('held colour: '+(selCol||'type default'));
    }
    syncUI(); return;
  }
  if(e.key==='r'||e.key==='R'){
    if(selType===SELECT){ sfxNo(); return; }
    if(!TYPES[selType].rotatable){
      toast(TYPES[selType].label.toLowerCase()+' looks the same from every side');
      sfxNo(); return;
    }
    selRot=(selRot+1)%4; updateGhost();
    toast('stair climbs '+['north','east','south','west'][selRot]);
    return;
  }
  if(e.key==='t'||e.key==='T'){ e.preventDefault(); toggleSeamAtCursor(); return; }
  if(e.key==='s'||e.key==='S'){ exportJSON(); return; }
  if(e.key==='0'){ selType=SELECT; syncUI(); updateGhost(); updateHilite(); return; }
  const t = TYPE_ORDER.find(k=>TYPES[k].key===e.key);
  if(t){ selType=t; syncUI(); updateGhost(); updateHilite(); }
});

function turn(d){
  if(yawT<1) return;
  if(MODE==='play' && moving) return;
  yawFrom = yawNow; yawTo = ((yawTo+d)%4+4)%4; yawT = 0; sfxTurn();
  rebuildSeamsSoon = true;
}
let rebuildSeamsSoon = false;

function toggleMode(){
  if(MODE==='play'){
    if(!gates.canBuild){ toast('log in to build', true); sfxNo(); return; }
    MODE='build'; syncUI(); updateGhost();
    toast('build mode');
  } else {
    const v = validate(W.components);
    if(!v.ok){ toast('cannot play: '+(ERR_TEXT[v.errors[0].code]||v.errors[0].code), true); sfxNo(); return; }
    startPlay(); toast('play mode');
  }
}

/* ------------------------------------------------------------------- loop */
let last = performance.now();
function frame(now){
  const dt = Math.min(0.05,(now-last)/1000); last = now;

  // camera yaw easing
  if(yawT<1){
    yawT = Math.min(1, yawT + dt/0.42);
    let a = yawFrom, b = yawTo;
    if(b-a >  2) a += 4; if(b-a < -2) a -= 4;
    yawNow = a + (b-a)*easeIO(yawT);
    if(yawT>=1){ yawNow = yawTo;
      if(rebuildSeamsSoon){ rebuildScene(); rebuildSeamsSoon=false;
        if(MODE==='build'){ syncUI(); if(selType===SELECT) updateHilite(); } } }
  }
  placeCamera();

  // avatar movement
  if(moving){
    moving.t += dt/moving.dur;
    const a = nodeAt(moving.from), b = nodeAt(moving.to);
    if(a && b){
      const pa = nodePos(a), pb = nodePos(b);
      const k = easeIO(Math.min(1,moving.t));
      avatar.position.lerpVectors(pa,pb,k);
      const arc = moving.kind==='illusion' ? 0.34
                : (moving.kind==='stair' ? 0.16 : (moving.kind==='half' ? 0.12 : 0.09));
      avatar.position.y += Math.sin(Math.min(1,moving.t)*Math.PI)*arc;
      // squash on landing — the whole "stumble not death" register lives here
      const s = 1 + Math.sin(Math.min(1,moving.t)*Math.PI)*0.06;
      avatar.scale.set(2-s,s,2-s);
    }
    if(moving.t>=1){ avatar.scale.set(1,1,1); finishMove(); }
  } else if(cur && G && G.nodes.has(cur)){
    const p = nodePos(nodeAt(cur));
    avatar.position.lerp(p, 1-Math.pow(0.001,dt));
    avatar.position.y = p.y + Math.sin(now/620)*0.018;
  }

  // camera follows the avatar in play
  if(MODE==='play' && cur && G && G.nodes.has(cur)){
    const n = nodeAt(cur);
    camTarget.lerp(new THREE.Vector3(n.x+.5, n.h2/2, n.z+.5), 1-Math.pow(0.006,dt));
  }

  // grass grows slowly — meant to be noticed in retrospect, never in the act
  let dirty=false;
  for(const [k,g] of grassGroups){
    const target = grassGrowth.get(k)||0;
    const shown = g.scale.y;
    if(Math.abs(target-shown) > 0.004){
      const v = shown + Math.sign(target-shown)*dt*0.34;
      grassGroups.get(k).scale.y = Math.max(0.001, Math.min(target, v));
      g.visible = v>0.02; g.scale.x = g.scale.z = 0.6+0.4*v;
      dirty=true;
    }
    for(const b of g.children) b.rotation.z = Math.sin(now/1100 + b.userData.ph)*0.10;
  }

  // shimmer + goal beacon
  for(const m of seamMeshes)
    m.material.opacity = m.userData.authored ? 0.13 + Math.sin(now/520)*0.08
                                             : 0.05 + Math.sin(now/900)*0.03;
  worldGroup.traverse(o=>{ if(o.userData.spin){ o.rotation.y = now/900; o.position.y = 1.05 + Math.sin(now/700)*0.07; } });

  renderer.render(scene,cam);
  requestAnimationFrame(frame);
}

resize(); placeCamera(); syncUI();
requestAnimationFrame(frame);

/* ==================== module exports (used by main.js / world) ============ */
export function getW(){ return W; }
export const PRESETS_META = PRESETS.map(p => ({ name:p.name, sub:p.sub, hint:p.hint }));
export { loadPreset, importJSON, toV4, startPlay };
