// @klar/core — Your Sky + Confluence (Phase 5). Every chapter is a constellation:
// one star per isle, glowing with the stars you earned there. Clear enough of a
// chapter's main path and its constellation is LIT; light both of a Confluence
// isle's chapters and it opens. Pure: progress comes in as plain data
// (isle id → 0..3 stars), so a test and every browser agree.

export const CONFLUENCE = 'confluence';      // the chapter id Confluence isles live in
export const CONFLUENCE_NEED = 3;            // main-path clears that light a constellation

// The mechanics each chapter teaches (engine event names, see eventMechanic in contrib.js).
// A Confluence isle's `needs` must reach into BOTH of its chapters.
export const FAMILIES = {
  jungle:   ['walk:ramp', 'walk:down', 'push', 'sink', 'gate'],
  oasis:    ['tp'],
  tropical: ['toggle', 'key', 'door'],
  urban:    ['fall'],
  mountain: ['slide', 'cslide'],
  gardens:  ['scales', 'gateway'],
  windward: ['glide', 'gust', 'float', 'take', 'drop', 'release'],
};

const chapterKey = c => c.id || c.theme;
const isleChapter = d => d.chapter || d.theme;
const offPath = d => !!(d.twist || d.joins);  // Twist and Confluence isles are side paths

// -> [{ key, title, theme, points:[{ id, stars, side }], cleared, stars, max, lit }]
// One per chapter except Confluence itself.
export function skyOf(chapters, isles, starsById = {}){
  return chapters.filter(c => chapterKey(c) !== CONFLUENCE).map(c => {
    const key = chapterKey(c);
    const points = isles.filter(d => isleChapter(d) === key).map(d => ({ id:d.id, stars:Math.max(0, Math.min(3, starsById[d.id] | 0)), side:offPath(d) }));
    const cleared = points.filter(p => !p.side && p.stars > 0).length;
    return { key, title:c.title, theme:c.theme, points, cleared, stars:points.reduce((s, p) => s + p.stars, 0),
      max:points.length * 3, lit:cleared >= CONFLUENCE_NEED };
  });
}

// A Confluence isle (`joins:[a, b]`) against a sky -> { open, need:[{ key, title, cleared, need }] }
export function confluenceState(isle, sky){
  const need = (isle.joins || []).map(k => { const c = sky.find(x => x.key === k);
    return { key:k, title:c ? c.title : k, cleared:c ? c.cleared : 0, need:CONFLUENCE_NEED }; });
  return { open:need.length > 0 && need.every(n => n.cleared >= n.need), need };
}

// Star positions for a constellation of n stars in a unit box: a left-to-right
// walk with seeded wobble, so every player sees the same shapes. -> [[x, y], …]
export function constellation(key, n){
  let seed = 0x736b79;                                    // "sky"
  for(const ch of String(key)) seed = (Math.imul(seed ^ ch.charCodeAt(0), 2654435761) >>> 0);
  const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  let y = 0.3 + 0.4 * rnd();
  return Array.from({ length:n }, (_, i) => {
    y = Math.max(0.08, Math.min(0.92, y + (rnd() - 0.5) * 0.55));
    return [n === 1 ? 0.5 : 0.08 + 0.84 * i / (n - 1) + (rnd() - 0.5) * 0.06, y];
  });
}
