import {
  type AbstractMesh,
  SceneLoader,
  SceneLoaderAnimationGroupLoadingMode,
  type Scene,
  type Skeleton,
} from "@babylonjs/core";
import "@babylonjs/loaders/glTF";
import type { CharacterHandle } from "./types";

export async function loadCharacter(
  scene: Scene,
  rootUrl: string,
  fileName: string,
): Promise<CharacterHandle> {
  const result = await SceneLoader.ImportMeshAsync("", rootUrl, fileName, scene);
  return {
    meshes: result.meshes,
    skeletons: result.skeletons,
    animationGroups: result.animationGroups,
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
// as targetSkeleton (see tools/make_equipment_placeholder.py).
export async function loadEquipment(
  scene: Scene,
  rootUrl: string,
  fileName: string,
  targetSkeleton: Skeleton,
): Promise<AbstractMesh[]> {
  const result = await SceneLoader.ImportMeshAsync("", rootUrl, fileName, scene);
  for (const mesh of result.meshes) {
    if (mesh.skeleton) {
      mesh.skeleton = targetSkeleton;
    }
  }
  for (const skeleton of result.skeletons) {
    skeleton.dispose();
  }
  return result.meshes;
}
