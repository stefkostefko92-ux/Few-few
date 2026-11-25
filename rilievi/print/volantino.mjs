// Рекламният флаер А5 на Rilievi Impianti — лице и гръб (собственикът, 16 ноември 2026: „Направи ми рекламен А5
// flair (отпред/отзад) за нашият софтуер. На задната страница искам QR който води към сайта“).
// Пише print/volantino-a5.html (за преглед), два PDF-а и прегледите на двете страни:
//   volantino-a5.pdf         — точно A5 (148 × 210 mm), за принтер в офиса;
//   volantino-a5-stampa.pdf  — A5 с 3 mm „bleed“ от всяка страна (154 × 216 mm), за печатница;
//   volantino-fronte.png / volantino-retro.png — прегледите.
// Текстовете са италиански (порталът е само на италиански) и казват само каквото порталът прави — от витрината
// (locales/it/site.json). Снимките са нашите 3D рендери (public/img/site), логото — scripts/logo/originals.
//   node print/volantino.mjs            (CHROMIUM=/път/до/chromium — по избор)
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import QRCode from 'qrcode';
import { chromium } from 'playwright';

const HERE = dirname(fileURLToPath(import.meta.url));
const SITO = 'https://rilievi.carbonstealth.eu/';
const BLEED = 3; // mm — за печатницата

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

/** Какво прави порталът — по витрината, накратко. Не е поредица: без номера. */
const FUNZIONI = [
  [
    'Sul posto, dal telefono',
    'Campi grandi, unità di misura già scritte, foto e video in ogni sezione. Senza rete la scheda resta salvata sul telefono e la invii quando torna il segnale.',
  ],
  [
    "Trovi l'impianto mentre scrivi",
    'Cerchi per matricola, numero impianto, indirizzo, marca o buono di lavoro. In ufficio stampi la scheda in A4 o in PDF, con il logo della tua azienda.',
  ],
  [
    "Moduli d'ordine compilati dal rilievo",
    "Quadri Pelazza, Movilift, DMG Pitagora 4.0, Mastech, Elettroquadri e GEAT; bottoniere DMG, scheda dati dell'argano e modulo 2SG per operatore e sospensioni.",
  ],
  [
    'Foglio di intervento firmato',
    'Numerato per azienda. Tecnico e cliente firmano con il dito; dopo la conferma il foglio non si modifica più ed esce in PDF A4.',
  ],
  [
    'Cartelli, buoni e verbali',
    "Cartelli di fermo impianto con il tuo logo, buono di lavoro e verbale di chiusura cantiere. Se l'impianto ha una scheda, l'indirizzo e altri dati si compilano da soli; il resto lo scrivi tu.",
  ],
  [
    "Calcoli dell'argano e del limitatore",
    'Partono dai dati del rilievo. Ogni foglio riporta i dati usati e va controllato e firmato da un tecnico abilitato.',
  ],
];

