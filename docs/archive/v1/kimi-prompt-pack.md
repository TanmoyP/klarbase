# Prompt Pack — Surreal Puzzle Builder

Four prompts, run in order. Do not skip Phase 0. Each phase produces something you can look at and reject before the next one is built on top of it.

---

## PHASE 0 — Spec only, no code

> You are a senior game architect. Do **not** write any implementation code in this response. I want a design document only.
>
> I am building a browser-based 3D puzzle **builder and player** in the spirit of Monument Valley crossed with LEGO. Players place modular components on a grid to build small architectural puzzles containing optical illusions (Penrose/impossible geometry), then a walking avatar must reach a goal. Puzzles are shareable, and uploaded puzzles snap together into a persistent shared open world.
>
> Produce:
>
> 1. **The puzzle JSON schema.** Versioned (`schemaVersion`). A puzzle is a list of component instances, each with: type id, integer grid position (x,y,z), rotation (0–3, 90° steps around Y), colour/palette index, and any per-type parameters. Include a top-level `plot` object defining the puzzle's bounding volume and its **edge ports** — fixed connection points on the plot boundary where a neighbouring puzzle can attach. Explain your reasoning for each field.
> 2. **The component/socket model.** Every component exposes typed sockets (walkable surface, stair top, stair bottom, rotator hub, decorative). Define the rules for which socket types may connect. This is what "structural integrity" means in practice — state it as a validation function's contract.
> 3. **The traversal graph.** Explain how walkable adjacency is computed, including how *illusion edges* work: two nodes that are not adjacent in world space but whose screen-space projections coincide under an orthographic camera at the current 90° rotation. Describe when this graph is rebuilt and how the illusion is made to feel deliberate rather than buggy.
> 4. **The world lattice.** How independently authored puzzles occupy cells in a global grid and connect via edge ports, without any puzzle being able to break its neighbour. State the invariants that make this safe.
> 5. **A component starter set** of 12–16 types that maximises expressive range with minimum count. Justify each.
> 6. **The risk list.** The five things most likely to make this project fail, ranked, with mitigations.
>
> Be opinionated. Where two designs are viable, pick one and say why.

**Read the output carefully.** If the schema looks improvised or the illusion-edge explanation is vague, push back and re-run before continuing. Everything else is built on this.

---

## PHASE 1 — Single-page sandbox (the main build)

Paste the Phase 0 schema output above this prompt.

> You are an expert Three.js developer. Build a **single self-contained HTML file** implementing the editor and player for the schema above. Three.js may be loaded from a CDN via an import map; no other dependencies, no build step, no server. It must run by opening the file in Chrome.
>
> **Rendering**
> - `THREE.OrthographicCamera` only. Never perspective — the impossible geometry depends on parallel projection.
> - Isometric-style fixed view. `Q`/`E` rotate the whole world 90° about Y with a smooth ~400ms eased tween. Rotation is always snapped to 4 cardinal states; no free orbit.
> - Soft pastel palette, low-saturation gradient sky background, gentle ambient + one directional light with soft shadows. Flat/lambert shading, no textures, no image assets. Geometry and colour do all the work.
> - Subtle idle motion: slow drift on a few decorative elements, a faint bloom-like vignette drawn in CSS. Atmosphere over detail.
>
> **Two modes, toggled with `Tab`**
>
> *Build mode:*
> - A ghost/preview component follows a 3D grid cursor. Faint grid plane at y=0 with a soft fade at the edges.
> - `Arrow keys` move the cursor in the horizontal plane (relative to current camera rotation, so it always feels correct). `Shift+Up/Down` moves it vertically.
> - `1`–`9` and `0` select component type. `R` rotates the held piece. `C` cycles the colour palette. `Space` places. `Backspace` deletes under cursor.
> - Placement is validated against the socket rules before it is allowed; an invalid placement flashes the ghost red and does not commit.
> - `Ctrl+Z` undo, `Ctrl+Y` redo, backed by a simple command stack.
>
> *Play mode:*
> - An avatar walks the traversal graph. `Arrow keys` step to an adjacent node; movement is a short eased tween, never instant teleport.
> - `Space` activates the component the avatar is standing on or facing (rotators, buttons, moving platforms).
> - Reaching the goal component triggers a quiet success state — a colour bloom and a soft chime synthesised with the Web Audio API, no audio files.
> - `R` resets the puzzle to its authored state.
>
> **Data**
> - `Export` button downloads the puzzle as JSON conforming exactly to the schema.
> - `Import` button loads a JSON file and reconstructs it, validating on load and reporting errors readably rather than crashing.
> - Ship 3 built-in preset puzzles, hardcoded as JSON constants, selectable from a start screen. They should teach the illusion mechanic by example: the first trivially, the third properly.
>
> **UI**
> - Minimal. A thin bottom bar showing the component palette, the current mode, and the 4–5 keys relevant to that mode. No walls of text, no tutorial modals. The controls should be learnable in under 30 seconds.
> - Start screen: title, "Build", "Play a preset", "Import".
>
> **Code quality**
> - Organise as clearly separated modules within the single file: `Schema`, `Components`, `Validator`, `TraversalGraph`, `Renderer`, `Editor`, `Player`, `UI`. Comment the non-obvious parts, especially the illusion-edge computation.
> - No global state soup. No dead code. It must actually run — verify your logic before responding.
>
> Output the complete file. Then list, separately, anything you stubbed or simplified.

