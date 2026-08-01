import { type Skeleton, type TransformNode, Vector3 } from "@babylonjs/core";

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

// Captures each bone's own rest-pose local translation, once, before any
// body-shape editing happens. translateBodyPart needs this as its baseline:
// unlike scaleBodyPart (which always multiplies from a universal (1,1,1)
// identity), a bone's "length" via translation is the bone's own authored
// offset from its parent (e.g. mixamorig:LeftLeg's translation.y is the
// knee-to-hip distance) -- there's no universal starting point to assume, so
// it has to be read once per bone and reused as the fixed reference for
// every subsequent length ratio.
export function captureRestTranslations(
  skeleton: Skeleton,
  boneNames: string[],
): Record<string, Vector3> {
  return Object.fromEntries(
    boneNames.map((boneName) => [boneName, getBoneNode(skeleton, boneName).position.clone()]),
  );
}

// Reshapes a body part's length via rest-pose translation instead of Scale:
// sets each named bone's local position.y to its captured rest translation's
// Y scaled by `length`, leaving X/Z untouched. Y is the bone-length axis, per
// the same rig-wide convention scaleBodyPart already relies on. Unlike
// Scale-based length, this composes correctly through a rotated child joint
// with no shear to compensate for -- translation isn't reinterpreted through
// the child's own rotation the way a non-uniform parent scale is.
export function translateBodyPart(
  skeleton: Skeleton,
  boneNames: string[],
  restTranslations: Record<string, Vector3>,
  length: number,
): void {
  for (const boneName of boneNames) {
    const rest = restTranslations[boneName];
    getBoneNode(skeleton, boneName).position.set(rest.x, rest.y * length, rest.z);
  }
}
