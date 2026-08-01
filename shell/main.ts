import {
  ArcRotateCamera,
  Color3,
  DirectionalLight,
  Engine,
  HemisphericLight,
  MeshBuilder,
  Scene,
  ShadowGenerator,
  StandardMaterial,
  Vector3,
} from "@babylonjs/core";
import type { AbstractMesh } from "@babylonjs/core";
import {
  loadAnimationClip,
  loadCharacter,
  loadEquipment,
  loadProp,
  stopOrphanedAnimatables,
  stripPositionAnimations,
  stripScaleAnimations,
} from "../core/characterLoader";
import { AnimationController } from "../core/animationController";
import { captureRestTranslations, getBoneNode, scaleBodyPart, translateBodyPart } from "../core/bodyShape";
import { exportCharacter } from "../core/exporter";
import { createControlPanel } from "./ui";

function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const CHARACTER_FILE = "Walking.glb";
const ADDITIONAL_ANIMATION_FILES = ["Idle.glb", "Running.glb"];
const EQUIPMENT_FILE = "Helmet.glb";
const SWORD_FILE = "Sword.glb";

interface EquippableItem {
  label: string;
  meshes: AbstractMesh[];
  equipped: boolean;
}

interface BodyPartConfig {
  tab: string;
  // Translation-based length (see docs/other/PLAN_translation_based_body_shape.MD):
  // this label's length lives in these bones' own rest-pose translation --
  // a bone's visual length (the segment from its own joint to its child's
  // joint) is stored on its CHILD, not itself, confirmed per bone group by
  // parsing Walking.glb's raw node data directly, not assumed to generalize
  // from one group to the next (e.g. Upper Leg's length target is LeftLeg,
  // Lower Leg's is LeftFoot -- one level further down the chain each time).
  lengthBones?: string[];
  // Scale-based fallback, now only for Lower Foot (a leaf bone with no
  // child to carry a translation-based length at all). Width no longer
  // exists as a control, so this always scales with width pinned to 1 --
  // length-only, same single slider as the translation-based labels.
  bones?: string[];
}

