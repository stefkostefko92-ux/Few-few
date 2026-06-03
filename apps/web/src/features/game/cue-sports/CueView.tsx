import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { runShot, TABLE, type Ball, type CueState, type CueAction, type CueVariant } from "@aso/shared";
import { useAuthStore } from "../../../lib/store";
import { playCue } from "../../../lib/sound";
import { Button } from "../../../ui";
import { useEquippedCosmetic } from "../../shop/useEquippedCosmetic";
import { useMatch } from "../useMatch";
import { Scene, ScorePill } from "../scene/SceneShell";
import { CueTableGL, webglSupported } from "./CueTableGL";
import type { CueScene } from "./glTable";
import "./cue-table.css";

type RBall = { id: number; x: number; y: number };

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
  const m = useMatch<CueState, CueAction>(game);
  const { state, seat, phase, result } = m;
  const felt = useEquippedCosmetic(game, "CUE");
  const cloth = felt?.colors ?? { a: "#1a6e3a", b: "#0c3a1f" };

  const useGL = useMemo(() => webglSupported(), []);
  const svgRef = useRef<SVGSVGElement>(null);
  const [angle, setAngle] = useState(0);
  const [power, setPower] = useState(0.55);
  const [placing, setPlacing] = useState(false);
  const [placedCue, setPlacedCue] = useState<{ x: number; y: number } | null>(null);

  // Shot animation driven purely off state.shotNo (+ state.lastShot.before).
  const [frameBalls, setFrameBalls] = useState<RBall[] | null>(null);
  const [sinks, setSinks] = useState<{ key: string; x: number; y: number; color: string }[]>([]);
  const seenShot = useRef(0);
  const animating = frameBalls !== null;

  const nearestPocket = (x: number, y: number): [number, number] =>
    POCKETS.reduce((best, p) =>
      (p[0] - x) ** 2 + (p[1] - y) ** 2 < (best[0] - x) ** 2 + (best[1] - y) ** 2 ? p : best,
    );

  useEffect(() => {
    if (!state || !state.lastShot || state.shotNo <= seenShot.current) return;
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
        const key = `${pb.id}-${state.shotNo}-${i}`;
        const color = ballColor(pb.id, variant);
        setSinks((s) => [...s, { key, x: px, y: py, color }]);
        playCue("flip");
        window.setTimeout(() => setSinks((s) => s.filter((x) => x.key !== key)), 360);
      }
      prev = f.balls;
      setFrameBalls(f.balls);
      i += 1;
    }, 1000 / 60);
    return () => clearInterval(id);
  }, [state]);

  const myTurn = !!state && state.phase === "PLAY" && state.turn === seat && !animating;
  const ballInHand = !!state && state.ballInHand && myTurn;

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
    const action: CueAction = { type: "SHOOT", angle, power };
    if (placedCue) {
      action.cueX = placedCue.x;
      action.cueY = placedCue.y;
    }
    m.send(action);
  }

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
  const scoreLine = (s: number) =>
    game === "SNOOKER" && state ? String(state.scores[s as 0 | 1]) : "";

  return (
    <Scene title={title} phase={phase} ready={!!state} seat={seat} result={result}>
      {state ? (
        <div className="flex flex-col items-center gap-3">
          <ScorePill label={oppName} value={scoreLine(seat === 0 ? 1 : 0)} />

          <div className="aso-cue">
            {useGL && glScene ? (
              <div className="aso-cue__rim">
                <CueTableGL
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
                    <line x1={0.42} y1={0} x2={0.42} y2={TABLE.h} />
                    <path d={`M 0.42 ${TABLE.h / 2 - 0.18} A 0.18 0.18 0 0 0 0.42 ${TABLE.h / 2 + 0.18}`} />
                  </g>
                ) : null}

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
                  return (
                    <g key={b.id}>
                      <circle cx={b.x} cy={b.y} r={r} fill={color} stroke="rgba(0,0,0,.35)" strokeWidth={0.003} />
                      {isStripe(b.id, game) ? (
                        <rect x={b.x - r} y={b.y - r * 0.42} width={r * 2} height={r * 0.84} fill="#f4f1e8" opacity={0.92} clipPathUnits="userSpaceOnUse" />
                      ) : null}
                      {/* tiny number disc for pool */}
                      {game !== "SNOOKER" && b.id !== 0 ? (
                        <circle cx={b.x} cy={b.y} r={r * 0.42} fill="#fffdf6" opacity={0.95} />
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
              <Button onClick={shoot} disabled={!myTurn}>
                {t("cue.shoot")}
              </Button>
            </div>

            <p className="aso-cue__hint">
              {!myTurn
                ? animating
                  ? ""
                  : t("game.opponentTurn")
                : ballInHand
                  ? placing
                    ? t("cue.placeHint")
                    : t("cue.yourTurnBih")
                  : t("cue.yourTurn")}
              {state.message ? ` · ${state.message}` : ""}
            </p>

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
