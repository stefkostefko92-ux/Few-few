import { useEffect, useRef, useState, type ReactNode } from "react";
import { useSettings } from "../../../lib/settings";
import { HallBackdrop } from "../ravenhold/HallBackdrop";
import type { RavenTone } from "../ravenhold/palette";
import "./cinematic.css";

/**
 * Cinematic presentation layer shared by all 21 games — the Рейвънхолд hall
 * (art direction ported from the `boy` project): every table sits in a
 * torchlit castle hall at night, drawn live in WebGL2 behind the scene (see
 * ravenhold/hallShader.ts) and graded like boy (ACES, split tone, grain).
 * Falls back to the CSS room when WebGL2 is unavailable.
 *
 * Honors the reduced-motion setting (static hall frame, no entrance).
 * `tone` sets the room's mood: candlelit, midnight, cool or the great hall.
 */
export function CinematicStage({ children, tone }: { children: ReactNode; tone?: RavenTone }) {
  const reduced = useSettings((s) => s.reducedMotion);
  const ref = useRef<HTMLDivElement>(null);
  const [hall, setHall] = useState(false);

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
    <div
      className={`cine cine--${tone ?? "default"}${hall ? " cine--hall" : ""}`}
      data-reduced={reduced ? "true" : undefined}
    >
      <HallBackdrop tone={tone ?? "default"} reduced={reduced} onStatus={setHall} />
      <div className="cine__spot" aria-hidden />
      <div className="cine__vignette" aria-hidden />
      <div ref={ref} className="cine__stage">
        {children}
      </div>
      <div className="cine__grain" aria-hidden />
    </div>
  );
}