const BODY_PART_CONFIG: Record<string, BodyPartConfig> = {
  // Hips sits at/near the skeleton root -- no single parent-bone
  // translation represents "Hips length" the way a simple chain does.
  // Same proportional-children design as Hand below: scale all of Hips'
  // direct children's rest translations by the same ratio, treating Hips
  // as the one intentional "resize the whole pelvis area" macro control
  // (matching its long-standing role), not a single node's own translation.
  Hips: { lengthBones: ["mixamorig:LeftUpLeg", "mixamorig:RightUpLeg", "mixamorig:Spine"], tab: "Torso" },
  // Chain control: translation doesn't cascade the way Scale did, so every
  // segment's length-carrying child is listed explicitly and scaled by the
  // same ratio, rather than relying on hierarchy inheritance from a single
  // root-bone entry. Spine -> Spine1 -> Spine2 -> (forks into
  // Neck/LeftShoulder/RightShoulder, each independently controlled
  // elsewhere) -- so this only covers the two segments Spine structurally
  // owns (Spine's own length lives in Spine1's translation, Spine1's in
  // Spine2's), stopping before the fork to avoid double-editing what
  // Chest/Neck already control independently.
  Spine: { lengthBones: ["mixamorig:Spine1", "mixamorig:Spine2"], tab: "Torso" },
  Chest: { lengthBones: ["mixamorig:LeftArm", "mixamorig:RightArm"], tab: "Torso" },
  Neck: { lengthBones: ["mixamorig:Head"], tab: "Torso" },
  Head: { lengthBones: ["mixamorig:HeadTop_End"], tab: "Torso" },

  "Upper Leg": { lengthBones: ["mixamorig:LeftLeg", "mixamorig:RightLeg"], tab: "Legs" },
  "Lower Leg": { lengthBones: ["mixamorig:LeftFoot", "mixamorig:RightFoot"], tab: "Legs" },

  "Upper Foot": { lengthBones: ["mixamorig:LeftToeBase", "mixamorig:RightToeBase"], tab: "Foot" },
  "Middle Foot": { lengthBones: ["mixamorig:LeftToe_End", "mixamorig:RightToe_End"], tab: "Foot" },
  // Leaf bone (LeftToe_End/RightToe_End have no children) -- no node exists
  // to carry a translation-based length, so this stays Scale-based
  // permanently. Safe: nothing is compensated against a leaf's own
  // non-uniformity, so there's no shear risk to justify converting it even
  // if a translation target existed.
  "Lower Foot": { bones: ["mixamorig:LeftToe_End", "mixamorig:RightToe_End"], tab: "Foot" },

  "Upper Arm": { lengthBones: ["mixamorig:LeftForeArm", "mixamorig:RightForeArm"], tab: "Arms" },
  "Lower Arm": { lengthBones: ["mixamorig:LeftHand", "mixamorig:RightHand"], tab: "Arms" },

  // Same proportional-children design as Hips: LeftHand/RightHand fan out
  // into 5 children (one per finger), no single child represents "hand
  // length" the way a simple chain does, so all 10 (5 fingers x 2 hands)
  // first-knuckle translations scale together by the same ratio.
  Hand: {
    lengthBones: [
      "mixamorig:LeftHandIndex1",
      "mixamorig:LeftHandMiddle1",
      "mixamorig:LeftHandPinky1",
      "mixamorig:LeftHandRing1",
      "mixamorig:LeftHandThumb1",
      "mixamorig:RightHandIndex1",
      "mixamorig:RightHandMiddle1",
      "mixamorig:RightHandPinky1",
      "mixamorig:RightHandRing1",
      "mixamorig:RightHandThumb1",
    ],
    tab: "Hand",
  },

  // Chain controls: each finger's 4 segments (…1/2/3/4) need every
  // segment's length-carrying child listed explicitly (segment N's own
  // length lives in segment N+1's translation), covering the first 3
  // segments' lengths -- the last segment (…4) is a leaf with no child, so
  // like Lower Foot its own length has no translation target and is left
  // unaddressed, consistent with how every other leaf segment is handled.
  Thumb: {
    lengthBones: [
      "mixamorig:LeftHandThumb2",
      "mixamorig:LeftHandThumb3",
      "mixamorig:LeftHandThumb4",
      "mixamorig:RightHandThumb2",
      "mixamorig:RightHandThumb3",
      "mixamorig:RightHandThumb4",
    ],
    tab: "Fingers",
  },
  Index: {
    lengthBones: [
      "mixamorig:LeftHandIndex2",
      "mixamorig:LeftHandIndex3",
      "mixamorig:LeftHandIndex4",
      "mixamorig:RightHandIndex2",
      "mixamorig:RightHandIndex3",
      "mixamorig:RightHandIndex4",
    ],
    tab: "Fingers",
  },
  Middle: {
    lengthBones: [
      "mixamorig:LeftHandMiddle2",
      "mixamorig:LeftHandMiddle3",
      "mixamorig:LeftHandMiddle4",
      "mixamorig:RightHandMiddle2",
      "mixamorig:RightHandMiddle3",
      "mixamorig:RightHandMiddle4",
    ],
    tab: "Fingers",
  },
  Ring: {
    lengthBones: [
      "mixamorig:LeftHandRing2",
      "mixamorig:LeftHandRing3",
      "mixamorig:LeftHandRing4",
      "mixamorig:RightHandRing2",
      "mixamorig:RightHandRing3",
      "mixamorig:RightHandRing4",
    ],
    tab: "Fingers",
  },
  Pinky: {
    lengthBones: [
      "mixamorig:LeftHandPinky2",
      "mixamorig:LeftHandPinky3",
      "mixamorig:LeftHandPinky4",
      "mixamorig:RightHandPinky2",
      "mixamorig:RightHandPinky3",
      "mixamorig:RightHandPinky4",
    ],
    tab: "Fingers",
  },
};

const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
const engine = new Engine(canvas, true);
const scene = new Scene(engine);

const camera = new ArcRotateCamera(
  "camera",
  -Math.PI / 2,
  Math.PI / 2.5,
  3,
  new Vector3(0, 1, 0),
  scene,
);
camera.attachControl(canvas, true);
// Proportional zoom: each wheel notch changes radius by a percentage of the
// current radius, rather than wheelPrecision's fixed absolute step -- so
// steps shrink automatically as the camera gets closer, instead of a single
// notch overshooting once already zoomed in.
camera.wheelDeltaPercentage = 0.01;

const ambientLight = new HemisphericLight("ambientLight", new Vector3(0, 1, 0), scene);
ambientLight.intensity = 0.6;

