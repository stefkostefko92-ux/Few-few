import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { logger } from '../logger.js';
import { anteprimaModello } from './anteprima.js';
import type { ModelloCartello } from './modelli.js';
import { renderCartello, type AziendaCartello, type DatiCartello } from './pdf.js';

/**
 * Как изглежда табелата (собственикът, 30 октомври 2026: „nella parte superiore di tutti i cartelli deve
 * comparire il logo e i dati societari“): картинката на страницата и в настройките е самият PDF — с
 * логото и данните на фирмата горе, — превърнат в WebP през pdftoppm (poppler-utils, в образа). Така
 * това, което човекът вижда, е точно това, което ще отпечата. Картинките се помнят по входа си
 * (шаблон, данни, лого); без pdftoppm (машина за разработка) — голият шаблон и предупреждение в лога.
 */

/** Ширината в пиксели — двойна спрямо мястото в страницата (480 px), за остър екран. */
const LARGHEZZA = 960;
const MAX_IN_MEMORIA = 80;
const TIMEOUT_MS = 15_000;

const cache = new Map<string, Promise<Buffer>>();
let senzaPoppler = false;

type Pixel = { data: Buffer; width: number; height: number };

/**
 * Пикселите на PPM (P6, 8 бита) — изходът по подразбиране на pdftoppm. PNG-то през pdftoppm е 1,2 s
 * на страница (компресията), суровият PPM — 45 ms; WebP-то го прави sharp.
 */
function leggiPpm(ppm: Buffer): Pixel {
  const head = /^P6\s+(\d+)\s+(\d+)\s+255\s/.exec(ppm.subarray(0, 64).toString('latin1'));
  const width = Number(head?.[1]);
  const height = Number(head?.[2]);
  const data = ppm.subarray(head?.[0].length ?? 0);
  if (!head || data.length !== width * height * 3) throw new Error('pdftoppm: неочакван изход');
  return { data, width, height };
}

/** Страницата на PDF-а, `width` пиксела широка; null — pdftoppm го няма. */
function rasterizza(pdf: Buffer, width: number): Promise<Pixel | null> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'pdftoppm',
      ['-singlefile', '-scale-to-x', String(width), '-scale-to-y', '-1', '-'],
      { stdio: ['pipe', 'pipe', 'pipe'] },
    );
    // Свой таймер, не `timeout` на spawn: той се спира само при 'exit', а без pdftoppm 'exit' няма —
    // всяко извикване би държало процеса жив още 15 s.
    const timer = setTimeout(() => child.kill('SIGKILL'), TIMEOUT_MS);
    const out: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => out.push(chunk));
    child.stderr.resume();
    child.on('error', (error: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      if (error.code === 'ENOENT') resolve(null);
      else reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(`pdftoppm: изход ${code}`));
      try {
        resolve(leggiPpm(Buffer.concat(out)));
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
    child.stdin.on('error', () => undefined);
    child.stdin.end(pdf);
  });
}

/** Отпечатъкът на входа — същите данни, същата картинка (PDF-ът сам носи час и не става за ключ). */
function chiave(modello: ModelloCartello, dati: DatiCartello, azienda: AziendaCartello): string {
  const hash = createHash('sha256');
  hash.update(JSON.stringify([modello.id, modello.sha256, dati, azienda.intestazione]));
  hash.update(azienda.logo ?? Buffer.alloc(0));
  return hash.digest('hex');
}

/** Картинката на табелата (WebP) — с логото и данните на фирмата горе, както в PDF-а. */
export function vistaCartello(
  modello: ModelloCartello,
  dati: DatiCartello,
  azienda: AziendaCartello,
  fontDir: string,
): Promise<Buffer> {
  const key = chiave(modello, dati, azienda);
  let pronta = cache.get(key);
  if (!pronta) {
    pronta = (async () => {
      const pagina = await rasterizza(
        await renderCartello(modello, dati, azienda, fontDir),
        LARGHEZZA,
      );
      if (!pagina) {
        if (!senzaPoppler)
          logger.warn('pdftoppm липсва — табелата се показва без логото и данните');
        senzaPoppler = true;
        return anteprimaModello(modello);
      }
      const { data, width, height } = pagina;
      return sharp(data, { raw: { width, height, channels: 3 } })
        .webp({ quality: 80 })
        .toBuffer();
    })();
    cache.set(key, pronta);
    pronta.catch(() => cache.delete(key));
    // Най-старата картинка излиза първа — паметта има таван.
    if (cache.size > MAX_IN_MEMORIA) cache.delete(cache.keys().next().value!);
  }
  return pronta;
}

/** Размерът на картинката (за width/height в страницата): страница A4 по посоката на шаблона. */
export const misuraVista = (modello: ModelloCartello): { width: number; height: number } =>
  modello.larghezza >= modello.altezza
    ? { width: LARGHEZZA, height: Math.round((LARGHEZZA * 595.28) / 841.89) }
    : { width: LARGHEZZA, height: Math.round((LARGHEZZA * 841.89) / 595.28) };

/** Празните стойности — за картинката на шаблона в настройките (само главата на фирмата). */
export const DATI_VUOTI: DatiCartello = {
  data: '',
  indirizzo: '',
  citta: '',
  ubicazione: '',
  testo: '',
};
