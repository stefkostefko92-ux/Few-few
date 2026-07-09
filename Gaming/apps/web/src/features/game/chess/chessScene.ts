/**
 * Шах (chess) 3D board (three.js). Turned (lathe) pieces + a stylised knight,
 * a wood-framed board, raycast picking to a square, and a glide animation for
 * the moved piece. Render-on-demand; honours prefers-reduced-motion; full GPU
 * disposal on unmount. The React view keeps its select/target/move logic.
 */
import {
  AmbientLight,
  BoxGeometry,
  Color,
  DirectionalLight,
  ExtrudeGeometry,
  Group,
  HemisphereLight,
  LatheGeometry,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  OrthographicCamera,
  Plane,
  Raycaster,
  Scene,
  Shape,
  SphereGeometry,
  Vector2,
  Vector3,
  type BufferGeometry,
} from "three";
import { contactShadow, disposeObject, easeInOut, woodNormal, woodTexture } from "../gl/helpers.js";
import { defaultGfxParams } from "../gl/gfxRegistry.js";
import { RenderCore } from "../gl/render.js";
import { parseFen, type Orientation } from "./types.js";

const SQ = 1; // square size
const HALF = 4 * SQ; // board half-extent
const RAIL = 0.7;
const SCENE_RATIO = 0.82;
const MOVE_MS = 380;

type PieceType = "K" | "Q" | "R" | "B" | "N" | "P";

function lathe(pts: [number, number][]): LatheGeometry {
  return new LatheGeometry(pts.map(([r, y]) => new Vector2(Math.max(r, 0.0001), y)), 28);
}

/** Cached body geometry per piece type (rotationally symmetric part). */
const _bodies: Partial<Record<PieceType, BufferGeometry>> = {};
function bodyGeo(t: PieceType): BufferGeometry {
  if (_bodies[t]) return _bodies[t]!;
  let g: BufferGeometry;
  switch (t) {
    case "P":
      g = lathe([[0, 0], [0.32, 0], [0.32, 0.06], [0.18, 0.12], [0.15, 0.3], [0.22, 0.36], [0.1, 0.44], [0.1, 0.46]]);
      break;
    case "R":
      g = lathe([[0, 0], [0.36, 0], [0.36, 0.07], [0.22, 0.13], [0.2, 0.5], [0.27, 0.56], [0.3, 0.64], [0.3, 0.7], [0, 0.7]]);
      break;
    case "B":
      g = lathe([[0, 0], [0.34, 0], [0.34, 0.07], [0.2, 0.13], [0.16, 0.45], [0.24, 0.52], [0.12, 0.62], [0.1, 0.74], [0, 0.82]]);
      break;
    case "N":
      g = lathe([[0, 0], [0.36, 0], [0.36, 0.07], [0.22, 0.13], [0.2, 0.34], [0.22, 0.4], [0.16, 0.46]]);
      break;
    case "Q":
      g = lathe([[0, 0], [0.38, 0], [0.38, 0.07], [0.22, 0.14], [0.17, 0.62], [0.27, 0.7], [0.3, 0.82], [0.12, 0.86], [0, 0.92]]);
      break;
    default: // K
      g = lathe([[0, 0], [0.38, 0], [0.38, 0.07], [0.22, 0.14], [0.18, 0.7], [0.28, 0.78], [0.31, 0.9], [0.14, 0.94], [0.14, 0.98]]);
  }
  _bodies[t] = g;
  return g;
}

let _knight: BufferGeometry | null = null;
/** Extruded horse-head silhouette for the knight (broadside, looking +x). */
function knightHead(): BufferGeometry {
  if (_knight) return _knight;
  const pts: [number, number][] = [
    [-0.22, 0.0], [-0.26, 0.22], [-0.22, 0.4], [-0.24, 0.56], [-0.1, 0.6],
    [-0.05, 0.74], [0.03, 0.6], [0.09, 0.63], [0.17, 0.54], [0.31, 0.44],
    [0.41, 0.34], [0.45, 0.26], [0.4, 0.2], [0.3, 0.2], [0.22, 0.1], [0.1, 0.04],
  ];
  const s = new Shape();
  s.moveTo(pts[0]![0], pts[0]![1]);
  for (let i = 1; i < pts.length; i++) s.lineTo(pts[i]![0], pts[i]![1]);
  s.closePath();
  const g = new ExtrudeGeometry(s, { depth: 0.17, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2 });
  g.center();
  _knight = g;
  return g;
}

/** Polished marble (white) / obsidian (black) with a clear-coat sheen. */
function pieceMaterial(white: boolean): MeshPhysicalMaterial {
  return white
    ? new MeshPhysicalMaterial({ color: new Color("#efe0c2"), roughness: 0.32, metalness: 0, clearcoat: 0.7, clearcoatRoughness: 0.25 })
    : new MeshPhysicalMaterial({ color: new Color("#1b1916"), roughness: 0.22, metalness: 0.18, clearcoat: 1, clearcoatRoughness: 0.12 });
}

