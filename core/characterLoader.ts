import {
  type AbstractMesh,
  SceneLoader,
  SceneLoaderAnimationGroupLoadingMode,
  type Scene,
  type Skeleton,
  type TransformNode,
  Vector3,
} from "@babylonjs/core";
import "@babylonjs/loaders/glTF";
import type { CharacterHandle } from "./types";

export async function loadCharacter(
  scene: Scene,
  rootUrl: string,
  fileName: string,
): Promise<CharacterHandle> {
  const result = await SceneLoader.ImportMeshAsync("", rootUrl, fileName, scene);
  // The parentless node is usually the loader's synthetic "__root__" mesh,
  // not a TransformNode, so both arrays need checking.
  const rootNode = [...result.meshes, ...result.transformNodes].find((node) => !node.parent);
  if (!rootNode) {
    throw new Error(`No root node found in ${fileName}`);
  }
  return {
    meshes: result.meshes,
    skeletons: result.skeletons,
    animationGroups: result.animationGroups,
    rootNode,
  };
}

// Retargets an animation-only glTF onto existing scene nodes by matching names.
// animationGroupLoadingMode must be NoSync, or it defaults to disposing every
// previously loaded animation group before adding the new one.
export async function loadAnimationClip(
  scene: Scene,
  rootUrl: string,
  fileName: string,
): Promise<void> {
  await SceneLoader.ImportAnimationsAsync(
    rootUrl,
    fileName,
    scene,
    false,
    SceneLoaderAnimationGroupLoadingMode.NoSync,
  );
}

// Loads a skinned equipment mesh and rebinds it onto an already-loaded
// skeleton, discarding the duplicate skeleton the glTF brings with it. Only
// correct if the equipment was authored against the same bone hierarchy/order
// as targetSkeleton (see tools/make_equipment_placeholder.py). Reparents the
// mesh onto the SAME parent the character's own skinned mesh uses (not the
// overall scene root): the character's mesh sits one level below the true
// root (root -> "Armature" -> mesh), and the skeleton's bones live in
// Armature's space too. Reparenting equipment straight onto the true root
// instead puts its mesh transform in a different reference frame than the
// skin matrices operate in, which corrupts the skinned result -- the mesh
// still tracks bone rotation, but position/scale render wildly wrong.
export async function loadEquipment(
  scene: Scene,
  rootUrl: string,
  fileName: string,
  targetSkeleton: Skeleton,
  targetMesh: AbstractMesh,
): Promise<AbstractMesh[]> {
  const parentNode = targetMesh.parent;
  if (!parentNode) {
    throw new Error("targetMesh has no parent to reparent equipment onto");
  }
  const result = await SceneLoader.ImportMeshAsync("", rootUrl, fileName, scene);
  const meshesWithGeometry = result.meshes.filter((m) => m.getTotalVertices() > 0);
  for (const mesh of meshesWithGeometry) {
    mesh.skeleton = targetSkeleton;
    mesh.parent = parentNode;
  }
  for (const skeleton of result.skeletons) {
    skeleton.dispose();
  }
  return meshesWithGeometry;
}

// Loads a rigid (unskinned) prop mesh and parents it directly to the
// TransformNode Babylon's glTF loader links to the given bone -- the
// "weapons, shields" case from CLAUDE.md's Equipment approach, distinct from
// loadEquipment's shared-skeleton skinned layers. Deliberately not using
// attachToBone: it tracks the bone correctly at render time, but the glTF
// exporter's scene-graph walk doesn't see it at all, so an attached prop
// silently vanishes from any export. Plain reparenting to the bone's own
// linked node is a normal parent/child relationship, so it exports like any
// other node.
export async function loadProp(
  scene: Scene,
  rootUrl: string,
  fileName: string,
  skeleton: Skeleton,
  boneName: string,
  rotationOffset: Vector3 = Vector3.Zero(),
): Promise<AbstractMesh> {
  const result = await SceneLoader.ImportMeshAsync("", rootUrl, fileName, scene);
  const mesh = result.meshes.find((m) => m.getTotalVertices() > 0);
  if (!mesh) {
    throw new Error(`No mesh geometry found in ${fileName}`);
  }
  const bone = skeleton.bones.find((b) => b.name === boneName);
  if (!bone) {
    throw new Error(`Bone "${boneName}" not found on skeleton`);
  }
  const boneNode = bone.getTransformNode();
  if (!boneNode) {
    throw new Error(`Bone "${boneName}" has no linked transform node`);
  }
  // The bone's node carries the character's baked-in import scale (e.g.
  // 0.01), so compensate by its inverse to keep the prop's authored size.
  boneNode.computeWorldMatrix(true);
  const parentScaling = boneNode.absoluteScaling;
  mesh.position.set(0, 0, 0);
  mesh.rotationQuaternion = null;
  mesh.rotation.copyFrom(rotationOffset);
  mesh.scaling.set(1 / parentScaling.x, 1 / parentScaling.y, 1 / parentScaling.z);
  mesh.parent = boneNode;
  return mesh;
}
