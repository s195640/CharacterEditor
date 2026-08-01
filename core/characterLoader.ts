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

// ImportAnimationsAsync loads a clip into a temporary AssetContainer and
// retargets it onto this scene's matching nodes via mergeAnimationsTo --
// which, as a side effect, starts a raw Animatable per animated target via
// scene.beginAnimation() to preview the container's own already-playing
// state (confirmed by patching scene.beginAnimation and capturing a stack
// trace: every extra call traced back through mergeAnimationsTo to
// importAnimationsCoreAsync). These are separate from, and invisible to,
// the AnimationGroup the caller actually controls: they aren't in any
// group's own `animatables`, so pausing/stopping that group does nothing
// to them, and left alone they run forever, permanently overwriting the
// skeleton every frame regardless of what's actually selected (confirmed
// the hard way: with the intended group paused, scene.animatables still
// held unpaused entries per bone, and bone rotations kept drifting ~17
// degrees every 300ms).
//
// A one-shot sweep after loading, even deferred to the next actual render
// frame via onAfterRenderObservable, still consistently missed roughly a
// third of them no matter where in the loading sequence it ran (confirmed:
// moving it from right after the animation-clip loop to after
// equipment/props load made no difference at all -- same exact bones left
// over both times) -- these clips generate 3 scene.beginAnimation calls per
// bone (one per animated channel) per loadAnimationClip call, and something
// about replaying/replacing that many targets isn't done settling by any
// single point checked so far. Rather than chase the exact internal timing
// further, call this every frame (see main.ts) so the invariant "no
// ungrouped Animatable exists" gets continuously re-enforced instead of
// relying on a one-shot cleanup catching a moving target.
export function stopOrphanedAnimatables(scene: Scene): void {
  const groupOwned = new Set(scene.animationGroups.flatMap((g) => g.animatables));
  for (const animatable of scene.animatables) {
    if (!groupOwned.has(animatable)) {
      animatable.stop();
    }
  }
}

// Mixamo/Blender bakes a constant (1,1,1) "scaling" animation channel onto
// every bone in every clip, even though nothing ever actually animates
// scale -- confirmed by inspecting the retargeted clips' data (every
// keyframe's scale value is the same). This channel is why body-shape
// scaling has to be reapplied every frame in the live preview (the
// animation system overwrites .scaling with this baked constant otherwise),
// and it has a second, more serious consequence: GLTF2Export.GLBAsync
// serializes scene.animationGroups faithfully, including these channels, so
// any body-shape customization would be silently discarded the instant a
// downstream game engine plays one of the exported clips (an animated
// channel overrides a node's static property value while that animation
// plays -- standard glTF/engine behavior, not a Babylon quirk). Since the
// channel is provably constant, removing it changes no visible motion.
// AnimationGroup.removeTargetedAnimation is safe to call here: this runs
// once, right after loading, before any group has started playing.
export function stripScaleAnimations(scene: Scene): void {
  for (const group of scene.animationGroups) {
    for (const targetedAnimation of [...group.targetedAnimations]) {
      if (targetedAnimation.animation.targetProperty === "scaling") {
        group.removeTargetedAnimation(targetedAnimation.animation);
      }
    }
  }
}

// Unlike scaling (always a dead constant on every bone), a bone's translation
// channel is only sometimes dead weight: Hips carries genuine root-motion
// translation (confirmed by reading Walking.glb's raw keyframe data -- Hips'
// translation varies by several units across the clip), while non-root bones
// (LeftUpLeg, LeftLeg, LeftFoot, etc.) bake a constant translation channel
// with only 2 identical keyframes, the same dead-weight pattern
// stripScaleAnimations already handles for scale. Stripping indiscriminately
// would silently delete Hips' root motion, so this only removes translation
// channels for the specific bones the caller is about to body-shape-edit via
// rest translation, not every bone in the rig.
export function stripPositionAnimations(scene: Scene, boneNames: string[]): void {
  const names = new Set(boneNames);
  for (const group of scene.animationGroups) {
    for (const targetedAnimation of [...group.targetedAnimations]) {
      if (
        targetedAnimation.animation.targetProperty === "position" &&
        names.has(targetedAnimation.target?.name)
      ) {
        group.removeTargetedAnimation(targetedAnimation.animation);
      }
    }
  }
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
