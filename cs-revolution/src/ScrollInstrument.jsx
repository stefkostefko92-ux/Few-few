import React, { useEffect, useLayoutEffect, useRef, useState } from "react";

// ═══════════════════════════════════════════════════════════════
// SCROLL INSTRUMENT — the whole site "breathes like a measuring
// device" while you scroll it. A single fixed, aria-hidden HUD layer:
// a vertical caliper rail along the right edge that reads scroll
// depth as a live percentage (a rising "measured" fill + a moving
// notch, like a height gauge / vernier scale), plus a quiet section
// read-out (NN/total + section id) driven by IntersectionObserver.
// The rail's liveliness (glow / notch brightness) tracks scroll
// VELOCITY: fast scroll -> brighter, more "awake"; scroll stops ->
// settles back to a calm, static-looking rest state within ~1s.
//
// Purely additive, purely decorative:
// - position: fixed, pointerEvents: none, aria-hidden, own stacking
//   context. Does not read or write section markup beyond a
//   read-only `querySelectorAll("#main section")` for the NN/total
//   read-out (no classes/attributes added — see App.jsx's own
//   IntersectionObserver-driven "cs-prep/cs-seen" reveal for the
//   pattern this deliberately does NOT touch).
// - Never touches scroll behavior: no scroll-hijack, no snap, no
//   preventDefault. Only a passive `scroll` listener that READS
//   window.scrollY.
// - zIndex 9000: above the fixed engineering grid + all in-page
//   decorative canvases (0/1/2/3/5/7/8) and above section content
//   (5), but below the nav (10000), mobile menu / cookie banner
//   (99999) and the WhatsApp float (99998) — see App.jsx ~L2823 for
//   the grid this intentionally sits beside, not inside.
//
// Reduced-motion / low-power / idle discipline (mirrors
// HeroSignature.jsx's contract exactly):
// - prefers-reduced-motion: reduce OR low-power (Save-Data / 2G) ->
//   "staticFrame" mode: the scroll listener still runs (passive,
//   cheap) and repositions the gauge directly, but NO rAF loop is
//   ever started, no easing, no velocity glow. The instrument still
//   reads correctly; it simply never animates.
// - Otherwise: a rAF loop only runs while the displayed value is
//   still easing toward the scroll target OR velocity is still
//   decaying. Once both have settled (~a few frames after scroll
//   stops), the loop CANCELS ITSELF — back to 0 rAF at rest. Any new
//   `scroll` event restarts it. This is the literal "measures while
//   you look, rests when you stop" behavior asked for.
// - Paused on document.hidden (tab backgrounded) and resumed on
//   return, same as HeroSignature.
// - Section-change "bite" pulse (a brief ring that expands and fades
//   around the notch, on its own element so it never fights the
//   per-frame velocity glow) is a single CSS transition per change, gated by
//   reduced-motion, and can only fire as often as a human scrolls
//   past a section boundary — nowhere near the 3-flashes/sec WCAG
//   2.3.1 threshold by construction (this is not a repeating loop).
// - Mobile (<=768px, via matchMedia, listened for live changes): a
//   thinner rail, fewer tick marks (majors only, no minor 5% ticks),
//   and the NN/total + section-id line is hidden entirely — "more
//   discreet, fewer elements" per spec, not a second implementation.
//
// Tokens duplicated here on purpose (own module, no shared export
// from App.jsx) — keep in sync with App.jsx / HeroSignature.jsx if
// the "Tolerance" palette ever changes.
// ═══════════════════════════════════════════════════════════════

var C = "#00e5ff";
var CR = "0,229,255";
var INK2 = "#7C868D";
var MONO = "'Space Mono',ui-monospace,monospace";
var EASE = "cubic-bezier(.22,1,.36,1)";

function prefersReducedMotion() {
  try {
    return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  } catch (e) {
    return false;
  }
}

function isLowPower() {
  try {
    var c = navigator.connection;
    return !!(c && (c.saveData || /(^|-)2g$/.test(c.effectiveType || "")));
  } catch (e) {
    return false;
  }
}

// Tick gradations: 21 marks every 5%, majors every 25% (index % 5 === 0).
var TICKS = (function () {
  var out = [];
  for (var i = 0; i <= 20; i++) out.push({ pct: i * 5, major: i % 5 === 0 });
  return out;
})();
var MAJOR_TICKS = TICKS.filter(function (t) { return t.major; });

