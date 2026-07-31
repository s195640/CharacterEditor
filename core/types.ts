import type { AbstractMesh, AnimationGroup, Skeleton, TransformNode } from "@babylonjs/core";

export interface CharacterHandle {
  meshes: AbstractMesh[];
  skeletons: Skeleton[];
  animationGroups: AnimationGroup[];
  rootNode: TransformNode;
}
