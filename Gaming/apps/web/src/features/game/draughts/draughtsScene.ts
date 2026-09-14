/**
 * Дама (draughts) 3D board (three.js). Wood-framed board, polished marble /
 * obsidian disc men, crowned kings, raycast picking to a cell, and a pop-in for
 * changed pieces. Shares gl/helpers (composer, env, wood, disposal). The React
 * view keeps its select/target/move logic; cell ids are absolute (0..63), the
 * camera flips for the black seat. Render-on-demand; reduced-motion aware.
 */
import {
  AmbientLight,
  BoxGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshPhysicalMaterial,
  OrthographicCamera,
  Plane,
  Raycaster,
  Scene,
  TorusGeometry,
  Vector2,
  Vector3,
} from "three";
import { contactShadow, disposeObject, easeInOut, easeOutBack, woodNormal, woodTexture } from "../gl/helpers.js";
import { defaultGfxParams } from "../gl/gfxRegistry.js";
import { RenderCore } from "../gl/render.js";

type Piece = "w" | "W" | "b" | "B" | null;
type Orientation = "white" | "black";

const SQ = 1;
const HALF = 4 * SQ;
const RAIL = 0.7;
const SCENE_RATIO = 0.82;
const POP_MS = 320;
const MOVE_MS = 280; // man glide between squares

function pieceMaterial(white: boolean): MeshPhysicalMaterial {
  return white
    ? new MeshPhysicalMaterial({ color: new Color("#f1e7d0"), roughness: 0.38, metalness: 0, clearcoat: 0.8, clearcoatRoughness: 0.22 })
    : new MeshPhysicalMaterial({ color: new Color("#1b1916"), roughness: 0.2, metalness: 0.18, clearcoat: 1, clearcoatRoughness: 0.12 });
}

export class DraughtsScene {
  private core!: RenderCore;
  private scene = new Scene();
  private camera: OrthographicCamera;
  private ray = new Raycaster();
  private boardPlane = new Plane(new Vector3(0, 1, 0), -0.18);
  private pieceLayer = new Group();
  private hiLayer = new Group();
  private prev: Piece[] = [];
  private pops: { g: Group; born: number }[] = [];
  private glide: { g: Group; from: Vector3; to: Vector3; start: number; lift: number } | null = null;
  private reduceMotion = false;

  constructor(canvas: HTMLCanvasElement, width: number, orientation: Orientation) {
    this.reduceMotion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    this.scene.background = new Color("#0d1024");

    const span = HALF + RAIL;
    // 0.98 (was 1.12): the board fills the frame like chess instead of floating
    const d = span * 0.98;
    const aspect = 1 / SCENE_RATIO;
    this.camera = new OrthographicCamera(-d * aspect, d * aspect, d, -d, 0.1, 200);
    const zside = orientation === "white" ? 1 : -1;
    this.camera.position.set(0, span * 1.7, span * 1.7 * zside);
    this.camera.lookAt(0, -0.3, 0);

    this.scene.add(new AmbientLight(0xffffff, 0.36));
    this.scene.add(new HemisphereLight(0xfff3d8, 0x20180f, 0.45));
    const key = new DirectionalLight(0xfff1d4, 1.95);
    key.position.set(span, span * 2.4, span * 1.2 * zside);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.bias = -0.0006;
    key.shadow.radius = 3; // soft PCF penumbra — premium contact shadows
    const sc = key.shadow.camera;
    sc.left = -span * 1.5; sc.right = span * 1.5; sc.top = span * 1.5; sc.bottom = -span * 1.5; sc.near = 1; sc.far = span * 8;
    this.scene.add(key);
    // Cool back-rim edge light: separates the obsidian men from the dark board.
    const rim = new DirectionalLight(0xbfe0f2, 0.38);
    rim.position.set(-span, span * 1.2, -span * 1.4 * zside);
    this.scene.add(rim);

    this.scene.add(this.pieceLayer, this.hiLayer);
    this.build();
    const params = defaultGfxParams();
    params.exposure = 0.98;
    // 1.35/0.06 (portal-wide tuning): ivory men + light squares under the 1.95
    // key cross the default 1.3 threshold and halo.
    params.bloom = { enabled: params.bloom.enabled, strength: 0.06, radius: 0.45, threshold: 1.35 };
    this.core = new RenderCore({
      canvas,
      scene: this.scene,
      camera: this.camera,
      width,
      ratio: SCENE_RATIO,
      params,
      onFrame: () => this.frame(),
    });
  }

