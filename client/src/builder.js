// The isle builder. Paint on a 2D grid, see the living isle update in 3D, and
// get an instant verdict from the solver. The "Isle code" box is the exact
// text format a person, a builder bot, or a GitHub PR uses — edit either side.
import {
  parseIsle, solveIsle, initialState, THEMES as THEME_NAMES, MAX_W, MAX_H, MAX_LEVEL,
  CURATED_ISLES, toCommunityFile, checkCommunityIsle, isleHash, ISLE_SCHEMA,
} from '@klar/core';
import { themeOf, PORTAL_COLORS } from './game/themes.js';
import { sfx } from './game/audio.js';

const TOOLS = [
  ['.', '▢', 'Ground'], [',', '🌼', 'Flowers'], ['#', '🪨', 'Rock'], ['T', '🌳', 'Tree'], ['~', '🌊', 'Water'], ['*', '🧊', 'Ice'],
  ['ramp', '⬆', 'Ramp'], ['C', '📦', 'Crate'], ['o', '◎', 'Plate'], ['D', '▥', 'Gate'], ['L', '🕹', 'Lever'], ['=', '═', 'Bridge'],
  ['_', '┄', 'Sunk br.'], ['k', '🔑', 'Key'], ['K', '🚪', 'Door'], ['p', '⛩', 'Arch A'], ['q', '⛩', 'Arch B'], ['S', '🐣', 'Start'],
  ['G', '⭐', 'Goal'], ['-', '✕', 'Erase'], ['+', '▲', 'Raise'], ['^h', '▼', 'Lower'],
];
const RAMP_DIRS = ['^', '>', 'v', '<'], RAMP_ARROW = { '^':'⬆', '>':'➡', 'v':'⬇', '<':'⬅' };
const GLYPH = { ',':'🌼', '#':'🪨', 'T':'🌳', 'C':'📦', 'o':'◎', 'D':'▥', 'L':'🕹', '=':'═', '_':'┄', 'k':'🔑', 'K':'🚪', 'p':'⛩', 'q':'⛩', 'S':'🐣', 'G':'⭐', '*':'' };
const store = { get:(k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }, set:(k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };

const template = () => ({ name:'My isle', theme:'jungle', rows:[
  '-  .  .  G  .  .  -', '.  .  .  .  .  .  .', '.  .  ,  .  T  .  .', '.  .  .  .  .  .  .',
  '.  T  .  .  .  ,  .', '.  .  .  .  .  .  .', '-  .  .  S  .  .  -' ] });

export function mountBuilder({ world, onTest, api, getSession, toast, repoUrl, communityHashes, canSeeSolutions = () => false }){
  const root = document.getElementById('builderPanel');
  let draft = store.get('klarbase.v2.draft', null) || template();
  let grid = [], tool = '.', rampDir = 0, painting = false, stroke = new Set(), last = null, verdict = null;
  const fromRows = rows => rows.map(r => r.trim().split(/\s+/).map(t => [t[0], t.length > 1 ? +t[1] : 0]));
  const toRows = () => grid.map(r => r.map(([c, h]) => (h ? c + h : c).padEnd(2)).join(' ').trimEnd());
  grid = fromRows(draft.rows);

  root.innerHTML = `
    <div class="field"><label>Name</label><input id="bName" maxlength="40"></div>
    <div class="field"><label>Theme</label><div class="chips" id="bThemes"></div></div>
    <div class="field"><label>Start from</label><select id="bTemplate"><option value="">— keep my isle —</option><option value="blank">Fresh 7×7 meadow</option>
      ${CURATED_ISLES.map(i => `<option value="${i.id}">Remix: ${i.name}</option>`).join('')}</select></div>
    <div class="size"><span>Size</span>
      <button data-size="w-">−</button><span id="bW"></span><button data-size="w+">+</button><span>×</span>
      <button data-size="h-">−</button><span id="bH"></span><button data-size="h+">+</button>
      <span class="erase-note" style="margin-left:auto;color:var(--ink-3);font-size:12px">right-click erases</span></div>
    <div class="palette" id="bTools"></div>
    <canvas id="gridCanvas"></canvas>
    <div class="status" id="bStatus">…</div>
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
    b.innerHTML = `<span>${ico}</span><small>${label}</small>`; b.title = label + (id === 'ramp' ? ' (click again or press R to turn)' : '');
    b.onclick = () => { if(id === 'ramp' && tool === 'ramp') rampDir = (rampDir + 1) % 4; tool = id; syncTools(); sfx.ui(); };
    tools.appendChild(b);
  }
  const syncTools = () => {
    for(const b of tools.children){ b.classList.toggle('on', b.dataset.tool === tool); if(b.dataset.tool === 'ramp') b.firstChild.textContent = RAMP_ARROW[RAMP_DIRS[rampDir]]; }
  };
  const themes = $('#bThemes');
  for(const t of THEME_NAMES){ const c = document.createElement('button'); c.className = 'chip'; c.dataset.theme = t; c.textContent = themeOf(t).label; c.onclick = () => { draft.theme = t; changed(); }; themes.appendChild(c); }

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
    if(tool === '+'){ if(cell[0] !== '-') cell[1] = Math.min(MAX_LEVEL, cell[1] + 1); return; }
    if(tool === '^h'){ if(cell[0] !== '-') cell[1] = Math.max(0, cell[1] - 1); return; }
    if(tool === 'S') for(const row of grid) for(const c of row) if(c[0] === 'S') c[0] = '.';
    grid[z][x] = [tool === 'ramp' ? RAMP_DIRS[rampDir] : tool, cell[0] === '-' ? 0 : cell[1]];
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
      const glyph = RAMP_ARROW[c] || GLYPH[c];
      if(glyph){
        g2.font = `${Math.floor(cs * 0.55)}px "Segoe UI Emoji","Apple Color Emoji",sans-serif`;
        if(c === 'p' || c === 'q'){ g2.fillStyle = PORTAL_COLORS[c]; g2.beginPath(); g2.arc(px + cs / 2, pz + cs / 2, cs * 0.3, 0, Math.PI * 2); g2.fill(); g2.fillStyle = '#fff'; g2.font = `800 ${cs * 0.34}px Nunito`; g2.fillText(c === 'p' ? 'A' : 'B', px + cs / 2, pz + cs / 2 + 1); }
        else { g2.fillStyle = c === '_' ? 'rgba(255,255,255,.55)' : '#3a2a20'; g2.fillText(glyph, px + cs / 2, pz + cs / 2 + 1); }
      }
    }
    if(last){ g2.strokeStyle = '#2a2238'; g2.lineWidth = 2; roundRect(g2, last[0] * cs + 1.5, last[1] * cs + 1.5, cs - 3, cs - 3, 6); g2.stroke(); g2.lineWidth = 1; }
  }
  function roundRect(g, x, y, w, h, r){ g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

  // ---- change pipeline: grid -> draft -> code/preview/verdict ----
  let previewT = 0, verdictT = 0;
  function changed({ fromCode = false } = {}){
    draft.rows = toRows(); draft.name = $('#bName').value.trim() || 'My isle';
    store.set('klarbase.v2.draft', draft);
    for(const c of themes.children) c.classList.toggle('on', c.dataset.theme === draft.theme);
    $('#bW').textContent = grid[0].length; $('#bH').textContent = grid.length;
    if(!fromCode && document.activeElement !== $('#bCode')) $('#bCode').value = draft.rows.join('\n');
    draw();
    clearTimeout(previewT); previewT = setTimeout(preview, 90);
    clearTimeout(verdictT); verdictT = setTimeout(() => judge(60000), 260);
  }
  function preview(){
    const { level } = parseIsle(draft);
    if(!level) return;
    world.load(level, draft.theme);
    if(level.start != null){ world.pip.group.visible = true; world.reset(initialState(level)); } else world.pip.group.visible = false;
  }
  function judge(budget){
    const st = $('#bStatus'), { ok, errors, level } = parseIsle(draft);
    if(!ok){ verdict = null; st.className = 'status bad'; st.textContent = '✗ ' + [...new Set(errors.map(e => e.text))].slice(0, 2).join(' · '); return; }
    const r = solveIsle(level, { maxStates:budget });
    verdict = r;
    if(r.solvable){ st.className = 'status ok'; st.textContent = `✓ Solvable in ${r.par} moves` + (canSeeSolutions() ? ` · ${r.solution.length > 28 ? r.solution.slice(0, 28) + '…' : r.solution}` : ' · sign in to see the route'); }
    else if(r.capped){ st.className = 'status'; st.textContent = '… big isle — press “Deep check” to verify'; }
    else { st.className = 'status bad'; st.textContent = '✗ Not solvable yet — no path reaches a goal'; }
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
    draft = { name:v === 'blank' ? 'My isle' : src.name + ' remix', theme:src.theme, rows:src.rows.slice() };
    grid = fromRows(draft.rows); $('#bName').value = draft.name; e.target.value = ''; changed();
  };
  let codeT = 0;
  $('#bCode').addEventListener('input', () => {
    clearTimeout(codeT);
    codeT = setTimeout(() => {
      const rows = $('#bCode').value.split('\n').map(s => s.trim()).filter(Boolean);
      const r = parseIsle({ rows, theme:draft.theme });
      if(!r.level){ $('#bStatus').className = 'status bad'; $('#bStatus').textContent = '✗ ' + r.errors[0].text; return; }
      grid = fromRows(rows); changed({ fromCode:true });
    }, 350);
  });
  $('#bCheck').onclick = () => { $('#bStatus').textContent = 'checking…'; setTimeout(() => judge(300000), 30); };
  $('#bTest').onclick = () => {
    const { ok, errors } = parseIsle(draft);
    if(!ok) return toast(errors[0].text, true);
    onTest({ ...draft, par:verdict && verdict.solvable ? verdict.par : 0, solution:verdict && verdict.solvable ? verdict.solution : '' });
  };
  $('#bShare').onclick = async () => {
    if(!getSession()) return toast('Sign in (top right) to share online', true);
    try {
      const r = await api('/puzzles', { method:'POST', body:{ title:draft.name, puzzle:{ schemaVersion:ISLE_SCHEMA, name:draft.name, theme:draft.theme, rows:draft.rows } } });
      const url = `${location.origin}/#/i/${r.hash}`;
      await navigator.clipboard.writeText(url).catch(() => {});
      toast(r.deduped ? 'Already shared — link copied' : 'Shared! Link copied to clipboard');
    } catch(e){ toast(e.validation ? e.validation[0].text : e.message, true); }
  };
  $('#bGithub').onclick = () => {
    const author = $('#bAuthor').value.trim().replace(/^@/, '');
    store.set('klarbase.v2.ghuser', author);
    const note = $('#bGithubNote'); note.style.display = 'block';
    if(!author){ note.innerHTML = 'Add your GitHub username — it becomes your credit on the isle.'; return; }
    const file = toCommunityFile(draft, author);
    const existing = new Map([...CURATED_ISLES.map(i => [isleHash(i), `official isle “${i.name}”`]), ...communityHashes()]);
    const v = checkCommunityIsle(file, { existing });
    if(!v.ok){ note.innerHTML = '<b>Not ready yet — the repo checks would reject it:</b><br>• ' + v.errors.map(esc).join('<br>• '); return; }
    download(`${file.id}.json`, JSON.stringify(file, null, 2) + '\n');
    note.innerHTML = `✓ Passes every check (par ${file.par}, uses ${v.report.mechanics.join(', ')}).<br>
      Add it to <code>isles/community/${esc(author)}/${file.id}.json</code> and open a pull request —
      <a href="${repoUrl}/blob/main/CONTRIBUTING.md" target="_blank" rel="noopener">how to contribute</a>.`;
  };
  $('#bExport').onclick = () => download(`${(draft.name || 'isle').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`,
    JSON.stringify({ schemaVersion:ISLE_SCHEMA, name:draft.name, theme:draft.theme, rows:draft.rows }, null, 2) + '\n');
  $('#bImport').onclick = () => $('#bFile').click();
  $('#bFile').onchange = e => {
    const f = e.target.files[0]; if(!f) return;
    f.text().then(t => {
      try {
        const d = JSON.parse(t); const r = parseIsle(d);
        if(!r.level) throw new Error(r.errors[0].text);
        draft = { name:d.name || 'Imported isle', theme:d.theme || 'jungle', rows:d.rows }; grid = fromRows(d.rows);
        $('#bName').value = draft.name; changed(); toast('Isle imported');
      } catch(err){ toast('Could not import: ' + err.message, true); }
    });
    e.target.value = '';
  };

  function download(name, text){ const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type:'application/json' })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));

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
