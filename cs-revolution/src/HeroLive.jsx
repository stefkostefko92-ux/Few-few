import React, { useEffect, useRef, useState } from "react";

// ═══════════════════════════════════════════════════════════════
// HeroLive — живата сцена на началната страница.
//
// Монограмата CS като фрезован детайл върху лакиран карбон (Blender Cycles, marketing/blender/hero.py).
// Под всичко стои НЕПОДВИЖНИЯТ кадър (<picture>, LCP, работи и без JS). След събитието load върху него
// се качва платното на public/js/cs-live.js: студийната светлина се плъзга по метала и плетката,
// лазерният скенер минава през емблемата и отива там, където сочи курсорът, циан контурът „диша“.
//
// Достъпност (умение motion-a11y, WCAG 2.2.2 и 2.3.1):
//  - prefers-reduced-motion → скриптът изобщо не се зарежда, остава кадърът;
//  - движението върви постоянно, затова има бутон „пауза“ (пази се в localStorage);
//  - платното е aria-hidden и не лови събития; нищо не мига.
// Същата геометрия (object-fit: cover + фокусна точка) е и в мигновения кадър в index.html (#cs-boot),
// за да няма разместване при поемането от React.
// ═══════════════════════════════════════════════════════════════

// Вертикалният кадър е за тесен И изправен екран. Телефон на една страна получава широкия кадър с
// подредбата за компютър — иначе емблемата заема целия екран, а заглавието отива под него.
var NARROW = "(max-width:860px) and (max-aspect-ratio:1/1)";
// фокусната точка трябва да съвпада с object-position на .cs-hl-img (тук долу и в index.html). При
// вертикалния кадър кутията е точно 2:3 (виж --hw), затова няма изрязване.
var SETS = { wide: { key: "hero", fit: { x: 0.80, y: 0.5 } }, tall: { key: "herop", fit: { x: 0.5, y: 0.5 } } };
var DIR = "/brand/live/";
// ?v=<хеш на двигателя и слоевете> (vite.config.js): файловете са с постоянни имена, а сървърът ги кешира
// за година — версията в адреса е единственият начин поправка или нов рендер да стигнат до посетителя.
// Същата стойност е в index.html (%CS_LIVE_V%) — адресите трябва да съвпадат с предварително заредените.
/* global __CS_LIVE_V__ */
var V = "?v=" + __CS_LIVE_V__;

function loadEngine() {
  return new Promise(function (ok, bad) {
    if (window.CSLive) return ok();
    var s = document.createElement("script");
    s.src = "/js/cs-live.js" + V;
    s.async = true;
    s.onload = function () { ok(); };
    s.onerror = bad;
    document.head.appendChild(s);
  });
}

