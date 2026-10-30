import { randomBytes } from 'node:crypto';
import { rm } from 'node:fs/promises';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import multer from 'multer';
import { sendError } from '../auth/guards.js';
import { mediaConfig } from '../config.js';
import { cartellaArrivi, riservaSpazio } from './archivio.js';
import { leggiFirma, riconosci } from './formati.js';
import { nomeSicuro, type Caricato } from './service.js';

/**
 * Тялото на качването (маршрутът е src/routes/allegati.ts): multer пише право в `arrivi/` на тома (до 10
 * файла наведнъж, всеки до тавана за клип), никога в паметта; после всеки файл се проверява по байтовете
 * и по тавана за своя вид. Каквото остане в `arrivi/`, когато отговорът тръгне — отказ на CSRF,
 * отхвърлен файл — се трие.
 */

export const MAX_FILE_PER_VOLTA = 10;
const MB = 1024 * 1024;

export type Avviso = { key: string; params?: Record<string, string | number> };
type StatoCarica = 'ok' | 'troppoGrande' | 'troppi' | 'bad';
const statiCarica = new WeakMap<Request, StatoCarica>();

let caricaFile: RequestHandler | null = null;

/** multer се прави при първото качване — таваните са от конфига. */
function middlewareCarica(): RequestHandler {
  const cfg = mediaConfig();
  caricaFile ??= multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, cartellaArrivi()),
      filename: (_req, _file, cb) => cb(null, randomBytes(16).toString('hex')),
    }),
    limits: {
      fileSize: Math.max(cfg.MEDIA_MAX_PHOTO_MB, cfg.MEDIA_MAX_VIDEO_MB) * MB,
      files: MAX_FILE_PER_VOLTA,
      fields: 8,
      fieldSize: 4096,
      parts: MAX_FILE_PER_VOLTA + 8,
    },
    // Браузърите пращат името на файла в UTF-8 („Quadro – lato sinistro.jpg“).
    defParamCharset: 'utf8',
  }).array('file', MAX_FILE_PER_VOLTA);
  return caricaFile;
}

const filesOf = (req: Request): Express.Multer.File[] =>
  Array.isArray(req.files) ? req.files : [];

/** Файловете на заявката; грешка на качването е грешка на формата (запомня се), не 500. */
export function multipart(req: Request, res: Response, next: NextFunction): void {
  res.on('close', () => {
    // Прекъснато качване: multer вече е изтрил частичния файл и е махнал `path` — той не се пипа. Грешка
    // при триенето не бива да излезе извън заявката: необработено отхвърляне сваля целия процес.
    for (const file of filesOf(req))
      if (typeof file.path === 'string') rm(file.path, { force: true }).catch(() => undefined);
  });
  middlewareCarica()(req, res, (error: unknown) => {
    if (!error) statiCarica.set(req, 'ok');
    else if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE')
      statiCarica.set(req, 'troppoGrande');
    else if (
      error instanceof multer.MulterError &&
      (error.code === 'LIMIT_FILE_COUNT' || error.code === 'LIMIT_UNEXPECTED_FILE')
    )
      statiCarica.set(req, 'troppi');
    else statiCarica.set(req, 'bad');
    next();
  });
}

/** Размерът на тялото от Content-Length — без него (chunked) размерът не се знае предварително. */
const dimensioneDi = (req: Request): number | null => {
  const raw = req.get('content-length');
  return raw && /^\d{1,15}$/.test(raw) ? Number(raw) : null;
};

/**
 * Цялото качване е до тавана за клип (+16 MB за опаковката на формата) — пращат се или един клип, или
 * няколко по-малки; повече се казва, преди тялото да тръгне към диска. Тяло без Content-Length (браузърът
 * винаги го праща) — отказ: размерът му не може да се провери. Таванът на nginx е над това.
 */
export function limiteCorpo(req: Request, res: Response, next: NextFunction): void {
  const length = dimensioneDi(req);
  if (length === null || length > (mediaConfig().MEDIA_MAX_VIDEO_MB + 16) * MB) {
    res.set('Connection', 'close');
    return sendError(
      req,
      res,
      length === null ? 411 : 413,
      'error.title',
      length === null ? 'allegati.errore.caricamento' : 'allegati.errore.totale',
    );
  }
  next();
}

/**
 * Под минимума свободно място (заедно с това, което идва, и с качванията, които още текат) — отказ,
 * преди да се пише. Мястото остава запазено, докато отговорът свърши.
 */
export async function spazio(req: Request, res: Response, next: NextFunction): Promise<void> {
  const rilascia = await riservaSpazio(dimensioneDi(req) ?? 0);
  if (!rilascia) {
    res.set('Connection', 'close');
    return sendError(req, res, 507, 'error.title', 'allegati.errore.spazio');
  }
  res.on('close', rilascia);
  next();
}

/** Каченото — по байтовете: валидните (за записа) и предупрежденията за останалите. */
export async function valutaCaricati(
  req: Request,
): Promise<{ validi: Caricato[]; avvisi: Avviso[] }> {
  const cfg = mediaConfig();
  const avvisi: Avviso[] = [];
  const stato = statiCarica.get(req) ?? 'bad';
  if (stato === 'troppoGrande')
    avvisi.push({ key: 'allegati.errore.dimensione', params: { mb: cfg.MEDIA_MAX_VIDEO_MB } });
  else if (stato === 'troppi')
    avvisi.push({ key: 'allegati.errore.troppi', params: { n: MAX_FILE_PER_VOLTA } });
  else if (stato === 'bad') avvisi.push({ key: 'allegati.errore.caricamento' });
  else if (filesOf(req).length === 0) avvisi.push({ key: 'allegati.errore.nessuno' });
  // Прекъснатото качване се отказва цялото: multer вече е изтрил записаното, а казаното важи за всичко.
  if (stato !== 'ok') return { validi: [], avvisi };
  const validi: Caricato[] = [];
  for (const file of filesOf(req)) {
    const nome = nomeSicuro(file.originalname);
    const formato = riconosci(await leggiFirma(file.path));
    if (!formato) {
      avvisi.push({ key: 'allegati.errore.tipo', params: { nome } });
    } else if (formato.tipo === 'HEIC') {
      avvisi.push({ key: 'allegati.errore.heic', params: { nome } });
    } else {
      const max = formato.tipo === 'FOTO' ? cfg.MEDIA_MAX_PHOTO_MB : cfg.MEDIA_MAX_VIDEO_MB;
      if (file.size > max * MB)
        avvisi.push({ key: 'allegati.errore.dimensioneFile', params: { nome, mb: max } });
      else validi.push({ temp: file.path, nome, byte: file.size, tipo: formato.tipo });
    }
  }
  return { validi, avvisi };
}
