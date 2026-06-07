/**
 * МАГНАТ 3D board (three.js) — "Stylized Bulgaria", fixed isometric camera.
 *
 * Builds the 40-tile ring with group-coloured property bands and readable
 * Cyrillic city labels, player tokens that glide tile-to-tile, houses/hotels on
 * developed properties, a central plaque in the Bulgarian tricolour, and 3D
 * dice. Soft shadows + ACES tone mapping + a room environment give it depth.
 * The React view (MagnatView) owns the DOM HUD; this owns the pixels. Renders
 * on demand (rAF only while tokens move) so a static board costs no idle GPU.
 */
import {
  ACESFilmicToneMapping,
  AmbientLight,
  BoxGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  LatheGeometry,
  LinearFilter,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  OrthographicCamera,
  PCFSoftShadowMap,
  PlaneGeometry,
  PMREMGenerator,
  RepeatWrapping,
  Scene,
  SRGBColorSpace,
  type Texture,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { SSAOPass } from "three/examples/jsm/postprocessing/SSAOPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { SMAAPass } from "three/examples/jsm/postprocessing/SMAAPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { BOARD, GROUP_COLORS, BOARD_SIZE, type MagnatState } from "@aso/shared";

/** Recursively free a subtree's GPU resources (geometries, materials, textures). */
function disposeObject(root: Object3D): void {
  root.traverse((o) => {
    const mesh = o as { geometry?: { dispose?: () => void }; material?: unknown };
    mesh.geometry?.dispose?.();
    const mat = mesh.material;
    const mats = Array.isArray(mat) ? mat : mat ? [mat] : [];
    for (const m of mats as MeshStandardMaterial[]) {
      for (const v of Object.values(m)) {
        if (v && (v as Texture).isTexture) (v as Texture).dispose();
      }
      m.dispose();
    }
  });
}

const PLAYER_COLORS = ["#e23b3b", "#2f7fe2", "#2faa55", "#e8b923", "#9b4fd0", "#e07a1f"];
const T = 2; // tile pitch
const H = 5 * T; // board half-size
const RING_DEPTH = T * 1.7;
const SCENE_RATIO = 0.66;

interface TilePlacement {
  x: number;
  z: number;
  side: 0 | 1 | 2 | 3; // 0 bottom (+z), 1 left (-x), 2 top (-z), 3 right (+x)
  corner: boolean;
}

function placements(): TilePlacement[] {
  const p: TilePlacement[] = [];
  for (let i = 0; i < BOARD_SIZE; i++) {
    if (i <= 10) p.push({ x: H - i * T, z: H, side: 0, corner: i === 0 || i === 10 });
    else if (i <= 20) p.push({ x: -H, z: H - (i - 10) * T, side: 1, corner: i === 20 });
    else if (i <= 30) p.push({ x: -H + (i - 20) * T, z: -H, side: 2, corner: i === 30 });
    else p.push({ x: H, z: -H + (i - 30) * T, side: 3, corner: false });
  }
  return p;
}

function specialColor(type: string): string {
  switch (type) {
    case "go": return "#2faa55";
    case "jail": return "#4a4a4a";
    case "free": return "#3a7bd5";
    case "gotojail": return "#cc2b2b";
    case "station": return "#2a2a2a";
    case "utility": return "#3a8f8f";
    case "tax": return "#8a6a35";
    case "chance": return "#e8862b";
    case "chest": return "#c9a23a";
    default: return "#caa";
  }
}

/**
 * Choose a line-split (1–3 lines) and font size that fills the box while
 * guaranteeing the text fits both width and height — so no name ever overflows.
 */
function fitText(
  ctx: CanvasRenderingContext2D,
  name: string,
  maxW: number,
  maxH: number,
  maxFont: number,
): { lines: string[]; font: number } {
  const base = 100;
  const fontStr = (f: number) => `800 ${f}px Manrope, system-ui, sans-serif`;
  const words = name.split(" ");
  const candidates: string[][] = [[name]];
  // every 2-line split at a space
  for (let k = 1; k < words.length; k++) {
    candidates.push([words.slice(0, k).join(" "), words.slice(k).join(" ")]);
  }
  // a balanced 3-line split for very long multi-word names
  if (words.length >= 3) {
    const a = Math.ceil(words.length / 3);
    candidates.push([
      words.slice(0, a).join(" "),
      words.slice(a, 2 * a).join(" "),
      words.slice(2 * a).join(" "),
    ]);
  }
  let best = { lines: [name], font: 8 };
  for (const lines of candidates) {
    ctx.font = fontStr(base);
    const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
    const byW = (maxW / widest) * base;
    const byH = maxH / (lines.length * 1.18);
    const f = Math.min(maxFont, byW, byH);
    if (f > best.font) best = { lines, font: f };
  }
  return best;
}

/** High-res tile label (name + price) oriented to read from outside the board. */
function labelTexture(idx: number, side: number): CanvasTexture {
  const tl = BOARD[idx]!;
  const W = 360;
  const Hc = 480; // taller axis = radial (inner→outer)
  const c = document.createElement("canvas");
  c.width = W;
  c.height = Hc;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#f4ecd6";
  ctx.fillRect(0, 0, W, Hc);

  // outward-reading: rotate the whole drawing so "up" points to board centre
  ctx.save();
  ctx.translate(W / 2, Hc / 2);
  ctx.rotate((side * Math.PI) / 2);
  ctx.translate(-W / 2, -Hc / 2);

  const banded = tl.type === "prop";
  if (banded) {
    ctx.fillStyle = GROUP_COLORS[tl.group] ?? "#999";
    ctx.fillRect(0, 0, W, Hc * 0.2);
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.fillRect(0, Hc * 0.2 - 5, W, 5);
  }
  ctx.fillStyle = "#120c06";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const top = banded ? Hc * 0.2 : 0;
  const bottom = tl.price > 0 ? Hc * 0.78 : Hc;
  const { lines, font } = fitText(ctx, tl.name, W * 0.9, (bottom - top) * 0.92, 96);
  ctx.font = `800 ${font}px Manrope, system-ui, sans-serif`;
  const lh = font * 1.18;
  const cy = (top + bottom) / 2;
  lines.forEach((l, i) => ctx.fillText(l, W / 2, cy - ((lines.length - 1) * lh) / 2 + i * lh));
  if (tl.price > 0) {
    ctx.font = "800 54px Manrope, system-ui, sans-serif";
    ctx.fillStyle = "#6a4421";
    ctx.fillText(`${tl.price}`, W / 2, Hc * 0.88);
  }
  ctx.restore();

  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.minFilter = LinearFilter;
  return tex;
}

function plaqueTexture(): CanvasTexture {
  const W = 768;
  const c = document.createElement("canvas");
  c.width = c.height = W;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#f4efe2"; ctx.fillRect(0, 0, W, W / 3);
  ctx.fillStyle = "#2faa55"; ctx.fillRect(0, W / 3, W, W / 3);
  ctx.fillStyle = "#cc2b2b"; ctx.fillRect(0, (2 * W) / 3, W, W / 3);
  ctx.save();
  ctx.translate(W / 2, W / 2);
  ctx.rotate(-Math.PI / 4);
  ctx.fillStyle = "rgba(15,12,9,0.92)";
  ctx.fillRect(-W * 0.46, -84, W * 0.92, 168);
  ctx.fillStyle = "#e9cd82";
  ctx.font = "900 132px Playfair Display, Georgia, serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("МАГНАТ", 0, 8);
  ctx.restore();
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

/** Procedural walnut wood for the outer rail frame. */
function woodTexture(): CanvasTexture {
  const W = 512;
  const c = document.createElement("canvas");
  c.width = c.height = W;
  const ctx = c.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 0, W);
  g.addColorStop(0, "#5b3b1f");
  g.addColorStop(0.5, "#462914");
  g.addColorStop(1, "#3a2312");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, W);
  for (let i = 0; i < 70; i++) {
    const y = Math.random() * W;
    ctx.strokeStyle = `rgba(${(20 + Math.random() * 40) | 0},${(12 + Math.random() * 20) | 0},8,0.22)`;
    ctx.lineWidth = 1 + Math.random() * 2.5;
    ctx.beginPath();
    for (let x = 0; x <= W; x += 14) ctx.lineTo(x, y + Math.sin(x * 0.03 + i) * 5);
    ctx.stroke();
  }
  for (let i = 0; i < 24; i++) {
    ctx.fillStyle = "rgba(255,212,150,0.05)";
    ctx.fillRect(0, Math.random() * W, W, 1.5);
  }
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.wrapS = tex.wrapT = RepeatWrapping;
  return tex;
}

