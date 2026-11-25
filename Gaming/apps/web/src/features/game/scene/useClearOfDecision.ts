import { useEffect } from "react";
import { useSettings } from "../../../lib/settings";

/**
 * Keep the part of the table a decision is made by in view next to the
 * decision popup (DecisionPrompt). The popup is `fixed` to the viewport, the
 * table scrolls: on a 768px laptop the page is often scrolled to the controls
 * under the table, and the popup then sat right on top of the hand (Реми) or
 * of the tied cards (Война).
 *
 * When the popup for `key` comes up over `select()`'s element, the page is
 * scrolled by the least amount that clears it — the element goes above the
 * popup if its middle is above the popup's, else below (or the other way when
 * the page cannot scroll that far). `side: "below"` always brings it below
 * (what sits under it on the table comes along). Once per decision.
 */
export function useClearOfDecision(
  select: () => HTMLElement | null | undefined,
  open: boolean,
  key: string,
  side: "auto" | "below" = "auto",
): void {
  const reduced = useSettings((s) => s.reducedMotion);
  useEffect(() => {
    if (!open) return;
    // after the popup's entrance (260ms): its box is final then
    const id = setTimeout(() => {
      const prompt = document.querySelector<HTMLElement>(`[data-decision-key="${CSS.escape(key)}"]`);
      const el = select();
      if (!prompt || !el) return;
      const p = prompt.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      if (r.bottom <= p.top || r.top >= p.bottom || r.right <= p.left || r.left >= p.right) return;
      // the element above the popup (scroll down) or below it (scroll up) —
      // the nearer side first, the other one when the page cannot scroll so far
      const up = r.bottom - (p.top - 8);
      const down = r.top - (p.bottom + 8);
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const fits = (by: number) => window.scrollY + by >= 0 && window.scrollY + by <= max;
      const near = r.top + r.height / 2 < p.top + p.height / 2 ? up : down;
      const far = near === up ? down : up;
      const by = side === "below" ? down : fits(near) || !fits(far) ? near : far;
      window.scrollBy({ top: by, behavior: reduced ? "auto" : "smooth" });
    }, 300);
    return () => clearTimeout(id);
    // `select` is a fresh closure each render — the decision is `key`.
  }, [open, key, reduced, side]);
}
