// Сглобява HTML предпрегледа на примерните бонове от receipts.json.
import { readFileSync, writeFileSync } from "node:fs";

const src = process.argv[2];
const dest = process.argv[3];
const d = JSON.parse(readFileSync(src, "utf8"));

const esc = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const docs = [
  { key: "sale", eyebrow: "Фискален бон", title: "Продажба в брой", note: "Реквизити по чл. 26 Наредба Н-18 · двойно обозначаване EUR/BGN по чл. 20 ЗВЕРБ · УНП по Приложение № 29 · включена промоция „3 за 2“ като отстъпка на реда." },
  { key: "storno", eyebrow: "Сторно бон", title: "Операторска грешка", note: "Сторно по чл. 31 — причина, номер и дата на оригиналния бон. Срок за операторска грешка: до 7-о число на следващия месец." },
  { key: "invoice", eyebrow: "Фактура", title: "чл. 114 ЗДДС", note: "Пореден 10-разряден номер, доставчик + получател, данъчна основа + ДДС, основание фискален бон. Двувалутно EUR/BGN." },
];

const cards = docs
  .map(
    (doc) => `
      <article class="doc">
        <header class="doc__head">
          <span class="doc__eyebrow">${esc(doc.eyebrow)}</span>
          <h2 class="doc__title">${esc(doc.title)}</h2>
        </header>
        <div class="paper" role="img" aria-label="${esc(doc.eyebrow)} — примерен">
          <pre class="paper__text">${esc(d[doc.key])}</pre>
        </div>
        <p class="doc__note">${esc(doc.note)}</p>
      </article>`
  )
  .join("\n");

