# Milestone 6 (slice 3): Per-body-part sizing

## What was built

Independent Length and Width sliders for four body parts — Arms, Legs, Head,
Belly (8 sliders total) — alongside the existing overall Size slider from
slice 1.

- `core/bodyShape.ts` — new file, `scaleBodyPart(skeleton, boneNames, length,
  width)`: finds each named bone's `TransformNode` (via
  `bone.getTransformNode()`, the same mechanism `loadProp` already used) and
  sets `node.scaling.set(width, length, width)`.
- `shell/main.ts` — `BODY_PART_BONES` maps each part to its bone names: Arms
  = `LeftArm`/`LeftForeArm`/`RightArm`/`RightForeArm`; Legs =
  `LeftUpLeg`/`LeftLeg`/`RightUpLeg`/`RightLeg`; Head = `Head`; Belly =
  `Spine1`. Per-part length/width state is tracked and reapplied every frame
  (see gotcha below) via `scene.onBeforeRenderObservable`.
- `shell/ui.ts` / `ui.css` — new "Body Shape" section: a label + Length/Width
  slider pair per part, via a small `createLabeledSlider` helper.

## Key decisions made

- **Y is the length axis, X/Z are width** — confirmed by directly parsing
  `Walking.glb`'s node data for every relevant parent→child bone pair
  (LeftArm→LeftForeArm, LeftUpLeg→LeftLeg, Neck→Head, Spine→Spine1, etc.):
  the child's local translation was overwhelmingly dominated by Y in every
  single case (values like 27.4, 40.6, 11.7 vs. ~1e-6 on X/Z). This is a
  rig-wide convention, not something checked once and assumed elsewhere.
- **Arms/Legs scale as whole limbs** (upper + lower segment together via one
  slider pair, both sides symmetric) rather than per-segment or per-side
  controls — matches natural expectation and avoids a disproportionate look.
- **Belly maps to `Spine1` only** — the middle torso bone. Its ancestors
  (`Spine`, below) and descendants (`Spine2`, shoulders, arms, neck, head,
  above) are unaffected by name, though scaling `Spine1` does move everything
  above it as a side effect of the bone hierarchy (see below) — expected, not
  a bug.
- **Reusability across future bodies**: the mechanism (look up a bone by
  name, scale its node) is fully general for any Mixamo-rigged body, since
  Mixamo standardizes bone names/structure across all its characters — the
  same fact that already makes animation retargeting and equipment/prop
  attachment body-agnostic. It would only need rework for a non-Mixamo body,
  which is already a shared limitation across every other mechanism in this
  project, not a new one.

## What was tried and rejected

Nothing at the architecture level, but one real assumption from planning
didn't survive contact with implementation — see the gotcha below.

## Gotcha actually hit

The plan's own risk section said: "Mixamo animations only ever keyframe
position/rotation, never scale... will verify, not just assume." That
verification is exactly what caught this: setting a bone's `.scaling` once
(on slider input) appeared to work for an instant, then silently reverted to
`[1, 1, 1]` within a frame or two. Diagnosed by reading the value back
immediately (same synchronous call — it held) versus after a short wait (it
had reset), which pinned the cause on the animation system, not the write
itself.

The retargeted animations' baked glTF data apparently includes a constant
scale=1 track on every bone even though scale was never meaningfully
"animated" — a common side effect of exporters baking full TRS keyframes
regardless of which channels actually change. That baked track silently
overwrites any one-time manual scaling as soon as the animation ticks again.

Fix: reapply all body-part scaling every frame via
`scene.onBeforeRenderObservable`, after Babylon's animation system has run,
so the manual override always wins instead of fighting the baked track once
and losing on the next tick. Cheap (a handful of bone lookups + vector sets
per frame) and robust regardless of whether a given animation happens to
include a redundant scale track or not.

## How it was verified

- `tsc --noEmit` passed.
- Read back a bone's `TransformNode.scaling` immediately after setting it
  (held) versus after ~300ms (reverted to `[1,1,1]`) to confirm the
  per-frame-overwrite theory before fixing it, then repeated the same check
  after the fix (held at the set value after 300ms).
- Headless Chromium (Playwright) screenshots at an extreme Length and
  Width value for each of the four parts individually — each showed the
  expected visible change (longer/thicker limb, wider head, wider torso with
  the chest/shoulders riding along as an expected hierarchy side effect).
- Played through Walking and Running with Arms Length maxed and overall Size
  at 1.5x simultaneously — animation continued playing normally across
  several frames each, no jitter, no scale reset, both effects compounding
  correctly (confirms `onBeforeRenderObservable` doesn't fight the render
  loop or the existing Size-slider mechanism).
- Browser console showed no errors throughout.
