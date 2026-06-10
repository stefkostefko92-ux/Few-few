/**
 * Табла (backgammon) 3D board (three.js) — premium nocturnal wood, fixed
 * near-top-down camera. Renders the 24 points, stacked checkers, the bar, the
 * bear-off trays and 3D dice; exposes raycast picking so the React view keeps
 * its existing click-to-move logic. Render-on-demand (rAF only while the dice
 * tumble) and honours prefers-reduced-motion.
 */
import {
  ACESFilmicToneMapping,
  AmbientLight,
  BoxGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  type Euler,
  Group,
  HemisphereLight,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  OrthographicCamera,
  PCFSoftShadowMap,
  Raycaster,
  Scene,
  Shape,
  ShapeGeometry,
  Vector2,
  WebGLRenderer,
} from "three";
import {
  DICE_FACE_ORDER,
  bakeEnvironment,
  disposeObject,
  faceUp,
  makeComposer,
  pipFaces,
  woodNormal,
  woodTexture,
} from "../gl/helpers.js";

export interface BgState {
  points: number[]; // 24 signed (+seat0/white, -seat1/black)
  bar: [number, number];
  off: [number, number];
  turn: number;
  dice: number[];
  remaining: number[];
}

export type PointId = number | "BAR";

const PW = 1.15; // point base width
const PLEN = 4.2; // point (triangle) length
const BARW = 1.4; // centre bar width
const HALF = 6 * PW; // half playfield width (6 points)
const RAIL = 0.9;
const SCENE_RATIO = 0.62;
const WHITE = "#efe6d2";
const BLACK = "#23211e";
const DICE_MS = 760;

const colX = (col: number): number =>
  col < 6 ? -BARW / 2 - (6 - col - 0.5) * PW : BARW / 2 + (col - 6 + 0.5) * PW;

/** Engine point index → board column (0..11) + row. */
function place(i: number): { x: number; z: number; top: boolean } {
  const top = i >= 12;
  const col = top ? i - 12 : 11 - i;
  return { x: colX(col), z: top ? -1 : 1, top };
}

export class BackgammonScene {
  private renderer: WebGLRenderer;
  private fx!: ReturnType<typeof makeComposer>;
  private scene = new Scene();
  private camera: OrthographicCamera;
  private ray = new Raycaster();
  private hitZones: Mesh[] = []; // invisible pick targets (userData.pid)
  private checkerLayer = new Group();
  private hiLayer = new Group();
  private dice: Mesh[] = [];
  private diceAnim: { start: number; from: [Euler, Euler]; to: [Euler, Euler] } | null = null;
  private prevDice = "";
  private raf = 0;
  private animating = false;
  private lastFrame = 0;
  private reduceMotion = false;
  private depth: number;

