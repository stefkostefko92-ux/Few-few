// Автоматизъм „Controllo scadenze" (на 24 часа): прагове 90/60/30 за impianti,
// цветен статус на automezzi, изтичане на preventivi и fatture.
// Вика се от /api/scadenze/check и от scripts/check-scadenze.ts (cron).

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { sogliePendenti, statoAutomezzo } from "@/lib/scadenze-logic";
import { log, descriviErrore } from "@/lib/log";
import { basePubblica } from "@/lib/qr";
import {
  accoda,
  impostazioniAvvisi,
  type ImpostazioniAvvisi,
} from "@/lib/notifiche/coda";
import {
  modelloScadenzaImpianto,
  modelloScadenzaAutomezzo,
  modelloFatturaScaduta,
  modelloPreventivoScaduto,
  type Modello,
} from "@/lib/notifiche/modelli";

export interface EsitoControllo {
  notificheScadenze: number;
  automezziAggiornati: number;
  preventiviScaduti: number;
  fattureScadute: number;
  /** Колко реда са влезли в опашката за поща. Самото пращане е друг процес. */
  avvisiAccodati: number;
}

/**
 * Пуска автоматизма и ЗАПИСВА следа от пускането.
 *
 * Без записа спрян cron или рестартирала машина остава невидим: срокът минава,
 * никой не разбира. Следата е и източникът за dead-man проверката
 * (`/api/healthz/automatismi`).
 */
