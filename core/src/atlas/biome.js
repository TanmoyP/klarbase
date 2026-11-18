// @klar/core — Sky Atlas: biomes. Pure and stateless (see rng.js).
//
// The sky is cut into regions by a JITTERED VORONOI: one site per 24×24 block of map tiles,
// nudged by a hash, and a gentle domain warp wobbles every border so no edge is a straight
// line. The technique is the one papertrails (MIT) uses for its biomes; this file shares no code.
//
// Spawn is fixed (the player's first view must always be the same): site (0,0) is jungle
// (Canopy) at map tile (0,0) and its four neighbours are fixed — east oasis, west mountain,
// south tropical, north urban. NIGHT is the rare theme: it first appears in the second ring
// (one fixed site pulled toward spawn so it is always within ~35 tiles, plus two more by hash)
// and then at ~15% of sites further out. Rings 1–2 are assigned from a QUOTA (not coin flips)
// so the 56 official isles always find enough room near spawn (content.js).
//
// A site is (gx, gz) in block coordinates; ring = max(|gx|, |gz|). Map +z is SOUTH (as in isles).
import { hash2, vnoise } from './rng.js';

export const ATLAS_THEMES = ['jungle', 'oasis', 'tropical', 'urban', 'mountain', 'night'];
export const SITE = 24, JITTER = 14, WARP = 3.2;

export const REGION_NAMES = {
  jungle:   ['Canopy Rise', 'Fernhollow', 'Mossmere', 'Greenwhisper', 'Tanglewood', 'Dewfall'],
  oasis:    ['Mirage Flats', 'Palm Reach', 'Sunwell', 'Dune Hollow', 'Amber Basin', 'Cinder Springs'],
  tropical: ['Lagoon Shallows', 'Coral Run', 'Tideglass', 'Parrot Cove', 'Sandbar Sound', 'Kelp Meadow'],
  urban:    ['Rooftop Row', 'Lantern Ward', 'Chimney Heights', 'Market Terrace', 'Skybridge Quarter', 'Clocktower Hill'],
  mountain: ['Frostfold', 'Snowcap Reach', 'Glacier Steps', 'Windbluff', 'Pinnacle Rest', 'Icewater Peak'],
  night:    ['Moonwake', 'Starlit Hollow', 'Firefly Deep', 'Dusk Garden', 'Lantern Dark', 'Owlwatch'],
};

export const ringOf = (gx, gz) => Math.max(Math.abs(gx), Math.abs(gz));

// Fixed sites near spawn: [x, z, theme].
const FIXED = {
  '0,0': [0, 0, 'jungle'], '1,0': [SITE, 0, 'oasis'], '-1,0': [-SITE, 0, 'mountain'],
  '0,1': [0, SITE, 'tropical'], '0,-1': [0, -SITE, 'urban'],
  '0,-2': [0, -2 * SITE + 7, 'night'],            // pulled 7 tiles toward spawn: night is within reach early
};
const QUOTA = [['jungle', 4], ['oasis', 3], ['tropical', 3], ['urban', 3], ['mountain', 4]];   // 17 sites + 2 night = the 19 free sites of rings 1–2

const ring12 = new Map();      // seed -> Map("gx,gz" -> theme)
function ringThemes(seed){
  let m = ring12.get(seed);
  if(m) return m;
  m = new Map();
  const free = [];
  for(let gz = -2; gz <= 2; gz++) for(let gx = -2; gx <= 2; gx++)
    if(ringOf(gx, gz) >= 1 && !FIXED[gx + ',' + gz] && !(ringOf(gx, gz) === 1 && (gx === 0 || gz === 0))) free.push([gx, gz]);
  const byHash = (k, list) => list.slice().sort((a, b) => hash2(seed, a[0], a[1], k) - hash2(seed, b[0], b[1], k) || a[0] - b[0] || a[1] - b[1]);
  const night = byHash(7, free.filter(([gx, gz]) => ringOf(gx, gz) === 2)).slice(0, 2);
  const rest = byHash(8, free.filter(s => !night.includes(s)));
  for(const s of night) m.set(s[0] + ',' + s[1], 'night');
  const seq = QUOTA.flatMap(([t, n]) => Array(n).fill(t));
  rest.forEach((s, i) => m.set(s[0] + ',' + s[1], seq[i]));
  if(ring12.size > 16) ring12.clear();
  ring12.set(seed, m);
  return m;
}

