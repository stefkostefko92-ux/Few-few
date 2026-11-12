import { Router, type NextFunction, type Request, type Response } from 'express';
import { aziendaDellaChiave } from '../api/chiavi.js';
import { apiLimiter } from '../http/limits.js';
import { prisma } from '../db.js';
import { FIELDS } from '../schede/fields.js';
import { listSchede } from '../schede/list.js';
import { MAX_QUERY_LENGTH } from '../schede/search.js';

/**
 * API само за четене (точка D2): `Authorization: Bearer rk_…` — ключ на една фирма (src/api/chiavi.ts). Картите
 * на фирмата (без кошчето): списък с търсенето на портала и една карта с полетата ѝ (от fields.ts — само полетата
 * на заданието, без снимки, подписи и модули). Без бисквитки, без CORS (сървър към сървър), JSON, `no-store`;
 * 600 заявки в час на ключ. Грешен, отменен или изтекъл ключ — 401 с `WWW-Authenticate`.
 */
export const apiRouter: Router = Router();

/** Фирмата на ключа — сложена от `conChiave`, четена само тук. */
const aziendaDi = (res: Response): string => {
  const id: unknown = res.locals.apiAzienda;
  if (typeof id !== 'string') throw new Error('api: без фирма');
  return id;
};

async function conChiave(req: Request, res: Response, next: NextFunction): Promise<void> {
  res.set('Cache-Control', 'no-store');
  const chiave = await aziendaDellaChiave(req.get('authorization'));
  if (!chiave) {
    res.status(401).set('WWW-Authenticate', 'Bearer').json({ errore: 'non_autorizzato' });
    return;
  }
  res.locals.apiAzienda = chiave.aziendaId;
  next();
}

const scopeDi = (res: Response) => ({ all: false, aziendaIds: [aziendaDi(res)] });
const giorno = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/** Стойност на поле като JSON: Decimal — текст (без загуба), ден — `YYYY-MM-DD`, другото — каквото е. */
function valore(v: unknown): unknown {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object' && v !== null && 'toFixed' in v) return String(v);
  return v;
}

apiRouter.use('/api/v1', apiLimiter, conChiave);

apiRouter.get('/api/v1/schede', async (req, res) => {
  const query =
    typeof req.query.q === 'string' ? req.query.q.trim().slice(0, MAX_QUERY_LENGTH) : '';
  const page = await listSchede({ scope: scopeDi(res), query, page: req.query.p, pageSize: 100 });
  res.json({
    totale: page.total,
    pagina: page.page,
    pagine: page.pages,
    schede: page.rows.map((r) => ({
      id: r.id,
      numeroImpianto: r.numeroImpianto,
      matricola: r.matricola,
      indirizzo: r.indirizzo,
      marca: r.marca,
      tipoImpianto: r.tipoImpianto,
      portataKg: r.portataKg === null ? null : String(r.portataKg),
      capienzaPersone: r.capienzaPersone,
      fermate: r.fermate,
      data: giorno(r.data),
      aggiornataIl: r.updatedAt.toISOString(),
    })),
  });
});

apiRouter.get('/api/v1/schede/:id', async (req, res) => {
  const id = String(req.params.id);
  const row = /^[a-z0-9]{20,40}$/.test(id)
    ? await prisma.scheda.findFirst({
        where: { id, aziendaId: aziendaDi(res), deletedAt: null },
      })
    : null;
  if (!row) {
    res.status(404).json({ errore: 'non_trovata' });
    return;
  }
  const campi: Record<string, unknown> = {};
  const record = row as unknown as Record<string, unknown>;
  for (const f of FIELDS) if (f.key in record) campi[f.key] = valore(record[f.key]);
  res.json({
    id: row.id,
    data: giorno(row.data),
    creataIl: row.createdAt.toISOString(),
    aggiornataIl: row.updatedAt.toISOString(),
    campi,
  });
});

apiRouter.use('/api/v1', (_req, res) => {
  res.status(404).json({ errore: 'non_trovato' });
});
