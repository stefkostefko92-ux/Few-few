// Автоматизъм „Contratti" — ражда периодичните посещения и фактурите за canone.
//
// Това е модулът, който превръща договора от запис в приход: без него някой
// трябва да отваря всеки договор всеки месец и да въвежда ръчно ордина и
// фактурата. Двете дати `prossimaVisita` и `prossimaFattura` са водачът —
// местят се напред САМО след успешно раждане, така че спрян cron наваксва
// пропуснатите периоди вместо да ги прескочи (виж `periodiScaduti`).

import { prisma } from "@/lib/prisma";
import {
  prossimaScadenza,
  periodiScaduti,
  descrizionePeriodo,
  rinnovo,
  type Periodicita,
} from "@/lib/contratti-logic";
import { prossimoNumero } from "@/lib/numerazione";
import { ricalcolaFattura } from "@/lib/totali-db";
import { scriviAudit } from "@/lib/audit";
import { log, descriviErrore } from "@/lib/log";

export interface EsitoContratti {
  ordiniCreati: number;
  fattureCreate: number;
  contrattiRinnovati: number;
  contrattiScaduti: number;
}

/** Пуска автоматизма и записва следа (както при scadenze и retention). */
export async function elaboraContrattiTracciato(
  oggi = new Date(),
): Promise<EsitoContratti> {
  const run = await prisma.automatismoRun.create({
    data: { nome: "contratti" },
  });
  const inizio = Date.now();
  try {
    const esito = await elaboraContratti(oggi);
    await prisma.automatismoRun.update({
      where: { id: run.id },
      data: {
        terminatoAt: new Date(),
        esito: "OK",
        durataMs: Date.now() - inizio,
        dettagli: { ...esito },
      },
    });
    log.info("automatismo contratti", {
      esito: "OK",
      durata_ms: Date.now() - inizio,
      ...esito,
    });
    return esito;
  } catch (e) {
    const err = descriviErrore(e);
    await prisma.automatismoRun.update({
      where: { id: run.id },
      data: {
        terminatoAt: new Date(),
        esito: "ERRORE",
        durataMs: Date.now() - inizio,
        errore: `${err.err_tipo}:${err.err_codice}`,
      },
    });
    log.error("automatismo contratti fallito", { ...err, esito: "ERRORE" });
    throw e;
  }
}

export async function elaboraContratti(
  oggi = new Date(),
): Promise<EsitoContratti> {
  const esito: EsitoContratti = {
    ordiniCreati: 0,
    fattureCreate: 0,
    contrattiRinnovati: 0,
    contrattiScaduti: 0,
  };

  const attivi = await prisma.contratto.findMany({
    where: { stato: "ATTIVO" },
    include: {
      impianti: {
        include: { impianto: { select: { id: true, matricola: true } } },
      },
    },
  });

  for (const c of attivi) {
    // 1) Периодични посещения → по един ордин на импиант, на период.
    if (c.prossimaVisita) {
      const dovuti = periodiScaduti(
        c.prossimaVisita,
        oggi,
        c.periodicitaVisite as Periodicita,
      );
      let data = c.prossimaVisita;
      for (let i = 0; i < dovuti; i++) {
        for (const ci of c.impianti) {
          esito.ordiniCreati += await creaOrdineVisita(c, ci.impianto, data);
        }
        data = prossimaScadenza(data, c.periodicitaVisite as Periodicita);
      }
      if (dovuti > 0)
        await prisma.contratto.update({
          where: { id: c.id },
          data: { prossimaVisita: data },
        });
    }

    // 2) Canone → по една фактура на период.
    if (c.prossimaFattura) {
      const dovute = periodiScaduti(
        c.prossimaFattura,
        oggi,
        c.periodicitaFatturazione as Periodicita,
      );
      let data = c.prossimaFattura;
      for (let i = 0; i < dovute; i++) {
        esito.fattureCreate += await creaFatturaCanone(c, data);
        data = prossimaScadenza(data, c.periodicitaFatturazione as Periodicita);
      }
      if (dovute > 0)
        await prisma.contratto.update({
          where: { id: c.id },
          data: { prossimaFattura: data },
        });
    }

    // 3) Изтичане: подновяване или преминаване в SCADUTO.
    if (c.dataFine < oggi) {
      if (c.rinnovoAutomatico) {
        const r = rinnovo(c.dataInizio, c.dataFine);
        await prisma.contratto.update({ where: { id: c.id }, data: r });
        esito.contrattiRinnovati += 1;
        await scriviAudit({
          azione: "STATE_CHANGE",
          entita: "contratti",
          entitaId: c.id,
          dettagli: {
            valori: { rinnovo: { a: r.dataFine.toISOString().slice(0, 10) } },
          },
          tenantId: c.tenantId,
        });
      } else {
        await prisma.contratto.updateMany({
          where: { id: c.id, stato: "ATTIVO" },
          data: { stato: "SCADUTO" },
        });
        esito.contrattiScaduti += 1;
        await scriviAudit({
          azione: "STATE_CHANGE",
          entita: "contratti",
          entitaId: c.id,
          dettagli: { valori: { stato: { a: "SCADUTO" } } },
          tenantId: c.tenantId,
        });
      }
    }
  }

  return esito;
}

