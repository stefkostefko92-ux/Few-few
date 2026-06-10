/** Dev-only visual harness for the 3D Ludo board. */
import { LudoScene } from "./ludoScene";
const progress = [
  [-1, 0, 5, 44],
  [-1, -1, 3, 12],
  [8, 40, 2, -1],
  [-1, -1, -1, 20],
];
const scene = new LudoScene(document.getElementById("c") as HTMLCanvasElement, 580);
scene.setState(progress, 4, 0, new Set([1, 2]), 4);
setTimeout(() => ((window as unknown as { __lReady?: boolean }).__lReady = true), 900);
