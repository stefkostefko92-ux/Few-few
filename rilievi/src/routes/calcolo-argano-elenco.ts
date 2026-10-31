import { Router } from 'express';
import { calcoliDelleSchede, cercaLiberi, elencoCalcoli, MAX_LIBERI } from '../argano/elenco.js';
import { principalOf, requireCapability } from '../auth/guards.js';
import { canAnywhere } from '../auth/scope.js';
import { listSchede } from '../schede/list.js';
import { highlight } from '../schede/search.js';
import { aziendaFilterOf, aziendeOf, queryOf, scope } from './schede-shared.js';

/**
 * Страницата „Calcolo argano“ в менюто (собственикът, 31 октомври 2026 — „cercare il numero di matricola
 * o la via e precompilare il calcolo se ho già la scheda impianto“): търсене на уредбата по матрикула,
 * номер или улица — картите (търсачката на „Schede“; изчислението им се попълва от картата) и
 * изчисленията без карта; една намерена карта и нищо друго — направо изчислението ѝ. Без търсене —
 * записаните изчисления, най-новите отгоре. Хидравличната уредба няма аргано: показва се, без връзка.
 */
export const calcoloElencoRouter: Router = Router();

const read = requireCapability('schede:read');

calcoloElencoRouter.get('/calcolo-argano', read, async (req, res) => {
  const readScope = scope(req, 'schede:read');
  const aziende = await aziendeOf(req, readScope);
  const puoNuovo = canAnywhere(principalOf(req).user, 'schede:write');
  const query = queryOf(req).trim();

  if (query) {
    const [schede, liberi] = await Promise.all([
      listSchede({ scope: readScope, query }),
      cercaLiberi(readScope, query),
    ]);
    const righe = schede.rows.slice(0, MAX_LIBERI);
    const idraulico = (tipo: string[] | null) => (tipo ?? []).includes('IDRAULICO');
    const unica = righe[0];
    // Една карта (матрикула или номер, написани целите) и нито едно изчисление без карта — направо.
    if (schede.total === 1 && liberi.total === 0 && unica && !idraulico(unica.tipoImpianto))
      return res.redirect(303, `/schede/${encodeURIComponent(unica.id)}/calcolo-argano`);
    const calcoli = await calcoliDelleSchede(righe.map((r) => r.id));
    return res.render('argano/elenco', {
      titleKey: 'argano.elenco.titolo',
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
  const page = await elencoCalcoli({
    scope: readScope,
    azienda: aziendaFilter,
    page: req.query.page,
  });
  res.render('argano/elenco', {
    titleKey: 'argano.elenco.titolo',
    aziende,
    puoNuovo,
    ricerca: null,
    page,
    aziendaFilter,
  });
});
