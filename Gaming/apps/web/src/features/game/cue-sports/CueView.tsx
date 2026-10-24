import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  runShot,
  SOCKET_EVENTS,
  TABLE,
  type Ball,
  type CueState,
  type CueAction,
  type CueVariant,
} from "@aso/shared";
import { getSocket } from "../../../lib/socket";
import { useAuthStore, useMatchStore } from "../../../lib/store";
import { playCue } from "../../../lib/sound";
import { Button } from "../../../ui";
import { useEquippedCosmetic } from "../../shop/useEquippedCosmetic";
import { useMatch } from "../useMatch";
import { Scene, ScorePill } from "../scene/SceneShell";
import { CueTableGL, webglSupported, type CueTableHandle } from "./CueTableGL";
import type { CueScene } from "./glTable";
import { SpinPad, type Spin } from "./SpinPad";
import { animFrameAt, pocketForSlot, pocketHole, replayDecision, spaceShoots, type FocusTarget } from "./cueControls";
import { cueE2E, type CueShotLog } from "./e2eHook";
import "./cue-table.css";

type RBall = { id: number; x: number; y: number };

// Engine extras serialized on top of the shared CueState (see game-core cue.ts).
type CueStateX = CueState & {
  lastShotMs?: number;
  pushAvail?: boolean;
  pushDecision?: boolean;
  freeColour?: boolean;
  freeBall?: boolean;
  /** 9-ball: поредни фалове по място (2 = предупреждение). */
  fouls?: [number, number];
  /** Snooker: „фал и пропуск“ при последния удар. */
  miss?: boolean;
  /** Snooker: след фал входящият избира — играе / нарушителят пак. */
  foulChoice?: boolean;
  /** Snooker: при пропуск — може да поиска топките да се върнат. */
  missReplay?: unknown;
};
type CueActionX = (CueAction & { pushOut?: boolean }) | { type: "PASS" } | { type: "REPLAY" };

const POCKETS: [number, number][] = [
  [0, 0],
  [TABLE.w / 2, 0],
  [TABLE.w, 0],
  [0, TABLE.h],
  [TABLE.w / 2, TABLE.h],
  [TABLE.w, TABLE.h],
];

/** Стрелки за бутоните за обявяване на джоб — по ПОЗИЦИЯ НА ЕКРАНА (горе вляво …
 *  долу вдясно, като `cue.pockets.*`); джобът зад всяка е `pocketForSlot`. */
const POCKET_GLYPHS = ["↖", "↑", "↗", "↙", "↓", "↘"];

// Pool head string (break line) + snooker "D" — mirror the engine's limits.
const HEAD_STRING_X = 0.5;
const BAULK_X = 0.42;
const D_RADIUS = 0.18;

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
  if (id === 0) return "#f4f1e8";
  if (variant === "SNOOKER") {
    if (id >= 11 && id <= 25) return "#c0241f"; // reds
    return SNOOKER_HUES[id] ?? "#ccc";
  }
  if (id === 8) return "#15171a";
  const hue = id <= 7 ? id : id - 8; // 9..15 share 1..7 hues (stripes)
  return POOL_HUES[hue - 1] ?? "#ccc";
}
const isStripe = (id: number, variant: CueVariant): boolean => variant !== "SNOOKER" && id >= 9 && id <= 15;

