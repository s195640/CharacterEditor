# Leg body-shape scaling: the exact math

A precise, math-complete reference for exactly how the Upper Leg and
Lower Leg sliders in the Body Shape panel turn into actual bone
transforms and character positioning. Written as diagnostic groundwork
after reports that leg scaling results still look poor — every formula
below is quoted from the current source (not paraphrased from memory of
earlier patches) and every worked example's numbers were read from the
live running app, not just derived on paper.

Unlike `docs/milestones/*.md` (finalized release notes, never edited
after being written), **this is a living reference** — keep it in sync
as the mechanism changes, don't leave it to go stale.

## Bone chain involved

```
mixamorig:Hips
 └─ mixamorig:LeftUpLeg / RightUpLeg     ("Upper Leg" control)
     └─ mixamorig:LeftLeg / RightLeg     ("Lower Leg" control)
         └─ mixamorig:LeftFoot / RightFoot       ("Upper Foot" control)
             └─ mixamorig:LeftToeBase / RightToeBase  ("Middle Foot" control)
                 └─ mixamorig:LeftToe_End / RightToe_End ("Lower Foot" control)
```

Babylon composes each node's world transform as
`child.worldMatrix = parent.worldMatrix × child.localMatrix` — a parent
bone's scale unconditionally multiplies through every descendant. This
single fact is the reason nearly everything below exists: it's *why*
Upper Leg would otherwise bleed into Lower Leg's own size, and *why*
lengthening a leg pushes the foot through the ground unless something
else compensates.

## Step 1: the base transform

`core/bodyShape.ts`'s `scaleBodyPart`:

```ts
export function scaleBodyPart(
  skeleton: Skeleton,
  boneNames: string[],
  length: number,
  width: number,
): void {
  for (const boneName of boneNames) {
    getBoneNode(skeleton, boneName).scaling.set(width, length, width);
  }
}
```

For each named bone, this sets `TransformNode.scaling` directly to
`(width, length, width)`. **Y is the bone-length axis, X/Z are width** —
confirmed rig-wide by parsing `Walking.glb`'s node translations directly
(see `MILESTONE_6_body_shape.md`), not assumed. This function itself
knows nothing about hierarchy, parents, or compensation — it's a pure
"set this bone's local scale" primitive. Everything else in this doc is
about what `length`/`width` values `shell/main.ts` actually passes in.

## Step 2: per-part configuration

`shell/main.ts`'s `BODY_PART_CONFIG` (relevant entries):

```ts
"Upper Leg": {
  bones: ["mixamorig:LeftUpLeg", "mixamorig:RightUpLeg"],
  tab: "Legs",
  uniformOnly: true,
},
"Lower Leg": {
  bones: ["mixamorig:LeftLeg", "mixamorig:RightLeg"],
  tab: "Legs",
  parentLabel: "Upper Leg",
},
```

Two facts drive everything downstream:
- **Upper Leg has no `parentLabel`** — nothing compensates its scale
  against anything else. It also has **`uniformOnly: true`** — the UI
  renders one "Size" slider instead of independent Length/Width (see
  "Why Upper Leg must be uniform" below for why).
- **Lower Leg has `parentLabel: "Upper Leg"`** — its applied scale gets
  divided by Upper Leg's current scale to cancel the inherited-scale
  problem described above. Lower Leg itself has no `uniformOnly` flag —
  its Length and Width sliders stay fully independent.

## Step 3: how a slider value becomes an applied scale

`shell/main.ts`'s `applyBodyPart`:

```ts
const applyBodyPart = (label: string) => {
  const config = BODY_PART_CONFIG[label];
  const state = bodyPartState[label];
  let length = state.length;
  let width = state.width;
  if (config.parentLabel) {
    const parentState = bodyPartState[config.parentLabel];
    length /= parentState.length;
    width /= parentState.width;
  }
  scaleBodyPart(character.skeletons[0], config.bones, length, width);
};
```

`bodyPartState[label]` holds the *desired* length/width — exactly what
the slider shows (e.g. a Lower Leg Length slider at 140% means
`bodyPartState["Lower Leg"].length === 1.4`). This is **not** what gets
written to the bone, though, whenever a `parentLabel` is present:

