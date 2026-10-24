import {
  expect,
  test,
  type Browser,
  type Locator,
  type Page,
  type TestInfo,
} from "@playwright/test";
import sharp from "sharp";
import { POCKETS, runShot, TABLE, turnSecondsFor, type CueEvent } from "@aso/shared";
import {
  eightBallEngine,
  nineBallEngine,
  snookerEngine,
  SeededRng,
  type CueActionX,
  type CueStateX,
} from "@aso/game-core";
import type { CueE2E, CueShotLog } from "../../src/features/game/cue-sports/e2eHook";
import {
  expectGameOverCard,
  expectServerAdvanced,
  isOver,
  openGame,
  probe,
  stateVersion,
  type Table,
} from "./helpers";

/**
 * Cue sports (8-ball, 9-ball, snooker) driven like a person would: press on
 * the felt to aim, the power slider by mouse + arrow keys, the spin pad by
 * mouse + keys, „Постави бялата“ + a click for ball in hand, the pocket
 * buttons on the 8, then „Удар“ or Space. Nothing is injected into the app.
 *
 * Every shot is checked against the very engine the server runs:
 *  - the Socket.IO frames (websocket transport only) show what the client
 *    sent and what the server answered, so the shot the UI fired must be
 *    exactly the one the controls showed and the server must have played it;
 *  - the next state must equal a local `reduce` of the same action (balls to
 *    the last bit, turn, fouls, score) — client animation, server physics and
 *    rules are one deterministic computation;
 *  - the client's replay (`window.__asoE2E.cue`, automation-only) must end on
 *    those exact positions, in real time (lasting `lastShotMs`), so the turn
 *    clock — extended by that length — never burns while balls still roll.
 * The "player" picks its shot from the engine's own ghost-ball candidates and
 * keeps the first one a local simulation says pots legally, so matches move
 * on (and may end) within a few turns.
 *
 * Page access is batched (one evaluate per question): on the software-
 * rendered 3D table (swiftshader) every round trip costs 1–2 s, and a turn
 * has a 45 s clock. `ShotStyle.lean` keeps the 3D turn to the canvas path —
 * aim, place and shoot through it; the full control workout runs in 2D.
 */

export type CueGame = "EIGHTBALL" | "NINEBALL" | "SNOOKER";
type Pt = { x: number; y: number };
type Shoot = Extract<CueActionX, { type: "SHOOT" }>;
type Outcome = { state: CueStateX; events: CueEvent[] };

const ENGINES = {
  EIGHTBALL: eightBallEngine,
  NINEBALL: nineBallEngine,
  SNOOKER: snookerEngine,
} as const;
const POWER_MIN = 0.1;
const POWER_MAX = 1;
/** The realtime host waits the previous shot's animation + this long before a
 *  bot shoots (room.ts runBots: `animMs + 800`). */
const BOT_MARGIN_MS = 800;

// ── Socket.IO wire ──────────────────────────────────────────────────────────

export interface WireState {
  at: number;
  matchId: string;
  state: CueStateX;
  turn: number | null;
  turnEndsAt?: number;
  turnMs?: number;
  timeoutStrikes?: number;
}

/** Everything the page's socket carried for the cue match. */
export class Wire {
  matchId: string | null = null;
  seat = 0;
  readonly states: WireState[] = [];
  readonly sent: { at: number; action: Record<string, unknown> }[] = [];
  readonly errors: { at: number; data: unknown }[] = [];

  /** States of the match the view is bound to (the latest match:found). */
  match(): WireState[] {
    return this.states.filter((s) => s.matchId === this.matchId);
  }

  last(): WireState {
    const s = this.match().at(-1);
    if (!s) throw new Error("no game:state for the current match yet");
    return s;
  }

  in(ev: string, data: Record<string, unknown>): void {
    const at = Date.now();
    if (ev === "match:found") {
      this.matchId = data.matchId as string;
      this.seat = data.seat as number;
    } else if (ev === "game:state") {
      this.states.push({
        at,
        matchId: data.matchId as string,
        state: data.state as CueStateX,
        turn: (data.turn as number | null) ?? null,
        turnEndsAt: data.turnEndsAt as number | undefined,
        turnMs: data.turnMs as number | undefined,
        timeoutStrikes: data.timeoutStrikes as number | undefined,
      });
    } else if (ev === "game:error") {
      this.errors.push({ at, data });
    }
  }

  out(ev: string, data: Record<string, unknown>): void {
    if (ev === "game:action")
      this.sent.push({ at: Date.now(), action: data.action as Record<string, unknown> });
  }
}

/** `42[...]` Socket.IO event packet → [event, payload]. */
function parseFrame(payload: string | Buffer): [string, Record<string, unknown>] | null {
  if (typeof payload !== "string") return null;
  const m = /^42\d*(\[[\s\S]*\])$/.exec(payload);
  if (!m) return null;
  try {
    const arr = JSON.parse(m[1]!) as unknown[];
    return typeof arr[0] === "string" ? [arr[0], (arr[1] ?? {}) as Record<string, unknown>] : null;
  } catch {
    return null;
  }
}

function tapSocket(page: Page, wire: Wire): void {
  page.on("websocket", (ws) => {
    if (!ws.url().includes("/socket.io/")) return;
    ws.on("framereceived", ({ payload }) => {
      const f = parseFrame(payload);
      if (f) wire.in(f[0], f[1]);
    });
    ws.on("framesent", ({ payload }) => {
      const f = parseFrame(payload);
      if (f) wire.out(f[0], f[1]);
    });
  });
}

export interface CueTable extends Table {
  game: CueGame;
  wire: Wire;
  /** WebGL (3D) table, or the SVG one. */
  gl: boolean;
  /** Shots this player fired through the UI (all matches of the test). */
  myShots: number;
  /** The felt's box once the table was brought on screen (see frameTable). */
  framedBox: string | null;
  /** Full document loads of the page (1 = no reload behind the player's back). */
  loads: () => number;
  /** When the table became usable — epoch ms (0 for 2D: it draws with the first state). */
  usableAt: number;
}

interface E2EWindow {
  __asoE2E?: { cue?: CueE2E };
}

export interface OpenOptions {
  /** `prefers-reduced-motion: reduce` (a real player setting). For the
   *  software-rendered 3D table: the decorative hall backdrop freezes, the
   *  table itself still renders its full pipeline. */
  reducedMotion?: boolean;
  /** Viewport instead of the project's (fewer pixels per software frame). */
  viewport?: { width: number; height: number };
}

/** `openGame` (fresh player, rules closed by their button, bot match live),
 *  with the page's socket tapped from its very first frame. */
