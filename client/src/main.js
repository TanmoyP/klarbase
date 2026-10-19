// Klarbase — app shell. Screens: title · choose an isle · play · build.
// Isles come from three places, all played by the same engine:
//   official   — the 24 curated isles in @klar/core
//   community  — isles merged on GitHub (isles/community/<author>/<id>.json),
//                bundled at build time with credit to their author
//   online     — isles shared in-game and stored on the server (/i/<hash>)
import { CURATED_ISLES, CHAPTERS, parseIsle, solveIsle, starsFor, isleHash, initialState } from '@klar/core';
import { World } from './game/world.js';
import { Session } from './game/session.js';
import { THEMES, themeOf } from './game/themes.js';
import { unlockAudio, setSound, soundOn, sfx } from './game/audio.js';
import { mountBuilder } from './builder.js';
import { getSession, signIn, signOut } from './auth.js';
import { api } from './net.js';

export const REPO_URL = 'https://github.com/TanmoyP/klarbase';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
const store = {
  get:(k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set:(k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

/* ---------------- isle catalogue ---------------- */
const COMMUNITY = Object.values(import.meta.glob('../../isles/community/*/*.json', { eager:true, import:'default' }))
  .filter(d => d && Array.isArray(d.rows))
  .sort((a, b) => a.name.localeCompare(b.name));
const official = CURATED_ISLES.map((d, i) => ({ key:'o:' + d.id, doc:d, name:d.name, theme:d.theme, par:d.par, solution:d.solution,
  hint:d.hint, index:i, sub:`${themeOf(d.theme).chapter} · isle ${i + 1} of ${CURATED_ISLES.length}` }));
const community = COMMUNITY.map(d => ({ key:`c:${d.author}/${d.id}`, doc:d, name:d.name, theme:d.theme, par:d.par, solution:d.solution,
  hint:d.hint, author:d.author, sub:`by @${d.author}` }));
const communityHashes = () => COMMUNITY.map(d => [isleHash(d), `community isle “${d.name}” by @${d.author}`]);

/* ---------------- app state ---------------- */
const world = new World($('#stage'));
const settings = store.get('klarbase.v2.settings', { sound:true, timer:false });
const progress = store.get('klarbase.v2.progress', {});
let session = null, game = null, current = null, tab = 'official', online = null;
setSound(settings.sound);

function toast(msg, bad = false){
  const t = $('#toast'); t.textContent = msg; t.className = 'glass on' + (bad ? ' bad' : '');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.className = 'glass', 2600);
}
function setAccent(theme){
  const T = themeOf(theme);
  document.documentElement.style.setProperty('--accent', T.accent);
}
function show(id){ document.querySelectorAll('.screen').forEach(s => s.classList.toggle('on', s.id === 'scr-' + id)); document.body.classList.toggle('in-game', id === 'game'); syncInset(); }
// Phone builder: the panel is a bottom sheet — keep the isle framed in the space above it.
const sheet = document.querySelector('#scr-create .side');
function syncInset(){
  const on = document.getElementById('scr-create').classList.contains('on') && innerWidth <= 760;
  world.setInsetBottom(on ? innerHeight - sheet.getBoundingClientRect().top : 0);
}
new ResizeObserver(syncInset).observe(sheet);
const modal = { open(html){ $('#modalBody').innerHTML = html; $('#modal').classList.add('on'); }, close(){ $('#modal').classList.remove('on'); } };
$('#modal').addEventListener('click', e => { if(e.target.id === 'modal') modal.close(); });

/* ---------------- top bar ---------------- */
function syncTopbar(){
  $('#btnSound').textContent = settings.sound ? '🔊' : '🔈';
  $('#btnTimer').style.opacity = settings.timer ? 1 : 0.5;
  $('#btnTimer').title = settings.timer ? 'Timer on — click to turn off' : 'Time my attempts';
  $('#statTimeWrap').style.display = settings.timer ? '' : 'none';
}
$('#btnSound').onclick = () => { settings.sound = !settings.sound; setSound(settings.sound); store.set('klarbase.v2.settings', settings); syncTopbar(); };
$('#btnTimer').onclick = () => { settings.timer = !settings.timer; store.set('klarbase.v2.settings', settings); syncTopbar(); toast(settings.timer ? 'Timer on — your times are saved' : 'Timer off — take it easy'); };
$('#btnHelp').onclick = () => helpModal();
async function refreshAuth(){
  session = await getSession();
  const chip = $('#authchip'); chip.innerHTML = '';
  if(session){
    const who = document.createElement('span'); who.className = 'glass who'; who.textContent = session.user.name || session.user.email;
    const out = document.createElement('button'); out.className = 'btn small ghost'; out.textContent = 'Sign out';
    out.onclick = async () => { await signOut(); location.reload(); };
    chip.append(who, out);
  } else {
    const b = document.createElement('button'); b.className = 'btn small'; b.textContent = 'Sign in';
    b.onclick = () => modal.open(`<h2>Sign in</h2><p class="facts">Only needed to share isles online. Playing and building are free for everyone.</p>
      <div class="row"><button class="btn primary" id="siGh">GitHub</button><button class="btn" id="siGo">Google</button></div>`);
    chip.append(b);
  }
}
document.addEventListener('click', e => {
  if(e.target.id === 'siGh') signIn('github'); if(e.target.id === 'siGo') signIn('google');
  const go = e.target.closest('[data-go]'); if(go){ e.preventDefault(); sfx.ui(); nav(go.dataset.go); }
});

function helpModal(){
  modal.open(`<h2>How to play</h2>
    <div class="rules">
      <div><span class="ico">🐣</span><span>Hop one tile per key. <b>↑ always means away from you</b> — turn the view with Q / E.</span></div>
      <div><span class="ico">⬆</span><span>Stairs climb one level. You can hop <b>down</b> a ledge, but never climb one.</span></div>
      <div><span class="ico">📦</span><span>Walk into crates to push them. In water they sink and become stepping stones.</span></div>
      <div><span class="ico">🧊</span><span>Ice keeps you sliding until something stops you — crates included.</span></div>
      <div><span class="ico">◎</span><span>Gates open while <b>every</b> plate is pressed, by you or a crate.</span></div>
      <div><span class="ico">🕹</span><span>Stand on a lever and press <b>Space</b>: every bridge flips. A crate on a sinking bridge stays as a block.</span></div>
      <div><span class="ico">🔑</span><span>Keys open doors — one key each. Step into an arch ⛩ to appear at its twin.</span></div>
      <div><span class="ico">⭐</span><span>Reach the glowing star. Match par for ★★★. Stuck? <b>H</b> shows your best next move.</span></div>
    </div>
    <div class="row"><button class="btn primary" onclick="document.getElementById('modal').classList.remove('on')">Got it</button></div>`);
}

/* ---------------- title ---------------- */
const SHOWCASE = ['the-peak', 'palm-plates', 'canal-lift', 'rooftops', 'root-bridge', 'night-market', 'glacier-maze'];
function titleScreen(){
  stopGame();
  const id = SHOWCASE[Math.floor(Math.random() * SHOWCASE.length)];
  const pick = CURATED_ISLES.find(i => i.id === id) || CURATED_ISLES[0];
  if(pick.id !== id) console.warn('[klarbase] showcase isle not found:', id, CURATED_ISLES.length);
  const { level } = parseIsle(pick);
  world.load(level, pick.theme, { showcase:true }); world.setShowcase(true); world.reset(initialState(level));
  setAccent(pick.theme); show('title');
}

/* ---------------- choose an isle ---------------- */
function starsHtml(n){ return `<span class="stars">${'<b>★</b>'.repeat(n)}${'★'.repeat(3 - n)}</span>`; }

// A tiny map of the real isle — terraces, water, ice, props, the goal — drawn
// from its rows in the theme's colours, so every card previews its puzzle.
const thumbCache = new Map();
function thumb(doc){
  if(!doc || !Array.isArray(doc.rows)) return null;
  const key = doc.theme + doc.rows.join('|');
  if(thumbCache.has(key)) return thumbCache.get(key);
  const T = themeOf(doc.theme), grid = doc.rows.map(r => r.trim().split(/\s+/));
  const h = grid.length, w = grid[0].length, W = 240, H = 148, cs = Math.min((W - 24) / w, (H - 20) / h);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, T.sky[0]); sky.addColorStop(0.75, T.sky[1]); sky.addColorStop(1, T.sky[2]);
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  const ox = (W - cs * w) / 2, oy = (H - cs * h) / 2 + 2;
  const shade = (hex, k) => { const n = parseInt(hex.slice(1), 16); const f = v => Math.max(0, Math.min(255, Math.round(v * k))); return `rgb(${f(n >> 16)},${f(n >> 8 & 255)},${f(n & 255)})`; };
  for(let z = 0; z < h; z++) for(let x = 0; x < w; x++){
    const t = grid[z][x], ch = t[0], lv = +(t[1] || 0);
    if(ch === '-') continue;
    const px = ox + x * cs, py = oy + z * cs - lv * cs * 0.18;
    g.fillStyle = shade(T.strata[0], 0.8); g.fillRect(px, py + cs * 0.82, cs, cs * 0.3 + lv * cs * 0.18);   // cliff edge
    let top = T.top;
    if(ch === '~' || ch === '=' || ch === '_') top = T.water; else if(ch === '*') top = T.ice; else if(ch === '#') top = T.rock;
    g.fillStyle = shade(top, 0.9 + lv * 0.06); g.fillRect(px, py, cs, cs * 0.86);
    const dot = (col, r) => { g.fillStyle = col; g.beginPath(); g.arc(px + cs / 2, py + cs * 0.43, cs * r, 0, Math.PI * 2); g.fill(); };
    if(ch === 'T') dot(T.leaf, 0.38); else if(ch === 'G') dot(T.accent, 0.3); else if(ch === 'S') dot('#fff4e2', 0.26);
    else if(ch === 'C') { g.fillStyle = T.wood; g.fillRect(px + cs * 0.2, py + cs * 0.12, cs * 0.6, cs * 0.6); }
    else if(ch === 'p' || ch === 'q') dot(ch === 'p' ? '#4ff0ff' : '#ff72d8', 0.28);
    else if(ch === 'k') dot('#ffd35c', 0.2); else if(ch === ',') dot(T.flora[0], 0.12);
  }
  const url = c.toDataURL();
  thumbCache.set(key, url); return url;
}
function cardHtml(e, num){
  const T = themeOf(e.theme), p = progress[e.key], img = thumb(e.doc);
  return `<button class="card" data-key="${esc(e.key)}">
    <div class="sky" style="${img ? `background:url(${img}) center/cover` : `background:linear-gradient(180deg, ${T.sky[0]}, ${T.sky[1]} 75%, ${T.sky[2]})`}">
      ${num ? `<span class="num">${num}</span>` : ''}</div>
    <div class="body"><div class="name">${esc(e.name)}</div>
      ${e.author ? `<div class="credit">by <a href="https://github.com/${esc(e.author)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">@${esc(e.author)}</a></div>` : ''}
      <div class="meta"><span>${e.par ? 'par ' + e.par : T.label}${p ? ` · best ${p.moves}` : ''}</span>${starsHtml(p ? p.stars : 0)}</div></div></button>`;
}
function selectScreen(which){
  stopGame(); tab = which; show('select');
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  const list = $('#selectList');
  if(tab === 'official'){
    list.innerHTML = CHAPTERS.map(ch => {
      const T = THEMES[ch.theme], isles = official.filter(e => e.theme === ch.theme);
      const got = isles.reduce((s, e) => s + (progress[e.key]?.stars || 0), 0);
      return `<div class="chapter"><div class="chapter-head"><h3>${ch.title}</h3><span>${T.label} · ${T.blurb} · ${got}/${isles.length * 3} ★</span></div>
        <div class="grid">${isles.map(e => cardHtml(e, e.index + 1)).join('')}</div></div>`;
    }).join('');
  } else {
    list.innerHTML = `<div class="chapter"><div class="chapter-head"><h3>Made by players</h3><span>merged on GitHub · every one checked solvable</span></div>
      <div class="grid">${community.map(e => cardHtml(e)).join('') || '<div class="empty">No community isles yet — yours could be first.</div>'}</div>
      <p class="note" style="margin-top:14px">Build an isle in <a href="/create" data-go="/create">Create</a>, press <b>Export for GitHub</b>, and open a pull request.
        Automated checks make sure it's solvable and fair, and you're credited by name. <a href="${REPO_URL}/blob/main/CONTRIBUTING.md" target="_blank" rel="noopener">Contributing guide →</a></p></div>
      <div class="chapter"><div class="chapter-head"><h3>Shared online</h3><span>fresh isles shared from the builder</span></div><div class="grid" id="onlineGrid"><div class="empty">Loading…</div></div></div>`;
    loadOnline();
  }
  const first = (tab === 'official' ? official : community)[0];
  if(first && !world.showcase){ const { level } = parseIsle(first.doc); world.load(level, first.theme, { showcase:true }); world.setShowcase(true); world.reset(initialState(level)); }
}
async function loadOnline(){
  const grid = $('#onlineGrid'); if(!grid) return;
  try {
    const r = await api('/puzzles?limit=30');
    online = r.puzzles.filter(p => p.isle).map(p => ({ key:'i:' + p.hash, hash:p.hash, name:p.title, theme:p.theme || 'jungle', author:null, sub:'shared by ' + p.author.name, online:true }));
    grid.innerHTML = online.map(e => cardHtml(e)).join('') || '<div class="empty">Nothing shared online yet.</div>';
  } catch { grid.innerHTML = '<div class="empty">Online isles are unavailable right now.</div>'; }
}
$('#selectList').addEventListener('click', e => {
  const c = e.target.closest('.card'); if(!c) return;
  sfx.ui();
  const k = c.dataset.key;
  if(k.startsWith('o:')) nav('/isle/' + k.slice(2));
  else if(k.startsWith('c:')) nav('/c/' + k.slice(2));
  else nav('/i/' + k.slice(2));
});
document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => { nav(b.dataset.tab === 'official' ? '/play' : '/community'); });
$('#btnContinue').onclick = () => { const next = official.find(e => !progress[e.key]) || official[0]; nav('/isle/' + next.doc.id); };

