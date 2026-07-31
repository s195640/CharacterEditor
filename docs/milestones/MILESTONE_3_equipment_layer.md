# Milestone 3: One swappable equipment layer

## What was built

A simple placeholder helmet — a small sphere — that shares the character's
existing skeleton and deforms with it through animation switches, toggleable
on/off with a keypress.

- `tools/make_equipment_placeholder.py` — new headless Blender script. Imports
  a reference FBX (`assets/source/Idle.fbx`, skeleton only) to get the exact
  armature, creates a sphere at a given bone's rest position (`mixamorig:Head`),
  skins it 100% to that bone via a vertex group, parents it to the armature,
  and exports mesh + full armature as GLB. Produced
  `shell/public/characters/Helmet.glb`.
- `core/characterLoader.ts` — added `loadEquipment(scene, rootUrl, fileName,
  targetSkeleton)`: imports the equipment mesh normally (which brings its own
  duplicate skeleton), reassigns each mesh's `.skeleton` to the character's
  already-loaded skeleton, disposes the duplicate, and returns the meshes.
- `shell/main.ts` — loads `Helmet.glb` bound to the character's skeleton,
  starts it hidden, and toggles visibility on `KeyE`, independent of the
  existing `Space` animation-cycle listener.

## Key decisions made

- **Placeholder mesh authored in Blender, not a sourced asset.** A sphere
  standing in for a helmet proves the mechanism without an asset-sourcing
  detour — same reasoning as Milestone 1's "built-in sample is fine."
- **Toggle on/off, not swap between two items** — simplest proof that a
  separate skinned mesh can share the skeleton and move with the animation.
- **Reuse the same armature import for authoring, not a fresh one.** The
  Babylon.js forum's documented technique for sharing a skeleton across
  meshes (`mesh.skeleton = existingSkeleton`) has a hard requirement: the
  equipment must be skinned against the full bone hierarchy, in the same
  order, or synchronization breaks. `make_equipment_placeholder.py` imports
  the reference FBX and builds the equipment mesh inside that same Blender
  session — the exported armature is byte-for-byte the same data, not a
  recreated one, so bone order is guaranteed to match.

## What was tried and rejected

Nothing at the architecture level — this was researched (Babylon.js forum:
"applying the same skeleton to multiple meshes") before implementation, and
the approach worked on the first real test.

## How it was verified

- `tsc --noEmit` passed.
- Headless Chromium (Playwright), five checkpoints:
  1. Page loaded, helmet hidden by default.
  2. `E` pressed — helmet visible, correctly seated on the head during Walking.
  3. `Space` pressed (switch to Idle) — helmet still correctly seated, moved
     with the head into the idle stance.
  4. `Space` pressed again (switch to Running) — helmet still correctly
     seated, moved with the head tilted forward into the running pose. This
     is the real proof: the equipment tracks the skeleton through an
     animation change, not just a static overlay screenshot.
  5. `E` pressed again — helmet hidden again, character otherwise unaffected.
- Browser console showed no errors throughout.