export async function openCueGame(
  browser: Browser,
  baseURL: string,
  game: CueGame,
  opts: OpenOptions = {},
): Promise<CueTable> {
  const wire = new Wire();
  let loads = 0;
  const tapped = new Proxy(browser, {
    get(target, prop) {
      if (prop === "newContext") {
        return async (options?: Parameters<Browser["newContext"]>[0]) => {
          const ctx = await target.newContext({
            ...options,
            ...(opts.reducedMotion ? { reducedMotion: "reduce" as const } : {}),
            ...(opts.viewport ? { viewport: opts.viewport } : {}),
          });
          ctx.on("page", (page) => {
            tapSocket(page, wire);
            page.on("load", () => (loads += 1));
          });
          return ctx;
        };
      }
      const v: unknown = Reflect.get(target, prop, target);
      return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(target) : v;
    },
  });
  const t = await openGame(tapped, baseURL, game);
  await expect
    .poll(() => wire.match().length, { message: "no game:state on the socket" })
    .toBeGreaterThan(0);
  await expect(cueTable(t.page)).toBeVisible();
  const gl = (await cueTable(t.page).getAttribute("data-renderer")) === "gl";
  if (gl) {
    // The three.js table loads lazily; its projection appears once it is up.
    await t.page.waitForFunction(
      () => !!(window as unknown as E2EWindow).__asoE2E?.cue?.toClient,
      null,
      {
        timeout: 90_000,
        polling: 500,
      },
    );
  }
  // 2D draws with the first state; the 3D table only once its renderer is up.
  const usableAt = gl ? Date.now() : 0;
  return { ...t, game, wire, gl, myShots: 0, framedBox: null, loads: () => loads, usableAt };
}

// ── table geometry (felt ↔ screen, exactly as the view computes it) ────────

export const cueTable = (page: Page): Locator => page.getByTestId("cue-table");
export const feltOf = (page: Page): Locator =>
  page.locator('[data-table="svg"], [data-table="gl"]');

type Box = { x: number; y: number; width: number; height: number };
const centre = (b: Box): Pt => ({
  x: Math.round(b.x + b.width / 2),
  y: Math.round(b.y + b.height / 2),
});

interface Framed {
  snap: Snapshot;
  /** Per requested felt point: its integer pixel and the felt point the table
   *  itself computes for a pointer event there. */
  mapped: { px: Pt; felt: Pt }[];
  /** Every shot control's box (null when not shown). */
  boxes: Record<string, Box | null>;
  /** The spin pad's value right now (it keeps the player's last setting). */
  spin: Pt;
}

/**
 * Everything a shot needs from the page, in ONE round trip (each costs 1–2 s
 * on the software-rendered 3D table): the cue block brought on screen, the
 * table's state, the integer pixel over each felt point together with the
 * felt point a pointer event there yields (2D: the SVG rect; 3D: the same
 * raycast as aiming) — so the planned shot is exactly what a click there
 * makes — and the boxes of the controls.
 */
async function frameAndMap(page: Page, pts: Pt[]): Promise<Framed> {
  return page.evaluate(
    ([list, w, h]) => {
      const block = document.querySelector('[data-testid="cue-table"]');
      const br = block?.getBoundingClientRect();
      // The block fits the viewport (cue-table.css caps it): put it all on screen.
      if (br && (br.top < 0 || br.bottom > innerHeight)) {
        block!.scrollIntoView({ block: br.height <= innerHeight ? "center" : "start" });
      }
      const p = document.querySelector('[data-testid="match-probe"]');
      const fb = document
        .querySelector('[data-table="svg"], [data-table="gl"]')
        ?.getBoundingClientRect();
      const snap = {
        phase: p?.getAttribute("data-phase") ?? null,
        myTurn: p?.getAttribute("data-my-turn") === "true",
        legal: Number(p?.getAttribute("data-legal") ?? "0"),
        ready: block?.getAttribute("data-ready") === "true",
        shot: block?.getAttribute("data-shot") ?? null,
        box: fb ? [fb.left, fb.top, fb.width, fb.height].join(",") : "",
      };
      const cue = (window as unknown as E2EWindow).__asoE2E?.cue;
      const gl = document.querySelector('[data-table="gl"]');
      const r = document.querySelector('[data-table="svg"]')?.getBoundingClientRect();
      const toClient = (x: number, y: number): Pt => {
        if (gl) return cue!.toClient!(x, y)!;
        return { x: r!.left + (x / w) * r!.width, y: r!.top + (y / h) * r!.height };
      };
      const toFelt = (x: number, y: number): Pt => {
        if (gl) return cue!.toWorld!(x, y)!;
        return { x: ((x - r!.left) / r!.width) * w, y: ((y - r!.top) / r!.height) * h };
      };
      const mapped = list.map((q) => {
        const c = toClient(q.x, q.y);
        const px = { x: Math.round(c.x), y: Math.round(c.y) };
        return { px, felt: toFelt(px.x, px.y) };
      });
      const box = (sel: string) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const b = el.getBoundingClientRect();
        return { x: b.left, y: b.top, width: b.width, height: b.height };
      };
      const boxes: Record<string, { x: number; y: number; width: number; height: number } | null> =
        {
          place: box('[data-action="place-cue"]'),
          shoot: box('[data-action="shoot"]'),
          power: box('[data-control="power"]'),
          spin: box('[data-control="spin"]'),
          push: box('[data-action="push-out"]'),
        };
      for (let i = 0; i < 6; i++) boxes[`pocket${i}`] = box(`[data-pocket="${i}"]`);
      const pad = document.querySelector('[data-control="spin"]');
      const spin = {
        x: Number(pad?.getAttribute("data-spin-x") ?? "0"),
        y: Number(pad?.getAttribute("data-spin-y") ?? "0"),
      };
      return { snap, mapped, boxes, spin };
    },
    [pts, TABLE.w, TABLE.h] as const,
  );
}

/** One round trip: the felt point the table computes for each (integer) pixel. */
async function feltUnder(page: Page, pxs: Pt[]): Promise<Pt[]> {
  if (pxs.length === 0) return [];
  return page.evaluate(
    ([list, w, h]) => {
      const cue = (window as unknown as E2EWindow).__asoE2E?.cue;
      const gl = document.querySelector('[data-table="gl"]');
      const r = document.querySelector('[data-table="svg"]')?.getBoundingClientRect();
      return list.map((p) =>
        gl
          ? cue!.toWorld!(p.x, p.y)!
          : { x: ((p.x - r!.left) / r!.width) * w, y: ((p.y - r!.top) / r!.height) * h },
      );
    },
    [pxs, TABLE.w, TABLE.h] as const,
  );
}

/** The point on the shot line farthest inside the felt — the farther the
 *  click, the finer one pixel of mouse turns the aim — but off the pocket
 *  holes (on the 8 a press on a hole calls that pocket instead of aiming). */
function farPoint(from: Pt, angle: number): Pt {
  const m = 0.03;
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  let d = 2;
  if (dx > 1e-9) d = Math.min(d, (TABLE.w - m - from.x) / dx);
  else if (dx < -1e-9) d = Math.min(d, (m - from.x) / dx);
  if (dy > 1e-9) d = Math.min(d, (TABLE.h - m - from.y) / dy);
  else if (dy < -1e-9) d = Math.min(d, (m - from.y) / dy);
  const nearHole = (dd: number) =>
    POCKETS.some(
      ([px, py]) => Math.hypot(from.x + dx * dd - px, from.y + dy * dd - py) < TABLE.pocketR * 1.6,
    );
  while (d > 0.12 && nearHole(d)) d -= 0.01;
  d = Math.max(0.06, d);
  return { x: from.x + dx * d, y: from.y + dy * d };
}