export default function ScrollInstrument() {
  var railRef = useRef(null);
  var fillRef = useRef(null);
  var indicatorRef = useRef(null);
  var notchRef = useRef(null);
  var glowRef = useRef(null);
  var biteRef = useRef(null);
  var valueRef = useRef(null);
  var readoutRef = useRef(null);
  var sectionTextRef = useRef(null);
  // Last known depth/velocity, kept OUTSIDE the effect below so a compact
  // (mobile breakpoint) state change — which re-renders this component and
  // would otherwise reset the indicator's inline `top`/`height` back to
  // their static JSX defaults ("0%") — can be corrected before paint.
  var lastRef = useRef({ depth: 0, velocity: 0, sectionText: "" });

  var [compact, setCompact] = useState(function () {
    try { return window.innerWidth <= 768; } catch (e) { return false; }
  });

  // ── Depth + velocity engine (refs only — no per-frame React state) ──
  useEffect(function () {
    var staticMode = prefersReducedMotion() || isLowPower();
    var rafId = null;
    var targetDepth = 0;
    var displayDepth = 0;
    var velocityRaw = 0;
    var velocitySmoothed = 0;
    var lastY = window.scrollY || 0;
    var lastT = performance.now();
    var visible = !document.hidden;

    function render(depth, velocity) {
      lastRef.current.depth = depth;
      lastRef.current.velocity = velocity || 0;
      var pct = (depth * 100).toFixed(2);
      if (fillRef.current) fillRef.current.style.height = pct + "%";
      if (indicatorRef.current) indicatorRef.current.style.top = pct + "%";
      if (valueRef.current) valueRef.current.textContent = (depth * 100).toFixed(1);
      if (readoutRef.current) readoutRef.current.style.opacity = depth > 0.015 ? '1' : '0';
      var v = velocity || 0;
      if (glowRef.current) {
        var alpha = Math.min(1, 0.22 + v * 0.65);
        glowRef.current.style.opacity = alpha.toFixed(2);
        glowRef.current.style.transform = "translate(-50%,-50%) scale(" + (1 + v * 0.55).toFixed(2) + ")";
      }
      if (notchRef.current) {
        var spread = (2 + v * 7).toFixed(1);
        var notchAlpha = (0.55 + v * 0.45).toFixed(2);
        notchRef.current.style.boxShadow = "0 0 " + spread + "px rgba(" + CR + "," + notchAlpha + ")";
      }
    }

    function currentDepth() {
      var y = window.scrollY || document.documentElement.scrollTop || 0;
      var max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      return Math.min(1, Math.max(0, y / max));
    }

    // Static-frame path: exact position on scroll, zero rAF, ever.
    function onScrollStatic() {
      render(currentDepth(), 0);
    }

    function loop() {
      if (!visible) { rafId = null; return; }
      displayDepth += (targetDepth - displayDepth) * 0.16;
      velocitySmoothed += (velocityRaw - velocitySmoothed) * 0.14;
      velocityRaw *= 0.90; // decays on its own even without new scroll events
      render(displayDepth, velocitySmoothed);
      var settled =
        Math.abs(targetDepth - displayDepth) < 0.0006 &&
        velocitySmoothed < 0.01 &&
        velocityRaw < 0.01;
      if (settled) { rafId = null; return; } // back to 0 rAF at rest
      rafId = requestAnimationFrame(loop);
    }
    function startLoop() {
      if (rafId || !visible) return;
      rafId = requestAnimationFrame(loop);
    }

    function onScroll() {
      var now = performance.now();
      var y = window.scrollY || document.documentElement.scrollTop || 0;
      targetDepth = currentDepth();
      var dt = Math.max(1, now - lastT);
      var dy = Math.abs(y - lastY);
      var v = Math.min(1, (dy / dt) / 3);
      if (v > velocityRaw) velocityRaw = v; // instant spike, eased decay in loop()
      lastY = y; lastT = now;
      startLoop();
    }

    if (staticMode) {
      onScrollStatic(); // initial paint
      window.addEventListener("scroll", onScrollStatic, { passive: true });
    } else {
      render(currentDepth(), 0); // initial paint, no motion yet
      window.addEventListener("scroll", onScroll, { passive: true });
    }

    // Reflow (resize / orientation / late-loading fonts+images changing height)
    // shifts the scrollHeight-innerHeight denominator; repaint so the fill/notch
    // don't stay stale until the next scroll.
    function onResize() {
      if (staticMode) onScrollStatic();
      else { targetDepth = currentDepth(); startLoop(); }
    }
    window.addEventListener("resize", onResize, { passive: true });

    function onVisibility() {
      visible = !document.hidden;
      if (visible && !staticMode) startLoop();
    }
    document.addEventListener("visibilitychange", onVisibility);

    return function () {
      if (rafId) cancelAnimationFrame(rafId);
      if (staticMode) window.removeEventListener("scroll", onScrollStatic);
      else window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // ── Active section read-out (read-only observer; no markup changes) ──
  useEffect(function () {
    if (!("IntersectionObserver" in window)) return;
    var reduced = prefersReducedMotion();
    // Only real, labelled sections — skip hero (App's own reveal-observer skips it
    // too) and any id-less section, so NN/total and the label stay consistent.
    var els = [].slice.call(document.querySelectorAll("#main section")).filter(function (s) {
      return s.id && s.id !== "hero";
    });
    if (!els.length) return;
    var total = els.length;
    var lastIdx = -1;
    var firstFire = true;

    // A one-shot CSS-transition pulse on its OWN element (never touched by
    // the per-frame rAF glow writes on glowRef) so the two can never fight
    // over a lingering `transition` mid-animation.
    function bite() {
      if (reduced || !biteRef.current) return;
      var el = biteRef.current;
      el.style.transition = "none";
      el.style.opacity = "0.9";
      el.style.transform = "translate(-50%,-50%) scale(1)";
      void el.offsetHeight; // force reflow so the transition below actually animates
      el.style.transition = "opacity .8s " + EASE + ", transform .8s " + EASE;
      el.style.opacity = "0";
      el.style.transform = "translate(-50%,-50%) scale(2.6)";
    }

    var io = new IntersectionObserver(function (entries) {
      var best = null;
      entries.forEach(function (en) {
        if (en.isIntersecting && (!best || en.intersectionRatio > best.intersectionRatio)) best = en;
      });
      if (!best) return;
      var idx = els.indexOf(best.target);
      if (idx < 0 || idx === lastIdx) return;
      lastIdx = idx;
      var label = (best.target.id || "").toUpperCase();
      var num = String(idx + 1).padStart(2, "0");
      var text = num + "/" + total + (label ? " · " + label : "");
      lastRef.current.sectionText = text; // survives a compact-toggle remount
      if (sectionTextRef.current) sectionTextRef.current.textContent = text;
      if (!firstFire) bite();
      firstFire = false;
    }, { threshold: [0, 0.25, 0.5, 0.75, 1], rootMargin: "-42% 0px -42% 0px" });

    els.forEach(function (s) { io.observe(s); });
    return function () { io.disconnect(); };
  }, []);

  // ── Compact (mobile) breakpoint — live, via matchMedia ──
  useEffect(function () {
    if (!(window.matchMedia)) return;
    var mq = window.matchMedia("(max-width: 768px)");
    function onChange(e) { setCompact(e.matches); }
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else if (mq.addListener) mq.addListener(onChange);
    return function () {
      if (mq.removeEventListener) mq.removeEventListener("change", onChange);
      else if (mq.removeListener) mq.removeListener(onChange);
    };
  }, []);

  // Re-stamp the indicator/fill/value immediately after any render caused
  // by `compact` flipping — before the browser paints — so a breakpoint
  // cross never shows a one-frame jump back to the top of the rail.
  useLayoutEffect(function () {
    var d = lastRef.current.depth, v = lastRef.current.velocity;
    var pct = (d * 100).toFixed(2);
    if (fillRef.current) fillRef.current.style.height = pct + "%";
    if (indicatorRef.current) indicatorRef.current.style.top = pct + "%";
    if (valueRef.current) valueRef.current.textContent = (d * 100).toFixed(1);
    if (readoutRef.current) readoutRef.current.style.opacity = d > 0.015 ? '1' : '0';
    if (glowRef.current) {
      var alpha = Math.min(1, 0.22 + v * 0.65);
      glowRef.current.style.opacity = alpha.toFixed(2);
      glowRef.current.style.transform = "translate(-50%,-50%) scale(" + (1 + v * 0.55).toFixed(2) + ")";
    }
    if (sectionTextRef.current && lastRef.current.sectionText) {
      sectionTextRef.current.textContent = lastRef.current.sectionText;
    }
  }, [compact]);

  var ticks = compact ? MAJOR_TICKS : TICKS;
  var railWidth = compact ? 1 : 1;
  var tickReach = compact ? 8 : 12;
  var tickReachMinor = compact ? 5 : 7;

  return (
    <div aria-hidden="true" style={{ position: "fixed", inset: 0, zIndex: 9000, pointerEvents: "none" }}>
      <div
        ref={railRef}
        style={{
          position: "absolute",
          right: "clamp(10px,2vw,20px)",
          top: "clamp(76px,12vh,108px)",
          bottom: "clamp(104px,16vh,148px)",
          width: railWidth
        }}
      >
        {/* baseline */}
        <div style={{ position: "absolute", top: 0, bottom: 0, right: 0, width: 1, background: "rgba(201,209,214,.16)" }} />

        {/* rising "measured" fill from the top of the rail down to current depth */}
        <div
          ref={fillRef}
          style={{
            position: "absolute",
            top: 0, right: 0, width: 1, height: "0%",
            background: "linear-gradient(to bottom, rgba(" + CR + ",.08), rgba(" + CR + ",.55))"
          }}
        />

        {/* static tick gradations — never touched after mount, effectively free */}
        {ticks.map(function (tk) {
          return (
            <div key={tk.pct} style={{ position: "absolute", top: tk.pct + "%", right: 0, transform: "translateY(-50%)" }}>
              <div
                style={{
                  width: tk.major ? tickReach : tickReachMinor,
                  height: 1,
                  background: tk.major ? "rgba(201,209,214,.4)" : "rgba(201,209,214,.22)"
                }}
              />
              {!compact && tk.major && (
                <span
                  style={{
                    position: "absolute", right: tickReach + 6, top: "50%", transform: "translate(0,-50%)",
                    fontFamily: MONO, fontSize: 7, letterSpacing: ".08em", color: INK2, opacity: 0.45, whiteSpace: "nowrap"
                  }}
                >
                  {tk.pct}
                </span>
              )}
            </div>
          );
        })}

        {/* moving indicator: notch + glow + numeric/section read-out */}
        <div ref={indicatorRef} style={{ position: "absolute", left: 0, right: 0, top: "0%" }}>
          <div
            ref={biteRef}
            aria-hidden="true"
            style={{
              position: "absolute", right: 0, top: 0, width: 9, height: 9, borderRadius: "50%",
              border: "1px solid rgba(" + CR + ",.9)",
              transform: "translate(-50%,-50%) scale(1)", opacity: 0
            }}
          />
          <div
            ref={glowRef}
            style={{
              position: "absolute", right: 0, top: 0, width: 9, height: 9, borderRadius: "50%",
              background: "rgba(" + CR + ",.55)", filter: "blur(2px)",
              transform: "translate(-50%,-50%) scale(1)", opacity: 0.3
            }}
          />
          <div
            ref={notchRef}
            style={{
              position: "absolute", right: -1, top: 0, width: (compact ? 14 : 18), height: 1.5,
              background: C, transform: "translateY(-50%)",
              boxShadow: "0 0 3px rgba(" + CR + ",.5)"
            }}
          />
          {/* Hidden at the very top: nothing is measured yet, and it would sit
              on top of the hero's blueprint coordinates. Fades in on scroll. */}
          <div
            ref={readoutRef}
            style={{
              position: "absolute", right: (compact ? 20 : 26), top: 0, transform: "translateY(-50%)",
              textAlign: "right", whiteSpace: "nowrap",
              opacity: 0, transition: "opacity .35s " + EASE
            }}
          >
            {!compact && (
              <div style={{ fontFamily: MONO, fontSize: 7, letterSpacing: ".22em", color: INK2, opacity: 0.6 }}>
                DEPTH
              </div>
            )}
            <div style={{ fontFamily: MONO, fontSize: compact ? 10 : 12, color: C, lineHeight: 1.3 }}>
              <span ref={valueRef}>0.0</span>
              <span style={{ fontSize: 8, marginLeft: 2, color: INK2 }}>%</span>
            </div>
            {!compact && (
              <div
                ref={sectionTextRef}
                style={{ fontFamily: MONO, fontSize: 7, letterSpacing: ".1em", color: INK2, opacity: 0.7, marginTop: 1 }}
              >
                --/--
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
