import { Router, type NextFunction, type Request, type Response } from 'express';
import { percorsi } from '../allegati/archivio.js';
import {
  limiteCorpo,
  multipart,
  spazio,
  valutaCaricati,
  type Avviso,
} from '../allegati/caricamento.js';
import {
  aggiungiAllegati,
  allegatiDi,
  allegatoDi,
  didascaliaSchema,
  eliminaAllegato,
  isSezione,
  MAX_PER_SCHEDA,
  modificheDi,
  salvaDidascalie,
} from '../allegati/service.js';
import {
  isPartial,
  principalOf,
  requireCapability,
  requireCsrf,
  requireSameOrigin,
  sendError,
} from '../auth/guards.js';
import { canIn } from '../auth/scope.js';
import { setFlash } from '../http/flash.js';
import type { SectionKey } from '../schede/fields.js';
import { getScheda, type SchedaFull } from '../schede/service.js';
import { notFound, scope } from './schede-shared.js';

/**
 * Снимките и клиповете на картата, по раздели. Качването: само наш адрес и размер под тавана (преди
 * да се чете тялото), картата в обхвата за запис, достатъчно място на диска, тялото
 * (src/allegati/caricamento.ts), после
 * CSRF; видът се познава по байтовете, компресира ги фоновият процес. С JavaScript (`X-Partial: 1`)
 * отговорът е новата галерия на раздела (JSON), без — пренасочване обратно към картата или редакцията.
 * Файлът и миниатюрата — само за който вижда картата (изтритата — за кошчето на фирмата ѝ).
 */
export const allegatiRouter: Router = Router();

const read = requireCapability('schede:read');
const write = requireCapability('schede:write');
const schedeRichiesta = new WeakMap<Request, SchedaFull>();

/** Картата в обхвата за запис (не в кошчето) — преди тялото: чужда карта не пише нищо на диска. */
async function schedaScrivibile(req: Request, res: Response, next: NextFunction): Promise<void> {
  const scheda = await getScheda(scope(req, 'schede:write'), String(req.params.id));
  if (!scheda) return notFound(req, res);
  schedeRichiesta.set(req, scheda);
  next();
}

/** Картата за четене: и изтритата — за кошчето на фирмата ѝ (като страницата на картата). */
function schedaLeggibile(req: Request): Promise<SchedaFull | null> {
  return getScheda(scope(req, 'schede:read'), String(req.params.id), scope(req, 'schede:trash'));
}

/** Накъде се връща страницата без JavaScript: картата или редакцията ѝ — нищо друго. */
type Ritorno = 'modifica' | 'scheda';
const ritornoDa = (raw: unknown): Ritorno => (raw === 'modifica' ? 'modifica' : 'scheda');

function ritornoDi(schedaId: string, raw: unknown): string {
  return ritornoDa(raw) === 'modifica' ? `/schede/${schedaId}/modifica` : `/schede/${schedaId}`;
}

const bodyOf = (req: Request): Record<string, unknown> =>
  (req.body as Record<string, unknown> | undefined) ?? {};

/** Галерията на раздела като HTML — парчето, което JavaScript слага на мястото на старото. */
async function galleria(
  req: Request,
  res: Response,
  scheda: SchedaFull,
  sezione: SectionKey,
  ritorno: Ritorno,
): Promise<string> {
  const allegati = (await allegatiDi(scheda.id)).filter((a) => a.sezione === sezione);
  const modifica =
    !scheda.deletedAt && canIn(principalOf(req).user, 'schede:write', scheda.aziendaId);
  return new Promise((resolve, reject) => {
    res.render(
      'schede/_allegati-galleria',
      { scheda, sezione, allegati, modifica, ritorno },
      (error: Error | null, html: string) => (error ? reject(error) : resolve(html)),
    );
  });
}

async function rispondi(
  req: Request,
  res: Response,
  scheda: SchedaFull,
  sezione: SectionKey,
  esito: { avvisi?: Avviso[]; ok?: Avviso },
): Promise<void> {
  const avvisi = esito.avvisi ?? [];
  const ritorno = bodyOf(req).ritorno;
  if (isPartial(req)) {
    res.json({
      html: await galleria(req, res, scheda, sezione, ritornoDa(ritorno)),
      avvisi: avvisi.map((a) => res.locals.t(a.key, a.params)),
      ok: esito.ok ? res.locals.t(esito.ok.key, esito.ok.params) : null,
    });
    return;
  }
  const first = avvisi[0];
  if (first) setFlash(res, 'error', first.key, first.params);
  else if (esito.ok) setFlash(res, 'ok', esito.ok.key, esito.ok.params);
  res.redirect(303, `${ritornoDi(scheda.id, ritorno)}#a-${sezione}`);
}