const sunLight = new DirectionalLight("sun", new Vector3(-1, -2, -1), scene);
sunLight.position = new Vector3(5, 10, 5);
sunLight.intensity = 0.8;
// Fixed frustum size, rather than the default per-frame auto-fit to every
// shadow caster's current bounding box: a skinned mesh's bounding info can
// balloon based on the whole skeleton's pose even when barely any of it
// actually influences the mesh (seen with the Helmet, weighted to one bone
// out of 65), inflating the frustum and blurring the whole shadow map.
sunLight.shadowFrustumSize = 6;

const shadowGenerator = new ShadowGenerator(1024, sunLight);
shadowGenerator.useBlurExponentialShadowMap = true;

const ground = MeshBuilder.CreateGround("ground", { width: 10, height: 10 }, scene);
const groundMaterial = new StandardMaterial("groundMaterial", scene);
groundMaterial.diffuseColor = new Color3(0.5, 0.5, 0.5);
groundMaterial.specularColor = Color3.Black();
ground.material = groundMaterial;
ground.receiveShadows = true;

async function main() {
  const character = await loadCharacter(scene, "/characters/", CHARACTER_FILE);
  character.meshes.forEach((mesh) => shadowGenerator.addShadowCaster(mesh));
  for (const file of ADDITIONAL_ANIMATION_FILES) {
    await loadAnimationClip(scene, "/characters/", file);
  }
  stripScaleAnimations(scene);
  // Translation-based bone length (see docs/other/PLAN_translation_based_body_shape.MD):
  // a bone's visual length (the segment from its own joint to its child's
  // joint) is stored in its CHILD's translation, not its own -- confirmed
  // per bone group by parsing Walking.glb's raw node data directly (e.g.
  // mixamorig:LeftLeg's translation.y is actually the THIGH's length
  // (Upper Leg), one level further down the chain than the bone it's
  // named after) -- the opposite of scaleBodyPart's convention, where
  // scaling a bone's OWN scale is what stretches its own segment.
  const lengthBones = Object.values(BODY_PART_CONFIG).flatMap((config) => config.lengthBones ?? []);
  // These translation channels are baked-constant dead weight, same
  // pattern as the scale=1 channel stripScaleAnimations already handles
  // (confirmed by parsing Walking.glb's raw keyframe data: 2 identical
  // keys per bone checked), but unlike scale this can't be stripped
  // rig-wide -- Hips carries genuine root motion in its own translation
  // channel -- so this only targets the specific bones being edited via
  // rest translation.
  stripPositionAnimations(scene, lengthBones);
  // Captured once, before any body-shape edit -- translateBodyPart's fixed
  // reference point for every subsequent length ratio.
  const restTranslations = captureRestTranslations(character.skeletons[0], lengthBones);

  const animationController = new AnimationController(scene.animationGroups);
  animationController.play();

  const characterMesh = character.meshes.find((mesh) => mesh.skeleton === character.skeletons[0]);
  if (!characterMesh) {
    throw new Error("Character mesh with a skeleton not found");
  }

  const equipmentMeshes = await loadEquipment(
    scene,
    "/characters/",
    EQUIPMENT_FILE,
    character.skeletons[0],
    characterMesh,
  );
  const rightSwordMesh = await loadProp(
    scene,
    "/characters/",
    SWORD_FILE,
    character.skeletons[0],
    "mixamorig:RightHand",
    new Vector3(Math.PI, 0, 0),
  );
  const leftSwordMesh = await loadProp(
    scene,
    "/characters/",
    SWORD_FILE,
    character.skeletons[0],
    "mixamorig:LeftHand",
    new Vector3(Math.PI, 0, 0),
  );
  const equippables: EquippableItem[] = [
    { label: "Helmet", meshes: equipmentMeshes, equipped: false },
    { label: "Right Sword", meshes: [rightSwordMesh], equipped: false },
    { label: "Left Sword", meshes: [leftSwordMesh], equipped: false },
  ];

  // Equipment only becomes a shadow caster while actually equipped. A
  // disabled mesh's world matrix isn't kept up to date, so the shadow
  // generator's frustum auto-sizing (which factors in every registered
  // caster's bounding info regardless of visibility) picked up stale/enormous
  // bounds from hidden items -- most visibly the swords, whose local scale
  // compensates a ~100x parent scale difference -- and blurred the whole
  // shadow map.
  const setEquippableState = (item: EquippableItem, value: boolean) => {
    item.equipped = value;
    item.meshes.forEach((mesh) => {
      mesh.setEnabled(value);
      if (value) {
        shadowGenerator.addShadowCaster(mesh);
      } else {
        shadowGenerator.removeShadowCaster(mesh);
      }
    });
    panel.setEquipmentState(item.label, value);
  };

  let sunEnabled = true;
  const setSunEnabled = (value: boolean) => {
    sunEnabled = value;
    sunLight.setEnabled(sunEnabled);
    panel.setSunState(sunEnabled);
  };

  const bodyPartState = Object.fromEntries(
    Object.keys(BODY_PART_CONFIG).map((label) => [label, 1]),
  );
  const applyBodyPart = (label: string) => {
    const config = BODY_PART_CONFIG[label];
    const length = bodyPartState[label];
    if (config.lengthBones) {
      translateBodyPart(character.skeletons[0], config.lengthBones, restTranslations, length);
      return;
    }
    // Interim Scale-based fallback (Hips, Hand, Spine, Fingers -- Phase 3;
    // Lower Foot permanently, a leaf bone with no translation target).
    // Width no longer exists as a control, so it's always pinned to 1.
    scaleBodyPart(character.skeletons[0], config.bones!, length, 1);
  };

  // Any bone between the hips and the toe (Upper Leg, Lower Leg, Feet) hangs
  // downward, so lengthening it pushes the foot further away -- i.e. further
  // down, through the ground -- instead of making the character taller with
  // feet still planted. Compensate by raising the whole character so the
  // foot returns to its original ground-contact height, regardless of which
  // of those bones actually caused the drop.
  //
  // This is measured directly, not derived from a formula: a first attempt
  // (for Legs alone, before Feet existed as a separate control) computed the
  // expected added length from rest-pose bone offsets times the hips'
  // absoluteScaling, which turned out unreliable for a bone-linked
  // TransformNode (it read back a bare 1 instead of the real parent-chain
  // scale at rest, and didn't scale proportionally once actually stretched --
  // confirmed by comparing the predicted vs. actual foot-drop across several
  // slider values, which diverged non-linearly instead of matching).
  //
  // A second attempt measured the foot's world position every frame and
  // forced it to a fixed height continuously -- which "worked" in Idle, but
  // during Running drove the right foot as low as -0.62 world-Y with zero
  // body-shape sliders touched at all (confirmed by sampling both toes over
  // a full running cycle). A walk/run gait lifts each foot off the ground
  // for part of its cycle by design; locking the left foot flat on every
  // frame fights that natural motion and forces the whole character to bob
  // to compensate, which then throws the right foot's independent swing out
  // of sync since only the left foot was ever measured.
  //
  // A third attempt measured only the left foot's before/after delta on
  // slider change and added it once into the root offset. This avoids
  // fighting gait, but still has two gaps: (1) during a mid-stride pose the
  // legs aren't vertical, so the same scale change produces a slightly
  // different vertical drop for the left and right foot -- canceling one
  // exactly leaves the other a little off, seen as the toes dipping slightly
  // into the ground; and (2) the compensation was stored as a fixed
  // world-space offset, so changing Size afterward rescaled the actual drop
  // but not the stored offset meant to cancel it, visibly lifting or sinking
  // the character. Averaging both feet's measured delta reduces (1). Storing
  // the offset normalized to Size 1.0 and re-multiplying by the current Size
  // whenever either Size or a body-shape slider changes fixes (2) -- Size is
  // a uniform scale we set ourselves (not read back from an unreliable
  // engine property), so multiplying by it is exact, unlike the earlier
  // formula attempt that relied on reading back scaling from Babylon.
  const leftToeBaseNode = getBoneNode(character.skeletons[0], "mixamorig:LeftToeBase");
  const rightToeBaseNode = getBoneNode(character.skeletons[0], "mixamorig:RightToeBase");
  const baseRootY = character.rootNode.position.y;
  const baseScale = character.rootNode.scaling.clone();
  let sizeValue = 1;
  let groundOffsetAtSize1 = 0;
  const applyRootTransform = () => {
    character.rootNode.scaling = baseScale.scale(sizeValue);
    character.rootNode.position.y = baseRootY + groundOffsetAtSize1 * sizeValue;
  };
  // getAbsolutePosition() reads a cached world matrix that's only refreshed
  // during a render pass -- reading it twice synchronously (before/after,
  // with no render in between) would return the same stale value both
  // times, always measuring a delta of zero. Force a recompute on each read.
  const measureFootY = (node: typeof leftToeBaseNode) => {
    node.computeWorldMatrix(true);
    return node.getAbsolutePosition().y;
  };
  const setSize = (value: number) => {
    sizeValue = value;
    applyRootTransform();
  };
  // A fourth gap in the third attempt above: it measured the delta at
  // whatever single pose happened to be active when the slider moved. A
  // leg segment's actual vertical drop from a given scale change depends
  // on the segment's CURRENT orientation, which varies substantially
  // across a gait cycle -- the shin swings much further from vertical than
  // the thigh does, especially in Running. Confirmed the hard way: Lower
  // Leg 200% looked correctly compensated in a static Idle pose, but during
  // Running dipped the foot as low as -0.21 world-Y (vs. a +0.05 baseline
  // minimum with no scaling) at frames far from whatever pose was active
  // when the slider was dragged.
  //
  // Fixed by sampling the delta at several evenly spaced frames across the
  // CURRENTLY SELECTED animation's whole [from, to] range instead of one
  // instant, and using the worst-case (largest) delta -- this guarantees
  // the foot never dips below its own natural baseline height at any frame
  // of that cycle. At frames where the actual scale-induced drop was
  // smaller than the worst case, the foot sits slightly above its natural
  // baseline instead -- a far less jarring result than clipping through
  // the ground. Two passes (measure every sample frame with the OLD state,
  // commit the change, measure every sample frame again with the NEW
  // state) avoid toggling bodyPartState back and forth per sample.
  // AnimationController.getCurrentGroup() exposes the raw group (not the
  // display-rounded getCurrentFrame()) so the exact original frame can be
  // restored afterward -- this all happens synchronously within one
  // slider input handler, before any render occurs, so the sampling pass
  // itself is never visible either way, but restoring exactly is still
  // correct practice and cheap. 40 samples comfortably exceeds Walking's
  // and Running's own keyframe density (33 and 21 respectively, across
  // their full range) without needing to land on every keyframe exactly to
  // catch the worst case; measured at ~3.5ms average per slider change
  // in-browser (max ~7ms), well within interactive range. Applied
  // uniformly to every
  // setBodyPart call, not just leg/foot labels, consistent with the
  // existing "reapply every label" decision above -- simpler than tracking
  // exactly which labels affect foot height, and the operations involved
  // (matrix math, no rendering) are cheap enough that the redundant
  // sampling for unrelated labels isn't noticeable.
  const GROUND_SAMPLE_COUNT = 40;
  const setBodyPart = (label: string, length: number) => {
    const group = animationController.getCurrentGroup();
    const originalFrame = group?.getCurrentFrame();
    const sampleFrames = group
      ? Array.from(
          { length: GROUND_SAMPLE_COUNT },
          (_, i) => group.from + ((group.to - group.from) * i) / (GROUND_SAMPLE_COUNT - 1),
        )
      : [0];

    const beforeLeft: number[] = [];
    const beforeRight: number[] = [];
    for (const frame of sampleFrames) {
      group?.goToFrame(frame);
      beforeLeft.push(measureFootY(leftToeBaseNode));
      beforeRight.push(measureFootY(rightToeBaseNode));
    }

    bodyPartState[label] = length;
    // Reapply every label, not just this one: some interim Scale-based
    // labels still cascade into their own descendants via hierarchy
    // inheritance, so leaving them stale here would measure the
    // ground-height delta against a transient, not-yet-settled pose.
    for (const otherLabel of Object.keys(BODY_PART_CONFIG)) {
      applyBodyPart(otherLabel);
    }

    // Max across BOTH feet independently, not their average: left and
    // right legs are roughly out of phase during locomotion, so each
    // foot's worst-case dip happens at a different sampled frame.
    // Averaging the two at each frame before taking the max understated
    // what either foot individually needed at its own worst moment,
    // confirmed the hard way (averaging still left a small but real
    // negative dip that more samples alone didn't close). Taking the
    // true max means whichever foot needs the most compensation at its
    // single worst instant dictates the offset -- the other foot ends up
    // slightly above its own baseline at that frame instead, which is
    // the correct trade-off for "never clip through the ground".
    let worstDelta = -Infinity;
    for (let i = 0; i < sampleFrames.length; i++) {
      group?.goToFrame(sampleFrames[i]);
      const afterLeft = measureFootY(leftToeBaseNode);
      const afterRight = measureFootY(rightToeBaseNode);
      worstDelta = Math.max(worstDelta, beforeLeft[i] - afterLeft, beforeRight[i] - afterRight);
    }

    groundOffsetAtSize1 += worstDelta / sizeValue;
    applyRootTransform();

    if (group && originalFrame !== undefined) {
      group.goToFrame(originalFrame);
    }
  };

  // Body-shape scaling no longer needs reapplying every frame: the
  // retargeted animations' baked constant scale=1 track (Mixamo/Blender
  // bake full TRS keyframes even for channels that never change) used to
  // silently overwrite any manual bone scaling within a frame or two, but
  // stripScaleAnimations removes that dead-weight channel entirely at load
  // time (see characterLoader.ts), so applyBodyPart only needs to run when
  // a slider actually changes (setBodyPart), not every frame.
  //
  // stopOrphanedAnimatables still re-enforces every frame rather than
  // sweeping once after loading -- see its doc comment in characterLoader.ts
  // for why a one-shot sweep, even deferred to the next render frame,
  // wasn't reliable there (an unrelated Babylon quirk, not the same issue
  // this comment used to describe).
  scene.onBeforeRenderObservable.add(() => {
    stopOrphanedAnimatables(scene);
    panel.setFrameNumber(animationController.getCurrentFrame());
  });

  // Doesn't reuse setBodyPart's before/after measurement: that dance exists
  // to cancel drift caused BY a scale change, measured relative to whatever
  // pose the character happens to be in at that moment -- accurate for one
  // incremental adjustment, but not exact when undoing several at once from
  // a different animation pose than they were originally set from (a leg
  // scaled up while roughly vertical in Idle doesn't cancel by the same
  // vertical amount if unscaled while swung out mid-stride in Running).
  // Reset already knows the true defaults outright, so it sets them directly
  // instead of re-deriving them through measurement.
  const syncPauseUI = () => panel.setPauseState(animationController.isPaused());

  const resetAll = () => {
    for (const label of Object.keys(BODY_PART_CONFIG)) {
      bodyPartState[label] = 1;
      applyBodyPart(label);
    }
    groundOffsetAtSize1 = 0;
    setSize(1);
    equippables.forEach((item) => setEquippableState(item, false));
    setSunEnabled(true);
    animationController.play();
    animationController.setSpeed(1);
    syncPauseUI();
    panel.resetControls();
  };

  const handleExport = async () => {
    const result = await exportCharacter(scene, {
      sourceCharacter: CHARACTER_FILE,
      equippedItems: equippables.filter((item) => item.equipped).map((item) => item.label),
      shouldExportNode: (node) =>
        !equippables.some((item) => !item.equipped && item.meshes.some((mesh) => mesh === node)),
    });
    result.gltfData.downloadFiles();
    downloadJson("character.manifest.json", result.manifest);
  };

  const panel = createControlPanel({
    animationNames: animationController.list(),
    onSelectAnimation: (name) => {
      animationController.play(name);
      syncPauseUI();
    },
    equipmentItems: equippables.map((item) => ({
      label: item.label,
      onToggle: () => setEquippableState(item, !item.equipped),
    })),
    onExport: () => {
      void handleExport();
    },
    onToggleSun: () => setSunEnabled(!sunEnabled),
    onSizeChange: (value) => setSize(value),
    onSpeedChange: (value) => animationController.setSpeed(value),
    onReset: () => resetAll(),
    onTogglePause: () => {
      animationController.togglePause();
      syncPauseUI();
    },
    onStepFrame: (delta) => {
      animationController.stepFrame(delta);
      syncPauseUI();
    },
    bodyParts: Object.keys(BODY_PART_CONFIG).map((label) => ({
      label,
      tab: BODY_PART_CONFIG[label].tab,
      onLengthChange: (value: number) => setBodyPart(label, value),
    })),
  });
  equippables.forEach((item) => setEquippableState(item, false));

  const helmet = equippables[0];
  window.addEventListener("keydown", (event) => {
    if (event.code === "Space") {
      animationController.next();
      syncPauseUI();
    } else if (event.code === "KeyE") {
      setEquippableState(helmet, !helmet.equipped);
    }
  });
}

main();

engine.runRenderLoop(() => scene.render());
window.addEventListener("resize", () => engine.resize());
