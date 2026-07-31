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
import { loadAnimationClip, loadCharacter, loadEquipment, loadProp } from "../core/characterLoader";
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

const BODY_PART_BONES: Record<string, string[]> = {
  "Upper Arm": ["mixamorig:LeftArm", "mixamorig:RightArm"],
  "Lower Arm": ["mixamorig:LeftForeArm", "mixamorig:RightForeArm"],
  "Upper Leg": ["mixamorig:LeftUpLeg", "mixamorig:RightUpLeg"],
  "Lower Leg": ["mixamorig:LeftLeg", "mixamorig:RightLeg"],
  Neck: ["mixamorig:Neck"],
  Feet: ["mixamorig:LeftFoot", "mixamorig:RightFoot"],
  Head: ["mixamorig:Head"],
  Belly: ["mixamorig:Spine1"],
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

  const baseScale = character.rootNode.scaling.clone();
  const setSize = (value: number) => {
    character.rootNode.scaling = baseScale.scale(value);
  };

  const bodyPartState = Object.fromEntries(
    Object.keys(BODY_PART_BONES).map((label) => [label, { length: 1, width: 1 }]),
  );
  const applyBodyPart = (label: string) => {
    const state = bodyPartState[label];
    scaleBodyPart(character.skeletons[0], BODY_PART_BONES[label], state.length, state.width);
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
  // Instead, measure the foot's height immediately before and after applying
  // a scale change -- both reads happen synchronously within the same tick,
  // before the animation advances, so the delta reflects only the effect of
  // the new scale, not gait motion -- and accumulate that into the root
  // offset. Per-frame, only the scale values themselves need reapplying (see
  // below); height is otherwise left alone so the animation's own gait can
  // move the feet freely.
  const leftToeBaseNode = getBoneNode(character.skeletons[0], "mixamorig:LeftToeBase");
  const baseRootY = character.rootNode.position.y;
  let groundOffset = 0;
  // getAbsolutePosition() reads a cached world matrix that's only refreshed
  // during a render pass -- reading it twice synchronously (before/after,
  // with no render in between) would return the same stale value both
  // times, always measuring a delta of zero. Force a recompute on each read.
  const measureLeftToeY = () => {
    leftToeBaseNode.computeWorldMatrix(true);
    return leftToeBaseNode.getAbsolutePosition().y;
  };
  const setBodyPart = (label: string, length: number, width: number) => {
    const before = measureLeftToeY();
    bodyPartState[label] = { length, width };
    applyBodyPart(label);
    const after = measureLeftToeY();
    groundOffset += before - after;
    character.rootNode.position.y = baseRootY + groundOffset;
  };

  // The retargeted animations' baked glTF data apparently includes a
  // constant scale=1 track on every bone (Mixamo/Blender bake full TRS
  // keyframes even for channels that never change), which silently
  // overwrites any manual bone scaling within a frame or two. Reapplying
  // every frame, after the animation system has run, makes our override win
  // instead of fighting it once at slider-input time.
  scene.onBeforeRenderObservable.add(() => {
    for (const label of Object.keys(BODY_PART_BONES)) {
      applyBodyPart(label);
    }
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
  const resetAll = () => {
    setSize(1);
    for (const label of Object.keys(BODY_PART_BONES)) {
      bodyPartState[label] = { length: 1, width: 1 };
      applyBodyPart(label);
    }
    groundOffset = 0;
    character.rootNode.position.y = baseRootY;
    equippables.forEach((item) => setEquippableState(item, false));
    setSunEnabled(true);
    animationController.play();
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
    onSelectAnimation: (name) => animationController.play(name),
    equipmentItems: equippables.map((item) => ({
      label: item.label,
      onToggle: () => setEquippableState(item, !item.equipped),
    })),
    onExport: () => {
      void handleExport();
    },
    onToggleSun: () => setSunEnabled(!sunEnabled),
    onSizeChange: (value) => setSize(value),
    onReset: () => resetAll(),
    bodyParts: Object.keys(BODY_PART_BONES).map((label) => ({
      label,
      onLengthChange: (value: number) => setBodyPart(label, value, bodyPartState[label].width),
      onWidthChange: (value: number) => setBodyPart(label, bodyPartState[label].length, value),
    })),
  });
  equippables.forEach((item) => setEquippableState(item, false));

  const helmet = equippables[0];
  window.addEventListener("keydown", (event) => {
    if (event.code === "Space") {
      animationController.next();
    } else if (event.code === "KeyE") {
      setEquippableState(helmet, !helmet.equipped);
    }
  });
}

main();

engine.runRenderLoop(() => scene.render());
window.addEventListener("resize", () => engine.resize());
