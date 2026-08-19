// Free-roam (Phase 3): walk continuously across plot boundaries.
//
// Streaming strategy (docs/phase3-streaming.md has the full essay):
//  - the streaming unit is the CELL; we hold a Chebyshev radius R=2 window
//    (max 5x5 = 25 cells) around the avatar's current plot
//  - puzzle documents are content-addressed + immutable -> cached by hash
//    forever; ten cells sharing one puzzle cost one fetch
//  - per cell we build a local traversal graph with @klar/core, offset its
//    node keys into world space, then STITCH matched ports with 'port' edges
//  - illusion seams never cross cells: a seam is plot-local, so unloading a
//    distant cell can never break a neighbour's illusion (lattice invariant)
//  - cells outside R+1 are disposed (geometry/materials), keeping GPU and
//    memory flat no matter how large the world grows
import * as THREE from 'three';
import { PAL, DIRS, PLOT, ck, rot, buildGraph } from '@klar/core';
import { api } from '../net.js';

const CW = PLOT.size[0], CD = PLOT.size[2];
const R = 2;                       // streaming radius (plots)
const EDGES = { n:[0,-1], e:[1,0], s:[0,1], w:[-1,0] };
const OPP = { n:'s', e:'w', s:'n', w:'e' };

let container, hud, renderer, scene, cam, running = false, raf = 0;
let cells = new Map();             // 'x,y' -> { group, bnd, data }
let nodes = new Map(), edges = new Map();   // world-keyed merged graph
let puzzleCache = new Map();       // hash -> doc (immutable: cache forever)
let avatar, cur = null, moving = null, curCell = null;
let yawNow = 0, yawTo = 0, yawT = 1, yawFrom = 0;
let last = 0;

const pkey = (x,y) => x+','+y;
const cellOrigin = (cx,cy) => [cx*CW, cy*CD];
const wkeyOf = (n, cx, cy) => ck(n.x + cx*CW, n.y, n.z + cy*CD);

/* ---------------- plot rendering (roam-lite: no grass, no seam shimmer) --- */
function compMesh(c){
  const role = c.c && PAL[c.c] ? c.c : PAL[{block:'ground',slab:'structure',stairs:'structure',
    column:'structure',spawn:'void',goal:'accent'}[c.t]] || PAL.structure;
  const m = new THREE.MeshLambertMaterial({ color: role });
  let mesh;
  if(c.t === 'slab'){
    mesh = new THREE.Mesh(new THREE.BoxGeometry(1, .5, 1), m);
    mesh.position.set(c.p[0]+.5, c.p[1]+.25, c.p[2]+.5);
  } else if(c.t === 'stairs'){
    mesh = new THREE.Group();
    for(let i=0;i<2;i++){                                  // canonical orientation:
      const h = (i+1)/2;                                   // treads ascend toward facing
      const s = new THREE.Mesh(new THREE.BoxGeometry(1, h, .5), m);
      s.position.set(0, h/2, 0.5-(i+0.5)/2);
      mesh.add(s);
    }
    mesh.rotation.y = -(c.r||0) * Math.PI/2;
    mesh.position.set(c.p[0]+.5, c.p[1], c.p[2]+.5);
  } else if(c.t === 'column'){
    const h = (c.v && c.v.h) || 3;
    mesh = new THREE.Mesh(new THREE.BoxGeometry(.6, h, .6), m);
    mesh.position.set(c.p[0]+.5, c.p[1]+h/2, c.p[2]+.5);
  } else {
    mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), m);
    mesh.position.set(c.p[0]+.5, c.p[1]+.5, c.p[2]+.5);
    if(c.t === 'spawn') mesh.scale.set(.6,.1,.6), mesh.position.y = c.p[1]+1.03;
    if(c.t === 'goal')  mesh.scale.set(.5,.5,.5), mesh.position.y = c.p[1]+1.3;
  }
  return mesh;
}

