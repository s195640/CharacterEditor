# Plan: Translation-based bone length + real IK ground correction

Status: proposed, not yet approved. Per `CLAUDE.md` working process, this is the
plan-mode artifact to review before any implementation branch is opened. Not a
`docs/milestones/*.md` file — those get written once, after the fact, when this
work is actually complete.

## Goal

Replace the Scale-based body-shape length system (`scaleBodyPart`, per-frame
reapplication, `uniformOnly`/`parentLabel` shear compensation, scalar
worst-case ground offset) with a Translation-based system that has no shear
to compensate for in the first place, plus real per-frame IK foot-locking so
leg-length changes stay grounded correctly through any animation, not just
the one selected when a slider moved.

## Scope

**In scope:**
- Convert every body-shape length control to edit bone rest-pose translation
  instead of Scale — all current bone groups, including Hips.
- Real per-frame two-bone IK foot-locking for the leg → foot chain, replacing
  the `groundOffsetAtSize1` scalar-sampling mechanism entirely.
- Remove all Width sliders and their UI.
- Remove the `uniformOnly`/`parentLabel` shear-compensation system — it exists
  only to manage non-uniform Scale bleeding through rotated children, and once
  Width is gone and Length no longer uses Scale, there's nothing left for it
  to protect.

**Explicitly out of scope (deferred, future work):**
- Width control via blend shapes / morph targets. Needs Blender-authored shape
  keys (min/max per body region) before any code work is meaningful. Tracked
  separately, not part of this plan.
- Corrective blend shapes for skin pinching at extreme lengths.
- IK correction for arms/hands. Arms don't have a ground-contact constraint to
  solve against — a prop held in a hand just follows wherever the (now
  longer/shorter) hand bone ends up, same as today. IK is scoped to the leg →
  foot chain only.

## Part 1 — Bone length via translation

### Which node actually gets edited

In this rig, a bone's "length" lives in its *child's* local translation, not
its own — e.g. "Upper Leg length" is `mixamorig:LeftLeg`'s translation.y (the
knee's offset from the hip), not anything on `LeftUpLeg` itself. This is the
opposite of how Scale worked, where scaling the parent directly was correct
because Scale multiplies through descendants automatically. This mapping
needs to be re-derived per current bone group by parsing the source GLB's
node translations directly — same verification method already used to
establish "Y is the length axis" — not assumed from how the old
`BODY_PART_CONFIG` bone lists are currently structured.

### Per-bone-group conversion

Every current length-bearing control converts to a translation edit on the
appropriate child node: Upper Leg, Lower Leg, Upper Foot, Middle Foot, Lower
Foot, Upper Arm, Lower Arm, Hand, each Finger, Head, Chest/Spine, Neck. Each
needs its target node confirmed per the rule above before implementation,
not assumed to carry over 1:1 from the current Scale-based bone lists.

### Chain controls (Spine, Fingers) need explicit per-segment logic

Scale's multiplicative cascade is what let a single slider on the chain's
root bone (e.g. `mixamorig:Spine`) propagate down through `Spine1`/`Spine2`
for free. Translation doesn't cascade that way — editing one joint's offset
doesn't lengthen the segments below it. Multi-segment chain controls need the
translation edit applied explicitly to each segment in the chain, scaled
proportionally, rather than relying on hierarchy inheritance. This is new
design work, not a drop-in swap, and should be prototyped on one chain
(Spine) before rolling out to Fingers.

### Hips

Hips sits at/near the skeleton root and has no parent bone whose translation
would represent "Hips length" under the rule above — it was previously a
Scale-based macro that deliberately cascaded into everything below it. Per
the decision to convert it anyway: the translation-based equivalent is most
likely scaling the local translations of Hips' direct children (Spine,
LeftUpLeg, RightUpLeg) proportionally, rather than editing a single node's
own translation. This needs to be worked out explicitly as its own design
step — it doesn't fall out of the standard per-bone rule automatically.

### Bind pose / skinning recompute

Skinning depends on inverse bind matrices computed from the original rest
pose. Editing a bone's rest translation without recomputing those will
deform the mesh incorrectly even when the translation edit itself is right.
This needs a Babylon-specific investigation (`Skeleton.computeAbsoluteMatrices`,
bind matrix updates, whatever `prepare()` needs to be re-run) — flagged
under Investigation/Spikes below as the highest-risk unknown in this plan.

## Part 2 — Real IK foot-locking, replacing the scalar ground offset

### Why the scalar approach isn't sufficient

Today's fix measures foot drop at 40 sampled frames of whichever animation
is selected when a slider moves, takes the worst case, and shifts the whole
character's root up by a single constant. This is a compromise: most frames
end up overcorrected to cover the worst one, and it silently breaks the
moment the user switches to a different animation than the one active when
the slider was dragged, since the offset was only ever sampled against that
one clip.

### Design: per-frame two-bone IK on the leg → foot chain

Solve knee angle analytically (law of cosines — exact, not iterative, given
fixed hip position, a target foot position, and the current thigh/shin
lengths) every frame, for both legs, replacing the animation's baked
hip/knee rotation for that frame with the IK-solved one. This runs in
`scene.onBeforeRenderObservable`, after animation evaluation, same hook
where scale reapplication used to live — except now it corrects joint
rotation rather than reapplying a static property.

### Baseline capture

IK needs a target: where the foot *should* be, per frame, per clip, at the
character's original (unmodified) proportions. Capture this once per clip
when it loads — before any body-shape edits are ever applied — as the
ankle's position relative to the hip, sampled across the clip's full frame
range. This baseline is what every subsequent leg-length change gets solved
against, regardless of which clip is currently selected for playback — this
is what actually fixes the "only works for the clip active when you dragged
the slider" limitation, not just the length-representation change.

