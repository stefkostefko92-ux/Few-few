/**
 * Сградите на Магнат в света на Рейвънхолд (стилът и качеството на boy/src/castle.js):
 * каменна колиба → къща с паянтов етаж → къща с кула → гилдия → крепост (хотел).
 *
 * Всичко е процедурна геометрия с изпечени PBR материали (камък, мазилка, дъб, керемиди,
 * шисти, ковано желязо, месинг — gl/tex). Всяка сграда се слива по материал (до 9 draw
 * calls), зидарията има UV в световни единици (еднаква плътност на всяка стена) с отместване
 * по имот, за да не се повтаря една и съща шарка. Прозорците светят с HDR цвят над прага на
 * bloom-а — топлата халация на поста ги ореолва като свещи зад стъкло.
 *
 * Координати: начало в центъра на основата, y нагоре, лицето гледа към +z.
 */
import {
  BufferAttribute,
  BufferGeometry,
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  type Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SphereGeometry,
} from "three";
import { upgradeMaterial } from "../gl/baked.js";
import { cylUV, merge, worldUV, xf } from "../gl/geo.js";

type Part = "stone" | "plaster" | "timber" | "clay" | "slate" | "glow" | "iron" | "gold" | "banner";

const STONE_TILE = 0.9; // 8 реда камък на 0.9 ед. — фугите се четат и на малка сграда
const ROOF_TILE = 0.75;

/** Събира геометриите по материал; планарните получават световни UV при сливането. */
class Parts {
  private lists = new Map<Part, { g: BufferGeometry; planar: boolean }[]>();
  private m: Matrix4 | null = null;
  constructor(private readonly ou: number, private readonly ov: number) {}
  /** Всичко, добавено в `fn`, минава през преместване + завъртане около y. */
  at(p: [number, number, number], ry: number, fn: () => void): void {
    const prev = this.m;
    this.m = new Matrix4().makeRotationY(ry).setPosition(p[0], p[1], p[2]);
    fn();
    this.m = prev;
  }
  add(part: Part, g: BufferGeometry, planar = true): void {
    if (this.m) g.applyMatrix4(this.m);
    if (!this.lists.has(part)) this.lists.set(part, []);
    this.lists.get(part)!.push({ g, planar });
  }
  box(part: Part, cx: number, cy: number, cz: number, sx: number, sy: number, sz: number): void {
    this.add(part, new BoxGeometry(sx, sy, sz).translate(cx, cy, cz));
  }
  build(mats: (p: Part) => Material): Group {
    const group = new Group();
    for (const [part, list] of this.lists) {
      const tile = part === "stone" ? STONE_TILE : part === "timber" ? 0.6 : 1;
      const geos = list.map(({ g, planar }) => (planar ? worldUV(g, tile, this.ou, this.ov) : g));
      const mesh = new Mesh(merge(geos), mats(part));
      mesh.castShadow = part !== "glow" && part !== "banner";
      mesh.receiveShadow = part !== "glow";
      group.add(mesh);
    }
    return group;
  }
}

/** Четириъгълник a→b→c→d (обратно на часовника, гледан отвън) със свои UV. */
function quad(p: number[][], uv: number[][]): BufferGeometry {
  const idx = [0, 1, 2, 0, 2, 3];
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(idx.flatMap((i) => p[i]!)), 3));
  g.setAttribute("uv", new BufferAttribute(new Float32Array(idx.flatMap((i) => uv[i]!)), 2));
  g.computeVertexNormals();
  return g;
}

/**
 * Двускатен покрив с било по x: ската стига до стрехата на `oh` извън стените. UV: u по
 * билото, v нагоре по ската (обърнато — плочите на изпичането се застъпват надолу по ската).
 * Фронтоните (триъгълниците под ската) отиват в `gablePart`.
 */
