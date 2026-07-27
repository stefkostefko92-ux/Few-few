// Автоматизъм „Retention" — прилага политиката от `retention-logic.ts`.
// Вика се от scripts/retention.ts (cron, седмично) и от POST /api/retention/esegui.
//
// Одитът е неизменим ПО СЪДЪРЖАНИЕ (никой не може да промени ред, без подписът
// да го издаде — виж ADR 0002), но не е вечен: GDPR чл. 5(1)(д) не позволява
// лични данни да се пазят без основание. Прочистването по срок е ЕДИНСТВЕНИЯТ
// начин, по който редове напускат регистъра — и то само през този автоматизъм,
// на партиди, със следа от самото прочистване.

import { prisma } from "@/lib/prisma";
import {
  soglie,
  AZIONI_ACCESSO,
  ENTITA_CONTABILI,
} from "@/lib/retention-logic";
import { log, descriviErrore } from "@/lib/log";

/** Максимален брой редове, изтривани в една партида (пази дългите заключвания). */
const PARTIDA = 5_000;

export interface EsitoRetention {
  auditAccesso: number;
  auditContabile: number;
  auditOrdinario: number;
  telemetria: number;
  notifiche: number;
}

/** Пуска прочистването и записва следа от пускането (както при scadenze). */
export async function applicaRetentionTracciato(
  oggi = new Date(),
): Promise<EsitoRetention> {
  const run = await prisma.automatismoRun.create({
    data: { nome: "retention" },
  });
  const inizio = Date.now();
  try {
    const esito = await applicaRetention(oggi);
    await prisma.automatismoRun.update({
      where: { id: run.id },
      data: {
        terminatoAt: new Date(),
        esito: "OK",
        durataMs: Date.now() - inizio,
        dettagli: { ...esito },
      },
    });
    log.info("automatismo retention", {
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
    log.error("automatismo retention fallito", { ...err, esito: "ERRORE" });
    throw e;
  }
}

/** Изтрива на партиди, докато не остане нищо над прага. */
async function eliminaAPartite(where: object): Promise<number> {
  let totale = 0;
  for (;;) {
    const candidati = await prisma.auditLog.findMany({
      where: where as never,
      select: { id: true },
      take: PARTIDA,
    });
    if (candidati.length === 0) return totale;
    const { count } = await prisma.auditLog.deleteMany({
      where: { id: { in: candidati.map((c) => c.id) } },
    });
    totale += count;
    if (candidati.length < PARTIDA) return totale;
  }
}

export async function applicaRetention(
  oggi = new Date(),
): Promise<EsitoRetention> {
  const s = soglie(oggi);
  const accesso = [...AZIONI_ACCESSO];

  // 1) Записи за ДОСТЪП — 6 месеца (Provv. Garante за администраторите на системи).
  const auditAccesso = await eliminaAPartite({
    azione: { in: accesso },
    createdAt: { lt: s.accesso },
  });

  const contabili = [...ENTITA_CONTABILI];

  // 2) Счетоводно относимите следи — 10 години (чл. 2220 Codice Civile).
  //    БЯЛ списък по ентитет. Обратното („всичко освен входовете е счетоводно")
  //    даваше десетгодишен срок и на „UPDATE dipendente" — следа за поведението
  //    на служител, за която такова основание няма (чл. 5(1)(в)+(д) GDPR).
  const auditContabile = await eliminaAPartite({
    azione: { notIn: accesso },
    entita: { in: contabili },
    createdAt: { lt: s.contabile },
  });

  // 3) Всичко останало — 24 месеца. Тук попада и всяко НОВО действие или
  //    ентитет, добавени в кода утре: при съмнение краткият срок, не дългият.
  const auditOrdinario = await eliminaAPartite({
    azione: { notIn: accesso },
    entita: { notIn: contabili },
    createdAt: { lt: s.ordinario },
  });

  // 4) Оперативна телеметрия — 90 дни. Не е лична данна, но не е и вечна.
  const { count: telemetria } = await prisma.automatismoRun.deleteMany({
    where: { iniziatoAt: { lt: s.telemetria } },
  });

  // 5) ИЗПРАТЕНИ известия — 90 дни. Само `INVIATA`: чакащото е задача, а
  //    провалилото се е сигнал за сгрешен адрес. Прочистване „по дата, без
  //    оглед на състоянието" би махнало точно това, което трябва да се види.
  const { count: notifiche } = await prisma.notifica.deleteMany({
    where: { stato: "INVIATA", inviataAt: { lt: s.notifiche } },
  });

  return {
    auditAccesso,
    auditContabile,
    auditOrdinario,
    telemetria,
    notifiche,
  };
}