  /** Per-frame hook from RenderCore: piece pop-ins + the move glide. Returns
   *  true while animating so the loop renders at full rate (else it idles). */
  private frame(): boolean {
    if (this.pops.length === 0 && !this.glide) return false;
    const now = performance.now();
    this.pops = this.pops.filter((p) => {
      const t = (now - p.born) / POP_MS;
      if (t >= 1) {
        p.g.scale.setScalar(1);
        return false;
      }
      p.g.scale.setScalar(Math.max(0.01, easeOutBack(t)));
      return true;
    });
    if (this.glide) {
      const t = (now - this.glide.start) / MOVE_MS;
      if (t >= 1) {
        this.glide.g.position.copy(this.glide.to);
        this.glide = null;
      } else {
        this.glide.g.position.lerpVectors(this.glide.from, this.glide.to, easeInOut(t));
        this.glide.g.position.y += Math.sin(Math.PI * t) * this.glide.lift;
      }
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
      new MeshPhysicalMaterial({ map: woodTex, normalMap: woodN, normalScale: new Vector2(0.6, 0.6), roughness: 0.5, metalness: 0.08 }),
    );
    frame.position.y = -0.1;
    frame.receiveShadow = true;
    this.scene.add(frame);

    const lightMat = new MeshPhysicalMaterial({ color: new Color("#ddccA3".toLowerCase()), roughness: 0.45, clearcoat: 0.4, clearcoatRoughness: 0.4 });
    const darkMat = new MeshPhysicalMaterial({ color: new Color("#5f3f24"), roughness: 0.45, clearcoat: 0.4, clearcoatRoughness: 0.4 });
    const sqGeo = new BoxGeometry(SQ * 0.99, 0.12, SQ * 0.99);
    for (let i = 0; i < 64; i++) {
      const col = i % 8;
      const row = Math.floor(i / 8);
      const sq = new Mesh(sqGeo, (col + row) % 2 === 1 ? darkMat : lightMat);
      sq.position.set(col - 3.5, 0.1, row - 3.5);
      sq.receiveShadow = true;
      this.scene.add(sq);
    }
  }

  private cellWorld(i: number): [number, number] {
    return [(i % 8) - 3.5, Math.floor(i / 8) - 3.5];
  }

  private buildPiece(piece: Exclude<Piece, null>): Group {
    const white = piece === "w" || piece === "W";
    const king = piece === "W" || piece === "B";
    const mat = pieceMaterial(white);
    const g = new Group();
    // 0.26: disc bottom lands exactly on the square top (0.16) — no air gap
    const disc = new Mesh(new CylinderGeometry(0.4, 0.42, 0.2, 36), mat);
    disc.position.y = 0.26;
    disc.castShadow = true;
    // soft AO disc grounds the man (matches chess pieces)
    const ground = contactShadow(0.5, 0.3);
    ground.position.y = 0.165;
    g.add(disc, ground);
    if (king) {
      const top = new Mesh(new CylinderGeometry(0.36, 0.4, 0.18, 36), mat);
      top.position.y = 0.45;
      top.castShadow = true;
      const crown = new Mesh(
        new TorusGeometry(0.26, 0.05, 12, 28),
        new MeshPhysicalMaterial({ color: new Color("#e7c97a"), metalness: 1, roughness: 0.3 }),
      );
      crown.rotation.x = Math.PI / 2;
      crown.position.y = 0.56;
      crown.castShadow = true;
      g.add(top, crown);
    }
    return g;
  }