interface Snapshot {
  phase: string | null;
  myTurn: boolean;
  legal: number;
  ready: boolean;
  shot: string | null;
  box: string;
}

/** Probe + table + felt box in one round trip. */
async function snapshot(page: Page): Promise<Snapshot> {
  return page.evaluate(() => {
    const p = document.querySelector('[data-testid="match-probe"]');
    const root = document.querySelector('[data-testid="cue-table"]');
    const b = document
      .querySelector('[data-table="svg"], [data-table="gl"]')
      ?.getBoundingClientRect();
    return {
      phase: p?.getAttribute("data-phase") ?? null,
      myTurn: p?.getAttribute("data-my-turn") === "true",
      legal: Number(p?.getAttribute("data-legal") ?? "0"),
      ready: root?.getAttribute("data-ready") === "true",
      shot: root?.getAttribute("data-shot") ?? null,
      box: b ? [b.left, b.top, b.width, b.height].join(",") : "",
    };
  });
}

/** Bring the whole cue block (felt + controls) on screen, once: no later
 *  action may scroll the felt away from the pixels a shot was planned with.
 *  Scrolled in the page itself (one round trip): Playwright's
 *  scrollIntoViewIfNeeded waits for the box to hold still over animation
 *  frames, which takes tens of seconds on a software-rendered GPU. */
async function frameTable(t: CueTable): Promise<Snapshot> {
  const s = await t.page.evaluate(() => {
    const block = document.querySelector('[data-testid="cue-table"]');
    const r = block?.getBoundingClientRect();
    // The block fits the viewport (cue-table.css caps it): put it all on screen.
    if (r && (r.top < 0 || r.bottom > innerHeight)) {
      block!.scrollIntoView({ block: r.height <= innerHeight ? "center" : "start" });
    }
    const p = document.querySelector('[data-testid="match-probe"]');
    const b = document
      .querySelector('[data-table="svg"], [data-table="gl"]')
      ?.getBoundingClientRect();
    return {
      phase: p?.getAttribute("data-phase") ?? null,
      myTurn: p?.getAttribute("data-my-turn") === "true",
      legal: Number(p?.getAttribute("data-legal") ?? "0"),
      ready: block?.getAttribute("data-ready") === "true",
      shot: block?.getAttribute("data-shot") ?? null,
      box: b ? [b.left, b.top, b.width, b.height].join(",") : "",
    };
  });
  t.framedBox = s.box;
  return s;
}

// ── turns ───────────────────────────────────────────────────────────────────

/** My turn on the table itself: the server says so (probe: my turn, legal
 *  moves), the shot animation is over and no action is in flight. False when
 *  the match ended first. The bot must keep the table moving meanwhile. */
export async function waitCueTurn(page: Page, timeout = 150_000): Promise<boolean> {
  let state = "wait";
  await expect
    .poll(
      async () => {
        const s = await snapshot(page);
        state = s.phase === "over" ? "over" : s.myTurn && s.legal > 0 && s.ready ? "ready" : "wait";
        return state;
      },
      {
        timeout,
        intervals: [100, 250, 500],
        message: "my turn never came back (bot or animation stuck)",
      },
    )
    .not.toBe("wait");
  return state === "ready";
}

async function shotLogs(page: Page): Promise<CueShotLog[]> {
  return page.evaluate(() => (window as unknown as E2EWindow).__asoE2E?.cue?.shots ?? []);
}

/** Wait until the client's replay of `shotNo` is over (or a newer shot cut it). */
async function replayOf(page: Page, shotNo: number, timeout = 60_000): Promise<CueShotLog> {
  let found: CueShotLog | undefined;
  await expect
    .poll(
      async () => {
        const logs = await shotLogs(page);
        found = logs.filter((s) => s.shotNo === shotNo).at(-1);
        if (!found) return "none";
        return found.endedAt > 0 || logs.some((s) => s.startedAt > found!.startedAt)
          ? "done"
          : "running";
      },
      { timeout, message: `replay of shot ${shotNo}` },
    )
    .toBe("done");
  return found!;
}

/** Wait for a state of the current match matching `pred`. */
async function wireState(
  t: CueTable,
  pred: (s: WireState) => boolean,
  timeout = 15_000,
): Promise<WireState> {
  let hit: WireState | undefined;
  await expect
    .poll(() => (hit = t.wire.match().find(pred)) !== undefined, {
      timeout,
      message: "expected server state",
    })
    .toBe(true);
  return hit!;
}

// ── planning a shot with the server's own engine ───────────────────────────

export interface Plan {
  /** Exactly what the client will send (angle from the click pixel). */
  action: Shoot;
  aimPx: Pt;
  placePx?: Pt;
  good: boolean;
  /** The controls' boxes, read with the plan (the page did not move since). */
  boxes: Record<string, Box | null>;
  /** The spin pad's value when planning (it keeps the last setting). */
  spinNow: Pt;
}

const roundPower = (p: number): number =>
  Math.min(POWER_MAX, Math.max(POWER_MIN, Math.round(p * 100) / 100));

function simulate(game: CueGame, st: CueStateX, seat: number, a: Shoot): Outcome | null {
  const engine = ENGINES[game];
  if (!engine.validate!(st, seat, a)) return null;
  return engine.reduce(st, a, new SeededRng("e2e")) as Outcome;
}

const isGood = (o: Outcome, seat: number): boolean =>
  o.state.winner === seat ||
  (o.state.winner === null && o.state.turn === seat && !o.events.some((e) => e.type === "FOUL"));

/**
 * The first of the engine's candidate shots (the bot's own ghost-ball aims)
 * that a local simulation says pots legally — else a nearby variant that does
 * (aim pixel ± a few, power ± 0.08) — else the first valid one; turned into
 * screen pixels in a few round trips (placements, aims, nudged aims).
 */