type ContrattoDb = Awaited<
  ReturnType<typeof prisma.contratto.findMany>
>[number];

/** Ордин за периодично посещение. Идемпотентно: един на импиант, на дата. */
async function creaOrdineVisita(
  c: ContrattoDb,
  impianto: { id: string; matricola: string },
  data: Date,
): Promise<number> {
  // Повторното пускане на автоматизма не бива да ражда дубликати — затова
  // проверката е по (договор, импиант, дата), не по брояч.
  const esistente = await prisma.ordineLavoro.findFirst({
    where: { contrattoId: c.id, impiantoId: impianto.id, dataInizio: data },
    select: { id: true },
  });
  if (esistente) return 0;

  const numero = await prossimoNumero("ordineLavoro", "ODL", c.tenantId);
  const creato = await prisma.ordineLavoro.create({
    data: {
      numero,
      stato: "EMESSO",
      priorita: "ORDINARIA",
      oggetto: `Manutenzione programmata — impianto ${impianto.matricola}`,
      descrizione: `Visita periodica prevista dal contratto ${c.numero}.`,
      dataInizio: data,
      impiantoId: impianto.id,
      contrattoId: c.id,
      tenantId: c.tenantId,
    },
    select: { id: true },
  });
  await scriviAudit({
    azione: "CREATE",
    entita: "ordini_lavoro",
    entitaId: creato.id,
    dettagli: { origine: "contratto" },
    tenantId: c.tenantId,
  });
  return 1;
}

/** Фактура за canone-то на един период. Идемпотентно по (договор, период). */
async function creaFatturaCanone(c: ContrattoDb, data: Date): Promise<number> {
  const esistente = await prisma.fattura.findFirst({
    where: { contrattoId: c.id, data },
    select: { id: true },
  });
  if (esistente) return 0;

  const periodo = descrizionePeriodo(
    data,
    c.periodicitaFatturazione as Periodicita,
  );
  const numero = await prossimoNumero("fattura", "FT", c.tenantId);

  // Заглавието и редът вървят в една транзакция с преизчислението: иначе
  // фактура може да остане с ред и нулев тотал.
  const creata = await prisma.$transaction(async (tx) => {
    const f = await tx.fattura.create({
      data: {
        numero,
        tipo: "EMESSA",
        stato: "BOZZA",
        data,
        oggetto: `Canone di manutenzione — ${periodo}`,
        amministratoreId: c.amministratoreId,
        contrattoId: c.id,
        tenantId: c.tenantId,
      },
      select: { id: true },
    });
    await tx.voceFattura.create({
      data: {
        fatturaId: f.id,
        descrizione: `Canone di manutenzione impianti — periodo ${periodo} (contratto ${c.numero})`,
        quantita: 1,
        prezzoUnitario: c.canone,
        aliquotaIva: c.aliquotaIva,
        ordine: 0,
      },
    });
    await ricalcolaFattura(f.id, tx);
    return f;
  });

  await scriviAudit({
    azione: "CREATE",
    entita: "fatture",
    entitaId: creata.id,
    dettagli: { origine: "contratto" },
    tenantId: c.tenantId,
  });
  return 1;
}
