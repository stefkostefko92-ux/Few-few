// Следата на автоматизмите в `automatismi_run` — едно място, не пет копия.
//
// Всеки автоматизъм (scadenze, contratti, retention, webhook, notifiche) пише
// ред при старт и го затваря с OK или ERRORE. Този ред е ЕДИНСТВЕНИЯТ източник
// за dead-man проверката (`/api/healthz/automatismi`) и за гейджа
// `erp_automatismo_eta_secondi`: без него спрян cron остава невидим — срокът
// минава, опашката расте, а таблото изглежда наред.
//
// ФОРМАТЪТ Е ДОГОВОР. Имената, полетата и `errore: "<тип>:<код>"` се четат от
// метриките и алармите; обединяването в една функция не бива да ги мени.

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { log, descriviErrore } from "@/lib/log";

export interface OpzioniTracciato {
  /**
   * Дневник при успех. По подразбиране — нищо (грешката се пише винаги):
   *   • `"breve"`    — само изход и продължителност;
   *   • `"completo"` — и броячите от резултата.
   * Различно е по автоматизъм нарочно и се пази такова: webhook-ите вървят на
   * 5 минути и ред при всеки успех би удавил дневника.
   */
  logSuccesso?: "breve" | "completo";
}

/**
 * Пуска `fn` и записва следа в `automatismi_run`.
 *
 * Резултатът влиза в `dettagli` — затова е само агрегатни броячи, никога лични
 * данни. Грешката се записва като тип и код, без съобщение (то може да носи
 * адрес или стойност), и се хвърля нататък непроменена.
 */
export async function eseguiTracciato<T extends object>(
  nome: string,
  fn: () => Promise<T>,
  opz: OpzioniTracciato = {},
): Promise<T> {
  const run = await prisma.automatismoRun.create({ data: { nome } });
  const inizio = Date.now();
  try {
    const esito = await fn();
    await prisma.automatismoRun.update({
      where: { id: run.id },
      data: {
        terminatoAt: new Date(),
        esito: "OK",
        durataMs: Date.now() - inizio,
        dettagli: { ...esito } as Prisma.InputJsonObject,
      },
    });
    if (opz.logSuccesso)
      log.info(`automatismo ${nome}`, {
        esito: "OK",
        durata_ms: Date.now() - inizio,
        ...(opz.logSuccesso === "completo" ? esito : {}),
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
    log.error(`automatismo ${nome} fallito`, { ...err, esito: "ERRORE" });
    throw e;
  }
}
