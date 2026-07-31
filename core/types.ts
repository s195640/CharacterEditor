import type { AbstractMesh, AnimationGroup, Skeleton } from "@babylonjs/core";

export interface CharacterHandle {
  meshes: AbstractMesh[];
  skeletons: Skeleton[];
  animationGroups: AnimationGroup[];
}