export async function planShot(t: CueTable, extra: Partial<Shoot> = {}, depth = 0): Promise<Plan> {
  const { page, wire } = t;
  const st = wire.last().state;
  const seat = wire.seat;
  const cands = ENGINES[t.game].legalActions(st, seat) as Shoot[];
  const cue = st.balls.find((b) => b.id === 0 && !b.potted);
  const cuePt: Pt = cue ? { x: cue.x, y: cue.y } : { x: 0.5, y: TABLE.h / 2 };
  // Ball in hand in pool after a foul: the engine's candidates shoot from where
  // the cue ball lies — the player still places it (on that very spot) through
  // „Постави бялата“, so the placement path is exercised beyond the break.
  const placeHere = st.ballInHand && t.game !== "SNOOKER" && st.shotNo > 0;
  const placing = cands.map((c) => (c.cueX !== undefined && c.cueY !== undefined) || placeHere);
  const origin = cands.map(
    (c): Pt => (c.cueX !== undefined && c.cueY !== undefined ? { x: c.cueX, y: c.cueY } : cuePt),
  );
  const placeList = origin.filter((_, i) => placing[i]);
  // One round trip: frame the table, read it, map every pixel, measure controls.
  const fr = await frameAndMap(page, [
    ...placeList,
    ...cands.map((c, i) => farPoint(origin[i]!, c.angle)),
  ]);
  t.framedBox = fr.snap.box;
  // The socket frames and the table must describe the same moment.
  if (
    String(st.shotNo) !== fr.snap.shot ||
    wire.last().turn !== seat ||
    wire.last().state.shotNo !== st.shotNo
  ) {
    await expect
      .poll(
        () => {
          const s2 = wire.last();
          return s2.turn === seat && String(s2.state.shotNo) === fr.snap.shot;
        },
        { message: "socket and table disagree about the turn" },
      )
      .toBe(true);
    if (depth > 1) throw new Error("the table kept changing while planning");
    return planShot(t, extra, depth + 1);
  }
  const all = fr.mapped;
  let k = 0;
  const place = cands.map((_, i) => (placing[i] ? all[k++]! : null));
  const from = place.map((p) => (p ? p.felt : cuePt));
  const aims = all.slice(placeList.length);

  /** The exact action a press at felt point `at` (and this power) sends. */
  const build = (i: number, at: Pt, power: number): Shoot => {
    const c = cands[i]!;
    const f = from[i]!;
    const action: Shoot = {
      type: "SHOOT",
      angle: Math.atan2(at.y - f.y, at.x - f.x) + 0, // `+ 0`: −0 travels as 0 in JSON
      power,
      shotNo: st.shotNo,
    };
    if (place[i]) {
      action.cueX = f.x;
      action.cueY = f.y;
    }
    if (c.spinX !== undefined || c.spinY !== undefined) {
      action.spinX = c.spinX ?? 0;
      action.spinY = c.spinY ?? 0;
    }
    if (c.pocket !== undefined) action.pocket = c.pocket;
    return Object.assign(action, extra);
  };

  let fallback: Plan | null = null;
  for (let i = 0; i < cands.length; i++) {
    const action = build(i, aims[i]!.felt, roundPower(cands[i]!.power));
    const o = simulate(t.game, st, seat, action);
    if (!o) continue;
    const plan: Plan = {
      action,
      aimPx: aims[i]!.px,
      placePx: place[i]?.px,
      good: isGood(o, seat),
      boxes: fr.boxes,
      spinNow: fr.spin,
    };
    if (plan.good) return plan;
    fallback ??= plan;
  }
  if (!fallback) throw new Error(`no valid shot for ${JSON.stringify(cands)}`);
  // After a push-out the opponent decides — nothing to improve. On the
  // software-rendered 3D table every round trip costs the clock: no search.
  if (extra.pushOut || t.gl) return fallback;

  // Nudge the aim a few pixels (and the power) around every candidate: the
  // simulation is exact, so a variant that pots is a sure thing.
  const r = 3;
  const nudges: Pt[] = [];
  for (let dx = -r; dx <= r; dx++)
    for (let dy = -r; dy <= r; dy++) if (dx || dy) nudges.push({ x: dx, y: dy });
  const pxs = cands.flatMap((_, i) =>
    nudges.map((n) => ({ x: aims[i]!.px.x + n.x, y: aims[i]!.px.y + n.y })),
  );
  const felts = await feltUnder(page, pxs);
  for (let i = 0; i < cands.length; i++) {
    for (let n = 0; n < nudges.length; n++) {
      const j = i * nudges.length + n;
      for (const dp of [0, -0.08, 0.08]) {
        const action = build(i, felts[j]!, roundPower(cands[i]!.power + dp));
        const o = simulate(t.game, st, seat, action);
        if (o && isGood(o, seat))
          return {
            action,
            aimPx: pxs[j]!,
            placePx: place[i]?.px,
            good: true,
            boxes: fr.boxes,
            spinNow: fr.spin,
          };
      }
    }
  }
  return fallback;
}

// ── playing a shot through the controls ─────────────────────────────────────

export interface ShotStyle {
  /** How the shot is fired: the „Удар“ button (a click, or a double click —
   *  still exactly one shot may leave), or Space with the power slider focused. */
  via: "button" | "double" | "space";
  /** Intermediate pointer moves for every hand movement (a person never jumps). */
  steps?: number;
  /** Also touch the spin pad when the shot needs no spin (mouse, then Home). */
  spinWorkout?: boolean;
  /** Regression: drag the spin point past the rim on the diagonal and shoot with it. */
  rimSpin?: boolean;
  /** Canvas path only, fewest round trips (the software-rendered 3D table):
   *  place / aim / power by single presses, the values read back once. */
  lean?: boolean;
}

const attr = async (l: Locator, name: string): Promise<string | null> => l.getAttribute(name);

/** Pixel of a spin-pad point (viewBox −1.25..1.25, screen up = +y). */
function padPx(
  box: { x: number; y: number; width: number; height: number },
  u: number,
  v: number,
): Pt {
  return {
    x: Math.round(box.x + ((u + 1.25) / 2.5) * box.width),
    y: Math.round(box.y + ((1.25 - v) / 2.5) * box.height),
  };
}

async function spinOf(pad: Locator): Promise<Pt> {
  return { x: Number(await attr(pad, "data-spin-x")), y: Number(await attr(pad, "data-spin-y")) };
}

async function press(page: Page, p: Pt, steps: number): Promise<void> {
  await page.mouse.move(p.x, p.y, { steps });
  await page.mouse.down();
  await page.mouse.up();
}

/** Spin by mouse (press near the point) and then exactly by keyboard. */
async function setSpin(page: Page, want: Pt, steps: number, workout: boolean): Promise<void> {
  const pad = page.locator('[data-control="spin"]');
  const box = (await pad.boundingBox())!;
  if (want.x !== 0 || want.y !== 0 || workout) {
    const probeAt = want.x !== 0 || want.y !== 0 ? want : { x: 0.4, y: 0.3 };
    await press(page, padPx(box, probeAt.x, probeAt.y), steps);
    const got = await spinOf(pad);
    expect(Math.abs(got.x - probeAt.x), "spin pad (mouse) x").toBeLessThan(0.12);
    expect(Math.abs(got.y - probeAt.y), "spin pad (mouse) y").toBeLessThan(0.12);
  }
  // Keyboard: Home centres, arrows move by 0.1.
  await pad.focus();
  await page.keyboard.press("Home");
  for (let i = 0; i < Math.round(Math.abs(want.y) * 10); i++)
    await page.keyboard.press(want.y > 0 ? "ArrowUp" : "ArrowDown");
  for (let i = 0; i < Math.round(Math.abs(want.x) * 10); i++)
    await page.keyboard.press(want.x > 0 ? "ArrowRight" : "ArrowLeft");
  await expect.poll(() => spinOf(pad), { message: "spin pad (keyboard)" }).toEqual(want);
}

