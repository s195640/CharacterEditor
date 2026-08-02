# Body Shape / Size sliders: what actually happens when you move them

A general reference for every slider in the control panel except animation/
equipment controls: what each one edits under the hood, and specifically
why moving a Body Shape slider away from 100% opens a visible gap/space in
the mesh at the joint. Written against the current (post-rewrite)
translation-based length system — see `docs/other/LEG_BODY_SHAPE_MATH.md`
and `docs/other/PLAN_translation_based_body_shape.MD` for the deeper,
leg-specific worked-math history of how this system replaced the old
Scale-based one; this doc doesn't restate that history, only the current
behavior.

Like `LEG_BODY_SHAPE_MATH.md`, this is a living reference, not a milestone
release note — keep it in sync as the mechanism changes.

## Overview

There are two independent slider families:

- **Size** — one slider, uniformly scales the entire character.
- **Body Shape** — 18 sliders across 6 tabs (Legs, Foot, Arms, Hand,
  Fingers, Torso), each editing one body part's length. Configured in
  `shell/main.ts`'s `BODY_PART_CONFIG`; the actual bone edits happen in
  `core/bodyShape.ts`.

Two of the Body Shape sliders — Upper Leg and Lower Leg — also trigger a
second, whole-character effect (see "The leg sliders" below); every other
slider only affects its own local joint.

## Size slider

`shell/main.ts` captures `character.rootNode.scaling` once at load as the
1.0 baseline (`baseScale`). Moving the slider calls `setSize`, which sets
`character.rootNode.scaling = baseScale.scale(sizeValue)` — a single
uniform scale applied to the whole hierarchy.

No gap is possible here: every vertex, every bone, and every child node
scales together by the exact same factor, so nothing that used to touch
still touches perfectly, just at a different overall size. Equipment
scales along with it for free, since it's parented under the same
hierarchy.

## Body Shape sliders — the core mechanism

Each Body Shape slider calls `translateBodyPart(skeleton, lengthBones,
restTranslations, length)` (`core/bodyShape.ts`). This does **not** scale
the named bone at all. Instead, for each bone name in `lengthBones`, it
sets that node's local `.position` to its original rest translation times
the length ratio (Y axis only — Y is this rig's bone-length axis; X/Z are
left untouched).

