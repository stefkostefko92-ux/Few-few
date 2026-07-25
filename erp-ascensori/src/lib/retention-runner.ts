// Автоматизъм „Retention" — прилага политиката от `retention-logic.ts`.
// Вика се от scripts/retention.ts (cron, седмично) и от POST /api/retention/esegui.
//
// Одитът е неизменим ПО СЪДЪРЖАНИЕ (никой не може да промени ред, без подписът
// да го издаде — виж ADR 0002), но не е вечен: GDPR чл. 5(1)(д) не позволява
// лични данни да се пазят без основание. Прочистването по срок е ЕДИНСТВЕНИЯТ
// начин, по който редове напускат регистъра — и то само през този автоматизъм,
// на партиди, със следа от самото прочистване.

import { prisma } from "@/lib/prisma";
import { soglie, AZIONI_ACCESSO } from "@/lib/retention-logic";
import { log, descriviErrore } from "@/lib/log";

/** Максимален брой редове, изтривани в една партида (пази дългите заключвания). */
const PARTIDA = 5_000;

export interface EsitoRetention {
  auditAccesso: number;
  auditContabile: number;
  telemetria: number;
}

/** Пуска прочистването и записва следа от пускането (както при scadenze). */
export async function applicaRetentionTracciato(oggi = new Date()): Promise<EsitoRetention> {
  const run = await prisma.automatismoRun.create({ data: { nome: "retention" } });
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
    log.info("automatismo retention", { esito: "OK", durata_ms: Date.now() - inizio, ...esito });
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

export async function applicaRetention(oggi = new Date()): Promise<EsitoRetention> {
  const s = soglie(oggi);
  const accesso = [...AZIONI_ACCESSO];

  // 1) Записи за ДОСТЪП — 6 месеца (Provv. Garante за администраторите на системи).
  const auditAccesso = await eliminaAPartite({
    azione: { in: accesso },
    createdAt: { lt: s.accesso },
  });

  // 2) Останалият одит — 10 години (чл. 2220 Codice Civile).
  //    `notIn` вместо втори филтър по действие: така НОВО действие, добавено в
  //    кода утре, попада в дългия срок по подразбиране. Грешката в тази посока
  //    е „пазим твърде дълго", а не „изтрихме доказателство" — при съмнение
  //    искаме безопасната посока.
  const auditContabile = await eliminaAPartite({
    azione: { notIn: accesso },
    createdAt: { lt: s.contabile },
  });

  // 3) Оперативна телеметрия — 90 дни. Не е лична данна, но не е и вечна.
  const { count: telemetria } = await prisma.automatismoRun.deleteMany({
    where: { iniziatoAt: { lt: s.telemetria } },
  });

  return { auditAccesso, auditContabile, telemetria };
}