function gable(P: Parts, part: Part, gablePart: Part, w: number, d: number, h: number, oh: number, y0: number): void {
  const hw = w / 2 + oh;
  const hd = d / 2 + oh;
  const slope = Math.hypot(hd, h) / ROOF_TILE;
  for (const s of [1, -1]) {
    const a = [-hw * s, y0, hd * s];
    const b = [hw * s, y0, hd * s];
    const c = [hw * s, y0 + h, 0];
    const dd = [-hw * s, y0 + h, 0];
    P.add(part, quad([a, b, c, dd], [[(-hw * s) / ROOF_TILE, 0], [(hw * s) / ROOF_TILE, 0], [(hw * s) / ROOF_TILE, -slope], [(-hw * s) / ROOF_TILE, -slope]]), false);
  }
  // Било: тесен гребен от същите плочи (до челните дъски, не отвъд тях).
  P.add(part, worldUV(new BoxGeometry(w + 2 * oh - 0.02, 0.035, 0.05).translate(0, y0 + h + 0.005, 0), ROOF_TILE), false);
  // Челни дъски по ръба на всеки фронтон: дават на покрива дебелина отстрани.
  const ang = Math.atan2(h, hd);
  const len = Math.hypot(hd, h);
  for (const sx of [1, -1]) {
    for (const sz of [1, -1]) {
      P.add("timber", xf(new BoxGeometry(0.022, 0.034, len + 0.02), [sx * (hw - 0.011), y0 + h / 2 - 0.008, (sz * hd) / 2], [sz * ang, 0, 0]));
    }
  }
  // Фронтони: триъгълник във всяка челна стена, под линията на ската.
  const rise = (h * (d / 2)) / hd;
  for (const s of [1, -1]) {
    const x = (w / 2) * s;
    const tri = new BufferGeometry();
    const pts = s > 0 ? [x, y0, d / 2, x, y0, -d / 2, x, y0 + rise, 0] : [x, y0, -d / 2, x, y0, d / 2, x, y0 + rise, 0];
    tri.setAttribute("position", new BufferAttribute(new Float32Array(pts), 3));
    tri.computeVertexNormals();
    P.add(gablePart, tri);
  }
}

/** Конусен покрив на кула: плочите в хоризонтални редове около върха. */
function cone(P: Parts, part: Part, r: number, h: number, x: number, y0: number, z: number, sides = 16, ry = 0): void {
  const g = new ConeGeometry(r, h, sides, 1, true).rotateY(ry);
  const pos = g.attributes.position!;
  const uv = new Float32Array(pos.count * 2);
  const slant = Math.hypot(r, h);
  for (let i = 0; i < pos.count; i++) {
    const a = Math.atan2(pos.getX(i), pos.getZ(i));
    uv[i * 2] = ((a + Math.PI) * r) / ROOF_TILE;
    uv[i * 2 + 1] = (-(pos.getY(i) + h / 2) / h) * (slant / ROOF_TILE);
  }
  g.setAttribute("uv", new BufferAttribute(uv, 2));
  P.add(part, g.translate(x, y0 + h / 2, z), false);
}

/** Светещ прозорец в стена с лице по оста `face` (+z/-z/+x/-x) с дъбова рамка и праг. */
function win(P: Parts, face: "z" | "-z" | "x" | "-x", u: number, y: number, wall: number, ww: number, wh: number, mullion = true): void {
  const put = (part: Part, a: number, b: number, c: number, sa: number, sb: number, sc: number) => {
    // (a,b,c) = (по стената, височина, навън) → световни оси според лицето
    if (face === "z") P.box(part, a, b, wall + c, sa, sb, sc);
    else if (face === "-z") P.box(part, -a, b, -wall - c, sa, sb, sc);
    else if (face === "x") P.box(part, wall + c, b, -a, sc, sb, sa);
    else P.box(part, -wall - c, b, a, sc, sb, sa);
  };
  put("glow", u, y, 0.002, ww, wh, 0.012);
  put("timber", u, y + wh / 2 + 0.012, 0.01, ww + 0.04, 0.024, 0.03); // преклад
  put("timber", u, y - wh / 2 - 0.01, 0.014, ww + 0.05, 0.02, 0.04); // праг
  if (mullion) put("timber", u, y, 0.008, 0.012, wh, 0.016);
}

/** Дъбова врата с железни обкови. */
function door(P: Parts, x: number, z: number, w: number, h: number): void {
  P.box("timber", x, h / 2, z + 0.008, w, h, 0.02);
  for (const k of [0.25, 0.75]) P.box("iron", x, h * k, z + 0.02, w * 0.9, 0.014, 0.006);
  P.box("stone", x, h + 0.03, z + 0.012, w + 0.07, 0.06, 0.03); // каменен преклад
}

function chimney(P: Parts, x: number, z: number, y0: number, top: number): void {
  P.box("stone", x, (y0 + top) / 2, z, 0.1, top - y0, 0.1);
  P.box("stone", x, top + 0.015, z, 0.13, 0.03, 0.13);
}

