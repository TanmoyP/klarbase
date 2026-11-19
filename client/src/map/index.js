// Sky Atlas - the endless map mode. Loaded with import() only when /map opens (the title bundle does not grow).
//
//   mountMap(ctx) -> controller { dispose, onKey(e, down), press(arrow), release(arrow), swipe(arrow), ... }
//
// It borrows the World's renderer, post chain, look, quality tiers, camera rig and Pip (World.setExternal),
// and owns everything else: streamed chunks (chunkmesh.js), cloud sea + day/night (sky.js), shrines
// (shrines.js, wild.js), the Atlas page (atlas.js), HUD, persistence. The overworld itself is @klar/core
// (chunkAt / canStep / shrineAt / wildIsle) - nothing here decides what is walkable.
import * as THREE from 'three';
import { ATLAS_SEED, CHUNK, CURATED_ISLES, canStep, cellAt, spawnOf, WALKABLE, biomeWeights, regionAt, placeContent, shrineAt } from '@klar/core';
import { LV } from '../game/props.js';
import { makeKit } from '../game/biome.js';
import { themeOf, THEMES } from '../game/themes.js';
import { applyLook, OUT } from '../game/look.js';
import { sfx, setScale, ambient } from '../game/audio.js';
import { buildChunk } from './chunkmesh.js';
import { createShrineFx, freeShrineStones } from './shrines.js';
import { createSky, nightAmount, sunDirection, CYCLE } from './sky.js';
import { createWild } from './wild.js';
import { createAtlas } from './atlas.js';
import { rise, easeIn } from './spring.js';
import { loadMap, saveMap } from './persist.js';

const RISE = 6.5;                       // how far below its place a chunk starts (under the cloud tops)
const BUDGET = 4;                       // ms of chunk building per frame
const KEYS = { ArrowUp:'up', ArrowDown:'down', ArrowLeft:'left', ArrowRight:'right', w:'up', s:'down', a:'left', d:'right', W:'up', S:'down', A:'left', D:'right' };
const THEME_IDS = Object.keys(THEMES);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
const $ = s => document.querySelector(s);
const keyOf = (x, z) => Math.floor(x / CHUNK) + ',' + Math.floor(z / CHUNK);
const walkable = (x, z) => WALKABLE.has(cellAt(ATLAS_SEED, x, z).kind);
// where Pip stands on tile (x, z): the floor height (a stair stands half a level up; a plank sits a hair low)
const surf = (x, z) => { const c = cellAt(ATLAS_SEED, x, z); return c.h * LV + (c.kind === 'ramp' ? LV / 2 : 0) - (c.kind === 'bridge' ? 0.03 : 0); };

export function nearestWalkable(x, z){
  x = Math.round(x); z = Math.round(z);
  if(walkable(x, z)) return { x, z };
  let best = null, bd = Infinity;
  for(let r = 1; r <= 16 && !best; r++) for(let dz = -r; dz <= r; dz++) for(let dx = -r; dx <= r; dx++){
    if(Math.max(Math.abs(dx), Math.abs(dz)) !== r || !walkable(x + dx, z + dz)) continue;
    const d = dx * dx + dz * dz; if(d < bd){ bd = d; best = { x:x + dx, z:z + dz }; }
  }
  return best || { ...spawnOf(ATLAS_SEED) };
}

