/** Dev-only: петте нива на сградите в Магнат отблизо, под светлината на сцената
 *  (/buildings.html). За преглед на детайла, който в общия изглед е дребен. */
import { AmbientLight, BoxGeometry, Color, DirectionalLight, HemisphereLight, Mesh, MeshStandardMaterial, PerspectiveCamera, Scene } from "three";
import { RenderCore } from "../features/game/gl/render";
import { defaultGfxParams } from "../features/game/gl/gfxRegistry";
import { BuildingKit } from "../features/game/magnat/buildings";

const view = new URLSearchParams(location.search).get("view") ?? "front";
const scene = new Scene();
scene.background = new Color("#0e2c1c");
const camera = new PerspectiveCamera(30, 16 / 9, 0.1, 100);
if (view === "keep") {
  camera.position.set(3.6, 2.2, 4.2);
  camera.lookAt(3.1, 0.9, 0);
} else if (view === "top") camera.position.set(0, 5.2, 5.4);
else camera.position.set(0.6, 2.1, 6.2);
if (view !== "keep") camera.lookAt(0, 0.8, 0);

scene.add(new AmbientLight(0xffffff, 0.32));
scene.add(new HemisphereLight(0xfff3d8, 0x20180f, 0.45));
const key = new DirectionalLight(0xfff1d4, 2.0);
key.position.set(7, 30, 14);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.bias = -0.0006;
Object.assign(key.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 60 });
scene.add(key);
const rim = new DirectionalLight(0xbfe0f2, 0.3);
rim.position.set(-10, 16, -12);
scene.add(rim);

const ground = new Mesh(new BoxGeometry(12, 0.1, 5), new MeshStandardMaterial({ color: "#1a5a36", roughness: 0.96 }));
ground.position.y = -0.05;
ground.receiveShadow = true;
scene.add(ground);

let core: RenderCore | null = null;
const kit = new BuildingKit(() => core?.invalidate());
const colors = ["#e23b3b", "#2f7fe2", "#2faa55", "#e8b923", "#9b4fd0"];
for (let lvl = 1; lvl <= 5; lvl++) {
  const b = kit.build(lvl, colors[lvl - 1]!, lvl);
  b.position.set((lvl - 3) * 1.55, 0, 0);
  b.rotation.y = -0.35;
  scene.add(b);
}

const params = defaultGfxParams();
params.exposure = 1.08;
params.bloom = { enabled: true, strength: 0.06, radius: 0.45, threshold: 1.35 };
params.ao = { enabled: true, radius: 0.6, intensity: 1.0 };
core = new RenderCore({ canvas: document.getElementById("c") as HTMLCanvasElement, scene, camera, width: innerWidth, ratio: 9 / 16, params });
setTimeout(() => ((window as unknown as { __showReady?: boolean }).__showReady = true), 2500);
