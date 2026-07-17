/**
 * Табла (backgammon) 3D board (three.js) — premium nocturnal wood, fixed
 * near-top-down camera. Renders the 24 points, stacked checkers, the bar, the
 * bear-off trays and 3D dice; exposes raycast picking so the React view keeps
 * its existing click-to-move logic. Render-on-demand (rAF only while the dice
 * tumble) and honours prefers-reduced-motion.
 */
import {
  AmbientLight,
  BoxGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Euler,
  ExtrudeGeometry,
  Group,
  HemisphereLight,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  OrthographicCamera,
  Raycaster,
  Quaternion,
  Scene,
  Shape,
  Vector2,
  Vector3,
} from "three";
import {
  clothNormal,
  contactShadow,
  DICE_FACE_ORDER,
  disposeObject,
  easeInOut,
  faceUp,
  grooveNormal,
  pipFaces,
  woodNormal,
  woodTexture,
} from "../gl/helpers.js";
import { defaultGfxParams } from "../gl/gfxRegistry.js";
import { RenderCore } from "../gl/render.js";

export interface BgState {
  points: number[]; // 24 signed (+seat0/white, -seat1/black)
  bar: [number, number];
  off: [number, number];
  turn: number;
  dice: number[];
  remaining: number[];
}

export type PointId = number | "BAR" | "OFF";

const PW = 1.15; // point base width
const PLEN = 4.2; // point (triangle) length
const BARW = 1.4; // centre bar width
const HALF = 6 * PW; // half playfield width (6 points)
const RAIL = 0.9;
// 0.52 (was 0.62): the projected board is a wide landscape (~17 × ~7 world
// units); a taller canvas just banked empty felt above and below it.
const SCENE_RATIO = 0.52;
const WHITE = "#efe6d2";
const BLACK = "#23211e";
const DICE_MS = 760;
const GLIDE_MS = 300; // checker move animation

const colX = (col: number): number =>
  col < 6 ? -BARW / 2 - (6 - col - 0.5) * PW : BARW / 2 + (col - 6 + 0.5) * PW;

/** Engine point index → board column (0..11) + row. */
function place(i: number): { x: number; z: number; top: boolean } {
  const top = i >= 12;
  const col = top ? i - 12 : 11 - i;
  return { x: colX(col), z: top ? -1 : 1, top };
}

export class BackgammonScene {
  private core!: RenderCore;
  private scene = new Scene();
  private camera: OrthographicCamera;
  private ray = new Raycaster();
  private hitZones: Mesh[] = []; // invisible pick targets (userData.pid)
  private checkerLayer = new Group();
  private hiLayer = new Group();
  private dice: Mesh[] = [];
  private diceAnim: { start: number; from: [Euler, Euler]; to: [Euler, Euler] } | null = null;
  private prevDice = "";
  private lastFrame = 0;
  private reduceMotion = false;
  private depth: number;
  // previous position snapshot + in-flight checker glides (mover and any hit)
  private prevPts: number[] | null = null;
  private prevBar: [number, number] = [0, 0];
  private moveAnims: { mesh: Mesh; from: Vector3; to: Vector3; start: number }[] = [];

