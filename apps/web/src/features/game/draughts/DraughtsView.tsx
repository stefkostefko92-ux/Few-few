import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../../lib/store";
import { playCue } from "../../../lib/sound";
import { cn } from "../../../ui";
import { BoardFrame } from "../board/BoardFrame";
import { useMatch } from "../useMatch";
import { Scene, ScorePill } from "../scene/SceneShell";
import type { DraughtsScene } from "./draughtsScene";

function webglSupported(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

type Piece = "w" | "W" | "b" | "B" | null;
interface DraughtsState {
  board: Piece[];
  turn: number;
}
type DraughtsAction = { type: "MOVE"; from: number; to: number };

export function DraughtsView({ title }: { title: string }) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const m = useMatch<DraughtsState, DraughtsAction>("DRAUGHTS");
  const { state, legal, seat, phase, result, players } = m;
  const [from, setFrom] = useState<number | null>(null);

  const myTurn = !!state && state.turn === seat && legal.length > 0;
  const movable = useMemo(() => new Set(legal.map((a) => a.from)), [legal]);
  const targets = useMemo(
    () => (from === null ? [] : legal.filter((a) => a.from === from).map((a) => a.to)),
    [legal, from],
  );

  // Seat 0 = white (bottom). Flip the board for black so "my" pieces are near me.
  const flip = seat === 1;
  const cells = useMemo(() => {
    const idx = Array.from({ length: 64 }, (_, i) => i);
    return flip ? idx.reverse() : idx;
  }, [flip]);

  function onCell(i: number) {
    if (!myTurn || !state) return;
    if (from !== null && targets.includes(i)) {
      const action = legal.find((a) => a.from === from && a.to === i);
      if (action) {
        playCue("flip");
        m.send(action);
      }
      setFrom(null);
      return;
    }
    setFrom(movable.has(i) ? i : null);
  }

  const oppName = players.find((p) => p.seat !== seat)?.displayName ?? t("game.opponent");

  /* ── 3D scene (hybrid; 2D board is the fallback) ────────────────────── */
  const useGL = useMemo(webglSupported, []);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<DraughtsScene | null>(null);
  const clickRef = useRef(onCell);
  clickRef.current = onCell;
  const viewRef = useRef({ board: state?.board, from, targets });
  viewRef.current = { board: state?.board, from, targets };

  // Canvas mounts only once state arrives — re-run the GL init on that flip.
  const glReady = !!state;
  useEffect(() => {
    if (!useGL || !glReady) return;
    let scene: DraughtsScene | null = null;
    let ro: ResizeObserver | null = null;
    let cancelled = false;
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const width = () => Math.max(280, wrap.clientWidth);
    void import("./draughtsScene")
      .then(({ DraughtsScene }) => {
        if (cancelled) return;
        scene = new DraughtsScene(canvas, width(), seat === 1 ? "black" : "white");
        sceneRef.current = scene;
        const v = viewRef.current;
        if (v.board) scene.setState(v.board, { selected: v.from, targets: new Set(v.targets) });
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
  }, [useGL, glReady, seat]);

  useEffect(() => {
    if (sceneRef.current && state) {
      sceneRef.current.setState(state.board, { selected: from, targets: new Set(targets) });
    }
  }, [state, from, targets]);

  function onCanvasClick(e: React.PointerEvent) {
    const scene = sceneRef.current;
    const canvas = canvasRef.current;
    if (!scene || !canvas) return;
    const cell = scene.pick(e.clientX, e.clientY, canvas.getBoundingClientRect());
    if (cell !== null) clickRef.current(cell);
  }

  return (
    <Scene title={title} phase={phase} ready={!!state} seat={seat} result={result}>
      {state ? (
        <div className="flex flex-col items-center gap-4">
          <ScorePill label={oppName} value="" />
          {useGL ? (
            <div
              ref={wrapRef}
              style={{
                width: "min(90vw, 72vh, 780px)",
                borderRadius: 16,
                overflow: "hidden",
                lineHeight: 0,
                boxShadow: "0 16px 40px -16px rgba(0,0,0,.7)",
              }}
            >
              <canvas
                ref={canvasRef}
                onPointerUp={onCanvasClick}
                style={{ width: "100%", height: "auto", display: "block", cursor: myTurn ? "pointer" : "default" }}
              />
            </div>
          ) : (
          <BoardFrame>
            <div className="aso-grid8" style={{ width: "min(90vw, 72vh, 700px)" }}>
              {cells.map((i) => {
                const r = Math.floor(i / 8);
                const c = i % 8;
                const dark = (r + c) % 2 === 1;
                const piece = state.board[i];
                const isFrom = from === i;
                const isTarget = targets.includes(i);
                const mine = piece && (seat === 0 ? piece === "w" || piece === "W" : piece === "b" || piece === "B");
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => onCell(i)}
                    aria-label={`клетка ${i}`}
                    className={cn(
                      "aso-cell",
                      dark ? "aso-cell--dark" : "aso-cell--light",
                      isFrom && "aso-cell--from",
                      isTarget && "aso-cell--target",
                      myTurn && mine && "cursor-pointer",
                    )}
                  >
                    {piece ? (
                      <span
                        className={cn(
                          "aso-piece",
                          piece === "w" || piece === "W" ? "aso-piece--w" : "aso-piece--b",
                          (piece === "W" || piece === "B") && "aso-piece--king",
                        )}
                        style={{ position: "relative" }}
                      />
                    ) : null}
                  </button>
                );
              })}
            </div>
          </BoardFrame>
          )}
          <ScorePill label={user?.displayName ?? t("game.you")} value={myTurn ? t("game.yourTurn") : ""} highlight={myTurn} />
        </div>
      ) : null}
    </Scene>
  );
}