/** Паянтов етаж: мазилка, ъглови стълбове, греди отгоре/отдолу и кръстосани подпори. */
function timberFloor(P: Parts, w: number, d: number, y0: number, h: number): void {
  P.box("plaster", 0, y0 + h / 2, 0, w, h, d);
  const t = 0.032;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.box("timber", (sx * w) / 2, y0 + h / 2, (sz * d) / 2, t, h, t);
  for (const yy of [y0 + t / 2, y0 + h - t / 2]) {
    P.box("timber", 0, yy, d / 2 + 0.004, w + t, t, t * 0.6);
    P.box("timber", 0, yy, -d / 2 - 0.004, w + t, t, t * 0.6);
    P.box("timber", w / 2 + 0.004, yy, 0, t * 0.6, t, d + t);
    P.box("timber", -w / 2 - 0.004, yy, 0, t * 0.6, t, d + t);
  }
  // Подпори на лицето и гърба: стълб по средата + диагонали към ъглите (класическа паянта).
  const len = Math.hypot(w / 4, h - t);
  const ang = Math.atan2(h - t, w / 4);
  for (const sz of [1, -1]) {
    const z = (sz * d) / 2 + 0.006 * sz;
    P.box("timber", 0, y0 + h / 2, z, t * 0.8, h, t * 0.5);
    for (const sx of [-1, 1]) P.add("timber", xf(new BoxGeometry(len, t * 0.7, t * 0.5), [(sx * w * 3) / 8, y0 + h / 2, z], [0, 0, sx * ang]));
  }
}

/** Прът със знаме в цвета на собственика; знамето е леко огънато, сякаш го носи вятър. */
function flag(P: Parts, x: number, y0: number, z: number, pole: number, fw: number, fh: number): void {
  P.add("iron", new CylinderGeometry(0.012, 0.014, pole, 8).translate(x, y0 + pole / 2, z));
  P.add("gold", new SphereGeometry(0.028, 12, 8).translate(x, y0 + pole + 0.02, z));
  const cloth = new PlaneGeometry(fw, fh, 10, 4);
  const pos = cloth.attributes.position!;
  for (let i = 0; i < pos.count; i++) {
    const u = (pos.getX(i) + fw / 2) / fw; // 0 при пръта
    pos.setZ(i, Math.sin(u * Math.PI * 1.6 + pos.getY(i) * 3) * 0.03 * u);
    pos.setY(i, pos.getY(i) - u * u * 0.03);
  }
  cloth.computeVertexNormals();
  P.add("banner", cloth.translate(x + fw / 2 + 0.012, y0 + pole - fh / 2 - 0.02, z), false);
}

function spire(P: Parts, x: number, y: number, z: number): void {
  P.add("gold", new ConeGeometry(0.018, 0.09, 8).translate(x, y + 0.045, z));
  P.add("gold", new SphereGeometry(0.022, 10, 8).translate(x, y, z));
}

// ── пет нива ─────────────────────────────────────────────────────────────────

function cottage(P: Parts): void {
  const w = 0.78, d = 0.56, h = 0.42;
  P.box("stone", 0, h / 2, 0, w, h, d);
  P.box("stone", 0, 0.02, 0, w + 0.04, 0.04, d + 0.04); // цокъл
  gable(P, "clay", "stone", w, d, 0.34, 0.07, h);
  door(P, -0.14, d / 2, 0.13, 0.23);
  win(P, "z", 0.17, 0.24, d / 2, 0.11, 0.1);
  win(P, "x", 0, 0.24, w / 2, 0.1, 0.1);
  win(P, "-x", 0, 0.24, w / 2, 0.1, 0.1);
  chimney(P, 0.24, -0.12, 0.3, 0.9);
}

function house(P: Parts): void {
  const w = 0.84, d = 0.62, h = 0.36;
  P.box("stone", 0, h / 2, 0, w, h, d);
  P.box("stone", 0, 0.02, 0, w + 0.04, 0.04, d + 0.04);
  // издаден паянтов етаж (jetty) — по-широк от каменния
  timberFloor(P, w + 0.08, d + 0.08, h, 0.38);
  gable(P, "clay", "plaster", w + 0.08, d + 0.08, 0.4, 0.07, h + 0.38);
  door(P, -0.16, d / 2, 0.13, 0.24);
  win(P, "z", 0.18, 0.2, d / 2, 0.11, 0.1);
  for (const u of [-0.2, 0.2]) win(P, "z", u, h + 0.2, (d + 0.08) / 2 + 0.006, 0.1, 0.12);
  for (const u of [-0.2, 0.2]) win(P, "-z", u, h + 0.2, (d + 0.08) / 2 + 0.006, 0.1, 0.12);
  win(P, "x", 0, h + 0.2, (w + 0.08) / 2 + 0.006, 0.1, 0.12);
  win(P, "-x", 0, h + 0.2, (w + 0.08) / 2 + 0.006, 0.1, 0.12);
  chimney(P, 0.28, -0.14, 0.6, 1.3);
}

