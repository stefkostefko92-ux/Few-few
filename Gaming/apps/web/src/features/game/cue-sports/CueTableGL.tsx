import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { CueScene, GLTable } from "./glTable";
import { cueE2E } from "./e2eHook";

export interface CueTableHandle {
  /** Play the pocket-drop animation for a potted ball at world (x, y). */
  addSink(x: number, y: number, color: string): void;
}

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
 * The GPU half of the hybrid cue scene: a three.js canvas that renders the
 * table and balls. Interaction is handed back to the parent as world-space
 * points (press / drag / release, the pointer captured for the drag) so the
 * aim/placement logic and DOM controls are shared with the SVG table.
 */
export const CueTableGL = forwardRef<
  CueTableHandle,
  {
    scene: CueScene | null;
    locked: boolean;
    onDownWorld?: (p: WorldPoint) => void;
    onMoveWorld?: (p: WorldPoint) => void;
    onUpWorld?: (p: WorldPoint) => void;
    onCancel?: () => void;
  }
>(function CueTableGL({ scene, locked, onDownWorld, onMoveWorld, onUpWorld, onCancel }, ref) {
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
    const e2e = cueE2E();
    // Lazily pull in the three.js renderer only when a cue table actually
    // mounts — keeps it out of the main bundle for card games.
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
      // Automation only (see e2eHook): the felt ↔ screen projection for picking.
      if (e2e) {
        e2e.toClient = (x, y) => t.toClient(x, y, canvas.getBoundingClientRect());
        e2e.toWorld = (cx, cy) => t.toWorld(cx, cy, canvas.getBoundingClientRect());
      }
    });

    return () => {
      cancelled = true;
      ro?.disconnect();
      table?.destroy();
      tableRef.current = null;
      if (e2e) {
        delete e2e.toClient;
        delete e2e.toWorld;
      }
    };
  }, []);

  // Re-render whenever the scene changes.
  useEffect(() => {
    if (tableRef.current && scene) tableRef.current.render(scene);
  }, [scene]);

  useImperativeHandle(
    ref,
    () => ({
      addSink: (x, y, color) => tableRef.current?.addSink(x, y, color),
    }),
    [],
  );

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
        data-table="gl"
        style={{ width: "100%", height: "auto", display: "block" }}
        onPointerDown={(e) => {
          const p = toWorld(e);
          if (!p) return;
          // Keep the drag (aiming) ours even when it leaves the canvas.
          e.currentTarget.setPointerCapture?.(e.pointerId);
          onDownWorld?.(p);
        }}
        onPointerMove={(e) => {
          const p = toWorld(e);
          if (p) onMoveWorld?.(p);
        }}
        onPointerUp={(e) => {
          const p = toWorld(e);
          if (p) onUpWorld?.(p);
          else onCancel?.();
        }}
        onPointerCancel={() => onCancel?.()}
      />
    </div>
  );
});
