import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { writeAudit } from '../audit.js';
import { principalOf, requireCapability, requireCsrf, requireSameOrigin } from '../auth/guards.js';
import { leggiCodice, verificaCodice, verificaFile, type Trovato } from '../master/verifica.js';

/**
 * „Verifica documento“ в конзолата на MASTER: някой показва лист (изчисление, копие на условията, лист за
 * интервенция, протокол) — истински ли е и непипнат ли е. По кода от листа (Rif. или отпечатъка) или по
 * самия PDF (SHA-256 на байтовете — същият файл до байт); всяко намерено — с проверката на печата му.
 * Файлът не се пази никъде; в одита — само начинът и колко са намерени (без кода и без хеша).
 */
export const masterVerificaRouter: Router = Router();
const manage = requireCapability('aziende:manage');

/** Таванът на качения PDF — колкото най-големия лист с изчисление и снимки, с резерв. */
export const VERIFICA_MAX_BYTES = 25 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: VERIFICA_MAX_BYTES, files: 1, fields: 4, fieldSize: 1024, parts: 6 },
}).single('file');

const troppoGrande = new WeakSet<Request>();

const formaRotta = new WeakSet<Request>();

/**
 * Файлът в паметта; грешка при качването е грешка на формата, не 500: твърде голям файл — 413, всичко
 * друго (повече части, прекъснато качване) — 400.
 */
function multipart(req: Request, res: Response, next: NextFunction): void {
  upload(req, res, (error: unknown) => {
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE')
      troppoGrande.add(req);
    else if (error) formaRotta.add(req);
    next();
  });
}

function mostra(
  res: Response,
  status: number,
  vista: { codice?: string; esito?: Trovato[]; hash?: string; errore?: string; per?: string },
): void {
  res
    .status(status)
    .set('Cache-Control', 'no-store')
    .render('master/verifica', {
      codice: '',
      esito: null,
      hash: null,
      errore: null,
      per: null,
      ...vista,
    });
}

masterVerificaRouter.get('/master/verifica', manage, (_req, res) => mostra(res, 200, {}));

// Origin — преди тялото (файлът се чете в паметта), токенът — след него (полето е в същата форма).
masterVerificaRouter.post(
  '/master/verifica',
  manage,
  requireSameOrigin,
  multipart,
  requireCsrf,
  async (req, res) => {
    const body = req.body as Record<string, unknown>;
    const actorId = principalOf(req).user.id;
    if (troppoGrande.has(req)) return mostra(res, 413, { errore: 'master.verifica.errore.file' });
    if (formaRotta.has(req)) return mostra(res, 400, { errore: 'master.verifica.errore.forma' });
    if (req.file && req.file.size > 0) {
      const { hash, trovati } = await verificaFile(req.file.buffer);
      await writeAudit({
        actorId,
        action: 'PROVA_VERIFICA',
        aziendaId: null,
        meta: { per: 'file', trovati: trovati.length },
      });
      return mostra(res, 200, { esito: trovati, hash, per: 'file' });
    }
    const scritto = typeof body.codice === 'string' ? body.codice.slice(0, 200) : '';
    const codice = leggiCodice(scritto);
    if (!codice)
      return mostra(res, 422, { codice: scritto, errore: 'master.verifica.errore.codice' });
    const trovati = await verificaCodice(codice);
    await writeAudit({
      actorId,
      action: 'PROVA_VERIFICA',
      aziendaId: null,
      meta: { per: codice.tipo, trovati: trovati.length },
    });
    mostra(res, 200, { codice: scritto, esito: trovati, per: codice.tipo });
  },
);
