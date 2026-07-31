import type { Node, Scene } from "@babylonjs/core";
import { GLTF2Export, type GLTFData } from "@babylonjs/serializers";

export interface ExportManifest {
  sourceCharacter: string;
  animations: string[];
  equippedItems: string[];
}

export interface ExportOptions {
  sourceCharacter: string;
  equippedItems: string[];
  shouldExportNode?: (node: Node) => boolean;
}

export interface ExportResult {
  gltfData: GLTFData;
  manifest: ExportManifest;
}

export async function exportCharacter(scene: Scene, options: ExportOptions): Promise<ExportResult> {
  const gltfData = await GLTF2Export.GLBAsync(scene, "character", {
    shouldExportNode: options.shouldExportNode,
  });

  return {
    gltfData,
    manifest: {
      sourceCharacter: options.sourceCharacter,
      animations: scene.animationGroups.map((group) => group.name),
      equippedItems: options.equippedItems,
    },
  };
}
