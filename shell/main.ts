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
  stripScaleAnimations,
} from "../core/characterLoader";
import { AnimationController } from "../core/animationController";
import { getBoneNode, scaleBodyPart } from "../core/bodyShape";
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
  bones: string[];
  tab: string;
  // Bones form a hierarchy, so a parent's local scale unconditionally
  // multiplies through every descendant (Babylon composes a child's world
  // transform as parent.worldMatrix * child.localMatrix). Dividing this
  // label's desired length/width by the parent label's CURRENT
  // bodyPartState value cancels that inherited scale -- but only exactly
  // if the parent's own scale is uniform. A non-uniform parent scale
  // (length != width) reaches a rotated child as R⁻¹·S_parent·R, which is
  // only equal to S_parent (i.e. cancels cleanly via simple division) when
  // R is identity; for any real rotation it shears instead. This was first
  // caught via rest-pose rotation alone (pairs under ~20 degrees looked
  // safe, e.g. the knee's 2.18 degrees), but rest pose only describes the
  // BIND pose -- it says nothing about how far a joint actually rotates
  // during a specific animation. Running's mid-stride knee bend is far
  // from rest pose, and confirmed to produce real, visible shear despite
  // the "safe" rest-pose classification, worse the more extreme the
  // slider values (Size max + Upper Leg 200% turned a modest percentage
  // residual into the foot rendering far below the ground plane at
  // certain frames). Left undefined where the rest-pose rotation alone
  // was already too large for even a best-case simple division to work
  // (e.g. the ~65 degree ankle bend between Lower Leg and Upper Foot, or
  // the thumb's ~40 degree opposable rest orientation) -- those segments
  // are left to cascade from their parent, same as Hips is deliberately
  // left to cascade into everything below it as a "resize the whole area"
  // macro control, matching this project's earlier Belly/Spine1 precedent.
  parentLabel?: string;
  // A uniform scale (length === width) commutes with ANY rotation --
  // R⁻¹·(k·I)·R = k·I regardless of R -- so forcing a compensated pair's
  // PARENT to be uniform-only makes that pair's compensation exactly
  // shear-free at any joint angle, with no dependency on staying near rest
  // pose. This must propagate down any chain of compensated pairs: a bone
  // that is itself a child in one pair and a parent in another (e.g. Lower
  // Arm compensates against Upper Arm, and Hand compensates against Lower
  // Arm) must ALSO be uniform-only for the pair below it to be exact, even
  // though its own compensation against its own parent doesn't need it.
  // Rendered as a single "Size" slider instead of separate Length/Width
  // (see ui.ts).
  uniformOnly?: boolean;
}

// Order matters here: a label referencing `parentLabel` must be defined
// AFTER that parent, so resetAll's single reset pass (see below) computes
// each label's compensation against an already-reset parent instead of a
// stale one.
const BODY_PART_CONFIG: Record<string, BodyPartConfig> = {
  Hips: { bones: ["mixamorig:Hips"], tab: "Torso" },
  Spine: { bones: ["mixamorig:Spine"], tab: "Torso", uniformOnly: true },
  Chest: { bones: ["mixamorig:LeftShoulder", "mixamorig:RightShoulder"], tab: "Torso", uniformOnly: true },
  Neck: { bones: ["mixamorig:Neck"], tab: "Torso", parentLabel: "Spine", uniformOnly: true },
  Head: { bones: ["mixamorig:Head"], tab: "Torso", parentLabel: "Neck" },

  "Upper Leg": {
    bones: ["mixamorig:LeftUpLeg", "mixamorig:RightUpLeg"],
    tab: "Legs",
    uniformOnly: true,
  },
  "Lower Leg": {
    bones: ["mixamorig:LeftLeg", "mixamorig:RightLeg"],
    tab: "Legs",
    parentLabel: "Upper Leg",
  },

  "Upper Foot": { bones: ["mixamorig:LeftFoot", "mixamorig:RightFoot"], tab: "Foot" },
  "Middle Foot": {
    bones: ["mixamorig:LeftToeBase", "mixamorig:RightToeBase"],
    tab: "Foot",
    uniformOnly: true,
  },
  "Lower Foot": {
    bones: ["mixamorig:LeftToe_End", "mixamorig:RightToe_End"],
    tab: "Foot",
    parentLabel: "Middle Foot",
  },

  "Upper Arm": {
    bones: ["mixamorig:LeftArm", "mixamorig:RightArm"],
    tab: "Arms",
    parentLabel: "Chest",
    uniformOnly: true,
  },
  "Lower Arm": {
    bones: ["mixamorig:LeftForeArm", "mixamorig:RightForeArm"],
    tab: "Arms",
    parentLabel: "Upper Arm",
    uniformOnly: true,
  },

  Hand: {
    bones: ["mixamorig:LeftHand", "mixamorig:RightHand"],
    tab: "Hand",
    parentLabel: "Lower Arm",
    uniformOnly: true,
  },

  // Chain-root technique: each finger's 4 segments (…1/2/3/4) are chained
  // bones with near-identity rest-pose rotation between them, so only the
  // root segment is listed here -- scaling it cascades cleanly down the
  // whole finger via hierarchy inheritance instead of compounding by
  // setting the same scale on all 4 segments independently.
  Thumb: { bones: ["mixamorig:LeftHandThumb1", "mixamorig:RightHandThumb1"], tab: "Fingers" },
  Index: {
    bones: ["mixamorig:LeftHandIndex1", "mixamorig:RightHandIndex1"],
    tab: "Fingers",
    parentLabel: "Hand",
  },
  Middle: {
    bones: ["mixamorig:LeftHandMiddle1", "mixamorig:RightHandMiddle1"],
    tab: "Fingers",
    parentLabel: "Hand",
  },
  Ring: {
    bones: ["mixamorig:LeftHandRing1", "mixamorig:RightHandRing1"],
    tab: "Fingers",
    parentLabel: "Hand",
  },
  Pinky: {
    bones: ["mixamorig:LeftHandPinky1", "mixamorig:RightHandPinky1"],
    tab: "Fingers",
    parentLabel: "Hand",
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
    Object.keys(BODY_PART_CONFIG).map((label) => [label, { length: 1, width: 1 }]),
  );
  const applyBodyPart = (label: string) => {
    const config = BODY_PART_CONFIG[label];
    const state = bodyPartState[label];
    let length = state.length;
    let width = state.width;
    if (config.parentLabel) {
      const parentState = bodyPartState[config.parentLabel];
      length /= parentState.length;
      width /= parentState.width;
    }
    scaleBodyPart(character.skeletons[0], config.bones, length, width);
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
  const setBodyPart = (label: string, length: number, width: number) => {
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

    bodyPartState[label] = { length, width };
    // Reapply every label, not just this one: other labels' compensation
    // (see BODY_PART_CONFIG.parentLabel) divides by THIS label's state, so
    // leaving them stale here would measure the ground-height delta against
    // a transient, not-yet-settled pose -- the same class of bug already
    // fixed once this session for a single-level case, now correctness-
    // critical since dependencies run several levels deep (Head depends on
    // Neck depends on Spine).
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
      bodyPartState[label] = { length: 1, width: 1 };
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
      uniformOnly: BODY_PART_CONFIG[label].uniformOnly,
      onLengthChange: (value: number) => setBodyPart(label, value, bodyPartState[label].width),
      onWidthChange: (value: number) => setBodyPart(label, bodyPartState[label].length, value),
      onSizeChange: (value: number) => setBodyPart(label, value, value),
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
