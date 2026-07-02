import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../../lib/store";
import { Button } from "../../../ui";
import { playCue } from "../../../lib/sound";
import { cn } from "../../../ui";
import { BoardFrame, DiceRow } from "../board/BoardFrame";
import { useMatch } from "../useMatch";
import { useGameAnnouncements, Announcements } from "../anim/useTableFx";
import { Scene, ScorePill } from "../scene/SceneShell";
import type { BackgammonScene, PointId } from "./backgammonScene";
import "./backgammon.css";

interface BackgammonState {
  points: number[];
  bar: [number, number];
  off: [number, number];
  turn: number;
  phase: "ROLL" | "MOVE";
  dice: number[];
  remaining: number[];
  /** Opening roll [white die, black die] — present only during the first turn. */
  openingRoll?: [number, number];
}
type BackgammonAction =
  | { type: "ROLL" }
  | { type: "MOVE"; from: number | "BAR"; die: number }
  | { type: "PASS" };

function webglSupported(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

function checkersAt(v: number): { color: "w" | "b"; count: number } | null {
  if (v === 0) return null;
  return v > 0 ? { color: "w", count: v } : { color: "b", count: -v };
}

type BgMove = Extract<BackgammonAction, { type: "MOVE" }>;

/** Landing point of a move for `seat` — "OFF" is the bear-off tray. */
function destOf(seat: number, mv: BgMove): number | "OFF" {
  if (mv.from === "BAR") return seat === 0 ? 24 - mv.die : mv.die - 1;
  const d = mv.from + (seat === 0 ? -1 : 1) * mv.die;
  return d < 0 || d > 23 ? "OFF" : d;
}

export function BackgammonView({ title }: { title: string }) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const m = useMatch<BackgammonState, BackgammonAction>("BACKGAMMON");
  const { state, legal, seat, phase, result, players, send } = m;

  // Opponent-visible action announcements.
  const { banners } = useGameAnnouncements({
    matchId: m.matchId,
    toBanner: (ev) => {
      if (ev.type === "HIT") return ev.seat === seat ? { text: t("fx.hit"), tone: "win" } : { text: t("fx.hitYou"), tone: "loss" };
      if (ev.type === "PASS") return { text: t("backgammon.noMoves", "Няма възможен ход — пас"), tone: "brass" };
      if (ev.type === "WIN" && typeof ev.points === "number" && ev.points >= 2) {
        const label = ev.points >= 3 ? t("backgammon.backgammon", "Капия!") : t("backgammon.gammon", "Марс!");
        return { text: `${label} ×${ev.points}`, tone: ev.seat === seat ? "win" : "loss" };
      }
      return null;
    },
  });
  const [fromSel, setFromSel] = useState<number | "BAR" | null>(null);
  const useGL = useMemo(webglSupported, []);

  const myTurn = !!state && state.turn === seat && legal.length > 0;
  const rollAction = legal.find((a) => a.type === "ROLL");
  const passAction = legal.find((a) => a.type === "PASS");
  const moves = useMemo(
    () => legal.filter((a): a is Extract<BackgammonAction, { type: "MOVE" }> => a.type === "MOVE"),
    [legal],
  );
  const movableFroms = useMemo(() => new Set(moves.map((mv) => mv.from)), [moves]);

  const canBearOff = myTurn && moves.some((mv) => destOf(seat, mv) === "OFF");

  const targetsFor = useMemo(() => {
    const dest = new Set<number | "OFF">();
    if (fromSel === null) return dest;
    for (const mv of moves) {
      if (mv.from === fromSel) dest.add(destOf(seat, mv));
    }
    return dest;
  }, [fromSel, moves, seat]);

  /** Apply a click/pick on a board point or the bear-off tray (2D + 3D paths). */
  function pickPoint(pointIdx: number | "OFF") {
    if (!myTurn) return;
    if (fromSel !== null && targetsFor.has(pointIdx)) {
      const candidates = moves
        .filter((x) => x.from === fromSel && destOf(seat, x) === pointIdx)
        // Bear-off with an oversized die is legal; prefer the exact (smallest).
        .sort((a, b) => a.die - b.die);
      const mv = candidates[0];
      if (mv) {
        playCue("flip");
        send(mv);
      }
      setFromSel(null);
      return;
    }
    if (pointIdx !== "OFF" && movableFroms.has(pointIdx)) setFromSel(pointIdx);
    else setFromSel(null);
  }
  /** Bear-off button/tray click: use the selection, or the only off-able point. */
  function pickBearOff() {
    if (!myTurn) return;
    if (fromSel !== null) {
      pickPoint("OFF");
      return;
    }
    const offs = moves.filter((mv) => destOf(seat, mv) === "OFF");
    const froms = new Set(offs.map((o) => o.from));
    if (froms.size === 1) {
      const mv = offs.sort((a, b) => a.die - b.die)[0]!;
      playCue("flip");
      send(mv);
    }
  }
  function handlePick(pid: PointId | null) {
    if (pid === null) return;
    if (pid === "BAR") {
      if (myTurn && movableFroms.has("BAR")) setFromSel("BAR");
      return;
    }
    if (pid === "OFF") {
      pickBearOff();
      return;
    }
    pickPoint(pid);
  }

  /* ── 3D scene lifecycle ─────────────────────────────────────────────── */
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<BackgammonScene | null>(null);
  const pickRef = useRef(handlePick);
  pickRef.current = handlePick;
  const viewRef = useRef({ state, seat, movableFroms, targetsFor });
  viewRef.current = { state, seat, movableFroms, targetsFor };

  // Canvas mounts only once state arrives — re-run the GL init on that flip.
  const glReady = !!state;
  useEffect(() => {
    if (!useGL || !glReady) return;
    let scene: BackgammonScene | null = null;
    let ro: ResizeObserver | null = null;
    let cancelled = false;
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const width = () => Math.max(300, wrap.clientWidth);
    void import("./backgammonScene")
      .then(({ BackgammonScene }) => {
        if (cancelled) return;
        scene = new BackgammonScene(canvas, width());
        sceneRef.current = scene;
        const v = viewRef.current;
        if (v.state) scene.setState(v.state, v.seat, { from: v.movableFroms, targets: v.targetsFor });
        ro = new ResizeObserver(() => scene?.resize(width()));
        ro.observe(wrap);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      ro?.disconnect();
      scene?.destroy();
      sceneRef.current = null;
    };
  }, [useGL, glReady]);

  useEffect(() => {
    if (sceneRef.current && state) {
      sceneRef.current.setState(state, seat, { from: movableFroms, targets: targetsFor });
    }
  }, [state, seat, movableFroms, targetsFor]);

  function onCanvasClick(e: React.PointerEvent) {
    const scene = sceneRef.current;
    const canvas = canvasRef.current;
    if (!scene || !canvas) return;
    pickRef.current(scene.pick(e.clientX, e.clientY, canvas.getBoundingClientRect()));
  }

  const oppName = players.find((p) => p.seat !== seat)?.displayName ?? t("game.opponent");
  const myColor = seat === 0 ? t("backgammon.white", "белите") : t("backgammon.black", "черните");
  const oppColor = seat === 0 ? t("backgammon.black", "черните") : t("backgammon.white", "белите");
  // Gammon (марс ×2) / backgammon (капия ×3) verdict for the game-over screen.
  const winLine = result?.score.find((s) => s.result === "win");
  const winPts = winLine?.points ?? 1;
  const topPoints = [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];
  const bottomPoints = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0];

  function renderPoint(idx: number, side: "top" | "bottom") {
    const cell = state ? checkersAt(state.points[idx] ?? 0) : null;
    const isTarget = targetsFor.has(idx);
    const isFrom = fromSel === idx;
    const triTone = idx % 2 === 0 ? "bg-tri--a" : "bg-tri--b";
    return (
      <div
        key={idx}
        onClick={() => pickPoint(idx)}
        className={cn(
          "bg-point",
          side === "top" ? "bg-point--top" : "bg-point--bottom",
          isTarget && "bg-point--target",
          (isTarget || (movableFroms.has(idx) && myTurn)) && "bg-point--clickable",
          isFrom && "bg-point--target",
        )}
      >
        <span className={cn("bg-tri", triTone)} />
        {cell
          ? Array.from({ length: Math.min(cell.count, 5) }).map((_, i) => (
              <span key={i} className={cn("bg-checker", cell.color === "w" ? "bg-checker--w" : "bg-checker--b")} />
            ))
          : null}
        {cell && cell.count > 5 ? <span className="bg-count">{cell.count}</span> : null}
      </div>
    );
  }

  return (
    <Scene title={title} phase={phase} ready={!!state} seat={seat} result={result}>
      <Announcements banners={banners} fixed />
      {phase === "over" && result && winPts >= 2 ? (
        <div
          style={{ position: "fixed", top: "12vh", left: 0, right: 0, zIndex: 80, textAlign: "center", pointerEvents: "none" }}
          aria-live="polite"
        >
          <span className="aso-announce" data-tone={winLine?.seat === seat ? "win" : "loss"}>
            {winPts >= 3 ? t("backgammon.backgammon", "Капия!") : t("backgammon.gammon", "Марс!")} ×{winPts}
          </span>
        </div>
      ) : null}
      {state ? (
        <div className="flex flex-col items-center gap-4">
          <div className="flex items-center gap-4">
            <ScorePill label={`${oppName} · ${oppColor}`} value={`${t("backgammon.off")}: ${state.off[seat === 0 ? 1 : 0] ?? 0}`} />
            {state.openingRoll ? (
              <ScorePill
                label={t("backgammon.openingRoll", "Начално хвърляне")}
                value={`${state.openingRoll[0]} : ${state.openingRoll[1]}`}
              />
            ) : null}
          </div>

          {useGL ? (
            <div ref={wrapRef} className="bg-gl">
              <canvas
                ref={canvasRef}
                onPointerUp={onCanvasClick}
                style={{ width: "100%", height: "auto", display: "block", cursor: myTurn ? "pointer" : "default" }}
              />
            </div>
          ) : (
            <BoardFrame>
              <div className="bg-board">
                <div className="bg-quad">{topPoints.slice(0, 6).map((i) => renderPoint(i, "top"))}</div>
                <div className="bg-bar">
                  <span className="bg-count">{state.bar[seat === 0 ? 1 : 0] ? `▼${state.bar[seat === 0 ? 1 : 0]}` : ""}</span>
                  <span className="bg-count">{state.bar[seat] ? `▲${state.bar[seat]}` : ""}</span>
                </div>
                <div className="bg-quad">{topPoints.slice(6).map((i) => renderPoint(i, "top"))}</div>
                <div className="bg-quad">{bottomPoints.slice(0, 6).map((i) => renderPoint(i, "bottom"))}</div>
                <div className="bg-bar" />
                <div className="bg-quad">{bottomPoints.slice(6).map((i) => renderPoint(i, "bottom"))}</div>
              </div>
            </BoardFrame>
          )}

          <div className="flex items-center gap-4">
            <ScorePill
              label={`${user?.displayName ?? t("game.you")} · ${myColor}`}
              value={`${t("backgammon.off")}: ${state.off[seat] ?? 0}`}
              highlight={myTurn}
            />
            {state.remaining.length > 0 ? <DiceRow values={state.remaining} /> : null}
            {rollAction ? <Button onClick={() => { playCue("flip"); send(rollAction); }}>{t("backgammon.roll")}</Button> : null}
            {passAction ? <Button variant="ghost" onClick={() => send(passAction)}>{t("backgammon.pass")}</Button> : null}
            {(state.bar[seat] ?? 0) > 0 ? (
              <Button variant="felt" onClick={() => setFromSel("BAR")}>{t("backgammon.bar")}</Button>
            ) : null}
            {canBearOff ? (
              <Button
                variant={targetsFor.has("OFF") ? "brass" : "felt"}
                onClick={pickBearOff}
              >
                {t("backgammon.bearOff", "Извади")}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </Scene>
  );
}
