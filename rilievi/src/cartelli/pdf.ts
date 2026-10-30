import fontkit from '@pdf-lib/fontkit';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import PDFDocument from 'pdfkit';
import type { IntestazioneAzienda } from '../aziende/dati.js';
import { ROOT } from '../paths.js';
import { pdfFontPaths } from '../schede/pdf.js';
import { immagineModello, type ModelloCartello } from './modelli.js';

/**
 * PDF-ът на табелата „Avviso di fermo impianto“: страница A4 (хоризонтална за широка табела, вертикална
 * за висока), шаблонът на фирмата (modelli.ts) вписан в нея, изчистен от примерните данни, горе логото
 * и данните на фирмата, после дейността, датата, адресът, градът, мястото и текстът към хората. Шрифтът е Fira Sans Condensed (като надписите на шаблоните); знак извън латиницата пише реда с
 * DejaVu. Всеки текст се смалява, докато влезе в мястото си, и чак тогава се реже с „…“.
 */

const A4 = { short: 595.28, long: 841.89 };
const MARGINE = 14;
const MIN = 0.55;

export interface DatiCartello {
  data: string;
  indirizzo: string;
  citta: string;
  ubicazione: string;
  testo: string;
}

export interface AziendaCartello {
  intestazione: IntestazioneAzienda;
  logo: Buffer | null;
}

/** Fira Sans Condensed 500 и 700 като WOFF (fontkit-ът на pdfkit чупи WOFF2): от билда или от пакета. */
function faccia(file: string): string | null {
  return (
    [
      join(ROOT, 'public', 'fonts', file),
      join(ROOT, 'node_modules', '@fontsource', 'fira-sans-condensed', 'files', file),
    ].find((path) => existsSync(path)) ?? null
  );
}
const COND = faccia('fira-sans-condensed-latin-500-normal.woff');
const COND_B = faccia('fira-sans-condensed-latin-700-normal.woff');
const GLIFI = COND ? fontkit.create(readFileSync(COND)) : null;
const latino = (s: string): boolean =>
  GLIFI !== null && Array.from(s).every((c) => GLIFI.hasGlyphForCodePoint(c.codePointAt(0) ?? 0));

type Peso = 'normale' | 'grassetto';

/**
 * Един ред в ширината `max`: смалява се до MIN от размера, после се реже с „…“. Смаленият текст е точно
 * колкото мястото — допускът е за закръглянето, иначе би получил „…“ (датата „03/11/2026“ на „Blu“).
 */
export function adatta(
  str: string,
  max: number,
  size: number,
  misura: (testo: string, size: number) => number,
): { testo: string; size: number } {
  const w = misura(str, size);
  const ridotta = w > max ? Math.max(size * MIN, (size * max) / w) : size;
  let testo = str;
  while (testo.length > 1 && misura(testo, ridotta) > max + 0.01) testo = `${testo.slice(0, -2)}…`;
  return { testo, size: ridotta };
}

