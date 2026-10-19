// @klar/core — community isle rules. The SAME checks run in three places:
// the in-game "Export for GitHub" button, `node tools/check-isles.mjs`, and the
// required CI check on every pull request. If a stranger's isle passes here,
// it is valid, solvable, uses real mechanics, is credited, and is unique.
// Pure: data in, verdict out. No contributor code is ever executed.
import { THEMES, ISLE_SCHEMA, MAP_SCHEMA, schemaOf, parseIsle, isleHash } from './format.js';
import { solveIsle } from './solve.js';
import { simulate, initialState, step } from './rules.js';
import { TIER_IDS } from './difficulty.js';

export const CONTRIB = {
  MIN_PAR: 6,                       // shorter than this is a walk, not a puzzle
  MAX_STATES: 200000,               // solver budget — keeps CI fast and fair
  MAX_BYTES: 8192,
  REQUIRED: ['schemaVersion', 'id', 'name', 'author', 'theme', 'rows', 'par', 'solution'],   // a v6 map has 'storeys' instead of 'rows'
  OPTIONAL: ['hint', 'description', 'credit', 'tier'],   // tier = the maker's gut call (K3), one of TIERS
  ID: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
  AUTHOR: /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/,   // a GitHub login
  NAME: /^[\p{L}\p{N}][\p{L}\p{N} '’&.,!?:-]{1,38}[\p{L}\p{N}!?.]$/u,
  // events that count as a real mechanic (plain flat walking does not)
  MECHANICS: ['walk:ramp', 'walk:down', 'push', 'sink', 'slide', 'cslide', 'tp', 'toggle', 'fall', 'key', 'door', 'gate', 'scales', 'gateway'],
};

const cleanText = (s, max) => typeof s === 'string' && s.length <= max && !/[\u0000-\u001f]/.test(s) && !/https?:|www\./i.test(s);

// The mechanic an engine event stands for (an arch ride between storeys is a gateway).
export const eventMechanic = e => e.t === 'walk' ? 'walk:' + e.kind : e.t === 'tp' && e.gateway ? 'gateway' : e.t;

// Which mechanics a move string actually exercises.
export function mechanicsUsed(level, moves){
  let s = initialState(level); const used = new Set();
  for(const m of moves){
    const r = step(level, s, m); if(!r.ok) break;
    for(const e of r.events) used.add(eventMechanic(e));
    s = r.state;
  }
  return CONTRIB.MECHANICS.filter(m => used.has(m));
}

// doc: a parsed community isle file. existing: Map(hash -> label) of every
// other isle (official + community) for the uniqueness rule.
// -> { ok, errors:[string], report:{ hash, par, solution, mechanics, explored } }
export const checkCommunityIsle = (doc, opts) => checkIsleFile(doc, opts, CONTRIB);

// Dated Daily Isles: isles/daily/YYYY-MM-DD.json. The same rules as community
// isles (one code path), except: no author folder (author optional), `id` must
// be "daily-<date>", a `tier` is REQUIRED, an optional `catch` holds the
// designer's note (never shown before a clear), and any schema version the
// parser knows is accepted. date: the file's name without ".json".
export const DAILY = {
  REQUIRED: ['schemaVersion', 'id', 'name', 'theme', 'rows', 'par', 'solution', 'tier'],
  OPTIONAL: ['author', 'hint', 'description', 'credit', 'catch'],
  DATE: /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/,
};
export function checkDailyIsle(doc, { date, ...opts } = {}){
  return checkIsleFile(doc, opts, { ...DAILY, extra:(d, err) => {
    const real = typeof date === 'string' && DAILY.DATE.test(date) && new Date(date + 'T00:00:00Z').toISOString().slice(0, 10) === date;
    if(!real) err('daily isle files are named isles/daily/YYYY-MM-DD.json (a real UTC date)');
    else if(d.id !== `daily-${date}`) err(`id must be "daily-${date}" to match the file name`);
  } });
}

function checkIsleFile(doc, { existing = new Map(), bytes = 0 } = {}, spec = CONTRIB){
  const errors = [], report = {};
  const err = m => errors.push(m);
  if(!doc || typeof doc !== 'object' || Array.isArray(doc)) return { ok:false, errors:['file must be a JSON object'], report };
  if(bytes > CONTRIB.MAX_BYTES) err(`file is ${bytes} bytes — keep isles under ${CONTRIB.MAX_BYTES}`);
  const required = schemaOf(doc) === MAP_SCHEMA ? spec.REQUIRED.map(k => k === 'rows' ? 'storeys' : k) : spec.REQUIRED;
  for(const k of required) if(!(k in doc)) err(`missing required field "${k}"`);
  for(const k of Object.keys(doc)) if(!required.includes(k) && !spec.OPTIONAL.includes(k)) err(`unknown field "${k}" (allowed: ${[...required, ...spec.OPTIONAL].join(', ')})`);
  if(errors.length) return { ok:false, errors, report };

  // community isles and dailies alike: 5 = one isle ("rows"), 6 = an archipelago map ("storeys")
  if(doc.schemaVersion !== schemaOf(doc)) err(`schemaVersion must be ${ISLE_SCHEMA} (one isle, "rows") or ${MAP_SCHEMA} (a map, "storeys")`);
  if(typeof doc.id !== 'string' || !CONTRIB.ID.test(doc.id) || doc.id.length > 40) err('id must be lowercase-words-with-dashes, up to 40 chars');
  if(typeof doc.name !== 'string' || !CONTRIB.NAME.test(doc.name)) err('name must be 3–40 letters, numbers, spaces or simple punctuation');
  if((spec.REQUIRED.includes('author') || 'author' in doc) && (typeof doc.author !== 'string' || !CONTRIB.AUTHOR.test(doc.author))) err('author must be your GitHub username');
  if(!THEMES.includes(doc.theme)) err(`theme must be one of: ${THEMES.join(', ')}`);
  if('tier' in doc && !TIER_IDS.includes(doc.tier)) err(`tier must be one of: ${TIER_IDS.join(', ')}`);
  if('hint' in doc && !cleanText(doc.hint, 140)) err('hint must be plain text, up to 140 chars, no links');
  if('description' in doc && !cleanText(doc.description, 240)) err('description must be plain text, up to 240 chars, no links');
  if('credit' in doc && !cleanText(doc.credit, 40)) err('credit must be plain text, up to 40 chars, no links');
  if('catch' in doc && !cleanText(doc.catch, 200)) err('catch must be plain text, up to 200 chars, no links');
  if(spec.extra) spec.extra(doc, err);
  if(!Number.isInteger(doc.par)) err('par must be an integer');
  if(typeof doc.solution !== 'string' || !/^[UDLRX]*$/.test(doc.solution)) err('solution must be a string of U D L R X');
  if(errors.length) return { ok:false, errors, report };

  const { ok, errors:perr, level } = parseIsle(doc);
  if(!ok) return { ok:false, errors:perr.map(e => `${e.text}${e.at ? ` (${e.at.length > 2 ? `storey ${e.at[2] + 1}, ` : ''}column ${e.at[0] + 1}, row ${e.at[1] + 1})` : ''}`), report };

  report.hash = isleHash(doc);
  if(existing.has(report.hash)) err(`identical to an existing isle: ${existing.get(report.hash)}`);

  const r = solveIsle(level, { maxStates:CONTRIB.MAX_STATES });
  report.explored = r.explored;
  if(!r.solvable){
    err(r.capped ? `too large to verify — the solver gave up after ${CONTRIB.MAX_STATES} states; make it smaller` : 'not solvable — no sequence of moves reaches a goal');
    return { ok:false, errors, report };
  }
  report.par = r.par; report.solution = r.solution;
  if(r.par < CONTRIB.MIN_PAR) err(`too short: the best solution is ${r.par} moves — a puzzle needs at least ${CONTRIB.MIN_PAR}`);
  if(doc.par !== r.par) err(`par is ${doc.par} but the shortest solution is ${r.par} moves (e.g. "${r.solution}")`);
  const sim = simulate(level, doc.solution);
  if(!sim.won) err(`solution "${doc.solution}" does not reach a goal${sim.failedAt >= 0 ? ` (move ${sim.failedAt + 1} is blocked)` : ''}`);
  else if(sim.applied !== doc.solution.length) err('solution has extra moves after the goal is reached');
  else if(doc.solution.length !== r.par) err(`solution is ${doc.solution.length} moves but par is ${r.par} — submit a shortest solution (e.g. "${r.solution}")`);
  report.mechanics = mechanicsUsed(level, sim.won ? doc.solution : r.solution);
  if(!report.mechanics.length) err('the solution is plain flat walking — use at least one mechanic (ramps, ledges, crates, ice, plates, levers, keys, portals, gateways or scales)');
  return { ok:errors.length === 0, errors, report };
}

// Build a contribution-ready file from an isle the player made in the editor.
export function toCommunityFile(doc, author){
  const { level } = parseIsle(doc);
  const r = level ? solveIsle(level, { maxStates:CONTRIB.MAX_STATES }) : { solvable:false };
  const id = String(doc.name || 'my-isle').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'my-isle';
  const norm = rows => rows.map(r => r.trim().split(/\s+/).join(' '));
  const out = { schemaVersion:schemaOf(doc), id, name:doc.name, author, theme:doc.theme || 'jungle' };
  if(out.schemaVersion === MAP_SCHEMA) out.storeys = doc.storeys.map(s => ({ rows:norm(s.rows), at:s.at.slice() }));
  else out.rows = norm(doc.rows);
  out.par = r.par || 0; out.solution = r.solution || '';
  if(doc.hint) out.hint = doc.hint;
  if(TIER_IDS.includes(doc.tier)) out.tier = doc.tier;    // the maker's gut call, if they made one
  return out;
}
