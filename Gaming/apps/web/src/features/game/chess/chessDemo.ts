/** Dev-only visual harness for the 3D chess board (screenshot target). */
import { ChessScene } from "./chessScene";

const START = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
const scene = new ChessScene(document.getElementById("c") as HTMLCanvasElement, 560, "white");
scene.setState(START, { selected: "g8", targets: new Set(["f6", "h6"]), last: { from: "e2", to: "e4" } });

(window as unknown as { __advance?: () => void }).__advance = () => {
  const next = "rnbqkb1r/pppppppp/5n2/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 1 2";
  scene.setState(next, { selected: null, targets: new Set(), last: { from: "g8", to: "f6" } });
};

setTimeout(() => ((window as unknown as { __chessReady?: boolean }).__chessReady = true), 900);
