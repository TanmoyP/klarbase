// @klar/core — Sky Atlas: what the shrines hold. Pure, deterministic and STABLE.
//
// Every isle quadrant may carry one shrine SLOT (chunk.js). A slot holds, in this order of
// right: an OFFICIAL isle, a COMMUNITY/DAILY isle placed by hash, or — if nothing is placed
// there — a WILD isle generated from the slot's coordinates (wild.js).
//
// OFFICIAL (the 56 hand-made isles): chapters in play order, each in the nearest regions of its
// chapter's theme within rings 0–2 of the biome sites around spawn (further out only if a theme's
// regions there are full — which the quota in biome.js prevents). Inside a region a chapter fills
// slots nearest-spawn first, so the early isles sit close to where Pip starts. Twist isles
// and Confluence isles (`joins`) go on the slot of the chapter's regions that lies closest to a
// REGION BORDER — for Confluence, a border with one of the joined chapters' themes when there is one.
// COMMUNITY / DAILY (`{key:'c/author/id' | 'd/YYYY-MM-DD', theme}`): each key ranks every slot
// of its theme's regions (rings ≤ 8; dailies ≤ 4) by hash(key, slot) and takes its best free
// one. The ranking depends on the key alone, so adding other isles never moves one — except that
// when two keys want the same slot the one with the smaller key hash keeps it and the other
// takes its next choice. The input ORDER never matters: same set of keys, same Map.
import { CHAPTERS, CURATED_ISLES } from '../isle/isles.js';
import { siteAt, biomeEdge, regionOfSite } from './biome.js';
import { Q, isleLayout, spawnOf } from './chunk.js';
import { cellAt } from './walk.js';
import { hash2, hashStr } from './rng.js';

export const OFFICIAL_RINGS = 2, COMMUNITY_RINGS = 8, DAILY_RINGS = 4;

const slotsMemo = new Map();
// Every shrine slot inside region (gx, gz): [{ x, z, margin, other }] (margin: tiles from a border).
export function regionSlots(seed, gx, gz){
  const key = seed + '/' + gx + '/' + gz;
  let out = slotsMemo.get(key);
  if(out) return out;
  const s = siteAt(seed, gx, gz), qx0 = Math.floor(s.x / Q), qz0 = Math.floor(s.z / Q);
  out = [];
  for(let qz = qz0 - 6; qz <= qz0 + 6; qz++) for(let qx = qx0 - 6; qx <= qx0 + 6; qx++){
    const L = isleLayout(seed, qx, qz);
    if(L.slot < 0) continue;
    const x = L.ox + (L.slot % Q), z = L.oz + ((L.slot / Q) | 0), e = biomeEdge(seed, x, z);
    if(e.site[0] === gx && e.site[1] === gz) out.push({ x, z, margin:e.margin, other:e.other });
  }
  if(slotsMemo.size > 4000) slotsMemo.clear();
  slotsMemo.set(key, out);
  return out;
}

// Regions (sites) of `theme` within `rings`, nearest to spawn first.
function regionsOf(seed, theme, rings, sp){
  const out = [];
  for(let gz = -rings; gz <= rings; gz++) for(let gx = -rings; gx <= rings; gx++){
    const s = siteAt(seed, gx, gz);
    if(s.theme === theme) out.push(s);
  }
  return out.sort((a, b) => Math.hypot(a.x - sp.x, a.z - sp.z) - Math.hypot(b.x - sp.x, b.z - sp.z) || a.gx - b.gx || a.gz - b.gz);
}

const rev = new WeakMap();       // placement Map -> Map("x,z" -> key)

export function placeContent(seed, { official = CURATED_ISLES, chapters = CHAPTERS, community = [], daily = [] } = {}){
  const out = new Map(), at = new Map(), sp = spawnOf(seed);
  const put = (key, slot, kind) => { out.set(key, { x:slot.x, z:slot.z, kind }); at.set(slot.x + ',' + slot.z, key); };
  const free = slot => !at.has(slot.x + ',' + slot.z);
  const near = a => Math.hypot(a.x - sp.x, a.z - sp.z);

  // ---- official ----
  const chapterKey = c => c.id || c.theme, themeOfChapter = {};
  for(const c of chapters) themeOfChapter[chapterKey(c)] = c.theme;
  for(const c of chapters){
    const key = chapterKey(c), isles = official.filter(i => (i.chapter || i.theme) === key);
    if(!isles.length) continue;
    // regions of this chapter's theme: rings 0–2, widening only if they cannot hold the chapter
    let pool = [];
    for(let rings = OFFICIAL_RINGS; rings <= OFFICIAL_RINGS + 4; rings++){
      pool = regionsOf(seed, c.theme, rings, sp).flatMap(r => regionSlots(seed, r.gx, r.gz).map(s => ({ ...s, ring:Math.max(Math.abs(r.gx), Math.abs(r.gz)) })));
      if(pool.filter(free).length >= isles.length) break;
    }
    const order = (a, b) => a.ring - b.ring || near(a) - near(b) || a.x - b.x || a.z - b.z;
    pool.sort(order);
    const side = i => !!(i.twist || i.joins);
    for(const i of isles) if(!side(i)){ const s = pool.find(free); if(s) put('o/' + i.id, s, 'official'); }
    for(const i of isles) if(side(i)){
      const want = new Set((i.joins || []).map(k => themeOfChapter[k]).filter(t => t && t !== c.theme));
      const cand = pool.filter(free).sort((a, b) =>
        (want.has(b.other) ? 1 : 0) - (want.has(a.other) ? 1 : 0) || a.margin - b.margin || order(a, b));
      if(cand[0]) put('o/' + i.id, cand[0], 'official');
    }
  }

  // ---- community & daily: ranked by hash, best free slot ----
  const universe = new Map();    // "theme/rings" -> [slot]
  const slotsFor = (theme, rings) => {
    const k = theme + '/' + rings;
    if(!universe.has(k)) universe.set(k, regionsOf(seed, theme, rings, sp).flatMap(r => regionSlots(seed, r.gx, r.gz)));
    return universe.get(k);
  };
  const place = (list, rings, kind) => {
    const items = list.map(({ key, theme }) => ({ key, theme, h:hashStr(key) })).sort((a, b) => a.h - b.h || (a.key < b.key ? -1 : 1));
    for(const it of items){
      if(out.has(it.key)) continue;
      const cand = slotsFor(it.theme, rings).filter(free).sort((a, b) => hash2(it.h, a.x, a.z, 2) - hash2(it.h, b.x, b.z, 2));
      if(cand[0]) put(it.key, cand[0], kind);
    }
  };
  place(daily, DAILY_RINGS, 'daily');
  place(community, COMMUNITY_RINGS, 'community');
  rev.set(out, at);
  return out;
}

// What stands on map tile (x, z), or null if it is not a shrine.
// -> { x, z, key, kind:'official'|'community'|'daily'|'wild', statKey }
// A 'wild' shrine may still turn out empty: wildIsle(seed, x, z) is null for the rare slot
// where no fair puzzle was found (the client then shows a quiet shrine).
export function shrineAt(seed, x, z, placement){
  if(cellAt(seed, x, z).kind !== 'shrine') return null;
  const key = placement && rev.get(placement) && rev.get(placement).get(x + ',' + z);
  if(key) return { x, z, key, kind:placement.get(key).kind, statKey:key };
  const w = `w/${x},${z}`;
  return { x, z, key:w, kind:'wild', statKey:w };
}

export { regionOfSite };
