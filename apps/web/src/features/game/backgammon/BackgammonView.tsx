import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../../lib/store";
import { Button } from "../../../ui";
import { playCue } from "../../../lib/sound";
import { cn } from "../../../ui";
import { BoardFrame, DiceRow } from "../board/BoardFrame";
import { useMatch } from "../useMatch";
import { Scene, ScorePill } from "../scene/SceneShell";
import "./backgammon.css";

interface BackgammonState {
  points: number[]; // 24, signed (+ = white/seat0, - = black/seat1)
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

/** Checkers at a point for a seat (sign convention: +white / -black). */
function checkersAt(v: number): { color: "w" | "b"; count: number } | null {
  if (v === 0) return null;
  return v > 0 ? { color: "w", count: v } : { color: "b", count: -v };
}

export function BackgammonView({ title }: { title: string }) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const m = useMatch<BackgammonState, BackgammonAction>("BACKGAMMON");
  const { state, legal, seat, phase, result, players } = m;
  const [fromSel, setFromSel] = useState<number | "BAR" | null>(null);

  const myTurn = !!state && state.turn === seat && legal.length > 0;
  const rollAction = legal.find((a) => a.type === "ROLL");
  const passAction = legal.find((a) => a.type === "PASS");
  const moves = useMemo(
    () => legal.filter((a): a is Extract<BackgammonAction, { type: "MOVE" }> => a.type === "MOVE"),
    [legal],
  );
  const movableFroms = useMemo(() => new Set(moves.map((mv) => mv.from)), [moves]);

  // Destinations available for the currently selected origin (compute landing).
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

  function clickPoint(pointIdx: number) {
    if (!myTurn) return;
    if (fromSel !== null && targetsFor.has(pointIdx)) {
      // Find the move whose landing equals this point.
      const dir = seat === 0 ? -1 : 1;
      const mv = moves.find((x) => {
        const land = x.from === "BAR" ? (seat === 0 ? 24 - x.die : x.die - 1) : x.from + dir * x.die;
        return x.from === fromSel && land === pointIdx;
      });
      if (mv) {
        playCue("flip");
        m.send(mv);
      }
      setFromSel(null);
      return;
    }
    if (movableFroms.has(pointIdx)) setFromSel(pointIdx);
    else setFromSel(null);
  }

  const oppName = players.find((p) => p.seat !== seat)?.displayName ?? t("game.opponent");

  // Render order: top row points 12..23 (left→right), bottom row 11..0.
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
        onClick={() => clickPoint(idx)}
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

          <div className="flex items-center gap-4">
            <ScorePill
              label={user?.displayName ?? t("game.you")}
              value={`${t("backgammon.off")}: ${state.off[seat] ?? 0}`}
              highlight={myTurn}
            />
            {state.remaining.length > 0 ? <DiceRow values={state.remaining} /> : null}
            {rollAction ? <Button onClick={() => { playCue("flip"); m.send(rollAction); }}>{t("backgammon.roll")}</Button> : null}
            {passAction ? <Button variant="ghost" onClick={() => m.send(passAction)}>{t("backgammon.pass")}</Button> : null}
            {fromSel === "BAR" || (state.bar[seat] ?? 0) > 0 ? (
              <Button variant="felt" onClick={() => setFromSel("BAR")}>{t("backgammon.bar")}</Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </Scene>
  );
}