The bone names listed under a slider are not the bone the slider is named
after — they're that bone's **child**. E.g. the "Upper Leg" slider's
`lengthBones` entry is `LeftLeg`/`RightLeg` (the lower-leg bone), not
`LeftUpLeg`/`RightUpLeg`. This is because a bone's own visual length (the
segment from its own joint to its child's joint) is physically stored as
the CHILD's translation from its parent — confirmed by parsing `Walking
.glb`'s raw node data directly. So "making the upper leg longer" means
"moving the knee joint further from the hip," which is exactly what
editing the child's translation does.

This translation-based approach is what replaced an earlier Scale-based
system (see the two cross-referenced docs above): scaling a parent bone
used to cascade its scale into every descendant automatically (Babylon
composes `child.worldMatrix = parent.worldMatrix × child.localMatrix`),
which required a whole shear-compensation system (`parentLabel`/
`uniformOnly`) to stop a leg-length edit from also resizing the foot.
Editing a single child's translation has no such cascade — nothing below
the moved joint is affected unless it's separately configured to be.

**Exception**: `Lower Foot` is a leaf bone (`LeftToe_End`/`RightToe_End`)
with no child to translate into, so it's the one remaining slider still
using the legacy `scaleBodyPart(skeleton, bones, length, 1)` path (width
pinned to 1, not user-adjustable).

### Chains (Spine, each Finger)

A single-child translation naturally handles one joint, but a few controls
span multiple segments in one slider (Spine, and each of the five
Fingers). Since translation doesn't cascade down multiple hierarchy levels
the way Scale did, these groups instead list every segment's
length-carrying child explicitly in `lengthBones` (e.g. Spine's config
lists both `Spine1` and `Spine2`'s translation targets), so the same ratio
is applied once per segment rather than relying on inheritance.

### Fan-out (Hips, Hand)

Hips and Hand each have multiple direct children (Hips → Spine + both
upper legs; Hand → all five fingers), so there's no single child whose
translation represents "hip length" or "hand length." These groups instead
scale every direct child's rest translation proportionally to the slider
value — still just more entries under the same `lengthBones` mechanism,
not a separate code path.

## Why a visible gap/space appears

This is the effect the slider UI makes visible at any non-100% Body Shape
value, and it's a mesh-rigging limitation, not a bug in the slider logic.

Translation-based length only repositions the **joint** — where the child
bone (and everything skinned to it) starts. It does not stretch the
parent bone's own skinned vertices to reach that new position.

That distinction only matters because of how this character's mesh is
actually skinned. Parsing the GLB's `JOINTS_0`/`WEIGHTS_0` vertex
attributes directly (both mesh primitives, `Alpha_Joints` and
`Alpha_Surface`) shows **zero blended skin weights at any joint in the
rig** — every single vertex is influenced by exactly one bone, at 100%
weight. There is no vertex anywhere that's partially weighted to both a
bone and its child, the way a smoothly-blended character mesh normally
would be at a joint.

Put those two facts together: when a slider moves a child joint away from
its parent, the parent's vertices (100% weighted to the parent) stay
exactly where they were, and the child's vertices (100% weighted to the
child) move as a rigid block to the new joint position. Nothing in
between blends the two together, so a literal empty gap opens up at the
joint boundary. The further from 100% the slider is moved, the wider the
gap — worst at extreme values, worse still mid-animation on a limb that's
also bending.

For contrast: the old Scale-based system didn't have this problem, because
scaling a bone stretched that bone's own weighted vertices continuously —
there was no seam to open. Its trade-off was the shear/cascade issue
solved by the `parentLabel`/`uniformOnly` system instead.

This is an accepted, known limitation of the current placeholder mesh's
rigging, not a mechanism bug — it was explicitly surfaced and accepted
during the translation-based rewrite (see the "Phase 1" gate discussion in
`PLAN_translation_based_body_shape.MD`'s implementation history for the
original screenshots and decision). Closing it for real would mean either
re-skinning the mesh with blended weights across joint boundaries, or
reverting to Scale-based length editing — neither is done here.

## The leg sliders' extra behavior — why the whole body shifts

Upper Leg and Lower Leg are the only Body Shape sliders with a second
effect beyond their own local joint move. Lengthening a leg segment pushes
the foot further from the hip in whatever direction that segment currently
points — rotation is never touched by any of this, only translation — and
that's what makes the character read as taller. Left uncorrected, this
would also push the foot through the ground (or leave it floating) instead
of keeping it planted.

`core/legGroundOffset.ts`'s `applyGroundOffset` corrects this every frame,
called from `shell/main.ts`'s `onBeforeRenderObservable`, but only while
`legsAreCustomized()` is true (`bodyPartState["Upper Leg"] !== 1 ||
bodyPartState["Lower Leg"] !== 1`):

1. `captureFootHeightBaseline` records, once per animation clip at load
   time (before any customization), where each foot naturally sits across
   that clip's full frame range — the reference "correct" ground height.
2. Every frame, `applyGroundOffset` measures where each foot currently is
   (reflecting whatever leg-length edit is active) and compares it against
   that clip's recorded baseline for the current frame, scaled by the
   current Size value.
3. It takes the worse (largest) of the two feet's deltas — left and right
   legs are usually out of phase during a walk/run cycle, so each foot's
   worst moment happens at a different frame — and shifts the whole
   character's `rootNode.position.y` by that amount.

The net effect: instead of the leg's own geometry being pushed further to
compensate, the entire character moves up or down so both feet stay
planted (or at worst, slightly above the ground rather than clipping
through it) while genuinely reading as taller or shorter.

When neither leg slider is customized, this whole mechanism is skipped and
`rootNode.position.y` is held exactly at `baseRootY` (the `else` branch in
`onBeforeRenderObservable`, and directly in `resetAll`) — no ground
correction runs on an unmodified character.

## Reset

The Reset button's handler (`resetAll` in `shell/main.ts`) sets every
`bodyPartState` entry back to `1`, Size back to `1`, and
`character.rootNode.position.y` directly back to `baseRootY` — not via the
per-frame ground-offset measurement above. That measurement is
pose-dependent (correct for one incremental slider change from whatever
pose is currently active), and doesn't cancel out exactly when undoing
several changes at once from a different animation pose than they were
originally made from. Setting the known defaults directly avoids that
residual-offset case entirely.
