import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { fail, route } from '@/lib/api';
import { audit } from '@/lib/audit';
import { UOM_LABELS } from '@/lib/labels';
import {
  DEFINIZIONI,
  intestazioniCsv,
  interoDaParametro,
  nomeFileReport,
  REPORT_CON_COSTI,
  REPORT_ESPORTABILI,
  risolviPeriodo,
  schemaFiltroPeriodo,
  toCsv,
  type ColonnaCsv,
  type Periodo,
  type ReportEsportabile,
} from '@/lib/report';
import { type LivelloServizio } from '@/lib/forecast';
import {
  datiAcquisti,
  datiFornitori,
  datiMovimenti,
  datiPrevisioni,
  datiScorte,
  datiValorizzazione,
  datiVendite,
} from '@/app/(app)/report/_dati';

/**
 * Esportazione dei report: `GET /api/report/<nome>/export?formato=csv`.
 *
 * Il file è CSV in formato italiano (separatore `;`, virgola decimale, BOM
 * UTF-8): Excel italiano lo apre con un doppio clic, senza procedura guidata e
 * senza accenti rotti. Il PDF non passa da qui — si ottiene dalla stampa del
 * browser sulla schermata del report, che è già impaginata (`@media print`).
 *
 * Sicurezza: stesso permesso della schermata (`report:leggi`, più `costi:leggi`
 * per i report che espongono i costi), niente dati personali oltre alla ragione
 * sociale, celle neutralizzate contro l'iniezione di formule e `Cache-Control:
 * no-store` — un estratto del magazzino non deve restare in cache condivisa.
 */

const schemaParametri = schemaFiltroPeriodo.extend({
  formato: z
    .union([z.literal(''), z.enum(['csv'])])
    .optional()
    .transform((v) => v || 'csv'),
});

/** Periodo predefinito per report la cui fotografia è «oggi», non un intervallo. */
const PREDEFINITI = {
  valorizzazione: 'tutto',
  movimenti: '30g',
  vendite: '30g',
  acquisti: '30g',
  fornitori: 'anno',
  scorte: 'tutto',
  previsioni: 'tutto',
} as const;

/** Livelli di servizio ammessi, identici a quelli della schermata. */
const LIVELLI_SERVIZIO: LivelloServizio[] = [90, 95, 97.5, 99];

function nomeValido(nome: string): nome is ReportEsportabile {
  return (REPORT_ESPORTABILI as readonly string[]).includes(nome);
}

export const GET = route(
  async (request: Request, contesto: { params: Promise<{ nome: string }> }) => {
    const utente = await requirePermission('report:leggi');
    const { nome } = await contesto.params;

    if (!nomeValido(nome)) {
      return fail(404, 'Report non disponibile per l’esportazione.', 'non_trovato');
    }
    if (REPORT_CON_COSTI.includes(nome) && !can(utente.role, 'costi:leggi')) {
      return fail(
        403,
        'Questo report contiene i costi d’acquisto: permesso negato.',
        'vietato',
      );
    }

    const url = new URL(request.url);
    const parametri = schemaParametri.parse({
      periodo: url.searchParams.get('periodo') ?? undefined,
      da: url.searchParams.get('da') ?? undefined,
      a: url.searchParams.get('a') ?? undefined,
      formato: url.searchParams.get('formato') ?? undefined,
    });

    const periodo = risolviPeriodo(parametri, PREDEFINITI[nome]);
    const giorni = interoDaParametro(url.searchParams.get('giorni') ?? undefined, {
      predefinito: 90,
      min: 7,
      max: 730,
    });

    // Gli stessi parametri della schermata: il file deve dire esattamente ciò
    // che l'operatore ha visto prima di premere «Esporta».
    const servizio = Number(url.searchParams.get('servizio'));
    const livelloServizio: LivelloServizio = LIVELLI_SERVIZIO.includes(
      servizio as LivelloServizio,
    )
      ? (servizio as LivelloServizio)
      : 95;

    const csv = await componiCsv(nome, periodo, {
      giorni,
      livelloServizio,
      vedeCosti: can(utente.role, 'costi:leggi'),
    });

    await audit({
      userId: utente.id,
      action: 'EXPORT',
      entity: 'Report',
      entityId: nome,
      summary: `Esportazione CSV del report ${DEFINIZIONI[nome].nome} (${periodo.etichetta})`,
    });

    return new NextResponse(csv, {
      status: 200,
      headers: intestazioniCsv(nomeFileReport(nome, periodo)),
    });
  },
);

