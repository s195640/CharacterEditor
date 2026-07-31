import { ArcRotateCamera, Engine, HemisphericLight, Scene, Vector3 } from "@babylonjs/core";
import { loadAnimationClip, loadCharacter, loadEquipment } from "../core/characterLoader";
import { AnimationController } from "../core/animationController";
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

new HemisphericLight("light", new Vector3(0, 1, 0), scene);

async function main() {
  const character = await loadCharacter(scene, "/characters/", CHARACTER_FILE);
  for (const file of ADDITIONAL_ANIMATION_FILES) {
    await loadAnimationClip(scene, "/characters/", file);
  }

  const animationController = new AnimationController(scene.animationGroups);
  animationController.play();

  const equipmentMeshes = await loadEquipment(
    scene,
    "/characters/",
    EQUIPMENT_FILE,
    character.skeletons[0],
  );
  let equipped = false;
  const setEquipped = (value: boolean) => {
    equipped = value;
    equipmentMeshes.forEach((mesh) => mesh.setEnabled(equipped));
    panel.setEquipmentState(equipped);
  };

  const handleExport = async () => {
    const result = await exportCharacter(scene, {
      sourceCharacter: CHARACTER_FILE,
      equippedItems: equipped ? ["Helmet"] : [],
      shouldExportNode: (node) => equipped || !equipmentMeshes.some((mesh) => mesh === node),
    });
    result.gltfData.downloadFiles();
    downloadJson("character.manifest.json", result.manifest);
  };

  const panel = createControlPanel({
    animationNames: animationController.list(),
    onSelectAnimation: (name) => animationController.play(name),
    equipmentLabel: "Helmet",
    onToggleEquipment: () => setEquipped(!equipped),
    onExport: () => {
      void handleExport();
    },
  });
  setEquipped(false);

  window.addEventListener("keydown", (event) => {
    if (event.code === "Space") {
      animationController.next();
    } else if (event.code === "KeyE") {
      setEquipped(!equipped);
    }
  });
}

main();

engine.runRenderLoop(() => scene.render());
window.addEventListener("resize", () => engine.resize());