/* ---------------- play ---------------- */
function play(entry){
  const { ok, errors, level } = parseIsle(entry.doc);
  if(!ok){ toast('This isle is broken: ' + errors[0].text, true); nav('/play'); return; }
  stopGame();
  current = entry;
  world.setShowcase(false); world.view = 0; world.turn(0);
  world.load(level, entry.doc.theme); world.pip.group.visible = true;
  setAccent(entry.doc.theme);
  if(!entry.par){ const r = solveIsle(level, { maxStates:200000 }); entry.par = r.solvable ? r.par : 0; entry.solution = r.solution || ''; }
  game = new Session(world, level, entry, { onChange:hud, onWin:won, onEffort:addEffort });
  freeHints = 1;
  $('#hudName').textContent = entry.name;
  $('#hudSub').innerHTML = entry.author ? `by <a href="https://github.com/${esc(entry.author)}" target="_blank" rel="noopener" style="color:inherit">@${esc(entry.author)}</a>` : esc(entry.sub || '');
  $('#statPar').textContent = entry.par || '–';
  $('#statKeysWrap').style.display = level.keys.length ? '' : 'none';
  $('#btnSolution').disabled = !entry.par;
  $('#keystrip').classList.remove('on');
  const ht = $('#hintText');
  if(entry.hint){ ht.textContent = entry.hint; ht.style.opacity = 1; ht.style.display = ''; clearTimeout(play.ht); play.ht = setTimeout(() => ht.style.opacity = 0, 9000); }
  else ht.style.display = 'none';
  show('game'); syncTopbar(); hud(game);
}
function stopGame(){ if(game){ game.stopReplay(); game = null; } modal.close(); }
function hud(s){
  if(s !== game) return;
  $('#statMoves').textContent = s.moves;
  $('#statKeys').textContent = s.state.keys;
  $('#btnSolution').innerHTML = s.replaying ? '■<span class="lbl"> Stop</span>' : unlocked(current) ? '▶<span class="lbl"> Solution</span>' : '🔒<span class="lbl"> Solution</span>';
  $('#btnUndo').disabled = !s.history.length || s.replaying;
}
world.onFrame = () => { if(game && settings.timer) $('#statTime').textContent = fmtTime(game.time); };
const fmtTime = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

