/**
 * Dev-only visual harness for the МАГНАТ 3D board. Served via Vite at
 * /magnat-demo.html and screenshotted by tools/magnat-shots.mjs — not a
 * production build input.
 */
import { BOARD_SIZE, DEFAULT_MAGNAT_CONFIG, type MagnatState } from "@aso/shared";
import { MagnatScene } from "./magnatScene";

function sampleState(): MagnatState {
  const owner = new Array<number>(BOARD_SIZE).fill(-1);
  const houses = new Array<number>(BOARD_SIZE).fill(0);
  const mortgaged = new Array<boolean>(BOARD_SIZE).fill(false);
  // a mid-game position with developed monopolies
  const own = (i: number, seat: number) => (owner[i] = seat);
  [1, 3, 39, 37].forEach((i) => own(i, 0)); // brown + dark-blue for P0
  [6, 8, 9, 5].forEach((i) => own(i, 1)); // light-blue + a station for P1
  [11, 13, 14, 25].forEach((i) => own(i, 2)); // pink + station for P2
  [21, 23, 24, 28].forEach((i) => own(i, 3)); // red + utility for P3
  houses[1] = 2; houses[3] = 2; // brown monopoly developed
  houses[39] = 5; houses[37] = 5; // dark-blue hotels
  houses[21] = 3; houses[23] = 3; houses[24] = 3;
  mortgaged[8] = true;

  return {
    seats: 4,
    turn: 0,
    phase: "ROLL",
    config: DEFAULT_MAGNAT_CONFIG,
    pot: 0,
    auction: null,
    trade: null,
    cash: [1450, 980, 1720, 610],
    pos: [5, 12, 24, 31],
    inJail: [false, false, true, false],
    jailTurns: [0, 0, 1, 0],
    gojf: [0, 1, 0, 0],
    bankrupt: [false, false, false, false],
    owner,
    houses,
    mortgaged,
    dice: [4, 3],
    doubles: 0,
    extraRoll: false,
    pendingBuy: null,
    chance: [],
    chancePtr: 0,
    chest: [],
    chestPtr: 0,
    turns: 24,
    done: false,
    log: [],
  };
}

const scene = new MagnatScene(document.getElementById("c") as HTMLCanvasElement, 720);
const s0 = sampleState();
scene.setState(s0);

// Expose a "make a move" hook so the screenshot driver can capture the token
// walk + dice tumble mid-flight.
(window as unknown as { __advance?: () => void }).__advance = () => {
  const s1: MagnatState = {
    ...s0,
    pos: [(s0.pos[0]! + 6) % 40, s0.pos[1]!, s0.pos[2]!, s0.pos[3]!],
    dice: [5, 4],
    turn: 0,
    houses: s0.houses.map((h, i) => (i === 13 ? 1 : h)), // a fresh build to pop in
  };
  scene.setState(s1);
};

// give the token glide a moment, then flag ready for the screenshot driver.
setTimeout(() => ((window as unknown as { __magnatReady?: boolean }).__magnatReady = true), 1000);