  constructor(canvas: HTMLCanvasElement, width: number) {
    this.reduceMotion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    this.scene.background = new Color("#0d1024");

    const W = 2 * HALF + BARW + 2 * RAIL;
    this.depth = 2 * PLEN + 2 * RAIL + 1.2;
    // Tight frustum (was ×0.54): the table fills the frame instead of floating
    // as a small strip — width fits with ~7% margin at this canvas aspect.
    const d = this.depth * 0.42;
    const aspect = 1 / SCENE_RATIO;
    this.camera = new OrthographicCamera(-d * aspect, d * aspect, d, -d, 0.1, 200);
    // ~39° elevation: stacks still read as physical objects, and the steeper
    // look projects the board taller so it fills the tighter frame.
    this.camera.position.set(0, W * 0.92, this.depth * 1.7);
    this.camera.lookAt(0, 0.1, 0);

    this.scene.add(new AmbientLight(0xffffff, 0.34));
    this.scene.add(new HemisphereLight(0xfff3d8, 0x20180f, 0.45));
    const key = new DirectionalLight(0xfff1d4, 1.9);
    key.position.set(W * 0.3, W * 1.6, this.depth);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.bias = -0.0006;
    key.shadow.radius = 3; // soft PCF penumbra — premium contact shadows
    const sc = key.shadow.camera;
    sc.left = -W; sc.right = W; sc.top = this.depth; sc.bottom = -this.depth; sc.near = 1; sc.far = W * 6;
    this.scene.add(key);
    // Cool back-rim edge light: traces the ebony checkers + brass fittings so
    // the stacks read as physical objects against the nocturnal felt.
    const rim = new DirectionalLight(0xbfe0f2, 0.34);
    rim.position.set(-W * 0.3, W * 0.9, -this.depth);
    this.scene.add(rim);

    this.scene.add(this.checkerLayer, this.hiLayer);
    this.build();
    const params = defaultGfxParams();
    // 1.35/0.06 (portal-wide tuning): the ivory checkers/points under the 1.9
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

  /** Per-frame hook from RenderCore: dice tumble + checker glides. */
  private frame(): boolean {
    const now = performance.now();
    const dt = this.lastFrame ? Math.min(now - this.lastFrame, 50) : 16;
    this.lastFrame = now;
    let active = false;

    if (this.diceAnim) {
      active = true;
      const t = (now - this.diceAnim.start) / DICE_MS;
      if (t >= 1) {
        this.dice.forEach((d, n) => this.diceAnim!.to[n] && d.rotation.copy(this.diceAnim!.to[n]!));
        this.diceAnim = null;
      } else {
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
          d.position.y = 0.74 + Math.abs(Math.sin(t * Math.PI * 3)) * 0.4 * (1 - t);
        });
      }
    }

    if (this.moveAnims.length > 0) {
      active = true;
      this.moveAnims = this.moveAnims.filter((a) => {
        const t = (now - a.start) / GLIDE_MS;
        if (t >= 1) {
          a.mesh.position.copy(a.to);
          return false;
        }
        a.mesh.position.lerpVectors(a.from, a.to, easeInOut(t));
        a.mesh.position.y += Math.sin(Math.PI * t) * 0.7; // arc over the board
        return true;
      });
    }
    return active;
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