function tower(P: Parts, x: number, z: number, r: number, h: number, roofH: number): void {
  P.add("stone", cylUV(new CylinderGeometry(r, r * 1.06, h, 20, 1, false).translate(0, h / 2, 0), r, STONE_TILE, x, z).translate(x, 0, z), false);
  P.add("stone", cylUV(new CylinderGeometry(r * 1.12, r * 1.12, 0.05, 20).translate(0, h + 0.025, 0), r, STONE_TILE).translate(x, 0, z), false);
  cone(P, "slate", r * 1.25, roofH, x, h + 0.05, z);
  spire(P, x, h + 0.05 + roofH, z);
  // процепи-бойници, светещи отвътре
  for (const [a, y] of [[0.3, h * 0.45], [2.2, h * 0.7], [4.1, h * 0.55]] as const) {
    P.add("glow", xf(new BoxGeometry(0.03, 0.1, 0.02), [x + Math.sin(a) * r, y, z + Math.cos(a) * r], [0, a, 0]), false);
  }
}

function towerHouse(P: Parts): void {
  house(P);
  tower(P, -0.46, -0.28, 0.17, 1.25, 0.42);
}

function guildHall(P: Parts): void {
  const w = 1.0, d = 0.74, h = 0.42;
  P.box("stone", 0, h / 2, 0, w, h, d);
  P.box("stone", 0, 0.02, 0, w + 0.05, 0.04, d + 0.05);
  timberFloor(P, w + 0.08, d + 0.08, h, 0.32);
  timberFloor(P, w + 0.14, d + 0.14, h + 0.32, 0.3);
  const top = h + 0.62;
  gable(P, "slate", "plaster", w + 0.14, d + 0.14, 0.5, 0.08, top);
  // входен портик с малък покрив, чието било гледа напред
  P.box("stone", 0, 0.17, d / 2 + 0.08, 0.34, 0.34, 0.16);
  P.at([0, 0, d / 2 + 0.08], Math.PI / 2, () => gable(P, "slate", "stone", 0.2, 0.36, 0.14, 0.04, 0.34));
  door(P, 0, d / 2 + 0.16, 0.14, 0.25);
  for (const u of [-0.34, 0.34]) win(P, "z", u, 0.24, d / 2, 0.11, 0.12);
  for (const y of [h + 0.16, h + 0.47]) {
    for (const u of [-0.32, 0, 0.32]) win(P, "z", u, y, (d + (y > h + 0.3 ? 0.14 : 0.08)) / 2 + 0.006, 0.1, 0.12);
    for (const u of [-0.25, 0.25]) win(P, "x", u, y, (w + (y > h + 0.3 ? 0.14 : 0.08)) / 2 + 0.006, 0.1, 0.12);
    for (const u of [-0.25, 0.25]) win(P, "-x", u, y, (w + (y > h + 0.3 ? 0.14 : 0.08)) / 2 + 0.006, 0.1, 0.12);
  }
  chimney(P, 0.36, -0.2, 0.9, 1.72);
  chimney(P, -0.36, -0.2, 0.9, 1.66);
  flag(P, 0.54, h, d / 2 + 0.05, 0.62, 0.2, 0.14);
}

