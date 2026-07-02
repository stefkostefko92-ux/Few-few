/**
 * Не се сърди човече (Ludo) 3D board (three.js). Cross track + four coloured
 * corner houses + home columns on an 11×11 grid (geometry reused from board.ts),
 * peg tokens in seat colours, a single 3D die, and raycast picking of a token.
 * Shares gl/helpers (composer, env, disposal). Render-on-demand; reduced-motion.
 */
import {
  AmbientLight,
  BoxGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  type Euler,
  Group,
  HemisphereLight,
  LatheGeometry,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  OrthographicCamera,
  Raycaster,
  Scene,
  TorusGeometry,
  Vector2,
} from "three";
import {
  contactShadow,
  DICE_FACE_ORDER,
  disposeObject,
  faceUp,
  pipFaces,
  woodNormal,
  woodTexture,
} from "../gl/helpers.js";
import { defaultGfxParams } from "../gl/gfxRegistry.js";
import { RenderCore } from "../gl/render.js";
import { BASE, CENTER, HOME, N, SEAT_COLORS, TRACK, tokenCoord } from "./board.js";

const SCENE_RATIO = 0.84;
const DICE_MS = 760;
const H = (N - 1) / 2; // 5

const gx = (col: number) => col - H;
const gz = (row: number) => row - H;

export interface LudoToken {
  seat: number;
  token: number;
}

/** Classic turned Ludo pawn: base disc → waisted stem → collar → ball head. */
function pawnGeometry(): LatheGeometry {
  const pts = [
    [0.0, 0.0], [0.3, 0.0], [0.31, 0.05], [0.25, 0.09], [0.13, 0.26],
    [0.105, 0.38], [0.17, 0.44], [0.12, 0.5], [0.16, 0.58], [0.185, 0.66],
    [0.15, 0.74], [0.09, 0.8], [0.0, 0.83],
  ].map(([r, y]) => new Vector2(r!, y!));
  return new LatheGeometry(pts, 28);
}

export class LudoScene {
  private core!: RenderCore;
  private lastFrame = 0;
  private scene = new Scene();
  private camera: OrthographicCamera;
  private ray = new Raycaster();
  private tokenLayer = new Group();
  private pawnGeo: LatheGeometry;
  private die: Mesh | null = null;
  private diceAnim: { start: number; from: Euler; to: Euler } | null = null;
  private prevDie = -1;
  private reduceMotion = false;

