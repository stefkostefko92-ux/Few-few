import React, { useState, useEffect, useRef, useCallback } from "react";

// ═══════════════════════════════════════════════════════════════════════════
// Command Center — админ панелът на carbonstealth.eu (страница /admin/, admin-main.jsx).
//
// Вход: имейл + парола → 6-цифрен код от приложение (или резервен код) — api/admin-auth.php.
// Сесията е в бисквитка, която JavaScript не вижда (HttpOnly); тук няма токен, пароли или
// sessionStorage. Всяка заявка носи X-CS-Admin: 1 (CSRF) и бисквитката (same-origin).
// 401 от която и да е заявка = сесията е изтекла → обратно на входа. След 30 мин без действие
// панелът сам излиза (сървърът така или иначе отказва), а при скрит раздел не опитва нищо.
// ═══════════════════════════════════════════════════════════════════════════

const AUTH = "/api/admin-auth.php";

function api(url, opts) {
  const o = Object.assign({ credentials: "same-origin" }, opts || {});
  o.headers = Object.assign({ "X-CS-Admin": "1" }, (opts && opts.headers) || {});
  return fetch(url, o);
}
async function jsonOf(r) { try { return await r.json(); } catch (e) { return {}; } }
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
const fmtTime = (t) => new Date(t).toLocaleTimeString("bg-BG", { hour: "2-digit", minute: "2-digit" });
const fmtDT = (t) => (t ? new Date(t).toLocaleString("bg-BG", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");
const safeHref = (u) => (typeof u === "string" && /^https?:\/\//i.test(u) ? u : "#");

// Сайтовете, които панелът пинга от браузъра (всички са в connect-src на CSP за /admin/ в nginx).
const SITES = [
  { name: "carbonstealth.eu", label: "Carbon Stealth", type: "Фирмен сайт", tech: "React · Vite · PHP" },
  { name: "zabobovdol.carbonstealth.eu", label: "За Бобов дол", type: "Граждански портал", tech: "Next.js · Prisma" },
  { name: "korpora.carbonstealth.eu", label: "Korpora", type: "Мебели · CNC", tech: "Node · TS · three.js" },
  { name: "rilievi.carbonstealth.eu", label: "Rilievi Impianti", type: "Асансьори", tech: "Node · TS · Express" },
  { name: "fakturist.carbonstealth.eu", label: "Фактурист", type: "Е-фактури", tech: "Node · TS · Express" },
  { name: "erp.carbonstealth.eu", label: "ERP Ascensori", type: "ERP", tech: "React · Prisma" },
  { name: "nexus.carbonstealth.eu", label: "Nexus Dominion", type: "Браузър игра", tech: "React · Node" },
  { name: "tretimart.carbonstealth.eu", label: "Трети Март", type: "Маркетплейс", tech: "React · Node" },
  { name: "ouvaptsarov.com", label: "ОУ „Н. Й. Вапцаров“", type: "Училище", tech: "React · PHP" },
  { name: "vizitka-bg.com", label: "Vizitka", type: "QR визитка", tech: "Express · SQLite" },
  { name: "mastilko-bg.com", label: "Мастилко", type: "Печат", tech: "Next.js" },
].map((s) => Object.assign({ url: "https://" + s.name }, s));

// ── иконки (собствени, щрих 1.6) ────────────────────────────────────────────
const IC = {
  dashboard: "M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z",
  sites: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z",
  system: "M4 5h16v6H4zM4 13h16v6H4zM8 8h.01M8 16h.01",
  contacts: "M4 6h16v12H4zM4 7l8 6 8-6",
  analyzer: "M5 18a8 8 0 1 1 14 0M12 14l4-5",
  indexnow: "M13 3L5 14h6l-1 7 8-11h-6z",
  campaigns: "M4 12l16-8-6 16-3-6zM11 14l9-10",
  crm: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c.8-3.4 3.4-5.5 6.5-5.5s5.7 2.1 6.5 5.5M16 4.3a3.5 3.5 0 0 1 0 6.4M18 14.8c1.8.8 3 2.6 3.5 5.2",
  revenue: "M17 6.5A6.5 6.5 0 1 0 17 17.5M4 10.5h9M4 13.5h9",
  tasks: "M4 5h16v14H4zM8 12l2.5 2.5L16 9",
  logs: "M5 6h14M5 10h14M5 14h9M5 18h6",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  refresh: "M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7",
  logout: "M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10",
  menu: "M4 7h16M4 12h16M4 17h16",
  shield: "M12 3l7 3v6c0 4.4-3 7.7-7 9-4-1.3-7-4.6-7-9V6z",
  download: "M12 4v11M7 10l5 5 5-5M5 20h14",
  plus: "M12 5v14M5 12h14",
  x: "M6 6l12 12M18 6L6 18",
  ext: "M14 4h6v6M20 4l-9 9M18 14v6H4V6h6",
  key: "M15 7a4 4 0 1 1-3.5 6L5 19.5 3.5 18l1.5-1.5L3.5 15 5 13.5l1.5 1.5 4-4A4 4 0 0 1 15 7z",
};
function Icon({ n, s = 18 }) {
  return (
    <svg className="adm-ic" width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={IC[n]} />
    </svg>
  );
}

// ── графики (canvas, остри на HiDPI, преоразмеряват се) ──────────────────────
function useCanvas(draw, deps) {
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const paint = () => {
      const r = cv.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(10, Math.round(r.width)), h = Math.max(10, Math.round(r.height));
      if (cv.width !== w * dpr || cv.height !== h * dpr) { cv.width = w * dpr; cv.height = h * dpr; }
      const ctx = cv.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      draw(ctx, w, h);
    };
    paint();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(paint) : null;
    if (ro) ro.observe(cv);
    return () => { if (ro) ro.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return ref;
}
const CY = "#00E5FF";
function Spark({ data, color = CY, h = 28 }) {
  const ref = useCanvas((ctx, w, hh) => {
    const d = (data || []).filter((v) => typeof v === "number" && isFinite(v));
    if (d.length < 2) { ctx.strokeStyle = "rgba(201,209,214,.10)"; ctx.beginPath(); ctx.moveTo(0, hh - 1); ctx.lineTo(w, hh - 1); ctx.stroke(); return; }
    const lo = Math.min(...d), hi = Math.max(...d), rg = hi - lo || 1;
    const X = (i) => (i / (d.length - 1)) * (w - 4) + 2, Y = (v) => hh - 3 - ((v - lo) / rg) * (hh - 8);
    const g = ctx.createLinearGradient(0, 0, 0, hh); g.addColorStop(0, color + "33"); g.addColorStop(1, color + "00");
    ctx.beginPath(); ctx.moveTo(X(0), hh); d.forEach((v, i) => ctx.lineTo(X(i), Y(v))); ctx.lineTo(X(d.length - 1), hh); ctx.closePath(); ctx.fillStyle = g; ctx.fill();
    ctx.beginPath(); d.forEach((v, i) => (i ? ctx.lineTo(X(i), Y(v)) : ctx.moveTo(X(i), Y(v)))); ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.beginPath(); ctx.arc(X(d.length - 1), Y(d[d.length - 1]), 2.5, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
  }, [JSON.stringify(data), color]);
  return <canvas ref={ref} className="adm-canvas" style={{ height: h }} aria-hidden="true" />;
}
function LineChart({ data, color = CY, h = 160, unit = "" }) {
  const ref = useCanvas((ctx, w, hh) => {
    const d = (data || []).filter((v) => typeof v === "number" && isFinite(v));
    const pl = 40, pr = 10, pt = 10, pb = 8, W = w - pl - pr, H = hh - pt - pb;
    let lo = d.length ? Math.min(...d) : 0, hi = d.length ? Math.max(...d) : 1; if (hi <= lo) hi = lo + 1;
    const m = (hi - lo) * 0.2, yMax = hi + m, yMin = Math.max(0, lo - m), yR = yMax - yMin || 1;
    ctx.font = "10px 'JetBrains Mono',monospace"; ctx.textAlign = "right"; ctx.textBaseline = "middle";
    for (let g = 0; g <= 3; g++) {
      const y = pt + H * (g / 3);
      ctx.strokeStyle = "rgba(201,209,214,.07)"; ctx.beginPath(); ctx.moveTo(pl, y); ctx.lineTo(w - pr, y); ctx.stroke();
      ctx.fillStyle = "#6E7980"; ctx.fillText(Math.round(yMax - yR * (g / 3)) + unit, pl - 8, y);
    }
    if (d.length < 2) { ctx.textAlign = "center"; ctx.fillStyle = "#6E7980"; ctx.fillText("Събирам данни…", pl + W / 2, pt + H / 2); return; }
    const X = (i) => pl + (i / (d.length - 1)) * W, Y = (v) => pt + H - ((v - yMin) / yR) * H;
    const avg = d.reduce((a, b) => a + b, 0) / d.length;
    ctx.setLineDash([3, 4]); ctx.strokeStyle = "rgba(0,229,255,.35)"; ctx.beginPath(); ctx.moveTo(pl, Y(avg)); ctx.lineTo(w - pr, Y(avg)); ctx.stroke(); ctx.setLineDash([]);
    const g = ctx.createLinearGradient(0, pt, 0, pt + H); g.addColorStop(0, color + "38"); g.addColorStop(1, color + "00");
    ctx.beginPath(); ctx.moveTo(X(0), pt + H); d.forEach((v, i) => ctx.lineTo(X(i), Y(v))); ctx.lineTo(X(d.length - 1), pt + H); ctx.closePath(); ctx.fillStyle = g; ctx.fill();
    ctx.beginPath(); d.forEach((v, i) => (i ? ctx.lineTo(X(i), Y(v)) : ctx.moveTo(X(i), Y(v)))); ctx.strokeStyle = color; ctx.lineWidth = 1.8; ctx.stroke();
    const lx = X(d.length - 1), ly = Y(d[d.length - 1]);
    ctx.beginPath(); ctx.arc(lx, ly, 3, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
    ctx.beginPath(); ctx.arc(lx, ly, 7, 0, Math.PI * 2); ctx.strokeStyle = color + "55"; ctx.stroke();
  }, [JSON.stringify(data), color, unit]);
  return <canvas ref={ref} className="adm-canvas" style={{ height: h }} role="img" aria-label="Графика" />;
}
function BarChart({ data, h = 150, unit = "", prefix = "" }) {
  const [hover, setHover] = useState(-1);
  const pos = useRef([]);
  const ref = useCanvas((ctx, w, hh) => {
    const d = data || [];
    const H = hh - 18;
    for (let g = 0; g <= 3; g++) { const y = H * (g / 3) + 0.5; ctx.strokeStyle = "rgba(201,209,214,.07)"; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    if (!d.length || d.every((x) => !x.v)) { ctx.fillStyle = "#6E7980"; ctx.font = "10px 'JetBrains Mono',monospace"; ctx.textAlign = "center"; ctx.fillText("Още няма данни", w / 2, H / 2); return; }
    const max = Math.max(...d.map((x) => x.v)) || 1, gap = 3, bw = Math.max(2, (w - gap * (d.length - 1)) / d.length);
    const p = [];
    d.forEach((x, i) => {
      const bh = (x.v / max) * (H - 8), bx = i * (bw + gap), by = H - bh;
      p.push({ x: bx, w: bw, y: by });
      const on = hover === i;
      const g = ctx.createLinearGradient(0, by, 0, H); g.addColorStop(0, on ? "rgba(0,229,255,.95)" : "rgba(0,229,255,.6)"); g.addColorStop(1, "rgba(0,229,255,.12)");
      ctx.fillStyle = g; ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = on ? "#E8EDF0" : "#6E7980"; ctx.font = "9px 'JetBrains Mono',monospace"; ctx.textAlign = "center";
      if (d.length <= 24 || i % 2 === 0) ctx.fillText(x.l || "", bx + bw / 2, hh - 4);
    });
    pos.current = p;
    if (hover >= 0 && hover < d.length) {
      const x = d[hover], b = p[hover], t = (x.l || "") + " · " + prefix + x.v + (unit ? " " + unit : "");
      ctx.font = "11px 'JetBrains Mono',monospace"; const tw = ctx.measureText(t).width + 16;
      const tx = Math.min(Math.max(b.x + b.w / 2 - tw / 2, 0), w - tw), ty = Math.max(b.y - 30, 0);
      ctx.fillStyle = "rgba(8,9,11,.94)"; ctx.fillRect(tx, ty, tw, 22); ctx.strokeStyle = "rgba(0,229,255,.45)"; ctx.strokeRect(tx + 0.5, ty + 0.5, tw - 1, 21);
      ctx.fillStyle = "#E8EDF0"; ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillText(t, tx + 8, ty + 11); ctx.textBaseline = "alphabetic";
    }
  }, [JSON.stringify(data), hover, unit, prefix]);
  const move = (e) => { const r = e.currentTarget.getBoundingClientRect(), mx = e.clientX - r.left; setHover(pos.current.findIndex((b) => mx >= b.x && mx <= b.x + b.w)); };
  return <canvas ref={ref} className="adm-canvas" style={{ height: h }} onMouseMove={move} onMouseLeave={() => setHover(-1)} role="img" aria-label="Стълбова графика" />;
}
function Donut({ data, label, size = 120 }) {
  const ref = useCanvas((ctx, w, hh) => {
    const d = (data || []).filter((x) => x.v > 0), tot = d.reduce((a, b) => a + b.v, 0);
    const cx = w / 2, cy = hh / 2, th = Math.max(10, Math.min(w, hh) * 0.13), r = Math.min(w, hh) / 2 - th / 2 - 2;
    ctx.lineWidth = th; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.strokeStyle = "rgba(201,209,214,.07)"; ctx.stroke();
    let a = -Math.PI / 2;
    d.forEach((x) => { const b = a + (x.v / tot) * Math.PI * 2; ctx.beginPath(); ctx.arc(cx, cy, r, a + 0.02, b - 0.02); ctx.strokeStyle = x.c; ctx.stroke(); a = b; });
    ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = "#E8EDF0";
    ctx.font = "600 " + Math.round(r * 0.55) + "px 'Space Grotesk',sans-serif"; ctx.fillText(tot >= 1000 ? Math.round(tot / 100) / 10 + "k" : String(tot), cx, cy - 4);
    ctx.fillStyle = "#6E7980"; ctx.font = "9px 'JetBrains Mono',monospace"; ctx.fillText(label || "", cx, cy + r * 0.42);
  }, [JSON.stringify(data), label]);
  return <canvas ref={ref} className="adm-canvas" style={{ width: size, height: size, flex: "none" }} aria-hidden="true" />;
}

// ── дребни строителни блокове ────────────────────────────────────────────────
function Card({ title, sub, actions, children, className = "" }) {
  return (
    <section className={"adm-card " + className}>
      {(title || actions) && (
        <header className="adm-card-h">
          <div><h3>{title}</h3>{sub && <p>{sub}</p>}</div>
          {actions && <div className="adm-card-a">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}
function Kpi({ label, value, unit, tone, spark, sparkColor, foot }) {
  return (
    <div className="adm-kpi">
      <div className="adm-kpi-l">{label}</div>
      <div className={"adm-kpi-v" + (tone ? " is-" + tone : "")}>{value}{unit && <small>{unit}</small>}</div>
      {spark && <Spark data={spark} color={sparkColor} />}
      {foot && <div className="adm-kpi-f">{foot}</div>}
    </div>
  );
}
const Empty = ({ children }) => <div className="adm-empty">{children}</div>;
const Btn = ({ icon, children, kind = "", ...p }) => <button type="button" className={"adm-btn " + kind} {...p}>{icon && <Icon n={icon} s={15} />}{children}</button>;
const latTone = (ms) => (ms <= 0 ? "bad" : ms > 400 ? "bad" : ms > 180 ? "warn" : "ok");

// ═══════════════════════════════════════════════════════════════════════════
// ВХОД
// ═══════════════════════════════════════════════════════════════════════════
function Login({ notice, onDone }) {
  const [step, setStep] = useState("pw");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [code, setCode] = useState("");
  const [useRec, setUseRec] = useState(false);
  const [ch, setCh] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(notice || "");
  const [wait, setWait] = useState(0);
  const codeRef = useRef(null);

  useEffect(() => { if (wait <= 0) return; const t = setTimeout(() => setWait((w) => w - 1), 1000); return () => clearTimeout(t); }, [wait]);
  useEffect(() => { if (step === "code" && codeRef.current) codeRef.current.focus(); }, [step, useRec]);

  function fail(r, d) {
    if (r.status === 429) { setWait(Math.max(1, +(d.retry_after || r.headers.get("Retry-After") || 60))); setErr("Твърде много опити от този адрес. Изчакай и опитай пак."); }
    else if (d.error === "invalid_credentials") setErr("Грешен имейл или парола.");
    else if (d.error === "invalid_code") setErr(useRec ? "Грешен или вече използван резервен код." : "Грешен код. Провери часовника на телефона и опитай пак.");
    else if (d.error === "challenge_expired") { setStep("pw"); setCh(""); setCode(""); setErr("Времето за кода изтече. Влез отново с паролата."); }
    else if (r.status === 403) setErr("Заявката е отказана. Отвори панела от carbonstealth.eu/admin/.");
    else setErr("Нещо се обърка (" + r.status + "). Опитай пак.");
  }
  async function submitPw(e) {
    e.preventDefault();
    if (busy || wait > 0) return;
    setBusy(true); setErr("");
    try {
      const r = await api(AUTH + "?action=login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: pw }) });
      const d = await jsonOf(r);
      if (r.ok && d.step === "totp") { setCh(d.challenge); setStep("code"); setPw(""); setCode(""); setUseRec(false); }
      else fail(r, d);
    } catch (x) { setErr("Няма връзка със сървъра. Опитай пак."); }
    finally { setBusy(false); }
  }
  async function submitCode(e, value) {
    if (e) e.preventDefault();
    const c = (value != null ? value : code).trim();
    if (busy || wait > 0 || !c) return;
    setBusy(true); setErr("");
    try {
      const r = await api(AUTH + "?action=verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ challenge: ch, code: c }) });
      const d = await jsonOf(r);
      if (r.ok) { const m = await api(AUTH + "?action=me"); onDone(m.ok ? await jsonOf(m) : d); return; }
      setCode(""); fail(r, d);
    } catch (x) { setErr("Няма връзка със сървъра. Опитай пак."); }
    finally { setBusy(false); }
  }
  function onCode(v) {
    if (useRec) { setCode(v.slice(0, 20)); return; }
    const digits = v.replace(/\D/g, "").slice(0, 6);
    setCode(digits);
    if (digits.length === 6) submitCode(null, digits);
  }

  return (
    <div className="adm-login">
      <div className="adm-login-bg" aria-hidden="true" />
      <form className="adm-login-card" onSubmit={step === "pw" ? submitPw : submitCode} noValidate>
        <div className="adm-login-brand">
          <img src="/logo-nav.webp" alt="Carbon Stealth VCC" width="80" height="34" />
          <span className="adm-chip"><Icon n="shield" s={13} />Защитен вход</span>
        </div>
        <h1>Command Center</h1>
        <p className="adm-login-sub">{step === "pw" ? "Влез с имейла и паролата си." : useRec ? "Въведи един от резервните кодове. Всеки работи само веднъж." : "Въведи 6-цифрения код от приложението за удостоверяване."}</p>

        <ol className="adm-steps" aria-label="Стъпки на входа">
          <li className={step === "pw" ? "is-on" : "is-done"}><span>1</span>Парола</li>
          <li className={step === "code" ? "is-on" : ""}><span>2</span>Код</li>
        </ol>

        {err && <div className="adm-alert" role="alert">{err}{wait > 0 && <b> · {wait} s</b>}</div>}

        {step === "pw" ? (
          <>
            <label className="adm-field"><span>Имейл</span>
              <input type="email" autoComplete="username" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@carbonstealth.eu" required autoFocus />
            </label>
            <label className="adm-field"><span>Парола</span>
              <input type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} required />
            </label>
            <button className="adm-btn is-primary is-block" type="submit" disabled={busy || wait > 0 || !email || !pw}>{busy ? "Проверявам…" : "Продължи"}</button>
          </>
        ) : (
          <>
            <label className="adm-field"><span>{useRec ? "Резервен код" : "Код от приложението"}</span>
              <input ref={codeRef} className={useRec ? "" : "adm-otp"} type="text" autoComplete="one-time-code" inputMode={useRec ? "text" : "numeric"}
                value={code} onChange={(e) => onCode(e.target.value)} placeholder={useRec ? "xxxx-xxxx-xxxx" : "000000"} maxLength={useRec ? 20 : 6} spellCheck="false" />
            </label>
            <button className="adm-btn is-primary is-block" type="submit" disabled={busy || wait > 0 || (useRec ? code.length < 12 : code.length !== 6)}>{busy ? "Проверявам…" : "Влез"}</button>
            <div className="adm-login-links">
              <button type="button" className="adm-link" onClick={() => { setUseRec(!useRec); setCode(""); setErr(""); }}>{useRec ? "Използвай кода от приложението" : "Нямам телефона — резервен код"}</button>
              <button type="button" className="adm-link" onClick={() => { setStep("pw"); setCh(""); setCode(""); setErr(""); }}>Назад</button>
            </div>
          </>
        )}
        <p className="adm-login-foot">Паролата се сменя само от сървъра: <code>sudo cs-admin password</code></p>
      </form>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ПАНЕЛЪТ
// ═══════════════════════════════════════════════════════════════════════════
const NAV = [
  ["Преглед", [["dashboard", "Табло"], ["sites", "Сайтове"], ["system", "Сървър"]]],
  ["Запитвания", [["contacts", "Контакти"], ["analyzer", "Анализатор"]]],
  ["Растеж", [["indexnow", "IndexNow"], ["campaigns", "Кампании"]]],
  ["Бизнес", [["crm", "Клиенти"], ["revenue", "Приходи"], ["tasks", "Задачи"]]],
  ["Система", [["logs", "Дневник"], ["settings", "Настройки"]]],
];
const TITLES = {
  dashboard: ["Табло", "Състоянието на всичко на един поглед"], sites: ["Сайтове", "Наличност и бързина на нашите сайтове"],
  system: ["Сървър", "Машината, на която работи carbonstealth.eu"], contacts: ["Контакти", "Запитванията от формата на сайта"],
  analyzer: ["Анализатор", "Проверките на /test/ и оставените контакти"], indexnow: ["IndexNow", "Известяване на Bing, Yandex, Seznam и Naver"],
  campaigns: ["Кампании", "Чернови на имейл кампании"], crm: ["Клиенти", "Проекти и бюджети"], revenue: ["Приходи", "По клиенти"],
  tasks: ["Задачи", "Какво предстои"], logs: ["Дневник", "Какво се случи в тази сесия"], settings: ["Настройки", "Поща и сигурност на входа"],
};

function Panel({ me, onSignedOut }) {
  const [tab, setTab] = useState("dashboard");
  const [navOpen, setNavOpen] = useState(false);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [selSite, setSelSite] = useState(null);
  const [server, setServer] = useState({});
  const [pingHistory, setPingHistory] = useState({});
  const [kpiHist, setKpiHist] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [scans, setScans] = useState([]);
  const [leads, setLeads] = useState([]);
  const [inLog, setInLog] = useState([]);
  const [inBusy, setInBusy] = useState(false);
  const [campaigns, setCampaigns] = useState([]);
  const [clients, setClients] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [actLog, setActLog] = useState([]);
  const [toasts, setToasts] = useState([]);
  const [refreshed, setRefreshed] = useState(0);
  const [camp, setCamp] = useState({ name: "", subject: "", body: "" });
  const [cli, setCli] = useState({ name: "", project: "", budget: "" });
  const [task, setTask] = useState({ text: "", pri: "MEDIUM" });
  const [smtp, setSmtp] = useState({ host: "smtp.gmail.com", port: "587", user: "info@carbonstealth.eu", pass: "", to: "info@carbonstealth.eu" });
  const lastAct = useRef(Date.now());
  const out = useRef(false);

  const toast = useCallback((msg, kind) => {
    const id = Math.random();
    setToasts((t) => t.concat([{ id, msg, kind: kind || "ok" }]));
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);
  const log = useCallback((a, c) => setActLog((p) => [{ t: Date.now(), a, c: c || "СИСТЕМА" }].concat(p).slice(0, 150)), []);

  const signOut = useCallback((reason) => { if (out.current) return; out.current = true; onSignedOut(reason); }, [onSignedOut]);
  // Всяка заявка към админ API: бисквитката + CSRF заглавен ред; 401 = край на сесията; 429 = един опит пак.
  const authFetch = useCallback(async (url, opts, retry) => {
    const r = await api(url, opts);
    if (r.status === 401) { signOut("Сесията изтече. Влез отново."); throw new Error("401"); }
    if (r.status === 429 && !retry) { await sleep(1500); return authFetch(url, opts, true); }
    return r;
  }, [signOut]);

  // ── наблюдение: сървърът + пинг на сайтовете ──
  const doPing = useCallback(() => {
    if (document.hidden) return;
    // IP адресите на посетителите остават тук: никакви заявки към външни услуги за геолокация (GDPR).
    authFetch("/api/monitor.php").then((r) => r.json()).then((d) => { if (d && d.ok) setServer(d); }).catch(() => {});
    const res = {}; let done = 0;
    SITES.forEach((s) => {
      const t0 = performance.now();
      fetch(s.url, { method: "HEAD", mode: "no-cors", cache: "no-store" }).then(() => {
        const lat = Math.round(performance.now() - t0);
        res[s.name] = { status: "ONLINE", latency: lat };
        setPingHistory((p) => Object.assign({}, p, { [s.name]: (p[s.name] || []).concat([lat]).slice(-40) }));
      }).catch(() => { res[s.name] = { status: "DOWN", latency: -1 }; }).finally(() => {
        if (++done >= SITES.length) { setStats(Object.assign({}, res)); setLoading(false); setRefreshed(Date.now()); }
      });
    });
  }, [authFetch]);

  // ── първо зареждане: една по една (nginx пуска 1 заявка/s с малък запас) ──
  useEffect(() => {
    let alive = true;
    log("Вход: " + (me && me.email ? me.email : "администратор"), "ВХОД");
    doPing();
    const iv = setInterval(doPing, 15000);
    (async () => {
      const steps = [
        ["/api/admin-data.php?action=get&key=clients", (d) => Array.isArray(d.data) && setClients(d.data)],
        ["/api/contact.php?action=log", (d) => d.entries && setContacts(d.entries)],
        ["/api/admin-data.php?action=get&key=tasks", (d) => Array.isArray(d.data) && setTasks(d.data)],
        ["/api/analyze.php?action=stats", (d) => { if (d.ok) { setScans(d.recent_scans || []); setLeads(d.recent_leads || []); } }],
        ["/api/admin-data.php?action=get&key=campaigns", (d) => Array.isArray(d.data) && setCampaigns(d.data)],
        ["/api/indexnow.php?action=status", (d) => d.ok && setInLog(d.submissions || [])],
      ];
      for (const [u, f] of steps) {
        if (!alive) return;
        await sleep(450);
        try { const r = await authFetch(u); f(await jsonOf(r)); } catch (e) { if (e.message === "401") return; }
      }
    })();
    // поток с новите запитвания (кратък билет; без токен в адреса)
    const sse = { alive: true, cur: null, timer: null };
    function open() {
      if (!sse.alive) return;
      authFetch("/api/sse-ticket.php").then((r) => r.json()).then((d) => {
        if (!sse.alive || !d || !d.ok || !d.ticket) return;
        const s = new EventSource("/api/sse-leads.php?ticket=" + encodeURIComponent(d.ticket));
        sse.cur = s;
        s.addEventListener("new_lead", (e) => {
          try {
            const l = JSON.parse(e.data);
            setLeads((p) => [l].concat(p).slice(0, 50));
            log("Ново запитване: " + (l.name || l.email || "без име") + (l.tested_url ? " — " + l.tested_url : ""), "ЗАПИТВАНЕ");
            toast("Ново запитване от " + (l.name || l.email || "посетител"));
          } catch (x) { /* лош ред — пропускаме */ }
        });
        s.addEventListener("connected", () => log("Потокът със запитванията е свързан"));
        s.onerror = () => { try { s.close(); } catch (x) { /* вече затворен */ } if (sse.alive) sse.timer = setTimeout(open, 5000); };
      }).catch(() => { if (sse.alive) sse.timer = setTimeout(open, 8000); });
    }
    const sseStart = setTimeout(open, 3500);
    return () => { alive = false; clearInterval(iv); clearTimeout(sseStart); sse.alive = false; if (sse.cur) try { sse.cur.close(); } catch (x) { /* */ } if (sse.timer) clearTimeout(sse.timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── бездействие: 30 мин без мишка/клавиатура/докосване → изход (сървърът брои същото) ──
  useEffect(() => {
    const idleMs = ((me && me.idle_timeout) || 1800) * 1000;
    const mark = () => { lastAct.current = Date.now(); };
    const ev = ["pointerdown", "keydown", "wheel", "touchstart", "mousemove"];
    ev.forEach((e) => window.addEventListener(e, mark, { passive: true }));
    const iv = setInterval(() => {
      if (Date.now() - lastAct.current > idleMs) {
        api(AUTH + "?action=logout", { method: "POST" }).catch(() => {});
        signOut("Излязохте автоматично след 30 минути без действие.");
      }
    }, 20000);
    return () => { ev.forEach((e) => window.removeEventListener(e, mark)); clearInterval(iv); };
  }, [me, signOut]);

  // ── KPI история за малките графики ──
  const online = Object.values(stats).filter((s) => s.status === "ONLINE").length;
  const lats = Object.values(stats).filter((s) => s.latency > 0).map((s) => s.latency);
  const avgLat = lats.length ? Math.round(lats.reduce((a, b) => a + b, 0) / lats.length) : 0;
  useEffect(() => {
    if (!server.ok) return;
    setKpiHist((p) => p.concat([{ online, lat: avgLat, uniq: server.unique_visitors || 0, contacts: contacts.length }]).slice(-40));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [server]);

  // ── запис на колекциите (сървърът е истината; няма тайни в localStorage) ──
  function save(key, data) {
    authFetch("/api/admin-data.php?action=set&key=" + key, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })
      .then((r) => { if (!r.ok) toast("Не успях да запиша — опитай пак", "bad"); }).catch(() => {});
  }
  const addCamp = () => { if (!camp.name.trim()) return; const u = campaigns.concat([{ id: Date.now(), name: camp.name, subject: camp.subject, body: camp.body, status: "DRAFT", date: new Date().toISOString().slice(0, 10) }]); setCampaigns(u); save("campaigns", u); setCamp({ name: "", subject: "", body: "" }); toast("Кампанията е запазена"); };
  const delCamp = (id) => { const u = campaigns.filter((c) => c.id !== id); setCampaigns(u); save("campaigns", u); };
  const addClient = () => { if (!cli.name.trim()) return; const u = clients.concat([{ id: Date.now(), name: cli.name, project: cli.project, budget: cli.budget, status: "ACTIVE", date: new Date().toISOString().slice(0, 10) }]); setClients(u); save("clients", u); setCli({ name: "", project: "", budget: "" }); toast("Клиентът е добавен"); };
  const delClient = (id) => { const u = clients.filter((c) => c.id !== id); setClients(u); save("clients", u); };
  const addTask = () => { if (!task.text.trim()) return; const u = tasks.concat([{ id: Date.now(), text: task.text, pri: task.pri, done: false, date: new Date().toISOString().slice(0, 10) }]); setTasks(u); save("tasks", u); setTask({ text: "", pri: task.pri }); };
  const togTask = (id) => { const u = tasks.map((t) => (t.id === id ? Object.assign({}, t, { done: !t.done }) : t)); setTasks(u); save("tasks", u); };
  const delTask = (id) => { const u = tasks.filter((t) => t.id !== id); setTasks(u); save("tasks", u); };

  function exportCSV(rows, name) {
    if (!rows || !rows.length) { toast("Няма какво да се изнесе", "warn"); return; }
    const cols = Object.keys(rows[0]);
    const esc = (v) => { v = v == null ? "" : String(v); if (/^[=+\-@]/.test(v)) v = "'" + v; return /[",\n;]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    const csv = "﻿" + cols.join(",") + "\n" + rows.map((r) => cols.map((c) => esc(r[c])).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = name + "_" + new Date().toISOString().slice(0, 10) + ".csv";
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function indexNowAll() {
    if (inBusy) return;
    setInBusy(true);
    authFetch("/api/indexnow.php?action=bulk", { method: "POST" }).then((r) => r.json()).then((d) => {
      setInBusy(false);
      if (d.ok) {
        toast("Подадени " + d.submitted + " адреса към " + Object.keys(d.endpoints || {}).length + " търсачки");
        log("IndexNow: " + d.submitted + " адреса", "SEO");
        authFetch("/api/indexnow.php?action=status").then((r) => r.json()).then((x) => x.ok && setInLog(x.submissions || [])).catch(() => {});
      } else toast("IndexNow: " + (d.error || "грешка"), "bad");
    }).catch(() => { setInBusy(false); });
  }
  function saveSMTP() {
    authFetch("/api/admin-settings.php", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save_smtp", data: smtp }) })
      .then((r) => r.json()).then((d) => { if (d && d.ok !== false) { toast("Настройките на пощата са запазени"); setSmtp((s) => Object.assign({}, s, { pass: "" })); } else toast((d && d.error) || "Не успях да запиша", "bad"); })
      .catch(() => {});
  }
  async function logout(all) {
    try { await api(AUTH + "?action=" + (all ? "logout_all" : "logout"), { method: "POST" }); } catch (e) { /* излизаме така или иначе */ }
    signOut(all ? "Излязохте от всички устройства." : "Излязохте.");
  }
  function go(t) { setTab(t); setSelSite(null); setNavOpen(false); window.scrollTo(0, 0); }

  const totalRev = clients.reduce((a, c) => a + (parseFloat(c.budget) || 0), 0);
  const allOn = !loading && online === SITES.length;
  const [title, sub] = selSite ? [selSite.label, selSite.name + " · " + selSite.tech] : TITLES[tab];
  const exp = me && me.expires_at ? fmtTime(me.expires_at * 1000) : "";

  // ── изгледите ─────────────────────────────────────────────────────────────
  function siteRow(s) {
    const st = stats[s.name] || {}, on = st.status === "ONLINE", lat = st.latency || 0;
    return (
      <button key={s.name} type="button" className="adm-tr adm-tr-site" onClick={() => { setTab("sites"); setSelSite(s); }}>
        <span className={"adm-dot is-" + (loading ? "wait" : on ? "ok" : "bad")} />
        <span className="adm-tr-main"><b>{s.label}</b><small>{s.type}</small></span>
        <span className="adm-tr-host">{s.name}</span>
        <span className="adm-tr-spark"><Spark data={pingHistory[s.name]} color={on ? CY : "#FF6A55"} h={24} /></span>
        <span className={"adm-num is-" + latTone(on ? lat : -1)}>{on ? lat + " ms" : loading ? "…" : "няма"}</span>
      </button>
    );
  }

  function viewDashboard() {
    const hourly = (server.hourly || []).map((x) => ({ l: x.hour, v: x.count }));
    return (
      <>
        <div className="adm-kpis">
          <Kpi label="Сайтове онлайн" value={loading ? "…" : online} unit={"/" + SITES.length} tone={loading ? "" : allOn ? "ok" : "bad"} spark={kpiHist.map((k) => k.online)} />
          <Kpi label="Средно време за отговор" value={avgLat || "…"} unit="ms" tone={avgLat ? latTone(avgLat) : ""} spark={kpiHist.map((k) => k.lat)} />
          <Kpi label="Заявки днес" value={(server.nginx_today || 0).toLocaleString("bg-BG")} spark={hourly.map((x) => x.v)} />
          <Kpi label="Уникални посетители" value={(server.unique_visitors || 0).toLocaleString("bg-BG")} spark={kpiHist.map((k) => k.uniq)} />
          <Kpi label="Запитвания" value={contacts.length + leads.length} foot={contacts.length + " от формата · " + leads.length + " от /test/"} />
        </div>
        <div className="adm-grid-2">
          <Card title="Наблюдение в реално време" sub="Пинг от браузъра на всеки 15 s"
            actions={<Btn icon="refresh" onClick={doPing}>Обнови</Btn>}>
            <div className="adm-table">{SITES.map(siteRow)}</div>
          </Card>
          <div className="adm-stack">
            <Card title="Трафик днес" sub="Заявки по час">
              <BarChart data={hourly} unit="заявки" h={170} />
            </Card>
            <Card title="Последни запитвания" actions={<Btn onClick={() => go("contacts")}>Всички</Btn>}>
              {contacts.length === 0 && leads.length === 0 ? <Empty>Още няма запитвания.</Empty> : (
                <ul className="adm-list">
                  {contacts.slice(0, 4).map((c, i) => <li key={"c" + i}><b>{c.name || "—"}</b><span>{c.email || ""}</span><time>{c.date || ""}</time></li>)}
                  {leads.slice(0, 3).map((l, i) => <li key={"l" + i}><b>{l.name || "—"}</b><span>{l.email || ""}</span><time>{fmtDT(l.ts)}</time></li>)}
                </ul>
              )}
            </Card>
          </div>
        </div>
        <Card title="Бързи действия">
          <div className="adm-actions">
            <Btn icon="indexnow" kind="is-primary" onClick={indexNowAll} disabled={inBusy}>{inBusy ? "Подавам…" : "IndexNow: подай всичко"}</Btn>
            <a className="adm-btn" href="https://search.google.com/search-console" target="_blank" rel="noopener noreferrer"><Icon n="ext" s={15} />Search Console</a>
            <a className="adm-btn" href="https://www.bing.com/webmasters" target="_blank" rel="noopener noreferrer"><Icon n="ext" s={15} />Bing Webmaster</a>
            <a className="adm-btn" href="/sitemap.xml" target="_blank" rel="noopener noreferrer"><Icon n="ext" s={15} />Sitemap</a>
          </div>
        </Card>
      </>
    );
  }

  function viewSiteDetail(s) {
    const st = stats[s.name] || {}, on = st.status === "ONLINE", h = pingHistory[s.name] || [];
    const avg = h.length ? Math.round(h.reduce((a, b) => a + b, 0) / h.length) : 0;
    const ua = server.user_agents || {};
    const dd = [{ k: "Компютър", v: ua.desktop || 0, c: CY }, { k: "Телефон", v: ua.mobile || 0, c: "#3DDC97" }, { k: "Ботове", v: ua.bot || 0, c: "#F5B544" }];
    const tot = dd.reduce((a, b) => a + b.v, 0) || 1;
    return (
      <>
        <div className="adm-crumbs"><button type="button" className="adm-link" onClick={() => setSelSite(null)}>← Всички сайтове</button>
          <a className="adm-btn" href={s.url} target="_blank" rel="noopener noreferrer"><Icon n="ext" s={15} />Отвори сайта</a></div>
        <div className="adm-kpis">
          <Kpi label="Състояние" value={on ? "Онлайн" : "Не отговаря"} tone={on ? "ok" : "bad"} />
          <Kpi label="Отговор сега" value={on ? st.latency : "—"} unit={on ? "ms" : ""} tone={on ? latTone(st.latency) : "bad"} />
          <Kpi label="Средно (последни 40)" value={avg || "—"} unit={avg ? "ms" : ""} />
          <Kpi label="Най-бързо / най-бавно" value={h.length ? Math.min(...h) + " / " + Math.max(...h) : "—"} unit={h.length ? "ms" : ""} />
        </div>
        <Card title="Време за отговор" sub="Пунктирът е средното">
          <LineChart data={h} unit="" h={180} color={avg > 400 ? "#FF6A55" : avg > 180 ? "#F5B544" : CY} />
        </Card>
        {s.name === "carbonstealth.eu" && (
          <div className="adm-grid-2">
            <Card title="Сървърът" sub="От /api/monitor.php">{kv([["Сертификат", (server.ssl_issuer || "…") + " · до " + (server.ssl_expires || "…") + " (" + (server.ssl_days || "?") + " дни)"], ["TLS", (server.tls_version || "…") + " · " + (server.tls_cipher || "…")], ["Nginx / ОС", (server.nginx_version || "…") + " · " + (server.os || "…")], ["Натоварване", server.load || "0"], ["Памет", (server.memory_used || 0) + " / " + (server.memory_total || 0) + " MB (" + (server.memory_pct || 0) + "%)"], ["Диск", (server.disk_used || 0) + " / " + (server.disk_total || 0) + " GB (" + (server.disk_pct || 0) + "%)"]])}</Card>
            <Card title="Устройства" sub="Днешните заявки">
              <div className="adm-donut"><Donut data={dd} label="ЗАЯВКИ" />
                <ul className="adm-legend">{dd.map((x) => <li key={x.k}><i style={{ background: x.c }} />{x.k}<b>{x.v.toLocaleString("bg-BG")} · {Math.round((x.v / tot) * 100)}%</b></li>)}</ul></div>
            </Card>
            <Card title="Откъде идват" sub="Препращащи сайтове">
              {(server.referrers || []).length ? <ul className="adm-list">{server.referrers.map((r, i) => <li key={i}><b>{typeof r === "string" ? r : r.host}</b><span /><time>{typeof r === "string" ? "" : r.pct + "% · " + r.count}</time></li>)}</ul> : <Empty>Още няма данни.</Empty>}
            </Card>
            <Card title="Най-активни адреси" sub="Днес, по брой заявки">
              {(server.top_ips || []).length ? <ul className="adm-list">{server.top_ips.slice(0, 5).map((e) => <li key={e.ip}><b className="adm-mono">{e.ip}</b><span /><time>{e.count} заявки</time></li>)}</ul> : <Empty>Още няма данни.</Empty>}
            </Card>
          </div>
        )}
      </>
    );
  }
  function kv(rows) {
    return <dl className="adm-kv">{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>;
  }

  function viewSites() {
    if (selSite) return viewSiteDetail(selSite);
    return (
      <div className="adm-cards">
        {SITES.map((s) => {
          const st = stats[s.name] || {}, on = st.status === "ONLINE";
          return (
            <button type="button" key={s.name} className="adm-card adm-site" onClick={() => setSelSite(s)}>
              <div className="adm-site-h"><span className={"adm-dot is-" + (loading ? "wait" : on ? "ok" : "bad")} /><b>{s.label}</b><span className={"adm-pill is-" + (loading ? "wait" : on ? "ok" : "bad")}>{loading ? "…" : on ? "онлайн" : "не отговаря"}</span></div>
              <small>{s.type} · {s.tech}</small>
              <Spark data={pingHistory[s.name]} color={on ? CY : "#FF6A55"} h={40} />
              <div className="adm-site-f"><span>{s.name}</span><span className={"adm-num is-" + latTone(on ? st.latency : -1)}>{on ? st.latency + " ms" : "—"}</span></div>
            </button>
          );
        })}
      </div>
    );
  }

  function viewSystem() {
    const it = [["IP на сървъра", server.server_ip], ["Доставчик", "Hetzner · NBG1"], ["ОС", server.os], ["Nginx", server.nginx_version], ["PHP", server.php_version], ["Сертификат", server.ssl_issuer],
      ["Валиден до", (server.ssl_expires || "…") + (server.ssl_days ? " · " + server.ssl_days + " дни" : "")], ["TLS", server.tls_version], ["Натоварване", server.load], ["Памет", (server.memory_pct || 0) + "%"], ["Диск", (server.disk_pct || 0) + "%"], ["Процеси", server.processes]];
    const sslWarn = (server.ssl_days || 99) < 21;
    return (
      <>
        {sslWarn && <div className="adm-alert">Сертификатът изтича след {server.ssl_days} дни — провери certbot.</div>}
        <div className="adm-cards is-tight">{it.map(([k, v]) => <div className="adm-card adm-stat" key={k}><span>{k}</span><b>{v == null || v === "" ? "…" : String(v)}</b></div>)}</div>
        <div className="adm-grid-2">
          <Card title="Памет"><Meter pct={server.memory_pct} label={(server.memory_used || 0) + " / " + (server.memory_total || 0) + " MB"} /></Card>
          <Card title="Диск"><Meter pct={server.disk_pct} label={(server.disk_used || 0) + " / " + (server.disk_total || 0) + " GB"} /></Card>
        </div>
      </>
    );
  }

  function viewContacts() {
    const by = {};
    contacts.forEach((c) => { const d = (c.date || "").slice(0, 10); if (d) by[d] = (by[d] || 0) + 1; });
    const days = Object.keys(by).sort().slice(-21);
    return (
      <>
        <Card title={"Запитвания от формата · " + contacts.length} sub="Последните 3 седмици по дни"
          actions={<><Btn icon="download" onClick={() => exportCSV(contacts, "cs_zapitvania")}>CSV</Btn><Btn icon="refresh" onClick={() => authFetch("/api/contact.php?action=log").then((r) => r.json()).then((d) => d.entries && setContacts(d.entries)).catch(() => {})}>Обнови</Btn></>}>
          <BarChart data={days.map((d) => ({ l: d.slice(5), v: by[d] }))} unit="запитвания" h={150} />
        </Card>
        <Card>
          {contacts.length === 0 ? <Empty>Още няма запитвания от формата.</Empty> : (
            <div className="adm-table">
              <div className="adm-th adm-tr-contact"><span>Име</span><span>Контакт</span><span>Съобщение</span><span>Дата</span></div>
              {contacts.map((c, i) => (
                <div className="adm-tr adm-tr-contact" key={i}>
                  <b>{c.name || "—"}</b>
                  <span className="adm-mono">{c.email || ""}{c.phone ? " · " + c.phone : ""}</span>
                  <span className="adm-clip">{c.message || ""}</span>
                  <time>{c.date || ""}</time>
                </div>
              ))}
            </div>
          )}
        </Card>
      </>
    );
  }

  function viewAnalyzer() {
    const conv = scans.length ? Math.min(100, Math.round((leads.length / scans.length) * 100)) + "%" : "—";
    return (
      <>
        <div className="adm-kpis is-3">
          <Kpi label="Проверки със съгласие" value={scans.length} />
          <Kpi label="Оставени контакти" value={leads.length} tone="ok" />
          <Kpi label="Превръщане" value={conv} />
        </div>
        <Card title="Оставени контакти" actions={<Btn icon="refresh" onClick={() => authFetch("/api/analyze.php?action=stats").then((r) => r.json()).then((d) => { if (d.ok) { setScans(d.recent_scans || []); setLeads(d.recent_leads || []); } }).catch(() => {})}>Обнови</Btn>}>
          {leads.length === 0 ? <Empty>Още няма контакти от /test/.</Empty> : (
            <div className="adm-table">{leads.map((l, i) => (
              <div className="adm-tr adm-tr-lead" key={i}>
                <span><b>{l.name || "—"}</b><small className="adm-mono">{l.email || ""}{l.phone ? " · " + l.phone : ""}</small></span>
                <a className="adm-clip" href={safeHref(l.tested_url)} target="_blank" rel="noopener noreferrer">{l.tested_url || ""}</a>
                <time>{fmtDT(l.ts)}</time>
              </div>
            ))}</div>
          )}
        </Card>
        <Card title="Последни проверки">
          {scans.length === 0 ? <Empty>Още няма проверки със съгласие.</Empty> : (
            <div className="adm-table">
              <div className="adm-th adm-tr-scan"><span>Сайт</span><span>Скорост</span><span>SEO</span><span>Кога</span></div>
              {scans.slice(0, 20).map((s, i) => (
                <div className="adm-tr adm-tr-scan" key={i}>
                  <a className="adm-clip" href={safeHref(s.url)} target="_blank" rel="noopener noreferrer">{s.host || s.url}</a>
                  <span className={"adm-num is-" + (s.perf_mobile >= 80 ? "ok" : s.perf_mobile >= 50 ? "warn" : "bad")}>{s.perf_mobile ?? "?"}</span>
                  <span className="adm-num">{s.seo_mobile ?? "?"}</span>
                  <time>{fmtDT(s.ts)}</time>
                </div>
              ))}
            </div>
          )}
        </Card>
      </>
    );
  }

  function viewIndexNow() {
    return (
      <>
        <Card title="Подаване към търсачките" sub="След нови страници или голяма промяна. Google не ползва IndexNow — за него е sitemap и Search Console.">
          <div className="adm-actions">
            <Btn icon="indexnow" kind="is-primary" onClick={indexNowAll} disabled={inBusy}>{inBusy ? "Подавам…" : "Подай всички sitemap-и"}</Btn>
            <a className="adm-btn" href="/sitemap.xml" target="_blank" rel="noopener noreferrer"><Icon n="ext" s={15} />Виж sitemap</a>
          </div>
        </Card>
        <Card title={"История · " + inLog.length}>
          {inLog.length === 0 ? <Empty>Още няма подавания.</Empty> : (
            <div className="adm-table">{inLog.map((s, i) => (
              <div className="adm-tr adm-tr-in" key={i}>
                <b>{(s.url_count || 0) + " адреса"}</b>
                <span className="adm-tags">{Object.keys(s.results || {}).map((h) => { const r = s.results[h]; return <span key={h} className={"adm-pill is-" + (r.success ? "ok" : "bad")}>{h.replace(/^www\.|^api\./, "")} · {r.http_code}</span>; })}</span>
                <time>{fmtDT(s.ts)}</time>
              </div>
            ))}</div>
          )}
        </Card>
      </>
    );
  }

  function viewCampaigns() {
    return (
      <>
        <Card title="Нова кампания">
          <div className="adm-form">
            <label className="adm-field"><span>Име</span><input value={camp.name} onChange={(e) => setCamp(Object.assign({}, camp, { name: e.target.value }))} /></label>
            <label className="adm-field"><span>Тема на писмото</span><input value={camp.subject} onChange={(e) => setCamp(Object.assign({}, camp, { subject: e.target.value }))} /></label>
            <label className="adm-field is-wide"><span>Текст</span><textarea rows={4} value={camp.body} onChange={(e) => setCamp(Object.assign({}, camp, { body: e.target.value }))} /></label>
          </div>
          <Btn icon="plus" kind="is-primary" onClick={addCamp} disabled={!camp.name.trim()}>Запази чернова</Btn>
        </Card>
        <Card title={"Кампании · " + campaigns.length}>
          {campaigns.length === 0 ? <Empty>Още няма кампании.</Empty> : (
            <div className="adm-table">{campaigns.map((c) => (
              <div className="adm-tr adm-tr-camp" key={c.id}>
                <span><b>{c.name}</b><small>{c.subject || ""}</small></span>
                <span className={"adm-pill is-" + (c.status === "SENT" ? "ok" : "warn")}>{c.status === "SENT" ? "изпратена" : "чернова"}</span>
                <time>{c.date}</time>
                <button type="button" className="adm-icon-btn" aria-label={"Изтрий " + c.name} onClick={() => delCamp(c.id)}><Icon n="x" s={15} /></button>
              </div>
            ))}</div>
          )}
        </Card>
      </>
    );
  }

  function viewCRM() {
    return (
      <>
        <Card title="Нов клиент" actions={<Btn icon="download" onClick={() => exportCSV(clients, "cs_klienti")}>CSV</Btn>}>
          <div className="adm-form is-3">
            <label className="adm-field"><span>Име</span><input value={cli.name} onChange={(e) => setCli(Object.assign({}, cli, { name: e.target.value }))} /></label>
            <label className="adm-field"><span>Проект</span><input value={cli.project} onChange={(e) => setCli(Object.assign({}, cli, { project: e.target.value }))} /></label>
            <label className="adm-field"><span>Бюджет, €</span><input inputMode="decimal" value={cli.budget} onChange={(e) => setCli(Object.assign({}, cli, { budget: e.target.value }))} /></label>
          </div>
          <Btn icon="plus" kind="is-primary" onClick={addClient} disabled={!cli.name.trim()}>Добави</Btn>
        </Card>
        <Card title={"Клиенти · " + clients.length}>
          {clients.length === 0 ? <Empty>Още няма клиенти.</Empty> : (
            <div className="adm-table">
              <div className="adm-th adm-tr-cli"><span>Клиент</span><span>Проект</span><span>Бюджет</span><span /></div>
              {clients.map((c) => (
                <div className="adm-tr adm-tr-cli" key={c.id}>
                  <b>{c.name}</b><span>{c.project}</span><span className="adm-num">€ {(parseFloat(c.budget) || 0).toLocaleString("bg-BG")}</span>
                  <button type="button" className="adm-icon-btn" aria-label={"Изтрий " + c.name} onClick={() => delClient(c.id)}><Icon n="x" s={15} /></button>
                </div>
              ))}
            </div>
          )}
        </Card>
      </>
    );
  }

  function viewRevenue() {
    return (
      <>
        <div className="adm-kpis is-3">
          <Kpi label="Общо по бюджети" value={"€ " + totalRev.toLocaleString("bg-BG")} />
          <Kpi label="Клиенти" value={clients.length} />
          <Kpi label="Среден проект" value={"€ " + (clients.length ? Math.round(totalRev / clients.length) : 0).toLocaleString("bg-BG")} />
        </div>
        <Card title="Бюджет по клиент">
          <BarChart data={clients.map((c) => ({ l: (c.name || "?").slice(0, 8), v: parseFloat(c.budget) || 0 }))} prefix="€" h={190} />
        </Card>
      </>
    );
  }

  function viewTasks() {
    const open = tasks.filter((t) => !t.done).length;
    const pri = { HIGH: ["висок", "bad"], MEDIUM: ["среден", "warn"], LOW: ["нисък", "ok"] };
    return (
      <Card title={"Задачи · " + open + " отворени"}>
        <form className="adm-task-add" onSubmit={(e) => { e.preventDefault(); addTask(); }}>
          <input aria-label="Нова задача" placeholder="Нова задача…" value={task.text} onChange={(e) => setTask(Object.assign({}, task, { text: e.target.value }))} />
          <select aria-label="Приоритет" value={task.pri} onChange={(e) => setTask(Object.assign({}, task, { pri: e.target.value }))}>
            <option value="HIGH">Висок</option><option value="MEDIUM">Среден</option><option value="LOW">Нисък</option>
          </select>
          <Btn icon="plus" kind="is-primary" type="submit" disabled={!task.text.trim()}>Добави</Btn>
        </form>
        {tasks.length === 0 ? <Empty>Няма задачи.</Empty> : (
          <div className="adm-table">{tasks.map((t) => (
            <div className={"adm-tr adm-tr-task" + (t.done ? " is-done" : "")} key={t.id}>
              <button type="button" className={"adm-check" + (t.done ? " is-on" : "")} aria-pressed={t.done} aria-label={t.done ? "Отвори отново" : "Отбележи като свършена"} onClick={() => togTask(t.id)} />
              <span>{t.text}</span>
              <span className={"adm-pill is-" + (pri[t.pri] || pri.MEDIUM)[1]}>{(pri[t.pri] || pri.MEDIUM)[0]}</span>
              <button type="button" className="adm-icon-btn" aria-label="Изтрий задачата" onClick={() => delTask(t.id)}><Icon n="x" s={15} /></button>
            </div>
          ))}</div>
        )}
      </Card>
    );
  }

  function viewLogs() {
    return (
      <Card title="Дневник на сесията">
        {actLog.length === 0 ? <Empty>Още няма събития.</Empty> : (
          <div className="adm-table">{actLog.map((l, i) => (
            <div className="adm-tr adm-tr-log" key={i}><time>{fmtTime(l.t)}</time><span className="adm-pill">{l.c}</span><span>{l.a}</span></div>
          ))}</div>
        )}
      </Card>
    );
  }

  function viewSettings() {
    const f = (k, label, type) => (
      <label className="adm-field"><span>{label}</span>
        <input type={type || "text"} autoComplete={type === "password" ? "new-password" : "off"} value={smtp[k]} onChange={(e) => setSmtp(Object.assign({}, smtp, { [k]: e.target.value }))} />
      </label>
    );
    return (
      <div className="adm-grid-2 is-start">
        <Card title="Поща (SMTP)" sub="Паролата отива само към сървъра и не се пази в браузъра.">
          <div className="adm-form">{f("host", "Сървър")}{f("port", "Порт")}{f("user", "Потребител")}{f("pass", "Парола за приложението", "password")}{f("to", "Получател на запитванията")}</div>
          <Btn kind="is-primary" onClick={saveSMTP}>Запази</Btn>
        </Card>
        <Card title="Сигурност на входа" sub="Имейл + парола + код от приложение">
          {kv([["Влязъл", (me && me.email) || "—"], ["Сесията изтича", exp ? "до " + exp + " (8 ч от входа)" : "—"], ["Без действие", "автоматичен изход след 30 мин"]])}
          <div className="adm-actions">
            <Btn icon="logout" onClick={() => logout(false)}>Изход</Btn>
            <Btn icon="shield" kind="is-danger" onClick={() => logout(true)}>Излез от всички устройства</Btn>
          </div>
          <div className="adm-note">
            <p><Icon n="key" s={14} /> Паролата, кодът и резервните кодове се сменят само от сървъра:</p>
            <pre>{"sudo cs-admin password   # нова парола\nsudo cs-admin recovery   # нови резервни кодове\nsudo cs-admin revoke     # изписва всички сесии\nsudo cs-admin status     # какво е настроено"}</pre>
          </div>
        </Card>
      </div>
    );
  }

  const VIEWS = { dashboard: viewDashboard, sites: viewSites, system: viewSystem, contacts: viewContacts, analyzer: viewAnalyzer, indexnow: viewIndexNow,
    campaigns: viewCampaigns, crm: viewCRM, revenue: viewRevenue, tasks: viewTasks, logs: viewLogs, settings: viewSettings };
  const badge = { contacts: contacts.length || null, analyzer: leads.length || null, tasks: tasks.filter((t) => !t.done).length || null };

  return (
    <div className={"adm-shell" + (navOpen ? " nav-open" : "")}>
      <aside className="adm-side" aria-label="Навигация">
        <div className="adm-side-brand">
          <img src="/logo-nav.webp" alt="Carbon Stealth VCC" width="80" height="34" />
          <span>Command Center</span>
        </div>
        <nav>
          {NAV.map(([g, items]) => (
            <div className="adm-nav-g" key={g}>
              <div className="adm-nav-gl">{g}</div>
              {items.map(([k, label]) => (
                <button type="button" key={k} className="adm-nav-i" aria-current={tab === k ? "page" : undefined} onClick={() => go(k)}>
                  <Icon n={k} /><span>{label}</span>{badge[k] ? <em>{badge[k]}</em> : null}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="adm-side-foot">
          <div className="adm-me"><span className="adm-avatar" aria-hidden="true">{((me && me.email) || "A").slice(0, 1).toUpperCase()}</span>
            <span><b>{(me && me.email) || "администратор"}</b><small>{exp ? "сесия до " + exp : ""}</small></span></div>
          <button type="button" className="adm-icon-btn" aria-label="Изход" title="Изход" onClick={() => logout(false)}><Icon n="logout" /></button>
        </div>
      </aside>
      <button type="button" className="adm-scrim" aria-label="Затвори менюто" tabIndex={navOpen ? 0 : -1} onClick={() => setNavOpen(false)} />
      <main className="adm-main">
        <header className="adm-top">
          <button type="button" className="adm-icon-btn adm-menu" aria-label="Меню" aria-expanded={navOpen} onClick={() => setNavOpen(!navOpen)}><Icon n="menu" /></button>
          <div className="adm-top-t"><h2>{title}</h2><p>{sub}</p></div>
          <div className="adm-top-r">
            <span className={"adm-pill is-" + (loading ? "wait" : allOn ? "ok" : "bad")}><span className={"adm-dot is-" + (loading ? "wait" : allOn ? "ok" : "bad")} />{loading ? "проверявам…" : online + "/" + SITES.length + " онлайн"}</span>
            {refreshed > 0 && <span className="adm-muted adm-hide-s">обновено {fmtTime(refreshed)}</span>}
            <Btn icon="refresh" onClick={doPing} aria-label="Обнови"><span className="adm-hide-s">Обнови</span></Btn>
          </div>
        </header>
        <div className="adm-content">{VIEWS[tab]()}</div>
      </main>
      <div className="adm-toasts" role="status" aria-live="polite">{toasts.map((t) => <div key={t.id} className={"adm-toast is-" + t.kind}>{t.msg}</div>)}</div>
    </div>
  );
}

function Meter({ pct, label }) {
  const p = Math.max(0, Math.min(100, +pct || 0)), tone = p > 90 ? "bad" : p > 75 ? "warn" : "ok";
  return (
    <div className="adm-meter">
      <div className="adm-meter-v"><b className={"is-" + tone}>{p}%</b><span>{label}</span></div>
      <div className="adm-meter-t"><i className={"is-" + tone} style={{ width: p + "%" }} /></div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
export default function AdminApp() {
  const [phase, setPhase] = useState("boot");
  const [me, setMe] = useState(null);
  const [notice, setNotice] = useState("");
  const [key, setKey] = useState(0);
  useEffect(() => {
    api(AUTH + "?action=me").then(async (r) => {
      if (r.ok) { setMe(await jsonOf(r)); setPhase("in"); } else setPhase("login");
    }).catch(() => { setNotice("Няма връзка със сървъра."); setPhase("login"); });
  }, []);
  return (
    <div className="adm">
      <style>{CSS}</style>
      {phase === "boot" && <div className="adm-boot" aria-busy="true"><img src="/logo-nav.webp" alt="" width="80" height="34" /></div>}
      {phase === "login" && <Login key={"l" + key} notice={notice} onDone={(m) => { setMe(m); setNotice(""); setPhase("in"); }} />}
      {phase === "in" && <Panel key={"p" + key} me={me} onSignedOut={(reason) => { setMe(null); setNotice(reason || ""); setKey((k) => k + 1); setPhase("login"); }} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Облик: карбон, хром и циан като единствен акцент. Числата — Space Grotesk с таблични цифри,
// текстът — Onest (кирилица), етикетите — JetBrains Mono. Шрифтовете са от /fonts/fonts.css (наши).
// ═══════════════════════════════════════════════════════════════════════════
const CSS = `
.adm{--bg:#08090B;--bg2:#0B0D10;--panel:#0F1215;--panel2:#14181C;--line:rgba(201,209,214,.08);--line2:rgba(201,209,214,.14);--ink:#E8EDF0;--ink2:#A3AEB5;--mute:#6E7980;
  --cy:#00E5FF;--cy-a:rgba(0,229,255,.12);--ok:#3DDC97;--warn:#F5B544;--bad:#FF6A55;--r:12px;--r2:8px;
  --disp:'Space Grotesk','Onest',system-ui,sans-serif;--body:'Onest','Inter Tight',system-ui,sans-serif;--mono:'JetBrains Mono','Space Mono',ui-monospace,monospace;
  min-height:100vh;background:var(--bg);color:var(--ink);font:400 14px/1.55 var(--body);-webkit-font-smoothing:antialiased;color-scheme:dark}
.adm *,.adm *::before,.adm *::after{box-sizing:border-box}
.adm button{font:inherit;color:inherit}
.adm :focus-visible{outline:2px solid var(--cy);outline-offset:2px;border-radius:6px}
.adm-ic{flex:none}
.adm-boot{min-height:100vh;display:grid;place-items:center;opacity:.6}

/* ── вход ── */
.adm-login{min-height:100vh;display:grid;place-items:center;padding:24px max(16px,env(safe-area-inset-right)) 24px max(16px,env(safe-area-inset-left));position:relative;overflow:hidden}
.adm-login-bg{position:absolute;inset:0;background:radial-gradient(60% 50% at 50% 0%,rgba(0,229,255,.10),transparent 70%),linear-gradient(rgba(201,209,214,.035) 1px,transparent 1px) 0 0/56px 56px,linear-gradient(90deg,rgba(201,209,214,.035) 1px,transparent 1px) 0 0/56px 56px;
  -webkit-mask:radial-gradient(70% 70% at 50% 40%,#000,transparent);mask:radial-gradient(70% 70% at 50% 40%,#000,transparent)}
.adm-login-card{position:relative;width:min(420px,100%);padding:32px;border:1px solid var(--line2);border-radius:16px;background:linear-gradient(180deg,rgba(20,24,28,.92),rgba(13,16,19,.96));
  box-shadow:0 30px 80px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.04);display:grid;gap:16px}
.adm-login-card::before{content:"";position:absolute;inset:0 24px auto;height:1px;background:linear-gradient(90deg,transparent,rgba(0,229,255,.6),transparent)}
.adm-login-brand{display:flex;justify-content:space-between;align-items:center}
.adm-login-brand img{height:34px;width:auto;filter:drop-shadow(0 0 6px rgba(0,229,255,.25))}
.adm-login h1{margin:4px 0 0;font:600 28px/1.1 var(--disp);letter-spacing:-.02em}
.adm-login-sub{margin:-8px 0 0;color:var(--ink2)}
.adm-steps{display:flex;gap:8px;list-style:none;margin:0;padding:0;font:500 12px var(--mono);color:var(--mute)}
.adm-steps li{display:flex;align-items:center;gap:8px;flex:1;padding:8px 10px;border:1px solid var(--line);border-radius:var(--r2)}
.adm-steps li span{width:20px;height:20px;border-radius:50%;display:grid;place-items:center;border:1px solid var(--line2);font-size:11px}
.adm-steps li.is-on{color:var(--ink);border-color:rgba(0,229,255,.4);background:var(--cy-a)}.adm-steps li.is-on span{border-color:var(--cy);color:var(--cy)}
.adm-steps li.is-done{color:var(--ok)}.adm-steps li.is-done span{border-color:var(--ok)}
.adm-login-links{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}
.adm-login-foot{margin:4px 0 0;color:var(--mute);font-size:12px}
.adm-login-foot code,.adm-note code{font:12px var(--mono);color:var(--ink2)}
.adm-otp{font:600 26px var(--mono)!important;letter-spacing:.5em;text-align:center;padding-left:.5em!important}
.adm-chip{display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border:1px solid rgba(0,229,255,.35);border-radius:999px;color:var(--cy);font:500 11px var(--mono);letter-spacing:.04em}

/* ── полета и бутони ── */
.adm-field{display:grid;gap:6px}
.adm-field>span{font:500 11px var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--mute)}
.adm input,.adm select,.adm textarea{width:100%;min-width:0;background:var(--bg2);border:1px solid var(--line2);border-radius:var(--r2);color:var(--ink);padding:11px 12px;font:15px var(--body);outline:none;transition:border-color .15s,box-shadow .15s}
.adm textarea{resize:vertical}
.adm input:focus,.adm select:focus,.adm textarea:focus{border-color:rgba(0,229,255,.55);box-shadow:0 0 0 3px rgba(0,229,255,.12)}
.adm-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:38px;padding:8px 14px;border:1px solid var(--line2);border-radius:var(--r2);background:var(--panel2);color:var(--ink);font:500 13px var(--body);cursor:pointer;text-decoration:none;white-space:nowrap;transition:background .15s,border-color .15s,color .15s}
.adm-btn:hover{border-color:rgba(201,209,214,.28);background:#191E23}
.adm-btn:disabled{opacity:.45;cursor:not-allowed}
.adm-btn.is-primary{background:var(--cy);border-color:var(--cy);color:#041016;font-weight:600}
.adm-btn.is-primary:hover:not(:disabled){background:#5BEEFF}
.adm-btn.is-danger{border-color:rgba(255,106,85,.4);color:#FF8C7B;background:rgba(255,106,85,.06)}
.adm-btn.is-block{width:100%;min-height:46px;font-size:15px}
.adm-link{background:none;border:0;padding:4px 0;color:var(--cy);cursor:pointer;font-size:13px;text-decoration:underline;text-underline-offset:3px}
.adm-icon-btn{display:inline-grid;place-items:center;width:36px;height:36px;border:1px solid transparent;border-radius:var(--r2);background:none;color:var(--ink2);cursor:pointer}
.adm-icon-btn:hover{background:var(--panel2);border-color:var(--line);color:var(--ink)}
.adm-alert{padding:11px 14px;border:1px solid rgba(255,106,85,.35);border-radius:var(--r2);background:rgba(255,106,85,.07);color:#FFB3A7;font-size:13px}

/* ── обвивка ── */
.adm-shell{display:grid;grid-template-columns:248px minmax(0,1fr);min-height:100vh}
.adm-side{position:sticky;top:0;height:100vh;display:flex;flex-direction:column;gap:8px;padding:18px 12px 12px;border-right:1px solid var(--line);background:linear-gradient(180deg,#0C0E11,#090A0C)}
.adm-side-brand{display:flex;align-items:center;gap:10px;padding:2px 10px 16px;border-bottom:1px solid var(--line);margin-bottom:6px}
.adm-side-brand img{height:28px;width:auto;filter:drop-shadow(0 0 5px rgba(0,229,255,.25))}
.adm-side-brand span{font:600 14px var(--disp);letter-spacing:-.01em}
.adm-side nav{flex:1;overflow-y:auto;display:grid;align-content:start;gap:14px;padding:4px 0}
.adm-nav-g{display:grid;gap:2px}
.adm-nav-gl{padding:0 10px 4px;font:500 10.5px var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--mute)}
.adm-nav-i{display:flex;align-items:center;gap:10px;width:100%;padding:8px 10px;border:0;border-radius:var(--r2);background:none;color:var(--ink2);cursor:pointer;text-align:left;font-size:14px;position:relative}
.adm-nav-i:hover{background:rgba(201,209,214,.05);color:var(--ink)}
.adm-nav-i[aria-current]{background:var(--cy-a);color:var(--ink)}
.adm-nav-i[aria-current]::before{content:"";position:absolute;left:-12px;top:8px;bottom:8px;width:2px;background:var(--cy);border-radius:2px}
.adm-nav-i[aria-current] .adm-ic{color:var(--cy)}
.adm-nav-i em{margin-left:auto;font:600 11px var(--mono);font-style:normal;color:var(--ink);background:rgba(201,209,214,.1);padding:1px 7px;border-radius:999px}
.adm-side-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:12px 6px 2px;border-top:1px solid var(--line)}
.adm-me{display:flex;align-items:center;gap:10px;min-width:0}
.adm-me>span:last-child{display:grid;min-width:0}
.adm-me b{font-weight:500;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.adm-me small{color:var(--mute);font:11px var(--mono)}
.adm-avatar{width:32px;height:32px;flex:none;border-radius:50%;display:grid;place-items:center;font:600 13px var(--disp);color:#041016;background:linear-gradient(135deg,#00E5FF,#7BF1FF)}
.adm-main{min-width:0;display:flex;flex-direction:column}
.adm-top{position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:14px;padding:16px max(28px,env(safe-area-inset-right)) 16px 28px;border-bottom:1px solid var(--line);background:rgba(8,9,11,.82);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}
.adm-top-t{min-width:0;flex:1}
.adm-top h2{margin:0;font:600 20px/1.2 var(--disp);letter-spacing:-.015em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.adm-top p{margin:2px 0 0;color:var(--mute);font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.adm-top-r{display:flex;align-items:center;gap:10px}
.adm-menu{display:none}
.adm-muted{color:var(--mute);font:12px var(--mono)}
.adm-content{padding:24px 28px 56px;display:grid;gap:16px;max-width:1440px;width:100%}
.adm-scrim{display:none}

/* ── карти и мрежи ── */
.adm-card{position:relative;border:1px solid var(--line);border-radius:var(--r);background:linear-gradient(180deg,var(--panel2),var(--panel));padding:18px;min-width:0}
.adm-card-h{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:14px}
.adm-card-h h3{margin:0;font:600 15px/1.3 var(--disp);letter-spacing:-.01em}
.adm-card-h p{margin:3px 0 0;color:var(--mute);font-size:12.5px}
.adm-card-a{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
.adm-grid-2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;align-items:stretch}
.adm-grid-2.is-start{align-items:start}
.adm-stack{display:grid;gap:16px;align-content:start}
.adm-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:12px}
.adm-cards.is-tight{grid-template-columns:repeat(auto-fill,minmax(190px,1fr))}
.adm-kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px}
.adm-kpis.is-3{grid-template-columns:repeat(3,minmax(0,1fr))}
.adm-kpi{border:1px solid var(--line);border-radius:var(--r);padding:16px 16px 12px;background:linear-gradient(180deg,var(--panel2),var(--panel));display:grid;gap:8px;min-width:0}
.adm-kpi-l{font:500 11px var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--mute)}
.adm-kpi-v{font:600 30px/1 var(--disp);letter-spacing:-.025em;font-variant-numeric:tabular-nums;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.adm-kpi-v small{font-size:14px;color:var(--mute);margin-left:4px;font-weight:500}
.adm-kpi-f{font-size:12px;color:var(--mute)}
.is-ok{color:var(--ok)}.is-warn{color:var(--warn)}.is-bad{color:var(--bad)}
.adm-kpi-v.is-ok{color:var(--ok)}.adm-kpi-v.is-warn{color:var(--warn)}.adm-kpi-v.is-bad{color:var(--bad)}
.adm-canvas{display:block;width:100%}
.adm-empty{padding:28px 12px;text-align:center;color:var(--mute);border:1px dashed var(--line2);border-radius:var(--r2);font-size:13px}
.adm-actions{display:flex;flex-wrap:wrap;gap:8px}
.adm-dot{width:8px;height:8px;border-radius:50%;flex:none;display:inline-block}
.adm-dot.is-ok{background:var(--ok);box-shadow:0 0 0 3px rgba(61,220,151,.15)}
.adm-dot.is-bad{background:var(--bad);box-shadow:0 0 0 3px rgba(255,106,85,.18)}
.adm-dot.is-wait{background:var(--warn)}
.adm-pill{display:inline-flex;align-items:center;gap:7px;padding:3px 10px;border:1px solid var(--line2);border-radius:999px;font:500 11.5px var(--mono);color:var(--ink2);white-space:nowrap}
.adm-pill.is-ok{border-color:rgba(61,220,151,.35);color:var(--ok);background:rgba(61,220,151,.06)}
.adm-pill.is-warn{border-color:rgba(245,181,68,.35);color:var(--warn);background:rgba(245,181,68,.06)}
.adm-pill.is-bad{border-color:rgba(255,106,85,.35);color:var(--bad);background:rgba(255,106,85,.06)}
.adm-num{font:600 13px var(--disp);font-variant-numeric:tabular-nums;text-align:right;white-space:nowrap}
.adm-mono{font:12.5px var(--mono);color:var(--ink2)}
.adm-clip{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;color:var(--ink2);text-decoration:none}
a.adm-clip:hover{color:var(--cy)}
.adm-tags{display:flex;flex-wrap:wrap;gap:6px;min-width:0}

/* ── таблици ── */
.adm-table{display:grid}
.adm-th,.adm-tr{display:grid;gap:14px;align-items:center;padding:11px 8px;border-bottom:1px solid var(--line);min-width:0}
.adm-th{font:500 11px var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--mute);padding-top:0}
.adm-tr:last-child{border-bottom:0}
.adm-tr time{font:12px var(--mono);color:var(--mute);white-space:nowrap;text-align:right}
.adm-tr b{font-weight:500}
.adm-tr small{display:block;color:var(--mute);font-size:12px}
.adm-tr>span{min-width:0}
button.adm-tr{width:100%;border:0;border-bottom:1px solid var(--line);background:none;text-align:left;cursor:pointer;border-radius:0}
button.adm-tr:hover{background:rgba(201,209,214,.035)}
.adm-tr-site{grid-template-columns:12px minmax(0,1.3fr) minmax(0,1fr) 110px 70px}
.adm-tr-main{display:grid;min-width:0}.adm-tr-main b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.adm-tr-host{font:12px var(--mono);color:var(--mute);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.adm-tr-contact{grid-template-columns:minmax(0,.9fr) minmax(0,1.2fr) minmax(0,1.6fr) 96px}
.adm-tr-lead{grid-template-columns:minmax(0,1.2fr) minmax(0,1.4fr) 110px}
.adm-tr-scan{grid-template-columns:minmax(0,2fr) 70px 70px 110px}
.adm-tr-in{grid-template-columns:110px minmax(0,1fr) 110px}
.adm-tr-camp{grid-template-columns:minmax(0,1fr) auto 90px 36px}
.adm-tr-cli{grid-template-columns:minmax(0,1fr) minmax(0,1fr) 120px 36px}
.adm-tr-task{grid-template-columns:22px minmax(0,1fr) auto 36px}
.adm-tr-task.is-done>span:nth-child(2){text-decoration:line-through;color:var(--mute)}
.adm-tr-log{grid-template-columns:60px 110px minmax(0,1fr)}
.adm-list{list-style:none;margin:0;padding:0;display:grid}
.adm-list li{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) auto;gap:12px;align-items:center;padding:9px 2px;border-bottom:1px solid var(--line);font-size:13.5px}
.adm-list li:last-child{border-bottom:0}
.adm-list li span{color:var(--ink2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:12.5px var(--mono)}
.adm-list li b{font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.adm-list time{font:12px var(--mono);color:var(--mute)}
.adm-check{width:20px;height:20px;border-radius:6px;border:1.5px solid var(--line2);background:none;cursor:pointer;position:relative;padding:0}
.adm-check.is-on{background:var(--ok);border-color:var(--ok)}
.adm-check.is-on::after{content:"";position:absolute;left:6px;top:2px;width:5px;height:10px;border:solid #06140d;border-width:0 2px 2px 0;transform:rotate(45deg)}
.adm-task-add{display:grid;grid-template-columns:minmax(0,1fr) 140px auto;gap:8px;margin-bottom:12px}

/* ── формуляри, двойки, уреди ── */
.adm-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-bottom:14px}
.adm-form.is-3{grid-template-columns:repeat(3,minmax(0,1fr))}
.adm-form .is-wide{grid-column:1/-1}
.adm-kv{margin:0 0 14px;display:grid}
.adm-kv>div{display:grid;grid-template-columns:150px minmax(0,1fr);gap:12px;padding:9px 0;border-bottom:1px solid var(--line);font-size:13.5px}
.adm-kv>div:last-child{border-bottom:0}
.adm-kv dt{color:var(--mute)}.adm-kv dd{margin:0;color:var(--ink);min-width:0;overflow-wrap:anywhere}
.adm-note{margin-top:14px;padding:14px;border:1px solid var(--line);border-radius:var(--r2);background:var(--bg2)}
.adm-note p{margin:0 0 8px;display:flex;align-items:center;gap:8px;color:var(--ink2);font-size:13px}
.adm-note pre{margin:0;font:12.5px/1.8 var(--mono);color:var(--ink);overflow-x:auto}
.adm-stat{display:grid;gap:6px;padding:14px 16px}
.adm-stat span{font:500 11px var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--mute)}
.adm-stat b{font:600 16px var(--disp);overflow-wrap:anywhere}
.adm-meter{display:grid;gap:10px}
.adm-meter-v{display:flex;align-items:baseline;gap:12px}.adm-meter-v b{font:600 30px var(--disp)}.adm-meter-v span{color:var(--mute);font:12.5px var(--mono)}
.adm-meter-t{height:8px;border-radius:99px;background:rgba(201,209,214,.08);overflow:hidden}
.adm-meter-t i{display:block;height:100%;border-radius:99px;background:var(--ok)}
.adm-meter-t i.is-warn{background:var(--warn)}.adm-meter-t i.is-bad{background:var(--bad)}
.adm-donut{display:flex;align-items:center;gap:22px}
.adm-legend{list-style:none;margin:0;padding:0;display:grid;gap:8px;flex:1;min-width:0}
.adm-legend li{display:flex;align-items:center;gap:10px;font-size:13.5px}
.adm-legend i{width:10px;height:10px;border-radius:3px;flex:none}
.adm-legend b{margin-left:auto;font:500 12.5px var(--mono);color:var(--ink2)}
.adm-site{display:grid;gap:10px;text-align:left;cursor:pointer;width:100%}
.adm-site:hover{border-color:rgba(0,229,255,.3)}
.adm-site-h{display:flex;align-items:center;gap:10px}.adm-site-h b{font:600 15px var(--disp);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.adm-site small{color:var(--mute);font-size:12px}
.adm-site-f{display:flex;justify-content:space-between;gap:10px;font:12px var(--mono);color:var(--mute)}
.adm-crumbs{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}

/* ── известия ── */
.adm-toasts{position:fixed;right:max(20px,env(safe-area-inset-right));bottom:max(20px,env(safe-area-inset-bottom));z-index:50;display:grid;gap:8px;width:min(360px,calc(100vw - 40px))}
.adm-toast{padding:12px 14px;border-radius:var(--r2);border:1px solid rgba(61,220,151,.35);background:rgba(14,22,19,.96);color:var(--ink);font-size:13.5px;box-shadow:0 12px 40px rgba(0,0,0,.5);animation:admIn .25s cubic-bezier(.22,1,.36,1)}
.adm-toast.is-bad{border-color:rgba(255,106,85,.4);background:rgba(28,15,13,.96)}
.adm-toast.is-warn{border-color:rgba(245,181,68,.4);background:rgba(28,22,12,.96)}
@keyframes admIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}

/* ── по-тесни екрани ── */
@media (max-width:1180px){.adm-kpis{grid-template-columns:repeat(3,minmax(0,1fr))}.adm-grid-2{grid-template-columns:1fr}}
@media (max-width:900px){
  .adm-shell{grid-template-columns:1fr}
  .adm-side{position:fixed;inset:0 auto 0 0;width:min(290px,86vw);z-index:30;transform:translateX(-102%);transition:transform .25s cubic-bezier(.22,1,.36,1);padding-left:max(12px,env(safe-area-inset-left))}
  .nav-open .adm-side{transform:none;box-shadow:24px 0 60px rgba(0,0,0,.6)}
  .nav-open .adm-scrim{display:block;position:fixed;inset:0;z-index:20;border:0;background:rgba(0,0,0,.55)}
  .adm-menu{display:inline-grid}
  .adm-top{padding:12px max(16px,env(safe-area-inset-right)) 12px max(16px,env(safe-area-inset-left))}
  .adm-content{padding:16px max(16px,env(safe-area-inset-right)) 48px max(16px,env(safe-area-inset-left))}
}
@media (max-width:640px){
  .adm-kpis,.adm-kpis.is-3{grid-template-columns:repeat(2,minmax(0,1fr))}
  .adm-kpis>.adm-kpi:last-child:nth-child(odd){grid-column:1/-1}
  .adm-kpi-v{font-size:24px}
  .adm-hide-s{display:none}
  .adm-form,.adm-form.is-3,.adm-task-add{grid-template-columns:1fr}
  .adm-tr-site{grid-template-columns:12px minmax(0,1fr) 64px}.adm-tr-site .adm-tr-host,.adm-tr-site .adm-tr-spark{display:none}
  .adm-tr-contact,.adm-tr-lead,.adm-tr-scan,.adm-tr-in{grid-template-columns:minmax(0,1fr) auto}
  .adm-tr-contact>:nth-child(3),.adm-tr-contact>:nth-child(2),.adm-tr-lead>:nth-child(2),.adm-tr-scan>:nth-child(3),.adm-tr-in>:nth-child(2){display:none}
  .adm-th{display:none}
  .adm-kv>div{grid-template-columns:1fr;gap:2px}
  .adm-login-card{padding:24px 20px}
  .adm-list li{grid-template-columns:minmax(0,1fr) auto}.adm-list li span{display:none}
  .adm-donut{flex-direction:column;align-items:stretch}
}
@media (prefers-reduced-motion:reduce){.adm *{animation:none!important;transition:none!important}}
`;
