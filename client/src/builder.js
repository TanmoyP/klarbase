// The isle builder. Paint on a 2D grid, see the living isle update in 3D, and
// get an instant verdict from the solver. The "Isle code" box is the exact
// text format a person, a builder bot, or a GitHub PR uses — edit either side.
import {
  parseIsle, solveIsle, initialState, THEMES as THEME_NAMES, MAX_W, MAX_H, MAX_LEVEL,
  CURATED_ISLES, toCommunityFile, checkCommunityIsle, isleHash, ISLE_SCHEMA, MAP_SCHEMA, MAX_STOREYS, MAX_AT, MAX_ALT, TILES,
  TIERS, auditIsle, difficultyScore, provisionalTier, harderHints, gutMismatch,
} from '@klar/core';
import { themeOf, PORTAL_COLORS } from './game/themes.js';
import { sfx } from './game/audio.js';

const TOOLS = [
  ['.', '▢', 'Ground'], [',', '🌼', 'Flowers'], ['#', '🪨', 'Rock'], ['T', '🌳', 'Tree'], ['~', '🌊', 'Water'], ['*', '🧊', 'Ice'],
  ['ramp', '⬆', 'Ramp'], ['C', '📦', 'Crate'], ['o', '◎', 'Plate'], ['D', '▥', 'Gate'], ['L', '🕹', 'Lever'], ['=', '═', 'Bridge'],
  ['_', '┄', 'Sunk br.'], ['k', '🔑', 'Key'], ['K', '🚪', 'Door'], ['p', '⛩', 'Arch A'], ['q', '⛩', 'Arch B'], ['S', '🐣', 'Start'],
  ['G', '⭐', 'Goal'], ['-', '✕', 'Erase'], ['^+', '▲', 'Raise'], ['^h', '▼', 'Lower'],
  ['a', '⚖', 'Pan A'], ['b', '⚖', 'Pan B'], ['r', '⛩', 'Arch C'],     // maps only (schemaVersion 6)
  ['B', '🎈', 'Balloon'], ['P', '🥌', 'Stones'], ['u', '🛟', 'Buoy'], ['vent', '⇑', 'Vent'], ['+', '🌱', 'Seed'],   // Weight II (maps only)
  ['H', '🪨', 'Boulder ↔'], ['I', '🪨', 'Boulder ↕'], ['Y', '🌵', 'Thorns'],   // cozy hazards (maps only)
];
const RAMP_DIRS = ['^', '>', 'v', '<'], RAMP_ARROW = { '^':'⬆', '>':'➡', 'v':'⬇', '<':'⬅' };
const VENT_DIRS = ['n', 'e', 's', 'w'], VENT_ARROW = { n:'⇑', e:'⇒', s:'⇓', w:'⇐' };
const GLYPH = { ',':'🌼', '#':'🪨', 'T':'🌳', 'C':'📦', 'o':'◎', 'D':'▥', 'L':'🕹', '=':'═', '_':'┄', 'k':'🔑', 'K':'🚪', 'p':'⛩', 'q':'⛩', 'r':'⛩', 'S':'🐣', 'G':'⭐', '*':'', 'a':'A', 'b':'B', 'B':'🎈', 'P':'🥌', 'u':'🛟', '+':'🌱', 'H':'↔', 'I':'↕', 'Y':'🌵' };
const store = { get:(k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }, set:(k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };

const template = () => ({ name:'My isle', theme:'jungle', rows:[
  '-  .  .  G  .  .  -', '.  .  .  .  .  .  .', '.  .  ,  .  T  .  .', '.  .  .  .  .  .  .',
  '.  T  .  .  .  ,  .', '.  .  .  .  .  .  .', '-  .  .  S  .  .  -' ] });

export function mountBuilder({ world, onTest, api, getSession, toast, repoUrl, communityHashes, canSeeSolutions = () => false }){
  const root = document.getElementById('builderPanel');
  let draft = store.get('klarbase.v2.draft', null) || template();
  let grid = [], tool = '.', rampDir = 0, ventDir = 0, painting = false, stroke = new Set(), last = null, verdict = null;
  const fromRows = rows => rows.map(r => r.trim().split(/\s+/).map(t => [t[0], t.length > 1 ? +t[1] : 0]));
  const toRows = (g = grid) => g.map(r => r.map(([c, h]) => (h ? c + h : c).padEnd(2)).join(' ').trimEnd());
  // Archipelago maps (K4): the draft holds 1–3 storeys; `grid` is the one being painted.
  let storeys = [], cur = 0;
  const loadDraft = d => { storeys = (d.storeys || [{ rows:d.rows, at:[0, 0, 0] }]).map(s => ({ grid:fromRows(s.rows), at:s.at.slice() })); cur = 0; grid = storeys[0].grid; };
  // The isle document: a plain v5 isle unless it needs a map (several storeys, an offset, pans or arch C).
  const docOf = () => {
    const st = storeys.map(s => ({ rows:toRows(s.grid), at:s.at.slice() }));
    const map = st.length > 1 || st[0].at.some(Boolean) || storeys.some(s => s.grid.some(r => r.some(([c]) => TILES[c] && TILES[c].v6)));
    const tier = draft.tier ? { tier:draft.tier } : {};      // the maker's gut call — presentation, never hashed
    return map ? { schemaVersion:MAP_SCHEMA, name:draft.name, theme:draft.theme, storeys:st, ...tier } : { schemaVersion:ISLE_SCHEMA, name:draft.name, theme:draft.theme, rows:st[0].rows, ...tier };
  };
  loadDraft(draft);

  root.innerHTML = `
    <div class="field"><label>Name</label><input id="bName" maxlength="40"></div>
    <div class="field"><label>Theme</label><div class="chips" id="bThemes"></div></div>
    <div class="field"><label>Difficulty — your gut call</label><div class="chips" id="bTiers"></div></div>
    <div class="field"><label>Start from</label><select id="bTemplate"><option value="">— keep my isle —</option><option value="blank">Fresh 7×7 meadow</option>
      ${CURATED_ISLES.map(i => `<option value="${i.id}">Remix: ${i.name}</option>`).join('')}</select></div>
    <div class="size"><span>Size</span>
      <button data-size="w-">−</button><span id="bW"></span><button data-size="w+">+</button><span>×</span>
      <button data-size="h-">−</button><span id="bH"></span><button data-size="h+">+</button>
      <span class="erase-note" style="margin-left:auto;color:var(--ink-3);font-size:12px">right-click erases</span></div>
    <div class="field"><label>Map — up to ${MAX_STOREYS} isles, linked by gateway arches</label><div class="chips" id="bStoreys"></div>
      <div class="size" id="bAt" style="margin-top:6px"><span>at</span>
        <label>x <input type="number" min="0" max="${MAX_AT}" data-at="0" style="width:52px"></label><label>z <input type="number" min="0" max="${MAX_AT}" data-at="1" style="width:52px"></label>
        <label>altitude <input type="number" min="0" max="${MAX_ALT}" data-at="2" style="width:52px"></label></div>
      <div class="note" id="bGates" style="display:none;margin-top:6px"></div></div>
    <div class="palette" id="bTools"></div>
    <canvas id="gridCanvas"></canvas>
    <div class="status" id="bStatus">…</div>
    <div class="diff" id="bDiff" style="display:none"></div>
    <div class="row-btns">
      <button class="btn primary" id="bTest">▶ Test it</button>
      <button class="btn" id="bCheck">✓ Deep check</button>
      <button class="btn" id="bShare">☁ Share online</button>
    </div>
    <div class="field"><label>Isle code — the text format (edit me too)</label><textarea id="bCode" spellcheck="false"></textarea></div>
    <div class="field"><label>Contribute to the official repo</label>
      <input id="bAuthor" placeholder="your GitHub username">
      <div class="row-btns" style="margin-top:6px">
        <button class="btn small" id="bGithub">⤓ Export for GitHub</button>
        <button class="btn small ghost" id="bExport">⤓ JSON</button>
        <button class="btn small ghost" id="bImport">⤒ Import</button>
      </div>
      <div class="note" id="bGithubNote" style="display:none"></div>
    </div>
    <input type="file" id="bFile" accept="application/json,.json" hidden>`;
  const $ = s => root.querySelector(s);
  const canvas = $('#gridCanvas'), g2 = canvas.getContext('2d');
  $('#bAuthor').value = store.get('klarbase.v2.ghuser', '');

  // ---- palette & theme chips ----
  const tools = $('#bTools');
  for(const [id, ico, label] of TOOLS){
    const b = document.createElement('button'); b.className = 'tool'; b.dataset.tool = id;
    b.innerHTML = `<span>${ico}</span><small>${label}</small>`; b.title = label + (id === 'ramp' ? ' (click again or press R to turn)' : id === 'vent' ? ' (click again to turn the gust)' : '');
    b.onclick = () => { if(id === 'ramp' && tool === 'ramp') rampDir = (rampDir + 1) % 4; if(id === 'vent' && tool === 'vent') ventDir = (ventDir + 1) % 4; tool = id; syncTools(); sfx.ui(); };
    tools.appendChild(b);
  }
  const syncTools = () => {
    for(const b of tools.children){ b.classList.toggle('on', b.dataset.tool === tool); if(b.dataset.tool === 'ramp') b.firstChild.textContent = RAMP_ARROW[RAMP_DIRS[rampDir]]; if(b.dataset.tool === 'vent') b.firstChild.textContent = VENT_ARROW[VENT_DIRS[ventDir]]; }
  };
  const themes = $('#bThemes');
  for(const t of THEME_NAMES){ const c = document.createElement('button'); c.className = 'chip'; c.dataset.theme = t; c.textContent = themeOf(t).label; c.onclick = () => { draft.theme = t; changed(); }; themes.appendChild(c); }
  // The gut call (K3): saved in the isle file as `tier`; players' results take over as plays come in.
  const tiers = $('#bTiers');
  for(const t of [{ id:'', name:'Not sure' }, ...TIERS]){
    const c = document.createElement('button'); c.className = 'chip'; c.dataset.tier = t.id; c.textContent = t.name;
    c.onclick = () => { if(t.id) draft.tier = t.id; else delete draft.tier; store.set('klarbase.v2.draft', draft); syncTiers(); showDifficulty(); sfx.ui(); };
    tiers.appendChild(c);
  }
  const syncTiers = () => { for(const c of tiers.children) c.classList.toggle('on', c.dataset.tier === (draft.tier || '')); };

  // ---- painting ----
  const cellAt = ev => {
    const r = canvas.getBoundingClientRect(), w = grid[0].length, h = grid.length;
    const cs = r.width / w, x = Math.floor((ev.clientX - r.left) / cs), z = Math.floor((ev.clientY - r.top) / cs);
    return x >= 0 && z >= 0 && x < w && z < h ? [x, z] : null;
  };
  const apply = ([x, z], erase) => {
    const key = x + ',' + z; if(stroke.has(key)) return; stroke.add(key);
    const cell = grid[z][x];
    if(erase || tool === '-'){ grid[z][x] = ['-', 0]; return; }
    if(tool === '^+'){ if(cell[0] !== '-') cell[1] = Math.min(MAX_LEVEL, cell[1] + 1); return; }
    if(tool === '^h'){ if(cell[0] !== '-') cell[1] = Math.max(0, cell[1] - 1); return; }
    if(tool === 'S') for(const s of storeys) for(const row of s.grid) for(const c of row) if(c[0] === 'S') c[0] = '.';
    grid[z][x] = [tool === 'ramp' ? RAMP_DIRS[rampDir] : tool === 'vent' ? VENT_DIRS[ventDir] : tool, cell[0] === '-' ? 0 : cell[1]];
  };
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('pointerdown', e => { const c = cellAt(e); if(!c) return; painting = e.button === 2 ? 'erase' : 'paint'; stroke = new Set(); canvas.setPointerCapture(e.pointerId); apply(c, painting === 'erase'); changed(); });
  canvas.addEventListener('pointermove', e => { const c = cellAt(e); last = c; if(painting && c){ apply(c, painting === 'erase'); changed(); } else draw(); });
  canvas.addEventListener('pointerup', () => { painting = false; });
  canvas.addEventListener('pointerleave', () => { last = null; draw(); });

  function draw(){
    const w = grid[0].length, h = grid.length, T = themeOf(draft.theme);
    const cssW = canvas.clientWidth || 360, cs = Math.floor(cssW / w), dpr = Math.min(devicePixelRatio, 2);
    canvas.style.height = cs * h + 'px'; canvas.width = cs * w * dpr; canvas.height = cs * h * dpr;
    g2.setTransform(dpr, 0, 0, dpr, 0, 0); g2.clearRect(0, 0, cs * w, cs * h);
    g2.textAlign = 'center'; g2.textBaseline = 'middle';
    for(let z = 0; z < h; z++) for(let x = 0; x < w; x++){
      const [c, hh] = grid[z][x], px = x * cs, pz = z * cs;
      if(c === '-'){ g2.strokeStyle = 'rgba(42,34,56,.12)'; g2.setLineDash([3, 3]); g2.strokeRect(px + 2.5, pz + 2.5, cs - 5, cs - 5); g2.setLineDash([]); continue; }
      let fill = T.top;
      if(c === '~' || c === '=' || c === '_') fill = T.water; else if(c === '*') fill = T.ice; else if(c === '#') fill = T.rock;
      g2.fillStyle = fill; roundRect(g2, px + 1.5, pz + 1.5, cs - 3, cs - 3, 6); g2.fill();
      if(hh){ g2.fillStyle = `rgba(255,255,255,${0.08 * hh})`; roundRect(g2, px + 1.5, pz + 1.5, cs - 3, cs - 3, 6); g2.fill(); g2.fillStyle = 'rgba(42,34,56,.75)'; g2.font = `800 ${Math.max(9, cs * 0.28)}px Nunito`; g2.fillText(hh, px + cs - cs * 0.2, pz + cs - cs * 0.22); }
      const glyph = RAMP_ARROW[c] || VENT_ARROW[c] || GLYPH[c];
      if(glyph){
        g2.font = `${Math.floor(cs * 0.55)}px "Segoe UI Emoji","Apple Color Emoji",sans-serif`;
        if(c === 'p' || c === 'q' || c === 'r'){ g2.fillStyle = PORTAL_COLORS[c]; g2.beginPath(); g2.arc(px + cs / 2, pz + cs / 2, cs * 0.3, 0, Math.PI * 2); g2.fill(); g2.fillStyle = '#fff'; g2.font = `800 ${cs * 0.34}px Nunito`; g2.fillText({ p:'A', q:'B', r:'C' }[c], px + cs / 2, pz + cs / 2 + 1); }
        else if(c === 'a' || c === 'b'){ g2.fillStyle = T.woodDark; roundRect(g2, px + cs * 0.14, pz + cs * 0.14, cs * 0.72, cs * 0.72, 5); g2.fill(); g2.fillStyle = '#fff'; g2.font = `800 ${cs * 0.3}px Nunito`; g2.fillText('⚖' + glyph, px + cs / 2, pz + cs / 2 + 1); }
        else { g2.fillStyle = c === '_' ? 'rgba(255,255,255,.55)' : '#3a2a20'; g2.fillText(glyph, px + cs / 2, pz + cs / 2 + 1); }
      }
    }
    if(last){ g2.strokeStyle = '#2a2238'; g2.lineWidth = 2; roundRect(g2, last[0] * cs + 1.5, last[1] * cs + 1.5, cs - 3, cs - 3, 6); g2.stroke(); g2.lineWidth = 1; }
  }
  function roundRect(g, x, y, w, h, r){ g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

  // ---- change pipeline: grid -> draft -> code/preview/verdict ----
  let previewT = 0, verdictT = 0;
  function changed({ fromCode = false } = {}){
    draft.name = $('#bName').value.trim() || 'My isle';
    const d = docOf(); delete draft.rows; delete draft.storeys;
    if(d.storeys) draft.storeys = d.storeys; else draft.rows = d.rows;
    store.set('klarbase.v2.draft', draft);
    syncStoreys();
    for(const c of themes.children) c.classList.toggle('on', c.dataset.theme === draft.theme); syncTiers();
    $('#bW').textContent = grid[0].length; $('#bH').textContent = grid.length;
    if(!fromCode && document.activeElement !== $('#bCode')) $('#bCode').value = toRows().join('\n');
    draw();
    clearTimeout(previewT); previewT = setTimeout(preview, 90);
    clearTimeout(verdictT); verdictT = setTimeout(() => judge(60000), 260);
  }
  function preview(){
    const { level } = parseIsle(docOf());
    if(!level) return;
    world.load(level, draft.theme, { storey:cur });
    if(level.start != null){ world.pip.group.visible = true; world.reset(initialState(level)); } else world.pip.group.visible = false;
  }
  function judge(budget){
    const st = $('#bStatus'), { ok, errors, level } = parseIsle(docOf());
    if(!ok){ verdict = null; st.className = 'status bad'; st.textContent = '✗ ' + [...new Set(errors.map(e => e.text))].slice(0, 2).join(' · '); return; }
    const r = solveIsle(level, { maxStates:budget });
    verdict = r; audit = null; clearTimeout(auditT);
    if(r.solvable){ st.className = 'status ok'; st.textContent = `✓ Solvable in ${r.par} moves` + (canSeeSolutions() ? ` · ${r.solution.length > 28 ? r.solution.slice(0, 28) + '…' : r.solution}` : ' · sign in to see the route');
      auditT = setTimeout(() => { audit = auditIsle(level, { maxStates:Math.min(budget, 200000) }); showDifficulty(); }, 60); }
    else if(r.capped){ st.className = 'status'; st.textContent = '… big isle — press “Deep check” to verify'; }
    else { st.className = 'status bad'; st.textContent = '✗ Not solvable yet — no path reaches a goal'; }
    showDifficulty();
  }

  // Live difficulty (K3) + optional "make it harder" hints (K2). A catch is never required.
  let audit = null, auditT = 0;
  function showDifficulty(){
    const box = $('#bDiff');
    if(!verdict || !verdict.solvable || !audit){ box.style.display = 'none'; return; }
    box.style.display = '';
    if(audit.capped){ box.innerHTML = `<div>Difficulty: too many positions to map live — press “Deep check”.</div>`; return; }
    const d = difficultyScore({ tier:draft.tier, audit }), a = provisionalTier(audit);
    const warn = gutMismatch(draft.tier, audit), hints = harderHints(audit);
    box.innerHTML = `<div><span class="tier t-${d.tier.id}">${d.tier.name} ${d.score}</span> · ${d.declared ? 'your gut call' : 'estimated from the solver'} · settles as people play</div>
      <div style="font-weight:600">Solver audit: ${audit.states.toLocaleString()} positions · ${audit.traps} trap${audit.traps === 1 ? '' : 's'} · ${audit.routes > 999 ? 'many' : audit.routes} shortest route${audit.routes === 1 ? '' : 's'} · walking straight at the star ${audit.greedy ? 'wins' : 'fails'} → reads <b>${a.name}</b></div>
      ${warn ? `<div class="warn">⚠ ${esc(warn)}</div>` : ''}
      ${hints.length ? `<div>Make it harder (optional):<ul>${hints.map(h => `<li>${esc(h)}</li>`).join('')}</ul></div>` : ''}`;
  }

  // ---- controls ----
  $('#bName').value = draft.name;
  $('#bName').addEventListener('input', () => changed());
  root.querySelectorAll('[data-size]').forEach(b => b.onclick = () => {
    const [axis, d] = [b.dataset.size[0], b.dataset.size[1] === '+' ? 1 : -1];
    if(axis === 'w'){ const n = grid[0].length + d; if(n < 3 || n > MAX_W) return; grid.forEach(r => d > 0 ? r.push(['.', 0]) : r.pop()); }
    else { const n = grid.length + d; if(n < 3 || n > MAX_H) return; if(d > 0) grid.unshift(grid[0].map(() => ['.', 0])); else grid.shift(); }
    changed();
  });
  $('#bTemplate').onchange = e => {
    const v = e.target.value; if(!v) return;
    const src = v === 'blank' ? template() : CURATED_ISLES.find(i => i.id === v);
    draft = { name:v === 'blank' ? 'My isle' : src.name + ' remix', theme:src.theme, ...(src.storeys ? { storeys:src.storeys } : { rows:src.rows.slice() }) };
    loadDraft(draft); $('#bName').value = draft.name; e.target.value = ''; changed();
  };
  let codeT = 0;
  $('#bCode').addEventListener('input', () => {
    clearTimeout(codeT);
    codeT = setTimeout(() => {
      const rows = $('#bCode').value.split('\n').map(s => s.trim()).filter(Boolean);
      const d = docOf(); if(d.storeys) d.storeys[cur].rows = rows; else d.rows = rows;
      const r = parseIsle(d);
      if(!r.level){ $('#bStatus').className = 'status bad'; $('#bStatus').textContent = '✗ ' + r.errors[0].text; return; }
      grid = storeys[cur].grid = fromRows(rows); changed({ fromCode:true });
    }, 350);
  });
  $('#bCheck').onclick = () => { $('#bStatus').textContent = 'checking…'; setTimeout(() => judge(300000), 30); };
  $('#bTest').onclick = () => {
    const doc = docOf(), { ok, errors } = parseIsle(doc);
    if(!ok) return toast(errors[0].text, true);
    onTest({ ...doc, par:verdict && verdict.solvable ? verdict.par : 0, solution:verdict && verdict.solvable ? verdict.solution : '' });
  };
  $('#bShare').onclick = async () => {
    if(!getSession()) return toast('Sign in (top right) to share online', true);
    try {
      const r = await api('/puzzles', { method:'POST', body:{ title:draft.name, puzzle:docOf() } });
      const url = `${location.origin}/i/${r.hash}`;
      await navigator.clipboard.writeText(url).catch(() => {});
      toast(r.deduped ? 'Already shared — link copied' : 'Shared! Link copied to clipboard');
    } catch(e){ toast(e.validation ? e.validation[0].text : e.message, true); }
  };
  $('#bGithub').onclick = () => {
    const author = $('#bAuthor').value.trim().replace(/^@/, '');
    store.set('klarbase.v2.ghuser', author);
    const note = $('#bGithubNote'); note.style.display = 'block';
    if(!author){ note.innerHTML = 'Add your GitHub username — it becomes your credit on the isle.'; return; }
    const file = toCommunityFile(docOf(), author);
    const existing = new Map([...CURATED_ISLES.map(i => [isleHash(i), `official isle “${i.name}”`]), ...communityHashes()]);
    const v = checkCommunityIsle(file, { existing });
    if(!v.ok){ note.innerHTML = '<b>Not ready yet — the repo checks would reject it:</b><br>• ' + v.errors.map(esc).join('<br>• '); return; }
    download(`${file.id}.json`, JSON.stringify(file, null, 2) + '\n');
    note.innerHTML = `✓ Passes every check (par ${file.par}, uses ${v.report.mechanics.join(', ')}).<br>
      Add it to <code>isles/community/${esc(author)}/${file.id}.json</code> and open a pull request —
      <a href="${repoUrl}/blob/main/CONTRIBUTING.md" target="_blank" rel="noopener">how to contribute</a>.`;
  };
  $('#bExport').onclick = () => download(`${(draft.name || 'isle').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`,
    JSON.stringify(docOf(), null, 2) + '\n');
  $('#bImport').onclick = () => $('#bFile').click();
  $('#bFile').onchange = e => {
    const f = e.target.files[0]; if(!f) return;
    f.text().then(t => {
      try {
        const d = JSON.parse(t); const r = parseIsle(d);
        if(!r.level) throw new Error(r.errors[0].text);
        draft = { name:d.name || 'Imported isle', theme:d.theme || 'jungle', ...(d.storeys ? { storeys:d.storeys } : { rows:d.rows }), ...(TIERS.some(t => t.id === d.tier) ? { tier:d.tier } : {}) }; loadDraft(draft);
        $('#bName').value = draft.name; changed(); toast('Isle imported');
      } catch(err){ toast('Could not import: ' + err.message, true); }
    });
    e.target.value = '';
  };

  function download(name, text){ const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type:'application/json' })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));

  // ---- storeys: tabs, add / remove, offset + altitude, gateway summary ----
  function syncStoreys(){
    const bar = $('#bStoreys');
    bar.innerHTML = storeys.map((_, k) => `<button class="chip${k === cur ? ' on' : ''}" data-storey="${k}">Isle ${k + 1}</button>`).join('')
      + (storeys.length < MAX_STOREYS ? '<button class="chip" data-storey="add">＋ Isle</button>' : '')
      + (storeys.length > 1 ? `<button class="chip" data-storey="del">✕ Remove isle ${cur + 1}</button>` : '');
    $('#bAt').style.display = storeys.length > 1 || storeys[0].at.some(Boolean) ? '' : 'none';
    root.querySelectorAll('[data-at]').forEach(i => { if(document.activeElement !== i) i.value = storeys[cur].at[+i.dataset.at]; });
    // gateways: an arch letter whose two arches sit on different isles
    const { level } = parseIsle(docOf()), notes = [];
    if(level) for(const [u, v] of Object.entries(level.twin)) if(+u < v && level.cells[u].gateway)
      notes.push(`Arch ${{ p:'A', q:'B', r:'C' }[level.cells[u].ch]} is a gateway: isle ${level.sid[u] + 1} ↔ isle ${level.sid[v] + 1}`);
    if(level && level.pans) notes.push(level.sid[level.pans.a[0]] === level.sid[level.pans.b[0]] ? 'Sky Scales: pans A and B share one vine' : `Sky Scales across isles ${level.sid[level.pans.a[0]] + 1} and ${level.sid[level.pans.b[0]] + 1}`);
    $('#bGates').style.display = notes.length ? '' : 'none'; $('#bGates').textContent = notes.join(' · ');
  }
  $('#bStoreys').onclick = e => {
    const b = e.target.closest('[data-storey]'); if(!b) return;
    const v = b.dataset.storey;
    if(v === 'add'){
      const x = Math.min(MAX_AT, Math.max(...storeys.map(s => s.at[0] + s.grid[0].length)) + 1);
      storeys.push({ grid:fromRows(['. . . . .', '. . . . .', '. . . . .', '. . . . .', '. . . . .']), at:[x, 0, Math.min(MAX_ALT, 4)] });
      cur = storeys.length - 1;
    } else if(v === 'del'){ storeys.splice(cur, 1); cur = Math.max(0, cur - 1); }
    else cur = +v;
    grid = storeys[cur].grid; sfx.ui(); changed();
  };
  root.querySelectorAll('[data-at]').forEach(i => i.addEventListener('input', () => {
    const n = Math.round(+i.value), max = i.dataset.at === '2' ? MAX_ALT : MAX_AT;
    if(Number.isFinite(n)){ storeys[cur].at[+i.dataset.at] = Math.max(0, Math.min(max, n)); changed(); }
  }));

  addEventListener('keydown', e => {
    if(!root.closest('.screen').classList.contains('on') || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
    if(e.key === 'r' || e.key === 'R'){ rampDir = (rampDir + 1) % 4; tool = 'ramp'; syncTools(); }
  });
  addEventListener('resize', () => draw());
  syncTools();

  return {
    show(){ changed(); },
    get draft(){ return draft; },
  };
}
