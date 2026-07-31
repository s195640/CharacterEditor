# Milestone 2: Animation switching on the character

## What was built

The character from Milestone 1 (`Walking.glb`) now has two additional Mixamo
animations — Idle and Running — retargeted onto its existing skeleton at
runtime, and a spacebar keypress cycles through all three in a loop.

- `core/characterLoader.ts` — added `loadAnimationClip(scene, rootUrl,
  fileName)`, wrapping `SceneLoader.ImportAnimationsAsync` with
  `animationGroupLoadingMode: NoSync` so it adds a new `AnimationGroup` instead
  of disposing previously loaded ones. Retargets by matching node names against
  the skeleton already loaded by `loadCharacter`.
- `core/animationController.ts` — added `next()`, which advances an internal
  index modulo the group count, stops all groups, and plays the selected one
  in a loop. `play(name?)` keeps that index in sync so `next()` continues from
  wherever an explicit `play()` left off.
- `shell/main.ts` — loads `Walking.glb` (character), then `Idle.glb` and
  `Running.glb` (animation-only clips) via `loadAnimationClip`, builds the
  `AnimationController` from `scene.animationGroups` (all three clips), and
  adds a `keydown` listener that calls `next()` on spacebar.
- `tools/convert_fbx_to_glb.py` — now takes a third argument, `clip_name`, and
  renames the imported Blender action to it before export (see gotcha below).
- `assets/source/{Idle,Running}.fbx` — downloaded "Without Skin" (skeleton +
  animation only, no mesh), since `ImportAnimationsAsync` never touches mesh
  data. Converted to `shell/public/characters/{Idle,Running}.glb` — both under
  160KB, versus `Walking.glb`'s ~2.2MB with the full skinned mesh.

## Key decisions made

- **`ImportAnimationsAsync` retargeting over Blender action-merging.** Convert
  each animation to its own small GLB and retarget at runtime in Babylon,
  rather than merging multiple Mixamo actions onto one armature in Blender and
  shipping a single combined GLB. Confirmed via the Babylon.js forum that
  `ImportAnimationsAsync` is the documented, semantic way to load animation-only
  assets and retarget them by node name — no custom `targetConverter` was
  needed, since Mixamo rigs use consistent bone names across exports of the
  same character.
- **Without Skin downloads for the second/third animations** — smaller files,
  and correct given the mesh is never used for these.

## What was tried and rejected

Nothing at the architecture level — the `ImportAnimationsAsync` approach agreed
before implementation worked, once two runtime bugs (below) were fixed.

## Gotchas actually hit (this is the useful part)

Two distinct Babylon.js API defaults fought the intended behavior, both
discovered by instrumenting `scene.animationGroups.length` after each load
step rather than trusting the absence of console errors:

1. **`animationGroupLoadingMode` defaults to `Clean`** — "reset all old
   animations to initial state then dispose them." This is a separate
   parameter from `overwriteAnimations`; passing `overwriteAnimations: false`
   alone does *not* stop old groups from being disposed. Fix: pass
   `SceneLoaderAnimationGroupLoadingMode.NoSync` ("old animations remain
   untouched") explicitly as the 5th argument.
2. **Mixamo's action name is always `Armature|mixamo.com|Layer0`**, regardless
   of which animation you picked on mixamo.com. Even with `NoSync` fixed, this
   was a red herring worth ruling out separately: identical clip names across
   files raised the question of whether Babylon deduplicates/merges
   same-named groups. It turned out not to matter once `NoSync` was set — but
   the Blender conversion script now renames the action to a unique,
   meaningful name (`Walking`/`Idle`/`Running`) regardless, since generic
   names would have made `animationController.list()` and `play(name)`
   useless for debugging or explicit selection.
3. **Stale dev server on a stale port.** Mid-debugging, an old `npm run dev`
   process was still holding port 5173, so a newer instance silently moved to
   5174 while verification scripts kept hitting the old one on 5173 — making a
   real fix look like it had no effect. Killing anything listening on
   5173–5175 before each verification run resolved it.

## How it was verified

- `tsc --noEmit` passed throughout.
- A temporary debug hook (`window.__debug = { scene, animationController }`,
  removed before merging) let a Playwright script inspect
  `scene.animationGroups` directly — group count, names, and
  `targetedAnimations` null-target count — to diagnose the two bugs above
  before trusting any visual check.
- Final visual verification: headless Chromium loaded the page, screenshotted
  the walking pose, sent a spacebar keypress, screenshotted again (idle
  stance — arms at sides, no stride), pressed spacebar again, screenshotted a
  third time (running pose — pumping arms, longer stride). All three poses are
  visibly distinct. Browser console showed no errors or retargeting warnings
  (`nullTargets: 0` for all three groups).
