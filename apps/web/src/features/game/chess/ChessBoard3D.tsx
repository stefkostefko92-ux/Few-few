import { useEffect, useMemo, useRef, useState } from "react";
import type { ChessScene } from "./chessScene";
import type { ChessAction, Orientation } from "./types";

interface Props {
  fen: string;
  legalActions: ChessAction[];
  myTurn: boolean;
  orientation: Orientation;
  lastMove: { from: string; to: string } | null;
  onMove: (action: ChessAction) => void;
}

/** WebGL 3D chess board. Mirrors ChessBoard's select/target/move logic, but
 *  renders a three.js scene and picks squares by raycast. Lazy-loads three. */
export function ChessBoard3D({ fen, legalActions, myTurn, orientation, lastMove, onMove }: Props) {
  const [selected, setSelected] = useState<string | null>(null);

  const movableFrom = useMemo(() => new Set(legalActions.map((a) => a.from)), [legalActions]);
  const targets = useMemo(
    () => (selected ? legalActions.filter((a) => a.from === selected).map((a) => a.to) : []),
    [legalActions, selected],
  );
  const targetSet = useMemo(() => new Set(targets), [targets]);

  function onCellClick(square: string) {
    if (!myTurn) return;
    if (selected && targets.includes(square)) {
      const options = legalActions.filter((a) => a.from === selected && a.to === square);
      const chosen = options.find((a) => a.promotion === "q") ?? options[0];
      if (chosen) onMove(chosen);
      setSelected(null);
      return;
    }
    if (movableFrom.has(square)) setSelected(square);
    else setSelected(null);
  }

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<ChessScene | null>(null);
  const clickRef = useRef(onCellClick);
  clickRef.current = onCellClick;
  const viewRef = useRef({ fen, selected, targetSet, lastMove });
  viewRef.current = { fen, selected, targetSet, lastMove };

  useEffect(() => {
    let scene: ChessScene | null = null;
    let ro: ResizeObserver | null = null;
    let cancelled = false;
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const width = () => Math.max(280, wrap.clientWidth);
    void import("./chessScene")
      .then(({ ChessScene }) => {
        if (cancelled) return;
        scene = new ChessScene(canvas, width(), orientation);
        sceneRef.current = scene;
        const v = viewRef.current;
        scene.setState(v.fen, { selected: v.selected, targets: v.targetSet, last: v.lastMove });
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
    // orientation is fixed for a match
  }, [orientation]);

  useEffect(() => {
    sceneRef.current?.setState(fen, { selected, targets: targetSet, last: lastMove });
  }, [fen, selected, targetSet, lastMove]);

  function onClick(e: React.PointerEvent) {
    const scene = sceneRef.current;
    const canvas = canvasRef.current;
    if (!scene || !canvas) return;
    const sq = scene.pick(e.clientX, e.clientY, canvas.getBoundingClientRect());
    if (sq) clickRef.current(sq);
  }

  return (
    <div
      ref={wrapRef}
      className="chess-gl"
      style={{
        width: "min(90vw, 72vh, 780px)",
        borderRadius: "16px",
        overflow: "hidden",
        lineHeight: 0,
        boxShadow: "0 16px 40px -16px rgba(0,0,0,.7)",
      }}
    >
      <canvas
        ref={canvasRef}
        onPointerUp={onClick}
        style={{ width: "100%", height: "auto", display: "block", cursor: myTurn ? "pointer" : "default" }}
      />
    </div>
  );
}
