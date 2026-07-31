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
2. **Git writes are branch-gated, not fully manual — see Git Workflow below.**
   Never commit or merge directly to `main`. Never force-push, skip hooks
   (`--no-verify`), bypass signing, or rewrite already-pushed history, regardless
   of the standing permission below.
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
- Rendering engine: **Babylon.js** (`@babylonjs/core` + `@babylonjs/loaders` +
  `@babylonjs/serializers`), decided in Milestone 1, export support added in
  Milestone 5. Uses `SceneLoader.ImportMeshAsync` for glTF/GLB,
  `AnimationGroup` for playback, `GLTF2Export.GLBAsync` for export.
- Equipment approach: skinned mesh layers sharing the character's skeleton for
  anything that deforms with the body (clothing, armor — built in Milestone 3);
  rigid props parented to a bone's linked `TransformNode` (`bone.getTransformNode()`,
  plain `mesh.parent =`, not `attachToBone` — that mechanism tracks the bone fine
  live but is invisible to the glTF exporter) for anything that doesn't (weapons,
  shields — added post-Milestone-5, patch `0.5.3`).
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
4. GUI controls for animation and equipment
5. Export to glTF + manifest
6. Generalize: more slots, more bodies, sizing

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

## Git Workflow

Every discrete unit of work — a full milestone or a smaller patch-level change —
follows the same branch-per-version flow. Branches are short-lived rollback
insurance, not a permanent parallel history: they always get merged back into
`main` and deleted, never left to diverge.

1. **Bump `VERSION` first** (per the Versioning rules above — Y and reset Z for
   a new milestone, otherwise Z for a patch-level change within the current
   milestone).
2. **Create a branch named exactly the new version** (e.g. `0.2.0`) off `main`.
3. **Make the changes on that branch, committing frequently** — small, logical
   commits as work progresses, not one bundle at the end.
