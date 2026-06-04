/**
 * МАГНАТ 3D board (three.js) — "Stylized Bulgaria", fixed isometric camera.
 *
 * Builds the 40-tile ring with group-coloured property bands and baked city
 * labels, player tokens that glide tile-to-tile, houses/hotels on developed
 * properties, a central plaque in the Bulgarian tricolour, and 3D dice. The
 * React view (MagnatView) owns the DOM HUD + actions and calls setState();
 * this owns the pixels. Renders on demand (a short rAF loop only while tokens
 * are animating) so a static board costs no idle GPU.
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
  MeshStandardMaterial,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from "three";
import { BOARD, GROUP_COLORS, BOARD_SIZE, type MagnatState } from "@aso/shared";

const PLAYER_COLORS = ["#e23b3b", "#2f7fe2", "#2faa55", "#e8b923", "#9b4fd0", "#e07a1f"];
const T = 2; // tile pitch
const H = 5 * T; // board half-size (10 slots from +H to -H per side)
const RING_DEPTH = T * 1.55;
const SCENE_RATIO = 0.62; // canvas height / width (landscape — iso diamond is wide)

interface TilePlacement {
  x: number;
  z: number;
  side: 0 | 1 | 2 | 3; // 0 bottom, 1 left, 2 top, 3 right
  corner: boolean;
}

/** Centre + facing of each of the 40 tiles around the square ring. */
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
    case "jail": return "#5a5a5a";
    case "free": return "#3a7bd5";
    case "gotojail": return "#cc2b2b";
    case "station": return "#2a2a2a";
    case "utility": return "#3a8f8f";
    case "tax": return "#8a6a35";
    case "chance": return "#e8862b";
    case "chest": return "#c9a23a";
    default: return "#1f3d2a";
  }
}

/** Bake a tile's label (name + price) to a canvas texture, oriented for its side. */
function labelTexture(idx: number, side: number): CanvasTexture {
  const tl = BOARD[idx]!;
  const S = 256;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#f6efdd";
  ctx.fillRect(0, 0, S, S);
  // group colour band (properties) or type tint
  if (tl.type === "prop") {
    ctx.fillStyle = GROUP_COLORS[tl.group] ?? "#999";
    ctx.fillRect(0, 0, S, S * 0.26);
  }
  ctx.save();
  ctx.translate(S / 2, S / 2);
  ctx.rotate((side * Math.PI) / 2); // read outward per side
  ctx.fillStyle = "#1a1410";
  ctx.textAlign = "center";
  const name = tl.name.length > 14 ? tl.name.slice(0, 13) + "…" : tl.name;
  ctx.font = "600 30px Manrope, sans-serif";
  wrap(ctx, name, 0, -14, S * 0.78, 30);
  if (tl.price > 0) {
    ctx.font = "700 30px Manrope, sans-serif";
    ctx.fillStyle = "#5a3d22";
    ctx.fillText(`${tl.price}`, 0, 66);
  }
  ctx.restore();
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number) {
  const words = text.split(" ");
  let line = "";
  const lines: string[] = [];
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  const startY = y - ((lines.length - 1) * lh) / 2;
  lines.forEach((l, i) => ctx.fillText(l, x, startY + i * lh));
}

