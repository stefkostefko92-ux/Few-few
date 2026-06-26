import { useCallback, useEffect, useRef } from "react";
import gsap from "gsap";
import { useSettings } from "../../../lib/settings";

/**
 * GSAP-driven card choreography (§3.5 juice). Animations honour the reduced-
 * motion setting (collapse to instant). Each helper operates on real DOM nodes
 * via refs/selectors so React never re-renders mid-animation.
 */
export function useCardAnimations(scopeRef: React.RefObject<HTMLElement | null>) {
  const reduced = useSettings((s) => s.reducedMotion);
  const ctx = useRef<gsap.Context | null>(null);

  useEffect(() => {
    ctx.current = gsap.context(() => {}, scopeRef);
    return () => ctx.current?.revert();
  }, [scopeRef]);

  /** Staggered deal: cards fly in from the deck origin with anticipation. */
  const dealIn = useCallback(
    (selector: string) => {
      if (!scopeRef.current) return;
      const nodes = scopeRef.current.querySelectorAll<HTMLElement>(selector);
      if (reduced) {
        gsap.set(nodes, { opacity: 1, x: 0, y: 0, rotate: 0, scale: 1 });
        return;
      }
      gsap.fromTo(
        nodes,
        { opacity: 0, y: -120, x: () => gsap.utils.random(-40, 40), rotate: () => gsap.utils.random(-25, 25), scale: 0.85 },
        {
          opacity: 1,
          y: 0,
          x: 0,
          rotate: 0,
          scale: 1,
          duration: 0.42,
          ease: "back.out(1.4)",
          stagger: 0.07,
        },
      );
    },
    [reduced, scopeRef],
  );

  /** A card played to the table: lift, settle with a soft squash. */
  const playCard = useCallback(
    (node: HTMLElement | null) => {
      if (!node || reduced) return;
      gsap.fromTo(
        node,
        { scale: 1.12, y: -16 },
        { scale: 1, y: 0, duration: 0.28, ease: "back.out(2)" },
      );
    },
    [reduced],
  );

  /** Collect the trick toward a winner direction (dx,dy in px). */
  const collectTrick = useCallback(
    (selector: string, dx: number, dy: number, onDone?: () => void) => {
      if (!scopeRef.current) {
        onDone?.();
        return;
      }
      const nodes = scopeRef.current.querySelectorAll<HTMLElement>(selector);
      if (reduced || nodes.length === 0) {
        onDone?.();
        return;
      }
      gsap.to(nodes, {
        x: dx,
        y: dy,
        rotate: () => gsap.utils.random(-12, 12),
        opacity: 0,
        scale: 0.8,
        duration: 0.4,
        ease: "power2.in",
        stagger: 0.04,
        onComplete: onDone,
      });
    },
    [reduced, scopeRef],
  );

  return { dealIn, playCard, collectTrick, reduced };
}