function keep(P: Parts): void {
  const w = 0.86, h = 1.3;
  P.box("stone", 0, h / 2, 0, w, h, w);
  P.box("stone", 0, 0.03, 0, w + 0.08, 0.06, w + 0.08);
  // бойници по короната
  for (let k = -3; k <= 3; k++) {
    const t = (k / 3) * (w / 2 - 0.05);
    for (const [x, z, sx, sz] of [[t, w / 2 - 0.03, 0.07, 0.06], [t, -w / 2 + 0.03, 0.07, 0.06], [w / 2 - 0.03, t, 0.06, 0.07], [-w / 2 + 0.03, t, 0.06, 0.07]] as const) {
      if (k % 2 === 0) P.box("stone", x, h + 0.05, z, sx, 0.1, sz);
    }
  }
  // пирамидален покрив в средата + флаг на върха
  cone(P, "slate", 0.46, 0.42, 0, h, 0, 4, Math.PI / 4);
  flag(P, 0, h + 0.42, 0, 0.42, 0.26, 0.17);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) tower(P, (sx * w) / 2, (sz * w) / 2, 0.14, 1.58, 0.4);
  door(P, 0, w / 2, 0.2, 0.3);
  P.box("iron", 0, 0.16, w / 2 + 0.024, 0.18, 0.012, 0.006); // решетка на портата
  for (const y of [0.55, 0.9]) {
    for (const u of [-0.18, 0.18]) {
      win(P, "z", u, y, w / 2, 0.05, 0.14, false);
      win(P, "-z", u, y, w / 2, 0.05, 0.14, false);
      win(P, "x", u, y, w / 2, 0.05, 0.14, false);
      win(P, "-x", u, y, w / 2, 0.05, 0.14, false);
    }
  }
}

const LEVELS = [cottage, house, towerHouse, guildHall, keep];

/** Общите материали на всички сгради; изпечените карти пристигат асинхронно. */
export class BuildingKit {
  private readonly mats: Record<Exclude<Part, "banner">, Material>;
  private readonly banners = new Map<string, MeshStandardMaterial>();

  constructor(private readonly onReady: () => void) {
    const std = (color: string, roughness: number, metalness = 0) => new MeshStandardMaterial({ color: new Color(color), roughness, metalness });
    const stone = std("#8c857a", 1);
    const plaster = std("#e8dcc4", 0.95);
    const timber = std("#3b2718", 1);
    const clay = std("#b8623a", 1);
    const slate = std("#56606e", 1);
    const iron = std("#2c2d31", 0.6, 0.75);
    const gold = std("#d9b25f", 0.35, 1);
    for (const m of [clay, slate]) m.side = DoubleSide; // стрехите се виждат и отдолу
    upgradeMaterial(stone, "stone", { repeat: [1, 1], albedo: true, color: 0xffffff, roughness: 1, normalScale: 1.1, ao: 0.8, onReady });
    upgradeMaterial(plaster, "plaster", { repeat: [1, 1], albedo: true, color: "#f3e7d2", roughness: 1, normalScale: 0.9, ao: 0.5, onReady });
    upgradeMaterial(timber, "walnut", { repeat: [1, 1], albedo: true, color: "#8f7c68", roughness: 1, normalScale: 1, ao: 0.4, onReady });
    upgradeMaterial(clay, "roof", { repeat: [1, 1], albedo: true, color: "#c46a42", roughness: 1, normalScale: 1.2, ao: 0.9, onReady });
    upgradeMaterial(slate, "roof", { repeat: [1, 1], albedo: true, color: "#5d6878", roughness: 0.9, normalScale: 1.2, ao: 0.9, onReady });
    upgradeMaterial(iron, "brass", { repeat: [1, 1], metalness: true, ao: 0.4, onReady });
    upgradeMaterial(gold, "brass", { repeat: [1, 1], metalness: true, ao: 0.3, onReady });
    // HDR над прага на bloom-а (1.3): свещите зад стъклото хващат топлата халация.
    const glow = new MeshBasicMaterial({ color: new Color(3.0, 1.35, 0.45) });
    this.mats = { stone, plaster, timber, clay, slate, glow, iron, gold };
  }

  private banner(color: string): MeshStandardMaterial {
    let m = this.banners.get(color);
    if (!m) {
      m = new MeshStandardMaterial({ color: new Color(color), roughness: 0.85, side: DoubleSide });
      upgradeMaterial(m, "felt", { repeat: [3, 3], normalScale: 0.6, onReady: this.onReady });
      this.banners.set(color, m);
    }
    return m;
  }

  /** Сграда за ниво 1–5 (5 = хотел/крепост); `seed` мести шарката на камъка по имот. */
  build(level: number, ownerColor: string, seed: number): Group {
    const P = new Parts((seed * 0.37) % 1, (seed * 0.61) % 1);
    LEVELS[Math.max(0, Math.min(LEVELS.length - 1, level - 1))]!(P);
    return P.build((p) => (p === "banner" ? this.banner(ownerColor) : this.mats[p]));
  }

  dispose(): void {
    for (const m of [...Object.values(this.mats), ...this.banners.values()]) {
      for (const v of Object.values(m)) if (v && (v as { isTexture?: boolean }).isTexture) (v as { dispose: () => void }).dispose();
      m.dispose();
    }
  }
}