const esc = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function html(bleed) {
  const funzioni = FUNZIONI.map(
    ([t, d]) => `<div class="funzione"><h3>${esc(t)}</h3><p>${esc(d)}</p></div>`,
  ).join('\n');
  return `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<title>Rilievi Impianti — volantino A5</title>
<meta name="keywords" content="Carbon Stealth, Rilievi Impianti, software per ascensoristi, scheda rilievo ascensore, foglio di intervento ascensore, cartello fermo impianto">
<style>
${FONT}
:root {
  --bleed: ${bleed}mm;
  --w: calc(148mm + 2 * var(--bleed));
  --h: calc(210mm + 2 * var(--bleed));
  /* Безопасната зона: 7 мм от линията на рязане. */
  --m: calc(7mm + var(--bleed));
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

/* Лицето: шахтата от ямата нагоре, на цялата страница. */
.fronte { background: var(--nero); color: var(--bianco); }
.fronte .foto { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: 50% 60%; }
.fronte .velo { position: absolute; inset: 0; background:
  linear-gradient(180deg, rgba(0,0,0,.92) 0%, rgba(0,0,0,.55) 22%, rgba(0,0,0,0) 40%, rgba(0,0,0,0) 48%, rgba(0,0,0,.82) 68%, rgba(0,0,0,.96) 100%); }
.fronte .logo { position: absolute; top: calc(var(--m) + 2mm); left: 50%; transform: translateX(-50%); width: 104mm; }
.fronte .testo { position: absolute; left: var(--m); right: var(--m); bottom: calc(var(--m) + 27mm); }
.fronte h1 { font-family: 'Fira Sans Condensed', sans-serif; font-weight: 800; font-size: 31pt; line-height: 1.02; letter-spacing: -.3pt; }
.fronte .lead { margin-top: 5mm; font-size: 10.5pt; line-height: 1.42; max-width: 118mm; }
.fronte .piede { position: absolute; left: var(--m); right: var(--m); bottom: var(--m); display: flex; align-items: flex-end; justify-content: space-between; gap: 6mm; border-top: .5pt solid rgba(255,255,255,.55); padding-top: 4mm; }
.fronte .prova strong { display: block; font-family: 'Fira Sans Condensed', sans-serif; font-weight: 800; font-size: 17pt; line-height: 1.05; }
.fronte .prova span { display: block; margin-top: 1mm; font-size: 8.5pt; }
.fronte .sito { font-weight: 600; font-size: 11pt; white-space: nowrap; }
.fronte .nota { position: absolute; right: calc(var(--bleed) + 5mm); top: 50%; transform: translateY(-50%) rotate(-90deg); transform-origin: right center; font-size: 5.5pt; color: rgba(255,255,255,.7); white-space: nowrap; }

/* Гърбът: бяла хартия, черна е само лентата долу (QR кодът). */
.retro .corpo { position: absolute; left: var(--m); right: var(--m); top: var(--m); }
.retro h2 { font-family: 'Fira Sans Condensed', sans-serif; font-weight: 800; font-size: 22pt; line-height: 1.05; }
.retro .lead { margin-top: 2.5mm; font-size: 9pt; line-height: 1.4; color: var(--nero); max-width: 125mm; }
.retro .griglia { margin-top: 4mm; display: grid; grid-template-columns: 1fr 1fr; column-gap: 6mm; row-gap: 0; }
.retro .funzione { padding: 2.4mm 0 2.6mm; border-top: .5pt solid var(--linea); }
.retro .funzione h3 { font-weight: 700; font-size: 9pt; line-height: 1.2; }
.retro .funzione p { margin-top: 1mm; font-size: 7.6pt; line-height: 1.38; color: var(--grigio); }
.retro .tablet { margin-top: 1mm; display: grid; grid-template-columns: 52mm 1fr; gap: 6mm; align-items: center; border-top: .5pt solid var(--linea); padding-top: 3mm; }
.retro .tablet img { width: 52mm; height: 31mm; object-fit: cover; object-position: 50% 55%; display: block; }
.retro .tablet p { font-size: 7.6pt; line-height: 1.4; color: var(--grigio); }
.retro .tablet p strong { display: block; color: var(--nero); font-size: 9pt; font-weight: 700; margin-bottom: 1mm; }
.retro .tablet small { display: block; margin-top: 2mm; font-size: 6pt; color: var(--grigio); }
.retro .banda { position: absolute; left: 0; right: 0; bottom: 0; height: calc(55mm + var(--bleed)); background: var(--nero); color: var(--bianco); padding: 4.5mm var(--m) calc(var(--bleed) + 6.5mm); display: grid; grid-template-columns: 42mm 1fr; gap: 7mm; align-items: center; }
.retro .qr { width: 42mm; height: 42mm; background: var(--bianco); padding: 5.2mm; } /* бяло поле от поне 4 модула */
.retro .qr svg { width: 100%; height: 100%; display: block; }
.retro .invito strong { display: block; font-family: 'Fira Sans Condensed', sans-serif; font-weight: 800; font-size: 15.5pt; line-height: 1.08; }
.retro .invito p { margin-top: 2mm; font-size: 8pt; line-height: 1.4; }
.retro .invito .sito { display: block; margin-top: 3mm; font-weight: 700; font-size: 11.5pt; }
.retro .contatti { margin-top: 2.5mm; font-size: 7.4pt; line-height: 1.45; color: rgba(255,255,255,.82); }
</style>
</head>
<body>
<section class="pagina fronte" aria-label="Fronte">
  <img class="foto" src="../public/img/site/vano-portrait-1200.webp" alt="Rendering 3D di un vano ascensore visto dalla fossa verso l'alto">
  <div class="velo"></div>
  <img class="logo" src="../scripts/logo/originals/logo.png" alt="Rilievi Impianti — Piattaforma tecnica ascensori">
  <div class="testo">
    <h1>Il rilievo dell'ascensore, campo per campo.</h1>
    <p class="lead">Il software web per le aziende di ascensori. Il tecnico compila la scheda di rilievo dal telefono; in ufficio la trovi per matricola o indirizzo e la stampi con il logo della tua azienda.</p>
  </div>
  <div class="piede">
    <div class="prova"><strong>Primo mese gratuito</strong><span>con tutte le funzioni</span></div>
    <div class="sito">rilievi.carbonstealth.eu</div>
  </div>
  <p class="nota">Immagine: rendering 3D</p>
</section>
<section class="pagina retro" aria-label="Retro">
  <div class="corpo">
    <h2>Dal sopralluogo all'ufficio</h2>
    <p class="lead">Un solo portale per la scheda di rilievo, l'assistenza e il cantiere. Si apre nel browser su telefono, tablet e computer: non c'è niente da installare.</p>
    <div class="griglia">
${funzioni}
    </div>
    <div class="tablet">
      <img src="../public/img/site/tablet-1600.webp" alt="Rendering 3D di un tablet con il portale aperto sulla nuova scheda di rilievo">
      <p><strong>I dati restano tuoi</strong>Server nell'Unione europea, una copia di sicurezza ogni giorno. L'amministratore scarica tutti i dati dell'azienda quando vuole, senza costi.<small>Immagine: rendering 3D di un tablet con il portale aperto</small></p>
    </div>
  </div>
  <div class="banda">
    <div class="qr" role="img" aria-label="Codice QR per ${esc(SITO)}">${qr}</div>
    <div class="invito">
      <strong>Inquadra il codice e richiedi l'accesso.</strong>
      <p>Il primo mese è gratuito, con tutte le funzioni. L'accesso è su richiesta: ogni azienda entra con il suo amministratore, che poi invita i colleghi.</p>
      <span class="sito">rilievi.carbonstealth.eu</span>
      <p class="contatti">+39 379 29 69 699 &nbsp; info@carbonstealth.eu<br>Carbon Stealth VCC, P. IVA BG208725180<br>I marchi citati appartengono ai rispettivi titolari.</p>
    </div>
  </div>
</section>
</body>
</html>
`;
}