  constructor(canvas: HTMLCanvasElement, width: number) {
    this.reduceMotion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    this.scene.background = new Color("#0e2117");
    this.pawnGeo = pawnGeometry();

    const span = H + 1.3;
    const d = span * 1.12;
    const aspect = 1 / SCENE_RATIO;
    this.camera = new OrthographicCamera(-d * aspect, d * aspect, d, -d, 0.1, 200);
    this.camera.position.set(0, span * 2.2, span * 1.35);
    this.camera.lookAt(0, -0.2, 0);

    this.scene.add(new AmbientLight(0xffffff, 0.36));
    this.scene.add(new HemisphereLight(0xfff3d8, 0x20180f, 0.45));
    // 1.55 (was 1.95): the ivory track under a hotter key crossed the bloom
    // threshold and the whole cross haloed like neon.
    const key = new DirectionalLight(0xfff1d4, 1.55);
    key.position.set(span, span * 2.6, span);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.bias = -0.0006;
    const sc = key.shadow.camera;
    sc.left = -span * 1.5; sc.right = span * 1.5; sc.top = span * 1.5; sc.bottom = -span * 1.5; sc.near = 1; sc.far = span * 8;
    this.scene.add(key);

    this.scene.add(this.tokenLayer);
    this.build();
    const params = defaultGfxParams();
    params.exposure = 1.0;
    // Same tuning as Магнат: 1.35 sits just above the lit ivory tiles' HDR
    // luminance, so only genuine highlights (gold ring, die spec) glow.
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

  /** Per-frame hook from RenderCore: tumble the die toward its face. Returns true
   *  while animating so the loop renders at full rate (else it idles to save power). */
  private frame(): boolean {
    const now = performance.now();
    const dt = this.lastFrame ? Math.min(now - this.lastFrame, 50) : 16;
    this.lastFrame = now;
    if (this.diceAnim && this.die) {
      const t = (now - this.diceAnim.start) / DICE_MS;
      if (t >= 1) {
        this.die.rotation.copy(this.diceAnim.to);
        this.diceAnim = null;
      } else {
        const to = this.diceAnim.to;
        if (t < 0.7) {
          this.die.rotation.x += 0.5 * (dt / 16);
          this.die.rotation.y += 0.6 * (dt / 16);
        } else {
          this.die.rotation.x += (to.x - this.die.rotation.x) * 0.25;
          this.die.rotation.y += (to.y - this.die.rotation.y) * 0.25;
          this.die.rotation.z += (to.z - this.die.rotation.z) * 0.25;
        }
        this.die.position.y = 0.6 + Math.abs(Math.sin(t * Math.PI * 3)) * 0.4 * (1 - t);
      }
      return true;
    }
    return false;
  }

  private build(): void {
    // board base — real walnut (grain map + normal) like the Табла frame, so
    // the board reads as a physical object instead of a flat brown slab
    const woodTex = woodTexture();
    woodTex.repeat.set(4, 4);
    const woodN = woodNormal();
    woodN.repeat.set(4, 4);
    const base = new Mesh(
      new BoxGeometry(N + 0.9, 0.5, N + 0.9),
      new MeshStandardMaterial({ map: woodTex, normalMap: woodN, normalScale: new Vector2(0.5, 0.5), roughness: 0.52, metalness: 0.08 }),
    );
    base.position.y = -0.05;
    base.receiveShadow = true;
    this.scene.add(base);

    // a slightly inset ivory cross "field" the track sits on, for contrast
    // against the houses. Matte: clearcoat on broad ivory faces caught the key
    // as a sheet highlight and pushed the whole cross over the bloom threshold.
    const fieldMat = new MeshPhysicalMaterial({ color: new Color("#e9dfc6"), roughness: 0.72, clearcoat: 0.06, clearcoatRoughness: 0.6 });
    const armWide = 3;
    const vBar = new Mesh(new BoxGeometry(armWide, 0.1, N - 0.4), fieldMat);
    vBar.position.set(gx(5), 0.16, 0);
    vBar.receiveShadow = true;
    const hBar = new Mesh(new BoxGeometry(N - 0.4, 0.1, armWide), fieldMat);
    hBar.position.set(0, 0.16, gz(5));
    hBar.receiveShadow = true;
    this.scene.add(vBar, hBar);

    const tileGeo = new BoxGeometry(0.9, 0.16, 0.9);
    const trackMat = new MeshPhysicalMaterial({ color: new Color("#efe6d2"), roughness: 0.62, clearcoat: 0.12, clearcoatRoughness: 0.5 });
    const homeMat = (s: number) =>
      new MeshPhysicalMaterial({ color: new Color(SEAT_COLORS[s]!), roughness: 0.52, clearcoat: 0.2, clearcoatRoughness: 0.45 });
    // start cells (where each seat enters) get a bright seat-colored tile
    const startCell = new Map<string, number>();
    for (const s of [0, 1, 2, 3]) {
      const abs = (s * 10) % 40;
      startCell.set(`${TRACK[abs]![0]},${TRACK[abs]![1]}`, s);
    }
    const houseMat = (s: number) => {
      const c = new Color(SEAT_COLORS[s]!);
      c.lerp(new Color("#ffffff"), 0.35); // pastel quadrant
      return new MeshPhysicalMaterial({ color: c, roughness: 0.58, clearcoat: 0.15, clearcoatRoughness: 0.5 });
    };

    const trackSet = new Set(TRACK.map(([c, r]) => `${c},${r}`));
    const homeMap = new Map<string, number>();
    for (const s of [0, 1, 2, 3]) for (const [c, r] of HOME[s]!) homeMap.set(`${c},${r}`, s);

    // corner houses (raised pastel plates with a colored rim + full-color slots)
    for (const s of [0, 1, 2, 3]) {
      const cells = BASE[s]!;
      const cx = cells.reduce((a, [c]) => a + c, 0) / 4;
      const cr = cells.reduce((a, [, r]) => a + r, 0) / 4;
      const rim = new Mesh(
        new BoxGeometry(3.7, 0.18, 3.7),
        new MeshPhysicalMaterial({ color: new Color(SEAT_COLORS[s]!), roughness: 0.5, clearcoat: 0.2, clearcoatRoughness: 0.45 }),
      );
      rim.position.set(gx(cx), 0.05, gz(cr));
      rim.receiveShadow = true;
      const plate = new Mesh(new BoxGeometry(3.2, 0.22, 3.2), houseMat(s));
      plate.position.set(gx(cx), 0.09, gz(cr));
      plate.receiveShadow = true;
      this.scene.add(rim, plate);
      // base slots — ringed wells in the full seat color
      for (const [c, r] of cells) {
        const slot = new Mesh(
          new CylinderGeometry(0.36, 0.36, 0.1, 24),
          new MeshPhysicalMaterial({ color: new Color(SEAT_COLORS[s]!), roughness: 0.45, clearcoat: 0.25, clearcoatRoughness: 0.4 }),
        );
        slot.position.set(gx(c), 0.21, gz(r));
        slot.receiveShadow = true;
        this.scene.add(slot);
      }
    }

    // track + home tiles
    for (let row = 0; row < N; row++) {
      for (let col = 0; col < N; col++) {
        const k = `${col},${row}`;
        let mat: MeshPhysicalMaterial | null = null;
        if (k === `${CENTER[0]},${CENTER[1]}`) continue;
        else if (homeMap.has(k)) mat = homeMat(homeMap.get(k)!);
        else if (startCell.has(k)) mat = homeMat(startCell.get(k)!);
        else if (trackSet.has(k)) mat = trackMat;
        if (!mat) continue;
        const tile = new Mesh(tileGeo, mat);
        tile.position.set(gx(col), 0.24, gz(row));
        tile.receiveShadow = true;
        this.scene.add(tile);
      }
    }

    // centre goal — a four-colour pyramid
    const goal = new Mesh(
      new CylinderGeometry(0, 0.95, 0.7, 4),
      new MeshPhysicalMaterial({ color: new Color("#e7c97a"), metalness: 0.5, roughness: 0.35, clearcoat: 0.6 }),
    );
    goal.rotation.y = Math.PI / 4;
    goal.position.set(gx(CENTER[0]), 0.55, gz(CENTER[1]));
    goal.castShadow = true;
    this.scene.add(goal);
  }

  private buildToken(seat: number, movable: boolean): Group {
    const mat = new MeshPhysicalMaterial({ color: new Color(SEAT_COLORS[seat]!), roughness: 0.28, metalness: 0.1, clearcoat: 0.9, clearcoatRoughness: 0.18 });
    const g = new Group();
    const body = new Mesh(this.pawnGeo, mat);
    body.position.y = 0.08; // group sits at tile centre plane; tile top = +0.08
    body.castShadow = true;
    // soft AO disc grounds the pawn on the tile (matches Табла checkers)
    const ground = contactShadow(0.36, 0.3);
    ground.position.y = 0.085;
    g.add(body, ground);
    if (movable) {
      // glow in the seat colour (white emissive washed the lacquer to chalk)
      mat.emissive = new Color(SEAT_COLORS[seat]!);
      mat.emissiveIntensity = 0.28;
      const ring = new Mesh(
        new TorusGeometry(0.42, 0.05, 12, 28),
        new MeshStandardMaterial({ color: new Color("#fff7d6"), emissive: new Color("#e8c531"), emissiveIntensity: 0.8 }),
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.1;
      g.add(ring);
    }
    return g;
  }

  setState(progress: number[][], seats: number, mySeat: number, movable: Set<number>, die: number | null): void {
    disposeObject(this.tokenLayer);
    this.tokenLayer.clear();
    const onCell = new Map<string, number>();
    for (let s = 0; s < seats; s++) {
      for (let tk = 0; tk < 4; tk++) {
        const [c, r] = tokenCoord(s, progress[s]![tk]!, tk);
        const k = `${c},${r}`;
        const stack = onCell.get(k) ?? 0;
        onCell.set(k, stack + 1);
        const canMove = s === mySeat && movable.has(tk);
        const g = this.buildToken(s, canMove);
        const off = stack; // fan multiple tokens on one cell
        g.position.set(gx(c) + (off % 2) * 0.26 - 0.13, 0.24, gz(r) + Math.floor(off / 2) * 0.26 - 0.13);
        g.userData.tk = { seat: s, token: tk } as LudoToken;
        this.tokenLayer.add(g);
      }
    }
    this.syncDie(die);
    this.core.invalidate();
  }

  private syncDie(value: number | null): void {
    if (value === null) {
      if (this.die) this.die.visible = false;
      this.prevDie = -1;
      return;
    }
    if (!this.die) {
      const faces = pipFaces();
      const mats = DICE_FACE_ORDER.map((f) => new MeshPhysicalMaterial({ map: faces[f], roughness: 0.32, clearcoat: 0.7 }));
      this.die = new Mesh(new BoxGeometry(1, 1, 1), mats);
      this.die.position.set(0, 0.6, H + 1);
      this.die.castShadow = true;
      this.scene.add(this.die);
    }
    this.die.visible = true;
    if (value !== this.prevDie) {
      this.prevDie = value;
      const to = faceUp(value);
      if (this.reduceMotion) this.die.rotation.copy(to);
      else this.diceAnim = { start: performance.now(), from: this.die.rotation.clone(), to };
    }
  }

  pick(clientX: number, clientY: number, rect: DOMRect): LudoToken | null {
    const ndc = new Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -(((clientY - rect.top) / rect.height) * 2 - 1));
    this.ray.setFromCamera(ndc, this.camera);
    const hit = this.ray.intersectObjects(this.tokenLayer.children, true)[0];
    if (!hit) return null;
    let o = hit.object;
    while (o && !o.userData.tk) o = o.parent as typeof o;
    return o ? (o.userData.tk as LudoToken) : null;
  }

  resize(width: number): void {
    this.core.setSize(width);
  }

  destroy(): void {
    this.core.dispose();
    disposeObject(this.scene);
    this.pawnGeo.dispose();
  }
}