function won(s){
  const e = current, stars = starsFor(s.moves, e.par);
  const prev = progress[e.key];
  if(!e.draft){
    const best = { stars:Math.max(stars, prev?.stars || 0), moves:Math.min(s.moves, prev?.moves ?? Infinity), time:settings.timer ? Math.min(s.time, prev?.time ?? Infinity) : prev?.time };
    progress[e.key] = best; store.set('klarbase.v2.progress', progress);
  }
  const next = e.index != null ? official[e.index + 1] : null;
  modal.open(`<h2>Isle cleared!</h2>
    <div class="big-stars">${[0, 1, 2].map(i => `<span class="${i < stars ? 'lit' : ''}" style="animation-delay:${0.15 + i * 0.18}s">★</span>`).join('')}</div>
    <div class="facts">${s.moves} moves · par ${e.par || '?'}${settings.timer ? ' · ' + fmtTime(s.time) : ''}${s.hintsUsed ? ` · ${s.hintsUsed} hint${s.hintsUsed > 1 ? 's' : ''}` : ''}</div>
    ${stars < 3 && e.par ? `<div class="facts" style="font-weight:600;margin-top:4px">The smart route takes ${e.par} moves — watch it?</div>` : ''}
    <div class="row">
      ${next ? `<button class="btn primary" id="wNext">Next isle ▶</button>` : ''}
      ${e.draft ? `<button class="btn primary" id="wBuild">Back to builder</button>` : ''}
      <button class="btn" id="wAgain">⟲ Again</button>
      ${e.par && unlocked(e) ? `<button class="btn" id="wWatch">▶ Watch solution</button>` : ''}
      ${e.online ? `<button class="btn" id="wShare">🔗 Copy link</button>` : ''}
      ${!e.draft ? `<button class="btn ghost" id="wList">All isles</button>` : ''}
    </div>`);
  $('#wNext') && ($('#wNext').onclick = () => { nav('/isle/' + next.doc.id); });
  $('#wBuild') && ($('#wBuild').onclick = () => { nav('/create'); });
  $('#wAgain').onclick = () => { modal.close(); game.restart(); };
  $('#wWatch') && ($('#wWatch').onclick = () => { modal.close(); watch(); });
  $('#wShare') && ($('#wShare').onclick = () => navigator.clipboard.writeText(location.href).then(() => toast('Link copied')));
  $('#wList') && ($('#wList').onclick = () => { nav(e.author ? '/community' : '/play'); });
}