export function mountMap(ctx){
  const { world } = ctx, pip = world.pip, scene = world.scene;
  const dev = !!(import.meta.env && import.meta.env.DEV);
  const forcedT = dev ? (() => { const v = parseFloat(new URLSearchParams(location.search).get('t')); return Number.isFinite(v) ? ((v % 1) + 1) % 1 : null; })() : null;
  const kit = makeKit(), used = new Set(), saved = loadMap(), explored = new Set(saved.explored);
  const sky = createSky(world), fx = createShrineFx(scene), wild = createWild();
  const reduced = () => world.reduced.matches;
  const stats = { units:[], unitMax:0, frames:0, maxMs:0, sum:0, built:0, calls:0, tris:0, chunkMs:[] };

  /* ---------------- where Pip is ---------------- */
  let start = ctx.start ? nearestWalkable(ctx.start.x, ctx.start.z) : saved.pos ? nearestWalkable(saved.pos.x, saved.pos.z) : { ...spawnOf(ATLAS_SEED) };
  const P = { x:start.x, z:start.z };
  const here = () => new THREE.Vector3(P.x, surf(P.x, P.z), P.z);
  pip.setHold('', themeOf('jungle')); pip.placeAt(here()); pip.face('D'); pip.group.visible = false;
  world.external = null; world.setExternal({ update });
  world.view = 0; world.turn(0); world.yaw = world.yawTo;
  world.targetTo.copy(here()); world.followSnap = true;

  /* ---------------- shrines: what stands where ---------------- */
  let placement = null;
  const progKey = k => k.replace('/', ':');           // map key 'o/id' -> progress key 'o:id'
  function info(x, z){
    const s = shrineAt(ATLAS_SEED, x, z, placement); if(!s) return null;
    return { ...s, pk:progKey(s.key), lit:(ctx.progress[progKey(s.key)]?.stars || 0) > 0 };
  }
  setTimeout(() => {
    if(disposed) return;
    const t = performance.now();
    placement = placeContent(ATLAS_SEED, { official:CURATED_ISLES,
      community:ctx.community.map(e => ({ key:`c/${e.author}/${e.doc.id}`, theme:e.theme })),
      daily:ctx.dated.map(e => ({ key:'d/' + e.date, theme:e.theme })) });
    stats.placeMs = performance.now() - t;
    refreshShrines(); atlas.redraw();
  }, 350);
  function refreshShrines(){
    for(const rec of chunks.values()) if(rec.chunk) for(const sh of rec.chunk.shrines) sh.lit = !!(info(sh.x, sh.z) || {}).lit;
    hudLit();
  }
  const litCount = () => Object.entries(ctx.progress).filter(([k, v]) => /^[ocdw]:/.test(k) && v && v.stars > 0).length;
  const hudLit = () => { $('#mapLit').textContent = `✦ lit ${litCount()}`; };

  /* ---------------- streaming ---------------- */
  const chunks = new Map(), queue = [];
  let cur = null, pcx = Math.floor(P.x / CHUNK), pcz = Math.floor(P.z / CHUNK), tier = world.quality.tier, planned = false;
  const radius = () => world.quality.tier === 'fast' ? 1 : 2;
  const cheb = rec => Math.max(Math.abs(rec.cx - pcx), Math.abs(rec.cz - pcz));
  const dist2 = rec => (rec.cx - pcx) ** 2 + (rec.cz - pcz) ** 2;
  function plan(){
    const R = radius();
    for(let dz = -R; dz <= R; dz++) for(let dx = -R; dx <= R; dx++){
      const cx = pcx + dx, cz = pcz + dz, k = cx + ',' + cz;
      if(!chunks.has(k)){ const rec = { key:k, cx, cz, state:'queued', age:0, sinkT:0 }; chunks.set(k, rec); queue.push(rec); }
    }
    for(const rec of [...chunks.values()]){
      const d = cheb(rec);
      if(rec.state === 'ready' && d > R + 1){ rec.state = 'sinking'; rec.sinkT = 0; }
      else if(rec.state === 'queued' && d > R){ queue.splice(queue.indexOf(rec), 1); chunks.delete(rec.key); }
    }
    queue.sort((a, b) => dist2(a) - dist2(b));
  }
  function pump(){
    const t0 = performance.now();
    do {
      if(!cur){ cur = queue.shift(); if(!cur) return; cur.state = 'building'; cur.gen = buildChunk(cur.cx, cur.cz, { kit, onUse:g => used.add(g) }); }
      const u0 = performance.now(), r = cur.gen.next(), du = performance.now() - u0;
      if(du > stats.unitMax){ stats.unitMax = du; } stats.units.push(Math.round(du)); if(stats.units.length > 400) stats.units.shift();
      if(r.done){ finish(cur, r.value); cur = null; }
    } while(performance.now() - t0 < BUDGET);
  }
  function finish(rec, chunk){
    rec.gen = null; rec.chunk = chunk;
    stats.built++; stats.calls = Math.max(stats.calls, chunk.stats.calls); stats.tris = Math.max(stats.tris, chunk.stats.tris); stats.chunkMs.push(Math.round(chunk.stats.ms));
    if(cheb(rec) > radius() + 1){ chunk.dispose(); chunks.delete(rec.key); return; }
    for(const sh of chunk.shrines){ sh.y0 = sh.y; sh.lit = !!(info(sh.x, sh.z) || {}).lit; }
    rec.state = 'ready';
    // ripple: the farther from Pip, the later it rises
    const d = Math.hypot((rec.cx + 0.5) * CHUNK - P.x, (rec.cz + 0.5) * CHUNK - P.z) / CHUNK;
    rec.age = -(0.05 + 0.2 * d);
    chunk.group.visible = false; chunk.group.position.y = -RISE; scene.add(chunk.group);
    if(reduced()) chunk.setFade(0);
    if(!planned) planned = true;
  }
  function animateChunks(dt, t){
    for(const rec of chunks.values()){
      const c = rec.chunk, g = c && c.group;
      if(rec.state === 'ready'){
        rec.age += dt;
        for(const a of c.animated) a.update(t);
        if(rec.age <= 0 || rec.settled) continue;
        g.visible = true;
        if(reduced()){ c.setFade(Math.min(1, rec.age / 0.7)); c.pop(10); g.position.y = 0; if(rec.age > 0.8) rec.settled = true; }
        else {
          g.position.y = -RISE * (1 - rise(rec.age));
          g.rotation.z = 0.012 * Math.exp(-4 * rec.age) * Math.sin(13 * rec.age);        // a little flutter as it lands
          c.pop(rec.age);
          if(rec.age > 2.6){ g.position.y = 0; g.rotation.z = 0; c.pop(10); rec.settled = true; }
        }
      } else if(rec.state === 'sinking'){
        rec.sinkT += dt;
        if(reduced()) c.setFade(Math.max(0, 1 - rec.sinkT / 0.6)); else g.position.y = -RISE * 1.7 * easeIn(rec.sinkT / 1.0);
        if(rec.sinkT >= (reduced() ? 0.6 : 1.0)){ scene.remove(g); c.dispose(); chunks.delete(rec.key); }
      }
    }
  }
  const revealed = () => { const r = chunks.get(keyOf(P.x, P.z)); return !!r && r.state === 'ready' && r.age > 0.12; };

  /* ---------------- walking ---------------- */
  let busy = false, held = [], runBlock = false, lastBonk = 0, intro = true, cardFor = null, skipCard = null;
  const hold = arrow => { held = held.filter(a => a !== arrow); held.push(arrow); };
  function step(arrow, fresh){
    if(busy || atlas.isOpen) return;
    const dir = world.arrowToMove(arrow), r = canStep(ATLAS_SEED, P, dir);
    pip.face(dir);
    if(!r.ok){
      const now = performance.now(); if(fresh && now - lastBonk > 350){ lastBonk = now; sfx.bonk(); pip.bonk(); }
      return;
    }
    busy = true; hideCard();
    const a = here(), to = { x:r.to.x, z:r.to.z }, b = new THREE.Vector3(to.x, surf(to.x, to.z), to.z);
    world.noteMove(a, b);
    if(r.kind === 'down') sfx.hopDown(); else sfx.step(r.to.h, to.x * 3 + to.z);
    pip.hop(a, b, r.kind === 'down' ? 'down' : r.kind === 'ramp' ? 'ramp' : 'flat', r.kind === 'down' ? 0.24 : 0.19).then(() => { P.x = to.x; P.z = to.z; busy = false; onArrive(); });
  }
  function travelTo(x, z){
    const n = nearestWalkable(x, z); hideCard(); held = []; runBlock = false;
    sfx.tp(); const from = here(); from.y += 0.4; world.burst(from, { n:14, color:'#ffffff', speed:1.2, up:1, life:0.6, size:0.05, gravity:1 });
    P.x = n.x; P.z = n.z; busy = false; pip.tweens = []; pip.placeAt(here()); intro = true; pip.group.visible = false;
    world.targetTo.copy(here()); world.followSnap = true; world.mdFresh = false;
    skipCard = null; onArrive(false, true);
    const to = here(); to.y += 0.5; setTimeout(() => !disposed && world.burst(to, { n:20, color:'#fff2b0', speed:1.6, up:1.6, life:0.8, size:0.055, gravity:1 }), 450);
  }

  /* ---------------- arriving: chunks, region, shrine ---------------- */
  let region = null, ambTheme = null, lastSave = 0, lastUrl = 0, saveTimer = 0;
  function onArrive(quiet, jumped){
    const k = keyOf(P.x, P.z), ncx = Math.floor(P.x / CHUNK), ncz = Math.floor(P.z / CHUNK);
    if(ncx !== pcx || ncz !== pcz || !planned || jumped){ pcx = ncx; pcz = ncz; plan(); }
    for(let dz = -1; dz <= 1; dz++) for(let dx = -1; dx <= 1; dx++) explored.add((pcx + dx) + ',' + (pcz + dz));
    const r = regionAt(ATLAS_SEED, P.x, P.z), site = r.site.join(',');
    if(!region || region.site.join(',') !== site){
      region = r; $('#mapRegion').textContent = `${r.name} · ${themeOf(r.theme).label}`;
      if(!quiet || !ambTheme) regionToast(r);
      if(r.theme !== ambTheme){ const T = themeOf(r.theme); ambTheme = r.theme; ambient(T); setScale(T.scale); pip.setScarf(T.accent); ctx.setAccent(r.theme); }
      ctx.track('map_region', { theme:r.theme });
    }
    saveSoon();
    const s = info(P.x, P.z);
    if(s){
      runBlock = true;                                   // arriving at a shrine ends a held run
      const k2 = P.x + ',' + P.z;
      if(skipCard === k2) { skipCard = null; return; }
      showCard(s);
    } else hideCard();
    prefetchWild();
  }
  function prefetchWild(){
    if(!placement) return;
    for(const rec of chunks.values()) if(rec.chunk && Math.abs(rec.cx - pcx) <= 1 && Math.abs(rec.cz - pcz) <= 1)
      for(const sh of rec.chunk.shrines){ if(Math.hypot(sh.x - P.x, sh.z - P.z) > 18 || sh.asked) continue; const s = info(sh.x, sh.z); if(s && s.kind === 'wild'){ sh.asked = true; wild.get(sh.x, sh.z); } }
  }
  let toastTimer = 0;
  function regionToast(r){
    const el = $('#mapToast'); el.textContent = r.name; el.classList.add('on'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('on'), 2600);
  }
  function saveSoon(){
    const now = performance.now();
    const flush = () => { saveTimer = 0; lastSave = performance.now(); saveMap(P, explored, saved.extra); if(ctx.onSave) ctx.onSave(); };   // onSave = cloudsave's debounced push
    if(now - lastSave > 2000) flush(); else if(!saveTimer) saveTimer = setTimeout(flush, 2000);
    if(now - lastUrl > 1000){ lastUrl = now; try { history.replaceState(null, '', `/map/${P.x},${P.z}`); } catch {} }
  }

  /* ---------------- the shrine card ---------------- */
  const card = $('#mapCard');
  function hideCard(){ cardFor = null; card.classList.remove('on'); }
  function entryOf(s, res){
    const rn = regionAt(ATLAS_SEED, s.x, s.z).name;
    if(s.kind === 'wild'){
      if(!res) return null;
      const doc = res.doc;
      return { key:'w:' + s.x + ',' + s.z, statKey:'w/' + s.x + ',' + s.z, doc, name:doc.name, theme:doc.theme, par:res.par, solution:res.solution, tier:res.tier, sub:'Sky Atlas · ' + rn, wild:true };
    }
    return ctx.entryFor(s.key);
  }
  function showCard(s){
    cardFor = s;
    let res; if(s.kind === 'wild'){ res = wild.peek(s.x, s.z); if(res === undefined) wild.get(s.x, s.z).then(() => { if(cardFor === s && !disposed) showCard(s); }); }
    const e = s.kind === 'wild' && res === undefined ? null : entryOf(s, res), rn = regionAt(ATLAS_SEED, s.x, s.z).name;
    const kind = s.kind === 'official' ? 'Official isle' : s.kind === 'community' ? 'Community isle' : s.kind === 'daily' ? 'Daily isle' : 'Wild isle';
    let body;
    if(s.kind === 'wild' && res === undefined) body = `<div class="mc-kind">${kind} · ${esc(rn)}</div><div class="mc-name">Listening…</div><div class="mc-meta">the shrine hums</div><div class="row"><button class="btn" data-mc="no">Not now</button></div>`;
    else if(!e) body = `<div class="mc-kind">Quiet shrine · ${esc(rn)}</div><div class="mc-name">Nothing stirs here</div><div class="mc-lock">This shrine is resting. Another one is never far.</div><div class="row"><button class="btn" data-mc="no">Okay</button></div>`;
    else {
      const stars = ctx.progress[e.key]?.stars || 0, lock = ctx.lockOf(e);
      body = `<div class="mc-kind">${kind} · ${esc(s.kind === 'wild' ? rn : e.sub || rn)}</div><div class="mc-name">${esc(e.name)}</div>
        <div class="mc-meta">${ctx.badge(e)}<span>par ${e.par || '?'}</span>${ctx.starsHtml(stars)}${stars ? '<span title="beacon lit">✦</span>' : ''}</div>
        ${lock ? `<div class="mc-lock">🔒 ${esc(lock)}</div>` : ''}
        <div class="row">${lock ? '' : '<button class="btn primary" data-mc="go">▶ Play</button>'}<button class="btn" data-mc="no">Not now</button></div>`;
      s.entry = e;
    }
    card.innerHTML = body; card.classList.add('on');
    if(!s.tracked){ s.tracked = true; ctx.track('map_shrine_enter', { kind:s.kind }); }
  }
  function playHere(){
    const s = cardFor; if(!s || !s.entry) return;
    saveMap(P, explored, saved.extra); sfx.ui();
    ctx.play({ ...s.entry, fromMap:{ x:s.x, z:s.z } });
  }
  // onclick, not addEventListener: #mapCard outlives this mount, and a stacked listener would keep every disposed map alive
  card.onclick = e => { const b = e.target.closest('[data-mc]'); if(!b) return; if(b.dataset.mc === 'go') playHere(); else { skipCard = P.x + ',' + P.z; hideCard(); } };

  /* ---------------- the atlas page ---------------- */
  const atlas = createAtlas({ root:$('#mapAtlas'), getPos:() => P, getExplored:() => explored, shrineInfo:(x, z) => info(x, z), onTravel:travelTo,
    onClose:() => $('#mapAtlasBtn').classList.remove('primary'), track:() => $('#mapAtlasBtn').classList.add('primary') });
  $('#mapAtlasBtn').onclick = () => { sfx.ui(); atlas.toggle(); };
  $('#mapTurn').onclick = () => { world.turn(1); sfx.ui(); };
  $('#mapBack').onclick = () => ctx.nav('/');
  const onCloudMap = e => { const m = e.detail; if(m && Array.isArray(m.explored)){ for(const k of m.explored) explored.add(k); atlas.redraw(); } };
  window.addEventListener('klarbase:map', onCloudMap);

  /* ---------------- input (main.js forwards; nothing is bound here) ---------------- */
  const ctl = {
    onKey(e, down){
      if(atlas.isOpen){
        if(!down) return true;
        if(e.key === 'Escape' || e.key === 'm' || e.key === 'M' || e.key === 'Tab'){ e.preventDefault(); atlas.close(); }
        return true;
      }
      const arrow = KEYS[e.key];
      if(arrow){
        e.preventDefault();
        if(down){ if(!e.repeat) { if(runBlock && !held.length) runBlock = false; hold(arrow); step(arrow, true); } }
        else { held = held.filter(a => a !== arrow); if(!held.length) runBlock = false; }
        return true;
      }
      if(!down) return false;
      switch(e.key){
        case 'Escape': if(cardFor && card.classList.contains('on')){ skipCard = P.x + ',' + P.z; hideCard(); } else ctx.nav('/'); return true;
        case 'm': case 'M': case 'Tab': e.preventDefault(); sfx.ui(); atlas.open(); return true;
        case 'q': case 'Q': world.turn(-1); return true;
        case 'e': case 'E': world.turn(1); return true;
        case ' ': case 'Enter': case 'x': case 'X': e.preventDefault();
          if(cardFor && card.classList.contains('on')) playHere(); else { const s = info(P.x, P.z); if(s){ skipCard = null; showCard(s); } }
          return true;
      }
      return false;
    },
    press(arrow){ if(arrow === 'use'){ if(cardFor && card.classList.contains('on')) playHere(); else { const s = info(P.x, P.z); if(s) showCard(s); } return; } if(atlas.isOpen) return; if(runBlock && !held.length) runBlock = false; hold(arrow); step(arrow, true); },
    releaseAll(){ held = []; runBlock = false; },
    release(arrow){ held = held.filter(a => a !== arrow); if(!held.length) runBlock = false; },
    swipe(arrow){ if(!atlas.isOpen){ step(arrow, true); } },
    travelTo, atlas, stats, P, chunks, explored, wild, info,
    get dayT(){ return dayT; }, set dayT(v){ dayT = v; },
    get busy(){ return busy; },
    resolveStart:() => start,
    dispose,
  };

  /* ---------------- per frame ---------------- */
  let dayT = forcedT ?? 0.06, disposed = false, W = {}, wAcc = 0, lookAcc = 1, lookAt = 0;
  for(const id of THEME_IDS) W[id] = 0;
  { const w0 = biomeWeights(ATLAS_SEED, P.x, P.z, 5); for(const k in w0) W[k] = w0[k]; }
  const fogN = world.scene.fog;
  const shList = [];
  function update(dt, t, raw){
    if(disposed) return;
    stats.frames++; stats.sum += raw; if(raw > stats.maxMs / 1000) stats.maxMs = raw * 1000;
    if(!planned && !chunks.size) plan();
    if(world.quality.tier !== tier){ tier = world.quality.tier; plan(); }
    pump(); animateChunks(dt, t);
    // Pip appears once the ground under him has landed
    if(intro){ if(revealed()){ intro = false; pip.group.visible = true; pip.body.scale.setScalar(0.01); pip.tween(0.4, p => { const s = Math.min(1, 1 - Math.pow(1 - p, 3) * Math.cos(p * 9)); pip.body.scale.setScalar(Math.max(0.01, s)); if(p >= 1) pip.body.scale.setScalar(1); }); } }
    // walk: a held key keeps hopping
    if(!busy && !intro && held.length && !runBlock && !atlas.isOpen) step(held[held.length - 1], false);
    // camera: the world's own follow rig, aimed at Pip
    const pg = pip.group.position;
    world.targetTo.set(pg.x, pg.y + 0.1, pg.z);
    world.distTo = innerWidth / Math.max(1, innerHeight) < 0.9 ? 20 : 13.5; world.shadowExt = 12;
    // clock + look
    if(forcedT == null) dayT = (dayT + dt / CYCLE) % 1;
    const night = nightAmount(dayT);
    wAcc += dt;
    if(wAcc > 0.25){ wAcc = 0; const w = biomeWeights(ATLAS_SEED, Math.round(pg.x), Math.round(pg.z), 5); for(const id of THEME_IDS) W[id] += ((w[id] || 0) - W[id]) * (1 - Math.exp(-0.25 / 1.4)); }
    lookAcc += dt;
    if(lookAcc > 0.12){ lookAcc = 0; applyLook(world, W, night); }
    sunDirection(dayT, night, world.sunDir);
    // fog: opaque-free around Pip, melting into the haze at the streaming edge
    const edge = radius() * CHUNK * 0.92;
    fogN.near = world.dist + 4; fogN.far = world.dist + edge;
    sky.update(dt, t, world.target);
    // shrine columns + beacons
    shList.length = 0;
    for(const rec of chunks.values()){
      if(!rec.chunk || (rec.state !== 'ready' && rec.state !== 'sinking')) continue;
      const g = rec.chunk.group, vis = rec.state === 'sinking' ? Math.max(0, 1 - rec.sinkT * 1.4) : rec.age > 0.35 ? 1 : 0;
      if(!vis) continue;
      for(const sh of rec.chunk.shrines){ sh.y = sh.y0 + g.position.y; sh.vis = vis * (reduced() ? 1 : Math.min(1, (rec.age - 0.35) * 2)); shList.push(sh); }
    }
    fx.update(shList, t, night);
  }

  function dispose(){
    if(disposed) return; disposed = true;
    clearTimeout(toastTimer); if(saveTimer){ clearTimeout(saveTimer); saveTimer = 0; }
    saveMap(P, explored, saved.extra);
    window.removeEventListener('klarbase:map', onCloudMap);
    world.setExternal(null);
    for(const rec of chunks.values()){ if(rec.chunk){ scene.remove(rec.chunk.group); rec.chunk.dispose(); } }
    chunks.clear(); queue.length = 0; if(cur && cur.gen) cur.gen.return(); cur = null;
    sky.dispose(); fx.dispose(); wild.dispose(); freeShrineStones();
    kit.solid.dispose(); kit.glow.dispose(); for(const g of used) g.dispose(); used.clear();
    hideCard(); $('#mapToast').classList.remove('on'); atlas.close();
    world.view = 0; world.turn(0); world.yaw = world.yawTo; pip.group.visible = false; pip.body.scale.setScalar(1);
  }

  // coming back from a play: the shrine we stand on is not offered again; a freshly lit beacon sparkles
  { const s0 = info(P.x, P.z); if(s0) skipCard = P.x + ',' + P.z; }
  plan(); hudLit(); onArrive(true);
  if(info(P.x, P.z) === null) skipCard = null;
  // a beacon that just lit (we came back from a clear) gets a little sparkle
  setTimeout(() => { const s1 = info(P.x, P.z); if(disposed || !s1 || !s1.lit) return; const b = here(); b.y += 1.5; world.burst(b, { n:16, color:'#ffd35c', speed:1.4, up:1.4, life:0.9, size:0.05, gravity:1 }); sfx.key(); }, 1500);
  ctx.track('map_enter');
  return ctl;
}
