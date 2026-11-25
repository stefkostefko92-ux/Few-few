// Презентацията на Rilievi Impianti — А4, лице и гръб като флаера (собственикът, 16 ноември 2026: „Направи ми
// презентация а4 за софтуера ни“, после „Направи го 2 страници като флеъра“). Текстовете са италиански (порталът е
// само на италиански) и казват само каквото порталът прави — прегледани от Преводача. Модулът на Pelazza е
// истинският PDF от портала с примерни данни („Ascensori Esempio S.r.l.“), превърнат в SVG (pdftocairo —
// векторен); двата екрана на телефона са снимки на портала (390 × 844, DPR 3) — print/presentazione/.
// Пише print/presentazione-a4.html (за преглед), два PDF-а и прегледите на двете страни:
//   presentazione-a4.pdf         — точно A4 (210 × 297 mm), за принтер в офиса и за пращане по имейл;
//   presentazione-a4-stampa.pdf  — A4 с 3 mm „bleed“ от всяка страна (216 × 303 mm), за печатница;
//   presentazione-fronte.png / presentazione-retro.png — прегледите.
//   node print/presentazione.mjs            (CHROMIUM=/път/до/chromium — по избор)
import { unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import QRCode from 'qrcode';
import { chromium } from 'playwright';

const HERE = dirname(fileURLToPath(import.meta.url));
const SITO = 'https://rilievi.carbonstealth.eu/';
const BLEED = 3; // mm — за печатницата
const A = 'presentazione/'; // активите — спрямо print/

const qr = await QRCode.toString(SITO, {
  type: 'svg',
  errorCorrectionLevel: 'M',
  margin: 0,
  color: { dark: '#000000', light: '#ffffff' },
});

const font = (famiglia, file, peso) =>
  `@font-face{font-family:'${famiglia}';font-weight:${peso};font-style:normal;` +
  `src:url('../node_modules/@fontsource/${file}') format('woff2');}`;
const FONT = [
  font('Fira Sans', 'fira-sans/files/fira-sans-latin-400-normal.woff2', 400),
  font('Fira Sans', 'fira-sans/files/fira-sans-latin-600-normal.woff2', 600),
  font('Fira Sans', 'fira-sans/files/fira-sans-latin-700-normal.woff2', 700),
  font(
    'Fira Sans Condensed',
    'fira-sans-condensed/files/fira-sans-condensed-latin-700-normal.woff2',
    700,
  ),
  font(
    'Fira Sans Condensed',
    'fira-sans-condensed/files/fira-sans-condensed-latin-800-normal.woff2',
    800,
  ),
].join('\n');

/** Петте стъпки на лицето — истинска поредица, затова с номера. */
const PASSI = [
  [
    'Sopralluogo',
    'Il tecnico compila la scheda dal telefono; se nel vano manca la rete, la scheda resta salvata sul telefono.',
  ],
  ['Ufficio', "Trovi l'impianto per matricola o indirizzo e stampi la scheda con il tuo logo."],
  ['Ordini', "I moduli d'ordine dei costruttori si compilano con i dati della scheda."],
  ['Assistenza', 'Foglio di intervento firmato sul telefono e cartelli di fermo impianto.'],
  ['Cantiere', 'Buono di lavoro e verbale di chiusura cantiere, con le firme.'],
];

/** Какво прави порталът — по витрината и rilievi/CLAUDE.md. Не е поредица: без номера. */
const FUNZIONI = [
  [
    'Sul posto, dal telefono',
    'Campi grandi, unità di misura già scritte, foto e video in ogni sezione. Compaiono solo le domande che servono per quel tipo di impianto e di porte.',
  ],
  [
    "Trovi l'impianto mentre scrivi",
    'Cerchi per matricola, numero impianto, indirizzo, marca o buono di lavoro. In ufficio stampi la scheda in A4 o in PDF, con il logo della tua azienda.',
  ],
  [
    "Moduli d'ordine compilati dal rilievo",
    "Quadri Pelazza, Movilift, DMG Pitagora 4.0, Mastech, Elettroquadri e GEAT; bottoniere DMG, scheda dati dell'argano e modulo 2SG. Ogni modulo esce in PDF e lo mandi al fornitore per email.",
  ],
  [
    'Foglio di intervento firmato',
    'Numerato per azienda. Tecnico e cliente firmano con il dito; dopo la conferma il foglio non si modifica più ed esce in PDF A4.',
  ],
  [
    'Cartelli, buoni e verbali',
    "Cartelli di fermo impianto con il tuo logo, buono di lavoro e verbale di chiusura cantiere. Se l'impianto ha una scheda, l'indirizzo e altri dati si compilano da soli.",
  ],
  [
    "Calcoli dell'argano e del limitatore",
    'Partono dai dati del rilievo. Ogni foglio riporta i dati usati e va controllato e firmato da un tecnico abilitato: senza la sua firma non ha valore.',
  ],
  [
    'Nessuna modifica va persa',
    'Se due persone modificano la stessa scheda, la seconda riceve un avviso. Le ultime 100 versioni restano consultabili.',
  ],
  [
    'Ogni azienda nel suo spazio',
    "Schede e persone di un'azienda le vede solo quell'azienda, oltre all'amministrazione del portale (Carbon Stealth). 6 ruoli, che l'amministratore rinomina.",
  ],
  [
    'I dati restano tuoi',
    "Server nell'Unione europea, una copia di sicurezza ogni giorno. L'amministratore scarica tutti i dati dell'azienda quando vuole, senza costi.",
  ],
];

const esc = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function html(bleed) {
  const passi = PASSI.map(
    ([t, d], i) =>
      `<li><span class="n">${i + 1}</span><div><h3>${esc(t)}</h3><p>${esc(d)}</p></div></li>`,
  ).join('\n');
  const funzioni = FUNZIONI.map(
    ([t, d]) => `<div class="funzione"><h3>${esc(t)}</h3><p>${esc(d)}</p></div>`,
  ).join('\n');
  return `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<title>Rilievi Impianti — presentazione A4</title>
<meta name="keywords" content="Carbon Stealth, Rilievi Impianti, software per ascensoristi, scheda rilievo ascensore, foglio di intervento ascensore, moduli d'ordine quadri, calcolo argano">
<style>
${FONT}
:root {
  --bleed: ${bleed}mm;
  --w: calc(210mm + 2 * var(--bleed));
  --h: calc(297mm + 2 * var(--bleed));
  /* Безопасната зона: 10 мм от линията на рязане. */
  --m: calc(10mm + var(--bleed));
  --nero: #000000;
  --bianco: #ffffff;
  --grigio: #595959;
  --linea: #bdbdbd;
}
@page { size: var(--w) var(--h); margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { background: var(--bianco); }
body { font-family: 'Fira Sans', sans-serif; color: var(--nero); -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.pagina { position: relative; width: var(--w); height: var(--h); overflow: hidden; break-after: page; }
.pagina:last-child { break-after: auto; }
h1, h2 { font-family: 'Fira Sans Condensed', sans-serif; font-weight: 800; letter-spacing: -.3pt; }

/* Лицето: черно, заглавието, петте стъпки, шахтата долу вдясно. */
.fronte { background: var(--nero); color: var(--bianco); }
.fronte .logo { position: absolute; left: var(--m); top: var(--m); width: 98mm; }
.fronte .testo { position: absolute; left: var(--m); right: var(--m); top: calc(var(--bleed) + 58mm); }
.fronte h1 { font-size: 40pt; line-height: 1.02; }
.fronte .lead { margin-top: 6mm; font-size: 12.5pt; line-height: 1.45; max-width: 150mm; }
.fronte .passi { position: absolute; left: var(--m); top: calc(var(--bleed) + 132mm); width: 84mm; list-style: none; }
.fronte .passi li { display: grid; grid-template-columns: 10mm 1fr; gap: 2mm; padding: 2.6mm 0 2.8mm; border-top: .5pt solid rgba(255,255,255,.4); }
.fronte .passi .n { font-family: 'Fira Sans Condensed', sans-serif; font-weight: 800; font-size: 18pt; line-height: 1; }
.fronte .passi h3 { font-weight: 700; font-size: 10.5pt; line-height: 1.2; }
.fronte .passi p { margin-top: .6mm; font-size: 8.8pt; line-height: 1.4; color: rgba(255,255,255,.82); }
.fronte .foto { position: absolute; right: 0; bottom: 0; width: calc(100mm + var(--bleed)); height: calc(150mm + var(--bleed)); object-fit: cover; object-position: 50% 55%; }
.fronte .nota { position: absolute; right: var(--m); bottom: calc(var(--bleed) + 152mm); font-size: 6pt; color: rgba(255,255,255,.65); }
.fronte .piede { position: absolute; left: var(--m); bottom: var(--m); width: 84mm; border-top: .5pt solid rgba(255,255,255,.55); padding-top: 3.5mm; }
.fronte .piede strong { display: block; font-family: 'Fira Sans Condensed', sans-serif; font-weight: 800; font-size: 18pt; line-height: 1.05; }
.fronte .piede span { display: block; margin-top: 1mm; font-size: 9pt; }
.fronte .piede .sito { margin-top: 3mm; font-weight: 700; font-size: 12pt; }

/* Гърбът: бяла хартия, черна е само лентата долу (QR кодът). */
.retro .corpo { position: absolute; left: var(--m); right: var(--m); top: var(--m); }
.retro h2 { font-size: 24pt; line-height: 1.05; }
.retro .lead { margin-top: 2.5mm; font-size: 10pt; line-height: 1.42; max-width: 175mm; }
.retro .vista { margin-top: 5mm; display: grid; grid-template-columns: 46mm 46mm 71mm; justify-content: space-between; align-items: start; }
.retro .telefono { display: block; width: 100%; height: auto; border: 1.8mm solid var(--nero); border-radius: 5mm; }
.retro .doc { display: block; width: 100%; height: auto; border: .5pt solid var(--linea); }
.retro figcaption { margin-top: 1.6mm; font-size: 7.2pt; line-height: 1.3; color: var(--grigio); }
.retro .griglia { margin-top: 4mm; display: grid; grid-template-columns: repeat(3, 1fr); column-gap: 6mm; }
.retro .funzione { padding: 2.3mm 0 2.5mm; border-top: .5pt solid var(--linea); }
.retro .funzione h3 { font-weight: 700; font-size: 9pt; line-height: 1.2; }
.retro .funzione p { margin-top: .8mm; font-size: 7.7pt; line-height: 1.38; color: var(--grigio); }
.retro .nota { margin-top: 1mm; font-size: 6.6pt; color: var(--grigio); }
.retro .banda { position: absolute; left: 0; right: 0; bottom: 0; height: calc(62mm + var(--bleed)); background: var(--nero); color: var(--bianco);
  padding: 6mm var(--m) calc(var(--bleed) + 7mm); display: grid; grid-template-columns: 46mm 1fr; gap: 8mm; align-items: center; }
.retro .qr { width: 46mm; height: 46mm; background: var(--bianco); padding: 5.6mm; } /* бяло поле от поне 4 модула */
.retro .qr svg { width: 100%; height: 100%; display: block; }
.retro .invito strong { display: block; font-family: 'Fira Sans Condensed', sans-serif; font-weight: 800; font-size: 17pt; line-height: 1.08; }
.retro .invito p { margin-top: 2mm; font-size: 8.4pt; line-height: 1.42; }
.retro .invito .sito { display: block; margin-top: 2.5mm; font-weight: 700; font-size: 12.5pt; }
.retro .contatti { margin-top: 2mm; font-size: 7.6pt; line-height: 1.45; color: rgba(255,255,255,.82); }
</style>
</head>
<body>
<section class="pagina fronte" aria-label="Fronte">
  <img class="logo" src="../scripts/logo/originals/logo.png" alt="Rilievi Impianti — Piattaforma tecnica ascensori">
  <div class="testo">
    <h1>Il rilievo dell'ascensore,<br>campo per campo.</h1>
    <p class="lead">Il software web per le aziende di ascensori: la scheda di rilievo dal telefono, i moduli d'ordine dei costruttori, il foglio di intervento firmato, i cartelli e i documenti di cantiere.</p>
  </div>
  <ol class="passi">
${passi}
  </ol>
  <img class="foto" src="../public/img/site/vano-portrait-1200.webp" alt="Rendering 3D di un vano ascensore visto dalla fossa verso l'alto">
  <p class="nota">Immagine: rendering 3D</p>
  <div class="piede"><strong>Primo mese gratuito</strong><span>con tutte le funzioni</span><span class="sito">rilievi.carbonstealth.eu</span></div>
</section>
<section class="pagina retro" aria-label="Retro">
  <div class="corpo">
    <h2>Dal sopralluogo all'ufficio</h2>
    <p class="lead">Un solo portale per la scheda di rilievo, l'assistenza e il cantiere. Si apre nel browser su telefono, tablet e computer: non c'è niente da installare.</p>
    <div class="vista">
      <figure><img class="telefono" src="${A}telefono-scheda.png" alt="La scheda di rilievo aperta su un telefono"><figcaption>La scheda sul telefono.</figcaption></figure>
      <figure><img class="telefono" src="${A}telefono-firma.png" alt="Le firme del tecnico e del cliente sul telefono"><figcaption>Le firme sul foglio di intervento.</figcaption></figure>
      <figure><img class="doc" src="${A}modulo-pelazza.svg" alt="Il modulo d'ordine del quadro Pelazza compilato"><figcaption>Il modulo d'ordine del quadro Pelazza, compilato con i dati della scheda.</figcaption></figure>
    </div>
    <p class="nota">Schermate e documento del portale con dati di esempio. I marchi citati appartengono ai rispettivi titolari.</p>
    <div class="griglia">
${funzioni}
    </div>
  </div>
  <div class="banda">
    <div class="qr" role="img" aria-label="Codice QR per ${esc(SITO)}">${qr}</div>
    <div class="invito">
      <strong>Inquadra il codice e richiedi l'accesso.</strong>
      <p>Il primo mese è gratuito, con tutte le funzioni. Poi scegli un piano in base al numero di persone: fino a 10, fino a 25 oppure oltre 25. Si paga in anticipo e non si rinnova da solo; i prezzi, IVA esclusa, sono su rilievi.carbonstealth.eu/prezzi.</p>
      <span class="sito">rilievi.carbonstealth.eu</span>
      <p class="contatti">+39 379 29 69 699 &nbsp; info@carbonstealth.eu<br>Carbon Stealth VCC, P. IVA BG208725180</p>
    </div>
  </div>
</section>
</body>
</html>
`;
}

const anteprima = join(HERE, 'presentazione-a4.html');
await writeFile(anteprima, html(0));
const stampa = join(HERE, '.presentazione-stampa.html');
await writeFile(stampa, html(BLEED));

const browser = await chromium.launch(
  process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {},
);
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const [file, pdf] of [
    [anteprima, 'presentazione-a4.pdf'],
    [stampa, 'presentazione-a4-stampa.pdf'],
  ]) {
    await page.goto(pathToFileURL(file).href, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    // Нищо не се застъпва: на лицето стъпките стоят над долния блок, на гърба текстът — над черната лента
    // (поне 3 мм въздух; 1 мм = 96 / 25,4 CSS px).
    const aria = await page.evaluate(() => {
      const r = (q) => document.querySelector(q).getBoundingClientRect();
      const mm = (px) => (px * 25.4) / 96;
      return {
        fronte: mm(r('.fronte .piede').top - r('.fronte .passi').bottom),
        titolo: mm(r('.fronte .passi').top - r('.fronte .testo').bottom),
        retro: mm(r('.retro .banda').top - r('.retro .corpo').bottom),
      };
    });
    for (const [dove, mm] of Object.entries(aria))
      if (mm < 3) throw new Error(`${dove}: само ${mm.toFixed(1)} мм между блоковете`);
    await page.pdf({ path: join(HERE, pdf), printBackground: true, preferCSSPageSize: true });
  }
  // Прегледите — по рамката на страницата, закръглена навътре (иначе снимката взима 1 px от съседната).
  const vista = await browser.newPage({ deviceScaleFactor: 1.5 });
  await vista.goto(pathToFileURL(anteprima).href, { waitUntil: 'load' });
  await vista.evaluate(() => document.fonts.ready);
  const pagine = await vista.$$('.pagina');
  for (const [i, nome] of ['fronte', 'retro'].entries()) {
    const r = await pagine[i].boundingBox();
    const y = Math.ceil(r.y);
    await vista.screenshot({
      path: join(HERE, `presentazione-${nome}.png`),
      fullPage: true,
      clip: { x: r.x, y, width: r.width, height: Math.floor(r.y + r.height) - y },
    });
  }
} finally {
  await browser.close();
  await unlink(stampa).catch(() => {});
}
console.log(
  'print/: presentazione-a4.pdf, presentazione-a4-stampa.pdf, presentazione-fronte.png, presentazione-retro.png',
);
