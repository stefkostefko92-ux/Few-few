// frontend/src/hooks/useMicroInteractions.js
//
// Magnetic-hover and tilt micro-interactions for CTAs/cards — pure DOM +
// inline transform, no dependency. Both hooks:
//   - no-op under `prefers-reduced-motion: reduce` (WCAG 2.3.3 spirit —
//     nothing moves that the user didn't explicitly touch would still not
//     move; this goes further and removes pointer-follow motion too);
//   - no-op on coarse/touch pointers (`pointer: fine` only) — there is no
//     hover state to "follow" on a touchscreen, and it would just be jank;
//   - use `translate3d`/GPU transforms only, never touch layout;
//   - clean up listeners + reset inline style on unmount.
import { useEffect, useRef } from "react";

function motionWelcome() {
  return (
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches &&
    window.matchMedia("(pointer: fine)").matches
  );
}

// The element subtly follows the pointer within its own bounds and springs
// back to rest on leave — classic "magnetic button" feel for primary CTAs.
export function useMagnetic(strength = 14) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !motionWelcome()) return;

    function onMove(e) {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      el.style.transform = `translate3d(${x * strength}px, ${y * strength}px, 0)`;
    }
    function onLeave() {
      el.style.transform = "translate3d(0,0,0)";
    }
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
      el.style.transform = "";
    };
  }, [strength]);
  return ref;
}

// A gentle 3D tilt toward the pointer, for feature/pricing cards.
export function useTiltCard(maxDeg = 5) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !motionWelcome()) return;

    function onMove(e) {
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top) / r.height;
      const rx = (0.5 - py) * maxDeg;
      const ry = (px - 0.5) * maxDeg;
      el.style.transform = `perspective(700px) rotateX(${rx}deg) rotateY(${ry}deg) translateZ(0)`;
    }
    function onLeave() {
      el.style.transform = "";
    }
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
      el.style.transform = "";
    };
  }, [maxDeg]);
  return ref;
}