  setState(board: Piece[], highlight?: { selected: number | null; targets: Set<number> }): void {
    // Detect a single-man move (same colour left one square, arrived on one) so
    // it glides there instead of popping in — jumps lift in an arc over the
    // captured man. Anything else (promotion mid-air, multi-diffs) pops as before.
    let move: { from: number; to: number } | null = null;
    if (this.prev.length === 64 && !this.reduceMotion) {
      const colorOf = (p: Piece) => (p === "w" || p === "W" ? "w" : p === "b" || p === "B" ? "b" : null);
      const srcs: number[] = [];
      const dsts: number[] = [];
      for (let i = 0; i < 64; i++) {
        const a = this.prev[i] ?? null;
        const b = board[i] ?? null;
        if (a && !b) srcs.push(i);
        if (b && colorOf(a) !== colorOf(b)) dsts.push(i);
      }
      if (dsts.length === 1) {
        const dst = dsts[0]!;
        const c = colorOf(board[dst]!);
        const from = srcs.filter((i) => colorOf(this.prev[i]!) === c);
        if (from.length === 1) move = { from: from[0]!, to: dst };
      }
    }

    disposeObject(this.pieceLayer);
    this.pieceLayer.clear();
    this.pops = [];
    this.glide = null;

    for (let i = 0; i < 64; i++) {
      const piece = board[i];
      if (!piece) continue;
      const g = this.buildPiece(piece);
      const [x, z] = this.cellWorld(i);
      g.position.set(x, 0, z);
      this.pieceLayer.add(g);
      if (move && i === move.to) {
        const [fx, fz] = this.cellWorld(move.from);
        const jump = Math.abs(Math.floor(move.from / 8) - Math.floor(move.to / 8)) >= 2;
        this.glide = { g, from: new Vector3(fx, 0, fz), to: g.position.clone(), start: performance.now(), lift: jump ? 0.55 : 0.12 };
        g.position.set(fx, 0, fz);
        continue;
      }
      // pop a piece that just appeared or changed (capture/promotion)
      if (!this.reduceMotion && this.prev.length === 64 && this.prev[i] !== piece) {
        g.scale.setScalar(0.01);
        this.pops.push({ g, born: performance.now() });
      }
    }
    this.prev = board.slice();

    disposeObject(this.hiLayer);
    this.hiLayer.clear();
    if (highlight) {
      if (highlight.selected !== null) this.addCellHi(highlight.selected, "#3a9bd0", 0.4);
      for (const t of highlight.targets) this.addCellHi(t, "#3ad07a", 0.32);
    }
    this.core.invalidate();
  }

  private addCellHi(i: number, color: string, opacity: number): void {
    const [x, z] = this.cellWorld(i);
    const m = new Mesh(
      new BoxGeometry(SQ * 0.96, 0.05, SQ * 0.96),
      new MeshPhysicalMaterial({ color: new Color(color), emissive: new Color(color), emissiveIntensity: 0.5, transparent: true, opacity }),
    );
    m.position.set(x, 0.17, z);
    this.hiLayer.add(m);
  }

  /** Raycast a screen point to a cell index (0..63) or null. */
  pick(clientX: number, clientY: number, rect: DOMRect): number | null {
    const ndc = new Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -(((clientY - rect.top) / rect.height) * 2 - 1));
    this.ray.setFromCamera(ndc, this.camera);
    const hit = new Vector3();
    if (!this.ray.ray.intersectPlane(this.boardPlane, hit)) return null;
    const col = Math.round(hit.x + 3.5);
    const row = Math.round(hit.z + 3.5);
    if (col < 0 || col > 7 || row < 0 || row > 7) return null;
    return row * 8 + col;
  }

  resize(width: number): void {
    this.core.setSize(width);
  }

  destroy(): void {
    this.core.dispose();
    disposeObject(this.scene);
  }
}
