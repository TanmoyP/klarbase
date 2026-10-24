// @klar/core — the curated isles. The main-path puzzles + one Twist per themed chapter, plus the
// Hanging Gardens, Windward, Nightfall and Confluence chapters of archipelago maps (schemaVersion 6),
// each verified by the solver (tools/author.mjs and core/test/isles.mjs re-check every
// one in CI): solvable, featured mechanics load-bearing, and `solution` is the
// solver's shortest key combo — so par is exact and the replay is guaranteed.
// Moves: U D L R = north/south/west/east, X = use (lever).
// `tier` is the designer's gut call (K3, core/src/isle/difficulty.js) — presentation only,
// never part of the hash. `twist:true` marks a chapter's optional Twist isle: built around a
// written `catch` to the Hard targets checked in core/test/difficulty.mjs.
//
// The source of truth is one JSON file per isle in isles/official/<chapter>/<id>.json, in the
// order isles/official/chapters.json lists them. core does no I/O, so tools/author.mjs renders
// them into ./official.js (generated — never edit it); run it after any edit, and it prints the
// true par and solution.
export { CHAPTERS, CURATED_ISLES } from './official.js';
import { CURATED_ISLES } from './official.js';

export const isleById = id => CURATED_ISLES.find(i => i.id === id) || null;