**Upper Leg** (no parent) — applied length/width = desired length/width,
unchanged:

```
appliedUpperLeg = desiredUpperLeg
```

**Lower Leg** (`parentLabel: "Upper Leg"`) — applied length/width =
desired ÷ Upper Leg's *current desired* state:

```
appliedLowerLeg.length = desiredLowerLeg.length / desiredUpperLeg.length
appliedLowerLeg.width  = desiredLowerLeg.width  / desiredUpperLeg.width
```

Critically, the divisor is `bodyPartState["Upper Leg"]` — **the value
this code itself already set**, not anything read back from Babylon
(`TransformNode.absoluteScaling` was tried in an earlier attempt and
found unreliable for a bone-linked node — read back as a bare `1` at
rest, didn't scale proportionally once stretched). Dividing by a known
quantity is exact arithmetic, not an approximation.

### Why this division cancels the inherited scale

Lower Leg's bone world-scale = Upper Leg's world-scale × Lower Leg's own
local scale (ignoring rotation for a moment — see the next section for
why rotation matters). If Upper Leg's own local scale is `U` and we want
Lower Leg's *effective* (world) scale to be exactly the user's desired
value `D`, we need:

```
U × appliedLowerLeg = D
appliedLowerLeg = D / U
```

— exactly the division the code performs, with `D = desiredLowerLeg` and
`U = desiredUpperLeg` (since Upper Leg's own applied scale equals its
desired scale, having no parent of its own).

## Worked example 1: Upper Leg alone

Upper Leg Size slider → 150% (`desiredUpperLeg = {length: 1.5, width:
1.5}`, both set together since Upper Leg's UI is `uniformOnly` — see
`onSizeChange: (value) => setBodyPart(label, value, value)`), Lower Leg
untouched (`desiredLowerLeg = {length: 1, width: 1}`).

Predicted:
```
appliedUpperLeg = (1.5, 1.5, 1.5)          [width, length, width]
appliedLowerLeg.length = 1 / 1.5 = 0.6667
appliedLowerLeg.width  = 1 / 1.5 = 0.6667
```

**Read from the live app** (`mixamorig:LeftUpLeg`/`mixamorig:LeftLeg`
`.scaling`, no rounding):

```
LeftUpLeg.scaling = { x: 1.5,               y: 1.5,               z: 1.5 }
LeftLeg.scaling   = { x: 0.6666666666666666, y: 0.6666666666666666, z: 0.6666666666666666 }
```

Exact match. Lower Leg's *own* size (what a viewer actually perceives as
"how big is the shin") is Upper Leg's world-scale (1.5) × Lower Leg's
applied local scale (0.6667) = 1.0 — unchanged, as intended, confirming
the division does what it's supposed to for this case.

## Worked example 2: Upper Leg + Lower Leg + overall Size together

Upper Leg Size → 150%, Lower Leg Length → 140%, Lower Leg Width → 70%,
overall Size slider → 120%.

Predicted bone-level scales (overall Size does **not** factor into these
— see "Size slider interaction" below, it's a separate node entirely):

```
appliedUpperLeg = (1.5, 1.5, 1.5)
appliedLowerLeg.length = 1.4 / 1.5 = 0.9333
appliedLowerLeg.width  = 0.7 / 1.5 = 0.4667
```

**Read from the live app**:

```
LeftUpLeg.scaling = { x: 1.5,               y: 1.5,               z: 1.5 }
LeftLeg.scaling   = { x: 0.4666666666666666, y: 0.9333333333333332, z: 0.4666666666666666 }
rootNode.scaling.x (overall Size) = 1.2
rootNode.position.y (ground-height offset, at this Size) = 0.5616292163729667
```

Bone-level values match exactly. The last line is the ground-height
compensation, covered next.

## Why Upper Leg must be forced uniform

The division in Step 3 only cancels Upper Leg's contribution to Lower
Leg's *world* scale when Upper Leg's own scale is a pure diagonal that
lines up with Lower Leg's own axes. In reality, Lower Leg has some
rotation `R` relative to Upper Leg — the knee angle, which the *animation*
drives every frame. The full picture, including that rotation:

```
child.scaling_effective = R⁻¹ · S_parent · R
```

where `S_parent` is Upper Leg's local scale matrix (diagonal:
`diag(width, length, width)`). This equals `S_parent` unchanged — i.e.
the naive division cancels cleanly — **only when `R` is the identity
rotation** (no knee bend at that instant). For any other `R`, a
*non-uniform* `S_parent` (length ≠ width) gets reinterpreted through the
rotation and comes out sheared: some of Upper Leg's length-vs-width
difference bleeds into Lower Leg's other axes.