export class ChessScene {
  private core!: RenderCore;
  private scene = new Scene();
  private camera: OrthographicCamera;
  private ray = new Raycaster();
  private boardPlane = new Plane(new Vector3(0, 1, 0), -0.16);
  private pieceLayer = new Group();
  private hiLayer = new Group();
  private prevFen = "";
  private anim: { mesh: Mesh; from: Vector3; to: Vector3; start: number } | null = null;
  private reduceMotion = false;

  constructor(canvas: HTMLCanvasElement, width: number, orientation: Orientation) {
    this.reduceMotion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    this.scene.background = new Color("#0d1024");

    const span = HALF + RAIL;
    // Tight framing: the board fills the canvas instead of floating in margin.
    const d = span * 0.94;
    const aspect = 1 / SCENE_RATIO;
    this.camera = new OrthographicCamera(-d * aspect, d * aspect, d, -d, 0.1, 200);
    const zside = orientation === "white" ? 1 : -1;
    this.camera.position.set(0, span * 1.5, span * 1.95 * zside);
    this.camera.lookAt(0, -0.5, -0.55); // aim a touch toward the far rail so the tight crop stays symmetric

    this.scene.add(new AmbientLight(0xffffff, 0.36));
    this.scene.add(new HemisphereLight(0xfff3d8, 0x20180f, 0.45));
    const key = new DirectionalLight(0xfff1d4, 1.95);
    key.position.set(span, span * 2.4, span * 1.2 * zside);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.bias = -0.0006;
    const sc = key.shadow.camera;
    sc.left = -span * 1.5; sc.right = span * 1.5; sc.top = span * 1.5; sc.bottom = -span * 1.5; sc.near = 1; sc.far = span * 8;
    this.scene.add(key);

    this.scene.add(this.pieceLayer, this.hiLayer);
    this.build();
    const params = defaultGfxParams();
    // 1.35/0.06 (portal-wide tuning): marble pieces + light squares under the
    // 1.95 key cross the default 1.3 threshold and halo.
    params.bloom = { enabled: params.bloom.enabled, strength: 0.06, radius: 0.45, threshold: 1.35 };
    this.core = new RenderCore({
      canvas,
      scene: this.scene,
      camera: this.camera,
      width,
      ratio: SCENE_RATIO,
      params,
      onFrame: (now) => this.frame(now),
    });
  }

  /** Per-frame hook from RenderCore's loop: advance the move glide. Returns true
   *  while animating so the loop renders at full rate (else it idles to save power). */
  private frame(now: number): boolean {
    if (!this.anim) return false;
    const t = (now - this.anim.start) / MOVE_MS;
    if (t >= 1) {
      this.anim.mesh.position.copy(this.anim.to);
      this.anim = null;
    } else {
      this.anim.mesh.position.lerpVectors(this.anim.from, this.anim.to, easeInOut(t));
      this.anim.mesh.position.y = 0.16 + Math.sin(Math.PI * t) * 0.45; // lift arc
    }
    return true;
  }

  private build(): void {
    const W = 2 * HALF;
    const woodTex = woodTexture();
    woodTex.repeat.set(4, 1);
    const woodN = woodNormal();
    woodN.repeat.set(4, 1);
    const frame = new Mesh(
      new BoxGeometry(W + 2 * RAIL, 0.5, W + 2 * RAIL),
      new MeshStandardMaterial({ map: woodTex, normalMap: woodN, normalScale: new Vector2(0.6, 0.6), roughness: 0.5, metalness: 0.08 }),
    );
    frame.position.y = -0.1;
    frame.receiveShadow = true;
    this.scene.add(frame);

    const lightMat = new MeshPhysicalMaterial({ color: new Color("#ddccA3".toLowerCase()), roughness: 0.45, clearcoat: 0.4, clearcoatRoughness: 0.4 });
    const darkMat = new MeshPhysicalMaterial({ color: new Color("#5f3f24"), roughness: 0.45, clearcoat: 0.4, clearcoatRoughness: 0.4 });
    const sqGeo = new BoxGeometry(SQ * 0.99, 0.12, SQ * 0.99);
    for (let f = 0; f < 8; f++) {
      for (let r = 0; r < 8; r++) {
        const sq = new Mesh(sqGeo, (f + r) % 2 === 0 ? darkMat : lightMat);
        const [x, z] = this.squareWorld(f, r);
        sq.position.set(x, 0.1, z);
        sq.receiveShadow = true;
        this.scene.add(sq);
      }
    }
  }

  /** File (0..7) + rank (0..7) → world XZ (white plays from +Z). */
  private squareWorld(file: number, rank: number): [number, number] {
    return [file - 3.5, 3.5 - rank];
  }
  private squareIdWorld(square: string): [number, number] {
    return this.squareWorld(square.charCodeAt(0) - 97, Number(square[1]) - 1);
  }

