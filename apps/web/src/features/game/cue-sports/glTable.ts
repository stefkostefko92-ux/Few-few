/**
 * 3D cue-table renderer (three.js, on the shared RenderCore). Replaces the old
 * top-down PixiJS renderer with a real 3D scene — a slightly-tilted near-overhead
 * perspective camera, PBR cloth + wood, real phenolic spheres (per-ball equirect
 * textures with numbers/stripes), dropped-in pockets and soft shadows. IBL +
 * ACES tone mapping come from RenderCore.
 *
 * The public API is unchanged so the React layer (CueTableGL), the gameplay
 * logic (CueView) and the dev harness (glDemo) keep working as-is:
 *   create() · canvasHeight · resize() · toWorld() · render() · addSink() ·
 *   poseDrop() · destroy()
 * All coordinates the caller passes/receives are felt-space world units
 * (x ∈ [0, TABLE.w], y ∈ [0, TABLE.h]); internally these map to the XZ plane.
 */
import {
  AmbientLight,
  BoxGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  Plane,
  Raycaster,
  RingGeometry,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  Vector2,
  Vector3,
} from "three";
import { TABLE, type CueVariant } from "@aso/shared";
import { clothNormal, disposeObject, woodNormal, woodTexture } from "../gl/helpers.js";
import { RenderCore } from "../gl/render.js";

export interface SceneBall {
  id: number;
  x: number;
  y: number;
}
export interface CueScene {
  variant: CueVariant;
  cloth: { a: string; b: string };
  balls: SceneBall[];
  /** Aim ray from the cue ball, in world coords. */
  aim?: { x0: number; y0: number; x1: number; y1: number } | null;
  /** Translucent ball-in-hand preview. */
  ghost?: { x: number; y: number } | null;
}

const RAIL = 0.085; // rail thickness (world units) — also sets the canvas aspect
const R = TABLE.ballR;
const SCENE_RATIO = (TABLE.h + 2 * RAIL) / (TABLE.w + 2 * RAIL); // canvas h:w
const POCKETS: [number, number][] = [
  [0, 0],
  [TABLE.w / 2, 0],
  [TABLE.w, 0],
  [0, TABLE.h],
  [TABLE.w / 2, TABLE.h],
  [TABLE.w, TABLE.h],
];

const POOL_HUES = ["#e8b923", "#1f4fb0", "#c0241f", "#5a2a7a", "#e07a1f", "#1f8a3a", "#7a1f2a"];
const SNOOKER_HUES: Record<number, string> = {
  2: "#e8c531",
  3: "#1f8a3a",
  4: "#7a4a25",
  5: "#1f5fb0",
  6: "#e87fa0",
  7: "#15171a",
};

function ballColor(id: number, variant: CueVariant): string {
  if (id === 0) return "#f7f4ea";
  if (variant === "SNOOKER") {
    if (id >= 11 && id <= 25) return "#c0241f";
    return SNOOKER_HUES[id] ?? "#cccccc";
  }
  if (id === 8) return "#15171a";
  const hue = id <= 7 ? id : id - 8;
  return POOL_HUES[hue - 1] ?? "#cccccc";
}
const isStripe = (id: number, v: CueVariant): boolean => v !== "SNOOKER" && id >= 9 && id <= 15;

/* world (felt) coords → scene XZ (felt centred on the origin, +Y up) */
const wx = (x: number): number => x - TABLE.w / 2;
const wz = (y: number): number => y - TABLE.h / 2;

/** Equirectangular ball texture: base colour, optional stripe band, two number
 *  discs near the equator (front + back) so a number is always roughly visible. */
