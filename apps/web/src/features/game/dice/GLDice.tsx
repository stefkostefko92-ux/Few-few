import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { GLDice as GLDiceRenderer } from "./glDice";

/** Returns false if WebGL is unavailable (lets the caller fall back to CSS dice). */
export function webglSupported(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

/**
 * Hybrid dice tray: a PixiJS canvas renders the 3D-shaded dice and the roll
 * animation, while a row of transparent buttons on top keeps the hold toggles
 * keyboard-focusable and screen-reader friendly.
 */
export function GLDice({
  values,
  held,
  canToggle,
  onToggle,
  rollNonce,
  heldLabel,
}: {
  values: number[];
  held: boolean[];
  canToggle: boolean;
  onToggle: (i: number) => void;
  rollNonce: number;
  heldLabel: string;
}) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const diceRef = useRef<GLDiceRenderer | null>(null);
  const prevNonce = useRef(rollNonce);
  const latest = useRef({ values, held });
  latest.current = { values, held };

  useEffect(() => {
    let renderer: GLDiceRenderer | null = null;
    let cancelled = false;
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const width = () => Math.max(120, wrap.clientWidth);

    void import("./glDice")
      .then(({ GLDice }) => GLDice.create(canvas, width(), values.length))
      .then((r) => {
        if (cancelled) {
          r.destroy();
          return;
        }
        renderer = r;
        diceRef.current = r;
        r.render(latest.current.values, latest.current.held);
      });

    return () => {
      cancelled = true;
      renderer?.destroy();
      diceRef.current = null;
    };
  }, []);

  // Roll animation when a new roll happens; otherwise a static re-layout.
  useEffect(() => {
    const r = diceRef.current;
    if (!r) return;
    if (rollNonce !== prevNonce.current) {
      prevNonce.current = rollNonce;
      r.roll(values, held);
    } else {
      r.render(values, held);
    }
  }, [values, held, rollNonce]);

  return (
    <div ref={wrapRef} className="dice-gl">
      <canvas ref={canvasRef} style={{ width: "100%", height: "auto", display: "block" }} />
      <div className="dice-gl__hit" role="group">
        {values.map((_, i) => (
          <button
            key={i}
            type="button"
            className="dice-gl__btn"
            disabled={!canToggle}
            aria-pressed={held[i]}
            aria-label={`${t("a11y.die", { v: values[i] })}${held[i] ? `, ${heldLabel}` : ""}`}
            onClick={() => canToggle && onToggle(i)}
          >
            {held[i] ? <span className="dice-held-tag">{heldLabel}</span> : null}
          </button>
        ))}
      </div>
    </div>
  );
}