/** Drag the spin point from the centre past the rim on the 45° diagonal —
 *  the direction whose rounded value the server used to reject. */
async function rimSpin(page: Page, steps: number): Promise<Pt> {
  const pad = page.locator('[data-control="spin"]');
  const box = (await pad.boundingBox())!;
  const c = padPx(box, 0, 0);
  const rim = padPx(box, 0.85, 0.85); // |(0.85, 0.85)| = 1.2 > 1
  await page.mouse.move(c.x, c.y, { steps });
  await page.mouse.down();
  await page.mouse.move(rim.x, rim.y, { steps: Math.max(4, steps) });
  await page.mouse.up();
  const got = await spinOf(pad);
  expect(Math.hypot(got.x, got.y), "rim spin stays on the rim").toBeGreaterThan(0.97);
  expect(
    got.x * got.x + got.y * got.y,
    "rim spin inside the disk the server accepts",
  ).toBeLessThanOrEqual(1 + 1e-9);
  return got;
}

/** Track pixel for a power value (the thumb centre runs inset by ~half a thumb). */
function powerPx(box: { x: number; y: number; width: number; height: number }, want: number): Pt {
  const frac = (want - POWER_MIN) / (POWER_MAX - POWER_MIN);
  return {
    x: Math.round(box.x + 8 + frac * (box.width - 16)),
    y: Math.round(box.y + box.height / 2),
  };
}

/** Power by mouse (a click on the track) and then exactly by arrow keys. */
async function setPower(page: Page, want: number, steps: number, aim: string): Promise<void> {
  const slider = page.locator('[data-control="power"]');
  const box = (await slider.boundingBox())!;
  // The hand travels from the felt to the slider — the aim must stay put.
  const p = powerPx(box, want);
  await page.mouse.move(p.x, p.y, { steps });
  await expect(
    cueTable(page),
    "moving the mouse to the controls re-aimed the shot",
  ).toHaveAttribute("data-aim", aim);
  await page.mouse.down();
  await page.mouse.up();
  const clicked = Number(await slider.inputValue());
  expect(Math.abs(clicked - want), "power slider (mouse)").toBeLessThan(0.06);
  for (let i = 0; i < 20; i++) {
    const v = Number(await slider.inputValue());
    if (Math.abs(v - want) < 1e-9) break;
    await page.keyboard.press(v < want ? "ArrowRight" : "ArrowLeft");
  }
  await expect(slider, "power slider (keyboard)").toHaveValue(String(want));
}

/** What the controls show, in one round trip. */
async function controlValues(page: Page) {
  return page.evaluate(() => {
    const root = document.querySelector('[data-testid="cue-table"]')!;
    const pad = document.querySelector('[data-control="spin"]')!;
    const slider = document.querySelector('[data-control="power"]') as HTMLInputElement;
    return {
      aim: Number(root.getAttribute("data-aim")),
      placing: root.getAttribute("data-placing"),
      canShoot: root.getAttribute("data-can-shoot"),
      power: Number(slider.value),
      spinX: Number(pad.getAttribute("data-spin-x")),
      spinY: Number(pad.getAttribute("data-spin-y")),
      pocket:
        document.querySelector('[data-pocket][aria-checked="true"]')?.getAttribute("data-pocket") ??
        null,
      push:
        document.querySelector('[data-action="push-out"]')?.getAttribute("aria-pressed") ?? null,
    };
  });
}

/**
 * The canvas path with the fewest round trips (software-rendered 3D table):
 * the control boxes are read once, every step is a raw pointer event, the
 * values the controls ended up with are read back once and become the shot.
 */
async function setUpLean(
  t: CueTable,
  plan: Plan,
  action: Shoot,
): Promise<Record<string, Box | null>> {
  const { page } = t;
  const boxes = plan.boxes;
  const need = (k: string): Box => {
    const b = boxes[k];
    if (!b) throw new Error(`control "${k}" is not on the table`);
    return b;
  };
  // A click = one call (move, down, up): the same pointer events as a press.
  const click = async (p: Pt) => page.mouse.click(p.x, p.y);
  if (plan.placePx) {
    await click(centre(need("place")));
    await click(plan.placePx);
  }
  await click(plan.aimPx);
  await click(powerPx(need("power"), action.power));
  const wantSpin = action.spinX !== undefined;
  if (wantSpin) await click(padPx(need("spin"), action.spinX!, action.spinY ?? 0));
  else if (plan.spinNow.x !== 0 || plan.spinNow.y !== 0) {
    // The pad keeps the last shot's spin: a double click centres it exactly.
    const c = centre(need("spin"));
    await page.mouse.dblclick(c.x, c.y);
  }
  if (action.pocket !== undefined) await click(centre(need(`pocket${action.pocket}`)));
  if (action.pushOut) await click(centre(need("push")));
  const v = await controlValues(page);
  if (plan.placePx) expect(v.placing, "the cue ball was not placed").toBe("false");
  expect(Math.abs(v.aim - action.angle), "a press on the canvas did not aim there").toBeLessThan(
    1e-9,
  );
  action.angle = v.aim + 0;
  action.power = v.power;
  if (wantSpin) {
    action.spinX = v.spinX;
    action.spinY = v.spinY;
  } else {
    expect([v.spinX, v.spinY], "the spin pad was not centred").toEqual([0, 0]);
  }
  if (action.pocket !== undefined) expect(v.pocket, "pocket button").toBe(String(action.pocket));
  if (action.pushOut) expect(v.push, "push-out toggle").toBe("true");
  expect(v.canShoot, "the table does not let the shot go").toBe("true");
  return boxes;
}

/**
 * Play the planned shot through the controls and verify, end to end, that the
 * server played exactly it and that client and server agree on the result.
 */
