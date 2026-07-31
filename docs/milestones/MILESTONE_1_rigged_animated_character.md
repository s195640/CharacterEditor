# Milestone 1: One rigged, animated character rendering in-browser

## What was built

A minimal end-to-end pipeline: a Mixamo character with a baked-in walking
animation, exported as FBX, converted to GLB, and rendered playing that
animation in a browser tab via Vite + Babylon.js.

- `core/characterLoader.ts` — loads a character into a Babylon `Scene` via
  `SceneLoader.ImportMeshAsync`, returning its meshes, skeletons, and
  animation groups.
- `core/animationController.ts` — thin wrapper over Babylon `AnimationGroup[]`
  (`play(name?)`, `stop()`, `list()`).
- `shell/index.html` + `shell/main.ts` — owns the canvas, Babylon `Engine`,
  `ArcRotateCamera`, a hemispheric light, and the render loop; calls into
  `core/` to load the character and start its animation.
- `tools/convert_fbx_to_glb.py` — headless Blender script: imports the Mixamo
  FBX, exports GLB with animations included.
- `assets/source/Walking.fbx` — the raw Mixamo export (kept for
  reproducibility). `shell/public/characters/Walking.glb` — the converted
  asset Vite serves statically.

## Key decisions made

- **Rendering engine: Babylon.js** (`@babylonjs/core` + `@babylonjs/loaders`),
  locking in the "not yet decided" choice from CLAUDE.md's Stack section.
  Chosen over three.js — both would have worked for this milestone, but
  Babylon's glTF loader converts embedded animations directly into
  `AnimationGroup` objects, which maps cleanly onto Core's animation-playback
  responsibility without extra glue code.
- **Single package, no workspaces.** `core/` and `shell/` are folders in one
  npm package, not separate packages in a monorepo. CLAUDE.md is explicit that
  integration surface (which a workspace split implies) shouldn't be built
  before a real second consumer exists.
- **TypeScript.** Dev-only compile step (no runtime dependency), used for
  Core's public surface.
- **Real Mixamo → FBX → Blender → GLB conversion**, not a pre-converted sample
  asset. The milestone's stated goal was proving that exact pipeline, so the
  extra step of scripting a Blender headless conversion was taken deliberately
  rather than shortcutting to a stock glTF sample.

## What was tried and rejected

- Using an already-converted, Mixamo-sourced sample glTF (e.g. a bundled
  three.js example asset) to get pixels on screen faster. Rejected because it
  would have skipped the actual FBX→glTF export/conversion step this milestone
  exists to prove.

## How it was verified

- `npm run dev` (Vite dev server) started cleanly; `tsc --noEmit` passed.
- Headless Chromium (via a one-off Playwright script — no `chromium-cli`
  available in this environment) loaded the page and captured two screenshots
  ~1s apart: the character mesh was visible in both, and the pose visibly
  changed between them (leg/arm positions swapped), confirming the walk
  animation was actually playing rather than a static T-pose.
- Browser console was checked for errors: none — only Babylon's own startup
  log line and benign WebGL performance warnings.

## Known rough edges for later milestones

- Blender's FBX importer emitted repeated `WARNING: User property type
  'Short' is not supported` messages during conversion. Cosmetic — the
  conversion succeeded and the animation plays correctly — but worth
  revisiting if a future Mixamo asset fails to convert cleanly.
- The character filename (`Walking.glb`) is currently hardcoded as a constant
  in `shell/main.ts`. Fine for a single hardcoded character; will need to
  become configurable once Milestone 3+ introduces multiple
  characters/equipment.