await mkdir(HERE, { recursive: true });
const anteprima = join(HERE, 'volantino-a5.html');
await writeFile(anteprima, html(0));
const stampa = join(HERE, '.volantino-stampa.html');
await writeFile(stampa, html(BLEED));

const browser = await chromium.launch(
  process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {},
);
try {
  const page = await browser.newPage({ deviceScaleFactor: 2 });
  for (const [file, pdf] of [
    [anteprima, 'volantino-a5.pdf'],
    [stampa, 'volantino-a5-stampa.pdf'],
  ]) {
    await page.goto(pathToFileURL(file).href, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    // Гърбът не бива да стига до черната лента: поне 3 мм въздух (1 мм = 96 / 25,4 CSS px).
    const aria = await page.evaluate(() => {
      const corpo = document.querySelector('.retro .corpo').getBoundingClientRect();
      const banda = document.querySelector('.retro .banda').getBoundingClientRect();
      return ((banda.top - corpo.bottom) * 25.4) / 96;
    });
    if (aria < 3)
      throw new Error(`гърбът: текстът стига на ${aria.toFixed(1)} мм от черната лента`);
    await page.pdf({ path: join(HERE, pdf), printBackground: true, preferCSSPageSize: true });
  }
  await page.goto(pathToFileURL(anteprima).href, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  // По рамката на страницата, закръглена навътре: снимката на елемента иначе взима 1 px от лицето над гърба.
  const pagine = await page.$$('.pagina');
  for (const [i, nome] of ['fronte', 'retro'].entries()) {
    const r = await pagine[i].boundingBox();
    const y = Math.ceil(r.y);
    await page.screenshot({
      path: join(HERE, `volantino-${nome}.png`),
      fullPage: true,
      clip: { x: r.x, y, width: r.width, height: Math.floor(r.y + r.height) - y },
    });
  }
} finally {
  await browser.close();
  await unlink(stampa).catch(() => {});
}
console.log(
  'print/: volantino-a5.pdf, volantino-a5-stampa.pdf, volantino-fronte.png, volantino-retro.png',
);