export async function controllaScadenzeTracciato(
  oggi = new Date(),
): Promise<EsitoControllo> {
  const run = await prisma.automatismoRun.create({
    data: { nome: "scadenze" },
  });
  const inizio = Date.now();
  try {
    const esito = await controllaScadenze(oggi);
    await prisma.automatismoRun.update({
      where: { id: run.id },
      data: {
        terminatoAt: new Date(),
        esito: "OK",
        durataMs: Date.now() - inizio,
        dettagli: { ...esito },
      },
    });
    log.info("automatismo scadenze", {
      esito: "OK",
      durata_ms: Date.now() - inizio,
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
    log.error("automatismo scadenze fallito", { ...err, esito: "ERRORE" });
    throw e;
  }
}

export async function controllaScadenze(
  oggi = new Date(),
): Promise<EsitoControllo> {
  let notificheScadenze = 0;

  // Известията се СЪБИРАТ по фирма и се записват накрая, наведнъж.
  //
  // Защо не ред по ред: настройките („включено ли е, кой получава") са една
  // заявка на фирма, а автоматизмът минава през стотици записа. Кешът и
  // групирането свеждат това до един въпрос на фирма за целия пуск.
  const perTenant = new Map<string, { tenantId: string | null; modelli: Modello[] }>();
  const app = basePubblica();
  function aggiungi(tenantId: string | null, m: Modello) {
    const k = tenantId ?? "-";
    const gia = perTenant.get(k) ?? { tenantId, modelli: [] };
    gia.modelli.push(m);
    perTenant.set(k, gia);
  }

  // 1) Законови срокове на импиантите — флаговете се вдигат еднократно
  const scadenze = await prisma.scadenzaImpianto.findMany({
    where: { completata: false },
    include: { impianto: { select: { matricola: true } } },
  });
  for (const s of scadenze) {
    const soglie = sogliePendenti(s, oggi);
    if (soglie.length === 0) continue;
    await prisma.scadenzaImpianto.update({
      where: { id: s.id },
      data: {
        notificato90: s.notificato90 || soglie.includes(90),
        notificato60: s.notificato60 || soglie.includes(60),
        notificato30: s.notificato30 || soglie.includes(30),
      },
    });
    notificheScadenze += soglie.length;
    // Един праг = едно известие. При първи пуск върху стара база могат да
    // паднат и трите наведнъж — това е вярно: срокът наистина е на 30 дни.
    for (const soglia of soglie)
      aggiungi(
        s.tenantId,
        modelloScadenzaImpianto({
          scadenzaId: s.id,
          matricola: s.impianto.matricola,
          tipo: s.tipo,
          scadenza: s.dataScadenza,
          soglia,
          impiantoId: s.impiantoId,
          appUrl: app,
        }),
      );
  }

  // 2) Цветен статус на автопарка
  let automezziAggiornati = 0;
  const automezzi = await prisma.automezzo.findMany({
    where: { attivo: true },
  });
  for (const a of automezzi) {
    const date = [
      a.scadenzaRevisione,
      a.scadenzaAssicurazione,
      a.scadenzaTagliando,
    ].filter((d): d is Date => d !== null);
    const stato = statoAutomezzo(
      [a.scadenzaRevisione, a.scadenzaAssicurazione, a.scadenzaTagliando],
      oggi,
    );
    if (stato !== a.stato) {
      await prisma.automezzo.update({ where: { id: a.id }, data: { stato } });
      automezziAggiornati++;
      // Известие САМО при влизане в червено. „Giallo" е планиране и се вижда
      // на таблото; писмо на всяка смяна на цвета учи човека да ги трие.
      if (stato === "rosso" && date.length)
        aggiungi(
          a.tenantId,
          modelloScadenzaAutomezzo({
            automezzoId: a.id,
            targa: a.targa,
            stato,
            scadenza: new Date(Math.min(...date.map((d) => d.getTime()))),
            appUrl: app,
          }),
        );
    }
  }

  // 3) Preventivi: изпратени и извън validitaGiorni → SCADUTO
  const inviati = await prisma.preventivo.findMany({
    where: { stato: "INVIATO" },
  });
  let preventiviScaduti = 0;
  for (const p of inviati) {
    const limite = new Date(
      p.createdAt.getTime() + p.validitaGiorni * 86_400_000,
    );
    if (limite < oggi) {
      await prisma.preventivo.update({
        where: { id: p.id },
        data: { stato: "SCADUTO" },
      });
      preventiviScaduti++;
      aggiungi(
        p.tenantId,
        modelloPreventivoScaduto({
          preventivoId: p.id,
          numero: p.numero,
          appUrl: app,
        }),
      );
    }
  }

  // 4) Fatture: просрочен падеж → SCADUTA
  //
  // Прочитаме ги ПРЕДИ смяната на статуса, защото след `updateMany` условието
  // вече не пасва и няма от какво да се съставят известията. Пакетната смяна
  // остава пакетна — един ред по ред обхожда цялата таблица.
  const daScadere: Prisma.FatturaWhereInput = {
    stato: { in: ["EMESSA", "INVIATA"] },
    dataScadenza: { lt: oggi },
  };
  const scadute = await prisma.fattura.findMany({
    where: daScadere,
    select: {
      id: true,
      numero: true,
      dataScadenza: true,
      tenantId: true,
    },
  });
  const { count: fattureScadute } = await prisma.fattura.updateMany({
    where: daScadere,
    data: { stato: "SCADUTA" },
  });
  for (const f of scadute)
    if (f.dataScadenza)
      aggiungi(
        f.tenantId,
        modelloFatturaScaduta({
          fatturaId: f.id,
          numero: f.numero,
          scadenza: f.dataScadenza,
          appUrl: app,
        }),
      );

  // 5) Опашката. Изпращането е ДРУГ процес (`npm run notifiche`): паднало
  // пощенско реле не бива да проваля вдигането на самите срокове.
  let avvisiAccodati = 0;
  const cache = new Map<string, ImpostazioniAvvisi>();
  for (const { tenantId, modelli } of perTenant.values()) {
    const imp = await impostazioniAvvisi(tenantId, cache);
    avvisiAccodati += await accoda(modelli, tenantId, imp);
  }

  return {
    notificheScadenze,
    automezziAggiornati,
    preventiviScaduti,
    fattureScadute,
    avvisiAccodati,
  };
}
