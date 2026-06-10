/**
 * Шах (chess) 3D board (three.js). Turned (lathe) pieces + a stylised knight,
 * a wood-framed board, raycast picking to a square, and a glide animation for
 * the moved piece. Render-on-demand; honours prefers-reduced-motion; full GPU
 * disposal on unmount. The React view keeps its select/target/move logic.
 */
import {
  ACESFilmicToneMapping,
  AmbientLight,
  BoxGeometry,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  LatheGeometry,
  Mesh,
  MeshStandardMaterial,
  OrthographicCamera,
  PCFSoftShadowMap,
  Plane,
  Raycaster,
  Scene,
  SphereGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
  type BufferGeometry,
} from "three";
import { bakeEnvironment, disposeObject, easeInOut, woodNormal, woodTexture } from "../gl/helpers.js";
import { parseFen, type Orientation } from "./types.js";

const SQ = 1; // square size
const HALF = 4 * SQ; // board half-extent
const RAIL = 0.7;
const SCENE_RATIO = 0.82;
const MOVE_MS = 380;
const LIGHT = "#efe6d2";
const DARK = "#2a2622";

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

export class ChessScene {
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera: OrthographicCamera;
  private ray = new Raycaster();
  private boardPlane = new Plane(new Vector3(0, 1, 0), -0.16);
  private pieceLayer = new Group();
  private hiLayer = new Group();
  private prevFen = "";
  private anim: { mesh: Mesh; from: Vector3; to: Vector3; start: number } | null = null;
  private raf = 0;
  private animating = false;
  private reduceMotion = false;

  constructor(canvas: HTMLCanvasElement, width: number, orientation: Orientation) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(2, globalThis.devicePixelRatio || 1));
    this.renderer.setSize(width, width * SCENE_RATIO, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.reduceMotion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    this.scene.background = new Color("#0e2117");
    this.scene.environment = bakeEnvironment(this.renderer);

    const span = HALF + RAIL;
    const d = span * 1.12;
    const aspect = 1 / SCENE_RATIO;
    this.camera = new OrthographicCamera(-d * aspect, d * aspect, d, -d, 0.1, 200);
    const zside = orientation === "white" ? 1 : -1;
    this.camera.position.set(0, span * 1.5, span * 1.95 * zside);
    this.camera.lookAt(0, -0.5, 0);

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
    this.renderOnce();
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

    const lightMat = new MeshStandardMaterial({ color: new Color("#d9c9a3"), roughness: 0.6 });
    const darkMat = new MeshStandardMaterial({ color: new Color("#6b4a2c"), roughness: 0.6 });
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
    const color = piece[0] === "w" ? LIGHT : DARK;
    const type = piece[1] as PieceType;
    const mat = new MeshStandardMaterial({ color: new Color(color), roughness: 0.32, metalness: 0.2 });
    // Clone the cached body so per-setState disposal never frees the shared
    // singleton (clone copies buffers; original survives for the session).
    const node = new Mesh(bodyGeo(type).clone(), mat);
    node.castShadow = true;
    node.scale.setScalar(0.95);
    // finials / heads
    if (type === "Q" || type === "P" || type === "B") {
      const ball = new Mesh(new SphereGeometry(type === "P" ? 0.13 : 0.11, 16, 12), mat);
      ball.position.y = (type === "P" ? 0.5 : type === "B" ? 0.86 : 0.96) * 0.82;
      ball.castShadow = true;
      node.add(ball);
    }
    if (type === "K") {
      const v = new Mesh(new BoxGeometry(0.07, 0.26, 0.07), mat);
      const h = new Mesh(new BoxGeometry(0.2, 0.07, 0.07), mat);
      v.position.y = 1.06 * 0.82;
      h.position.y = 1.02 * 0.82;
      v.castShadow = true; h.castShadow = true;
      node.add(v, h);
    }
    if (type === "R") {
      for (let i = 0; i < 4; i++) {
        const c = new Mesh(new BoxGeometry(0.1, 0.1, 0.1), mat);
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        c.position.set(Math.cos(a) * 0.22, 0.72 * 0.82, Math.sin(a) * 0.22);
        c.castShadow = true;
        node.add(c);
      }
    }
    if (type === "N") {
      // stylised horse head from a couple of angled blocks
      const headMat = mat;
      const neck = new Mesh(new BoxGeometry(0.2, 0.34, 0.26), headMat);
      neck.position.set(0, 0.56 * 0.82, 0.02);
      neck.rotation.x = -0.35;
      const snout = new Mesh(new BoxGeometry(0.18, 0.16, 0.3), headMat);
      snout.position.set(0, 0.66 * 0.82, 0.16);
      snout.rotation.x = 0.2;
      neck.castShadow = true; snout.castShadow = true;
      node.add(neck, snout);
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

    this.startAnim();
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
    this.renderer.setSize(width, width * SCENE_RATIO, false);
    this.renderOnce();
  }

  private renderOnce(): void {
    this.renderer.render(this.scene, this.camera);
  }

  private startAnim(): void {
    if (!this.anim) {
      this.renderOnce();
      return;
    }
    if (this.animating) return;
    this.animating = true;
    const step = () => {
      let busy = false;
      if (this.anim) {
        const t = (performance.now() - this.anim.start) / MOVE_MS;
        if (t >= 1) {
          this.anim.mesh.position.copy(this.anim.to);
          this.anim = null;
        } else {
          busy = true;
          this.anim.mesh.position.lerpVectors(this.anim.from, this.anim.to, easeInOut(t));
          this.anim.mesh.position.y = 0.16 + Math.sin(Math.PI * t) * 0.45; // lift arc
        }
      }
      this.renderOnce();
      if (busy) this.raf = requestAnimationFrame(step);
      else this.animating = false;
    };
    this.raf = requestAnimationFrame(step);
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    disposeObject(this.scene);
    (this.scene.environment as { dispose?: () => void } | null)?.dispose?.();
    this.scene.environment = null;
    // _bodies are shared session-lifetime singletons — intentionally not disposed.
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