export async function playShot(t: CueTable, plan: Plan, style: ShotStyle): Promise<WireState> {
  const { page, wire } = t;
  const root = cueTable(page);
  const lean = style.lean === true;
  const steps = style.steps ?? 8;
  const st = wire.last().state;
  const seat = wire.seat;
  const action: Shoot = { ...plan.action };
  const slider = page.locator('[data-control="power"]');
  let boxes: Record<string, Box | null> | null = null;

  if (lean) {
    boxes = await setUpLean(t, plan, action);
  } else {
    // 1. Ball in hand: „Постави бялата“, then a press on the felt.
    if (plan.placePx) {
      await page.locator('[data-action="place-cue"]').click();
      await expect(root).toHaveAttribute("data-placing", "true");
      await press(page, plan.placePx, steps);
      await expect(root, "the cue ball was not placed").toHaveAttribute("data-placing", "false");
    }

    // 2. Aim: hovering must not aim; a press on the felt does. The value is
    // the browser's own atan2 (engines differ in the last bit — it only feeds
    // the shot the client SENDS, which the server takes verbatim).
    const aimBefore = (await attr(root, "data-aim")) ?? "";
    await page.mouse.move(plan.aimPx.x, plan.aimPx.y, { steps });
    await expect(root, "hovering the felt re-aimed the shot").toHaveAttribute(
      "data-aim",
      aimBefore,
    );
    await press(page, plan.aimPx, steps);
    const aimed = Number(await attr(root, "data-aim"));
    expect(Math.abs(aimed - action.angle), "a press on the felt did not aim there").toBeLessThan(
      1e-9,
    );
    action.angle = aimed + 0;

    // 3. Power — a click on the track, then exact with the arrow keys.
    await setPower(page, action.power, steps, String(action.angle));

    // 4. Spin — mouse + keyboard (and the rim regression on request).
    if (style.rimSpin) {
      const sp = await rimSpin(page, steps);
      action.spinX = sp.x;
      action.spinY = sp.y;
    } else {
      await setSpin(
        page,
        { x: action.spinX ?? 0, y: action.spinY ?? 0 },
        steps,
        style.spinWorkout === true,
      );
    }

    // 5. 8-ball on the 8: call the pocket with its button; 9-ball: push-out.
    if (action.pocket !== undefined) {
      await expect(root).toHaveAttribute("data-must-call", "true");
      const btn = page.locator(`[data-pocket="${action.pocket}"]`);
      await btn.click();
      await expect(btn).toHaveAttribute("aria-checked", "true");
    }
    if (action.pushOut) {
      const push = page.locator('[data-action="push-out"]');
      await push.click();
      await expect(push).toHaveAttribute("aria-pressed", "true");
    }
    await expect(root).toHaveAttribute("data-can-shoot", "true");
    // The controls must still show exactly this shot.
    await expect(root).toHaveAttribute("data-aim", String(action.angle));
  }
  if (action.spinX === 0 && action.spinY === 0) {
    delete action.spinX;
    delete action.spinY;
  }

  // 6. Fire.
  const before = await stateVersion(page);
  const sentAt = wire.sent.length;
  if (style.via === "space") {
    // Space right after the slider (focus stays on it) — it used to be swallowed.
    if (!lean) await slider.focus();
    await page.keyboard.press("Space");
  } else if (style.via === "double") {
    // A double click used to fire two SHOOTs before the answer came back.
    await page.locator('[data-action="shoot"]').dblclick();
  } else if (boxes) {
    const c = centre(boxes.shoot!);
    await page.mouse.click(c.x, c.y);
  } else {
    await page.locator('[data-action="shoot"]').click();
  }
  await expectServerAdvanced(page, before, lean ? 30_000 : 10_000);
  t.myShots += 1;
  if (style.via === "double") await page.waitForTimeout(300); // a stray 2nd emit would show by now

  // 7. The client sent exactly the shot on the controls (once)…
  await expect.poll(() => wire.sent.length).toBeGreaterThan(sentAt);
  expect(wire.sent.slice(sentAt).map((s) => s.action)).toEqual([action]);
  // …and the server played it: its next state equals the engine run locally.
  const answer = await wireState(t, (s) => s.state.shotNo === st.shotNo + 1);
  expect(answer.state.lastShot).toMatchObject({
    angle: action.angle,
    power: action.power,
    ...(action.spinX !== undefined ? { spinX: action.spinX, spinY: action.spinY } : {}),
  });
  const local = simulate(t.game, st, seat, action);
  expect(local, "the shot the UI sent is valid for the engine").not.toBeNull();
  expectSameTable(answer.state, local!.state);
  expect(wire.errors, "the server rejected an action").toEqual([]);

  // 8. The client replays it to the same resting places, in real time.
  await expectReplayMatches(t, answer);
  return answer;
}

/** Server state == local engine result (balls bit for bit + the rules). */
export function expectSameTable(server: CueStateX, local: CueStateX): void {
  const balls = (s: CueStateX) =>
    [...s.balls].sort((a, b) => a.id - b.id).map((b) => [b.id, b.potted, b.x, b.y]);
  expect(balls(server), "resting balls: server vs local engine").toEqual(balls(local));
  const rules = (s: CueStateX) => ({
    phase: s.phase,
    winner: s.winner,
    message: s.message,
    ballInHand: s.ballInHand,
    groups: s.groups,
    open: s.open,
    scores: s.scores,
    expect: s.expect,
    lastShotMs: s.lastShotMs,
    fouls: s.fouls,
    pushAvail: s.pushAvail,
    pushDecision: s.pushDecision,
    freeBall: s.freeBall,
    freeColour: s.freeColour,
    miss: s.miss,
    foulChoice: s.foulChoice,
    // Snooker's re-spotted black decides the next striker by lot (server RNG).
    turn: s.message === "respotBlack" ? "lot" : s.turn,
  });
  expect(rules(server)).toEqual(rules(local));
}

/**
 * The client's replay of this shot: the same frames the server's physics
 * produced (last frame = the server's resting balls), lasting `lastShotMs`
 * (2D; the software-rendered 3D table only ever drops frames).
 */
async function expectReplayMatches(t: CueTable, answer: WireState): Promise<void> {
  const ls = answer.state.lastShot!;
  const sim = runShot(ls.before, {
    angle: ls.angle,
    power: ls.power,
    spinX: ls.spinX,
    spinY: ls.spinY,
  });
  const final = sim.frames.at(-1)!.balls;
  const log = await replayOf(t.page, answer.state.shotNo);
  expect(log.frames, "replay frame count").toBe(sim.frames.length);
  expect(log.final, "client replay ends where the server's simulation does").toEqual(final);
  for (const b of final) {
    if (b.id === 0 && answer.state.message === "respotBlack") continue;
    const s = answer.state.balls.find((x) => x.id === b.id)!;
    expect([s.potted, s.x, s.y], `ball ${b.id}: client replay vs server`).toEqual([
      false,
      b.x,
      b.y,
    ]);
  }
  if (!t.gl && log.endedAt > 0) {
    // Real time: never shorter than the physics, and done within the margin
    // the server leaves before the bot's next shot (lastShotMs + 800 ms) —
    // the old tick-per-frame replay ran 2–3× longer and was cut off.
    const took = log.endedAt - log.startedAt;
    const ms = answer.state.lastShotMs ?? 0;
    const msg = `replay of shot ${answer.state.shotNo} lasted ${took} ms, server says ${ms} ms`;
    expect(took, msg).toBeGreaterThanOrEqual(ms - 50);
    expect(took, msg).toBeLessThan(ms + BOT_MARGIN_MS);
  }
}

/**
 * At the start of my turn (after a shot was replayed): the server extended
 * the clock by the shot's real-time length, so a full turn is left once the
 * balls stop — on the wire, in the client's replay log and (2D) on screen.
 */
