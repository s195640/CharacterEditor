# CLAUDE.md

Guidance for Claude Code working in this repository. Read this before making changes.

---

## Project Overview

CharacterEditor — a standalone tool for creating, customizing, previewing, and exporting
game characters: rigged humanoid models, shared animations, and swappable equipment.
Built as its own project, independent of any single game, so it can eventually be reused
elsewhere. How it will be consumed by other projects is not yet known — see "Core vs Shell"
below for how we keep that open without building for a guess.

---

## Working Process (non-negotiable)

1. **Plan Mode for anything non-trivial.** Explore, propose, wait for approval. If
   execution hits something the approved plan didn't cover, stop and ask rather than
   improvising.
2. **Git: read-only freely, never write.** `status`/`diff`/`log`/`show`/`branch -l`
   are always fine. Never run a command that writes to the repo (`add`, `commit`,
   `push`, `merge`, `rebase`, `checkout`/`switch` that changes branch or working-tree
   state) unless explicitly asked for that specific action in that session.
3. **Don't build undesigned features.** This explicitly includes integration
   mechanisms — no plugin API, embed SDK, or publish pipeline until a real second
   consumer exists with real requirements. Speculative integration surface is scope
   creep, not reuse-readiness.
4. **New runtime dependencies require explicit approval** — name it, say why, wait
   for a yes. Dev-only tooling (linters, formatters) can be added freely.
5. **Stack decisions lock in as they're made** (see Stack below). Confirm with the
   user before assuming any not-yet-decided piece of the stack or architecture.

---

## Architecture Principle: Core vs Shell

Keep the actual logic decoupled from the app UI, from the first real task on:

- **Core** — character loading, skeleton binding, equip/layer system, animation
  playback, export. Framework-light. Doesn't know or assume whether it's running
  standalone or embedded elsewhere.
- **Shell** — the standalone browser app: UI panels, controls, everything the user
  clicks. Built on top of Core, not intermixed with it.

This split is free insurance, not a feature — it doesn't commit us to any specific
future integration pattern, it just avoids tangling logic and UI in a way that would
make either path harder later.

---

## Stack (what's actually decided so far)

- Target: browser, no installer.
- Character rigging & animation source: Mixamo (humanoid only; quadrupeds out of
  scope for now).
- Asset interchange format: glTF/GLB.
- Rendering engine: **Babylon.js** (`@babylonjs/core` + `@babylonjs/loaders`),
  decided in Milestone 1. Uses `SceneLoader.ImportMeshAsync` for glTF/GLB and
  `AnimationGroup` for playback.
- Equipment approach (agreed, not yet built): skinned mesh layers sharing the
  character's skeleton for anything that deforms with the body (clothing, armor);
  rigid props parented to a single bone for anything that doesn't (weapons, shields).
- No backend, no auth, no persistence, no multiplayer — none of this exists yet and
  none of it should be introduced without a separate conversation first.

---

## Deferred — do not add without asking

Physics engine, multiplayer/networking library, database/backend framework,
procedural generation library, any plugin/embed/publishing mechanism (see Working
Process #3). Nothing here is ruled out permanently — just not needed for the current
milestone.

---

## Versioning & Milestone Summaries

**`VERSION`** (repo root, plain text `X.Y.Z`):
- **X (major):** manual only — never bump without explicit instruction.
- **Y (milestone):** the major planned item currently in progress (see list below).
  Bump when starting a new one, reset Z to 0.
- **Z (patch):** every other change within the current milestone.

**Major planned items (current list — grows as new ones are agreed, not invented mid-task):**
1. One rigged, animated character rendering in-browser
2. Animation switching on that character
3. One swappable equipment layer working
4. Export to glTF + manifest
5. Generalize: more slots, more bodies, sizing

**`docs/milestones/MILESTONE_<N>_<slug>.md`** — one file per major planned item,
written once, at the point that milestone is actually complete. This is a release
note, not a running log — don't create it early as a stub and don't check it back
in for edits partway through. Covers: what was built, key decisions made, what was
tried and rejected, how it was verified.

**Once written, a milestone file is finalized.** Never go back and edit an old one,
even if something in it is later superseded or found inaccurate — that correction
belongs in whichever milestone's file is current when the correction happens, not
backfilled into history.

---

## Repo layout

Established in Milestone 1 — single package, no workspaces/monorepo split (no
second consumer exists yet to justify one):

- `core/` — Core logic. `characterLoader.ts` (loads a character via Babylon's
  `SceneLoader`), `animationController.ts` (wraps `AnimationGroup` play/stop),
  `types.ts`. Operates on Babylon `Scene`/`AnimationGroup` objects (the rendering
  engine is a locked architectural decision, not "app UI") but has no DOM/UI-panel
  code and no assumptions about how it's hosted.
- `shell/` — the standalone browser app. `index.html` + `main.ts` own the canvas,
  Babylon `Engine`/camera/light, and render loop, and call into `core/`.
  `shell/public/characters/*.glb` — converted character assets, served as static
  files by Vite.
- `assets/source/` — raw Mixamo FBX exports, kept for reproducibility of the
  conversion step.
- `tools/convert_fbx_to_glb.py` — headless Blender script (`bpy`) that imports an
  FBX and exports GLB with animations; run via
  `blender --background --python tools/convert_fbx_to_glb.py -- <in.fbx> <out.glb>`.
- `docs/milestones/` — established (see Versioning & Milestone Summaries above).
- Root: `package.json`, `tsconfig.json`, `vite.config.ts` (`root: 'shell'`).

Don't invent a second, competing structure in a later task — extend this one.

---

## Keeping this file current

No separate status-tracking doc. When a decision above moves from open to locked
(engine gets chosen, Core's public surface takes shape, etc.), update the relevant
section here as part of that task. This file should always reflect what's actually
true, not what was true when it was written.