const html = `<title>Касата — примерни касови бележки</title>
<style>
  :root {
    --ground: #e9e6df;
    --panel: #f3f0e9;
    --paper: #faf8f3;
    --paper-edge: #efe9dc;
    --ink: #1c1813;
    --ink-soft: #5c5346;
    --ink-faint: #8a8072;
    --accent: #d98e0b;
    --accent-soft: #f5a623;
    --hair: #d8d2c5;
    --shadow: 30 24 12;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --ground: #17140f;
      --panel: #201c16;
      --paper: #f7f4ee;
      --paper-edge: #e9e3d6;
      --ink: #1c1813;
      --ink-soft: #5c5346;
      --ink-faint: #8a8072;
      --accent: #f5a623;
      --accent-soft: #ffcf73;
      --hair: #322c22;
      --shadow: 0 0 0;
    }
  }
  :root[data-theme="light"] {
    --ground: #e9e6df; --panel: #f3f0e9; --ink: #1c1813; --ink-soft: #5c5346;
    --ink-faint: #8a8072; --accent: #d98e0b; --hair: #d8d2c5; --shadow: 30 24 12;
  }
  :root[data-theme="dark"] {
    --ground: #17140f; --panel: #201c16; --accent: #f5a623;
    --hair: #322c22; --shadow: 0 0 0;
  }

  * { box-sizing: border-box; }
  html { -webkit-text-size-adjust: 100%; }
  body {
    margin: 0;
    background:
      radial-gradient(120% 80% at 50% -10%, color-mix(in srgb, var(--accent) 9%, var(--ground)), var(--ground) 60%);
    color: var(--ink);
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    line-height: 1.5;
    min-height: 100vh;
  }
  .wrap { max-width: 1180px; margin: 0 auto; padding: clamp(2rem, 5vw, 5rem) clamp(1rem, 4vw, 3rem) 4rem; }

  .masthead { max-width: 40rem; }
  .masthead__eyebrow {
    font-size: 0.72rem; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase;
    color: var(--accent); margin: 0 0 0.9rem;
  }
  .masthead__title {
    font-size: clamp(2rem, 5vw, 3.1rem); line-height: 1.04; margin: 0; font-weight: 800;
    letter-spacing: -0.02em; text-wrap: balance; color: var(--ink);
  }
  .masthead__lead {
    margin: 1.1rem 0 0; font-size: 1.05rem; color: var(--ink-soft); max-width: 34rem;
  }
  :root[data-theme="dark"] .masthead__title,
  :root[data-theme="dark"] .masthead__lead { color: #f2ece0; }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) .masthead__title { color: #f4eee2; }
    :root:not([data-theme="light"]) .masthead__lead { color: #b8afa0; }
    :root:not([data-theme="light"]) .doc__title { color: #f4eee2; }
    :root:not([data-theme="light"]) .doc__note { color: #b8afa0; }
    :root:not([data-theme="light"]) .doc__eyebrow { color: var(--accent); }
  }

  .legend {
    display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 1.6rem;
  }
  .legend__chip {
    font-size: 0.78rem; font-weight: 600; padding: 0.32rem 0.7rem; border-radius: 999px;
    background: color-mix(in srgb, var(--accent) 14%, transparent);
    color: color-mix(in srgb, var(--accent) 72%, var(--ink));
    border: 1px solid color-mix(in srgb, var(--accent) 26%, transparent);
  }

  .grid {
    margin-top: clamp(2.4rem, 5vw, 4rem);
    display: grid; gap: clamp(1.6rem, 3vw, 2.6rem);
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    align-items: start;
  }

  .doc { display: flex; flex-direction: column; gap: 1rem; }
  .doc__head { display: flex; flex-direction: column; gap: 0.15rem; }
  .doc__eyebrow {
    font-size: 0.7rem; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase;
    color: var(--accent);
  }
  .doc__title { margin: 0; font-size: 1.15rem; font-weight: 700; color: var(--ink); letter-spacing: -0.01em; }
  .doc__note { margin: 0; font-size: 0.85rem; color: var(--ink-soft); line-height: 1.55; }

  /* Термо-лента */
  .paper {
    position: relative;
    background: var(--paper);
    border-radius: 3px;
    padding: 1.4rem 1.15rem 1.6rem;
    box-shadow:
      0 1px 0 color-mix(in srgb, var(--paper-edge) 80%, #fff),
      0 18px 34px -20px rgb(var(--shadow) / 0.55),
      0 6px 14px -10px rgb(var(--shadow) / 0.4);
    overflow: hidden;
  }
  /* Перфорирани „откъснати" ръбове горе и долу */
  .paper::before, .paper::after {
    content: ""; position: absolute; left: 0; right: 0; height: 8px;
    background:
      radial-gradient(6px 8px at 6px 0, transparent 5px, var(--paper) 5.5px) 0 0/12px 8px repeat-x;
  }
  .paper::before { top: -4px; transform: rotate(180deg); }
  .paper::after { bottom: -4px; }
  .paper__text {
    margin: 0;
    font-family: ui-monospace, "SF Mono", "JetBrains Mono", "Cascadia Code", Consolas, monospace;
    font-size: 11.5px; line-height: 1.42; color: var(--ink);
    white-space: pre; overflow-x: auto;
    font-variant-numeric: tabular-nums;
    -webkit-overflow-scrolling: touch;
  }
  .paper__text::-webkit-scrollbar { height: 6px; }
  .paper__text::-webkit-scrollbar-thumb { background: var(--hair); border-radius: 999px; }

  footer.foot {
    margin-top: clamp(2.6rem, 5vw, 4rem); padding-top: 1.4rem;
    border-top: 1px solid var(--hair); font-size: 0.82rem; color: var(--ink-faint);
    max-width: 52rem;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) footer.foot { color: #8a8072; }
  }
</style>

<div class="wrap">
  <header class="masthead">
    <p class="masthead__eyebrow">Касата · демонстрация</p>
    <h1 class="masthead__title">Примерни касови бележки</h1>
    <p class="masthead__lead">
      Документите долу са генерирани от истинските билдъри на системата — същият код,
      който изпраща редовете към фискалния принтер. Демонстрационни са: не са реални
      фискални бонове.
    </p>
    <div class="legend">
      <span class="legend__chip">Наредба Н-18</span>
      <span class="legend__chip">чл. 114 ЗДДС</span>
      <span class="legend__chip">EUR / BGN · 1.95583</span>
      <span class="legend__chip">УНП · Прил. № 29</span>
      <span class="legend__chip">СУПТО-готово</span>
    </div>
  </header>

  <main class="grid">
${cards}
  </main>

  <footer class="foot">
    Данъчни групи по чл. 27 Н-18: А = 0% / освободени, Б = 20%, В = течни горива (20%),
    Г = 9%. Крайната сума се обозначава двувалутно (EUR + BGN + курс 1.95583) до 08.08.2026 г.
    съгласно ЗВЕРБ. Фирмените данни се управляват от админския панел
    „Настройки → Данни на фирмата“ и се печатат на всеки документ.
  </footer>
</div>
`;

writeFileSync(dest, html);
console.log("wrote", dest);
