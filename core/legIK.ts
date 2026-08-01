import {
  type Animation,
  type AnimationGroup,
  type Bone,
  BoneIKController,
  type IAnimationKey,
  type Skeleton,
  type TransformNode,
  Vector3,
} from "@babylonjs/core";

export interface LegBaselineSample {
  frame: number;
  // Position relative to the hip (the IK chain's anchor bone), captured at
  // the character's default (unedited) body-shape proportions -- the fixed
  // reference every subsequent leg-length customization gets IK-solved
  // against, regardless of which clip is later selected for playback (the
  // specific case a root-offset hack sampled against one clip couldn't fix).
  ankleOffset: Vector3;
  // BoneIKController needs a pole target to know which way to bend the
  // knee -- otherwise it has no way to distinguish "knee forward" from
  // "knee backward" for a given target distance. Using the authored
  // animation's own knee position (relative to the same hip anchor)
  // reproduces the original bend direction exactly, rather than inventing
  // a synthetic offset.
  kneeOffset: Vector3;
}

// A bone with a linked TransformNode (this project's rig convention, see
// characterLoader.ts) only gets its own position/rotation/scaling synced
// FROM that node during Skeleton.prepare(), which Babylon calls later in
// the frame (during mesh rendering) than onBeforeRenderObservable -- so a
// Bone-level read at that point (which is what BoneIKController and
// Bone.getAbsolutePosition rely on) would see last frame's stale pose, not
// this frame's already-evaluated animation. Confirmed by reading
// Skeleton.prepare()'s own source: its bone-sync loop is exactly this,
// paired with computing skin matrices immediately afterward and marking
// the frame's render ID as handled -- calling prepare() itself here would
// freeze in the PRE-IK pose for this frame's actual render, since Babylon's
// own later prepare() call would then see the render ID already matches
// and skip re-running. This replicates just the sync half, leaving skin
// matrix computation to Babylon's own later call (by then using our
// IK-corrected rotations).
export function syncBonesFromLinkedTransformNodes(skeleton: Skeleton): void {
  for (const bone of skeleton.bones) {
    const node = bone.getTransformNode();
    if (!node) {
      continue;
    }
    bone.position = node.position;
    if (node.rotationQuaternion) {
      bone.rotationQuaternion = node.rotationQuaternion;
    } else {
      bone.rotation = node.rotation;
    }
    bone.scaling = node.scaling;
  }
  skeleton.computeAbsoluteMatrices(true);
}

// Samples a clip's full frame range once, before any body-shape edit is
// ever applied, recording where the authored animation puts the ankle and
// knee relative to the hip at each sampled frame. Called once per clip at
// load time; scrubbing the clip here is harmless since nothing has started
// playing yet -- except AnimationGroup.goToFrame is itself a no-op until
// the group has been started at least once (`if (!this._isStarted) return
// this;`, confirmed by reading animationGroup.pure.js directly), so this
// must start the group first, even though nothing should visibly play
// during setup (the caller's own AnimationController.play() stops every
// group before starting the one it actually wants, right after this runs).
//
// Reads positions via Bone.getAbsolutePosition(ikSpace), not the linked
// TransformNodes' own getAbsolutePosition() -- see ikSpace's own doc
// comment in main.ts for why: this rig's scene-graph root carries a
// mirrored ([1,1,-1]) scale, and bridging bone-space through the REAL
// (mirrored) character mesh corrupts BoneIKController's world-space
// rotation math (confirmed empirically: a bone's .scaling was found
// jumping to ~100x, the exact inverse of the rig's import-scale factor,
// after a single .update() call). Bridging through an inert,
// identity-transform reference node instead sidesteps the mirrored
// determinant entirely, since every position then lives in the same
// consistent (raw, unscaled) skeleton-space -- confirmed empirically too:
// a no-op IK target (set to the foot's own current position) left the
// foot exactly where it started, and bone .scaling stayed exactly [1,1,1].
// goToFrame only updates the animation's TARGET nodes directly; bone-level
// state needs syncBonesFromLinkedTransformNodes after each scrub to catch
// up before reading it.
export function captureLegBaseline(
  group: AnimationGroup,
  skeleton: Skeleton,
  ikSpace: TransformNode,
  hipBone: Bone,
  kneeBone: Bone,
  ankleBone: Bone,
  sampleCount: number,
): LegBaselineSample[] {
  group.play(false);
  const samples: LegBaselineSample[] = [];
  for (let i = 0; i < sampleCount; i++) {
    const frame = group.from + ((group.to - group.from) * i) / (sampleCount - 1);
    group.goToFrame(frame);
    syncBonesFromLinkedTransformNodes(skeleton);
    const hipPos = hipBone.getAbsolutePosition(ikSpace);
    samples.push({
      frame,
      ankleOffset: ankleBone.getAbsolutePosition(ikSpace).subtract(hipPos),
      kneeOffset: kneeBone.getAbsolutePosition(ikSpace).subtract(hipPos),
    });
  }
  return samples;
}