If instead `S_parent` is **uniform** — `S_parent = k·I` for some scalar
`k` (i.e. Upper Leg's length and width are forced equal) — then:

```
R⁻¹ · (k·I) · R = k · R⁻¹ · R = k · I = S_parent
```

A scalar multiple of the identity commutes with *any* rotation. This is
exact algebra, not an approximation — it holds regardless of how bent the
knee is at any given animation frame. That's why `BODY_PART_CONFIG` sets
`uniformOnly: true` on Upper Leg (and every other bone that is a *parent*
in a compensated pair — Chest, Upper/Lower Arm, Hand, Spine, Neck,
Middle Foot) instead of leaving it independently adjustable.

**Rest-pose rotation alone was an insufficient safety check.** Before
this was understood, whether a pair got compensated at all was decided
by the parent→child bone's *rest-pose* (bind pose) rotation alone — the
knee's rest-pose rotation is only 2.18°, which looked safe. But rest pose
only describes the bind pose; it says nothing about how far the knee
actually bends *during a specific animation*. Running's mid-stride knee
bend is far larger and confirmed to produce real, visible shear despite
the "safe" rest-pose classification — this is exactly what the
`uniformOnly` fix (0.6.19) addresses, and why it's necessary regardless of
how small the rest-pose angle looks.

**This is why Lower Leg itself does *not* need to be uniform**: nothing
currently compensates *against* Lower Leg (Upper Foot's cascade from Legs
is deliberately left uncompensated — see "Known limitations" below), so
there's no downstream division that Lower Leg's own non-uniformity could
shear.

## Ground-height compensation

Lengthening any bone between the hips and the toe pushes the foot further
from the hip — down, through the ground — since legs hang downward. This
is compensated separately from the scale math above, by adjusting the
whole character's vertical position.

`shell/main.ts`'s `applyRootTransform`:

```ts
const applyRootTransform = () => {
  character.rootNode.scaling = baseScale.scale(sizeValue);
  character.rootNode.position.y = baseRootY + groundOffsetAtSize1 * sizeValue;
};
```

`groundOffsetAtSize1` is a single accumulated number, normalized to what
it should be at Size = 1.0, re-multiplied by the current `sizeValue`
whenever either Size or a body-shape slider changes. That's why Example
2's `rootNode.position.y` (0.5616) isn't simply the sum of two
independent effects — it's `groundOffsetAtSize1 × 1.2`, where
`groundOffsetAtSize1 ≈ 0.468` was accumulated across the Upper Leg and
Lower Leg changes, each contributing its own measured delta.

### How the delta itself is measured (current as of 0.6.20)

`setBodyPart` measures the delta at **40 evenly spaced frames across the
currently selected animation's whole `[from, to]` range** — not a single
instant — and uses the **worst-case (largest) delta across both feet
independently**:

```ts
const GROUND_SAMPLE_COUNT = 40;
// ...
let worstDelta = -Infinity;
for (let i = 0; i < sampleFrames.length; i++) {
  group?.goToFrame(sampleFrames[i]);
  const afterLeft = measureFootY(leftToeBaseNode);
  const afterRight = measureFootY(rightToeBaseNode);
  worstDelta = Math.max(worstDelta, beforeLeft[i] - afterLeft, beforeRight[i] - afterRight);
}
groundOffsetAtSize1 += worstDelta / sizeValue;
```

Two things had to be learned the hard way to arrive at this:

1. **One instant isn't representative of a whole gait cycle.** A leg
   segment's actual vertical drop from a given scale change depends on
   its *current orientation* — the shin swings much further from
   vertical than the thigh does, especially in Running. Measuring the
   delta only at whatever pose happened to be active when the slider
   moved meant the compensation was correct for that one pose and wrong
   for the rest of the cycle. Confirmed directly: Lower Leg at 200% looked
   fine in a static Idle pose but dipped the foot to **-0.21 world-Y**
   during Running at frames far from wherever the slider was dragged.
2. **Averaging left and right feet understates what either needs.** Left
   and right legs are roughly out of phase during locomotion, so each
   foot's worst dip happens at a *different* sampled frame. An earlier
   version of this fix averaged the two feet's delta at each frame before
   taking the max across frames — that still left a small but real
   negative dip that increasing the sample count alone didn't close.
   Switching to a true per-foot max (shown above) closed it completely.

**Read from the live app** — Lower Leg alone at 200% (Upper Leg and Size
both left at default), during Running:

```
rootNode.position.y: 0 → 0.518274687230587
Foot Y range across one full cycle after: left [0.1317, 1.5916], right [0.0477, 1.4075]
```

Both minimums positive — the foot no longer dips below the ground plane
at any sampled point in the cycle.

## Size slider interaction

The overall Size slider (`setSize`) scales `character.rootNode` — a
*different* node than any individual bone, sitting above the whole
skeleton. It does not modify any bone's own `.scaling` value; instead it
multiplies everything below it, including whatever the leg bones'
already-computed scales produced. This is why Example 2 could set
Size = 120% without needing any different math for the leg bones
themselves — `rootNode.scaling.x` reads back exactly `1.2`, independent of
the leg calculations.

`groundOffsetAtSize1` is deliberately stored *normalized to Size 1.0* and
re-multiplied by the current `sizeValue` in `applyRootTransform` precisely
so that changing Size after adjusting legs doesn't require re-deriving
the ground offset from scratch — Size is a value this code sets directly
(not read back from an unreliable engine property), so multiplying by it
is exact.

## Known, deliberate limitations

Worth knowing before concluding "poor results" means a bug in the math
above — some of this is expected, documented behavior, not an oversight:

- **Upper Foot and Middle Foot still cascade from the Leg chain.** The
  `Leg → Foot` rest-pose rotation is 65.5° (the ankle bend) and
  `Foot → ToeBase` is 26.7° — both too large for even the uniform-parent
  technique to help (that technique only makes the *parent's own*
  non-uniformity harmless; it does nothing about a large structural
  rotation between segments in the first place). Stretching Lower Leg
  will still visibly affect Upper Foot's apparent size, by design, not by
  bug.
- **Ground-height sampling only covers the *currently selected*
  animation.** Setting a leg slider while on Idle, then switching to
  Running, can still show some residual drift, since the 40-frame sample
  was only ever taken across Idle's range. A smaller, more familiar
  category of limitation than the one 0.6.20 fixed, not addressed by it.
- **This document only covers the scale math — not mesh/skin quality.**
  Everything above can be verified exactly correct (as it was, in both
  worked examples) and the *skinned mesh* can still look poor at extreme
  slider values — pinching, stretching artifacts, or visible seams at
  joints are a geometry/skin-weight question entirely separate from
  whether the bone transform itself is correct. If the numbers in this
  doc check out for a specific case that still "looks bad," the next
  place to look is the mesh's skin weights near that joint, not this
  scaling logic.

## Where to look if results still seem wrong

1. Reproduce the exact slider values and animation/frame from the report.
2. Read the bone's actual `.scaling` (via a temporary debug hook, same
   technique used to verify this doc) and compare against the formulas
   above by hand — a mismatch here would mean a genuine regression in
   this logic.
3. If the numbers match but it still *looks* wrong, it's very likely a
   mesh/skinning-quality issue at that specific joint and pose, not a
   scaling-math bug — inspect the skinned mesh directly (bounding info,
   vertex weights near the hip/knee/ankle) rather than this code.
