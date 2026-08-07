// frontend/src/hooks/useScrollReveal.js
//
// GSAP + ScrollTrigger section reveals — strict progressive enhancement:
//   - Every [data-reveal] element is fully visible in the DOM/CSS by
//     default (no FOUC, works with zero JS). This hook only ADDS a
//     fade + rise-in animation triggered on scroll; it never hides content
//     that JS might fail to reach.
//   - Entirely skipped under `prefers-reduced-motion: reduce` — the content
//     is already visible, so "skipped" means "nothing to undo".
//   - GSAP/ScrollTrigger are dynamically imported (own chunk, downloaded
//     only post-idle) so they never sit on Login.jsx's eager/LCP-critical
//     main chunk.
//   - `once: true` per element — this is a one-shot reveal, not a repeating
//     >5s loop, so WCAG 2.2.2 (auto-updating content needs pause/stop) does
//     not apply; nothing here loops.
import { useEffect } from "react";

let gsapPromise;
function loadGsap() {
  if (!gsapPromise) {
    gsapPromise = Promise.all([import("gsap"), import("gsap/ScrollTrigger")]).then(
      ([gsapMod, stMod]) => {
        const gsap = gsapMod.gsap || gsapMod.default;
        const ScrollTrigger = stMod.ScrollTrigger || stMod.default;
        gsap.registerPlugin(ScrollTrigger);
        return { gsap, ScrollTrigger };
      }
    );
  }
  return gsapPromise;
}

export function useScrollReveal(rootRef) {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!rootRef.current) return;

    let ctx;
    let cancelled = false;
    loadGsap()
      .then(({ gsap }) => {
        if (cancelled || !rootRef.current) return;
        const targets = rootRef.current.querySelectorAll("[data-reveal]");
        ctx = gsap.context(() => {
          targets.forEach((el) => {
            // Anything already inside the viewport by the time GSAP finishes
            // loading (async import) is left alone — hiding it now and
            // fading it back in would be a visible flash, the opposite of
            // progressive enhancement. Only elements the user hasn't
            // scrolled to yet get the entrance treatment.
            const rect = el.getBoundingClientRect();
            if (rect.top < window.innerHeight * 0.9) return;
            gsap.fromTo(
              el,
              { opacity: 0, y: 28 },
              {
                opacity: 1,
                y: 0,
                duration: 0.7,
                ease: "power2.out",
                scrollTrigger: { trigger: el, start: "top 88%", once: true },
              }
            );
          });
        }, rootRef.current);
      })
      .catch(() => {
        // GSAP failed to load (offline, blocked, etc.) — content is already
        // visible by default, so there is nothing to fall back to; no-op.
      });

    return () => {
      cancelled = true;
      ctx?.revert();
    };
  }, [rootRef]);
}