/* ---------------- cell load / stitch / unload ----------------------------- */
function loadCell(cd){
  const key = pkey(cd.x, cd.y);
  if(cells.has(key) || !cd.puzzle) return;
  puzzleCache.set(cd.puzzleHash, cd.puzzle);
  const group = new THREE.Group();
  const [ox, oz] = cellOrigin(cd.x, cd.y);
  group.position.set(ox, 0, oz);
  for(const c of cd.puzzle.components) group.add(compMesh(c));
  scene.add(group);

  const g = buildGraph(cd.puzzle.components, cd.puzzle.illusionAllowlist || []);
  const bnd = { n:{}, e:{}, s:{}, w:{} };
  for(const n of g.nodes.values()){
    const wk = wkeyOf(n, cd.x, cd.y);
    nodes.set(wk, { x:n.x+ox, y:n.y, z:n.z+oz, h2:n.h2 });
    if(n.z === 0)      bnd.n[n.x+'|'+n.h2] = wk;
    if(n.z === CD-1)   bnd.s[n.x+'|'+n.h2] = wk;
    if(n.x === 0)      bnd.w[n.z+'|'+n.h2] = wk;
    if(n.x === CW-1)   bnd.e[n.z+'|'+n.h2] = wk;
  }
  for(const [k, es] of g.edges){
    const [lx,ly,lz] = k.split(',').map(Number);   // remap keys into world space
    const wk = ck(lx+ox, ly, lz+oz);
    const list = edges.get(wk) || [];
    for(const e of es){
      const [tx,ty,tz] = e.to.split(',').map(Number);
      list.push({ to: ck(tx+ox, ty, tz+oz), kind:e.kind, yawMask:e.yawMask });
    }
    edges.set(wk, list);
  }
  const cell = { group, bnd, data: cd };
  cells.set(key, cell);

  // stitch ports to already-loaded neighbours (placement guaranteed equality)
  for(const [edge, [dx,dy]] of Object.entries(EDGES)){
    const nb = cells.get(pkey(cd.x+dx, cd.y+dy));
    if(!nb || !nb.data.ports) continue;
    for(const p of (cd.ports ? cd.ports[edge] : [])){
      const a = cell.bnd[edge][p.off+'|'+p.lvl];
      const b = nb.bnd[OPP[edge]][p.off+'|'+p.lvl];
      if(!a || !b) continue;
      (edges.get(a) || edges.set(a,[]).get(a)).push({ to:b, kind:'port', yawMask:15 });
      (edges.get(b) || edges.set(b,[]).get(b)).push({ to:a, kind:'port', yawMask:15 });
    }
  }
}

function unloadCell(key){
  const cell = cells.get(key);
  if(!cell) return;
  cell.group.traverse(o => { if(o.geometry) o.geometry.dispose(); if(o.material) o.material.dispose(); });
  scene.remove(cell.group);
  const [ox, oz] = cellOrigin(cell.data.x, cell.data.y);
  for(const k of [...nodes.keys()]){
    const [x,,z] = k.split(',').map(Number);
    if(x>=ox && x<ox+CW && z>=oz && z<oz+CD){ nodes.delete(k); edges.delete(k); }
  }
  for(const es of edges.values())                    // drop cross-cell stitch refs
    for(let i=es.length-1;i>=0;i--) if(!nodes.has(es[i].to)) es.splice(i,1);
  cells.delete(key);
}

async function streamAround(cx, cy){
  const r = await api(`/world/cells?x=${cx}&y=${cy}&r=${R}`);
  for(const cd of r.cells) loadCell(cd);
  for(const key of [...cells.keys()]){
    const [x,y] = key.split(',').map(Number);
    if(Math.max(Math.abs(x-cx), Math.abs(y-cy)) > R+1) unloadCell(key);
  }
}

/* ---------------- movement (same math as the sandbox player) -------------- */
const nodeAt = k => nodes.get(k);
const easeIO = t => t<.5 ? 4*t*t*t : 1-Math.pow(-2*t+2,3)/2;

function worldDir(idx){
  const [dx,,dz] = DIRS[idx];
  return rot(dx, dz, (4 - yawTo) % 4);
}
function tryMove(idx){
  if(moving || !cur) return;
  const [dx,dz] = worldDir(idx);
  const n = nodeAt(cur);
  for(const e of (edges.get(cur) || [])){
    if(e.kind === 'illusion') continue;
    const m = nodeAt(e.to);
    if(!m) continue;
    if(m.x-n.x === dx && m.z-n.z === dz){ begin(e.to); return; }
    if(e.kind === 'stair' && Math.sign(m.x-n.x)===dx && Math.sign(m.z-n.z)===dz
       && Math.abs(m.x-n.x)+Math.abs(m.z-n.z)===1){ begin(e.to); return; }
  }
  for(const e of (edges.get(cur) || [])){
    if(e.kind !== 'illusion' || !(e.yawMask & (1<<yawTo))) continue;
    begin(e.to); return;
  }
}
function begin(to){
  moving = { from:cur, to, t:0, dur:0.24 };
}
async function finishMove(){
  cur = moving.to; moving = null;
  const n = nodeAt(cur);
  const cc = pkey(Math.floor(n.x/CW), Math.floor(n.z/CD));
  if(cc !== curCell){ curCell = cc; await streamAround(...cc.split(',').map(Number)); }
  updateHud();
}