export async function renderCartello(
  modello: ModelloCartello,
  dati: DatiCartello,
  azienda: AziendaCartello,
  fontDir: string,
): Promise<Buffer> {
  const immagine = await immagineModello(modello);
  const larga = modello.larghezza >= modello.altezza;
  const W = larga ? A4.long : A4.short;
  const H = larga ? A4.short : A4.long;
  const s = Math.min((W - 2 * MARGINE) / modello.larghezza, (H - 2 * MARGINE) / modello.altezza);
  const ox = (W - modello.larghezza * s) / 2;
  const oy = (H - modello.altezza * s) / 2;
  const X = (x: number) => ox + x * s;
  const Y = (y: number) => oy + y * s;

  const doc = new PDFDocument({
    size: [W, H],
    margin: 0,
    info: {
      Title: 'Avviso di fermo impianto',
      Producer: 'Rilievi Impianti — Carbon Stealth VCC',
    },
  });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const dejavu = pdfFontPaths(fontDir);
  doc.registerFont('Sans', dejavu.regular);
  doc.registerFont('SansBold', dejavu.bold);
  if (COND) doc.registerFont('Cond', COND);
  if (COND_B) doc.registerFont('CondBold', COND_B);
  const fontOf = (str: string, peso: Peso): string =>
    latino(str) && COND && COND_B
      ? peso === 'grassetto'
        ? 'CondBold'
        : 'Cond'
      : peso === 'grassetto'
        ? 'SansBold'
        : 'Sans';
  const width = (str: string, peso: Peso, size: number): number =>
    doc.font(fontOf(str, peso)).fontSize(size).widthOfString(str);

  /** Един ред с базова линия на `y` (`adatta`). */
  const riga = (str: string, x: number, y: number, max: number, size: number, peso: Peso) => {
    const fit = adatta(str, max, size, (testo, n) => width(testo, peso, n));
    doc.font(fontOf(fit.testo, peso)).fontSize(fit.size);
    doc.text(fit.testo, x, y, { baseline: 'alphabetic', lineBreak: false });
  };

  /** Абзацът в редове до ширината (по думи; дълга дума — по знаци). */
  const wrap = (str: string, max: number, size: number, peso: Peso): string[] => {
    const lines: string[] = [];
    for (const paragraph of str.split('\n')) {
      let line = '';
      for (const word of paragraph.split(/\s+/).filter(Boolean)) {
        const next = line ? `${line} ${word}` : word;
        if (width(next, peso, size) <= max) {
          line = next;
          continue;
        }
        if (line) lines.push(line);
        line = word;
        while (line.length > 1 && width(line, peso, size) > max) {
          let cut = line.length - 1;
          while (cut > 1 && width(line.slice(0, cut), peso, size) > max) cut -= 1;
          lines.push(line.slice(0, cut));
          line = line.slice(cut);
        }
      }
      lines.push(line);
    }
    while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
    return lines;
  };

  doc.image(immagine, ox, oy, { width: modello.larghezza * s, height: modello.altezza * s });

  // Логото — вписано в кутията си, вляво и по средата (върху бяла плочка на тъмна табела).
  const [lx0, ly0, lx1, ly1] = modello.logo.box;
  let datiX0 = modello.azienda.box[0];
  if (azienda.logo) {
    const pad = modello.logo.lastra ? 8 : 0;
    if (modello.logo.lastra) {
      doc
        .roundedRect(X(lx0), Y(ly0), (lx1 - lx0) * s, (ly1 - ly0) * s, 6 * s)
        .fill(modello.logo.lastra);
    }
    doc.image(azienda.logo, X(lx0 + pad), Y(ly0 + pad), {
      fit: [(lx1 - lx0 - 2 * pad) * s, (ly1 - ly0 - 2 * pad) * s],
      // Без `align` — вляво (pdfkit няма 'left').
      ...(modello.logo.lastra ? { align: 'center' as const } : {}),
      valign: 'center',
    });
  } else {
    datiX0 = lx0;
  }

  // Данните на фирмата: името (получер) и редовете под него, смалени, докато влязат в кутията.
  {
    const { nome, righe } = azienda.intestazione;
    const [, by0, bx1, by1] = modello.azienda.box;
    const boxW = (bx1 - datiX0) * s;
    const boxH = (by1 - by0) * s;
    const base = modello.azienda.dimensione * s;
    const altezza = (size: number) => size * 1.25 + righe.length * size * 0.9 * 1.3;
    let size = base;
    while (size > base * MIN && altezza(size) > boxH) size -= 0.25;
    const top = Y(by0) + (boxH - altezza(size)) / 2;
    doc.fillColor(modello.azienda.colore);
    riga(nome, X(datiX0), top + size, boxW, size * 1.15, 'grassetto');
    righe.forEach((r, i) =>
      riga(
        r,
        X(datiX0),
        top + size * 1.25 + (i + 1) * size * 0.9 * 1.3 - size * 0.25,
        boxW,
        size * 0.9,
        'normale',
      ),
    );
  }

  const { attivita, valori, testo } = modello;
  if (azienda.intestazione.attivita) {
    doc.fillColor(attivita.colore);
    riga(
      azienda.intestazione.attivita.toLocaleUpperCase('it-IT'),
      X(attivita.x),
      Y(attivita.y),
      attivita.larghezza * s,
      attivita.dimensione * s,
      'normale',
    );
  }

  doc.fillColor(valori.colore);
  [dati.data, dati.indirizzo, dati.citta, dati.ubicazione].forEach((valore, i) => {
    const [x, w] = valori.colonne[i]!;
    if (valore) riga(valore, X(x), Y(valori.y), w * s, valori.dimensione * s, 'grassetto');
  });

  // Текстът към хората — с главни букви като на шаблоните; смалява се, докато влезе в редовете си.
  if (dati.testo.trim()) {
    const str = dati.testo.trim().toLocaleUpperCase('it-IT');
    const max = testo.larghezza * s;
    const base = testo.dimensione * s;
    let size = base;
    let lines = wrap(str, max, size, 'normale');
    while (size > base * MIN && lines.length > testo.righe) {
      size -= 0.25;
      lines = wrap(str, max, size, 'normale');
    }
    // По-ситен шрифт — повече редове в същата височина.
    const step = testo.riga * s * (size / base);
    const room = Math.floor(((testo.righe - 1) * testo.riga * s) / step) + 1;
    doc.fillColor(testo.colore);
    lines
      .slice(0, room)
      .forEach((line, i) => riga(line, X(testo.x), Y(testo.y) + i * step, max, size, 'normale'));
  }

  for (const scritta of modello.scritte) {
    doc.fillColor(scritta.colore);
    riga(
      scritta.testo,
      X(scritta.x),
      Y(scritta.y),
      scritta.larghezza * s,
      scritta.dimensione * s,
      scritta.peso,
    );
  }

  doc.end();
  return done;
}