    // felt bed with a visible weave (was a dead-flat green plane)
    const feltN = clothNormal();
    feltN.repeat.set(30, 18);
    const bed = new Mesh(
      new BoxGeometry(W, 0.12, D),
      new MeshStandardMaterial({
        color: new Color("#17452c"),
        roughness: 0.92,
        normalMap: feltN,
        normalScale: new Vector2(0.35, 0.35),
      }),
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

    // brass corner brackets + bar hinges — it's a physical Табла box, lean in
    const brass = new MeshPhysicalMaterial({
      color: new Color("#d9b25f"),
      metalness: 0.95,
      roughness: 0.28,
      clearcoat: 0.6,
      clearcoatRoughness: 0.2,
    });
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const corner = new Mesh(new BoxGeometry(0.55, 0.1, 0.55), brass);
        corner.position.set(sx * (W / 2 + RAIL - 0.32), 0.02, sz * (D / 2 + RAIL - 0.32));
        corner.castShadow = true;
        this.scene.add(corner);
      }
      const hinge = new Mesh(new BoxGeometry(BARW * 0.7, 0.06, 0.5), brass);
      hinge.position.set(0, 0.3, sx * (D / 2 - 0.35));
      hinge.castShadow = true;
      this.scene.add(hinge);
    }

    // 24 inlaid-veneer points (extruded, bevelled — not paper cutouts)
    const matOx = new MeshPhysicalMaterial({
      color: new Color("#7a2f1f"),
      roughness: 0.5,
      clearcoat: 0.35,
      clearcoatRoughness: 0.35,
    });
    const matCream = new MeshPhysicalMaterial({
      color: new Color("#e8dcc0"),
      roughness: 0.5,
      clearcoat: 0.35,
      clearcoatRoughness: 0.35,
    });
    for (let i = 0; i < 24; i++) {
      const p = place(i);
      const shape = new Shape();
      shape.moveTo(-PW / 2 + 0.05, 0);
      shape.lineTo(PW / 2 - 0.05, 0);
      shape.lineTo(0, PLEN * 0.92);
      shape.lineTo(-PW / 2 + 0.05, 0);
      const tri = new Mesh(
        new ExtrudeGeometry(shape, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.02, bevelSegments: 2 }),
        i % 2 === 0 ? matOx : matCream,
      );
      tri.rotation.x = -Math.PI / 2;
      // top row: base at far edge pointing inward (−z); bottom: near edge (+z)
      const baseZ = p.top ? -(D / 2 - 0.1) : D / 2 - 0.1;
      tri.position.set(p.x, 0.085, baseZ);
      tri.rotation.z = p.top ? Math.PI : 0;
      tri.castShadow = true;
      tri.receiveShadow = true;
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

    // bear-off trays on the right rail (white home bottom, black home top):
    // recessed dark wells that hold the borne-off checkers and act as the
    // "OFF" click target for bearing off.
    const wellMat = new MeshStandardMaterial({ color: new Color("#160d06"), roughness: 0.85 });
    for (const side of [0, 1] as const) {
      const { x, z } = this.trayCentre(side);
      const well = new Mesh(new BoxGeometry(RAIL * 0.92, 0.1, PLEN * 0.92), wellMat);
      well.position.set(x, 0.05, z);
      well.receiveShadow = true;
      this.scene.add(well);
      const rim = new Mesh(new BoxGeometry(RAIL * 0.98, 0.04, PLEN * 0.98), brass);
      rim.position.set(x, 0.015, z);
      this.scene.add(rim);

      const offHit = new Mesh(new BoxGeometry(RAIL * 1.5, 0.8, PLEN), new MeshStandardMaterial({ visible: false }));
      offHit.position.set(x, 0.3, z);
      offHit.userData.pid = "OFF";
      this.scene.add(offHit);
      this.hitZones.push(offHit);
    }
  }

  /** Centre of a seat's bear-off tray (0 = white, bottom-right; 1 = black, top-right). */
  private trayCentre(side: 0 | 1): { x: number; z: number } {
    const x = HALF + BARW / 2 + RAIL / 2;
    const z = (side === 0 ? 1 : -1) * (PLEN / 2 + 0.05);
    return { x, z };
  }

  /** World position of the k-th checker (0-based) of `count` on point i. */
  private checkerPos(i: number, k: number, count: number): [number, number, number] {
    const p = place(i);
    const D = 2 * PLEN;
    const r = PW * 0.42;
    const startZ = p.top ? -(D / 2 - 0.1 - r) : D / 2 - 0.1 - r;
    // A full 5-row at 1.9r reaches past the mid-line and interpenetrates the
    // FACING point's row (white/black caps z-fight into a pinwheel). Fan the
    // row tighter when it's full so both sides stay on their own half.
    const step = (p.top ? 1 : -1) * r * (count >= 5 ? 1.5 : 1.9);
    const stack = Math.min(k, 4);
    const lift = k >= 5 ? 0.23 * (k - 4) : 0; // pile up beyond 5 (0.23 > checker height, no interpenetration z-fight)
    // 0.27 = extruded point top (~0.155) + half checker height (0.11)
    return [p.x, 0.27 + lift, startZ + stack * step];
  }

  setState(state: BgState, mySeat: number, highlight?: { from: Set<PointId>; targets: Set<number | "OFF"> }): void {
    // rebuild checkers each state (≤30 cylinders — cheap, and disposed cleanly)
    disposeObject(this.checkerLayer);
    this.checkerLayer.clear();
    const geo = new CylinderGeometry(PW * 0.42, PW * 0.42, 0.22, 30);
    // Turned-groove faces (concentric rings) so checkers read as lathed wood,
    // not flat pucks; ivory + ebony in the brass identity (no more orange).
    const grooves = grooveNormal();
    const matW = new MeshPhysicalMaterial({
      color: new Color(WHITE),
      roughness: 0.32,
      metalness: 0.05,
      clearcoat: 0.8,
      clearcoatRoughness: 0.2,
      normalMap: grooves,
      normalScale: new Vector2(0.5, 0.5),
    });
    const matB = new MeshPhysicalMaterial({
      color: new Color(BLACK),
      roughness: 0.2,
      metalness: 0.2,
      clearcoat: 1,
      clearcoatRoughness: 0.12,
      normalMap: grooves,
      normalScale: new Vector2(0.5, 0.5),
    });

    const tops = new Map<number, Mesh>(); // topmost checker per point (glide targets)
    const barTops: (Mesh | null)[] = [null, null];
    for (let i = 0; i < 24; i++) {
      const v = state.points[i] ?? 0;
      if (v === 0) continue;
      const count = Math.abs(v);
      const mat = v > 0 ? matW : matB;
      for (let k = 0; k < count; k++) {
        const c = new Mesh(geo, mat);
        const [x, y, z] = this.checkerPos(i, k, count);
        c.position.set(x, y, z);
        c.castShadow = true;
        // receiveShadow OFF: the normal-mapped triangle-fan cap self-shadows
        // into a star-shaped acne under the steep key; contact discs ground it.
        // ground it on the point surface (soft AO disc); 0.157 sits between the
        // point top (~0.155) and the checker base (0.16) — no co-planar z-fight
        const ground = contactShadow(PW * 0.52, 0.28);
        ground.position.y = 0.157 - y;
        c.add(ground);
        this.checkerLayer.add(c);
        if (k === count - 1) tops.set(i, c);
      }
    }
    // bar checkers (centre, resting on the bar top)
    const bars: [number, MeshStandardMaterial][] = [[state.bar[0], matW], [state.bar[1], matB]];
    bars.forEach(([n, mat], side) => {
      for (let k = 0; k < n; k++) {
        const c = new Mesh(geo, mat);
        c.position.set(0, 0.4, (side === 0 ? -1 : 1) * (1 + k * 0.42));
        c.castShadow = true;
        this.checkerLayer.add(c);
        if (k === n - 1) barTops[side] = c;
      }
    });
    // borne-off checkers: flat stacks of five in each side's bear-off tray
    const offs: [number, MeshStandardMaterial][] = [[state.off[0], matW], [state.off[1], matB]];
    offs.forEach(([n, mat], side) => {
      const { x, z } = this.trayCentre(side as 0 | 1);
      const zDir = side === 0 ? 1 : -1;
      const zStart = z + zDir * (PLEN * 0.46 - PW * 0.45);
      for (let k = 0; k < n; k++) {
        const stack = Math.floor(k / 5);
        const level = k % 5;
        const c = new Mesh(geo, mat);
        c.position.set(x, 0.21 + level * 0.225, zStart - zDir * stack * (PW * 0.9 + 0.1));
        c.castShadow = true;
        this.checkerLayer.add(c);
      }
    });

    // Glide the moved checker (and a hit blot heading to the bar) from where it
    // stood to where it landed — the layer rebuild alone teleports everything.
    this.moveAnims = [];
    if (this.prevPts && !this.reduceMotion) {
      const cnt = (v: number, side: number) => (side === 0 ? Math.max(v, 0) : Math.max(-v, 0));
      for (const side of [0, 1] as const) {
        const srcs: number[] = [];
        const dsts: number[] = [];
        for (let i = 0; i < 24; i++) {
          const before = cnt(this.prevPts[i] ?? 0, side);
          const after = cnt(state.points[i] ?? 0, side);
          if (after > before) dsts.push(i);
          if (after < before) srcs.push(i);
        }
        const barDelta = state.bar[side] - this.prevBar[side];
        // ordinary move / bar re-entry → glide the top checker at the target
        if (dsts.length === 1) {
          const mesh = tops.get(dsts[0]!);
          let from: Vector3 | null = null;
          if (srcs.length === 1) {
            const n = cnt(this.prevPts[srcs[0]!] ?? 0, side);
            from = new Vector3(...this.checkerPos(srcs[0]!, n - 1, n));
          } else if (barDelta < 0) {
            from = new Vector3(0, 0.4, (side === 0 ? -1 : 1) * (1 + (this.prevBar[side] - 1) * 0.42));
          }
          if (mesh && from) {
            this.moveAnims.push({ mesh, from, to: mesh.position.clone(), start: performance.now() });
            mesh.position.copy(from);
          }
        }
        // hit blot → glide it from its point onto the bar
        if (barDelta > 0 && srcs.length === 1 && dsts.length === 0) {
          const mesh = barTops[side];
          const n = cnt(this.prevPts[srcs[0]!] ?? 0, side);
          if (mesh) {
            const from = new Vector3(...this.checkerPos(srcs[0]!, n - 1, n));
            this.moveAnims.push({ mesh, from, to: mesh.position.clone(), start: performance.now() });
            mesh.position.copy(from);
          }
        }
      }
    }
    this.prevPts = state.points.slice();
    this.prevBar = [state.bar[0], state.bar[1]];

    // highlights (movable origins + targets; "OFF" glows the mover's tray)
    disposeObject(this.hiLayer);
    this.hiLayer.clear();
    if (highlight) {
      for (const pid of highlight.from) if (typeof pid === "number") this.addHighlight(pid, "#e8c531");
      for (const tg of highlight.targets) {
        if (tg === "OFF") this.addTrayHighlight(mySeat === 1 ? 1 : 0);
        else this.addHighlight(tg, "#3ad07a");
      }
    }

    this.syncDice(state.remaining.length ? state.remaining : state.dice);
    this.core.invalidate();
  }

  /** Glow the bear-off tray when bearing off is a legal landing. */
  private addTrayHighlight(side: 0 | 1): void {
    const { x, z } = this.trayCentre(side);
    const glow = new Mesh(
      new BoxGeometry(RAIL * 0.86, 0.05, PLEN * 0.86),
      new MeshStandardMaterial({ color: new Color("#3ad07a"), emissive: new Color("#3ad07a"), emissiveIntensity: 0.5, transparent: true, opacity: 0.35 }),
    );
    glow.position.set(x, 0.14, z);
    this.hiLayer.add(glow);
  }

  private addHighlight(i: number, color: string): void {
    if (i < 0 || i > 23) return; // guard: only real points glow (OFF handled above)
    const p = place(i);
    const D = 2 * PLEN;
    const ring = new Mesh(
      new BoxGeometry(PW * 0.94, 0.05, PLEN * 0.9),
      new MeshStandardMaterial({ color: new Color(color), emissive: new Color(color), emissiveIntensity: 0.5, transparent: true, opacity: 0.35 }),
    );
    const baseZ = p.top ? -(D / 2 - 0.1) : D / 2 - 0.1;
    // 0.17: above the extruded point tops so the glow stays visible.
    ring.position.set(p.x, 0.17, baseZ + (p.top ? PLEN / 2 : -PLEN / 2) * 0.9);
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
      // seated ON the centre bar (top 0.29 + half die 0.45), in a column along
      // it — side by side they straddled the bar edge and sank into the wood
      d.position.set(0, 0.74, (n - (values.length - 1) / 2) * 1.3);
    });
    const key = values.join(",");
    if (key !== this.prevDice) {
      this.prevDice = key;
      // yaw each settled cube differently (~26°/-18°): straight-on cubes at
      // this elevation collapse into two-face "domino" strips, and two thrown
      // dice never land aligned anyway
      const yawed = (v: number, yaw: number): Euler => {
        const q = new Quaternion()
          .setFromEuler(faceUp(v))
          .premultiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw));
        return new Euler().setFromQuaternion(q);
      };
      const to = values.map((v, n) => yawed(v, n === 0 ? 0.45 : -0.32)) as [Euler, Euler];
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
    this.core.setSize(width);
  }

  destroy(): void {
    this.core.dispose();
    disposeObject(this.scene);
  }
}
