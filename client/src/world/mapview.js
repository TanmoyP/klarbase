// Zoomed-out world map (Phase 3): every claimed cell and its author.
// Interactions: drag pans, wheel zooms, click a FREE cell adjacent to the
// world to claim it, click YOUR OWN empty cell to place a published puzzle.
// Claim adjacency and port compatibility are re-checked server-side; the map
// is a client, not an authority.
import { api } from '../net.js';

let canvas, hud, ctx, running = false;
let cells = [], cam = { x:0, y:0, s:28 };        // world coords -> px
let myName = null, myPuzzles = null;
let drag = null, raf = 0;

const AUTHOR_COLORS = ['#6fc4b8','#c98d5e','#a9c483','#d97a72','#8fa6d8','#e6d5b8','#b48ed9','#d9c26f'];
const colorFor = name => {
  let h = 0; for(const ch of name) h = (h*31 + ch.charCodeAt(0)) >>> 0;
  return AUTHOR_COLORS[h % AUTHOR_COLORS.length];
};
const toPx = (x,y) => [ (x - cam.x)*cam.s + canvas.width/2, (y - cam.y)*cam.s + canvas.height/2 ];

async function refresh(){
  const r = await api('/world/map');
  cells = r.cells;
  draw();
}

function draw(){
  if(!running) return;
  ctx.fillStyle = '#241f38'; ctx.fillRect(0,0,canvas.width,canvas.height);
  const s = cam.s;
  // faint lattice
  ctx.strokeStyle = '#ffffff10';
  const [x0,y0] = [Math.floor(cam.x - canvas.width/2/s), Math.floor(cam.y - canvas.height/2/s)];
  const [x1,y1] = [Math.ceil(cam.x + canvas.width/2/s), Math.ceil(cam.y + canvas.height/2/s)];
  for(let x=x0;x<=x1;x++){ const [px] = toPx(x,0); ctx.beginPath(); ctx.moveTo(px,0); ctx.lineTo(px,canvas.height); ctx.stroke(); }
  for(let y=y0;y<=y1;y++){ const [,py] = toPx(0,y); ctx.beginPath(); ctx.moveTo(0,py); ctx.lineTo(canvas.width,py); ctx.stroke(); }
  for(const c of cells){
    const [px,py] = toPx(c.x, c.y);
    ctx.fillStyle = colorFor(c.author) + (c.placed ? 'ff' : '66');
    ctx.fillRect(px+1, py+1, s-2, s-2);
    if(s >= 22){
      ctx.fillStyle = '#241f38';
      ctx.font = `${Math.min(12, s*0.4)}px system-ui`;
      ctx.fillText(c.author.slice(0,6), px+3, py+s/2+4);
    }
  }
  raf = requestAnimationFrame(draw);
}

function cellAt(ev){
  const r = canvas.getBoundingClientRect();
  const px = ev.clientX - r.left, py = ev.clientY - r.top;
  return [ Math.floor(cam.x + (px - canvas.width/2)/cam.s + 0.5),
           Math.floor(cam.y + (py - canvas.height/2)/cam.s + 0.5) ];
}

async function onClick(ev){
  if(drag && drag.moved) return;
  const [x,y] = cellAt(ev);
  const existing = cells.find(c => c.x===x && c.y===y);
  try {
    if(!existing){
      await api('/world/claims', { method:'POST', body:{ x, y } });
      hud.innerHTML = `claimed (${x},${y}) — now publish a puzzle and place it here`;
      await refresh(); return;
    }
    if(existing.author === myName && !existing.placed){
      if(!myPuzzles) myPuzzles = (await api('/puzzles?author=me&limit=50')).puzzles;
      if(!myPuzzles.length){ hud.innerHTML = 'publish a puzzle first (build one, then Publish).'; return; }
      const pick = await pickPuzzle(myPuzzles);
      if(!pick) return;
      await api(`/world/plots/${x}/${y}/place`, { method:'POST', body:{ puzzleHash: pick.hash } });
      hud.innerHTML = `placed “${pick.title}” at (${x},${y}) — immutable from here on`;
      await refresh(); return;
    }
    hud.innerHTML = existing.placed
      ? `(${x},${y}) · ${existing.author} · occupied — walk it in World (press W)`
      : `(${x},${y}) · claimed by ${existing.author}`;
  } catch(e){
    hud.innerHTML = 'refused: ' + e.message;      // server reasons are readable
  }
}

// minimal modal picker — intentionally unglamorous; polish is a Phase 3 task
function pickPuzzle(list){
  return new Promise(resolve => {
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;z-index:40;background:#000a;display:flex;align-items:center;justify-content:center';
    const box = document.createElement('div');
    box.style.cssText = 'background:#241f38;color:#efe6d8;padding:20px;border-radius:12px;font:14px system-ui;min-width:260px';
    box.innerHTML = '<b>place which puzzle?</b><br><br>';
    for(const p of list){
      const b = document.createElement('button');
      b.textContent = p.title;
      b.style.cssText = 'display:block;width:100%;margin:6px 0;padding:8px;background:#ffffff14;color:#efe6d8;border:1px solid #ffffff2a;border-radius:8px;cursor:pointer';
      b.onclick = () => { ov.remove(); resolve(p); };
      box.appendChild(b);
    }
    const cancel = document.createElement('button');
    cancel.textContent = 'cancel';
    cancel.style.cssText = 'margin-top:8px;background:none;border:none;color:#efe6d8aa;cursor:pointer';
    cancel.onclick = () => { ov.remove(); resolve(null); };
    box.appendChild(cancel); ov.appendChild(box);
    document.body.appendChild(ov);
  });
}

function onWheel(ev){ ev.preventDefault(); cam.s = Math.max(6, Math.min(80, cam.s * (ev.deltaY > 0 ? 0.9 : 1.1))); }
function onDown(ev){ drag = { x:ev.clientX, y:ev.clientY, moved:false }; }
function onMove(ev){
  if(!drag) return;
  const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
  if(Math.abs(dx)+Math.abs(dy) > 4) drag.moved = true;
  cam.x -= dx / cam.s; cam.y -= dy / cam.s;
  drag.x = ev.clientX; drag.y = ev.clientY;
}
function onUp(){ setTimeout(() => drag = null, 0); }
function fit(){ canvas.width = canvas.clientWidth; canvas.height = canvas.clientHeight; }

export async function enter(canvasEl, hudEl){
  if(running) return;               // enter/exit are balanced; no double-binding
  canvas = canvasEl; hud = hudEl;
  canvas.style.display = 'block';
  hud.style.display = 'block';
  hud.innerHTML = 'drag to pan · wheel to zoom · click free cell to claim · click your empty cell to place · W world · Esc back';
  ctx = canvas.getContext('2d');
  running = true;
  fit();
  // whoami: derive from the session endpoint better-auth exposes
  if(!myName){ try { const s = await (await fetch('/api/auth/get-session')).json(); myName = s && s.user && s.user.name; } catch {} }
  window.addEventListener('resize', fit);
  canvas.addEventListener('wheel', onWheel, { passive:false });
  canvas.addEventListener('mousedown', onDown);
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
  canvas.addEventListener('click', onClick);
  await refresh();
}

export function exit(){
  running = false;
  cancelAnimationFrame(raf);
  if(canvas){
    canvas.style.display = 'none';
    canvas.removeEventListener('wheel', onWheel);
    canvas.removeEventListener('mousedown', onDown);
    canvas.removeEventListener('click', onClick);
  }
  window.removeEventListener('mousemove', onMove);
  window.removeEventListener('mouseup', onUp);
  if(hud) hud.style.display = 'none';
}
