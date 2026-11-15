import { useEffect, useRef, type RefObject } from "react";
import { useSettings } from "../../lib/settings";

/**
 * Bring the action controls into view when the player's turn begins. On a
 * 1366×768 laptop the felt table fills the screen and the controls under it
 * (Свара's bets, Риба's ask, Реми's meld/discard, Война's war decision) sat
 * below the fold: the turn clock ran with nothing to press in sight.
 *
 * Scrolls only on the false→true edge of `active`, only if the controls are
 * (partly) off-screen, and by the least amount (`block: "nearest"`) — it never
 * fights a player who scrolls away afterwards.
 */
export function useRevealOnTurn(ref: RefObject<HTMLElement | null>, active: boolean): void {
  const reduced = useSettings((s) => s.reducedMotion);
  const was = useRef(false);
  useEffect(() => {
    const starts = active && !was.current;
    was.current = active;
    if (!starts) return;
    const id = requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.bottom > window.innerHeight || r.top < 0) {
        el.scrollIntoView({ block: "nearest", behavior: reduced ? "auto" : "smooth" });
      }
    });
    return () => cancelAnimationFrame(id);
  }, [active, ref, reduced]);
}