export async function expectFullClockAfterReplay(t: CueTable): Promise<void> {
  const { page, wire } = t;
  const cur = wire.last();
  if (cur.turn !== wire.seat || !cur.turnEndsAt) return;
  const turnMs = turnSecondsFor(t.game) * 1000;
  const anim = cur.state.lastShotMs ?? 0;
  expect(cur.turnMs, "turn clock = full turn + the previous shot's animation").toBe(turnMs + anim);
  // 3D: the rule above is exact; reading the replay log here would cost the
  // software-rendered table ~2 s of the very clock being checked.
  if (cur.state.shotNo === 0 || anim === 0 || t.gl) return;
  const log = (await shotLogs(page)).filter((s) => s.shotNo === cur.state.shotNo).at(-1);
  if (!log || log.endedAt === 0) return;
  // The software-rendered 3D table (swiftshader: 1–2 s per frame) both takes
  // the state and notices the end of the replay up to a frame late; the 2D
  // table within a few ms. The rule itself (turnMs above) is exact.
  const slack = t.gl ? 10_000 : 1500;
  expect(cur.turnEndsAt - log.endedAt, "time left when the balls stopped").toBeGreaterThan(
    turnMs - slack,
  );
  if (t.gl) return; // every extra round trip there costs ~2 s of the clock
  const clock = page.getByText(/Твой ход:\s*\d+/).first();
  const secs = Number(/(\d+)/.exec((await clock.textContent()) ?? "")?.[1] ?? "0");
  expect(secs, "visible turn clock").toBeGreaterThanOrEqual(turnSecondsFor(t.game) - 6);
}

/** 2D: no replay was cut short by the next shot (the bot waits for it) or skipped. */
export async function expectNoCutReplays(t: CueTable): Promise<void> {
  const logs = await shotLogs(t.page);
  const cut = logs.slice(0, -1).filter((s) => s.endedAt === 0);
  expect(
    cut.map((s) => s.shotNo),
    "replays cut off by the next shot",
  ).toEqual([]);
  // …and none was skipped: every shot of the match was shown.
  const logged = new Set(logs.map((s) => s.shotNo));
  const shots = [...new Set(t.wire.match().map((s) => s.state.shotNo))].filter((n) => n > 0);
  expect(
    shots.filter((n) => !logged.has(n)),
    "shots the table never replayed",
  ).toEqual([]);
}

/** After the animation the 2D felt shows the server's resting layout. */
export async function expectSvgMatchesServer(t: CueTable): Promise<void> {
  if (t.gl) return;
  const st = t.wire.last().state;
  const drawn = await t.page.evaluate(() =>
    [...document.querySelectorAll('[data-table="svg"] [data-ball]')].map((g) => {
      const c = g.querySelector("circle")!;
      return [
        Number(g.getAttribute("data-ball")),
        Number(c.getAttribute("cx")),
        Number(c.getAttribute("cy")),
      ];
    }),
  );
  const want = st.balls.filter((b) => !b.potted).map((b) => [b.id, b.x, b.y]);
  const byId = (a: number[], b: number[]) => a[0]! - b[0]!;
  expect(drawn.sort(byId), "2D felt vs server state").toEqual(want.sort(byId));
}

// ── whole matches ──────────────────────────────────────────────────────────

/** Snooker after a foul by the bot: the incoming player's choice buttons. */
export async function answerFoulChoice(t: CueTable): Promise<boolean> {
  const { page } = t;
  const st = t.wire.last().state;
  if (!st.foulChoice) return false;
  const replay = page.locator('[data-action="replay"]');
  const btn = (await replay.count()) > 0 ? replay : page.locator('[data-action="play-again"]');
  await expect(btn).toBeVisible();
  const before = await stateVersion(page);
  await btn.click();
  await expectServerAdvanced(page, before);
  const after = t.wire.last().state;
  expect(after.foulChoice).toBe(false);
  expect(after.turn, "the offender plays again").not.toBe(t.wire.seat);
  expect(t.wire.errors).toEqual([]);
  return true;
}

export interface MatchPlan {
  /** Own shots to fire at least (across matches — „Нова игра“ continues). */
  shots: number;
  /** Keep playing past `shots` until the match ends, up to this many shots. */
  untilOverMax?: number;
  /** How shot n is played. */
  style: (n: number) => ShotStyle;
  /** Wall-clock budget for going past `shots`. */
  budgetMs?: number;
}

export interface MatchReport {
  matchesOver: number;
  pushOuts: number;
  foulChoices: number;
  pocketCalls: number;
  placements: number;
  /** 3D: turns whose clock the renderer used up before the table was usable. */
  lostToLoading: number;
}

/** Wall-clock a lean (3D) turn needs on a busy software GPU: ~9 round trips. */
const LEAN_TURN_MS = 30_000;

/**
 * Play against the bot through the UI: wait for my turn (the bot must keep
 * the table moving), check the clock and the felt, answer a snooker foul
 * choice once, take a 9-ball push-out once, plan and play each shot. A match
 * that ends is checked (verdict card, „Нова игра“) and play goes on.
 */
export async function playMatch(t: CueTable, plan: MatchPlan): Promise<MatchReport> {
  const report: MatchReport = {
    matchesOver: 0,
    pushOuts: 0,
    foulChoices: 0,
    pocketCalls: 0,
    placements: 0,
    lostToLoading: 0,
  };
  const started = Date.now();
  const budget = plan.budgetMs ?? 150_000;
  for (;;) {
    const enough = t.myShots >= plan.shots;
    const more =
      plan.untilOverMax !== undefined &&
      t.myShots < plan.untilOverMax &&
      Date.now() - started < budget;
    if (enough && !more) break;
    const mine = await waitCueTurn(t.page);
    if (!mine) {
      report.matchesOver += 1;
      await playAgain(t); // verdict card + „Нова игра“ → a fresh match
      if (enough) break;
      continue;
    }
    if (t.gl) {
      // A turn that began while the 3D renderer was still coming up, with too
      // little clock left for a shot: the clock decides it (expectCleanWire
      // does not count such a turn); every later turn must be played in time.
      const cur = t.wire.last();
      const left = (cur.turnEndsAt ?? 0) - Date.now();
      const began = (cur.turnEndsAt ?? 0) - (cur.turnMs ?? 0);
      if (cur.turnEndsAt && began < t.usableAt && left < LEAN_TURN_MS) {
        report.lostToLoading += 1;
        await expect
          .poll(async () => (await snapshot(t.page)).ready, {
            timeout: left + 90_000,
            message: "the lost turn never ended",
          })
          .toBe(false);
        continue;
      }
    }
    await expectFullClockAfterReplay(t);
    await expectSvgMatchesServer(t);
    const st = t.wire.last().state;
    if (t.game === "SNOOKER" && st.foulChoice && report.foulChoices === 0) {
      report.foulChoices += 1;
      await answerFoulChoice(t);
      continue;
    }
    const extra: Partial<Shoot> = {};
    if (t.game === "NINEBALL" && st.pushAvail && report.pushOuts === 0) {
      extra.pushOut = true;
      report.pushOuts += 1;
    }
    const shot = await planShot(t, extra);
    if (shot.action.pocket !== undefined) report.pocketCalls += 1;
    if (shot.placePx) report.placements += 1;
    await playShot(t, shot, plan.style(t.myShots));
  }
  // The bot answers the last shot too: the table never stalls.
  if (!(await isOver(t.page))) await waitCueTurn(t.page);
  test.info().annotations.push({
    type: "cue",
    description: JSON.stringify({ myShots: t.myShots, ...report }),
  });
  return report;
}

