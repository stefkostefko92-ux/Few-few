import { useEffect, useRef, type ReactNode } from "react";
import { useSettings } from "../../../lib/settings";
import "./cinematic.css";

/**
 * Cinematic presentation layer shared by all 18 games. Wraps a game scene in a
 * darkened "private room": volumetric overhead spotlight, deep vignette, film
 * grain, and a subtle camera entrance (the table rises into focus). Honors the
 * reduced-motion setting (drops the entrance + grain shimmer).
 *
 * `tone` lets a game tint the ambient spill (e.g. candlelit Santase, midnight
 * Svara) so the cinematic mood matches the felt without per-game boilerplate.
 */
export function CinematicStage({
  children,
  tone,
}: {
  children: ReactNode;
  tone?: "warm" | "midnight" | "cool" | "default";
}) {
  const reduced = useSettings((s) => s.reducedMotion);
  const ref = useRef<HTMLDivElement>(null);

  // Re-trigger the entrance animation whenever a fresh stage mounts.
  useEffect(() => {
    const el = ref.current;
    if (!el || reduced) return;
    el.classList.remove("cine--enter");
    // force reflow so the animation restarts
    void el.offsetWidth;
    el.classList.add("cine--enter");
  }, [reduced]);

  return (
    <div className={`cine cine--${tone ?? "default"}`} data-reduced={reduced ? "true" : undefined}>
      <div className="cine__spot" aria-hidden />
      <div className="cine__vignette" aria-hidden />
      <div ref={ref} className="cine__stage">
        {children}
      </div>
      <div className="cine__grain" aria-hidden />
    </div>
  );
}
