import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../../lib/store";
import { playCue } from "../../../lib/sound";
import { cn } from "../../../ui";
import { BoardFrame } from "../board/BoardFrame";
import { useMatch } from "../useMatch";
import { useGameAnnouncements, Announcements } from "../anim/useTableFx";
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
  /** Mid-capture chain: the only piece allowed to act. */
  chainFrom: number | null;
}
type DraughtsAction = { type: "MOVE"; from: number; to: number };

/** True when a move jumps over at least one piece (walk the diagonal between). */
function isCaptureMove(board: Piece[], from: number, to: number): boolean {
  let r = Math.floor(from / 8);
  let c = from % 8;
  const tr = Math.floor(to / 8);
  const tc = to % 8;
  const dr = Math.sign(tr - r);
  const dc = Math.sign(tc - c);
  r += dr;
  c += dc;
  while ((r !== tr || c !== tc) && r >= 0 && r < 8 && c >= 0 && c < 8) {
    if (board[r * 8 + c]) return true;
    r += dr;
    c += dc;
  }
  return false;
}

export function DraughtsView({ title }: { title: string }) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const m = useMatch<DraughtsState, DraughtsAction>("DRAUGHTS");
  const { state, legal, seat, phase, result, players } = m;

  // Opponent-visible action announcements.
  const { banners, announce } = useGameAnnouncements({
    matchId: m.matchId,
    toBanner: (ev) => {
      if (ev.type === "MOVE" && typeof ev.captured === "number") return ev.seat === seat ? { text: t("fx.take"), tone: "win" } : { text: t("fx.lostPiece"), tone: "loss" };
      if (ev.type === "KING") return ev.seat === seat ? { text: t("fx.king"), tone: "win" } : { text: t("fx.oppKing"), tone: "brass" };
      if (ev.type === "DRAW") return { text: t("game.draw"), tone: "brass" };
      return null;
    },
  });
  const [from, setFrom] = useState<number | null>(null);

  const myTurn = !!state && state.turn === seat && legal.length > 0;
  const movable = useMemo(() => new Set(legal.map((a) => a.from)), [legal]);
  const targets = useMemo(
    () => (from === null ? [] : legal.filter((a) => a.from === from).map((a) => a.to)),
    [legal, from],
  );

  // Auto-select when only one piece may act (mid-chain continuation, or a
  // single movable piece) so the player never hunts for the forced piece.
  useEffect(() => {
    if (!myTurn || legal.length === 0) return;
    const only = legal[0]!.from;
    if (legal.every((a) => a.from === only)) setFrom(only);
  }, [legal, myTurn]);

  // Mid-chain banner: "continue capturing!" once per chain.
  const chainCell = state?.chainFrom ?? null;
  const prevChain = useRef<number | null>(null);
  useEffect(() => {
    if (chainCell !== null && prevChain.current === null && myTurn) {
      announce(t("fx.chain", "Продължи взимането!"), "brass");
    }
    prevChain.current = chainCell;
  }, [chainCell, myTurn, announce, t]);

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
    // Clicking one of my pieces that is NOT allowed to move while a capture is
    // mandatory elsewhere: explain instead of silently dropping the selection.
    const piece = state.board[i];
    const mine = !!piece && (seat === 0 ? piece === "w" || piece === "W" : piece === "b" || piece === "B");
    if (mine && !movable.has(i) && legal.some((a) => isCaptureMove(state.board, a.from, a.to))) {
      announce(t("fx.mustCapture", "Задължително взимане!"), "brass", "error");
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
      <Announcements banners={banners} fixed />
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
                    aria-label={t("a11y.cell", { i })}
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
