import type { Skeleton, TransformNode } from "@babylonjs/core";

export function getBoneNode(skeleton: Skeleton, boneName: string): TransformNode {
  const bone = skeleton.bones.find((b) => b.name === boneName);
  if (!bone) {
    throw new Error(`Bone "${boneName}" not found on skeleton`);
  }
  const boneNode = bone.getTransformNode();
  if (!boneNode) {
    throw new Error(`Bone "${boneName}" has no linked transform node`);
  }
  return boneNode;
}

// Scales a group of bones to reshape a body part. Y is the bone-length axis
// and X/Z are width for every bone checked in this rig (arms, legs, spine,
// neck/head) -- confirmed by inspecting each bone's local translation
// relative to its parent, not assumed. Bones form a hierarchy, so scaling one
// also proportionally affects its descendants (e.g. scaling a spine bone
// moves the shoulders/arms/head above it) -- that's inherent to skeletal
// rigs, not a bug.
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
