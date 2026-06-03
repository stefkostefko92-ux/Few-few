import { useEffect, useRef } from "react";
import type { CueScene, GLTable } from "./glTable";

/** Returns false if WebGL is unavailable (lets the caller fall back to SVG). */
export function webglSupported(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

type WorldPoint = { x: number; y: number };

/**
 * The GPU half of the hybrid cue scene: a PixiJS canvas that renders the table
 * and balls. Interaction is handed back to the parent as world-space points so
 * the existing aim/placement logic and DOM controls stay untouched.
 */
export function CueTableGL({
  scene,
  locked,
  onMoveWorld,
  onUpWorld,
}: {
  scene: CueScene | null;
  locked: boolean;
  onMoveWorld?: (p: WorldPoint) => void;
  onUpWorld?: (p: WorldPoint) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<GLTable | null>(null);
  const sceneRef = useRef<CueScene | null>(scene);
  sceneRef.current = scene;

  useEffect(() => {
    let table: GLTable | null = null;
    let ro: ResizeObserver | null = null;
    let cancelled = false;
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const width = () => Math.max(160, wrap.clientWidth);
    // Lazily pull in the PixiJS renderer (and Pixi itself) only when a cue
    // table actually mounts — keeps it out of the main bundle for card games.
    void import("./glTable").then(({ GLTable }) => GLTable.create(canvas, width())).then((t) => {
      if (cancelled) {
        t.destroy();
        return;
      }
      table = t;
      tableRef.current = t;
      if (sceneRef.current) t.render(sceneRef.current);
      ro = new ResizeObserver(() => {
        t.resize(width());
        if (sceneRef.current) t.render(sceneRef.current);
      });
      ro.observe(wrap);
    });

    return () => {
      cancelled = true;
      ro?.disconnect();
      table?.destroy();
      tableRef.current = null;
    };
  }, []);

  // Re-render whenever the scene changes.
  useEffect(() => {
    if (tableRef.current && scene) tableRef.current.render(scene);
  }, [scene]);

  const toWorld = (e: React.PointerEvent): WorldPoint | null => {
    const t = tableRef.current;
    const canvas = canvasRef.current;
    if (!t || !canvas) return null;
    return t.toWorld(e.clientX, e.clientY, canvas.getBoundingClientRect());
  };

  return (
    <div ref={wrapRef} className="aso-cue__gl" style={{ cursor: locked ? "default" : "crosshair" }}>
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: "auto", display: "block" }}
        onPointerMove={(e) => {
          const p = toWorld(e);
          if (p) onMoveWorld?.(p);
        }}
        onPointerUp={(e) => {
          const p = toWorld(e);
          if (p) onUpWorld?.(p);
        }}
      />
    </div>
  );
}