4. **Push the branch to origin.**
5. **Verify the work actually runs** — build/typecheck must pass, and anything
   user-facing must be demonstrated working (run it, don't just assert it), per
   whatever definition of done applies to the task.
6. **Once verified, merge to `main`, push `main`, and delete the branch** (local
   and remote) — this step doesn't need a separate ask; verification passing
   *is* the approval. If verification fails, the branch stays unmerged and
   broken on its own branch — `main` is never touched by unverified work.

Standing safety rules that still apply regardless of the above: never
force-push, never skip hooks or bypass signing, never rewrite history already
pushed to a branch, and always confirm before anything destructive that isn't
part of this flow (e.g. deleting a branch that turned out to have unmerged work
worth keeping).

The `CharacterEditor.code-workspace` "Git: Push" task (add-all, commit "Release
version X", push) predates this flow and assumed direct-to-main commits. It
still exists as a manual fallback for edits made outside a Claude session, but
Claude follows the branch flow above instead of using it.

---

## Repo layout

Established in Milestone 1 — single package, no workspaces/monorepo split (no
second consumer exists yet to justify one):

- `core/` — Core logic. `characterLoader.ts` (`loadCharacter` loads a character
  via Babylon's `SceneLoader` and returns a `rootNode` — the parentless node
  at the top of the whole hierarchy (usually the loader's synthetic
  `__root__`, found by checking both `result.meshes` and
  `result.transformNodes` since it isn't always a `TransformNode`); scaling
  `rootNode` resizes the entire character (see Sizing below);
  `loadAnimationClip` retargets an animation-only glTF onto an already-loaded
  skeleton via `ImportAnimationsAsync`, matching targets by node name;
  `loadEquipment` loads a skinned equipment mesh, rebinds it onto an
  already-loaded skeleton (discarding the duplicate skeleton the glTF brings
  with it — only correct if authored against the same bone hierarchy/order,
  see `tools/make_equipment_placeholder.py`), **and reparents the mesh onto
  the character's own skinned mesh's parent** (i.e. wherever that mesh
  actually sits, e.g. one level below `rootNode` — not `rootNode` directly).
  This matters: the character's mesh and the skeleton's bones share one
  reference frame; parenting equipment onto `rootNode` directly puts its
  transform in a *different* frame than the skin matrices operate in and
  corrupts the result (confirmed the hard way — bounding info showed a
  24-unit box ~160 units from the character before this fix); `loadProp`
  loads a rigid unskinned prop and parents it to `bone.getTransformNode()` —
  plain reparenting, not `attachToBone`, because the exporter's scene-graph
  walk doesn't see attachToBone'd nodes at all — compensating scale by the
  bone node's inverse `absoluteScaling`, computed once at load time so it
  keeps tracking proportionally if the character is rescaled afterward),
  `animationController.ts` (wraps
  `AnimationGroup[]` — `play(name?)`, `next()` to cycle through all loaded
  clips, `stop()`, `list()`), `bodyShape.ts` (`getBoneNode(skeleton, name)` —
  shared lookup, throws if the bone or its linked `TransformNode` is missing;
  `scaleBodyPart(skeleton, boneNames, length, width)` reshapes a body part by
  scaling each named bone's node — Y is the bone-length axis and X/Z are
  width, confirmed rig-wide by inspecting bone-to-child local translations,
  not assumed. Must be reapplied every frame via
  `scene.onBeforeRenderObservable`, not just once on slider input: the
  retargeted animations' baked glTF data includes a constant scale=1 track on
  every bone, which silently overwrites any one-time manual scaling within a
  frame or two. Any bone between the hips and the toe (Upper Leg, Lower Leg,
  Feet) also needs a **ground-height compensation**, applied in `main.ts`:
  lengthening one pushes the foot further from the hip — i.e. down, through
  the ground — since legs hang downward, not the character growing taller
  with feet planted. A first attempt derived the expected compensation from
  rest-pose bone offsets times the hips' `absoluteScaling`; that value turned
  out unreliable for a bone-linked node (read back as a bare `1` at rest,
  didn't scale proportionally once actually stretched) — confirmed by
  comparing predicted vs. actual foot-drop across several slider values,
  which diverged non-linearly. A second attempt measured the foot's world
  position every frame and forced it to a fixed height continuously; that
  "worked" in Idle but fought the character's own gait during Running (a
  run cycle lifts each foot off the ground for part of its cycle by design)
  — locking the left foot flat forced the whole character to bob to
  compensate, which threw the right foot's independent swing out of sync
  and dropped it below the ground (confirmed: right toe swung from -0.62 to
  +0.62 world-Y over one running cycle with zero body-shape sliders
  touched). The robust fix measures the foot's height immediately before
  and after applying a scale change — both reads forced via
  `computeWorldMatrix(true)` and taken synchronously within the same tick,
  so the delta reflects only the scale change, not gait motion — and
  accumulates that delta into `rootNode.position.y`. This runs only from the
  slider callbacks, not the per-frame loop, so gait motion is left
  untouched; this is also why splitting Legs into Upper/Lower and adding a
  separate Feet control needed no changes to the compensation logic at all,
  only to the bone-name list),
  `exporter.ts`
  (`exportCharacter` calls `GLTF2Export.GLBAsync`, excluding nodes via a
  caller-supplied `shouldExportNode`, and builds a minimal manifest — source
  character file, included animation names, equipped item names; returns the
  raw `GLTFData` + manifest rather than triggering a download itself, since
  "how to deliver the export" is a Shell/host concern, not Core's), `types.ts`.
  Operates on Babylon `Scene`/`AnimationGroup` objects (the rendering engine is
  a locked architectural decision, not "app UI") but has no DOM/UI-panel code
  and no assumptions about how it's hosted.
- `shell/` — the standalone browser app. `index.html` + `main.ts` own the canvas,
  Babylon `Engine`/camera/light, and render loop, wire up spacebar (cycle
  animations) and `E` (toggle helmet) listeners, and call into `core/`.
  `ui.ts` + `ui.css` — the right-side control panel (`createControlPanel`):
  plain DOM, no framework, one button per loaded animation, one toggle button
  per item in a caller-supplied `equipmentItems` list, a Size slider
  (0.5–2.0), and an Export button; `main.ts` keeps an `equippables` list
  (currently Helmet, Right Sword, Left Sword) and a single
  `setEquippableState` function so every toggle path (GUI button or the `E`
  key) stays in sync. Sizing: `main.ts` captures `character.rootNode.scaling`
  once at load as the "1.0" baseline, then sets `rootNode.scaling =
  baseline.scale(sliderValue)` on input — equipment scales proportionally for
  free (see `loadEquipment`/`loadProp` above). Body Shape: a "Body Shape"
  section with a Length + Width slider each for Upper Arm, Lower Arm, Upper
  Leg, Lower Leg, Neck, Feet, Head, and Belly (bone-name groups defined in
  `main.ts` as `BODY_PART_BONES` — Shell's concern, not Core's, same as
  equipment bone names like `"mixamorig:RightHand"`), calling `scaleBodyPart`
  every frame via `scene.onBeforeRenderObservable` (see `bodyShape.ts` above
  for why "every frame" instead of once); slider callbacks go through a
  `setBodyPart` wrapper that also applies the ground-height compensation
  this list's leg/foot entries need (see `bodyShape.ts` above). A Reset
  button (`main.ts`'s `resetAll`) restores Size, every Body Shape slider,
  equipment, sun, and animation to their load-time defaults in one step —
  it sets the known-default values directly (scale 1, `groundOffset = 0`,
  `rootNode.position.y = baseRootY`) rather than routing through
  `setBodyPart`'s before/after measurement, since that measurement is
  pose-dependent (accurate for one incremental change, but doesn't cancel
  exactly when undoing several at once from a different animation pose
  than they were originally set from — confirmed: resetting from Running
  left a residual ~0.5 unit offset when going through `setBodyPart`, gone
  once Reset set the defaults directly instead). `panel.resetControls()`
  syncs the sliders' visual positions back to 1 without re-triggering
  their input handlers. `main.ts` also triggers
  the actual downloads after calling `exportCharacter` (`gltfData.downloadFiles()`
  for the `.glb`, a small Blob-anchor helper for `character.manifest.json`).
  `shell/public/characters/*.glb` — converted character/animation/equipment
  assets, served as static files by Vite.
- `assets/source/` — raw Mixamo FBX exports, kept for reproducibility of the
  conversion step.
- `tools/convert_fbx_to_glb.py` — headless Blender script (`bpy`) that imports an
  FBX, renames the action to a given clip name (Mixamo always names it
  `Armature|mixamo.com|Layer0` regardless of animation — same name across clips
  makes Babylon's animation-group loading collide/overwrite unless renamed), and
  exports GLB with animations; run via
  `blender --background --python tools/convert_fbx_to_glb.py -- <in.fbx> <out.glb> <clip_name>`.
- `tools/make_equipment_placeholder.py` — headless Blender script that imports
  a reference FBX to get the exact armature (reusing it, rather than creating
  a new one, guarantees the same bone order as the character), creates a small
  sphere at a given bone's rest position, skins it 100% to that bone, and
  exports mesh + full armature as GLB; run via
  `blender --background --python tools/make_equipment_placeholder.py -- <ref.fbx> <out.glb> <bone_name>`.
- `tools/make_prop_placeholder.py` — headless Blender script for rigid
  (unskinned) props: builds a simple mesh with no armature, grip end at local
  origin (0, 0, 0), since `loadProp` treats the mesh's own transform as an
  offset from whatever bone it's parented to at runtime; run via
  `blender --background --python tools/make_prop_placeholder.py -- <out.glb> <length>`.
- `docs/milestones/` — established (see Versioning & Milestone Summaries above).
- Root: `package.json`, `tsconfig.json`, `vite.config.ts` (`root: 'shell'`).

Don't invent a second, competing structure in a later task — extend this one.

---

## Keeping this file current

No separate status-tracking doc. When a decision above moves from open to locked
(engine gets chosen, Core's public surface takes shape, etc.), update the relevant
section here as part of that task. This file should always reflect what's actually
true, not what was true when it was written.