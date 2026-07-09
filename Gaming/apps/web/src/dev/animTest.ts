/** Dev-only: drives two consecutive states through a scene and samples the
 *  moved piece's world position, proving move animations actually run.
 *  Open /anim-test.html?g=ludo|bg|draughts; window.__samples fills up. */
import { LudoScene } from "../features/game/ludo/ludoScene";
import { BackgammonScene, type BgState } from "../features/game/backgammon/backgammonScene";
import { DraughtsScene } from "../features/game/draughts/draughtsScene";

type Sample = { t: number; x: number; y: number; z: number };
const samples: Sample[] = [];
const w = window as unknown as { __samples?: Sample[]; __done?: boolean };
const canvas = document.getElementById("c") as HTMLCanvasElement;
const g = new URLSearchParams(location.search).get("g") ?? "ludo";

function record(get: () => { x: number; y: number; z: number } | null): void {
  const t0 = performance.now();
  // rAF (not setInterval): software GL renders flat-out during the animation
  // and starves timers; rAF ticks once per rendered frame.
  const tick = () => {
    const p = get();
    if (p) samples.push({ t: performance.now() - t0, x: p.x, y: p.y, z: p.z });
    if (performance.now() - t0 > 2600) {
      w.__samples = samples;
      w.__done = true;
      return;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

if (g === "ludo") {
  const scene = new LudoScene(canvas, 580);
  const p1 = [
    [-1, 0, 5, 44],
    [-1, -1, 3, 12],
    [8, 40, 2, -1],
    [-1, -1, -1, 20],
  ];
  scene.setState(p1, 4, 0, new Set(), null);
  setTimeout(() => {
    const p2 = p1.map((r) => r.slice());
    p2[0]![1] = 3; // seat 0, token 1: prog 0 → 3 (three-cell walk)
    scene.setState(p2, 4, 0, new Set(), 3);
    const grp = (scene as unknown as { tokenMap: Map<string, { position: { x: number; y: number; z: number } }> }).tokenMap.get("0:1")!;
    record(() => grp.position);
  }, 800);
} else if (g === "bg") {
  const scene = new BackgammonScene(canvas, 900);
  const mk = (pts: Partial<Record<number, number>>): BgState => {
    const points = new Array<number>(24).fill(0);
    for (const [k, v] of Object.entries(pts)) points[Number(k)] = v!;
    return { points, bar: [0, 0], off: [0, 0], turn: 0, dice: [3], remaining: [3] };
  };
  scene.setState(mk({ 0: 2, 11: 5, 23: -2 }), 0);
  setTimeout(() => {
    scene.setState(mk({ 0: 1, 3: 1, 11: 5, 23: -2 }), 0); // white 0 → 3
    const anims = (scene as unknown as { moveAnims: { mesh: { position: { x: number; y: number; z: number } } }[] }).moveAnims;
    record(() => anims[0]?.mesh.position ?? null);
  }, 800);
} else {
  const scene = new DraughtsScene(canvas, 580, "white");
  const b1 = new Array<"w" | "b" | null>(64).fill(null);
  b1[41] = "w";
  b1[34] = "b";
  scene.setState(b1.slice());
  setTimeout(() => {
    const b2 = new Array<"w" | "b" | null>(64).fill(null);
    b2[27] = "w"; // white jumps 41 → 27 capturing 34
    scene.setState(b2);
    const gl = () => (scene as unknown as { glide: { g: { position: { x: number; y: number; z: number } } } | null }).glide;
    record(() => gl()?.g.position ?? null);
  }, 800);
}
