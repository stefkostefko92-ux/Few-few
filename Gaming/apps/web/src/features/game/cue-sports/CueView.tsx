import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { runShot, TABLE, type Ball, type CueState, type CueAction, type CueVariant } from "@aso/shared";
import { useAuthStore } from "../../../lib/store";
import { playCue } from "../../../lib/sound";
import { Button } from "../../../ui";
import { useEquippedCosmetic } from "../../shop/useEquippedCosmetic";
import { useMatch } from "../useMatch";
import { Scene, ScorePill } from "../scene/SceneShell";
import { CueTableGL, webglSupported, type CueTableHandle } from "./CueTableGL";
import type { CueScene } from "./glTable";
import "./cue-table.css";

type RBall = { id: number; x: number; y: number };

// Engine extras serialized on top of the shared CueState (see game-core cue.ts).
type CueStateX = CueState & {
  lastShotMs?: number;
  pushAvail?: boolean;
  pushDecision?: boolean;
  freeColour?: boolean;
  freeBall?: boolean;
};
type CueActionX = (CueAction & { pushOut?: boolean }) | { type: "PASS" };

const POCKETS: [number, number][] = [
  [0, 0],
  [TABLE.w / 2, 0],
  [TABLE.w, 0],
  [0, TABLE.h],
  [TABLE.w / 2, TABLE.h],
  [TABLE.w, TABLE.h],
];

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

  // Shot animation driven purely off state.shotNo (+ state.lastShot.before).
  const [frameBalls, setFrameBalls] = useState<RBall[] | null>(null);
  const [sinks, setSinks] = useState<{ key: string; x: number; y: number; color: string }[]>([]);
  const seenShot = useRef(0);
  const animating = frameBalls !== null;

  const nearestPocket = (x: number, y: number): [number, number] =>
    POCKETS.reduce((best, p) =>
      (p[0] - x) ** 2 + (p[1] - y) ** 2 < (best[0] - x) ** 2 + (best[1] - y) ** 2 ? p : best,
    );

  // Reset per-match residue when this mounted view rebinds to a NEW match
  // (regrouped party rooms reuse the mount) — otherwise seenShot from the old
  // match suppresses every animation of the new one.
  useEffect(() => {
    seenShot.current = 0;
    setFrameBalls(null);
    setPlacedCue(null);
    setPlacing(false);
    setPushArmed(false);
  }, [m.matchId]);

  useEffect(() => {
    if (!state) return;
    // Joining/resuming mid-match: adopt the current shot count silently instead
    // of replaying a stale shot (shotNo 1 — a live break — still animates).
    if (seenShot.current === 0 && state.shotNo > 1) {
      seenShot.current = state.shotNo;
      return;
    }
    if (!state.lastShot || state.shotNo <= seenShot.current) return;
    seenShot.current = state.shotNo;
    const variant = state.variant;
    const { before, angle: a, power: p } = state.lastShot;
    const frames = runShot(before as Ball[], { angle: a, power: p }).frames;
    setPlacedCue(null);
    playCue("flip");
    let i = 0;
    let prev: RBall[] = frames[0]?.balls ?? [];
    const id = setInterval(() => {
      const f = frames[i];
      if (!f) {
        clearInterval(id);
        setFrameBalls(null); // hand back to authoritative state.balls
        return;
      }
      // A ball that vanished this frame dropped into the nearest pocket — drop it.
      const cur = new Set(f.balls.map((b) => b.id));
      for (const pb of prev) {
        if (cur.has(pb.id)) continue;
        const [px, py] = nearestPocket(pb.x, pb.y);
        const color = ballColor(pb.id, variant);
        playCue("flip");
        if (useGL) {
          glRef.current?.addSink(px, py, color);
        } else {
          const key = `${pb.id}-${state.shotNo}-${i}`;
          setSinks((s) => [...s, { key, x: px, y: py, color }]);
          window.setTimeout(() => setSinks((s) => s.filter((x) => x.key !== key)), 360);
        }
      }
      prev = f.balls;
      setFrameBalls(f.balls);
      i += 1;
    }, 1000 / 60);
    return () => clearInterval(id);
    // Keyed to shotNo (not the state object): re-broadcasts of the SAME shot
    // (resync / reclaim / reconnect) must not kill the running animation.
  }, [state?.shotNo]);

  const myTurn = !!state && state.phase === "PLAY" && state.turn === seat && !animating;
  const ballInHand = !!state && state.ballInHand && myTurn;
  const pushAvail = game === "NINEBALL" && !!state?.pushAvail;
  const pushDecision = game === "NINEBALL" && !!state?.pushDecision;

  // A fresh shot / turn change drops any armed push-out declaration.
  useEffect(() => {
    setPushArmed(false);
  }, [state?.shotNo, state?.turn]);

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

  function aimAt(p: { x: number; y: number }) {
    if (!myTurn || placing) return;
    setAngle(Math.atan2(p.y - cuePos.y, p.x - cuePos.x));
  }
  function placeAt(p: { x: number; y: number }) {
    if (!myTurn || !placing) return;
    if (placementOk(p.x, p.y)) {
      setPlacedCue(p);
      setPlacing(false);
    }
  }

  function onMove(e: React.PointerEvent) {
    const p = toTable(e);
    if (p) aimAt(p);
  }

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

  function onClick(e: React.PointerEvent) {
    const p = toTable(e);
    if (p) placeAt(p);
  }

  function shoot() {
    if (!myTurn) return;
    const action: CueAction & { pushOut?: boolean } = { type: "SHOOT", angle, power };
    if (placedCue) {
      action.cueX = placedCue.x;
      action.cueY = placedCue.y;
    }
    if (pushArmed && pushAvail) action.pushOut = true;
    m.send(action);
  }

  // Shoot with the Space bar (mirrors the button). A ref keeps the handler
  // bound once while always calling the latest shoot/turn closure.
  const shootRef = useRef(shoot);
  shootRef.current = shoot;
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.code !== "Space" && e.key !== " ") return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      e.preventDefault(); // no page scroll / focused-button double fire
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
          <ScorePill label={oppName} value={scoreLine(seat === 0 ? 1 : 0)} />

          <div className="aso-cue">
            {useGL && glScene ? (
              <div className="aso-cue__rim">
                <CueTableGL
                  ref={glRef}
                  scene={glScene}
                  locked={!myTurn}
                  onMoveWorld={aimAt}
                  onUpWorld={placeAt}
                />
              </div>
            ) : (
            <div className="aso-cue__rim">
              <svg
                ref={svgRef}
                className="aso-cue__svg"
                viewBox={`0 0 ${TABLE.w} ${TABLE.h}`}
                data-locked={myTurn ? undefined : "true"}
                onPointerMove={onMove}
                onPointerUp={onClick}
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
                    <g key={b.id}>
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
                onChange={(e) => setPower(Number(e.target.value))}
              />
              <Button onClick={shoot} disabled={!myTurn} title={t("cue.shootKey")}>
                {t("cue.shoot")} <kbd className="aso-kbd">Space</kbd>
              </Button>
              {myTurn && pushAvail ? (
                <Button
                  variant="ghost"
                  aria-pressed={pushArmed}
                  className={pushArmed ? "!text-brass-100" : undefined}
                  onClick={() => setPushArmed((v) => !v)}
                >
                  {t("cue.pushOut")}
                </Button>
              ) : null}
              {myTurn && pushDecision ? (
                <Button variant="ghost" onClick={() => m.send({ type: "PASS" })}>
                  {t("cue.pushPass")}
                </Button>
              ) : null}
            </div>

            <p className="aso-cue__hint">{hintParts.join(" · ")}</p>

            {ballInHand && !placing ? (
              <div className="mt-2 text-center">
                <Button variant="felt" onClick={() => setPlacing(true)}>
                  {t("cue.placeCue")}
                </Button>
              </div>
            ) : null}
          </div>

          <ScorePill
            label={user?.displayName ?? t("game.you")}
            value={scoreLine(seat)}
            highlight={myTurn}
          />
        </div>
      ) : null}
    </Scene>
  );
}
