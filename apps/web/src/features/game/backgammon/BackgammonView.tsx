import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../../lib/store";
import { Button } from "../../../ui";
import { playCue } from "../../../lib/sound";
import { cn } from "../../../ui";
import { BoardFrame, DiceRow } from "../board/BoardFrame";
import { useMatch } from "../useMatch";
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

export function BackgammonView({ title }: { title: string }) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const m = useMatch<BackgammonState, BackgammonAction>("BACKGAMMON");
  const { state, legal, seat, phase, result, players, send } = m;
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

  const targetsFor = useMemo(() => {
    if (fromSel === null) return new Set<number>();
    const dir = seat === 0 ? -1 : 1;
    const dest = new Set<number>();
    for (const mv of moves) {
      if (mv.from !== fromSel) continue;
      if (mv.from === "BAR") dest.add(seat === 0 ? 24 - mv.die : mv.die - 1);
      else dest.add(mv.from + dir * mv.die);
    }
    return dest;
  }, [fromSel, moves, seat]);

  /** Apply a click/pick on a board point (shared by 2D + 3D paths). */
  function pickPoint(pointIdx: number) {
    if (!myTurn) return;
    if (fromSel !== null && targetsFor.has(pointIdx)) {
      const dir = seat === 0 ? -1 : 1;
      const mv = moves.find((x) => {
        const land = x.from === "BAR" ? (seat === 0 ? 24 - x.die : x.die - 1) : x.from + dir * x.die;
        return x.from === fromSel && land === pointIdx;
      });
      if (mv) {
        playCue("flip");
        send(mv);
      }
      setFromSel(null);
      return;
    }
    if (movableFroms.has(pointIdx)) setFromSel(pointIdx);
    else setFromSel(null);
  }
  function handlePick(pid: PointId | null) {
    if (pid === null) return;
    if (pid === "BAR") {
      if (myTurn && movableFroms.has("BAR")) setFromSel("BAR");
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
      {state ? (
        <div className="flex flex-col items-center gap-4">
          <ScorePill label={oppName} value={`${t("backgammon.off")}: ${state.off[seat === 0 ? 1 : 0] ?? 0}`} />

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
              label={user?.displayName ?? t("game.you")}
              value={`${t("backgammon.off")}: ${state.off[seat] ?? 0}`}
              highlight={myTurn}
            />
            {state.remaining.length > 0 ? <DiceRow values={state.remaining} /> : null}
            {rollAction ? <Button onClick={() => { playCue("flip"); send(rollAction); }}>{t("backgammon.roll")}</Button> : null}
            {passAction ? <Button variant="ghost" onClick={() => send(passAction)}>{t("backgammon.pass")}</Button> : null}
            {(state.bar[seat] ?? 0) > 0 ? (
              <Button variant="felt" onClick={() => setFromSel("BAR")}>{t("backgammon.bar")}</Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </Scene>
  );
}