function ballTexture(id: number, variant: CueVariant): CanvasTexture {
  const W = 512;
  const H = 256;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  const stripe = isStripe(id, variant);
  const col = ballColor(id, variant);

  // base: stripe balls are white with a coloured equatorial band; others solid.
  ctx.fillStyle = stripe ? "#f4f1e8" : col;
  ctx.fillRect(0, 0, W, H);
  if (stripe) {
    ctx.fillStyle = col;
    ctx.fillRect(0, H * 0.3, W, H * 0.4); // band around the equator
  }
  // soft top sheen so the texture itself reads a touch dimensional under IBL
  const sheen = ctx.createLinearGradient(0, 0, 0, H);
  sheen.addColorStop(0, "rgba(255,255,255,0.18)");
  sheen.addColorStop(0.4, "rgba(255,255,255,0)");
  sheen.addColorStop(1, "rgba(0,0,0,0.12)");
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, W, H);

  // number discs (pool only) at U≈0.25 and U≈0.75, on the equator
  if (variant !== "SNOOKER" && id !== 0) {
    for (const u of [0.25, 0.75]) {
      const cxp = u * W;
      const cyp = H * 0.5;
      ctx.beginPath();
      ctx.arc(cxp, cyp, H * 0.2, 0, Math.PI * 2);
      ctx.fillStyle = "#fffdf6";
      ctx.fill();
      ctx.fillStyle = "#15171a";
      ctx.font = `700 ${H * 0.22}px Manrope, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(id), cxp, cyp + H * 0.01);
    }
  }
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** Cloth colour texture: radial gradient (cloth.a → cloth.b) + faint grain. */
function feltTexture(a: string, b: string): CanvasTexture {
  const W = 1024;
  const H = 512;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(W * 0.42, H * 0.36, H * 0.1, W * 0.5, H * 0.5, W * 0.62);
  g.addColorStop(0, a);
  g.addColorStop(1, b);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 0.05;
  for (let i = 0; i < 1600; i++) {
    ctx.fillStyle = i % 2 ? "#ffffff" : "#000000";
    ctx.fillRect(Math.random() * W, Math.random() * H, 1.4, 1.4);
  }
  ctx.globalAlpha = 1;
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

export class GLTable {
  private core!: RenderCore;
  private scene = new Scene();
  private camera: PerspectiveCamera;
  private ray = new Raycaster();
  private aimPlane = new Plane(new Vector3(0, 1, 0), -R); // y = ballR

  private staticLayer = new Group();
  private ballLayer = new Group();
  private fxLayer = new Group();
  private aimGroup = new Group();
  private ghostMesh: Mesh;
  private ballGeo = new SphereGeometry(R, 48, 32);
  private nodes = new Map<number, { mesh: Mesh; kind: string }>();
  private sinks: { mesh: Mesh; born: number; dur: number; from: Vector3 }[] = [];
  private clothKey = "";
  private fh: number;

  private constructor(cssWidth: number) {
    this.fh = cssWidth / (TABLE.w + 2 * RAIL);
    this.scene.background = new Color("#0a0d1f");

    this.camera = new PerspectiveCamera(34, (TABLE.w + 2 * RAIL) / (TABLE.h + 2 * RAIL), 0.05, 60);
    // Closer + lower than before (drama: balls occupy real pixels, the phenolic
    // clearcoat reads), gently tilted toward the near (−Z) long rail so the balls
    // gain height/parallax while the whole table stays readable for aiming.
    this.camera.position.set(0, 2.35, -1.5);
    this.camera.lookAt(0, 0, 0.04);

    // lighting: soft fill + an overhead "billiard lamp" key for crisp shadows
    this.scene.add(new AmbientLight(0xffffff, 0.32));
    this.scene.add(new HemisphereLight(0xeaf2ff, 0x10231a, 0.5));
    const key = new DirectionalLight(0xfff4e2, 2.1);
    key.position.set(0.4, 3.0, 0.2);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.bias = -0.0005;
    const sc = key.shadow.camera;
    sc.left = -1.4; sc.right = 1.4; sc.top = 1.0; sc.bottom = -1.0; sc.near = 0.5; sc.far = 8;
    this.scene.add(key);
    const rim = new DirectionalLight(0xbfe0ff, 0.5);
    rim.position.set(-1.2, 1.6, -1.4);
    this.scene.add(rim);

    this.ghostMesh = new Mesh(
      this.ballGeo,
      new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4 }),
    );
    this.ghostMesh.visible = false;

    this.scene.add(this.staticLayer, this.ballLayer, this.fxLayer, this.aimGroup, this.ghostMesh);
  }

  static async create(canvas: HTMLCanvasElement, cssWidth: number): Promise<GLTable> {
    const t = new GLTable(cssWidth);
    t.core = new RenderCore({
      canvas,
      scene: t.scene,
      camera: t.camera,
      width: cssWidth,
      ratio: SCENE_RATIO,
      exposure: 1.0,
      onFrame: (now) => t.frame(now),
    });
    await t.core.ready;
    return t;
  }

  get canvasHeight(): number {
    return (TABLE.h + 2 * RAIL) * this.fh;
  }

  resize(cssWidth: number): void {
    this.fh = cssWidth / (TABLE.w + 2 * RAIL);
    this.core.setSize(cssWidth); // aspect is fixed by SCENE_RATIO; no camera change
  }

  /** Canvas CSS pixels → world (felt) coords via a raycast onto the ball plane. */
  toWorld(clientX: number, clientY: number, rect: DOMRect): { x: number; y: number } {
    const ndc = new Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -(((clientY - rect.top) / rect.height) * 2 - 1),
    );
    this.ray.setFromCamera(ndc, this.camera);
    const hit = new Vector3();
    if (!this.ray.ray.intersectPlane(this.aimPlane, hit)) return { x: TABLE.w / 2, y: TABLE.h / 2 };
    return { x: hit.x + TABLE.w / 2, y: hit.z + TABLE.h / 2 };
  }

  /* ── static table geometry (rebuilt only when cloth/variant changes) ──────── */
  private buildStatic(scene: CueScene): void {
    const key = `${scene.cloth.a}|${scene.cloth.b}|${scene.variant}`;
    if (key === this.clothKey) return;
    this.clothKey = key;
    disposeObject(this.staticLayer);
    this.staticLayer.clear();

    const W = TABLE.w;
    const H = TABLE.h;

    // felt slab (top surface at y = 0)
    const feltTex = feltTexture(scene.cloth.a, scene.cloth.b);
    const clothN = clothNormal();
    // fine weave: 8×4 of the 128px sine reads as Lego studs at table scale
    clothN.repeat.set(20, 10);
    const felt = new Mesh(
      new BoxGeometry(W, 0.04, H),
      new MeshPhysicalMaterial({
        map: feltTex,
        normalMap: clothN,
        normalScale: new Vector2(0.25, 0.25),
        roughness: 0.95,
        sheen: 1,
        sheenColor: new Color(scene.cloth.a),
        sheenRoughness: 0.8,
      }),
    );
    felt.position.y = -0.02;
    felt.receiveShadow = true;
    this.staticLayer.add(felt);

    // wooden rail frame (a flat ring around the felt)
    const woodTex = woodTexture();
    woodTex.repeat.set(4, 1);
    const woodN = woodNormal();
    woodN.repeat.set(4, 1);
    const woodMat = new MeshStandardMaterial({
      map: woodTex,
      normalMap: woodN,
      normalScale: new Vector2(0.5, 0.5),
      roughness: 0.42,
      metalness: 0.08,
    });
    const railH = 0.07;
    const oW = W + 2 * RAIL;
    const oH = H + 2 * RAIL;
    // four rail bars
    const bar = (w: number, d: number, x: number, z: number) => {
      const m = new Mesh(new BoxGeometry(w, railH, d), woodMat);
      m.position.set(x, railH / 2 - 0.01, z);
      m.castShadow = true;
      m.receiveShadow = true;
      this.staticLayer.add(m);
    };
    bar(oW, RAIL, 0, -H / 2 - RAIL / 2); // top
    bar(oW, RAIL, 0, H / 2 + RAIL / 2); // bottom
    bar(RAIL, oH, -W / 2 - RAIL / 2, 0); // left
    bar(RAIL, oH, W / 2 + RAIL / 2, 0); // right

    // mother-of-pearl diamond sights inlaid in the rails (real-table detail)
    // matte bone inlays — glossy ivory catches the key light and reads as LEDs
    const sightMat = new MeshStandardMaterial({ color: new Color("#c9bc9a"), roughness: 0.7, metalness: 0 });
    const sightGeo = new CylinderGeometry(0, 0.013, 0.008, 4);
    const sight = (x: number, z: number) => {
      const m = new Mesh(sightGeo, sightMat);
      m.position.set(x, railH - 0.006, z);
      m.rotation.y = Math.PI / 4;
      this.staticLayer.add(m);
    };
    for (const f of [-0.375, -0.25, -0.125, 0.125, 0.25, 0.375]) {
      sight(W * f, -H / 2 - RAIL / 2);
      sight(W * f, H / 2 + RAIL / 2);
    }
    for (const f of [-0.25, 0, 0.25]) {
      sight(-W / 2 - RAIL / 2, H * f);
      sight(W / 2 + RAIL / 2, H * f);
    }

    // cushions (cloth-coloured bars, raised, inset to leave pocket gaps)
    const cushMat = new MeshPhysicalMaterial({
      color: new Color(scene.cloth.a),
      roughness: 0.95,
      sheen: 1,
      sheenColor: new Color(scene.cloth.a),
      sheenRoughness: 0.8,
    });
    // 0.09 (was R*1.7≈0.049): crest above the 0.06 rail top — at the old height
    // the cloth cushions sat entirely inside the wood and balls appeared to
    // rebound off bare rail.
    const cushH = 0.09;
    const cushT = RAIL * 0.55; // thickness
    const gap = TABLE.pocketR * 1.7; // clearance around each pocket
    const cushion = (w: number, d: number, x: number, z: number) => {
      const m = new Mesh(new BoxGeometry(w, cushH, d), cushMat);
      m.position.set(x, cushH / 2 - 0.005, z);
      m.castShadow = true;
      m.receiveShadow = true;
      this.staticLayer.add(m);
    };
    const segLen = W / 2 - 2 * gap;
    const segCenter = gap + segLen / 2;
    // top & bottom: two segments each (split at the middle pocket)
    for (const z of [-H / 2 - cushT / 2 + 0.001, H / 2 + cushT / 2 - 0.001]) {
      cushion(segLen, cushT, -segCenter, z);
      cushion(segLen, cushT, segCenter, z);
    }
    // left & right: single segment (corner gaps only)
    const sideLen = H - 2 * gap;
    for (const x of [-W / 2 - cushT / 2 + 0.001, W / 2 + cushT / 2 - 0.001]) {
      cushion(cushT, sideLen, x, 0);
    }

    // pockets: a dark well + brass rim at each of the six positions
    for (const [px, py] of POCKETS) {
      const g = new Group();
      g.position.set(wx(px), 0, wz(py));
      const well = new Mesh(
        new CylinderGeometry(TABLE.pocketR, TABLE.pocketR * 0.7, 0.16, 24),
        new MeshStandardMaterial({ color: 0x05070a, roughness: 0.9, metalness: 0.2 }),
      );
      well.position.y = -0.07;
      g.add(well);
      const ring = new Mesh(
        new RingGeometry(TABLE.pocketR * 0.96, TABLE.pocketR * 1.22, 28),
        new MeshStandardMaterial({ color: 0x141414, roughness: 0.6 }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.001;
      g.add(ring);
      const brass = new Mesh(
        new TorusGeometry(TABLE.pocketR * 1.12, TABLE.pocketR * 0.12, 10, 28),
        new MeshStandardMaterial({ color: 0x8a6a34, roughness: 0.35, metalness: 0.85 }),
      );
      brass.rotation.x = -Math.PI / 2;
      brass.position.y = 0.012;
      g.add(brass);
      this.staticLayer.add(g);
    }

    // snooker baulk line + D
    if (scene.variant === "SNOOKER") {
      const lineMat = new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22 });
      const bx = wx(0.42);
      const baulk = new Mesh(new BoxGeometry(0.004, 0.001, H), lineMat);
      baulk.position.set(bx, 0.005, 0);
      this.staticLayer.add(baulk);
      const d = new Mesh(new RingGeometry(0.176, 0.184, 32, 1, Math.PI / 2, Math.PI), lineMat);
      d.rotation.x = -Math.PI / 2;
      d.position.set(bx, 0.005, 0);
      this.staticLayer.add(d);
    }
  }

  /* ── balls ────────────────────────────────────────────────────────────────── */
  private ballKind(id: number, variant: CueVariant): string {
    if (id === 0) return "cue";
    if (variant === "SNOOKER") return `snk-${ballColor(id, variant)}`;
    if (id === 8) return "eight";
    return `${isStripe(id, variant) ? "stripe" : "solid"}-${id}`;
  }

  private buildBall(id: number, variant: CueVariant): Mesh {
    const mat = new MeshPhysicalMaterial({
      map: ballTexture(id, variant),
      roughness: 0.06,
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.04,
      envMapIntensity: 1.3,
    });
    const mesh = new Mesh(this.ballGeo, mat);
    mesh.castShadow = true;
    // a stable per-ball tilt so numbers don't all face the same way
    mesh.rotation.set(0.35, id * 1.7, id * 0.4);
    return mesh;
  }

  private renderBalls(scene: CueScene): void {
    const present = new Set<number>();
    for (const b of scene.balls) {
      present.add(b.id);
      const kind = this.ballKind(b.id, scene.variant);
      let entry = this.nodes.get(b.id);
      if (!entry || entry.kind !== kind) {
        if (entry) {
          this.ballLayer.remove(entry.mesh);
          (entry.mesh.material as MeshPhysicalMaterial).map?.dispose();
          (entry.mesh.material as MeshPhysicalMaterial).dispose();
        }
        const mesh = this.buildBall(b.id, scene.variant);
        this.ballLayer.add(mesh);
        entry = { mesh, kind };
        this.nodes.set(b.id, entry);
      }
      entry.mesh.visible = true;
      entry.mesh.position.set(wx(b.x), R, wz(b.y));
    }
    for (const [id, entry] of this.nodes) {
      if (!present.has(id)) entry.mesh.visible = false;
    }
  }

  render(scene: CueScene): void {
    this.buildStatic(scene);

    // aim ray — dashed segments laid on the ball plane
    disposeObject(this.aimGroup);
    this.aimGroup.clear();
    if (scene.aim) {
      const { x0, y0, x1, y1 } = scene.aim;
      const ax = wx(x0);
      const az = wz(y0);
      const dx = wx(x1) - ax;
      const dz = wz(y1) - az;
      const len = Math.hypot(dx, dz) || 1;
      const ux = dx / len;
      const uz = dz / len;
      const dash = 0.022;
      const dashGeo = new BoxGeometry(dash, 0.002, 0.006);
      const dashMat = new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 });
      const ang = Math.atan2(uz, ux);
      for (let d = R + dash; d < len; d += dash * 2) {
        const seg = new Mesh(dashGeo, dashMat);
        seg.position.set(ax + ux * d, R, az + uz * d);
        seg.rotation.y = -ang;
        this.aimGroup.add(seg);
      }
    }

    // ghost (ball-in-hand preview)
    if (scene.ghost) {
      this.ghostMesh.visible = true;
      this.ghostMesh.position.set(wx(scene.ghost.x), R, wz(scene.ghost.y));
    } else {
      this.ghostMesh.visible = false;
    }

    this.renderBalls(scene);
    this.core.render();
  }

  /* ── potted-ball drop animation (driven by RenderCore's loop) ─────────────── */
  private plainBall(color: string): Mesh {
    return new Mesh(
      this.ballGeo,
      new MeshPhysicalMaterial({
        color: new Color(color),
        roughness: 0.06,
        clearcoat: 1,
        clearcoatRoughness: 0.04,
        transparent: true,
      }),
    );
  }

  addSink(x: number, y: number, color: string): void {
    const mesh = this.plainBall(color);
    const from = new Vector3(wx(x), R, wz(y));
    mesh.position.copy(from);
    this.fxLayer.add(mesh);
    const reduce = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    this.sinks.push({ mesh, born: performance.now(), dur: reduce ? 1 : 340, from });
    this.core.invalidate();
  }

  /** Per-frame hook from RenderCore: advance any pocket-drop animations. Returns
   *  true while a ball is dropping so the loop renders at full rate (else idles). */
  private frame(now: number): boolean {
    if (this.sinks.length === 0) return false;
    this.sinks = this.sinks.filter((s) => {
      const t = (now - s.born) / s.dur;
      if (t >= 1) {
        this.fxLayer.remove(s.mesh);
        (s.mesh.material as MeshPhysicalMaterial).dispose();
        return false;
      }
      const e = 1 - t;
      s.mesh.scale.setScalar(0.1 + e * 0.9);
      s.mesh.position.set(s.from.x, R - (1 - e) * R * 3, s.from.z); // sink below felt
      (s.mesh.material as MeshPhysicalMaterial).opacity = e;
      return true;
    });
    return true;
  }

  /** Frozen pocket-drop pose (no animation) — used by the demo/screenshot harness. */
  poseDrop(items: { x: number; y: number; color: string; progress: number }[]): void {
    disposeObject(this.fxLayer);
    this.fxLayer.clear();
    for (const it of items) {
      const mesh = this.plainBall(it.color);
      const e = 1 - Math.max(0, Math.min(1, it.progress));
      mesh.position.set(wx(it.x), R - (1 - e) * R * 3, wz(it.y));
      mesh.scale.setScalar(0.1 + e * 0.9);
      (mesh.material as MeshPhysicalMaterial).opacity = e;
      this.fxLayer.add(mesh);
    }
    this.core.render();
  }

  destroy(): void {
    this.core.dispose();
    disposeObject(this.scene);
    this.ballGeo.dispose();
    this.nodes.clear();
  }
}
