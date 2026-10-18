// @klar/core — community isle rules. The SAME checks run in three places:
// the in-game "Export for GitHub" button, `node tools/check-isles.mjs`, and the
// required CI check on every pull request. If a stranger's isle passes here,
// it is valid, solvable, uses real mechanics, is credited, and is unique.
// Pure: data in, verdict out. No contributor code is ever executed.
import { THEMES, ISLE_SCHEMA, parseIsle, isleHash } from './format.js';
import { solveIsle } from './solve.js';
import { simulate, initialState, step } from './rules.js';

export const CONTRIB = {
  MIN_PAR: 6,                       // shorter than this is a walk, not a puzzle
  MAX_STATES: 200000,               // solver budget — keeps CI fast and fair
  MAX_BYTES: 8192,
  REQUIRED: ['schemaVersion', 'id', 'name', 'author', 'theme', 'rows', 'par', 'solution'],
  OPTIONAL: ['hint', 'description', 'credit'],
  ID: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
  AUTHOR: /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/,   // a GitHub login
  NAME: /^[\p{L}\p{N}][\p{L}\p{N} '’&.,!?:-]{1,38}[\p{L}\p{N}!?.]$/u,
  // events that count as a real mechanic (plain flat walking does not)
  MECHANICS: ['walk:ramp', 'walk:down', 'push', 'sink', 'slide', 'cslide', 'tp', 'toggle', 'fall', 'key', 'door', 'gate'],
};

const cleanText = (s, max) => typeof s === 'string' && s.length <= max && !/[\u0000-\u001f]/.test(s) && !/https?:|www\./i.test(s);

// Which mechanics a move string actually exercises.
export function mechanicsUsed(level, moves){
  let s = initialState(level); const used = new Set();
  for(const m of moves){
    const r = step(level, s, m); if(!r.ok) break;
    for(const e of r.events) used.add(e.t === 'walk' ? 'walk:' + e.kind : e.t);
    s = r.state;
  }
  return CONTRIB.MECHANICS.filter(m => used.has(m));
}

// doc: a parsed community isle file. existing: Map(hash -> label) of every
// other isle (official + community) for the uniqueness rule.
// -> { ok, errors:[string], report:{ hash, par, solution, mechanics, explored } }
export function checkCommunityIsle(doc, { existing = new Map(), bytes = 0 } = {}){
  const errors = [], report = {};
  const err = m => errors.push(m);
  if(!doc || typeof doc !== 'object' || Array.isArray(doc)) return { ok:false, errors:['file must be a JSON object'], report };
  if(bytes > CONTRIB.MAX_BYTES) err(`file is ${bytes} bytes — keep isles under ${CONTRIB.MAX_BYTES}`);
  for(const k of CONTRIB.REQUIRED) if(!(k in doc)) err(`missing required field "${k}"`);
  for(const k of Object.keys(doc)) if(!CONTRIB.REQUIRED.includes(k) && !CONTRIB.OPTIONAL.includes(k)) err(`unknown field "${k}" (allowed: ${[...CONTRIB.REQUIRED, ...CONTRIB.OPTIONAL].join(', ')})`);
  if(errors.length) return { ok:false, errors, report };

  if(doc.schemaVersion !== ISLE_SCHEMA) err(`schemaVersion must be ${ISLE_SCHEMA}`);
  if(typeof doc.id !== 'string' || !CONTRIB.ID.test(doc.id) || doc.id.length > 40) err('id must be lowercase-words-with-dashes, up to 40 chars');
  if(typeof doc.name !== 'string' || !CONTRIB.NAME.test(doc.name)) err('name must be 3–40 letters, numbers, spaces or simple punctuation');
  if(typeof doc.author !== 'string' || !CONTRIB.AUTHOR.test(doc.author)) err('author must be your GitHub username');
  if(!THEMES.includes(doc.theme)) err(`theme must be one of: ${THEMES.join(', ')}`);
  if('hint' in doc && !cleanText(doc.hint, 140)) err('hint must be plain text, up to 140 chars, no links');
  if('description' in doc && !cleanText(doc.description, 240)) err('description must be plain text, up to 240 chars, no links');
  if('credit' in doc && !cleanText(doc.credit, 40)) err('credit must be plain text, up to 40 chars, no links');
  if(!Number.isInteger(doc.par)) err('par must be an integer');
  if(typeof doc.solution !== 'string' || !/^[UDLRX]*$/.test(doc.solution)) err('solution must be a string of U D L R X');
  if(errors.length) return { ok:false, errors, report };

  const { ok, errors:perr, level } = parseIsle(doc);
  if(!ok) return { ok:false, errors:perr.map(e => `${e.text}${e.at ? ` (column ${e.at[0] + 1}, row ${e.at[1] + 1})` : ''}`), report };

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
  if(!report.mechanics.length) err('the solution is plain flat walking — use at least one mechanic (ramps, ledges, crates, ice, plates, levers, keys or portals)');
  return { ok:errors.length === 0, errors, report };
}

// Build a contribution-ready file from an isle the player made in the editor.
export function toCommunityFile(doc, author){
  const { level } = parseIsle(doc);
  const r = level ? solveIsle(level, { maxStates:CONTRIB.MAX_STATES }) : { solvable:false };
  const id = String(doc.name || 'my-isle').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'my-isle';
  const out = { schemaVersion:ISLE_SCHEMA, id, name:doc.name, author, theme:doc.theme || 'jungle',
                rows:doc.rows.map(r => r.trim().split(/\s+/).join(' ')), par:r.par || 0, solution:r.solution || '' };
  if(doc.hint) out.hint = doc.hint;
  return out;
}
