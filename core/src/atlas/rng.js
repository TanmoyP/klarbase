// @klar/core — Sky Atlas: stateless randomness. Pure. No Math.random, no Date, no I/O.
// Everything in the atlas is a function of (seed, coordinates): the same call returns the
// same number in Node and in the browser, in any order, on any machine. A chunk never needs
// to see its neighbour — both agree because they hash the same integers.

const mix = (h, v) => {
  h = Math.imul(h ^ (v | 0), 0x9e3779b1);
  h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
};

// -> [0, 1). Stateless: a pure function of four integers (k = a free "channel" so one cell
// can ask many independent questions).
export function hash2(seed, x, z, k = 0){
  return mix(mix(mix(mix(0x2545f491, seed), x), z), k) / 4294967296;
}

// Integer form (a 32-bit seed for mulberry32 / a sort key).
export const hashInt = (seed, x, z, k = 0) => (hash2(seed, x, z, k) * 4294967296) >>> 0;

// A string key ("c/author/id", "d/2026-11-18") -> 32-bit integer (FNV-1a).
export function hashStr(s){
  let h = 0x811c9dc5;
  for(let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

// Sequential generator for code that needs a stream (the wild-isle builder).
export function mulberry32(seed){
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Smooth value noise in [0, 1): bilinear over hashed lattice points, smoothstep-eased.
// (x, z) are real; `cell` is the lattice spacing in tiles.
export function vnoise(seed, x, z, cell, k = 0){
  const fx = x / cell, fz = z / cell, ix = Math.floor(fx), iz = Math.floor(fz);
  const tx = fx - ix, tz = fz - iz, sx = tx * tx * (3 - 2 * tx), sz = tz * tz * (3 - 2 * tz);
  const a = hash2(seed, ix, iz, k), b = hash2(seed, ix + 1, iz, k), c = hash2(seed, ix, iz + 1, k), d = hash2(seed, ix + 1, iz + 1, k);
  return (a + (b - a) * sx) * (1 - sz) + (c + (d - c) * sx) * sz;
}