// Baseline is only ever sampled at discrete points, but live playback frame
// is continuous -- linearly interpolate between the two bracketing samples.
export function sampleLegBaseline(
  samples: LegBaselineSample[],
  frame: number,
): { ankleOffset: Vector3; kneeOffset: Vector3 } {
  const clamped = Math.max(samples[0].frame, Math.min(samples[samples.length - 1].frame, frame));
  let i = 0;
  while (i < samples.length - 2 && samples[i + 1].frame < clamped) {
    i++;
  }
  const a = samples[i];
  const b = samples[i + 1];
  const t = b.frame === a.frame ? 0 : (clamped - a.frame) / (b.frame - a.frame);
  return {
    ankleOffset: Vector3.Lerp(a.ankleOffset, b.ankleOffset, t),
    kneeOffset: Vector3.Lerp(a.kneeOffset, b.kneeOffset, t),
  };
}

// BoneIKController measures both bone lengths ONCE at construction (from
// the live bone positions at that moment) and never refreshes them, so it
// must be rebuilt -- not just reused -- whenever a leg's translation-based
// length changes. Cheap: just needs bone references and a fresh position
// read, done via syncBonesFromLinkedTransformNodes before constructing so
// the measurement reflects whatever body-shape edit just happened, not a
// stale pre-edit pose. `ikSpace` (not the real character mesh) is passed
// as the required `mesh` constructor argument -- see the module doc above.
export function createLegIKChain(ikSpace: TransformNode, kneeBone: Bone): BoneIKController {
  const controller = new BoneIKController(ikSpace, kneeBone, {
    // The constructor auto-detects "handedness" from
    // bone.getAbsoluteMatrix().determinant() and picks a default bend axis
    // accordingly (confirmed: both legs detect determinant > 0, i.e.
    // "right-handed", giving a default bendAxis of (0,0,-1)) -- but
    // Babylon scenes are left-handed by default (this project never sets
    // useRightHandedSystem), so that auto-detected axis is wrong for this
    // rig and bends the knee backward (hyperextended) instead of forward.
    // Confirmed empirically by comparing knee bend direction across every
    // +/-X/Y/Z candidate from a fixed side-on camera angle: only (0,0,1)
    // (the auto-detected axis with its Z sign flipped) produced a normal,
    // forward-bending human knee across the gait cycle; every other
    // candidate, including the auto-detected default, either hyperextended
    // or collapsed the leg.
    bendAxis: new Vector3(0, 0, 1),
  });
  // Override the constructor's default pole target (bone1's parent, i.e.
  // Hips) -- that tracks the LIVE hip bone's orientation, not the authored
  // animation's own knee-bend direction at a given frame, which is what
  // the baseline capture above is actually for. Setting poleTargetPosition
  // directly each frame (see updateLegIK) only takes effect when neither
  // poleTargetBone nor poleTargetMesh is set.
  controller.poleTargetBone = null;
  return controller;
}

// Per-frame solve: target/pole positions are the current hip position plus
// the baseline offset at this frame -- deliberately NOT scaled by the
// character's overall Size, and NOT scaled by leg-length ratios either.
// Size is scale-invariant for this solve: ikSpace is an unparented,
// identity-transform node, so it deliberately excludes rootNode's Size
// scaling entirely -- every position here already lives in one consistent,
// Size-independent skeleton-space, the same space bone lengths are
// measured in. The IK solve is a pure angle problem in that space (same
// triangle shape regardless of how large Size later renders it), so
// introducing Size here at all would double-count it -- confirmed
// empirically: multiplying the baseline offset by sizeValue caused the
// foot to dip below the ground at combined extreme Upper Leg + Size
// values, since the target distance grew past what the (correctly
// Size-independent) measured bone lengths could reach, clamping the reach
// short of the intended target. Leg-length ratios likewise don't need
// reintroducing here -- BoneIKController measures the CURRENT (possibly
// customized) bone lengths itself at construction, and bending a
// customized-length leg to reach the fixed baseline target is exactly
// what IK is for.
export function updateLegIK(
  controller: BoneIKController,
  ikSpace: TransformNode,
  hipBone: Bone,
  baselineSample: { ankleOffset: Vector3; kneeOffset: Vector3 },
): void {
  const hipPos = hipBone.getAbsolutePosition(ikSpace);
  controller.targetPosition = hipPos.add(baselineSample.ankleOffset);
  controller.poleTargetPosition = hipPos.add(baselineSample.kneeOffset);
  controller.update();
}

