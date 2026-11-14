import { Router } from 'express';
import { principalOf, requireCapability, requireCsrf } from '../auth/guards.js';
import { righeCsv } from '../http/csv.js';
import { setFlash } from '../http/flash.js';
import { pdfLimiter } from '../http/limits.js';
import { MAX } from '../preventivi/form.js';
import { isAliquota } from '../preventivi/importi.js';
import { MAX_VOCI, tuttoIlListino } from '../preventivi/listino.js';
import {
  improntaImport,
  INTESTAZIONE_LISTINO,
  leggiImport,
  MAX_TESTO_IMPORT,
  rigaCsvDi,
} from '../preventivi/listino-import.js';
import { importaListino, pianoImport } from '../preventivi/listino-import-salva.js';
import { inviaCsv } from './esporta-csv.js';
import {
  aziendaScelta,
  ERRORI_MOSTRATI,
  mostraListino,
  provenienzaDi,
  puoScrivere,
  RIGHE_ANTEPRIMA,
  tornaA,
  type VistaImport,
} from './listino-vista.js';
import { notFound } from './schede-shared.js';

/**
 * Ценоразписът наведнъж (собственикът, 13 ноември 2026): `POST /preventivi/listino/importa` — редовете,
 * поставени от Excel или от CSV. Без `conferma` само се показва какво ще стане (нови и обновени редове) и
 * нищо не се пише; с `conferma=1` И с отпечатъка на прегледаното (`impronta`) се записват всички редове или
 * нито един — сменен след прегледа текст дава нов преглед, не запис. Грешен ред спира всичко и се
 * назовава с номера си. `GET /preventivi/listino.csv` — целият ценоразпис за Excel, със заглавния ред, който
 * внасянето чете обратно. Пред `/preventivi/listino/:id` в реда на рутерите.
 */
export const preventiviListinoImportRouter: Router = Router();

preventiviListinoImportRouter.get(
  '/preventivi/listino.csv',
  requireCapability('preventivi:read'),
  pdfLimiter,
  async (req, res) => {
    const aziendaId = typeof req.query.azienda === 'string' ? req.query.azienda : '';
    const { azienda } = await aziendaScelta(req, aziendaId);
    if (!azienda || azienda.id !== aziendaId) return notFound(req, res);
    const voci = await tuttoIlListino(aziendaId);
    inviaCsv(res, 'listino', righeCsv(INTESTAZIONE_LISTINO, voci.map(rigaCsvDi)));
  },
);

preventiviListinoImportRouter.post(
  '/preventivi/listino/importa',
  requireCapability('preventivi:write'),
  requireCsrf,
  async (req, res) => {
    const body = req.body as Record<string, unknown>;
    const aziendaId = typeof body.azienda === 'string' ? body.azienda : '';
    const { azienda } = await aziendaScelta(req, aziendaId);
    if (!azienda || azienda.id !== aziendaId || !puoScrivere(req, aziendaId))
      return notFound(req, res);
    const da = await provenienzaDi(req, body.da, aziendaId);
    const testo = typeof body.testo === 'string' ? body.testo : '';
    const unita = (typeof body.unita === 'string' ? body.unita : '').trim().slice(0, MAX.unita);
    const iva = isAliquota(Number(body.iva)) ? (Number(body.iva) as 22 | 10 | 4) : 22;
    const vista = (resto: Partial<VistaImport>): VistaImport => ({
      // Над тавана текстът не се връща в страницата — стига му съобщението.
      testo: testo.length > MAX_TESTO_IMPORT ? '' : testo,
      unita,
      iva: String(iva),
      errore: null,
      dettaglio: null,
      errori: [],
      altri: 0,
      anteprima: null,
      impronta: '',
      cambiato: false,
      ...resto,
    });
    const letto = leggiImport(testo, { unita, iva });
    if (letto.errore !== null || letto.errori.length > 0)
      return mostraListino(req, res, 422, {
        aziendaId,
        da,
        importa: vista({
          errore: letto.errore,
          dettaglio: letto.dettaglio,
          errori: letto.errori.slice(0, ERRORI_MOSTRATI),
          altri: Math.max(0, letto.errori.length - ERRORI_MOSTRATI),
        }),
      });
    const piano = await pianoImport(aziendaId, letto.righe);
    const pieno = (dopo: number) =>
      mostraListino(req, res, 422, { aziendaId, da, importa: vista({ errore: 'pieno', dopo }) });
    if (piano.dopo > MAX_VOCI) return pieno(piano.dopo);
    // Записва се само прегледаното: без потвърждение, или с отпечатък на друг текст — (нов) преглед.
    const impronta = improntaImport(testo, unita, iva);
    const confermato = body.conferma === '1';
    if (!confermato || body.impronta !== impronta)
      return mostraListino(req, res, 200, {
        aziendaId,
        da,
        importa: vista({
          impronta,
          cambiato: confermato,
          anteprima: {
            piano,
            righe: letto.righe.slice(0, RIGHE_ANTEPRIMA),
            totale: letto.righe.length,
          },
        }),
      });
    const esito = await importaListino(principalOf(req).user.id, aziendaId, letto.righe);
    if (esito.esito === 'missing') return notFound(req, res);
    // Друг е добавил редове между прегледа и записа.
    if (esito.esito === 'pieno') return pieno(piano.dopo);
    setFlash(res, 'ok', 'preventivi.listino.flash.importate', {
      nuove: esito.nuove,
      aggiornate: esito.aggiornate,
    });
    res.redirect(303, tornaA(da, aziendaId));
  },
);