// Further out: hash-picked, night rarer than the rest.
function outerTheme(seed, gx, gz){
  const u = hash2(seed, gx, gz, 11);
  if(u < 0.15) return 'night';
  return ATLAS_THEMES[Math.min(4, Math.floor((u - 0.15) / 0.85 * 5))];
}

const sites = new Map();       // "seed/gx/gz" -> { x, z, theme, gx, gz }
export function siteAt(seed, gx, gz){
  const key = seed + '/' + gx + '/' + gz;
  let s = sites.get(key);
  if(s) return s;
  const f = FIXED[gx + ',' + gz];
  if(f) s = { gx, gz, x:f[0], z:f[1], theme:f[2] };
  else {
    const r = ringOf(gx, gz);
    s = { gx, gz,
          x:Math.round(gx * SITE + (hash2(seed, gx, gz, 1) - 0.5) * JITTER),
          z:Math.round(gz * SITE + (hash2(seed, gx, gz, 2) - 0.5) * JITTER),
          theme:r <= 2 ? ringThemes(seed).get(gx + ',' + gz) : outerTheme(seed, gx, gz) };
  }
  if(sites.size > 20000) sites.clear();
  sites.set(key, s);
  return s;
}

// Nearest and second-nearest site of map tile (x, z), after the domain warp. The warp is two
// low-frequency value-noise fields, so borders wander a few tiles but regions stay whole.
function nearest(seed, x, z){
  const wx = x + (vnoise(seed, x, z, 11, 21) - 0.5) * 2 * WARP, wz = z + (vnoise(seed, x, z, 11, 22) - 0.5) * 2 * WARP;
  const bx = Math.round(wx / SITE), bz = Math.round(wz / SITE);
  let a = null, b = null, da = Infinity, db = Infinity;
  for(let gz = bz - 1; gz <= bz + 1; gz++) for(let gx = bx - 1; gx <= bx + 1; gx++){
    const s = siteAt(seed, gx, gz), d = Math.hypot(wx - s.x, wz - s.z);
    if(d < da){ b = a; db = da; a = s; da = d; } else if(d < db){ b = s; db = d; }
  }
  return { a, b, da, db };
}

export const biomeAt = (seed, x, z) => nearest(seed, x, z).a.theme;

// -> { theme, name, site:[gx, gz] }  A cozy name picked by the site's hash — the same for every tile of the region.
export function regionAt(seed, x, z){
  const s = nearest(seed, x, z).a;
  return regionOfSite(seed, s);
}
export function regionOfSite(seed, s){
  const names = REGION_NAMES[s.theme];
  return { theme:s.theme, name:names[Math.floor(hash2(seed, s.gx, s.gz, 3) * names.length)], site:[s.gx, s.gz] };
}

// How close tile (x, z) is to a region border: { margin (tiles of distance, 0 = on the border),
// theme, other (the neighbouring region's theme), site, otherSite }. Used to put Twist /
// Confluence isles where two chapters meet.
export function biomeEdge(seed, x, z){
  const { a, b, da, db } = nearest(seed, x, z);
  return { margin:(db - da) / 2, theme:a.theme, other:b.theme, site:[a.gx, a.gz], otherSite:[b.gx, b.gz] };
}

// Smooth blend for colour grading: {theme: weight}, weights sum to 1. A tent-weighted 5×5
// stencil of biomeAt over radius r — inside a region it is {theme:1}; near a border it ramps.
export function biomeWeights(seed, x, z, r = 3){
  const out = {}, tent = [1, 2, 3, 2, 1];
  let total = 0;
  for(let j = 0; j < 5; j++) for(let i = 0; i < 5; i++){
    const w = tent[i] * tent[j], t = biomeAt(seed, x + Math.round((i - 2) * r / 2), z + Math.round((j - 2) * r / 2));
    out[t] = (out[t] || 0) + w; total += w;
  }
  for(const t of Object.keys(out)) out[t] /= total;
  return out;
}
