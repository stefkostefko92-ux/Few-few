import { Router, type Request, type Response } from 'express';
import { principalOf, requireCapability } from '../auth/guards.js';
import { scopeFor } from '../auth/scope.js';
import { nomeCsv, righeCsv } from '../http/csv.js';
import { pdfLimiter } from '../http/limits.js';
import { listPreventivi } from '../preventivi/elenco.js';
import { euro } from '../preventivi/importi.js';
import { isStato } from '../preventivi/service.js';
import { listSchede } from '../schede/list.js';
import { MAX_QUERY_LENGTH } from '../schede/search.js';
import { businessDay } from '../time.js';
import { aziendaFilterOf } from './schede-shared.js';

/**
 * Списъците като CSV за Excel (точка D2): същото, което човекът вижда в списъка — обхватът, филтърът по фирма и
 * търсенето — до `MAX_RIGHE` реда. Без бележките и без лични данни извън списъка. Таванът `pdfLimiter` (30/мин.):
 * файлът е тежка заявка. Пред `/schede/:id` в реда на рутерите.
 */
export const esportaCsvRouter: Router = Router();

const MAX_RIGHE = 10_000;
const BLOCCO = 5000;

/** Файлът CSV за сваляне (името — с деня); и за ценоразписа (preventivi-listino-import.ts). */
export function inviaCsv(res: Response, nome: string, csv: string): void {
  res
    .status(200)
    .set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${nomeCsv(nome, businessDay())}"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    })
    .send(csv);
}

const queryDi = (req: Request) =>
  typeof req.query.q === 'string' ? req.query.q.trim().slice(0, MAX_QUERY_LENGTH) : '';

esportaCsvRouter.get(
  '/schede/esporta.csv',
  requireCapability('schede:read'),
  pdfLimiter,
  async (req, res) => {
    const t = res.locals.t;
    const fmt = res.locals.fmt;
    const s = scopeFor(principalOf(req).user, 'schede:read');
    const azienda = aziendaFilterOf(req, s);
    const query = queryDi(req);
    const righe: Array<Array<string | number | null>> = [];
    for (let page = 1; righe.length < MAX_RIGHE; page += 1) {
      const blocco = await listSchede({
        scope: s,
        azienda,
        query,
        page: String(page),
        pageSize: BLOCCO,
      });
      for (const r of blocco.rows)
        righe.push([
          r.numeroImpianto,
          r.matricola,
          r.indirizzo,
          r.marca,
          r.tipoImpianto.map((v) => t(`scheda.option.tipoImpianto.${v}`)).join(', '),
          r.portataKg === null ? null : String(r.portataKg),
          r.capienzaPersone,
          r.fermate,
          fmt.day(r.data),
          r.azienda.name,
          fmt.dateTime(r.updatedAt),
        ]);
      if (page >= blocco.pages) break;
    }
    const c = (k: string) => t(`scheda.field.${k}`);
    inviaCsv(
      res,
      'schede',
      righeCsv(
        [
          c('numeroImpianto'),
          c('matricola'),
          c('indirizzo'),
          c('marca'),
          c('tipoImpianto'),
          c('portataKg'),
          c('capienzaPersone'),
          c('fermate'),
          c('data'),
          c('azienda'),
          t('csv.aggiornata'),
        ],
        righe.slice(0, MAX_RIGHE),
      ),
    );
  },
);

esportaCsvRouter.get(
  '/preventivi/esporta.csv',
  requireCapability('preventivi:read'),
  pdfLimiter,
  async (req, res) => {
    const t = res.locals.t;
    const fmt = res.locals.fmt;
    const s = scopeFor(principalOf(req).user, 'preventivi:read');
    const azienda = aziendaFilterOf(req, s);
    const stato = isStato(req.query.stato) ? req.query.stato : null;
    const query = queryDi(req);
    const righe: Array<Array<string | number | null>> = [];
    for (let page = 1; righe.length < MAX_RIGHE; page += 1) {
      const blocco = await listPreventivi({
        scope: s,
        azienda,
        stato,
        query,
        page: String(page),
        pageSize: BLOCCO,
      });
      for (const r of blocco.rows)
        righe.push([
          r.numero,
          fmt.day(r.data),
          r.cliente,
          r.oggetto,
          t(`preventivi.stato.${r.stato}`),
          euro(r.totale),
          r.azienda.name,
        ]);
      if (page >= blocco.pages) break;
    }
    const c = (k: string) => t(`preventivi.colonna.${k}`);
    inviaCsv(
      res,
      'preventivi',
      righeCsv(
        [
          c('numero'),
          c('data'),
          t('preventivi.campo.cliente'),
          t('preventivi.campo.oggetto'),
          c('stato'),
          t('csv.totaleEuro'),
          c('azienda'),
        ],
        righe.slice(0, MAX_RIGHE),
      ),
    );
  },
);