export default function HeroLive(props) {
  var host = useRef(null);
  var api = useRef(null);
  // "none" — няма движение (reduced-motion или двигателят не тръгна); "on" — върви; "off" — на пауза
  var st = useState("none"), mode = st[0], setMode = st[1];

  useEffect(function () {
    if (!window.matchMedia) return;
    var mqR = matchMedia("(prefers-reduced-motion: reduce)");
    if (mqR.matches) return;
    var gone = false, wantOff = false, loading = false;
    try { wantOff = localStorage.getItem("cs-motion") === "off"; } catch (e) { /* без localStorage */ }
    var mq = matchMedia(NARROW);

    function mount() {
      if (gone || loading || api.current || !host.current) return;
      loading = true;
      var set = mq.matches ? SETS.tall : SETS.wide, k = DIR + set.key;
      loadEngine().then(function () { return fetch(k + ".json" + V); }).then(function (r) { return r.json(); }).then(function (m) {
        if (gone || !host.current) return null;
        return window.CSLive.mount(host.current, {
          base: k + "-base.webp" + V, sweep: k + "-sweep.webp" + V, flood: k + "-flood.webp" + V, pos: k + "-pos.png" + V, glow: k + "-glow.webp" + V,
          sweeps: m.sweeps, sMin: m.sMin, sMax: m.sMax, s0: m.s0, scan: m.scan, phi0: m.phi0, fit: set.fit,
          auto: "loop", laserWidth: 0.075, dpr: mq.matches ? 1.25 : 1.5,
          // вертикалният кадър е за екрани без курсор и не го следи: в тесен прозорец на компютър лазерът и
          // голямото отражение на пода заемат твърде голям дял от зрителното поле — при мятане на мишката
          // измерването стига точно прага от 3 проблясъка/s, без запас; автоматичното движение е 1/s
          pointer: !mq.matches,
          // двигателят се е изключил сам (слаб графичен процесор, загубен контекст, включено „намалено
          // движение“): остава неподвижният кадър и бутонът изчезва — няма какво да се паузира
          // (destroy() от нас — завъртане на телефона, размонтиране — първо нулира api.current, затова не се брои)
          onDead: function () { if (!api.current) return; api.current = null; if (!gone) setMode("none"); }
        });
      }).then(function (a) {
        loading = false;
        if (!a) { if (!gone) setMode("none"); return; }
        if (gone) { a.destroy(); return; }
        api.current = a;
        if (wantOff) a.pause();                                // натиснали са „пауза“, докато се е зареждало
        setMode(wantOff ? "off" : "on");
      }).catch(function () { loading = false; if (!gone) setMode("none"); });
    }
    // смяна на кадъра (завъртане на телефона): на пауза остава неподвижният кадър И бутонът за пускане
    function swap() {
      var a = api.current;
      if (a) { api.current = null; a.destroy(); }
      if (mqR.matches) return;
      if (wantOff) setMode("off"); else mount();
    }
    function start() { (window.requestIdleCallback || function (f) { setTimeout(f, 500); })(function () { if (wantOff) setMode("off"); else mount(); }, { timeout: 2500 }); }

    if (document.readyState === "complete") start(); else window.addEventListener("load", start, { once: true });
    if (mq.addEventListener) mq.addEventListener("change", swap);
    host.current.__toggle = function () {
      wantOff = !wantOff;
      setMode(wantOff ? "off" : "on");
      try { if (wantOff) localStorage.setItem("cs-motion", "off"); else localStorage.removeItem("cs-motion"); } catch (e) { /* без localStorage */ }
      if (api.current) { if (wantOff) api.current.pause(); else api.current.resume(); } else if (!wantOff) mount();
    };
    return function () {
      gone = true;
      window.removeEventListener("load", start);
      if (mq.removeEventListener) mq.removeEventListener("change", swap);
      if (api.current) { var a = api.current; api.current = null; a.destroy(); }
    };
  }, []);

  return (
    <>
      <div ref={host} className="cs-hl" aria-hidden="true">
        <picture>
          <source media={NARROW} srcSet={DIR + "herop-poster-720.webp" + V + " 720w, " + DIR + "herop-poster.webp" + V + " 1080w"} sizes="100vw" />
          <img className="cs-hl-img" src={DIR + "hero-poster.webp" + V} srcSet={DIR + "hero-poster-1280.webp" + V + " 1280w, " + DIR + "hero-poster.webp" + V + " 1920w"} sizes="100vw"
            alt="" width={1920} height={1080} fetchPriority="high" decoding="async" />
        </picture>
      </div>
      <div className="cs-hl-shade" aria-hidden="true" />
      {mode !== "none" && (
        <button type="button" className="cs-hl-pause"
          aria-label={mode === "on" ? props.pauseLabel : props.playLabel} title={mode === "on" ? props.pauseLabel : props.playLabel}
          onClick={function () { if (host.current && host.current.__toggle) host.current.__toggle(); }}>
          {mode === "on"
            ? <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M2 1h3v10H2zM7 1h3v10H7z" fill="currentColor" /></svg>
            : <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M2.5 1l8 5-8 5z" fill="currentColor" /></svg>}
        </button>
      )}
    </>
  );
}

// Стиловете на сцената; влизат в общия <style> на App.jsx (и огледално в #cs-boot в index.html).
export var HERO_LIVE_CSS =
  ".cs-hl{position:absolute;inset:0;z-index:0;overflow:hidden;background:#0A0C0E}" +
  ".cs-hl-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:80% 50%;display:block}" +
  ".cs-hl-shade{position:absolute;inset:0;z-index:1;pointer-events:none;background:" +
    "linear-gradient(90deg,rgba(10,12,14,.86) 0,rgba(10,12,14,.6) 30%,rgba(10,12,14,0) 56%)," +
    "linear-gradient(0deg,#0A0C0E 0,rgba(10,12,14,.5) 14%,rgba(10,12,14,0) 34%)," +
    "linear-gradient(180deg,rgba(10,12,14,.7) 0,rgba(10,12,14,0) 16%)}" +
  ".cs-hl-pause{position:absolute;z-index:6;right:clamp(20px,5vw,64px);top:168px;width:34px;height:34px;display:grid;place-items:center;" +
    "background:rgba(10,12,14,.55);border:1px solid rgba(0,229,255,.35);color:#00e5ff;padding:0;transition:background .2s,border-color .2s}" +
  ".cs-hl-pause:hover,.cs-hl-pause:focus-visible{background:rgba(0,229,255,.12);border-color:#00e5ff}" +
  // мястото на навигацията: на нисък екран съдържанието е по-високо от него и иначе влиза под лентата
  "#hero{padding-top:96px!important}" +
  "@media(max-height:560px){.cs-hl-pause{top:74px}}" +
  ".cs-hero-h1{max-width:min(16ch,43vw)!important}" +
  // над ~1640 px центрираната колона (1180 px) би избутала заглавието върху поставката на емблемата (тя
  // започва на ~42% от ширината), затова лявото поле спира да расте на 10vw
  ".cs-hero-col{margin-left:max(0px,min(calc((100% - 1180px)/2),10vw))!important;margin-right:auto!important}" +
  "@media(max-width:1180px){.cs-hero-eb,.cs-hero-sub{max-width:40vw;line-height:1.9}}" +
  // Изправен тесен екран: сцената е закотвена ГОРЕ с ширина --hw (кутия точно 2:3, без изрязване), а текстът
  // започва под поставката на емблемата (тя е на 50% от височината на кадъра = 0.75 × --hw). Така на нисък
  // телефон заглавието никога не застъпва емблемата — секцията просто става по-висока от екрана.
  "@media(max-width:860px) and (max-aspect-ratio:1/1){" +
    "#hero{--hw:max(100vw,min(118vw,600px));padding-top:calc(var(--hw)*.8)!important}" +
    ".cs-hl{inset:auto;top:0;left:50%;width:var(--hw);height:calc(var(--hw)*1.5);transform:translateX(-50%);background:none;" +
      "-webkit-mask-image:linear-gradient(180deg,#000 0,#000 56%,transparent 90%);mask-image:linear-gradient(180deg,#000 0,#000 56%,transparent 90%)}" +
    ".cs-hl-img{object-position:50% 50%}" +
    ".cs-hl-shade{background:linear-gradient(180deg,rgba(10,12,14,.72) 0,rgba(10,12,14,0) 120px,rgba(10,12,14,0) calc(var(--hw)*.72),rgba(10,12,14,.8) calc(var(--hw)*.9),#0A0C0E calc(var(--hw)*1.36))}" +
    ".cs-hl-pause{top:74px;right:16px}" +
    ".cs-hero-h1{max-width:16ch!important}.cs-hero-eb,.cs-hero-sub{max-width:none;line-height:inherit}" +
    ".cs-hero-col{margin-left:auto!important}}" +
  "@media(prefers-reduced-motion:reduce){.cs-hl-pause{display:none}}";
