import { ArcRotateCamera, Engine, HemisphericLight, Scene, Vector3 } from "@babylonjs/core";
import { loadCharacter } from "../core/characterLoader";
import { AnimationController } from "../core/animationController";

const CHARACTER_FILE = "Walking.glb";

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
  const animationController = new AnimationController(character.animationGroups);
  animationController.play();
}

main();

engine.runRenderLoop(() => scene.render());
window.addEventListener("resize", () => engine.resize());