export interface LegIKBakeTarget {
  hipBone: Bone;
  kneeBone: Bone;
  controller: BoneIKController;
  baseline: LegBaselineSample[];
}

function findRotationAnimation(group: AnimationGroup, node: TransformNode): Animation | undefined {
  return group.targetedAnimations.find(
    (ta) => ta.target === node && ta.animation.targetProperty === "rotationQuaternion",
  )?.animation;
}

// GLTF2Export only ever serializes each Animation's existing authored
// keyframes (confirmed by reading glTFAnimation.js down to
// Animation._interpolate: it never samples live scene/bone state) -- so
// per-frame IK correction, applied only at render time via
// onBeforeRenderObservable, would silently vanish from any exported GLB
// without this. Bakes the IK-corrected hip/knee rotation into the group's
// own rotationQuaternion channels by sampling at `frameStep` intervals
// across the clip's full range, evaluating the IK solve at each sampled
// frame against the baseline (not live playback), and replacing each
// channel's keys via Animation.setKeys -- the same primitive the exporter
// itself uses internally. Ankle/foot rotation is untouched (Phase 4 kept
// ankle correction position-only), so only hip and knee channels bake.
//
// Runs in-place on the same live Animation objects the running app uses
// for playback, so the caller MUST invoke the returned restore function
// (putting the original, pre-bake keys back) once export finishes --
// otherwise live playback would be left running against a now-static
// baked curve instead of per-frame IK.
export function bakeLegIKIntoAnimations(
  group: AnimationGroup,
  skeleton: Skeleton,
  ikSpace: TransformNode,
  legs: LegIKBakeTarget[],
  frameStep: number,
): () => void {
  const channelsByBone = legs.map((leg) => {
    const hipNode = leg.hipBone.getTransformNode();
    const kneeNode = leg.kneeBone.getTransformNode();
    if (!hipNode || !kneeNode) {
      throw new Error("Leg bone has no linked transform node");
    }
    return {
      leg,
      hipNode,
      kneeNode,
      hipAnimation: findRotationAnimation(group, hipNode),
      kneeAnimation: findRotationAnimation(group, kneeNode),
    };
  });

  const sampledKeys = new Map<Animation, IAnimationKey[]>();
  for (const { hipAnimation, kneeAnimation } of channelsByBone) {
    if (hipAnimation) {
      sampledKeys.set(hipAnimation, []);
    }
    if (kneeAnimation) {
      sampledKeys.set(kneeAnimation, []);
    }
  }

  const frames: number[] = [];
  for (let f = group.from; f < group.to; f += frameStep) {
    frames.push(f);
  }
  frames.push(group.to);

  for (const frame of frames) {
    group.goToFrame(frame);
    syncBonesFromLinkedTransformNodes(skeleton);
    for (const { leg, hipNode, kneeNode, hipAnimation, kneeAnimation } of channelsByBone) {
      const sample = sampleLegBaseline(leg.baseline, frame);
      updateLegIK(leg.controller, ikSpace, leg.hipBone, sample);
      if (hipAnimation && hipNode.rotationQuaternion) {
        sampledKeys.get(hipAnimation)?.push({ frame, value: hipNode.rotationQuaternion.clone() });
      }
      if (kneeAnimation && kneeNode.rotationQuaternion) {
        sampledKeys.get(kneeAnimation)?.push({ frame, value: kneeNode.rotationQuaternion.clone() });
      }
    }
  }

  const backups: Array<{ animation: Animation; originalKeys: IAnimationKey[] }> = [];
  for (const [animation, newKeys] of sampledKeys) {
    backups.push({ animation, originalKeys: animation.getKeys() });
    animation.setKeys(newKeys);
  }

  return () => {
    for (const { animation, originalKeys } of backups) {
      animation.setKeys(originalKeys);
    }
  };
}
