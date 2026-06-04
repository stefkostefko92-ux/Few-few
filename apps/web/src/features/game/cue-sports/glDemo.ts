/**
 * Dev-only visual harness for the WebGL cue renderer. Served via Vite at
 * /cue-demo.html and screenshotted by tools/cue-shots.mjs — not part of the
 * production build (only index.html is a build input).
 */
import { TABLE } from "@aso/shared";
import { GLTable, type CueScene, type SceneBall } from "./glTable";

const R = TABLE.ballR;
const cx = TABLE.w / 2;
const cy = TABLE.h / 2;

/** Triangle rack of `count` balls, apex pointing left, foot at (footX, cy). */
function triangle(footX: number, ids: number[]): SceneBall[] {
  const dx = 2 * R * Math.cos(Math.PI / 6) + 0.001;
  const dy = 2 * R + 0.001;
  const out: SceneBall[] = [];
  let n = 0;
  for (let row = 0; n < ids.length; row++) {
    for (let k = 0; k <= row && n < ids.length; k++) {
      out.push({ id: ids[n]!, x: footX + row * dx, y: cy + (k - row / 2) * dy });
      n++;
    }
  }
  return out;
}

function eightBallRack(): SceneBall[] {
  // 8 in the centre, a stripe and a solid in opposite back corners (plausible rack).
  const ids = [1, 11, 2, 3, 8, 12, 9, 4, 13, 5, 14, 6, 15, 7, 10];
  const balls = triangle(1.4, ids);
  balls.push({ id: 0, x: 0.5, y: cy }); // cue
  return balls;
}

function nineBallRack(): SceneBall[] {
  const dx = 2 * R * Math.cos(Math.PI / 6) + 0.001;
  const dy = 2 * R + 0.001;
  const fx = 1.45;
  const balls: SceneBall[] = [
    { id: 1, x: fx, y: cy },
    { id: 2, x: fx + dx, y: cy - dy / 2 },
    { id: 3, x: fx + dx, y: cy + dy / 2 },
    { id: 9, x: fx + 2 * dx, y: cy },
    { id: 4, x: fx + 2 * dx, y: cy - dy },
    { id: 5, x: fx + 2 * dx, y: cy + dy },
    { id: 6, x: fx + 3 * dx, y: cy - dy / 2 },
    { id: 7, x: fx + 3 * dx, y: cy + dy / 2 },
    { id: 8, x: fx + 4 * dx, y: cy },
    { id: 0, x: 0.5, y: cy },
  ];
  return balls;
}

function scatteredRack(): SceneBall[] {
  // post-break spread, to show shading on many balls at varied positions.
  return [
    { id: 0, x: 0.62, y: 0.46 },
    { id: 1, x: 1.1, y: 0.3 },
    { id: 9, x: 1.32, y: 0.62 },
    { id: 8, x: 1.0, y: 0.5 },
    { id: 3, x: 1.55, y: 0.22 },
    { id: 11, x: 1.7, y: 0.74 },
    { id: 5, x: 0.95, y: 0.78 },
    { id: 14, x: 1.42, y: 0.44 },
    { id: 2, x: 1.78, y: 0.4 },
    { id: 7, x: 0.8, y: 0.2 },
    { id: 12, x: 1.2, y: 0.86 },
  ];
}

function snookerRack(): SceneBall[] {
  const reds = triangle(1.55, Array.from({ length: 15 }, (_, i) => 11 + i));
  const colours: SceneBall[] = [
    { id: 3, x: 0.42, y: cy - 0.18 }, // green
    { id: 4, x: 0.42, y: cy }, // brown
    { id: 2, x: 0.42, y: cy + 0.18 }, // yellow
    { id: 5, x: cx, y: cy }, // blue
    { id: 6, x: 1.5, y: cy }, // pink
    { id: 7, x: 1.85, y: cy }, // black
    { id: 0, x: 0.35, y: cy + 0.1 }, // cue in the D
  ];
  return [...reds, ...colours];
}

const SCENES: { label: string; scene: CueScene }[] = [
  {
    label: "8-ball — rack & break aim",
    scene: {
      variant: "EIGHTBALL",
      cloth: { a: "#1a6e3a", b: "#0c3a1f" },
      balls: eightBallRack(),
      aim: { x0: 0.5, y0: cy, x1: 1.4, y1: cy },
    },
  },
  {
    label: "9-ball — diamond rack",
    scene: { variant: "NINEBALL", cloth: { a: "#13614f", b: "#082b22" }, balls: nineBallRack() },
  },
  {
    label: "8-ball — post-break spread",
    scene: {
      variant: "EIGHTBALL",
      cloth: { a: "#7a1f2a", b: "#3a0d12" },
      balls: scatteredRack(),
      aim: { x0: 0.62, y0: 0.46, x1: 1.32, y1: 0.62 },
    },
  },
  {
    label: "Snooker — reds, colours on spots & the D",
    scene: { variant: "SNOOKER", cloth: { a: "#1f5fb0", b: "#0c2c5a" }, balls: snookerRack() },
  },
];