function updateHud(){
  const cd = cells.get(curCell);
  hud.innerHTML = cd
    ? `<b>plot ${curCell}</b> · ${cd.data.owner}${cd.data.title ? ' · “'+cd.data.title+'”' : ''}<br>
       arrows walk · Q/E turn · M map · Esc back`
    : `plot ${curCell} · unclaimed<br>arrows walk · Q/E turn · M map · Esc back`;
}

/* ---------------- keys, camera, loop -------------------------------------- */
const KEYDIR = { ArrowUp:0, ArrowRight:1, ArrowDown:2, ArrowLeft:3 };
function onKey(e){
  if(!running) return;
  if(e.key in KEYDIR) tryMove(KEYDIR[e.key]);
  else if(e.key === 'q' || e.key === 'Q'){ yawFrom = yawTo; yawTo = (yawTo+3)%4; yawT = 0; }
  else if(e.key === 'e' || e.key === 'E'){ yawFrom = yawTo; yawTo = (yawTo+1)%4; yawT = 0; }
}

function placeCamera(){
  const a = yawNow * Math.PI/2 + Math.PI/4;
  const n = cur ? nodeAt(cur) : { x:8, z:8, h2:2 };
  const d = 40;
  cam.position.set(n.x + Math.cos(a)*d*0.7071, d*0.8165, n.z + Math.sin(a)*d*0.7071);
  cam.lookAt(n.x+.5, 0, n.z+.5);
}
function resize(){
  const w = container.clientWidth, h = container.clientHeight, s = 15, asp = w/h;
  cam.left = -s*asp; cam.right = s*asp; cam.top = s; cam.bottom = -s;
  cam.updateProjectionMatrix();
  renderer.setSize(w, h);
}
function frame(now){
  if(!running) return;
  const dt = Math.min((now-last)/1000, .05); last = now;
  if(yawT < 1){ yawT = Math.min(1, yawT + dt/0.4);
    const d = (yawTo - yawFrom + 6) % 4 - 2;      // shortest way round
    yawNow = yawFrom + d * easeIO(yawT);
  } else yawNow = yawTo;
  if(moving){
    moving.t += dt / moving.dur;
    const a = nodeAt(moving.from), b = nodeAt(moving.to);
    const t = easeIO(Math.min(moving.t, 1));
    avatar.position.set(
      a.x+.5 + (b.x-a.x)*t,
      a.h2/2 + (b.h2-a.h2)/2*t + Math.sin(t*Math.PI)*0.12,
      a.z+.5 + (b.z-a.z)*t);
    if(moving.t >= 1) finishMove();
  } else if(cur){
    const n = nodeAt(cur);
    avatar.position.set(n.x+.5, n.h2/2, n.z+.5);
  }
  placeCamera();
  renderer.render(scene, cam);
  raf = requestAnimationFrame(frame);
}

/* ---------------- enter / exit -------------------------------------------- */
export async function enter(wrap, hudEl){
  container = wrap; hud = hudEl;
  if(!renderer){
    renderer = new THREE.WebGLRenderer({ antialias:true });
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x332f52);
    scene.add(new THREE.AmbientLight(0xf4e9d8, .55));
    const key = new THREE.DirectionalLight(0xfff0dc, .8); key.position.set(6,10,4); scene.add(key);
    cam = new THREE.OrthographicCamera(-1,1,1,-1,0.1,250);
    avatar = new THREE.Mesh(new THREE.CapsuleGeometry(.22,.5,3,8),
      new THREE.MeshLambertMaterial({ color: PAL.avatar }));
    scene.add(avatar);
    container.appendChild(renderer.domElement);
    window.addEventListener('resize', resize);
    window.addEventListener('keydown', onKey);
  }
  running = true;
  resize();
  await streamAround(0, 0);
  if(!cur){
    const startCell = [...cells.values()].find(c => c.data.puzzle);
    if(startCell){
      const sp = startCell.data.puzzle.components.find(c => c.t === 'spawn');
      const [ox,oz] = cellOrigin(startCell.data.x, startCell.data.y);
      cur = ck(sp.p[0]+ox, sp.p[1]+1, sp.p[2]+oz);
      curCell = pkey(startCell.data.x, startCell.data.y);
    } else {
      hud.innerHTML = 'the world is empty here — press M and claim the first plot.';
    }
  }
  updateHud();
  last = performance.now();
  raf = requestAnimationFrame(frame);
}

export function exit(){
  running = false;
  cancelAnimationFrame(raf);
}
