/** Dev-only visual harness for the 3D draughts board. */
import { DraughtsScene } from "./draughtsScene";

type P = "w" | "W" | "b" | "B" | null;
const board: P[] = new Array<P>(64).fill(null);
for (let i = 0; i < 64; i++) {
  const col = i % 8, row = Math.floor(i / 8);
  if ((col + row) % 2 !== 1) continue;
  if (row <= 2) board[i] = "b";
  else if (row >= 5) board[i] = "w";
}
board[18] = "B"; // a black king for the demo
board[45] = "W"; // a white king

const scene = new DraughtsScene(document.getElementById("c") as HTMLCanvasElement, 560, "white");
scene.setState(board, { selected: 45, targets: new Set([36, 54]) });
setTimeout(() => ((window as unknown as { __dReady?: boolean }).__dReady = true), 900);