  constructor(canvas: HTMLCanvasElement, width: number) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(2, globalThis.devicePixelRatio || 1));
    this.renderer.setSize(width, width * SCENE_RATIO, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    this.reduceMotion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    this.scene.background = new Color("#0e2117");
    this.scene.environment = bakeEnvironment(this.renderer);

    const W = 2 * HALF + BARW + 2 * RAIL;
    this.depth = 2 * PLEN + 2 * RAIL + 1.2;
    const d = this.depth * 0.54;
    const aspect = 1 / SCENE_RATIO;
    this.camera = new OrthographicCamera(-d * aspect, d * aspect, d, -d, 0.1, 200);
    this.camera.position.set(0, W * 1.25, this.depth * 1.35);
    this.camera.lookAt(0, 0, 0);

    this.scene.add(new AmbientLight(0xffffff, 0.34));
    this.scene.add(new HemisphereLight(0xfff3d8, 0x20180f, 0.45));
    const key = new DirectionalLight(0xfff1d4, 1.9);
    key.position.set(W * 0.3, W * 1.6, this.depth);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.bias = -0.0006;
    const sc = key.shadow.camera;
    sc.left = -W; sc.right = W; sc.top = this.depth; sc.bottom = -this.depth; sc.near = 1; sc.far = W * 6;
    this.scene.add(key);

    this.scene.add(this.checkerLayer, this.hiLayer);
    this.build();
    this.fx = makeComposer(this.renderer, this.scene, this.camera, width, width * SCENE_RATIO);
    this.renderOnce();
  }

  private build(): void {
    const W = 2 * HALF + BARW;
    const D = 2 * PLEN;
    // wood frame + felt bed
    const woodTex = woodTexture();
    woodTex.repeat.set(6, 1);
    const woodN = woodNormal();
    woodN.repeat.set(6, 1);
    const woodMat = new MeshStandardMaterial({ map: woodTex, normalMap: woodN, normalScale: new Vector2(0.6, 0.6), roughness: 0.5, metalness: 0.08 });
    const frame = new Mesh(new BoxGeometry(W + 2 * RAIL, 0.7, D + 2 * RAIL), woodMat);
    frame.position.y = -0.35;
    frame.receiveShadow = true;
    this.scene.add(frame);

    const bed = new Mesh(
      new BoxGeometry(W, 0.12, D),
      new MeshStandardMaterial({ color: new Color("#15402a"), roughness: 0.95 }),
    );
    bed.position.y = 0.02;
    bed.receiveShadow = true;
    this.scene.add(bed);

    // centre bar
    const bar = new Mesh(new BoxGeometry(BARW, 0.5, D + 2 * RAIL), woodMat);
    bar.position.y = 0.04;
    bar.castShadow = true;
    bar.receiveShadow = true;
    this.scene.add(bar);

    // 24 point triangles + invisible pick zones
    for (let i = 0; i < 24; i++) {
      const p = place(i);
      const tone = i % 2 === 0 ? "#b9472e" : "#e6dcc6";
      const shape = new Shape();
      shape.moveTo(-PW / 2, 0);
      shape.lineTo(PW / 2, 0);
      shape.lineTo(0, PLEN * 0.92);
      shape.lineTo(-PW / 2, 0);
      const tri = new Mesh(
        new ShapeGeometry(shape),
        new MeshStandardMaterial({ color: new Color(tone), roughness: 0.7, side: DoubleSide }),
      );
      tri.rotation.x = -Math.PI / 2;
      // top row: base at far edge pointing inward (−z); bottom: near edge (+z)
      const baseZ = p.top ? -(D / 2 - 0.1) : D / 2 - 0.1;
      tri.position.set(p.x, 0.09, baseZ);
      tri.rotation.z = p.top ? Math.PI : 0;
      this.scene.add(tri);

      const hit = new Mesh(
        new BoxGeometry(PW, 0.4, PLEN),
        new MeshStandardMaterial({ visible: false }),
      );
      hit.position.set(p.x, 0.2, baseZ + (p.top ? PLEN / 2 : -PLEN / 2));
      hit.userData.pid = i;
      this.scene.add(hit);
      this.hitZones.push(hit);
    }

    // bar pick zone
    const barHit = new Mesh(new BoxGeometry(BARW, 0.5, D), new MeshStandardMaterial({ visible: false }));
    barHit.position.set(0, 0.25, 0);
    barHit.userData.pid = "BAR";
    this.scene.add(barHit);
    this.hitZones.push(barHit);
  }

  /** World position of the k-th checker (0-based) stacked on point i. */
  private checkerPos(i: number, k: number): [number, number, number] {
    const p = place(i);
    const D = 2 * PLEN;
    const r = PW * 0.42;
    const startZ = p.top ? -(D / 2 - 0.1 - r) : D / 2 - 0.1 - r;
    const step = (p.top ? 1 : -1) * r * 1.9;
    const stack = Math.min(k, 4);
    const lift = k >= 5 ? 0.16 * (k - 4) : 0; // pile up beyond 5
    return [p.x, 0.18 + lift, startZ + stack * step];
  }

  setState(state: BgState, mySeat: number, highlight?: { from: Set<PointId>; targets: Set<number> }): void {
    // rebuild checkers each state (≤30 cylinders — cheap, and disposed cleanly)
    disposeObject(this.checkerLayer);
    this.checkerLayer.clear();
    const geo = new CylinderGeometry(PW * 0.42, PW * 0.42, 0.22, 30);
    const matW = new MeshPhysicalMaterial({ color: new Color(WHITE), roughness: 0.32, metalness: 0.05, clearcoat: 0.8, clearcoatRoughness: 0.2 });
    const matB = new MeshPhysicalMaterial({ color: new Color(BLACK), roughness: 0.2, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.12 });

    for (let i = 0; i < 24; i++) {
      const v = state.points[i] ?? 0;
      if (v === 0) continue;
      const count = Math.abs(v);
      const mat = v > 0 ? matW : matB;
      for (let k = 0; k < count; k++) {
        const c = new Mesh(geo, mat);
        const [x, y, z] = this.checkerPos(i, k);
        c.position.set(x, y, z);
        c.castShadow = true;
        c.receiveShadow = true;
        this.checkerLayer.add(c);
      }
    }
    // bar checkers (centre, stacked vertically)
    const bars: [number, MeshStandardMaterial][] = [[state.bar[0], matW], [state.bar[1], matB]];
    bars.forEach(([n, mat], side) => {
      for (let k = 0; k < n; k++) {
        const c = new Mesh(geo, mat);
        c.position.set(0, 0.18, (side === 0 ? -1 : 1) * (1 + k * 0.42));
        c.castShadow = true;
        this.checkerLayer.add(c);
      }
    });

    // highlights (movable origins + targets)
    disposeObject(this.hiLayer);
    this.hiLayer.clear();
    if (highlight) {
      for (const pid of highlight.from) if (pid !== "BAR") this.addHighlight(pid as number, "#e8c531");
      for (const tg of highlight.targets) this.addHighlight(tg, "#3ad07a");
    }

    this.syncDice(state.remaining.length ? state.remaining : state.dice);
    void mySeat;
    this.startAnim();
  }

  private addHighlight(i: number, color: string): void {
    const p = place(i);
    const D = 2 * PLEN;
    const ring = new Mesh(
      new BoxGeometry(PW * 0.94, 0.05, PLEN * 0.9),
      new MeshStandardMaterial({ color: new Color(color), emissive: new Color(color), emissiveIntensity: 0.5, transparent: true, opacity: 0.35 }),
    );
    const baseZ = p.top ? -(D / 2 - 0.1) : D / 2 - 0.1;
    ring.position.set(p.x, 0.12, baseZ + (p.top ? PLEN / 2 : -PLEN / 2) * 0.9);
    this.hiLayer.add(ring);
  }

  private syncDice(values: number[]): void {
    if (!values.length) {
      this.dice.forEach((d) => (d.visible = false));
      this.prevDice = "";
      return;
    }
    while (this.dice.length < 2) {
      const faces = pipFaces();
      const mats = DICE_FACE_ORDER.map((f) => new MeshPhysicalMaterial({ map: faces[f], roughness: 0.32, clearcoat: 0.7, clearcoatRoughness: 0.2 }));
      const die = new Mesh(new BoxGeometry(0.9, 0.9, 0.9), mats);
      die.castShadow = true;
      this.scene.add(die);
      this.dice.push(die);
    }
    this.dice.forEach((d, n) => {
      d.visible = n < values.length;
      d.position.set((n - (values.length - 1) / 2) * 1.3, 0.5, 0);
    });
    const key = values.join(",");
    if (key !== this.prevDice) {
      this.prevDice = key;
      const to = values.map((v) => faceUp(v)) as [Euler, Euler];
      if (this.reduceMotion) this.dice.forEach((d, n) => to[n] && d.rotation.copy(to[n]!));
      else this.diceAnim = { start: performance.now(), from: [this.dice[0]!.rotation.clone(), this.dice[1]!.rotation.clone()], to };
    }
  }

  /** Raycast a screen point to a board point id (or null). */
  pick(clientX: number, clientY: number, rect: DOMRect): PointId | null {
    const ndc = new Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -(((clientY - rect.top) / rect.height) * 2 - 1));
    this.ray.setFromCamera(ndc, this.camera);
    const hit = this.ray.intersectObjects(this.hitZones, false)[0];
    return hit ? (hit.object.userData.pid as PointId) : null;
  }

  resize(width: number): void {
    const h = width * SCENE_RATIO;
    this.renderer.setSize(width, h, false);
    this.fx.setSize(width, h);
    this.renderOnce();
  }

  private renderOnce(): void {
    this.fx.composer.render();
  }

  private startAnim(): void {
    if (this.animating) {
      this.renderOnce();
      return;
    }
    if (!this.diceAnim) {
      this.renderOnce();
      return;
    }
    this.animating = true;
    this.lastFrame = performance.now();
    const step = () => {
      const now = performance.now();
      const dt = Math.min(now - this.lastFrame, 50);
      this.lastFrame = now;
      let busy = false;
      if (this.diceAnim) {
        const t = (now - this.diceAnim.start) / DICE_MS;
        if (t >= 1) {
          this.dice.forEach((d, n) => this.diceAnim!.to[n] && d.rotation.copy(this.diceAnim!.to[n]!));
          this.diceAnim = null;
        } else {
          busy = true;
          const spin = t < 0.7;
          this.dice.forEach((d, n) => {
            const to = this.diceAnim!.to[n];
            if (!to) return;
            if (spin) {
              d.rotation.x += (0.5 + n * 0.12) * (dt / 16);
              d.rotation.y += (0.62 - n * 0.1) * (dt / 16);
            } else {
              d.rotation.x += (to.x - d.rotation.x) * 0.25;
              d.rotation.y += (to.y - d.rotation.y) * 0.25;
              d.rotation.z += (to.z - d.rotation.z) * 0.25;
            }
            d.position.y = 0.5 + Math.abs(Math.sin(t * Math.PI * 3)) * 0.4 * (1 - t);
          });
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
    this.fx.dispose();
    disposeObject(this.scene);
    (this.scene.environment as { dispose?: () => void } | null)?.dispose?.();
    this.scene.environment = null;
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