/* ── tiny SVG re-implementation of the old renderer for an A/B comparison ── */
const POOL_HUES = ["#e8b923", "#1f4fb0", "#c0241f", "#5a2a7a", "#e07a1f", "#1f8a3a", "#7a1f2a"];
function svgColor(id: number): string {
  if (id === 0) return "#f4f1e8";
  if (id === 8) return "#15171a";
  const hue = id <= 7 ? id : id - 8;
  return POOL_HUES[hue - 1] ?? "#ccc";
}
function svgTable(scene: CueScene): string {
  const r = R;
  const balls = scene.balls
    .map((b) => {
      const c = svgColor(b.id);
      const num = b.id !== 0 ? `<circle cx="${b.x}" cy="${b.y}" r="${r * 0.42}" fill="#fffdf6"/>` : "";
      const hl = b.id === 0 ? `<circle cx="${b.x - r * 0.3}" cy="${b.y - r * 0.3}" r="${r * 0.22}" fill="#fff" opacity="0.8"/>` : "";
      return `<circle cx="${b.x}" cy="${b.y}" r="${r}" fill="${c}" stroke="rgba(0,0,0,.35)" stroke-width="0.003"/>${num}${hl}`;
    })
    .join("");
  const pockets = [
    [0, 0],
    [1, 0],
    [2, 0],
    [0, 1],
    [1, 1],
    [2, 1],
  ]
    .map(([px, py]) => `<circle cx="${px}" cy="${py}" r="${TABLE.pocketR}" fill="#0a0a0a" opacity="0.92"/>`)
    .join("");
  return `<svg viewBox="0 0 2 1" style="width:100%;height:auto;aspect-ratio:2/1;border-radius:11px">
    <defs><radialGradient id="g" cx="40%" cy="35%" r="80%"><stop offset="0%" stop-color="${scene.cloth.a}"/><stop offset="100%" stop-color="${scene.cloth.b}"/></radialGradient></defs>
    <rect x="0" y="0" width="2" height="1" fill="url(#g)"/>${pockets}${balls}</svg>`;
}

async function main() {
  const root = document.getElementById("root")!;

  // A/B header comparison on the first scene.
  const ab = document.createElement("div");
  ab.innerHTML = `<h2>SVG/CSS (before) &nbsp;vs&nbsp; WebGL (after) — same 8-ball rack</h2>
    <div class="ab">
      <div><div class="rim">${svgTable(SCENES[0]!.scene)}</div><p class="cap">SVG/CSS renderer</p></div>
      <div><div class="rim"><canvas id="ab-gl"></canvas></div><p class="cap">WebGL renderer (PixiJS)</p></div>
    </div>`;
  root.appendChild(ab);
  const abGl = await GLTable.create(document.getElementById("ab-gl") as HTMLCanvasElement, 520);
  abGl.render(SCENES[0]!.scene);

  for (const { label, scene } of SCENES) {
    const h = document.createElement("h2");
    h.textContent = label;
    root.appendChild(h);
    const rim = document.createElement("div");
    rim.className = "rim shot";
    const canvas = document.createElement("canvas");
    canvas.className = `cap-shot`;
    rim.appendChild(canvas);
    root.appendChild(rim);
    const t = await GLTable.create(canvas, 760);
    t.render(scene);
  }

  // Pocket-drop animation: continuously re-trigger sinks so any screenshot
  // catches balls mid-shrink at the pockets.
  {
    const h = document.createElement("h2");
    h.textContent = "Pocket-drop animation (balls caught mid-shrink)";
    root.appendChild(h);
    const rim = document.createElement("div");
    rim.className = "rim shot";
    const canvas = document.createElement("canvas");
    rim.appendChild(canvas);
    root.appendChild(rim);
    const t = await GLTable.create(canvas, 760);
    t.render({
      variant: "EIGHTBALL",
      cloth: { a: "#1a6e3a", b: "#0c3a1f" },
      balls: [
        { id: 0, x: 0.55, y: cy },
        { id: 3, x: 1.1, y: 0.32 },
        { id: 11, x: 1.55, y: 0.7 },
      ],
    });
    // Staggered frozen pose: each pocket caught at a different stage of the drop.
    const cols = ["#c0241f", "#1f4fb0", "#e8b923", "#5a2a7a", "#1f8a3a", "#e07a1f"];
    t.poseDrop(
      [
        [0, 0],
        [TABLE.w / 2, 0],
        [TABLE.w, 0],
        [0, TABLE.h],
        [TABLE.w / 2, TABLE.h],
        [TABLE.w, TABLE.h],
      ].map(([x, y], idx) => ({ x: x!, y: y!, color: cols[idx % cols.length]!, progress: 0.12 + idx * 0.13 })),
    );
  }

  // Signal readiness to the screenshot driver.
  (window as unknown as { __cueReady?: boolean }).__cueReady = true;
}

void main();