allegatiRouter.post(
  '/schede/:id/allegati',
  write,
  requireSameOrigin,
  limiteCorpo,
  schedaScrivibile,
  spazio,
  multipart,
  requireCsrf,
  async (req, res) => {
    const scheda = schedeRichiesta.get(req)!;
    const body = bodyOf(req);
    if (!isSezione(body.sezione)) return sendError(req, res, 400, 'error.title', 'error.badInput');
    const sezione = body.sezione;
    const { validi, avvisi } = await valutaCaricati(req);
    const didascalia = didascaliaSchema.safeParse(
      typeof body.didascalia === 'string' ? body.didascalia : '',
    );
    let caricati = 0;
    if (validi.length > 0) {
      const esito = await aggiungiAllegati(
        scheda,
        sezione,
        didascalia.success ? didascalia.data : null,
        validi,
        principalOf(req).user.id,
      );
      if (esito.ok) caricati = esito.ids.length;
      else avvisi.push({ key: 'allegati.errore.limite', params: { max: MAX_PER_SCHEDA } });
    }
    await rispondi(req, res, scheda, sezione, {
      avvisi,
      ok: caricati > 0 ? { key: 'allegati.caricati', params: { n: caricati } } : undefined,
    });
  },
);

/** Галерията на раздела (за JavaScript: докато файловете се обработват). */
allegatiRouter.get('/schede/:id/allegati/sezione/:sezione', read, async (req, res) => {
  const scheda = await schedaLeggibile(req);
  const sezione = req.params.sezione;
  if (!scheda || !isSezione(sezione)) return notFound(req, res);
  res.type('html').send(await galleria(req, res, scheda, sezione, ritornoDa(req.query.ritorno)));
});

/** Компресираният файл (`?mini=1` — миниатюрата; `?scarica=1` — за сваляне), с Range за клиповете. */
allegatiRouter.get('/schede/:id/allegati/:aid', read, async (req, res) => {
  const scheda = await schedaLeggibile(req);
  const allegato = scheda ? await allegatoDi(scheda.id, String(req.params.aid)) : null;
  if (!scheda || !allegato || allegato.stato !== 'PRONTO') return notFound(req, res);
  const p = percorsi(allegato);
  const mini = req.query.mini === '1';
  const estensione = mini || allegato.tipo === 'FOTO' ? 'jpg' : 'mp4';
  const nome = `${allegato.nomeOriginale.replace(/\.[^.]{1,8}$/, '')}.${estensione}`;
  const ascii = nome.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  // RFC 5987: и знаците, които encodeURIComponent оставя (' ( ) *), са кодирани.
  const utf8 = encodeURIComponent(nome).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  const disposition = req.query.scarica === '1' ? 'attachment' : 'inline';
  res.sendFile(
    mini ? p.mini : p.file,
    {
      headers: {
        'Content-Disposition': `${disposition}; filename="${ascii}"; filename*=UTF-8''${utf8}`,
        'X-Content-Type-Options': 'nosniff',
        // Съдържанието под този адрес не се мени; достъпът се проверява при всяка заявка (304).
        'Cache-Control': 'private, no-cache',
      },
      // Пътят е само от id-тата; папката на тома може да е навсякъде.
      dotfiles: 'allow',
    },
    (error?: Error) => {
      if (error && !res.headersSent) notFound(req, res);
    },
  );
});

/** Картата и файлът ѝ за промяна — или null (404). */
async function perModifica(req: Request) {
  const scheda = await getScheda(scope(req, 'schede:write'), String(req.params.id));
  const allegato = scheda ? await allegatoDi(scheda.id, String(req.params.aid)) : null;
  return scheda && allegato && isSezione(allegato.sezione)
    ? { scheda, allegato, sezione: allegato.sezione }
    : null;
}

allegatiRouter.post(
  '/schede/:id/allegati/:aid/didascalia',
  write,
  requireCsrf,
  async (req, res) => {
    const found = await perModifica(req);
    if (!found) return notFound(req, res);
    const modifiche = modificheDi(bodyOf(req));
    if (!modifiche) return sendError(req, res, 400, 'error.title', 'error.badInput');
    await salvaDidascalie(found.scheda, modifiche, principalOf(req).user.id);
    // Без JavaScript Enter натиска първия бутон на страницата — връщането е при сменения надпис.
    const primo = [...modifiche.keys()][0];
    const cambiato = primo ? await allegatoDi(found.scheda.id, primo) : null;
    const sezione = cambiato && isSezione(cambiato.sezione) ? cambiato.sezione : found.sezione;
    await rispondi(req, res, found.scheda, sezione, {
      ok: { key: 'allegati.didascaliaSalvata' },
    });
  },
);

/** Потвърждението без JavaScript (изтритото не минава през кошчето). */
allegatiRouter.get('/schede/:id/allegati/:aid/elimina', write, async (req, res) => {
  const found = await perModifica(req);
  if (!found) return notFound(req, res);
  res.render('schede/allegato-elimina', {
    scheda: found.scheda,
    allegato: found.allegato,
    ritorno: ritornoDa(req.query.ritorno),
  });
});

allegatiRouter.post('/schede/:id/allegati/:aid/elimina', write, requireCsrf, async (req, res) => {
  const found = await perModifica(req);
  if (!found) return notFound(req, res);
  await eliminaAllegato(found.scheda, found.allegato.id, principalOf(req).user.id);
  await rispondi(req, res, found.scheda, found.sezione, { ok: { key: 'allegati.eliminato' } });
});