---

## PHASE 2 — Backend, auth, sharing

> Extend the project into a deployable web app. Restructure into a repo, not a single file.
>
> - **Frontend:** the Phase 1 sandbox, split into ES modules, built with Vite.
> - **Backend:** Node + Express (or Fastify). Postgres via Prisma. Auth via OAuth (Google + GitHub) using a standard library — do not hand-roll sessions or password hashing.
> - **Endpoints:** publish a puzzle (validated server-side against the schema — never trust the client), list/browse published puzzles with pagination, fetch one by id, delete own puzzle. Rate-limit publishing.
> - **Gating:** anonymous visitors may play presets only. Building, publishing, and playing user puzzles require login.
> - **Moderation hooks:** every published puzzle gets a status field (`pending`/`live`/`hidden`) and a report endpoint. Assume strangers will upload things you don't want in your shared world.
> - Provide `docker-compose.yml` for local dev, a `.env.example`, migrations, and a README with deploy instructions for Railway or Fly.io plus a managed Postgres.
>
> Server-side schema validation is the security boundary for the whole project. Treat it as such.

---

## PHASE 3 — The shared world

> Add the persistent open world.
>
> - A global lattice of plot cells. A logged-in user claims a free cell adjacent to an existing one and places one of their published puzzles into it.
> - A placement is only accepted if the puzzle's edge ports are compatible with the ports of every already-occupied neighbouring cell. Reject otherwise, with a readable reason.
> - Once placed, a puzzle is immutable in the world. Neighbours can never mutate each other's geometry — this is the invariant that keeps the world from rotting.
> - Free-roam mode: the avatar walks continuously across cell boundaries via connected edge ports. Stream in only nearby cells; unload distant ones.
> - A zoomed-out map view of the world lattice showing claimed cells and their authors.
>
> Explain your streaming strategy and your plan for what happens when the world grows past a few hundred cells.

---

## Notes for you, not for Kimi

- **Phase 1 is the real deliverable.** If it's fun for 10 minutes with three presets and no backend, the rest is worth building. If it isn't, no amount of infrastructure saves it.
- **Expect to iterate inside each phase.** The first Phase 1 output will have bugs. Feed the error back with the specific broken behaviour rather than starting over.
- **The illusion mechanic is the make-or-break.** If Kimi's screen-space adjacency feels arbitrary rather than delightful, that's the thing to fix before anything else. Consider asking for it as an isolated demo first: one staircase, one impossible connection, nothing else.
- **Scope warning on Phase 3.** A persistent shared world authored by strangers is a moderation and storage commitment, not just a feature. Ship Phase 2 publicly and see whether anyone actually uploads before building it.