// screen arrow for a world move in the current view — keeps hints & replays readable after turning
const ARROW_GLYPH = { up:'↑', right:'→', down:'↓', left:'←' };
function glyphFor(move){
  if(move === 'X') return '⎵';
  for(const a of ['up', 'right', 'down', 'left']) if(world.arrowToMove(a) === move) return ARROW_GLYPH[a];
  return move;
}
/* ---------------- earned solutions ---------------- */
// The smart solution is earned, not handed out. It unlocks for an isle when you
// are signed in, OR you've cleared that isle, OR you've put in real effort on it
// — only time spent actively moving counts (idle gaps are ignored), plus a
// minimum number of moves. A soft gate by design: the engine ships a solver and
// the repo is open source; the point is to protect the "aha" for players who try.
const EFFORT = { seconds:180, minMoves:30, parMult:3 };
const effort = store.get('klarbase.v2.effort', {});
let freeHints = 1;
const effortNeed = e => ({ t:EFFORT.seconds, m:Math.max(EFFORT.minMoves, (e?.par || 10) * EFFORT.parMult) });
function unlocked(e){
  if(!e) return false;
  if(session || progress[e.key]) return true;
  const f = effort[e.key], need = effortNeed(e);
  return !!f && f.t >= need.t && f.m >= need.m;
}
function addEffort(dt){
  if(!current || current.draft) return;
  const was = unlocked(current), f = effort[current.key] ||= { t:0, m:0 };
  f.t += dt; f.m += 1; store.set('klarbase.v2.effort', effort);
  if(!was && unlocked(current)){ toast('🔓 You’ve earned the solution for this isle'); hud(game); }
}
function lockModal(what = 'solution'){
  const e = current, f = effort[e.key] || { t:0, m:0 }, need = effortNeed(e);
  const bar = (v, max) => `<div style="height:8px;border-radius:99px;background:rgba(42,34,56,.08);overflow:hidden;margin:4px 0 10px"><div style="height:100%;width:${Math.min(100, v / max * 100)}%;background:var(--accent)"></div></div>`;
  modal.open(`<h2>🔒 Earn the ${what}</h2>
    <p class="facts" style="font-weight:600">Smart routes are for players who've tried. Unlock this isle's ${what} any of three ways:</p>
    <div class="rules">
      <div><span class="ico">🔑</span><span><b>Sign in</b> — GitHub or Google. Contributors already have it.</span></div>
      <div><span class="ico">⭐</span><span><b>Clear the isle</b> — then compare your route with the smart one.</span></div>
      <div><span class="ico">🐣</span><span style="flex:1"><b>Keep exploring</b> — time spent actually moving counts.
        <div style="font-size:12.5px;margin-top:6px">${fmtTime(Math.min(f.t, need.t))} / ${fmtTime(need.t)} active play</div>${bar(f.t, need.t)}
        <div style="font-size:12.5px">${Math.min(f.m, need.m)} / ${need.m} moves</div>${bar(f.m, need.m)}</span></div>
    </div>
    <div class="row">${session ? '' : '<button class="btn primary" id="siGh">Sign in with GitHub</button><button class="btn" id="siGo">Google</button>'}
      <button class="btn ghost" onclick="document.getElementById('modal').classList.remove('on')">Keep playing</button></div>`);
}

