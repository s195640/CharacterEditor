import type { AnimationGroup, TransformNode } from "@babylonjs/core";

export interface FootHeightBaselineSample {
  frame: number;
  // World-Y height of each foot's ground-contact point, expressed as an
  // offset from baseRootY at Size 1 and default (unedited) body-shape
  // proportions -- normalized the same way the pre-rewrite
  // groundOffsetAtSize1 was, so it can be re-scaled by whatever Size is
  // current at read time.
  left: number;
  right: number;
}

// Samples a clip's full frame range once, before any body-shape edit is
// ever applied, recording where the authored animation actually plants
// each foot -- the fixed reference every subsequent leg-length
// customization's ground correction is measured against, regardless of
// which clip is later selected for playback.
//
// Reads via plain TransformNode.computeWorldMatrix(true)/.getAbsolutePosition()
// -- the same technique already proven correct throughout this project's
// earlier body-shape work -- not any Bone-level API, so there's no need
// for a mirrored-root workaround or a Bone-state sync step of any kind.
//
// AnimationGroup.goToFrame is a no-op until the group has been started at
// least once (`if (!this._isStarted) return this;`, confirmed by reading
// animationGroup.pure.js directly), so this must start the group first,
// even though nothing should visibly play during setup (the caller's own
// AnimationController.play() stops every group before starting the one it
// actually wants, right after this runs).
export function captureFootHeightBaseline(
  group: AnimationGroup,
  leftFootNode: TransformNode,
  rightFootNode: TransformNode,
  baseRootY: number,
  sampleCount: number,
): FootHeightBaselineSample[] {
  group.play(false);
  const samples: FootHeightBaselineSample[] = [];
  for (let i = 0; i < sampleCount; i++) {
    const frame = group.from + ((group.to - group.from) * i) / (sampleCount - 1);
    group.goToFrame(frame);
    leftFootNode.computeWorldMatrix(true);
    rightFootNode.computeWorldMatrix(true);
    samples.push({
      frame,
      left: leftFootNode.getAbsolutePosition().y - baseRootY,
      right: rightFootNode.getAbsolutePosition().y - baseRootY,
    });
  }
  return samples;
}

// Baseline is only ever sampled at discrete points, but live playback frame
// is continuous -- linearly interpolate between the two bracketing samples.
export function sampleFootHeightBaseline(
  samples: FootHeightBaselineSample[],
  frame: number,
): { left: number; right: number } {
  const clamped = Math.max(samples[0].frame, Math.min(samples[samples.length - 1].frame, frame));
  let i = 0;
  while (i < samples.length - 2 && samples[i + 1].frame < clamped) {
    i++;
  }
  const a = samples[i];
  const b = samples[i + 1];
  const t = b.frame === a.frame ? 0 : (clamped - a.frame) / (b.frame - a.frame);
  return {
    left: a.left + (b.left - a.left) * t,
    right: a.right + (b.right - a.right) * t,
  };
}

// Per-frame ground correction: lengthening a leg (translation-based, see
// bodyShape.ts) naturally pushes the foot further from the hip in
// whatever direction that leg segment currently points, since rotation is
// never touched -- this is what makes the character read as taller
// (rather than converting the extra length into a different knee bend,
// which real IK was found to do instead, see docs/other/PLAN_translation_based_body_shape.MD's
// 0.6.31 post-merge fix entry). This function measures how far that
// pushed the foot away from its own default-proportions ground height,
// this frame, and shifts the WHOLE character vertically to compensate --
// so the character gets taller with feet still planted, instead of the
// foot itself moving.
//
// Measures with rootNode.position.y first reset to baseRootY (no prior
// offset) to avoid a feedback loop, since the "current" reading would
// otherwise already include whatever offset was applied last frame.
//
// Takes the worst-case (largest) delta across BOTH feet independently,
// not their average: left and right legs are roughly out of phase during
// locomotion, so each foot's worst-case drop happens at a different
// frame, and this guarantees neither foot clips through the ground at any
// point in the cycle -- the other foot may sit slightly above its own
// baseline at that instant instead, the same trade-off the pre-rewrite
// ground-offset system already established as correct.
export function applyGroundOffset(
  rootNode: TransformNode,
  leftFootNode: TransformNode,
  rightFootNode: TransformNode,
  baseRootY: number,
  baselineSample: { left: number; right: number },
  sizeValue: number,
): void {
  rootNode.position.y = baseRootY;
  leftFootNode.computeWorldMatrix(true);
  rightFootNode.computeWorldMatrix(true);
  const currentLeftY = leftFootNode.getAbsolutePosition().y;
  const currentRightY = rightFootNode.getAbsolutePosition().y;

  const expectedLeftY = baseRootY + baselineSample.left * sizeValue;
  const expectedRightY = baseRootY + baselineSample.right * sizeValue;

  const offset = Math.max(expectedLeftY - currentLeftY, expectedRightY - currentRightY);
  rootNode.position.y = baseRootY + offset;
}