export function CueView({ title, game }: { title: string; game: CueVariant }) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const m = useMatch<CueStateX, CueActionX>(game);
  const { state, seat, phase, result } = m;
  const felt = useEquippedCosmetic(game, "CUE");
  const cloth = felt?.colors ?? { a: "#1a6e3a", b: "#0c3a1f" };

  const useGL = useMemo(() => webglSupported(), []);
  const glRef = useRef<CueTableHandle>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [angle, setAngle] = useState(0);
  const [power, setPower] = useState(0.55);
  const [placing, setPlacing] = useState(false);
  const [placedCue, setPlacedCue] = useState<{ x: number; y: number } | null>(null);
  const [pushArmed, setPushArmed] = useState(false);
  const [spin, setSpin] = useState<Spin>({ x: 0, y: 0 });
  /** 8-ball: обявеният за осмицата джоб (индекс в POCKETS) или null. */
  const [calledPocket, setCalledPocket] = useState<number | null>(null);

  // Shot animation driven purely off state.shotNo (+ state.lastShot.before).
  const [frameBalls, setFrameBalls] = useState<RBall[] | null>(null);
  const [sinks, setSinks] = useState<{ key: string; x: number; y: number; color: string }[]>([]);
  /** Last shot number this view has caught up with; null = no state of this
   *  match seen yet (0 is a real value: the break is still to come). */
  const seenShot = useRef<number | null>(null);
  const animating = frameBalls !== null;
  /** An aiming press/drag on the felt is in progress (see pressAt). */
  const aimDrag = useRef(false);

  const nearestPocket = (x: number, y: number): [number, number] =>
    POCKETS.reduce((best, p) =>
      (p[0] - x) ** 2 + (p[1] - y) ** 2 < (best[0] - x) ** 2 + (best[1] - y) ** 2 ? p : best,
    );

  // Reset per-match residue when this mounted view rebinds to a NEW match
  // (regrouped party rooms reuse the mount) — otherwise seenShot from the old
  // match suppresses every animation of the new one.
  useEffect(() => {
    seenShot.current = null;
    setFrameBalls(null);
    setPlacedCue(null);
    setPlacing(false);
    setPushArmed(false);
    setSpin({ x: 0, y: 0 });
    setCalledPocket(null);
  }, [m.matchId]);

  // Layout effect: the replay's first frame replaces the new resting layout
  // BEFORE the browser paints — no one-frame flash of where the balls end up.
  useLayoutEffect(() => {
    if (!state) return;
    // Joining/resuming mid-match adopts the shot count silently; a live shot
    // replays. "Seen 0" used to mean "seen nothing" too, so two shots landing
    // in one render (a busy main thread batches the socket updates) passed
    // for a rejoin and neither was shown — see replayDecision.
    const decision = replayDecision(seenShot.current, state.shotNo, !!state.lastShot);
    if (decision === "adopt") seenShot.current = state.shotNo;
    if (decision !== "animate" || !state.lastShot) return;
    seenShot.current = state.shotNo;
    const variant = state.variant;
    const shotNo = state.shotNo;
    // Същият вход като на сървъра (вкл. ефекта) → същата траектория.
    const { before, angle: a, power: p, spinX, spinY } = state.lastShot;
    const frames = runShot(before as Ball[], { angle: a, power: p, spinX, spinY }).frames;
    const last = frames.length - 1;
    setPlacedCue(null);
    playCue("flip");
    const e2e = cueE2E();
    const entry: CueShotLog | null = e2e
      ? { shotNo, startedAt: Date.now(), endedAt: 0, frames: frames.length, final: frames[last]?.balls ?? [] }
      : null;
    if (e2e && entry) e2e.shots.push(entry);

    // A ball that left the felt since the last DRAWN frame dropped into the
    // nearest pocket (frames may be skipped — see animFrameAt).
    let prev: RBall[] = frames[0]?.balls ?? [];
    const sinkVanished = (next: RBall[], i: number) => {
      const cur = new Set(next.map((b) => b.id));
      for (const pb of prev) {
        if (cur.has(pb.id)) continue;
        const [px, py] = nearestPocket(pb.x, pb.y);
        const color = ballColor(pb.id, variant);
        playCue("flip");
        if (useGL) {
          glRef.current?.addSink(px, py, color);
        } else {
          const key = `${pb.id}-${shotNo}-${i}`;
          setSinks((s) => [...s, { key, x: px, y: py, color }]);
          window.setTimeout(() => setSinks((s) => s.filter((x) => x.key !== key)), 360);
        }
      }
      prev = next;
    };

    // Real-time playback off the wall clock: it lasts exactly `lastShotMs`,
    // the length the server paces the bot and the turn clock by.
    const t0 = performance.now();
    let shown = -1;
    let raf = 0;
    const tick = () => {
      const i = animFrameAt(performance.now() - t0, frames.length);
      if (i >= frames.length) {
        sinkVanished(frames[last]?.balls ?? prev, last);
        if (entry) entry.endedAt = Date.now();
        setFrameBalls(null); // hand back to authoritative state.balls
        return;
      }
      if (i !== shown) {
        shown = i;
        const f = frames[i]!;
        sinkVanished(f.balls, i);
        setFrameBalls(f.balls);
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
    // Keyed to shotNo (not the state object): re-broadcasts of the SAME shot
    // (resync / reclaim / reconnect) must not kill the running animation.
  }, [state?.shotNo]);

  // In-flight guard: one action per server state. A double click on „Удар“
  // (or a held Space) sent a second SHOOT before the answer came back — it was
  // either rejected with an error toast or, after a pot, played as a second
  // shot. Cleared by the next state or by the server's rejection.
  const stateVersion = useMatchStore((s) => s.stateVersion);
  const [sentFor, setSentFor] = useState(-1);
  const pending = sentFor === stateVersion;
  useEffect(() => {
    const socket = getSocket();
    const clear = () => setSentFor(-1);
    socket.on(SOCKET_EVENTS.ERROR, clear);
    return () => {
      socket.off(SOCKET_EVENTS.ERROR, clear);
    };
  }, []);
  const send = (action: CueActionX) => {
    setSentFor(stateVersion);
    m.send(action);
  };

  const myTurn = !!state && state.phase === "PLAY" && state.turn === seat && !animating;
  const ballInHand = !!state && state.ballInHand && myTurn;
  const pushAvail = game === "NINEBALL" && !!state?.pushAvail;
  const pushDecision = game === "NINEBALL" && !!state?.pushDecision;
  const foulChoice = game === "SNOOKER" && !!state?.foulChoice;
  const canReplay = foulChoice && !!state?.missReplay;

  // A fresh shot / turn change drops any armed push-out declaration — and the
  // cue-ball placement mode: left on across a turn change (e.g. the clock ran
  // out mid-placement) it blocked aiming and every shot was then rejected.
  useEffect(() => {
    setPushArmed(false);
    setPlacing(false);
    setCalledPocket(null);
    aimDrag.current = false;
  }, [state?.shotNo, state?.turn]);

  // 8-ball: на осмицата ли съм (същото правило като в двигателя — групата ми е
  // изчистена преди удара). Тогава преди удара трябва да обявя джоб.
  const onEight = (() => {
    if (!state || game !== "EIGHTBALL" || state.open || state.shotNo === 0) return false;
    const g = state.groups[state.turn] ?? null;
    if (g === null) return false;
    const mine = (id: number) => (g === "solids" ? id >= 1 && id <= 7 : id >= 9 && id <= 15);
    return !state.balls.some((b) => !b.potted && mine(b.id));
  })();
  const mustCall = myTurn && onEight;
  const canShoot = myTurn && !pending && !(mustCall && calledPocket === null);

  const liveBalls: RBall[] = animating
    ? (frameBalls ?? [])
    : state
      ? state.balls.filter((b) => !b.potted).map((b) => ({ id: b.id, x: b.x, y: b.y }))
      : [];

  const cuePos =
    placedCue ?? liveBalls.find((b) => b.id === 0) ?? { x: 0.5, y: TABLE.h / 2 };

  // Pointer → table coordinates.
  function toTable(e: React.PointerEvent): { x: number; y: number } | null {
    const svg = svgRef.current;
    if (!svg) return null;
    const r = svg.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * TABLE.w, y: ((e.clientY - r.top) / r.height) * TABLE.h };
  }

  /** 8-ball на осмицата: натискане върху ОТВОРА на джоб го обявява (pocketHole). */
  const pocketNear = pocketHole;

  function aimAt(p: { x: number; y: number }) {
    if (!myTurn || placing) return;
    setAngle(Math.atan2(p.y - cuePos.y, p.x - cuePos.x));
  }
  function placeAt(p: { x: number; y: number }) {
    // 8-ball на осмицата: клик върху отвора на джоб го обявява.
    if (mustCall && !placing) {
      const i = pocketNear(p);
      if (i >= 0) {
        setCalledPocket(i);
        return;
      }
    }
    if (!myTurn || !placing) return;
    if (placementOk(p.x, p.y)) {
      setPlacedCue(p);
      setPlacing(false);
    }
  }

  // Aiming = press (click / tap) or drag on the felt. It used to follow every
  // hover move, so the path from the aim point to „Сила“ / „Удар“ (both below
  // the table) re-aimed the shot toward wherever the cursor left the felt; a
  // tap on a touch screen (no hover) could not aim at all. The pointer is
  // captured for the drag, and a press that places the cue ball or calls a
  // pocket is not an aim (both are decided on release).
  function pressAt(p: { x: number; y: number }) {
    if (!myTurn || placing) return;
    if (mustCall && pocketNear(p) >= 0) return;
    aimDrag.current = true;
    aimAt(p);
  }
  function dragAt(p: { x: number; y: number }) {
    if (aimDrag.current) aimAt(p);
  }
  function releaseAt(p: { x: number; y: number }) {
    if (aimDrag.current) {
      aimDrag.current = false;
      return;
    }
    placeAt(p);
  }
  const cancelAim = () => {
    aimDrag.current = false;
  };

  function placementOk(x: number, y: number): boolean {
    const r = TABLE.ballR;
    if (x < r || x > TABLE.w - r || y < r || y > TABLE.h - r) return false;
    // Snooker: in-hand only inside the "D"; pool: the break stays behind the line.
    if (game === "SNOOKER" && (x > BAULK_X || (x - BAULK_X) ** 2 + (y - TABLE.h / 2) ** 2 > D_RADIUS ** 2)) return false;
    if (game !== "SNOOKER" && state?.shotNo === 0 && x > HEAD_STRING_X) return false;
    return !(state?.balls ?? []).some(
      (b) => !b.potted && b.id !== 0 && (b.x - x) ** 2 + (b.y - y) ** 2 < (2 * r) ** 2,
    );
  }

  // Snooker: първата свободна точка в „D“ (същият ред като в двигателя) — за
  // удар от ръка, без играчът изрично да е поставил бялата.
  function autoDSpot(): { x: number; y: number } | null {
    const cands: [number, number][] = [[BAULK_X, TABLE.h / 2]];
    for (let rr = TABLE.ballR; rr <= D_RADIUS - 1e-9; rr += TABLE.ballR / 2) {
      for (let k = 0; k <= 16; k++) {
        const a = Math.PI / 2 + (k / 16) * Math.PI;
        cands.push([BAULK_X + rr * Math.cos(a), TABLE.h / 2 + rr * Math.sin(a)]);
      }
    }
    const hit = cands.find(([x, y]) => placementOk(x, y));
    return hit ? { x: hit[0], y: hit[1] } : null;
  }

  function shoot() {
    if (!canShoot || !state) return;
    // shotNo: the server rejects a shot meant for an older table (see CueAction).
    const action: CueAction & { pushOut?: boolean } = { type: "SHOOT", angle, power, shotNo: state.shotNo };
    // Ефектът пътува само когато не е в центъра (стар клиент = същото поведение).
    if (spin.x !== 0 || spin.y !== 0) {
      action.spinX = spin.x;
      action.spinY = spin.y;
    }
    if (mustCall && calledPocket !== null) action.pocket = calledPocket;
    // Snooker, бяла в ръка без поставяне: ако бялата не е на валидно място в
    // „D“, ползваме автоматично първата свободна точка в „D“.
    const cur = state?.balls.find((b) => b.id === 0 && !b.potted);
    const place =
      placedCue ??
      (game === "SNOOKER" && ballInHand && !(cur && placementOk(cur.x, cur.y)) ? autoDSpot() : null);
    if (place) {
      action.cueX = place.x;
      action.cueY = place.y;
    }
    if (pushArmed && pushAvail) action.pushOut = true;
    send(action);
  }

  // Shoot with the Space bar (mirrors the button). A ref keeps the handler
  // bound once while always calling the latest shoot/turn closure.
  const shootRef = useRef(shoot);
  shootRef.current = shoot;
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.code !== "Space" && e.key !== " ") return;
      // Text entry keeps Space; the focused power slider must not (spaceShoots).
      if (!spaceShoots(e.target instanceof Element ? (e.target as Element & FocusTarget) : null)) return;
      e.preventDefault(); // no page scroll / focused-button double fire
      if (e.repeat) return; // a held key is one shot, not a burst
      shootRef.current();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Aim guide endpoint (just a visual ray).
  const guideLen = 0.6;
  const gx = cuePos.x + Math.cos(angle) * guideLen;
  const gy = cuePos.y + Math.sin(angle) * guideLen;

  const glScene: CueScene | null = state
    ? {
        variant: game,
        cloth,
        balls: liveBalls,
        aim: myTurn && !placing ? { x0: cuePos.x, y0: cuePos.y, x1: gx, y1: gy } : null,
        ghost: ballInHand && placedCue ? placedCue : null,
        called: onEight && calledPocket !== null ? { x: POCKETS[calledPocket]![0], y: POCKETS[calledPocket]![1] } : null,
      }
    : null;

  const oppName = m.players.find((p) => p.seat !== seat)?.displayName ?? t("game.opponent");
  // 8-ball: show each player's assigned group once the table is no longer open;
  // snooker: show the score (+ what the striker must hit next, below).
  const groupLabel = (s: number) => {
    if (!state || game !== "EIGHTBALL" || state.open) return "";
    const g = state.groups[s as 0 | 1];
    return g === "solids" ? t("cue.solids") : g === "stripes" ? t("cue.stripes") : "";
  };
  const scoreLine = (s: number) =>
    game === "SNOOKER" && state ? String(state.scores[s as 0 | 1]) : groupLabel(s);

  // Engine messages travel as machine codes → i18n (cue.foul.*). Snooker break
  // points arrive as a literal "+N" and render as-is.
  const msgText = state?.message
    ? state.message.startsWith("+")
      ? state.message
      : t(`cue.foul.${state.message}`)
    : "";

  // Status line under the table: base turn hint + target info + last message.
  const hintParts: string[] = [];
  if (state) {
    const base = !myTurn
      ? animating
        ? ""
        : t("game.opponentTurn")
      : ballInHand
        ? placing
          ? `${t("cue.placeHint")}${
              game === "SNOOKER" ? ` (${t("cue.placeHintD")})` : state.shotNo === 0 ? ` (${t("cue.placeHintBreak")})` : ""
            }`
          : t("cue.yourTurnBih")
        : t("cue.yourTurn");
    if (base) hintParts.push(base);
    // Snooker: the target is core information for BOTH players (reading the
    // break), so it shows regardless of whose turn it is.
    if (game === "SNOOKER" && state.expect) {
      if (state.freeBall) hintParts.push(t("cue.freeBall"));
      hintParts.push(
        state.freeColour ? t("cue.expectFreeColour") : state.expect === "red" ? t("cue.expectRed") : t("cue.expectColour"),
      );
    }
    // 9-ball: the ball that must be struck first.
    if (game === "NINEBALL" && state.phase === "PLAY") {
      const next = state.balls.filter((b) => !b.potted && b.id > 0).reduce((lo, b) => Math.min(lo, b.id), 10);
      if (next < 10) hintParts.push(`${t("cue.expectBall")} ${next}`);
      // WPA: предупреждение за играча на два поредни фала.
      const fouls = state.fouls ?? [0, 0];
      if (fouls[seat === 1 ? 1 : 0] === 2) hintParts.push(t("cue.twoFouls"));
      if (fouls[seat === 1 ? 0 : 1] === 2) hintParts.push(t("cue.twoFoulsOpp"));
    }
    // Snooker: „фал и пропуск“ + изборът на входящия играч.
    if (game === "SNOOKER" && state.phase === "PLAY") {
      if (state.miss) hintParts.push(t("cue.miss"));
      if (foulChoice && myTurn) hintParts.push(t("cue.foulChoice"));
    }
    // 8-ball: на осмицата — обявяване на джоб.
    if (mustCall) {
      hintParts.push(
        calledPocket === null
          ? t("cue.callPocketHint")
          : `${t("cue.calledPocket")}: ${t(`cue.pockets.${pocketForSlot(calledPocket, useGL)}`)}`,
      );
    }
    if (msgText) hintParts.push(msgText);
  }

  // Hold the verdict until the deciding shot has finished animating — the
  // winning ball must be seen to drop before the modal (and win/loss sound).
  const displayResult = animating ? null : result;
  const displayPhase = animating && phase === "over" ? ("playing" as const) : phase;

  return (
    <Scene title={title} phase={displayPhase} ready={!!state} seat={seat} result={displayResult}>
      {state ? (
        <div className="flex flex-col items-center gap-3">
          <div data-testid="cue-opponent">
            <ScorePill label={oppName} value={scoreLine(seat === 0 ? 1 : 0)} />
          </div>

          {/* data-*: machine-readable table state for tooling/e2e (no visual effect). */}
          <div
            className={useGL ? "aso-cue aso-cue--gl" : "aso-cue"}
            data-testid="cue-table"
            data-variant={game}
            data-renderer={useGL ? "gl" : "svg"}
            data-shot={state.shotNo}
            data-animating={animating}
            data-ready={myTurn && !pending}
            data-can-shoot={canShoot}
            data-ball-in-hand={ballInHand}
            data-placing={placing}
            data-must-call={mustCall}
            data-aim={angle}
          >
            {useGL && glScene ? (
              <div className="aso-cue__rim">
                <CueTableGL
                  ref={glRef}
                  scene={glScene}
                  locked={!myTurn}
                  onDownWorld={pressAt}
                  onMoveWorld={dragAt}
                  onUpWorld={releaseAt}
                  onCancel={cancelAim}
                />
              </div>
            ) : (
            <div className="aso-cue__rim">
              <svg
                ref={svgRef}
                className="aso-cue__svg"
                viewBox={`0 0 ${TABLE.w} ${TABLE.h}`}
                data-table="svg"
                data-locked={myTurn ? undefined : "true"}
                onPointerDown={(e) => {
                  const p = toTable(e);
                  if (!p) return;
                  // Keep the drag (aiming) ours even when it leaves the felt.
                  e.currentTarget.setPointerCapture?.(e.pointerId);
                  pressAt(p);
                }}
                onPointerMove={(e) => {
                  const p = toTable(e);
                  if (p) dragAt(p);
                }}
                onPointerUp={(e) => {
                  const p = toTable(e);
                  if (p) releaseAt(p);
                  else cancelAim();
                }}
                onPointerCancel={cancelAim}
              >
                <defs>
                  <radialGradient id="cueCloth" cx="40%" cy="35%" r="80%">
                    <stop offset="0%" stopColor={cloth.a} />
                    <stop offset="100%" stopColor={cloth.b} />
                  </radialGradient>
                </defs>
                <rect x={0} y={0} width={TABLE.w} height={TABLE.h} fill="url(#cueCloth)" />

                {/* baulk line + D for snooker flavour */}
                {game === "SNOOKER" ? (
                  <g stroke="rgba(255,255,255,.18)" strokeWidth={0.004} fill="none">
                    <line x1={BAULK_X} y1={0} x2={BAULK_X} y2={TABLE.h} />
                    <path d={`M ${BAULK_X} ${TABLE.h / 2 - D_RADIUS} A ${D_RADIUS} ${D_RADIUS} 0 0 0 ${BAULK_X} ${TABLE.h / 2 + D_RADIUS}`} />
                  </g>
                ) : (
                  /* pool head string — the break is placed behind this line */
                  <line
                    x1={HEAD_STRING_X}
                    y1={0}
                    x2={HEAD_STRING_X}
                    y2={TABLE.h}
                    stroke="rgba(255,255,255,.12)"
                    strokeWidth={0.004}
                  />
                )}

                {/* pockets */}
                {POCKETS.map(([px, py], i) => (
                  <circle key={i} cx={px} cy={py} r={TABLE.pocketR} fill="#0a0a0a" opacity={0.92} />
                ))}

                {/* 8-ball: обявеният за осмицата джоб */}
                {onEight && calledPocket !== null ? (
                  <circle
                    cx={POCKETS[calledPocket]![0]}
                    cy={POCKETS[calledPocket]![1]}
                    r={TABLE.pocketR * 1.45}
                    fill="none"
                    stroke="#f2cf7a"
                    strokeWidth={0.012}
                  />
                ) : null}

                {/* aim guide */}
                {myTurn && !placing ? (
                  <line
                    x1={cuePos.x}
                    y1={cuePos.y}
                    x2={gx}
                    y2={gy}
                    stroke="rgba(255,255,255,.6)"
                    strokeWidth={0.006}
                    strokeDasharray="0.02 0.02"
                  />
                ) : null}

                {/* balls */}
                {liveBalls.map((b) => {
                  const color = ballColor(b.id, game);
                  const r = TABLE.ballR;
                  const stripe = isStripe(b.id, game);
                  return (
                    <g key={b.id} data-ball={b.id}>
                      {/* stripes match the GL texture: white ball + colour band */}
                      <circle
                        cx={b.x}
                        cy={b.y}
                        r={r}
                        fill={stripe ? "#f4f1e8" : color}
                        stroke="rgba(0,0,0,.35)"
                        strokeWidth={0.003}
                      />
                      {stripe ? (
                        <>
                          <clipPath id={`aso-cue-ball-${b.id}`}>
                            <circle cx={b.x} cy={b.y} r={r} />
                          </clipPath>
                          <rect
                            x={b.x - r}
                            y={b.y - r * 0.42}
                            width={r * 2}
                            height={r * 0.84}
                            fill={color}
                            clipPath={`url(#aso-cue-ball-${b.id})`}
                          />
                        </>
                      ) : null}
                      {/* numbered disc for pool */}
                      {game !== "SNOOKER" && b.id !== 0 ? (
                        <>
                          <circle cx={b.x} cy={b.y} r={r * 0.42} fill="#fffdf6" opacity={0.95} />
                          <text
                            x={b.x}
                            y={b.y}
                            fontSize={r * 0.56}
                            fontWeight={700}
                            fill="#1c1c1c"
                            textAnchor="middle"
                            dominantBaseline="central"
                          >
                            {b.id}
                          </text>
                        </>
                      ) : null}
                      {/* highlight cue */}
                      {b.id === 0 ? (
                        <circle cx={b.x - r * 0.3} cy={b.y - r * 0.3} r={r * 0.22} fill="#ffffff" opacity={0.8} />
                      ) : null}
                    </g>
                  );
                })}

                {/* balls dropping into pockets */}
                {sinks.map((s) => (
                  <circle key={s.key} className="aso-cue__sink" cx={s.x} cy={s.y} r={TABLE.ballR} fill={s.color} />
                ))}

                {/* ball-in-hand ghost */}
                {ballInHand && placedCue ? (
                  <circle cx={placedCue.x} cy={placedCue.y} r={TABLE.ballR} fill="#fff" opacity={0.5} />
                ) : null}
              </svg>
            </div>
            )}

            <div className="aso-cue__power">
              <span className="text-sm text-ink-muted">{t("cue.power")}</span>
              <input
                type="range"
                min={0.1}
                max={1}
                step={0.01}
                value={power}
                disabled={!myTurn}
                data-control="power"
                aria-label={t("cue.power")}
                onChange={(e) => setPower(Number(e.target.value))}
              />
              <Button onClick={shoot} disabled={!canShoot} title={t("cue.shootKey")} data-action="shoot">
                {t("cue.shoot")} <kbd className="aso-kbd">Space</kbd>
              </Button>
              {myTurn && pushAvail ? (
                <Button
                  variant="ghost"
                  aria-pressed={pushArmed}
                  className={pushArmed ? "!text-brass-100" : undefined}
                  data-action="push-out"
                  onClick={() => setPushArmed((v) => !v)}
                >
                  {t("cue.pushOut")}
                </Button>
              ) : null}
              {myTurn && pushDecision ? (
                <Button variant="ghost" disabled={pending} data-action="push-pass" onClick={() => send({ type: "PASS" })}>
                  {t("cue.pushPass")}
                </Button>
              ) : null}
              {myTurn && foulChoice ? (
                <Button variant="ghost" disabled={pending} data-action="play-again" onClick={() => send({ type: "PASS" })}>
                  {t("cue.playAgain")}
                </Button>
              ) : null}
              {myTurn && canReplay ? (
                <Button variant="ghost" disabled={pending} data-action="replay" onClick={() => send({ type: "REPLAY" })}>
                  {t("cue.replay")}
                </Button>
              ) : null}
            </div>

            <div className="aso-cue__extras">
              <SpinPad value={spin} onChange={setSpin} disabled={!myTurn} />
              {mustCall ? (
                <div className="aso-cue__pockets" role="radiogroup" aria-label={t("cue.callPocket")}>
                  <span className="text-sm text-ink-muted" aria-hidden="true">
                    {t("cue.callPocket")}
                  </span>
                  <div className="aso-cue__pocketgrid">
                    {/* Laid out by screen position; the pocket behind each
                        follows the renderer's view (3D is turned 180°). */}
                    {POCKET_GLYPHS.map((glyph, slot) => {
                      const pocket = pocketForSlot(slot, useGL);
                      return (
                        <button
                          key={slot}
                          type="button"
                          role="radio"
                          aria-checked={calledPocket === pocket}
                          aria-label={t(`cue.pockets.${slot}`)}
                          title={t(`cue.pockets.${slot}`)}
                          className="aso-cue__pocketbtn"
                          data-pocket={pocket}
                          onClick={() => setCalledPocket(pocket)}
                        >
                          {glyph}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>

            <p className="aso-cue__hint" aria-live="polite" data-testid="cue-hint">
              {hintParts.join(" · ")}
            </p>

            {ballInHand && !placing ? (
              <div className="mt-2 text-center">
                <Button variant="felt" data-action="place-cue" onClick={() => setPlacing(true)}>
                  {t("cue.placeCue")}
                </Button>
              </div>
            ) : null}
          </div>

          <div data-testid="cue-me">
            <ScorePill label={user?.displayName ?? t("game.you")} value={scoreLine(seat)} highlight={myTurn} />
          </div>
        </div>
      ) : null}
    </Scene>
  );
}