function watch(){
  if(!game || !current.par) return;
  if(game.replaying){ game.stopReplay(); $('#keystrip').classList.remove('on'); return; }
  if(!unlocked(current)) return lockModal('solution');
  if(!current.solution){ const r = solveIsle(game.level, { maxStates:200000 }); current.solution = r.solution || ''; if(!r.solvable) return; }   // shared isles: solve locally once earned
  const strip = $('#keystrip');
  strip.innerHTML = [...current.solution].map(m => `<span class="k">${glyphFor(m)}</span>`).join('');
  strip.classList.add('on');
  game.replay(current.solution, i => {
    [...strip.children].forEach((k, j) => { k.className = 'k' + (j < i ? ' done' : j === i ? ' now' : ''); });
    if(i < 0) setTimeout(() => strip.classList.remove('on'), 600);
  });
}
function hint(){
  if(!game || game.won || game.replaying) return;
  if(!unlocked(current) && freeHints <= 0) return lockModal('hints');
  if(!unlocked(current)) freeHints--;
  const h = game.hint();
  if(!h) return;
  if(h.stuck) toast('Hmm — this spot can’t reach the goal any more. Undo or restart.', true);
  else toast((h.move === 'X' ? `Best next move: pull the lever (Space) · ${h.left} to go` : `Best next move: ${glyphFor(h.move)} · ${h.left} to go`) + (unlocked(current) ? '' : ' · that was your free hint'));
}
$('#btnBack').onclick = () => { nav(current?.draft ? '/create' : current?.author ? '/community' : current?.online ? '/community' : '/play'); };
$('#btnUndo').onclick = () => game && game.undo();
$('#btnRestart').onclick = () => game && game.restart();
$('#btnHint').onclick = hint;
$('#btnSolution').onclick = watch;
$('#btnTurn').onclick = () => { world.turn(1); sfx.ui(); };