function plaqueTexture(): CanvasTexture {
  const W = 512;
  const c = document.createElement("canvas");
  c.width = c.height = W;
  const ctx = c.getContext("2d")!;
  // Bulgarian tricolour bands (white / green / red)
  ctx.fillStyle = "#f4efe2"; ctx.fillRect(0, 0, W, W / 3);
  ctx.fillStyle = "#2faa55"; ctx.fillRect(0, W / 3, W, W / 3);
  ctx.fillStyle = "#cc2b2b"; ctx.fillRect(0, (2 * W) / 3, W, W / 3);
  ctx.save();
  ctx.translate(W / 2, W / 2);
  ctx.rotate(-Math.PI / 4);
  ctx.fillStyle = "rgba(20,16,12,0.9)";
  ctx.fillRect(-W * 0.42, -64, W * 0.84, 128);
  ctx.fillStyle = "#e7c97a";
  ctx.font = "800 92px Playfair Display, serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("МАГНАТ", 0, 6);
  ctx.restore();
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
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

export class MagnatScene {
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera: OrthographicCamera;
  private place = placements();
  private tokens: Group[] = [];
  private tokenTarget: Vector3[] = [];
  private houseGroups: (Group | null)[] = new Array(BOARD_SIZE).fill(null);
  private ownerStuds: (Mesh | null)[] = new Array(BOARD_SIZE).fill(null);
  private dice: Mesh[] = [];
  private raf = 0;
  private animating = false;

  constructor(canvas: HTMLCanvasElement, width: number) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(2, globalThis.devicePixelRatio || 1));
    this.renderer.setSize(width, width * SCENE_RATIO, false);
    this.scene.background = null;

    const aspect = 1 / SCENE_RATIO;
    const d = H * 1.52; // frustum sized to fit the whole iso diamond
    this.camera = new OrthographicCamera(-d * aspect, d * aspect, d, -d, 0.1, 200);
    this.camera.position.set(H * 2, H * 2.4, H * 2);
    this.camera.lookAt(0, 0, 0);

    this.scene.add(new AmbientLight(0xffffff, 0.55));
    this.scene.add(new HemisphereLight(0xfff3d8, 0x2a1f14, 0.5));
    const key = new DirectionalLight(0xfff0d0, 1.1);
    key.position.set(H, H * 2.4, H * 0.6);
    this.scene.add(key);

    this.build();
    this.renderOnce();
  }

  private build(): void {
    // base
    const base = new Mesh(
      new BoxGeometry(2 * H + RING_DEPTH, 1, 2 * H + RING_DEPTH),
      new MeshStandardMaterial({ color: new Color("#16361f"), roughness: 0.95 }),
    );
    base.position.y = -0.5;
    this.scene.add(base);

    // centre plaque
    const plaque = new Mesh(
      new PlaneGeometry((2 * H - RING_DEPTH) * 0.62, (2 * H - RING_DEPTH) * 0.62),
      new MeshStandardMaterial({ map: plaqueTexture(), roughness: 0.8 }),
    );
    plaque.rotation.x = -Math.PI / 2;
    plaque.position.y = 0.02;
    this.scene.add(plaque);

    // tiles
    this.place.forEach((p, i) => {
      const tl = BOARD[i]!;
      const sz = p.corner ? RING_DEPTH : T;
      const along = p.side % 2 === 0 ? sz : RING_DEPTH;
      const deep = p.side % 2 === 0 ? RING_DEPTH : sz;
      const tile = new Mesh(
        new BoxGeometry(along * 0.96, 0.36, deep * 0.96),
        new MeshStandardMaterial({ color: new Color("#efe6d2"), roughness: 0.85 }),
      );
      tile.position.set(p.x, 0.18, p.z);
      this.scene.add(tile);

      // label on top
      const label = new Mesh(
        new PlaneGeometry(along * 0.9, deep * 0.9),
        new MeshStandardMaterial({ map: labelTexture(i, p.side), roughness: 0.9, transparent: true }),
      );
      label.rotation.x = -Math.PI / 2;
      label.position.set(p.x, 0.37, p.z);
      this.scene.add(label);

      // special-tile colour block (non-property)
      if (tl.type !== "prop") {
        const cap = new Mesh(
          new BoxGeometry(along * 0.5, 0.1, deep * 0.5),
          new MeshStandardMaterial({ color: new Color(specialColor(tl.type)), roughness: 0.6 }),
        );
        cap.position.set(p.x, 0.42, p.z);
        this.scene.add(cap);
      }
    });
  }

  /** World position for a player's token on tile `idx`, fanned by seat. */
  private tokenPos(idx: number, seat: number, seats: number): Vector3 {
    const p = this.place[idx]!;
    const ang = (seat / Math.max(seats, 1)) * Math.PI * 2;
    const r = T * 0.28;
    return new Vector3(p.x + Math.cos(ang) * r, 0.7, p.z + Math.sin(ang) * r);
  }

  setState(state: MagnatState): void {
    const seats = state.seats;
    // tokens (create lazily)
    while (this.tokens.length < seats) {
      const seat = this.tokens.length;
      const g = new Group();
      const color = new Color(PLAYER_COLORS[seat % PLAYER_COLORS.length]);
      const body = new Mesh(
        new CylinderGeometry(0.36, 0.46, 0.5, 20),
        new MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.2 }),
      );
      const head = new Mesh(
        new CylinderGeometry(0.34, 0.34, 0.5, 20),
        new MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.2 }),
      );
      head.position.y = 0.5;
      g.add(body, head);
      this.scene.add(g);
      this.tokens.push(g);
      this.tokenTarget.push(new Vector3());
    }

    this.tokens.forEach((g, seat) => {
      g.visible = seat < seats;
      if (seat >= seats) return;
      const target = this.tokenPos(state.pos[seat]!, seat, seats);
      this.tokenTarget[seat] = target;
      g.scale.setScalar(state.bankrupt[seat] ? 0.5 : 1);
      const mat = (g.children[0] as Mesh).material as MeshStandardMaterial;
      mat.emissive = new Color(seat === state.turn && !state.done ? "#ffffff" : "#000000");
      mat.emissiveIntensity = seat === state.turn ? 0.25 : 0;
      // first placement snaps; later changes glide.
      if (g.position.lengthSq() === 0) g.position.copy(target);
    });

    // ownership studs + houses
    for (let i = 0; i < BOARD_SIZE; i++) {
      const owner = state.owner[i]!;
      const p = this.place[i]!;
      if (owner >= 0 && !this.ownerStuds[i]) {
        const stud = new Mesh(
          new BoxGeometry(0.4, 0.18, 0.4),
          new MeshStandardMaterial({ color: new Color(PLAYER_COLORS[owner % PLAYER_COLORS.length]) }),
        );
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
          stud.position.set(p.x, 0.5, p.z);
        }
      }
      this.syncHouses(i, state.houses[i]!);
    }

    this.syncDice(state.dice);
    this.startAnim();
  }

  private syncHouses(i: number, count: number): void {
    if (this.houseGroups[i]) {
      this.scene.remove(this.houseGroups[i]!);
      this.houseGroups[i] = null;
    }
    if (count <= 0) return;
    const p = this.place[i]!;
    const g = new Group();
    const hotel = count >= 5;
    const n = hotel ? 1 : count;
    for (let k = 0; k < n; k++) {
      const house = new Mesh(
        new BoxGeometry(0.42, 0.42, 0.42),
        new MeshStandardMaterial({ color: new Color(hotel ? "#cc2b2b" : "#2faa55"), roughness: 0.5 }),
      );
      house.position.set((k - (n - 1) / 2) * 0.5, 0.6, 0);
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
      // BoxGeometry face order: +X,-X,+Y,-Y,+Z,-Z → values 1..6
      const order = [0, 5, 1, 4, 2, 3];
      for (let n = 0; n < 2; n++) {
        const mats = order.map((f) => new MeshStandardMaterial({ map: faces[f], roughness: 0.5 }));
        const die = new Mesh(new BoxGeometry(1, 1, 1), mats);
        die.position.set(n === 0 ? -1.3 : 1.3, 1.2, 3.2);
        die.rotation.set(0.5, 0.3, 0);
        this.scene.add(die);
        this.dice.push(die);
      }
    }
    this.dice.forEach((d) => (d.visible = true));
  }

  resize(width: number): void {
    this.renderer.setSize(width, width * SCENE_RATIO, false);
    this.renderOnce();
  }

  private renderOnce(): void {
    this.renderer.render(this.scene, this.camera);
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
          g.position.lerp(target, 0.18);
          moving = true;
        } else g.position.copy(target);
      });
      this.renderOnce();
      if (moving) {
        this.raf = requestAnimationFrame(step);
      } else {
        this.animating = false;
      }
    };
    this.raf = requestAnimationFrame(step);
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    this.renderer.dispose();
  }
}