/** Nothing went wrong behind the scenes: no rejected action, the page never
 *  reloaded itself (the PWA used to, on a player's first visit — the very
 *  visit every test makes) and — for a test that plays — never out of time. */
export function expectCleanWire(t: CueTable, opts: { idle?: boolean } = {}): void {
  expect(t.loads(), "the page reloaded by itself").toBe(1);
  expect(t.wire.errors, "server rejections").toEqual([]);
  if (opts.idle) return;
  // Every timeout of a turn that began once the table was usable. (The first
  // turn's clock starts with the match: on a software GPU the 3D renderer can
  // take most of it to come up before the player sees a table at all.)
  const lost: string[] = [];
  let strikes = 0;
  let turnStart = 0;
  for (const s of t.wire.states) {
    if (s.turn === t.wire.seat && s.turnEndsAt && s.turnMs) turnStart = s.turnEndsAt - s.turnMs;
    const now = s.timeoutStrikes ?? 0;
    if (now > strikes && turnStart >= t.usableAt) lost.push(`shot ${s.state.shotNo}`);
    strikes = now;
  }
  expect(lost, "my turn clock ran out").toEqual([]);
}

/** The match ended: verdict card, then its „Нова игра“ (play again) starts a fresh match. */
export async function playAgain(t: CueTable): Promise<void> {
  const { page, wire } = t;
  const old = wire.matchId;
  await expectGameOverCard(page);
  const card = page.locator(".cine-over__card");
  // The primary button: „Нова игра“ (game.playAgain) — first in the card.
  const again = card.getByRole("button").first();
  await expect(again).toHaveText(/Нова игра/);
  await expect(again).toBeInViewport();
  await again.click();
  await expect
    .poll(() => wire.matchId, { timeout: 45_000, message: "no new match after „Нова игра“" })
    .not.toBe(old);
  await expect(probe(page)).toHaveAttribute("data-phase", "playing", { timeout: 45_000 });
  await expect.poll(() => wire.match().length).toBeGreaterThan(0);
  t.framedBox = null;
  // A fresh match restarts shot numbers: start the replay log over.
  await page.evaluate(() => {
    const cue = (window as unknown as E2EWindow).__asoE2E?.cue;
    if (cue) cue.shots.length = 0;
  });
}

// ── visual / layout ─────────────────────────────────────────────────────────

/**
 * Screenshot + the layout facts that decide whether the table is playable,
 * read in one round trip: no sideways scrolling; the felt and every shot
 * control fully on screen TOGETHER and not covered by another layer; the
 * opponent's pill (name, snooker score) not under the live turn clock.
 */
export async function checkLayout(t: CueTable, info: TestInfo, name: string): Promise<void> {
  const { page } = t;
  t.framedBox = null;
  await frameTable(t);
  const path = info.outputPath(`${name}.png`);
  await page.screenshot({ path });
  await info.attach(name, { path, contentType: "image/png" });
  const facts = await page.evaluate(() => {
    const vw = innerWidth;
    const vh = innerHeight;
    const controls: Record<string, string> = {
      felt: '[data-table="svg"], [data-table="gl"]',
      power: '[data-control="power"]',
      spin: '[data-control="spin"]',
      shoot: '[data-action="shoot"]',
    };
    const seen: Record<string, { ratio: number; covered: boolean }> = {};
    for (const [key, sel] of Object.entries(controls)) {
      const el = document.querySelector(sel);
      if (!el) {
        seen[key] = { ratio: 0, covered: true };
        continue;
      }
      const r = el.getBoundingClientRect();
      const w = Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0));
      const h = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const hit =
        cx >= 0 && cy >= 0 && cx < vw && cy < vh ? document.elementFromPoint(cx, cy) : null;
      seen[key] = {
        ratio: Math.round(((w * h) / Math.max(1, r.width * r.height)) * 1000) / 1000,
        covered: !(hit && (hit === el || el.contains(hit))),
      };
    }
    // The clock layer is pointer-events:none (hit tests see through it):
    // compare the boxes of its visible badges with the opponent's pill.
    window.scrollTo(0, 0);
    const pill = document.querySelector('[data-testid="cue-opponent"]')!.getBoundingClientRect();
    const layer = document.querySelector('[data-testid="match-probe"]')?.parentElement;
    const clash = [...(layer?.children ?? [])]
      .filter((c) => c.getAttribute("data-testid") !== "match-probe")
      .map((c) => c.getBoundingClientRect())
      .filter(
        (b) =>
          b.width > 0 &&
          b.left < pill.right &&
          b.right > pill.left &&
          b.top < pill.bottom &&
          b.bottom > pill.top,
      )
      .map(
        (b) =>
          `${Math.round(b.left)},${Math.round(b.top)} ${Math.round(b.width)}×${Math.round(b.height)}`,
      );
    return { overflow: document.documentElement.scrollWidth - vw, seen, clash };
  });
  t.framedBox = null; // scrolled to the top for the pill check
  expect(facts.overflow, "horizontal overflow").toBeLessThanOrEqual(0);
  for (const [key, v] of Object.entries(facts.seen)) {
    expect(v.ratio, `${key} fully on screen together with the felt`).toBe(1);
    expect(v.covered, `${key} covered by another layer`).toBe(false);
  }
  // The normal table: the clock alone. After a timed-out turn a warning badge
  // stacks above it (a transient alert) — then the clock may sit lower.
  const last = t.wire.last();
  if ((last.timeoutStrikes ?? 0) > 0) {
    test.info().annotations.push({
      type: "cue-layout",
      description: `${name}: timeout warning shown — pill check skipped`,
    });
    return;
  }
  expect(facts.clash, "the turn clock covers the opponent's pill").toEqual([]);
}

/** The 3D canvas really shows a lit table (not a blank / single-colour frame):
 *  a good share of cloth-green pixels and real shading across the canvas. */
export async function expectTableDrawn(page: Page, info: TestInfo): Promise<void> {
  const canvas = page.locator('[data-table="gl"]');
  await expect(canvas).toBeVisible();
  let png: Buffer = Buffer.alloc(0);
  await expect
    .poll(
      async () => {
        png = await canvas.screenshot();
        const { data, info: meta } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
        let green = 0;
        let sum = 0;
        let sum2 = 0;
        const n = meta.width * meta.height;
        for (let i = 0; i < data.length; i += meta.channels) {
          const r = data[i]!;
          const g = data[i + 1]!;
          const b = data[i + 2]!;
          if (g > r + 25 && g > b + 10) green++;
          const l = 0.3 * r + 0.59 * g + 0.11 * b;
          sum += l;
          sum2 += l * l;
        }
        const sd = Math.sqrt(sum2 / n - (sum / n) ** 2);
        return green / n > 0.2 && sd > 12;
      },
      {
        timeout: 90_000,
        intervals: [1000, 2000, 4000],
        message: "the 3D table never rendered (blank canvas)",
      },
    )
    .toBe(true);
  await info.attach("3d-canvas", { body: png, contentType: "image/png" });
}
