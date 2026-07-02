import { useCallback, useRef, type RefObject } from "react";
import gsap from "gsap";
import { useSettings } from "../../../lib/settings";
import type { SeatPos } from "../table/FeltTable";

/**
 * Shared card-flight primitives (§3.5 juice): every card game uses these so a
 * played card visibly FLIES from its seat onto the table, and collected cards
 * visibly fly TOWARD whoever takes them. All flights honour reduced motion.
 *
 *  • flyIn(node, from)   — a card that just MOUNTED at its final spot animates
 *    in from a seat (or a concrete hand node for my own play).
 *  • collect(nodes, to)  — clones the given card nodes SYNCHRONOUSLY (they may
 *    unmount on the very next state) and flies the clones to a seat.
 *  • flyGhost(from, to)  — flies a cloned card back between two seats/elements
 *    (draws, passes, gained cards) without needing a mounted source node.
 */

function centre(r: DOMRect): { x: number; y: number } {
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/** Fixed full-screen layer so table overflow never clips a flight. */
function makeFlightLayer(): HTMLDivElement {
  const layer = document.createElement("div");
  layer.className = "aso-flight-layer";
  layer.style.cssText = "position:fixed;inset:0;z-index:60;pointer-events:none;overflow:visible;";
  document.body.appendChild(layer);
  return layer;
}

/** Viewport rect of a seat plate inside the table scope. */
export function seatRect(scope: HTMLElement | null, pos: SeatPos): DOMRect | null {
  const el = scope?.querySelector<HTMLElement>(`.aso-seat[data-pos="${pos}"]`);
  return el ? el.getBoundingClientRect() : null;
}

type FlightSource = SeatPos | HTMLElement | null;

export interface CardFlight {
  reduced: boolean;
  flyIn: (node: HTMLElement | null, from: FlightSource) => void;
  collect: (nodes: ArrayLike<HTMLElement>, to: SeatPos, opts?: { delayMs?: number }) => void;
  flyGhost: (from: FlightSource, to: FlightSource, opts?: { count?: number; delayMs?: number }) => void;
}

export function useCardFlight(scopeRef: RefObject<HTMLElement | null>): CardFlight {
  const reduced = useSettings((s) => s.reducedMotion);
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;

  const resolveRect = useCallback(
    (src: FlightSource): DOMRect | null => {
      if (!src) return null;
      if (typeof src === "string") return seatRect(scopeRef.current, src);
      return src.getBoundingClientRect();
    },
    [scopeRef],
  );

  const flyIn = useCallback(
    (node: HTMLElement | null, from: FlightSource) => {
      if (!node || reducedRef.current) return;
      const src = resolveRect(from);
      if (!src) return;
      const target = node.getBoundingClientRect();
      const dx = centre(src).x - centre(target).x;
      const dy = centre(src).y - centre(target).y;
      gsap.from(node, {
        x: dx,
        y: dy,
        rotation: gsap.utils.random(-14, 14),
        scale: 0.92,
        duration: 0.3,
        ease: "back.out(1.2)",
        clearProps: "transform",
      });
    },
    [resolveRect],
  );

  const collect = useCallback(
    (nodes: ArrayLike<HTMLElement>, to: SeatPos, opts?: { delayMs?: number }) => {
      const arr = Array.from(nodes);
      if (arr.length === 0 || reducedRef.current) return;
      // Clone + measure SYNCHRONOUSLY: the source nodes may unmount as soon as
      // the next state flushes, so nothing here may wait for a frame.
      const seatR = seatRect(scopeRef.current, to);
      const dest = seatR ? centre(seatR) : { x: window.innerWidth / 2, y: window.innerHeight + 80 };
      const layer = makeFlightLayer();
      const clones = arr.map((card) => {
        const r = card.getBoundingClientRect();
        const clone = card.cloneNode(true) as HTMLElement;
        clone.style.cssText = `position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;margin:0;`;
        const c = centre(r);
        clone.dataset.dx = String(dest.x - c.x);
        clone.dataset.dy = String(dest.y - c.y);
        layer.appendChild(clone);
        return clone;
      });
      gsap.to(clones, {
        x: (_i: number, el: HTMLElement) => Number(el.dataset.dx),
        y: (_i: number, el: HTMLElement) => Number(el.dataset.dy),
        rotate: () => gsap.utils.random(-16, 16),
        scale: 0.6,
        opacity: 0,
        duration: 0.46,
        ease: "power2.in",
        stagger: 0.05,
        delay: (opts?.delayMs ?? 0) / 1000,
        onComplete: () => layer.remove(),
      });
    },
    [scopeRef],
  );

  const flyGhost = useCallback(
    (from: FlightSource, to: FlightSource, opts?: { count?: number; delayMs?: number }) => {
      if (reducedRef.current) return;
      const srcRect = resolveRect(from);
      const dstRect = resolveRect(to);
      if (!srcRect || !dstRect) return;
      // Use a card already rendered at/near the source as the ghost's face —
      // seats show card backs, piles show their top card.
      const srcEl = typeof from === "string"
        ? scopeRef.current?.querySelector<HTMLElement>(`.aso-seat[data-pos="${from}"] .aso-card`)
        : (from?.classList.contains("aso-card") ? from : from?.querySelector<HTMLElement>(".aso-card"));
      if (!srcEl) return;
      const layer = makeFlightLayer();
      const count = Math.min(opts?.count ?? 1, 6);
      const r = srcEl.getBoundingClientRect();
      const dest = centre(dstRect);
      const c = centre(r);
      const clones: HTMLElement[] = [];
      for (let i = 0; i < count; i++) {
        const clone = srcEl.cloneNode(true) as HTMLElement;
        clone.style.cssText = `position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;margin:0;`;
        layer.appendChild(clone);
        clones.push(clone);
      }
      gsap.to(clones, {
        x: dest.x - c.x,
        y: dest.y - c.y,
        rotation: () => gsap.utils.random(-12, 12),
        scale: 0.8,
        opacity: 0.15,
        duration: 0.42,
        ease: "power2.inOut",
        stagger: 0.06,
        delay: (opts?.delayMs ?? 0) / 1000,
        onComplete: () => layer.remove(),
      });
    },
    [resolveRect, scopeRef],
  );

  return { reduced, flyIn, collect, flyGhost };
}
