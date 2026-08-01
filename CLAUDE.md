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
  skeleton via `ImportAnimationsAsync`, matching targets by node name.
  `ImportAnimationsAsync` has a side effect worth knowing about: internally
  it loads the clip into a temporary `AssetContainer` and retargets it via
  `mergeAnimationsTo`, which starts a raw `Animatable` per animated target
  via `scene.beginAnimation()` to preview the container's own
  already-playing state (confirmed by patching `scene.beginAnimation` and
  capturing a stack trace — every extra call traced back through
  `mergeAnimationsTo`). These are separate from, and invisible to, the
  `AnimationGroup` the caller actually controls — pausing/stopping that
  group does nothing to them, and left alone they run forever, permanently
  overwriting the skeleton every frame regardless of what's selected
  (confirmed the hard way: with the intended group paused, bone rotations
  kept drifting ~17 degrees every 300ms, and two paused screenshots 800ms
  apart came out pixel-different). `stopOrphanedAnimatables(scene)` stops
  any `scene.animatables` entry not owned by an `AnimationGroup`; call it
  every frame (see `main.ts`'s `onBeforeRenderObservable`), not once after
  loading — a one-shot sweep, even deferred to the next actual render frame,
  consistently missed roughly a third of them no matter where in the
  loading sequence it ran, so the invariant is continuously re-enforced
  instead of relying on a one-shot cleanup catching a moving target.
  `stripScaleAnimations(scene)` removes every `AnimationGroup`'s
  `targetedAnimation` whose `animation.targetProperty === "scaling"` —
  Mixamo/Blender bakes a constant (1,1,1) scale channel onto every bone in
  every clip even though nothing ever animates scale, which is *why*
  body-shape scaling previously needed reapplying every frame (the
  animation system kept overwriting `.scaling` with this baked constant).
  This has a second, more serious consequence beyond the live preview:
  `GLTF2Export.GLBAsync` (see `exporter.ts` below) serializes
  `scene.animationGroups` faithfully, so without stripping these channels
  first, any body-shape customization would be silently discarded the
  instant a downstream game engine plays one of the exported clips — an
  animated channel overrides a node's static property value while that
  animation plays, standard glTF/engine behavior, confirmed by exporting a
  customized character and parsing the resulting GLB's JSON chunk
  directly: zero scale channels, and the customized node's static `scale`
  correctly reflects the customization. Called once, right after all
  clips are loaded, before any group has started playing (removing a
  targeted animation from a group that's already playing would be
  unverified territory — this project always does it before `.play()` is
  ever called). Since the channel is provably constant, removing it
  changes no visible motion, and once it's gone, `applyBodyPart` only
  needs to run when a slider actually changes (`setBodyPart` in
  `main.ts`), not every frame — confirmed by watching a bone's `.scaling`
  hold steady across 1.5s of active Running playback with no per-frame
  reapplication at all.
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
  `stripPositionAnimations(scene, boneNames)` (added for translation-based
  body-shape length, see `bodyShape.ts`/`main.ts` below — unlike
  `stripScaleAnimations`, this only strips the *named* bones' translation
  channels, never rig-wide: `Hips` carries genuine root-motion translation
  that must not be stripped, confirmed by parsing a clip's raw keyframe
  data directly — Hips' translation channel varies by several units across
  a clip, while every other bone checked has only 2 identical keyframes,
  the same dead-weight-constant pattern `stripScaleAnimations` handles for
  scale),
  `animationController.ts` (wraps
  `AnimationGroup[]` — `play(name?)`, `next()` to cycle through all loaded
  clips, `stop()`, `list()`, `setSpeed(ratio)` sets `speedRatio` on every
  group, not just the currently playing one — `AnimationGroup.play()` reads
  its own stored `speedRatio` when (re)starting, so setting it on all groups
  up front means switching animations afterward (GUI button, spacebar)
  keeps the chosen speed without reapplying it per switch. `pause()`/
  `resume()`/`togglePause()`/`isPaused()` control the currently-selected
  group only; `isPaused()` derives from Babylon's own state
  (`isStarted && !isPlaying`, since `isPlaying` is itself defined as
  `isStarted && !isPaused` — no public `isPaused` getter exists) rather than
  tracking a separate flag that could drift out of sync.
  `stepFrame(delta)` steps to the previous/next *actual authored keyframe*,
  not a fixed frame offset: inspecting `getKeys()` on the source clips found
  keys baked roughly 2 frame-units apart, not 1, so a fixed delta of 1 would
  land between two keyframes instead of on one — it finds the keyframe
  nearest the current position (in case playback was paused
  mid-interpolation) and moves exactly one keyframe index from there,
  wrapping around at either end (stepping back from frame 0 goes to the
  last keyframe, stepping forward from the last keyframe goes to frame 0)
  rather than clamping; pauses first if not already paused, since
  stepping while playing doesn't make sense. `getCurrentFrame()` returns the
  selected group's frame, rounded — the source clips' authored keyframe
  times carry floating-point noise (e.g. `63.9999980926513672`), so an
  unrounded readout would show a confusing near-integer instead of the
  actual keyframe number. `getCurrentGroup()` exposes the raw selected
  `AnimationGroup` for callers needing lower-level access than the wrapper
  methods provide — used by `legIK.ts`'s per-frame solve, which needs the
  precise unrounded frame to sample the baseline (see `legIK.ts` below)),
  `bodyShape.ts`
  (`getBoneNode(skeleton, name)` —
  shared lookup, throws if the bone or its linked `TransformNode` is missing;
  `scaleBodyPart(skeleton, boneNames, length, width)` sets each named bone
  node's local scale directly — Y is the bone-length axis, X/Z are width,
  confirmed rig-wide by inspecting bone-to-child local translations, not
  assumed. This used to be the primary body-shape mechanism (every part,
  both Length and Width); as of Milestone 6's translation-based rewrite
  (`0.6.22`–`0.6.26`, see `docs/other/PLAN_translation_based_body_shape.MD`
  and `docs/other/LEG_BODY_SHAPE_MATH.md` for the full history that led
  here) it survives only as the fallback for labels with no translation
  target — `width` is always passed as `1` now, since Width no longer
  exists as a user control anywhere;
  `captureRestTranslations(skeleton, boneNames)` / `translateBodyPart(skeleton,
  boneNames, restTranslations, length)` are the *current* primary length
  mechanism: `translateBodyPart` sets each named node's local `.position.y`
  to `restTranslations[name].y * length`, leaving X/Z untouched.
  **Critical, non-obvious rule**: a bone's own visual length (the segment
  from its own joint to its child's joint) lives in its *child's*
  translation, not its own — confirmed by parsing `Walking.glb`'s raw node
  data directly, and re-derived per bone group rather than assumed to
  generalize (a first attempt targeting `mixamorig:LeftLeg`'s own
  translation for the "Lower Leg" (shin) control actually moved the
  *thigh*, since `LeftLeg`'s translation is `LeftUpLeg`'s length — the
  correct shin target is `LeftFoot`'s translation, one level further down
  the chain). This has real structural fallout: **leaf bones** (no
  children — Lower Foot's `Toe_End`) have no node to carry a
  translation-based length at all, and stay on `scaleBodyPart` permanently
  (safe: nothing is compensated against a leaf's own non-uniformity, so
  there's no shear risk either); bones with **multiple children** (Hips —
  `LeftUpLeg`/`RightUpLeg`/`Spine`; Hand — five fingers) have no single
  child to represent "this label's length", so their control instead
  scales *all* of their direct children's rest translations proportionally
  by the same ratio (`lengthBones` naming every child); and multi-segment
  **chain controls** (Spine, each Finger) need every segment's
  length-carrying child listed explicitly in `lengthBones`, since
  translation — unlike Scale — doesn't cascade down a hierarchy on its
  own, so a single root-bone entry no longer stretches the whole chain for
  free the way scaling did. Reasoned through and empirically confirmed
  bone-by-bone in `main.ts`'s `BODY_PART_CONFIG` (see below) — this file
  documents the *mechanism*, `main.ts` documents *which bone maps to
  which*.
  Translation-based length has one asset-level limitation worth knowing
  before assuming a visual gap is a code bug: this rig's mesh has **zero
  blended skin weights at any joint** (confirmed by parsing both mesh
  primitives' raw `JOINTS_0`/`WEIGHTS_0` vertex data directly — every
  vertex is influenced by exactly one bone). Scale-based length used to
  stretch a bone's own weighted vertices continuously; translation-based
  length only *repositions* the child joint, so on a hard-boundary-skinned
  mesh it will always show a visible gap at non-1.0 values, at any bone —
  confirmed and explicitly accepted as a known, deferred asset limitation
  (re-skinning the mesh with blended joint weights, or replacing it, would
  resolve it; not attempted as part of this rewrite),
  `exporter.ts`
  (`exportCharacter` calls `GLTF2Export.GLBAsync`, excluding nodes via a
  caller-supplied `shouldExportNode`, and builds a minimal manifest — source
  character file, included animation names, equipped item names; returns the
  raw `GLTFData` + manifest rather than triggering a download itself, since
  "how to deliver the export" is a Shell/host concern, not Core's), `types.ts`.
  Operates on Babylon `Scene`/`AnimationGroup` objects (the rendering engine is
  a locked architectural decision, not "app UI") but has no DOM/UI-panel code
  and no assumptions about how it's hosted.
- `core/legIK.ts` — real per-frame two-bone IK foot-locking on the leg → foot
  chain, using Babylon's built-in `BoneIKController` rather than hand-rolled
  law-of-cosines (reuses a shipped, tested solver). Replaces an earlier
  scalar root-offset system entirely (see `LEG_BODY_SHAPE_MATH.md` for that
  system's own history) — that approach sampled foot-height delta against
  whichever clip was selected when a slider moved, so it silently broke the
  moment the user switched to a different animation afterward; real IK
  fixes this by solving fresh against a per-clip baseline every frame,
  regardless of which clip is currently playing.
  `captureLegBaseline(group, skeleton, ikSpace, hipBone, kneeBone, ankleBone,
  sampleCount)` samples a clip's full frame range once, right after load
  and before any body-shape edit, recording the ankle's and knee's position
  *relative to the hip* at each sampled frame — the fixed anatomical target
  every subsequent leg-length customization gets solved against, independent
  of proportions. **`AnimationGroup.goToFrame` is a no-op until the group
  has been started at least once** (confirmed by reading
  `animationGroup.pure.js`: `if (!this._isStarted) return this;`) — baseline
  capture originally ran before `AnimationController.play()` had started
  any group, so every scrub silently did nothing; fixed by having
  `captureLegBaseline` call `group.play(false)` before scrubbing.
  `sampleLegBaseline(samples, frame)` linearly interpolates between the two
  bracketing samples for a live (continuous) playback frame.
  `syncBonesFromLinkedTransformNodes(skeleton)` replicates just the
  bone-sync half of `Skeleton.prepare()` (copy `.position`/
  `.rotationQuaternion`/`.scaling` from each bone's linked `TransformNode`,
  then `computeAbsoluteMatrices(true)`) without its skin-matrix-computation
  half — needed because `prepare()` itself doesn't run until later in the
  frame (during mesh rendering) than `onBeforeRenderObservable`, so a
  Bone-level read at that point would see last frame's stale pose; calling
  the *real* `prepare()` here would also freeze in the pre-IK pose for that
  frame's render, since Babylon's own later `prepare()` call would then see
  the render ID already matches and skip re-running.
  `createLegIKChain(ikSpace, kneeBone)` constructs a `BoneIKController`
  (bone1/thigh is auto-inferred as the knee bone's parent), overriding its
  default pole-target-tracks-Hips behavior (`poleTargetBone = null`) so the
  per-frame solve's own baseline-derived pole target takes effect instead.
  **`ikSpace`** is the single most important, least obvious piece of this
  module: an inert, never-parented, identity-transform `TransformNode`,
  created solely to satisfy `BoneIKController`'s non-nullable `mesh`
  constructor argument — deliberately *not* the real character mesh. This
  rig's scene-graph root (`__root__`, above the `Armature` node that
  carries the actual ~0.01 import scale) has a mirrored `[1,1,-1]` scale, a
  Blender FBX→glTF conversion artifact. Bridging `BoneIKController`'s
  world-space rotation math through the real, mirrored mesh corrupts it:
  confirmed empirically that a single `controller.update()` call left a
  bone's `.scaling` at `~100` — the exact inverse of the rig's import
  scale — instead of its correct `1`, collapsing the whole leg into the
  hip; root-caused by reading `Bone._rotateWithMatrix`'s source, whose
  world-space path round-trips a `parentScale`/`parentScaleInv` derived
  from the bridging node's world matrix, and silently fails to cancel back
  to the original scale when that matrix has a mirrored (negative-
  determinant) component. Bridging through `ikSpace` instead sidesteps the
  mirrored determinant entirely, since it carries no scale or mirror at
  all — confirmed empirically too: a no-op target (set to the foot's own
  current position) left the foot exactly in place and bone `.scaling`
  unchanged at `[1,1,1]`. A corollary: since `ikSpace` deliberately
  excludes `rootNode`'s Size scaling, the per-frame target/pole
  computation must **not** multiply the baseline offset by `sizeValue` —
  Size is scale-invariant for this solve (same triangle, rendered bigger
  later), and double-counting it was confirmed to push the target past
  what the (correctly Size-independent) measured bone lengths could reach,
  dipping the foot below ground specifically at combined extreme leg-length
  + Size values.
  `updateLegIK(controller, ikSpace, hipBone, baselineSample)` is the
  per-frame solve: reads the *current* hip position (reflecting any
  Hips-region edits), adds the baseline offset, sets
  `targetPosition`/`poleTargetPosition`, calls `.update()`. Wired into
  `main.ts`'s `onBeforeRenderObservable`, same hook `stopOrphanedAnimatables`
  already runs in, after a `syncBonesFromLinkedTransformNodes` call.
  `BoneIKController` measures both bone lengths once at construction and
  never refreshes them, so `main.ts`'s `rebuildLegIKChains` reconstructs
  (not mutates) both leg controllers — after a `syncBonesFromLinkedTransformNodes`
  call, so the measurement reflects whatever body-shape edit just
  happened — whenever a body-shape slider changes or Reset runs.
  Ankle/foot rotation is left untouched (position-only correction) — this
  was confirmed sufficient visually through a full gait cycle, so no
  explicit ankle-orientation correction was added.
  `bakeLegIKIntoAnimations(group, skeleton, ikSpace, legs, frameStep)`
  exists because `GLTF2Export.GLBAsync` only ever serializes each
  `Animation`'s existing authored keyframes — confirmed by reading
  `glTFAnimation.js` down to `Animation._interpolate`, it never samples
  live scene/bone state — so the per-frame IK correction above would
  silently vanish from any exported GLB without an explicit bake step. It
  samples every `frameStep` across a clip's full range (called with `1`,
  i.e. every integer frame), evaluates the live IK solve at each sampled
  frame, and replaces the hip/knee `rotationQuaternion` channels' keys via
  `Animation.setKeys` — the same primitive the exporter itself uses
  internally — returning a restore closure that puts the original keys
  back. This bakes in-place on the same live `Animation` objects the
  running app uses for playback, so `main.ts`'s `handleExport` calls it for
  *every* loaded clip (the manifest lists all of them, not just the one
  currently selected) inside a `try`/`finally`, restoring original keys and
  the visible clip's exact frame afterward regardless of whether export
  succeeds — confirmed the live app is left completely undisturbed by
  exporting (customization and playback both continue exactly as before).
- `shell/` — the standalone browser app. `index.html` + `main.ts` own the canvas,
  Babylon `Engine`/camera/light, and render loop, wire up spacebar (cycle
  animations) and `E` (toggle helmet) listeners, and call into `core/`.
  `ui.ts` + `ui.css` — the right-side control panel (`createControlPanel`):
  plain DOM, no framework, one button per loaded animation, a Speed slider
  (0.5–2.0, same range/style as Size and Body Shape) right below the
  animation buttons calling `animationController.setSpeed` on input, a
  Pause/Play toggle button below that (label reflects the action, like the
  sun toggle — "Pause" while playing, "Play" while paused) calling
  `animationController.togglePause`, and a `◀ Frame` / `Frame ▶` button pair
  calling `animationController.stepFrame(-1)`/`stepFrame(1)`, and a
  `Frame: N` readout below that, updated every frame from
  `animationController.getCurrentFrame()` in the same
  `onBeforeRenderObservable` callback that reapplies body-shape scaling and
  sweeps orphaned animatables — so it tracks accurately whether playing,
  paused, or stepping, without needing its own separate update path; useful
  for pinning down exactly which frame looks wrong when stepping through
  manually. `main.ts`'s
  `syncPauseUI` re-reads `animationController.isPaused()` into the button
  label after anything that can change play state — selecting an animation,
  the spacebar shortcut, stepping a frame, and Reset — since those don't
  go through `togglePause` themselves. One toggle button per item in a
  caller-supplied `equipmentItems` list, a Size
  slider (0.5–2.0), and an Export button; `main.ts` keeps an `equippables` list
  (currently Helmet, Right Sword, Left Sword) and a single
  `setEquippableState` function so every toggle path (GUI button or the `E`
  key) stays in sync. Sizing: `main.ts` captures `character.rootNode.scaling`
  once at load as the "1.0" baseline, then sets `rootNode.scaling =
  baseline.scale(sliderValue)` on input — equipment scales proportionally for
  free (see `loadEquipment`/`loadProp` above). Body Shape: a "Body Shape"
  section with a single Length slider per bone group (Width was removed
  rig-wide in the translation-based rewrite — see `bodyShape.ts` above —
  so there's no longer a length-vs-width distinction for the UI to have an
  opinion about) — 18 groups, each defined in `main.ts`'s
  `BODY_PART_CONFIG` as either `lengthBones: string[]` (the current,
  translation-based mechanism — child nodes whose rest translation *is*
  this label's length, one or more of them: a single child for a simple
  bone, several for a fan-out control like Hips/Hand, several chained ones
  for a multi-segment control like Spine/Fingers) or `bones: string[]`
  (the `scaleBodyPart` fallback, permanently for the one leaf bone with no
  translation target — Lower Foot — width pinned to `1`). Bone names are
  Shell's concern, not Core's, same as equipment bone names like
  `"mixamorig:RightHand"`. Tabs: split across 6 (Legs, Foot, Arms, Hand,
  Fingers, Torso) in `ui.ts` — one tab-button row plus one show/hide
  container per tab, tab order fixed by `BODY_SHAPE_TAB_ORDER` independent
  of `BODY_PART_CONFIG`'s own key order. `HeadTop_End` (child of `Head`)
  was deliberately not added as a control: checking both meshes'
  `JOINTS_0`/`WEIGHTS_0` vertex attributes found zero vertices bound to it,
  so a slider there would be a visual no-op (it's still used structurally,
  though, as `Head`'s own `lengthBones` target). `applyBodyPart` calls
  `translateBodyPart` (or the `scaleBodyPart` fallback) only when a slider
  actually changes — translation-based length needs no per-frame
  reapplication, same reasoning as Scale's (see `bodyShape.ts` above);
  slider callbacks go through a `setBodyPart` wrapper that reapplies every
  label (simpler than tracking exactly which labels affect which others)
  and then unconditionally rebuilds both leg IK chains (`legIK.ts`'s
  `rebuildLegIKChains` — cheap, and simpler than tracking exactly which
  labels affect leg length). A Reset button (`main.ts`'s `resetAll`)
  restores Size, every Body Shape slider, equipment, sun, and animation to
  their load-time defaults in one step, then also rebuilds both leg IK
  chains. `panel.resetControls()`
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