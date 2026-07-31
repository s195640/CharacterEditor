# Milestone 6 (slice 1): Character sizing

## What was built

A Size slider (0.5–2.0) in the control panel that resizes the character
live, with all equipped items (Helmet, Right Sword, Left Sword) scaling
proportionally along with it.

- `core/types.ts` — `CharacterHandle` gained `rootNode: TransformNode`.
- `core/characterLoader.ts` — `loadCharacter` finds the root by checking both
  `result.meshes` and `result.transformNodes` for the one parentless node
  (usually the loader's synthetic `__root__`, a `Mesh`, not a
  `TransformNode`). `loadEquipment` now also reparents its mesh onto that
  root node (see gotcha below).
- `shell/ui.ts` — new "Size" section, a range input.
- `shell/main.ts` — captures `character.rootNode.scaling` once at load as the
  slider's "1.0" baseline, applies `baseline.scale(sliderValue)` on input.

## Key decisions made

- **Equipment scales with the body**, not fixed absolute size — confirmed
  with the user before implementation, since it's a real design fork (a
  giant character holding a tiny sword would look wrong).
- **Camera/ground don't auto-adjust to size** — accepted as a known, explicit
  limitation for this slice, not a bug. At larger sizes the character extends
  past the ground and closer to the camera than ideal.
- **Sizing tackled before "more slots" or "more bodies"** (the other two
  pieces bundled under the original "Generalize" roadmap item) because it's
  fully testable against the one existing body.

## What was tried and rejected

Nothing rejected outright, but the plan's own risk section flagged exactly
what happened: the math looked right on paper (Babylon's
`worldScale = parentScale × localScale` means a scale computed once at load
time keeps tracking proportionally without re-computation) and turned out to
be *half* right — correct for `loadProp` (rigid props parented to a bone),
wrong for `loadEquipment` (skinned equipment) until fixed. See gotcha below.

## Gotcha actually hit

Live-testing at different slider values revealed the Helmet detaching into a
floating sphere at the character's original position instead of resizing
with the head. Diagnosis (logging each equipment mesh's actual parent, not
guessing): the Helmet's mesh was parented to `Helmet.glb`'s own leftover
`Armature` node — a completely separate, unscaled hierarchy that `loadEquipment`
had only ever partially cleaned up (previously we disposed the duplicate
*Skeleton* object, but never touched the duplicate *scene-graph* root/armature
nodes it arrived with). Swapping `mesh.skeleton` alone fixes which bones drive
*deformation*, but the mesh's own base world matrix — combined with the skin
matrices for the final vertex positions — still came from its original,
never-rescaled parent chain. Fix: `loadEquipment` now also sets
`mesh.parent = characterRootNode` after swapping the skeleton, so the mesh's
own transform follows the character's root exactly like `loadProp`'s bone
attachment already did.

This didn't affect earlier milestones because the character was never
resized before — the bug was latent (the Helmet's mesh was always sitting at
a position that happened to look right at the default, unscaled import
transform) until sizing gave a reason to actually move the root.

## How it was verified

- `tsc --noEmit` passed.
- Headless Chromium (Playwright): equipped Helmet + both swords, screenshotted
  at the default slider value, then at 1.8 (large) and 0.6 (small), then back
  to 1.0. At every size, the character and all three equipped items scaled
  together, proportions preserved, nothing detached or floating. The
  before/after-fix screenshots at the small size are the clearest evidence:
  before the `loadEquipment` fix, a gray sphere floated disconnected above
  the character; after, the helmet sits correctly on the (now smaller) head.
- Browser console showed no errors at any tested size.
