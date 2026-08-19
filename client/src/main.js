// Klarbase client entry — boots the Phase 1 sandbox, then layers the platform:
// auth chip, browse overlay, publish flow, world (free-roam) and map routes.
// Gating (Phase 2 scope): anonymous visitors play the bundled presets only;
// building, importing, publishing, browsing and the world require login.
import { gates, loadPreset, importJSON, toV4, getW } from './sandbox.js';
import { getSession, signIn, signOut } from './auth.js';
import { api } from './net.js';
import * as roam from './world/roam.js';
import * as mapview from './world/mapview.js';

const $ = s => document.querySelector(s);
const toastEl = $('#toast');
function toast(msg, err){
  toastEl.textContent = msg;
  toastEl.className = err ? 'show err' : 'show';
  clearTimeout(toast._t); toast._t = setTimeout(() => toastEl.className = '', 3200);
}

let session = null;

/* ---------------- auth chip + gating ---------------- */
async function refreshAuth(){
  session = await getSession();
  gates.canBuild = true;   // building/playing/export/import-file are local & client-side — open to all; only publish + world persist to the server and require login
  const chip = $('#authchip');
  if(session){
    chip.innerHTML = '';
    const span = document.createElement('span');
    span.textContent = session.user.name || session.user.email;
    const bOut = document.createElement('button'); bOut.textContent = 'sign out';
    bOut.onclick = async () => { await signOut(); location.reload(); };
    chip.append(span, bOut);
    $('#btnBuild').style.display = '';
    $('#btnImport').style.display = '';
    addPlatformButtons();
  } else {
    chip.innerHTML = '';
    const gh = document.createElement('button'); gh.textContent = 'sign in · GitHub';
    gh.onclick = () => signIn('github');
    const gg = document.createElement('button'); gg.textContent = 'sign in · Google';
    gg.onclick = () => signIn('google');
    chip.append(gh, gg);
    // anonymous can build/play/export/import-file locally; publish + world need login
    $('#btnBuild').style.display = '';
    $('#btnImport').style.display = '';
  }
}

/* ---------------- platform buttons (publish / browse / world / map) ------- */
let platformAdded = false;
function addPlatformButtons(){
  if(platformAdded) return; platformAdded = true;
  const row = $('#start .row:last-of-type');
  const mk = (label, fn) => { const b = document.createElement('button');
    b.className = 'ghost'; b.textContent = label; b.onclick = fn; row.appendChild(b); };
  mk('Publish', publishFlow);
  mk('Browse', openBrowse);
  mk('World', () => enterWorld());
  mk('Map', () => mapview.enter($('#mapWrap'), $('#worldHud')));
}

async function publishFlow(){
  try {
    const doc = toV4();
    doc.meta = { ...doc.meta, name: getW().name };
    const r = await api('/puzzles', { method:'POST', body:{ title:getW().name, puzzle:doc } });
    const url = location.origin + '/#/p/' + r.hash;
    await navigator.clipboard.writeText(url).catch(() => {});
    toast((r.deduped ? 'already published — link copied' : 'published — link copied'));
  } catch(e){
    if(e.validation) toast('publish refused: ' + e.validation[0].text, true);
    else toast(e.message, true);
  }
}

/* ---------------- browse overlay ---------------- */
let cursor = null;
async function openBrowse(){
  $('#browse').classList.add('open');
  await loadMore(true);
}
async function loadMore(fresh){
  try {
    const r = await api('/puzzles?limit=24' + (fresh ? '' : '&cursor=' + cursor));
    cursor = r.nextCursor;
    const list = $('#browseList');
    if(fresh) list.innerHTML = '';
    for(const p of r.puzzles){
      const d = document.createElement('div');
      d.className = 'pcard';
      d.innerHTML = `<b></b><small></small>`;
      d.querySelector('b').textContent = p.title;
      d.querySelector('small').textContent = 'by ' + p.author.name + (p.mine ? ' · you' : '');
      d.onclick = () => playShared(p.hash);
      list.appendChild(d);
    }
    if(fresh && !r.puzzles.length) list.innerHTML = '<p>nothing published yet — build something.</p>';
  } catch(e){ toast(e.message, true); }
}
async function playShared(hash){
  try {
    const r = await api('/puzzles/' + hash);
    $('#browse').classList.remove('open');
    importJSON(JSON.stringify(r.puzzle));       // sandbox loader: validates + plays
    location.hash = '/p/' + hash;
  } catch(e){ toast(e.message, true); }
}
document.querySelectorAll('.overlay .close').forEach(b =>
  b.onclick = () => b.closest('.overlay').classList.remove('open'));

/* ---------------- world (free-roam) ---------------- */
let inWorld = false;
async function enterWorld(){
  if(inWorld) return; inWorld = true;
  $('#worldWrap').style.display = 'block';
  $('#worldHud').style.display = 'block';
  mapview.exit();
  await roam.enter($('#worldWrap'), $('#worldHud'));
  location.hash = '/world';
}
export function exitWorld(){
  if(!inWorld) return; inWorld = false;
  roam.exit();
  $('#worldWrap').style.display = 'none';
  $('#worldHud').style.display = 'none';
  location.hash = '';
}
window.addEventListener('keydown', e => {
  if(e.key === 'Escape'){ exitWorld(); mapview.exit(); $('#mapWrap').style.display = 'none'; }
  if(!session) return;
  if(e.key === 'm' || e.key === 'M'){
    if(inWorld){ roam.exit(); $('#worldWrap').style.display = 'none'; inWorld = false; }
    $('#mapWrap').style.display = 'block';
    mapview.enter($('#mapWrap'), $('#worldHud'));
  }
  if(e.key === 'w' || e.key === 'W'){
    if($('#mapWrap').style.display === 'block'){ mapview.exit(); $('#mapWrap').style.display = 'none'; }
    enterWorld();
  }
});

/* ---------------- hash routing ---------------- */
async function route(){
  const h = location.hash;
  if(h.startsWith('#/p/')){
    await playShared(h.slice(4));               // public: shared maquettes play without login
  } else if(h === '#/world' && session){
    await enterWorld();
  } else if(h === '#/map' && session){
    $('#mapWrap').style.display = 'block';
    mapview.enter($('#mapWrap'), $('#worldHud'));
  }
}
window.addEventListener('hashchange', route);

/* ---------------- boot ---------------- */
await refreshAuth();
await route();