  private buildPiece(piece: string): Mesh {
    const type = piece[1] as PieceType;
    const mat = pieceMaterial(piece[0] === "w");
    // Clone the cached body so per-setState disposal never frees the shared
    // singleton (clone copies buffers; original survives for the session).
    const node = new Mesh(bodyGeo(type).clone(), mat);
    node.castShadow = true;
    node.scale.setScalar(0.95);
    // Soft contact disc under the base grounds the piece on the board (radially
    // symmetric, so the knight's Y-rotation doesn't matter).
    const ground = contactShadow(0.44, 0.32);
    ground.position.y = 0.006;
    node.add(ground);
    if (type === "Q" || type === "P" || type === "B") {
      const ball = new Mesh(new SphereGeometry(type === "P" ? 0.12 : 0.1, 18, 14), mat);
      ball.position.y = type === "P" ? 0.5 : type === "B" ? 0.86 : 0.96;
      ball.castShadow = true;
      node.add(ball);
    }
    if (type === "K") {
      const v = new Mesh(new BoxGeometry(0.07, 0.28, 0.07), mat);
      const h = new Mesh(new BoxGeometry(0.22, 0.07, 0.07), mat);
      v.position.y = 1.12;
      h.position.y = 1.07;
      v.castShadow = true;
      h.castShadow = true;
      node.add(v, h);
    }
    if (type === "R") {
      for (let i = 0; i < 4; i++) {
        const c = new Mesh(new BoxGeometry(0.11, 0.12, 0.11), mat);
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        c.position.set(Math.cos(a) * 0.22, 0.72, Math.sin(a) * 0.22);
        c.castShadow = true;
        node.add(c);
      }
    }
    if (type === "N") {
      const head = new Mesh(knightHead().clone(), mat);
      head.scale.setScalar(0.66);
      head.position.set(-0.02, 0.7, 0);
      head.castShadow = true;
      node.add(head);
    }
    return node;
  }

  setState(
    fen: string,
    highlight?: { selected: string | null; targets: Set<string>; last: { from: string; to: string } | null },
  ): void {
    const last = highlight?.last ?? null;
    const animate = !this.reduceMotion && last !== null && fen !== this.prevFen && this.prevFen !== "";
    this.prevFen = fen;

    disposeObject(this.pieceLayer);
    this.pieceLayer.clear();
    this.anim = null;

    for (const row of parseFen(fen)) {
      for (const cell of row) {
        if (!cell.piece) continue;
        const node = this.buildPiece(cell.piece);
        const [x, z] = this.squareIdWorld(cell.square);
        if (animate && last && cell.square === last.to) {
          const [fx, fz] = this.squareIdWorld(last.from);
          node.position.set(fx, 0.16, fz);
          this.anim = { mesh: node, from: new Vector3(fx, 0.16, fz), to: new Vector3(x, 0.16, z), start: performance.now() };
        } else {
          node.position.set(x, 0.16, z);
        }
        this.pieceLayer.add(node);
      }
    }

    // highlights
    disposeObject(this.hiLayer);
    this.hiLayer.clear();
    if (highlight) {
      if (last) {
        this.addSquareHi(last.from, "#e8c531", 0.18);
        this.addSquareHi(last.to, "#e8c531", 0.22);
      }
      if (highlight.selected) this.addSquareHi(highlight.selected, "#3a9bd0", 0.35);
      for (const tg of highlight.targets) this.addSquareHi(tg, "#3ad07a", 0.3);
    }
    this.core.invalidate();
  }

  private addSquareHi(square: string, color: string, opacity: number): void {
    const [x, z] = this.squareIdWorld(square);
    const m = new Mesh(
      new BoxGeometry(SQ * 0.96, 0.04, SQ * 0.96),
      new MeshStandardMaterial({ color: new Color(color), emissive: new Color(color), emissiveIntensity: 0.5, transparent: true, opacity }),
    );
    m.position.set(x, 0.17, z);
    this.hiLayer.add(m);
  }

  /** Raycast a screen point to a square id (e.g. "e4") or null. */
  pick(clientX: number, clientY: number, rect: DOMRect): string | null {
    const ndc = new Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -(((clientY - rect.top) / rect.height) * 2 - 1));
    this.ray.setFromCamera(ndc, this.camera);
    const hit = new Vector3();
    if (!this.ray.ray.intersectPlane(this.boardPlane, hit)) return null;
    const file = Math.round(hit.x + 3.5);
    const rank = Math.round(3.5 - hit.z);
    if (file < 0 || file > 7 || rank < 0 || rank > 7) return null;
    return `${String.fromCharCode(97 + file)}${rank + 1}`;
  }

  resize(width: number): void {
    this.core.setSize(width);
  }

  destroy(): void {
    this.core.dispose();
    disposeObject(this.scene);
    // _bodies are shared session-lifetime singletons — intentionally not disposed.
  }
}
