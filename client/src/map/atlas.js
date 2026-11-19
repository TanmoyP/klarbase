// The Atlas page: a 2D parchment map of the land you have seen. Cells are coloured by their theme's top
// colour, a touch darker with height; open sky is just paper. Pins: you, shrines (lit = gold star, unlit = a
// dot), region names. Drag / wheel / pinch to pan and zoom; tap a lit star to fast-travel there.
// Cheap: one 16x16 canvas per explored chunk (built once), a redraw only when opened, panned or zoomed.
import { chunkCached, regionAt, ATLAS_SEED, CHUNK } from '@klar/core';
import { THEMES } from '../game/themes.js';

const PAPER = ['#f4e9d0', '#e8d9b8'];
const shade = (hex, k) => { const n = parseInt(hex.slice(1), 16), f = v => Math.max(0, Math.min(255, Math.round(v * k))); return [f(n >> 16), f(n >> 8 & 255), f(n & 255)]; };

export function createAtlas({ root, getPos, getExplored, shrineInfo, onTravel, onClose, track }){
  root.innerHTML = `<div class="atlas-bar glass"><b>Sky Atlas</b><span id="atlasNote">tap a lit ★ to fly there</span><button class="btn small" id="atlasX" title="Close (Esc / M)">✕</button></div>
    <canvas id="atlasCv"></canvas>
    <div class="atlas-legend glass"><span><i class="you"></i>you</span><span><i class="star">★</i>lit beacon</span><span><i class="dot"></i>shrine</span></div>`;
  const cv = root.querySelector('#atlasCv'), g = cv.getContext('2d'), note = root.querySelector('#atlasNote');
  root.querySelector('#atlasX').onclick = () => close();
  let opened = false, scale = 6, cx = 0, cz = 0, W = 0, H = 0, dpr = 1, pins = [];
  const imgs = new Map(), shr = new Map();            // 'cx,cz' -> canvas / shrines

  function chunkImage(key){
    let c = imgs.get(key); if(c) return c;
    const [ccx, ccz] = key.split(',').map(Number), data = chunkCached(ATLAS_SEED, ccx, ccz);
    c = document.createElement('canvas'); c.width = c.height = CHUNK;
    const x = c.getContext('2d'), im = x.createImageData(CHUNK, CHUNK), at = (lx, lz) => lx < 0 || lz < 0 || lx >= CHUNK || lz >= CHUNK ? null : data.cells[lz * CHUNK + lx];
    for(let z = 0; z < CHUNK; z++) for(let xx = 0; xx < CHUNK; xx++){
      const cell = data.cells[z * CHUNK + xx], o = (z * CHUNK + xx) * 4;
      if(cell.kind === 'void') continue;
      const T = THEMES[cell.theme] || THEMES.jungle;
      const base = cell.kind === 'water' ? T.water : cell.kind === 'bridge' ? T.wood : cell.kind === 'rock' ? T.rock : cell.kind === 'tree' ? T.leaf : cell.kind === 'ramp' ? T.topAlt : T.top;
      const south = at(xx, z + 1), cliff = south && south.kind === 'void' ? 0.8 : 1;       // the lower lip of an isle reads as its cliff
      const rgb = shade(base, (1 - 0.07 * cell.h) * cliff);
      im.data[o] = rgb[0]; im.data[o + 1] = rgb[1]; im.data[o + 2] = rgb[2]; im.data[o + 3] = 255;
    }
    x.putImageData(im, 0, 0); imgs.set(key, c);
    shr.set(key, data.shrines.map(s => ({ x:s.x, z:s.z })));
    return c;
  }

  function draw(){
    const ex = getExplored(), p = getPos(), dpr_ = dpr;
    g.setTransform(dpr_, 0, 0, dpr_, 0, 0);
    const bg = g.createRadialGradient(W / 2, H / 2, 20, W / 2, H / 2, Math.hypot(W, H) / 1.5);
    bg.addColorStop(0, PAPER[0]); bg.addColorStop(1, PAPER[1]); g.fillStyle = bg; g.fillRect(0, 0, W, H);
    const sx = x => (x - cx) * scale + W / 2, sz = z => (z - cz) * scale + H / 2;
    g.imageSmoothingEnabled = false;
    const regions = new Map(); pins = [];
    for(const key of ex){
      const [ccx, ccz] = key.split(',').map(Number);
      const x0 = sx(ccx * CHUNK), z0 = sz(ccz * CHUNK), s = CHUNK * scale;
      if(x0 > W || z0 > H || x0 + s < 0 || z0 + s < 0) continue;
      g.drawImage(chunkImage(key), x0, z0, s + 0.5, s + 0.5);
      const mx = ccx * CHUNK + 8, mz = ccz * CHUNK + 8, r = regionAt(ATLAS_SEED, mx, mz), k = r.site.join(',');
      const a = regions.get(k) || regions.set(k, { name:r.name, x:0, z:0, n:0 }).get(k); a.x += mx; a.z += mz; a.n++;
      for(const sh of shr.get(key) || []){
        const info = shrineInfo(sh.x, sh.z); pins.push({ x:sh.x, z:sh.z, px:sx(sh.x + 0.5), pz:sz(sh.z + 0.5), lit:!!(info && info.lit) });
      }
    }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for(const a of regions.values()){
      const fs = Math.max(11, Math.min(22, scale * 2.6));
      g.font = `700 ${fs}px Fredoka, Nunito, sans-serif`; g.lineWidth = 4; g.strokeStyle = 'rgba(244,233,208,.85)'; g.fillStyle = 'rgba(96,66,38,.85)';
      const tx = sx(a.x / a.n), tz = sz(a.z / a.n); g.strokeText(a.name, tx, tz); g.fillText(a.name, tx, tz);
    }
    for(const pin of pins){
      if(pin.px < -12 || pin.pz < -12 || pin.px > W + 12 || pin.pz > H + 12) continue;
      if(pin.lit){ star(pin.px, pin.pz, Math.max(7, Math.min(12, scale * 1.5))); }
      else { g.fillStyle = 'rgba(120,84,52,.8)'; g.beginPath(); g.arc(pin.px, pin.pz, Math.max(3, Math.min(5.5, scale * 0.7)), 0, 7); g.fill(); }
    }
    // you
    const yx = sx(p.x + 0.5), yz = sz(p.z + 0.5);
    g.fillStyle = '#ff7a6b'; g.strokeStyle = '#fff'; g.lineWidth = 3; g.beginPath(); g.arc(yx, yz, 7, 0, 7); g.stroke(); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(yx + 1.5, yz - 1.5, 2, 0, 7); g.fill();
  }
  function star(x, y, r){
    g.beginPath();
    for(let i = 0; i < 10; i++){ const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; g[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    g.closePath(); g.fillStyle = '#ffc93c'; g.strokeStyle = '#b8791a'; g.lineWidth = 1.6; g.fill(); g.stroke();
  }

  function size(){
    dpr = Math.min(devicePixelRatio || 1, 2); W = root.clientWidth; H = root.clientHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.width = W + 'px'; cv.style.height = H + 'px';
  }
  const redraw = () => { if(opened) draw(); };

  /* ---- pan / zoom / pinch / tap ---- */
  const ptr = new Map(); let moved = 0, pinch0 = 0, scale0 = 6;
  const toWorld = (px, py) => [cx + (px - W / 2) / scale, cz + (py - H / 2) / scale];
  const zoomAt = (px, py, k) => { const [wx, wz] = toWorld(px, py); scale = Math.max(1.5, Math.min(28, scale * k)); cx = wx - (px - W / 2) / scale; cz = wz - (py - H / 2) / scale; redraw(); };
  const hit = (px, py) => { let best = null, bd = 20; for(const p of pins) if(p.lit){ const d = Math.hypot(p.px - px, p.pz - py); if(d < bd){ bd = d; best = p; } } return best; };
  cv.addEventListener('pointerdown', e => { try { cv.setPointerCapture(e.pointerId); } catch {} ptr.set(e.pointerId, { x:e.offsetX, y:e.offsetY }); moved = 0; if(ptr.size === 2){ const [a, b] = [...ptr.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); scale0 = scale; } });
  cv.addEventListener('pointermove', e => {
    const p = ptr.get(e.pointerId);
    if(!p){ cv.style.cursor = hit(e.offsetX, e.offsetY) ? 'pointer' : 'grab'; return; }
    if(ptr.size === 2){
      p.x = e.offsetX; p.y = e.offsetY; const [a, b] = [...ptr.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      if(pinch0 > 0){ const k = scale0 * d / pinch0 / scale; zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, k); } moved = 99; return;
    }
    const dx = e.offsetX - p.x, dy = e.offsetY - p.y; p.x = e.offsetX; p.y = e.offsetY; moved += Math.abs(dx) + Math.abs(dy);
    cx -= dx / scale; cz -= dy / scale; redraw();
  });
  const up = e => {
    const had = ptr.delete(e.pointerId);
    if(had && ptr.size === 0 && moved < 6){ const h = hit(e.offsetX, e.offsetY); if(h){ close(); onTravel(h.x, h.z); } }
  };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', e => ptr.delete(e.pointerId));
  cv.addEventListener('wheel', e => { e.preventDefault(); zoomAt(e.offsetX, e.offsetY, Math.exp(-e.deltaY * 0.0015)); }, { passive:false });
  new ResizeObserver(() => { if(opened){ size(); draw(); } }).observe(root);

  function open(){
    if(opened) return; opened = true; root.classList.add('on');
    const p = getPos(); cx = p.x; cz = p.z; scale = Math.max(3, Math.min(10, scale));
    size(); draw(); if(track) track();
    note.textContent = pins.some(p => p.lit) ? 'tap a lit ★ to fly there' : 'clear a shrine to light its beacon';
  }
  function close(){ if(!opened) return; opened = false; root.classList.remove('on'); if(onClose) onClose(); }
  return { open, close, toggle:() => opened ? close() : open(), get isOpen(){ return opened; }, get pins(){ return pins; }, redraw };
}
