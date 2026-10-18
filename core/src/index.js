// @klar/core — the single source of truth. Three call sites (spec v4.5 §13):
// the client editor (pre-commit validation), the client player (traversal),
// the server publish gate (validation + solvability). Never reimplement.
export * from './components.js';
export * from './validate.js';
export * from './graph.js';
export * from './solve.js';
export * from './schema.js';
export * from './ports.js';
export * from './lattice.js';
// Isles (schemaVersion 5) — the v2 game: format, rules, solver, curated isles.
// The modules above are the legacy voxel engine, kept only for the deferred
// world lattice (server/src/routes/world.js).
export * from './isle/index.js';