function pipFaces(): CanvasTexture[] {
  const PIP: Record<number, [number, number][]> = {
    1: [[.5, .5]],
    2: [[.27, .27], [.73, .73]],
    3: [[.27, .27], [.5, .5], [.73, .73]],
    4: [[.27, .27], [.73, .27], [.27, .73], [.73, .73]],
    5: [[.27, .27], [.73, .27], [.5, .5], [.27, .73], [.73, .73]],
    6: [[.27, .25], [.73, .25], [.27, .5], [.73, .5], [.27, .75], [.73, .75]],
  };
  return [1, 2, 3, 4, 5, 6].map((v) => {
    const S = 128;
    const c = document.createElement("canvas");
    c.width = c.height = S;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#f7f4ea"; ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = "#15171a";
    for (const [px, py] of PIP[v]!) {
      ctx.beginPath();
      ctx.arc(px * S, py * S, S * 0.1, 0, Math.PI * 2);
      ctx.fill();
    }
    const tex = new CanvasTexture(c);
    tex.colorSpace = SRGBColorSpace;
    return tex;
  });
}

/** Turned-pawn profile for player tokens. */
function pawnGeometry(): LatheGeometry {
  const pts = [
    [0.0, 0.0], [0.52, 0.0], [0.52, 0.1], [0.34, 0.16], [0.26, 0.18],
    [0.24, 0.5], [0.34, 0.62], [0.2, 0.74], [0.32, 0.84], [0.3, 0.96],
    [0.0, 1.06],
  ].map(([r, y]) => new Vector2(r, y));
  return new LatheGeometry(pts, 28);
}

