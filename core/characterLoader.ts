import { SceneLoader, type Scene } from "@babylonjs/core";
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
