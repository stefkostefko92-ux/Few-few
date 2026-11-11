import { Router } from 'express';
import type { RigaCalcolo } from '../argano/elenco.js';
import { MAX_LIBERI } from '../argano/elenco.js';
import { principalOf, requireCapability } from '../auth/guards.js';
import { canAnywhere, type Scope } from '../auth/scope.js';
import { listSchede } from '../schede/list.js';
import { highlight } from '../schede/search.js';
import { aziendaFilterOf, aziendeOf, queryOf, scope } from './schede-shared.js';

/**
 * Страницата на изчисленията в менюто — „Calcolo argano“ и „Calcolo limitatore“ (собственикът, 31
 * октомври 2026 — „cercare il numero di matricola o la via e precompilare il calcolo se ho già la scheda
 * impianto“; 5 ноември — същото за ограничителя): търсене на уредбата по матрикула, номер или улица —
 * картите (търсачката на „Schede“; изчислението им се попълва от картата) и изчисленията без карта; една
 * намерена карта и нищо друго — направо изчислението ѝ. Без търсене — записаните изчисления, най-новите
 * отгоре. Хидравличната уредба няма нито аргано, нито раздела „Limitatore“: показва се, без връзка.
 */

export interface DescrittoreCalcolo {
  /** Ключът в речника (`<ключ>.elenco.*`). */
  chiave: 'argano' | 'limitatore';
  /** Адресът на страницата в менюто (и `/nuovo`, `/:id` без карта). */
  base: string;
  /** Изчислението на картата: `/schede/:id/<scheda>`. */
  scheda: string;
  servizi: {
    elenco(options: {
      scope: Scope;
      azienda?: string | null;
      page?: unknown;
    }): Promise<{ rows: RigaCalcolo[]; total: number; page: number; pages: number }>;
    cerca(scope: Scope, query: string): Promise<{ rows: RigaCalcolo[]; total: number }>;
    delleSchede(schedaIds: string[]): Promise<Map<string, Date>>;
  };
}

const read = requireCapability('schede:read');

export function creaElencoRouter(calcolo: DescrittoreCalcolo): Router {
  const router: Router = Router();
  const titleKey = `${calcolo.chiave}.elenco.titolo`;
  const vista = { chiave: calcolo.chiave, base: calcolo.base, scheda: calcolo.scheda };

  router.get(calcolo.base, read, async (req, res) => {
    const readScope = scope(req, 'schede:read');
    const aziende = await aziendeOf(req, readScope);
    const puoNuovo = canAnywhere(principalOf(req).user, 'schede:write');
    const query = queryOf(req).trim();

    if (query) {
      const [schede, liberi] = await Promise.all([
        listSchede({ scope: readScope, query }),
        calcolo.servizi.cerca(readScope, query),
      ]);
      const righe = schede.rows.slice(0, MAX_LIBERI);
      const idraulico = (tipo: string[] | null) => (tipo ?? []).includes('IDRAULICO');
      const unica = righe[0];
      // Една карта (матрикула или номер, написани целите) и нито едно изчисление без карта — направо.
      if (schede.total === 1 && liberi.total === 0 && unica && !idraulico(unica.tipoImpianto))
        return res.redirect(303, `/schede/${encodeURIComponent(unica.id)}/${calcolo.scheda}`);
      const calcoli = await calcolo.servizi.delleSchede(righe.map((r) => r.id));
      return res.render('argano/elenco', {
        titleKey,
        calcolo: vista,
        aziende,
        puoNuovo,
        ricerca: {
          query,
          schede: righe.map((row) => ({
            ...row,
            segmenti: highlight(row.indirizzo, schede.tokens),
            idraulico: idraulico(row.tipoImpianto),
            calcolo: calcoli.get(row.id) ?? null,
          })),
          schedeTotale: schede.total,
          liberi: liberi.rows,
          liberiTotale: liberi.total,
        },
        page: null,
        aziendaFilter: null,
      });
    }

    const aziendaFilter = aziendaFilterOf(req, readScope);
    const page = await calcolo.servizi.elenco({
      scope: readScope,
      azienda: aziendaFilter,
      page: req.query.p,
    });
    res.render('argano/elenco', {
      titleKey,
      calcolo: vista,
      aziende,
      puoNuovo,
      ricerca: null,
      page,
      aziendaFilter,
    });
  });
  return router;
}
