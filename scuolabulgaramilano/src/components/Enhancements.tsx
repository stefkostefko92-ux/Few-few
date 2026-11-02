"use client";

import { useEffect } from "react";

// Scroll-reveal animations and animated counters, applied to server-rendered
// markup (elements carry `.reveal` and `[data-count]`). Mirrors the behaviour
// of the original static site, now lifecycle-managed by React.
export default function Enhancements() {
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const reveals = Array.from(document.querySelectorAll<HTMLElement>(".reveal"));
    let io: IntersectionObserver | undefined;
    if (!reduce && "IntersectionObserver" in window) {
      io = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            if (e.isIntersecting) {
              e.target.classList.add("is-visible");
              io!.unobserve(e.target);
            }
          });
        },
        { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
      );
      reveals.forEach((el) => io!.observe(el));
    } else {
      reveals.forEach((el) => el.classList.add("is-visible"));
    }

    const counters = Array.from(document.querySelectorAll<HTMLElement>("[data-count]"));
    const run = (el: HTMLElement) => {
      const target = parseFloat(el.dataset.count || "0");
      const suffix = el.dataset.suffix || "";
      const dur = 1400;
      const start = performance.now();
      const step = (now: number) => {
        const p = Math.min((now - start) / dur, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.round(target * eased).toLocaleString("it-IT") + suffix;
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    let co: IntersectionObserver | undefined;
    if ("IntersectionObserver" in window) {
      co = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            if (e.isIntersecting) { run(e.target as HTMLElement); co!.unobserve(e.target); }
          });
        },
        { threshold: 0.6 }
      );
      counters.forEach((el) => co!.observe(el));
    } else {
      counters.forEach((el) => (el.textContent = (el.dataset.count || "") + (el.dataset.suffix || "")));
    }

    return () => { io?.disconnect(); co?.disconnect(); };
  }, []);

  return null;
}