/* ---------------- input ---------------- */
const KEYS = { ArrowUp:'up', ArrowDown:'down', ArrowLeft:'left', ArrowRight:'right', w:'up', s:'down', a:'left', d:'right', W:'up', S:'down', A:'left', D:'right' };
addEventListener('keydown', e => {
  unlockAudio();
  if(/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) return;
  if(e.key === 'Escape'){ if($('#modal').classList.contains('on')) return modal.close(); if(game?.replaying) return watch(); if(game) return $('#btnBack').click(); }
  if(!game || $('#modal').classList.contains('on')) return;
  if(KEYS[e.key]){ e.preventDefault(); game.input(world.arrowToMove(KEYS[e.key])); return; }
  switch(e.key){
    case ' ': case 'Enter': case 'x': case 'X': e.preventDefault(); game.input('X'); break;
    case 'z': case 'Z': case 'Backspace': e.preventDefault(); game.undo(); break;
    case 'r': case 'R': game.restart(); break;
    case 'h': case 'H': hint(); break;
    case 'q': case 'Q': world.turn(-1); break;
    case 'e': case 'E': world.turn(1); break;
  }
});
document.querySelectorAll('.dpad [data-arrow]').forEach(b => b.addEventListener('pointerdown', e => {
  e.preventDefault(); unlockAudio(); if(!game) return;
  const a = b.dataset.arrow; game.input(a === 'use' ? 'X' : world.arrowToMove(a));
}));
let swipe = null;
$('#stage').addEventListener('pointerdown', e => { unlockAudio(); swipe = { x:e.clientX, y:e.clientY }; });
$('#stage').addEventListener('pointerup', e => {
  if(!swipe || !game) return; const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y; swipe = null;
  if(Math.max(Math.abs(dx), Math.abs(dy)) < 28) return;
  game.input(world.arrowToMove(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up')));
});
addEventListener('pointerdown', () => unlockAudio(), { once:true });

/* ---------------- builder ---------------- */
const builder = mountBuilder({ world, api, toast, repoUrl:REPO_URL, communityHashes, getSession:() => session, canSeeSolutions:() => !!session,
  onTest:doc => { play({ key:'draft', doc, name:doc.name, theme:doc.theme, par:doc.par, solution:doc.solution, sub:'testing your isle', draft:true }); } });

/* ---------------- routing ---------------- */
// Real paths (/isle/root-bridge), not #/ hashes. The server answers every path with
// index.html; old #/ links (shared before the switch) are rewritten on arrival.
// In-game navigation REPLACES the address instead of adding history: the browser's
// Back leaves the game, the in-game back button moves between screens (player feedback).
function nav(path){
  if(path !== location.pathname) history.replaceState(null, '', path);
  route();
}
async function route(){
  if(location.hash.startsWith('#/')) history.replaceState(null, '', location.hash.slice(1));
  const h = location.pathname.replace(/\/+$/, '') || '/';
  let m;
  if(h === '/') return titleScreen();
  if(h === '/play') return selectScreen('official');
  if(h === '/community') return selectScreen('community');
  if(h === '/create'){ stopGame(); world.setShowcase(false); show('create'); builder.show(); setAccent(builder.draft.theme); return; }
  if((m = /^\/isle\/([\w-]+)$/.exec(h))){ const e = official.find(x => x.doc.id === m[1]); return e ? play(e) : nav('/play'); }
  if((m = /^\/c\/([\w-]+)\/([\w-]+)$/.exec(h))){ const e = community.find(x => x.author === m[1] && x.doc.id === m[2]); return e ? play(e) : nav('/community'); }
  if((m = /^\/(?:i|p)\/([0-9a-f]{64})$/.exec(h))){
    try {
      const r = await api('/puzzles/' + m[1]);
      if(r.puzzle.schemaVersion !== 5){ toast('That link is from an older version of Klarbase', true); nav('/community'); return; }
      return play({ key:'i:' + m[1], doc:{ ...r.puzzle, name:r.title }, name:r.title, theme:r.puzzle.theme, par:r.puzzle.par, solution:r.puzzle.solution, sub:'shared by ' + r.author.name, online:true });
    } catch { toast('That isle could not be found', true); nav('/community'); return; }
  }
  nav('/');
}
syncTopbar();
refreshAuth();
route();