// ─────────────────────────── Colonne per report ───────────────────────────

type OpzioniCsvReport = {
  giorni: number;
  livelloServizio: LivelloServizio;
  vedeCosti: boolean;
};

async function componiCsv(
  nome: ReportEsportabile,
  periodo: Periodo,
  { giorni, livelloServizio, vedeCosti }: OpzioniCsvReport,
): Promise<string> {
  switch (nome) {
    case 'valorizzazione': {
      const dati = await datiValorizzazione(periodo);
      const colonne: ColonnaCsv<(typeof dati.righe)[number]>[] = [
        { intestazione: 'SKU', valore: (r) => r.sku },
        { intestazione: 'Prodotto', valore: (r) => r.nome },
        { intestazione: 'Categoria', valore: (r) => r.categoria },
        { intestazione: 'Unità', valore: (r) => UOM_LABELS[r.uom] },
        { intestazione: 'Giacenza', tipo: 'intero', valore: (r) => r.giacenza },
        { intestazione: 'Impegnata', tipo: 'intero', valore: (r) => r.impegnata },
        { intestazione: 'Costo unitario (EUR)', tipo: 'euro', valore: (r) => r.costoUnitarioCents },
        { intestazione: 'Fonte del costo', valore: (r) => r.fonteCosto },
        { intestazione: 'Valore (EUR)', tipo: 'euro', valore: (r) => r.valoreCents },
      ];
      return toCsv(dati.righe, colonne);
    }

    case 'movimenti': {
      const dati = await datiMovimenti(periodo);
      const colonne: ColonnaCsv<(typeof dati.righe)[number]>[] = [
        { intestazione: 'SKU', valore: (r) => r.sku },
        { intestazione: 'Prodotto', valore: (r) => r.nome },
        { intestazione: 'Entrate', tipo: 'intero', valore: (r) => r.entrate },
        { intestazione: 'Uscite', tipo: 'intero', valore: (r) => r.uscite },
        { intestazione: 'Saldo', tipo: 'intero', valore: (r) => r.saldo },
        { intestazione: 'Movimenti', tipo: 'intero', valore: (r) => r.numeroMovimenti },
        { intestazione: 'Giacenza attuale', tipo: 'intero', valore: (r) => r.giacenza },
        { intestazione: 'Indice di rotazione', tipo: 'numero', valore: (r) => r.rotazione },
      ];
      return toCsv(dati.righe, colonne);
    }

    case 'vendite': {
      const dati = await datiVendite(periodo, { conCosti: false });
      const colonne: ColonnaCsv<(typeof dati.perProdotto)[number]>[] = [
        { intestazione: 'SKU', valore: (r) => r.sku },
        { intestazione: 'Prodotto', valore: (r) => r.nome },
        { intestazione: 'Righe ordine', tipo: 'intero', valore: (r) => r.ordini },
        { intestazione: 'Pezzi venduti', tipo: 'intero', valore: (r) => r.pezzi },
        { intestazione: 'Fatturato (EUR)', tipo: 'euro', valore: (r) => r.fatturatoCents },
      ];
      return toCsv(dati.perProdotto, colonne);
    }

    case 'acquisti': {
      const dati = await datiAcquisti(periodo);
      const colonne: ColonnaCsv<(typeof dati.perFornitore)[number]>[] = [
        { intestazione: 'Fornitore', valore: (r) => r.nome },
        { intestazione: 'Ordini', tipo: 'intero', valore: (r) => r.ordini },
        { intestazione: 'Pezzi', tipo: 'intero', valore: (r) => r.pezzi },
        { intestazione: 'Trasporto (EUR)', tipo: 'euro', valore: (r) => r.trasportoCents },
        { intestazione: 'Spesa (EUR)', tipo: 'euro', valore: (r) => r.spesaCents },
      ];
      return toCsv(dati.perFornitore, colonne);
    }

    case 'fornitori': {
      const righe = await datiFornitori(periodo);
      const colonne: ColonnaCsv<(typeof righe)[number]>[] = [
        { intestazione: 'Fornitore', valore: (r) => r.nome },
        { intestazione: 'Ordini ricevuti', tipo: 'intero', valore: (r) => r.ordiniRicevuti },
        { intestazione: 'Lead time reale (gg)', tipo: 'numero', decimali: 1, valore: (r) => r.leadTimeMedio },
        { intestazione: 'Lead time dichiarato (gg)', tipo: 'intero', valore: (r) => r.leadTimeDichiarato },
        { intestazione: 'Scostamento (gg)', tipo: 'numero', decimali: 1, valore: (r) => r.scostamentoLeadTime },
        { intestazione: 'Ordini completi', tipo: 'intero', valore: (r) => r.ordiniCompleti },
        { intestazione: 'Quota completi (%)', tipo: 'percentuale', valore: (r) => r.quotaCompleti },
        { intestazione: 'Ordini in ritardo', tipo: 'intero', valore: (r) => r.ordiniInRitardo },
        { intestazione: 'Quota puntuali (%)', tipo: 'percentuale', valore: (r) => r.quotaPuntuali },
        { intestazione: 'Ritardo medio (gg)', tipo: 'numero', decimali: 1, valore: (r) => r.ritardoMedio },
      ];
      return toCsv(righe, colonne);
    }

    case 'scorte': {
      const dati = await datiScorte(giorni);
      const colonne: ColonnaCsv<(typeof dati.righe)[number]>[] = [
        { intestazione: 'SKU', valore: (r) => r.sku },
        { intestazione: 'Prodotto', valore: (r) => r.nome },
        { intestazione: 'Categoria', valore: (r) => r.categoria },
        { intestazione: 'Stato', valore: (r) => r.stato },
        { intestazione: 'Giacenza', tipo: 'intero', valore: (r) => r.giacenza },
        { intestazione: 'Disponibile', tipo: 'intero', valore: (r) => r.disponibile },
        { intestazione: 'Scorta minima', tipo: 'intero', valore: (r) => r.minStock },
        { intestazione: 'Scorta massima', tipo: 'intero', valore: (r) => r.maxStock },
        { intestazione: 'Ultima uscita', tipo: 'data', valore: (r) => r.ultimaUscita },
        { intestazione: 'Giorni da ultima uscita', tipo: 'intero', valore: (r) => r.giorniDaUltimaUscita },
        // I costi restano fuori dal file per chi non ha il permesso: il file
        // non deve dire più di quanto dice la schermata.
        ...(vedeCosti
          ? [
              {
                intestazione: 'Valore (EUR)',
                tipo: 'euro' as const,
                valore: (r: (typeof dati.righe)[number]) => r.valoreCents,
              },
            ]
          : []),
      ];
      return toCsv(dati.righe, colonne);
    }

    case 'previsioni': {
      const dati = await datiPrevisioni({ giorni, livelloServizio });
      const colonne: ColonnaCsv<(typeof dati.righe)[number]>[] = [
        { intestazione: 'SKU', valore: (r) => r.sku },
        { intestazione: 'Prodotto', valore: (r) => r.nome },
        { intestazione: 'Disponibile', tipo: 'intero', valore: (r) => r.disponibile },
        { intestazione: 'In arrivo', tipo: 'intero', valore: (r) => r.inArrivo },
        {
          intestazione: 'Consumo giornaliero',
          tipo: 'numero',
          valore: (r) => (r.stato === 'ok' ? r.consumoGiornaliero : null),
        },
        { intestazione: 'Tendenza giornaliera', tipo: 'numero', valore: (r) => r.tendenzaGiornaliera },
        { intestazione: 'Copertura (gg)', tipo: 'numero', decimali: 1, valore: (r) => r.copertura },
        { intestazione: 'Lead time (gg)', tipo: 'intero', valore: (r) => r.leadTimeGiorni },
        { intestazione: 'Punto di riordino', tipo: 'intero', valore: (r) => r.puntoDiRiordino },
        { intestazione: 'Scorta di sicurezza', tipo: 'intero', valore: (r) => r.scortaSicurezza },
        { intestazione: 'Quantità suggerita', tipo: 'intero', valore: (r) => r.quantitaSuggerita },
        { intestazione: 'Metodo', valore: (r) => r.metodo },
        { intestazione: 'Confidenza', valore: (r) => r.confidenza },
        { intestazione: 'Nota', valore: (r) => r.motivo },
      ];
      return toCsv(dati.righe, colonne);
    }
  }
}
