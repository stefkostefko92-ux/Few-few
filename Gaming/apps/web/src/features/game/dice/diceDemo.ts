/**
 * Dev-only visual harness for the WebGL dice renderer. Served via Vite at
 * /dice-demo.html and screenshotted by tools/dice-shots.mjs — not a production
 * build input.
 */
import { GLDice } from "./glDice";

const PIP_ON: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

function cssDie(value: number): string {
  const on = new Set(PIP_ON[value] ?? []);
  const pips = Array.from({ length: 9 }, (_, i) => `<i class="${on.has(i) ? "" : "off"}"></i>`).join("");
  return `<span class="die">${pips}</span>`;
}

async function tray(parent: HTMLElement): Promise<GLDice> {
  const t = document.createElement("div");
  t.className = "tray";
  const canvas = document.createElement("canvas");
  t.appendChild(canvas);
  parent.appendChild(t);
  return GLDice.create(canvas, 380, 5);
}

async function main() {
  const root = document.getElementById("root")!;

  // A/B: flat CSS dice vs WebGL dice (settled).
  const abh = document.createElement("h2");
  abh.textContent = "CSS pip dice (before)  vs  WebGL dice (after)";
  root.appendChild(abh);
  const ab = document.createElement("div");
  ab.className = "ab";
  const before = document.createElement("div");
  before.innerHTML = `<div class="tray"><div class="row">${[5, 2, 6, 3, 1].map(cssDie).join("")}</div></div><p class="cap">CSS pip grid</p>`;
  ab.appendChild(before);
  const afterWrap = document.createElement("div");
  ab.appendChild(afterWrap);
  root.appendChild(ab);
  const afterCap = document.createElement("p");
  afterCap.className = "cap";
  const abTray = await tray(afterWrap);
  abTray.poseDemo([{ value: 5 }, { value: 2 }, { value: 6 }, { value: 3 }, { value: 1 }]);
  afterCap.textContent = "WebGL 3D-shaded";
  afterWrap.appendChild(afterCap);

  // Settled with two held dice (lifted + brass halo).
  const h2 = document.createElement("h2");
  h2.textContent = "Held dice — lifted with a brass halo";
  root.appendChild(h2);
  const heldTray = await tray(root);
  heldTray.poseDemo([
    { value: 6, held: true },
    { value: 2 },
    { value: 6, held: true },
    { value: 4 },
    { value: 6 },
  ]);

  // Mid-tumble pose.
  const h3 = document.createElement("h2");
  h3.textContent = "Mid-roll tumble (frozen)";
  root.appendChild(h3);
  const rollTray = await tray(root);
  rollTray.poseDemo([
    { value: 3, rot: 0.5, lift: -28, scale: 1.08 },
    { value: 5, rot: -0.35, lift: -16, scale: 1.05 },
    { value: 1, rot: 0.2, lift: -34, scale: 1.1 },
    { value: 6, rot: -0.5, lift: -10, scale: 1.03 },
    { value: 4, rot: 0.4, lift: -22, scale: 1.06 },
  ]);

  (window as unknown as { __diceReady?: boolean }).__diceReady = true;
}

void main();
