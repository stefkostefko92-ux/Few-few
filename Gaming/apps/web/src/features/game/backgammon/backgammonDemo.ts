/** Dev-only visual harness for the 3D backgammon board (screenshot target). */
import { BackgammonScene, type BgState } from "./backgammonScene";

const points = new Array<number>(24).fill(0);
// standard starting position (+white toward 0, -black toward 23)
points[0] = -2; points[5] = 5; points[7] = 3; points[11] = -5;
points[12] = 5; points[16] = -3; points[18] = -5; points[23] = 2;

const state: BgState = {
  points,
  bar: [0, 0],
  off: [0, 0],
  turn: 0,
  dice: [3, 5],
  remaining: [3, 5],
};

const scene = new BackgammonScene(document.getElementById("c") as HTMLCanvasElement, 760);
scene.setState(state, 0, { from: new Set([23, 12, 7, 5]), targets: new Set([20, 9]) });

(window as unknown as { __advance?: () => void }).__advance = () => {
  const p = points.slice();
  p[5] = 4; p[2] = 1; // a white checker moved 5→2
  scene.setState({ ...state, points: p, remaining: [5] }, 0, { from: new Set([23, 12, 7]), targets: new Set([18, 7]) });
};

setTimeout(() => ((window as unknown as { __bgReady?: boolean }).__bgReady = true), 900);