### Per-frame solve

Each frame: read the hip's current world position (itself potentially
affected by Hips-region translation edits and overall Size), compute the
target foot position as hip position + baseline offset at this frame
(scaled by Size), then solve the knee/hip rotation on the now
translation-modified leg to reach that target.

### Foot/ankle orientation — open question, resolve during implementation

Start with position-only correction (solve hip/knee, leave the animation's
authored ankle rotation untouched) and visually assess whether the foot
looks correctly planted or needs its own orientation correction to stay
flat against the ground. Don't build ankle-orientation correction
preemptively — verify it's actually needed first.

### What gets removed

`groundOffsetAtSize1`, the 40-frame worst-case sampling in `setBodyPart`,
and the `applyRootTransform` vertical-offset logic are all superseded and
should be deleted, not left dormant alongside the new system.

## Part 3 — Width slider removal

Remove the Width half of every `createLabeledSlider` pair, the `width` field
from `bodyPartState`, and the `width` parameter path through
`scaleBodyPart`/`applyBodyPart`. Once Width is gone, there is no longer a
length-vs-width distinction to have a UI opinion about — every body part
becomes a single Length slider. Note this is a real UI simplification, not
just a removal: the `uniformOnly` single-slider-vs-two-slider branching in
`ui.ts` and `BODY_PART_CONFIG` becomes entirely unnecessary once nothing has
two axes to be uniform between.

## Investigation / spikes required before full rollout

These should be resolved on a single bone (Lower Leg is the obvious
candidate, already the best-understood case) before converting every bone
group, since a wrong assumption here invalidates the whole approach:

1. **Are non-root bones' translation channels baked into the animation
   clips, even as a constant?** If yes, editing rest translation will hit
   the same per-frame-overwrite problem the old scale=1 track caused, and
   needs either stripping (if genuinely constant, mirroring
   `stripScaleAnimations`) or a rebake approach. Verify by reading a bone's
   translation back immediately after setting it versus after ~300ms of
   playback, same diagnostic already used for the original scale bug.
2. **Bind-pose/inverse-bind-matrix recompute mechanics in Babylon** — confirm
   the exact API calls needed for skinning to read correctly after a rest
   translation edit.
3. **Confirm the child-node-carries-length mapping** for at least two
   different bone pairs by parsing GLB node data directly, not assuming it
   generalizes from Upper/Lower Leg to every other chain.

## Equipment & prop re-verification

`loadProp`'s scale compensation (inverse `absoluteScaling`, computed once at
load time) was built around bones potentially carrying non-1 Scale from the
old body-shape system. Once body-shape length no longer touches Scale at
all, re-verify equipped props/weapons still attach and track correctly —
this assumption changing is a real regression risk, not a formality.

## Export re-verification

Confirm modified rest translations actually serialize into the exported
GLB (same "parse the GLB's JSON chunk directly" method used to verify
`stripScaleAnimations`'s effect on export), and that IK-corrected rotations
per frame are what gets baked into exported animation groups, not the
original unmodified rotations.

## Cleanup (dead code to remove, not leave dormant)

- `uniformOnly` and `parentLabel` fields in `BODY_PART_CONFIG`, and the
  division logic in `applyBodyPart`.
- The Width branch of `ui.ts`'s slider rendering.
- `groundOffsetAtSize1`, related sampling code, and the old
  `applyRootTransform` vertical-offset math.

## Verification plan

Mirroring the existing project's verification standard (exact bone-value
reads, not visual impressions alone):

- `tsc --noEmit` passes.
- Per representative bone (a limb segment, a chain like Spine, a leaf bone
  like Head, a bone with equipment attached like Hand): read back the
  target node's translation immediately after edit and after ~300ms of
  playback to confirm no per-frame reversion.
- Full gait-cycle check on both Walking and Running, at extreme length
  values on at least one leg segment: sample foot world-Y across the whole
  clip and confirm it never drops below the unmodified baseline minimum, on
  both feet independently — same standard the current worst-case sampling
  was held to, now expected to hold exactly rather than approximately.
- Switch animations after setting a leg-length slider and re-run the same
  gait-cycle check — this is the specific case the current system fails,
  and should now pass, since baseline capture is per-clip and IK runs live
  regardless of which clip is selected.
- Headless Chromium screenshots at extreme values for each converted bone
  group, individually and in combination with overall Size.
- Equipment/prop attachment check at extreme leg/arm length values.
- Export a customized character, parse the resulting GLB's JSON directly to
  confirm rest translations and baked rotations reflect the customization.
- Browser console shows no errors throughout.

## Open questions still needing a decision during implementation

- Exact translation-based mechanism for Hips (see Part 1) — needs its own
  short design pass, not fully specified by "convert it too."
- Whether foot/ankle orientation needs explicit correction on top of
  position-only IK, or whether position correction alone looks right.
- Whether IK should run continuously every frame (recommended — also fixes
  the animation-switching bug) or only recompute on slider change with the
  result cached per clip (cheaper, but reintroduces a version of the
  animation-switching limitation for any clip not yet sampled).

## Process

Per `CLAUDE.md`: bump `VERSION`'s patch digit (this stays within milestone
6, "Generalize: more slots, more bodies, sizing" — it's not a new major
item), branch named exactly the new version, commit frequently, verify
before merge, merge and delete the branch per the existing flow. Given the
size of this change, consider whether it's worth splitting into two
branches — (1) translation-based length + cleanup, (2) IK foot-locking — so
(1) can be verified and merged independently rather than one large branch
carrying both risks at once. Worth a quick explicit decision before opening
the first branch, not assumed either way.