export class MagnatScene {
  private renderer: WebGLRenderer;
  private composer!: EffectComposer;
  private passes: { dispose?: () => void }[] = [];
  private scene = new Scene();
  private camera: OrthographicCamera;
  private place = placements();
  private pawnGeo = pawnGeometry();
  private maxAniso = 1;
  private tokens: Group[] = [];
  private tokenTarget: Vector3[] = [];
  private houseGroups: (Group | null)[] = new Array(BOARD_SIZE).fill(null);
  private houseCount: number[] = new Array(BOARD_SIZE).fill(-1);
  private ownerStuds: (Mesh | null)[] = new Array(BOARD_SIZE).fill(null);
  private dice: Mesh[] = [];
  private baseMat?: MeshStandardMaterial;
  private raf = 0;
  private animating = false;

  constructor(canvas: HTMLCanvasElement, width: number) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(2, globalThis.devicePixelRatio || 1));
    this.renderer.setSize(width, width * SCENE_RATIO, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.maxAniso = this.renderer.capabilities.getMaxAnisotropy();

    // opaque felt background (post-processing doesn't carry CSS transparency)
    this.scene.background = new Color("#0e2c1c");

    // soft image-based reflections for tokens / dice (dispose the generator and
    // the throwaway room scene once the env map is baked)
    const pmrem = new PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    this.scene.environment = pmrem.fromScene(room, 0.04).texture;
    pmrem.dispose();
    disposeObject(room);

    const aspect = 1 / SCENE_RATIO;
    const d = H * 1.12;
    this.camera = new OrthographicCamera(-d * aspect, d * aspect, d, -d, 0.1, 200);
    this.camera.position.set(H * 1.35, H * 2.9, H * 1.6);
    this.camera.lookAt(0, 0, 0);

    this.scene.add(new AmbientLight(0xffffff, 0.32));
    this.scene.add(new HemisphereLight(0xfff3d8, 0x20180f, 0.45));
    const key = new DirectionalLight(0xfff1d4, 2.0);
    key.position.set(H * 0.7, H * 3, H * 1.4);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.bias = -0.0006;
    const sc = key.shadow.camera;
    sc.left = -H * 1.5; sc.right = H * 1.5; sc.top = H * 1.5; sc.bottom = -H * 1.5;
    sc.near = 1; sc.far = H * 6;
    this.scene.add(key);

    this.build();

    // post-processing: ambient occlusion + bloom + anti-aliasing
    const w = width;
    const h = width * SCENE_RATIO;
    this.composer = new EffectComposer(this.renderer);
    const render = new RenderPass(this.scene, this.camera);
    const ssao = new SSAOPass(this.scene, this.camera, w, h);
    ssao.kernelRadius = 0.6;
    ssao.minDistance = 0.002;
    ssao.maxDistance = 0.08;
    const bloom = new UnrealBloomPass(new Vector2(w, h), 0.06, 0.4, 1.35);
    const output = new OutputPass();
    const smaa = new SMAAPass(w, h);
    for (const p of [render, ssao, bloom, output, smaa]) this.composer.addPass(p);
    this.passes = [render, ssao, bloom, output, smaa];

    this.renderOnce();
  }

  private aniso(tex: CanvasTexture): CanvasTexture {
    tex.anisotropy = this.maxAniso;
    return tex;
  }

  private build(): void {
    const outer = H + RING_DEPTH / 2;
    const railW = 1.7;
    const railH = 1.15;

    // base (felt) — sits under the whole board incl. rail
    this.baseMat = new MeshStandardMaterial({ color: new Color("#1a5a36"), roughness: 0.96, metalness: 0 });
    const base = new Mesh(new BoxGeometry(2 * (outer + railW) + 0.6, 1, 2 * (outer + railW) + 0.6), this.baseMat);
    base.position.y = -0.5;
    base.receiveShadow = true;
    this.scene.add(base);

    // walnut rail frame around the ring
    const woodTex = this.aniso(woodTexture());
    woodTex.repeat.set(7, 1);
    const woodMat = new MeshStandardMaterial({ map: woodTex, roughness: 0.5, metalness: 0.08 });
    const e = outer + railW / 2;
    const len = 2 * e + railW;
    const beams: [number, number, number, number][] = [
      [0, e, len, railW],
      [0, -e, len, railW],
      [e, 0, railW, 2 * e],
      [-e, 0, railW, 2 * e],
    ];
    for (const [bx, bz, bw, bd] of beams) {
      const beam = new Mesh(new BoxGeometry(bw, railH, bd), woodMat);
      beam.position.set(bx, railH / 2 - 0.05, bz);
      beam.castShadow = true;
      beam.receiveShadow = true;
      this.scene.add(beam);
    }

    // centre plaque
    const plaque = new Mesh(
      new PlaneGeometry((2 * H - RING_DEPTH) * 0.64, (2 * H - RING_DEPTH) * 0.64),
      new MeshStandardMaterial({ map: this.aniso(plaqueTexture()), roughness: 0.7 }),
    );
    plaque.rotation.x = -Math.PI / 2;
    plaque.position.y = 0.06;
    plaque.receiveShadow = true;
    this.scene.add(plaque);

    const tileMat = new MeshStandardMaterial({ color: new Color("#efe6d2"), roughness: 0.78, metalness: 0.02 });

    this.place.forEach((p, i) => {
      const tl = BOARD[i]!;
      const sz = p.corner ? RING_DEPTH : T;
      const along = p.side % 2 === 0 ? sz : RING_DEPTH;
      const deep = p.side % 2 === 0 ? RING_DEPTH : sz;

      const tile = new Mesh(new BoxGeometry(along * 0.97, 0.5, deep * 0.97), tileMat);
      tile.position.set(p.x, 0.25, p.z);
      tile.castShadow = true;
      tile.receiveShadow = true;
      this.scene.add(tile);

      // label on top
      const label = new Mesh(
        new PlaneGeometry(along * 0.94, deep * 0.94),
        new MeshStandardMaterial({ map: this.aniso(labelTexture(i, p.side)), roughness: 0.85, transparent: true }),
      );
      label.rotation.x = -Math.PI / 2;
      label.position.set(p.x, 0.505, p.z);
      this.scene.add(label);

      // special-tile colour cap
      if (tl.type !== "prop") {
        const cap = new Mesh(
          new BoxGeometry(along * 0.4, 0.14, deep * 0.4),
          new MeshStandardMaterial({ color: new Color(specialColor(tl.type)), roughness: 0.5 }),
        );
        cap.position.set(p.x, 0.57, p.z);
        cap.castShadow = true;
        this.scene.add(cap);
      }
    });
  }

  private tokenPos(idx: number, seat: number, seats: number): Vector3 {
    const p = this.place[idx]!;
    const ang = (seat / Math.max(seats, 1)) * Math.PI * 2;
    const r = T * 0.3;
    return new Vector3(p.x + Math.cos(ang) * r, 0.5, p.z + Math.sin(ang) * r);
  }

  setState(state: MagnatState): void {
    const seats = state.seats;
    while (this.tokens.length < seats) {
      const seat = this.tokens.length;
      const color = new Color(PLAYER_COLORS[seat % PLAYER_COLORS.length]);
      const pawn = new Mesh(
        this.pawnGeo,
        new MeshStandardMaterial({ color, roughness: 0.22, metalness: 0.9 }),
      );
      pawn.castShadow = true;
      pawn.scale.setScalar(0.9);
      const g = new Group();
      g.add(pawn);
      this.scene.add(g);
      this.tokens.push(g);
      this.tokenTarget.push(new Vector3());
    }

    this.tokens.forEach((g, seat) => {
      g.visible = seat < seats;
      if (seat >= seats) return;
      const target = this.tokenPos(state.pos[seat]!, seat, seats);
      this.tokenTarget[seat] = target;
      g.scale.setScalar(state.bankrupt[seat] ? 0.45 : 1);
      const mat = (g.children[0] as Mesh).material as MeshStandardMaterial;
      const active = seat === state.turn && !state.done;
      mat.emissive = new Color(active ? PLAYER_COLORS[seat % PLAYER_COLORS.length] : "#000000");
      mat.emissiveIntensity = active ? 0.35 : 0;
      if (g.position.lengthSq() === 0) g.position.copy(target);
    });

    for (let i = 0; i < BOARD_SIZE; i++) {
      const owner = state.owner[i]!;
      const p = this.place[i]!;
      if (owner >= 0 && !this.ownerStuds[i]) {
        const stud = new Mesh(
          new BoxGeometry(0.5, 0.22, 0.5),
          new MeshStandardMaterial({ color: new Color(PLAYER_COLORS[owner % PLAYER_COLORS.length]), roughness: 0.4, metalness: 0.3 }),
        );
        stud.castShadow = true;
        this.scene.add(stud);
        this.ownerStuds[i] = stud;
      }
      const stud = this.ownerStuds[i];
      if (stud) {
        stud.visible = owner >= 0;
        if (owner >= 0) {
          (stud.material as MeshStandardMaterial).color = new Color(
            state.mortgaged[i] ? "#666" : PLAYER_COLORS[owner % PLAYER_COLORS.length],
          );
          // park the ownership stud at the inner corner of the tile
          const inX = p.side === 3 ? -1 : p.side === 1 ? 1 : 0;
          const inZ = p.side === 0 ? -1 : p.side === 2 ? 1 : 0;
          stud.position.set(p.x + inX * T * 0.32, 0.62, p.z + inZ * T * 0.32);
        }
      }
      this.syncHouses(i, state.houses[i]!);
    }

    this.syncDice(state.dice);
    this.startAnim();
  }

  private syncHouses(i: number, count: number): void {
    if (this.houseCount[i] === count) return; // only rebuild when it changed
    this.houseCount[i] = count;
    if (this.houseGroups[i]) {
      disposeObject(this.houseGroups[i]!); // free the old buildings' GPU resources
      this.scene.remove(this.houseGroups[i]!);
      this.houseGroups[i] = null;
    }
    if (count <= 0) return;
    const p = this.place[i]!;
    const g = new Group();
    const hotel = count >= 5;
    const n = hotel ? 1 : count;
    const mat = new MeshStandardMaterial({ color: new Color(hotel ? "#d23a3a" : "#e9e3d2"), roughness: 0.55, metalness: 0.05 });
    const roofMat = new MeshStandardMaterial({ color: new Color(hotel ? "#7a1313" : "#b6452a"), roughness: 0.6 });
    for (let k = 0; k < n; k++) {
      const w = hotel ? 0.78 : 0.42;
      const bh = hotel ? 0.5 : 0.34;
      const body = new Mesh(new BoxGeometry(w, bh, w), mat);
      body.position.y = bh / 2;
      // peaked pyramid roof
      const roof = new Mesh(new ConeGeometry(w * 0.78, w * 0.6, 4), roofMat);
      roof.rotation.y = Math.PI / 4;
      roof.position.y = bh + w * 0.3;
      const house = new Group();
      house.add(body, roof);
      house.position.set((k - (n - 1) / 2) * 0.54, 0.5, 0);
      house.traverse((mm) => (mm.castShadow = true));
      g.add(house);
    }
    g.position.set(p.x, 0, p.z);
    this.scene.add(g);
    this.houseGroups[i] = g;
  }

  private syncDice(dice: [number, number] | null): void {
    if (!dice) {
      this.dice.forEach((d) => (d.visible = false));
      return;
    }
    if (this.dice.length === 0) {
      const faces = pipFaces();
      const order = [0, 5, 1, 4, 2, 3]; // +X,-X,+Y,-Y,+Z,-Z → 1..6
      for (let n = 0; n < 2; n++) {
        const mats = order.map((f) => new MeshStandardMaterial({ map: faces[f], roughness: 0.45, metalness: 0.05 }));
        const die = new Mesh(new BoxGeometry(1.1, 1.1, 1.1), mats);
        die.position.set(n === 0 ? -1.5 : 1.5, 1.2, 2.6);
        die.rotation.set(0.5, 0.3, 0.1);
        die.castShadow = true;
        this.scene.add(die);
        this.dice.push(die);
      }
    }
    this.dice.forEach((d) => (d.visible = true));
  }

  /** Apply an equipped board-felt cosmetic (ESTATE) — recolours base + bg. */
  setFelt(a: string, b: string): void {
    this.scene.background = new Color(b);
    if (this.baseMat) this.baseMat.color = new Color(a);
    this.renderOnce();
  }

  resize(width: number): void {
    const h = width * SCENE_RATIO;
    this.renderer.setSize(width, h, false);
    this.composer.setSize(width, h);
    this.renderOnce();
  }

  private renderOnce(): void {
    this.composer.render();
  }

  private startAnim(): void {
    if (this.animating) return;
    this.animating = true;
    const step = () => {
      let moving = false;
      this.tokens.forEach((g, seat) => {
        const target = this.tokenTarget[seat];
        if (!target) return;
        if (g.position.distanceToSquared(target) > 0.0004) {
          g.position.lerp(target, 0.16);
          moving = true;
        } else g.position.copy(target);
      });
      this.renderOnce();
      if (moving) this.raf = requestAnimationFrame(step);
      else this.animating = false;
    };
    this.raf = requestAnimationFrame(step);
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    // Free the whole scene graph (geometries, materials, ~50 CanvasTextures),
    // the baked environment map, the pawn geometry, and the post-processing
    // pipeline — renderer.dispose() alone leaks all of these.
    disposeObject(this.scene);
    (this.scene.environment as Texture | null)?.dispose();
    this.scene.environment = null;
    this.pawnGeo.dispose();
    for (const p of this.passes) p.dispose?.();
    this.composer.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
