// Автоматизъм „Retention" — прилага политиката от `retention-logic.ts`.
// Вика се от scripts/retention.ts (cron, седмично) и от POST /api/retention/esegui.
//
// Одитът е неизменим ПО СЪДЪРЖАНИЕ (никой не може да промени ред, без подписът
// да го издаде — виж ADR 0002), но не е вечен: GDPR чл. 5(1)(д) не позволява
// лични данни да се пазят без основание. Прочистването по срок е ЕДИНСТВЕНИЯТ
// начин, по който редове напускат регистъра — и то само през този автоматизъм,
// на партиди, със следа от самото прочистване.

import { prisma } from "@/lib/prisma";
import { eseguiTracciato } from "@/lib/automatismi";
import { chiaveAudit } from "@/lib/audit";
import { firmaAncora } from "@/lib/audit-hmac";
import {
  soglie,
  AZIONI_ACCESSO,
  ENTITA_CONTABILI,
} from "@/lib/retention-logic";

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
  return eseguiTracciato("retention", () => applicaRetention(oggi), {
    logSuccesso: "completo",
  });
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

/** Котви, чийто закотвен ред е налице в момента. */
async function ancoreValide(): Promise<{ chiave: string; seq: bigint }[]> {
  const ancore = await prisma.auditAncora.findMany({
    select: { chiave: true, seq: true },
  });
  const esistenti = new Set(
    (
      await prisma.auditLog.findMany({
        where: { seq: { in: ancore.map((a) => a.seq) } },
        select: { seq: true },
      })
    ).map((r) => r.seq),
  );
  return ancore.filter((a) => esistenti.has(a.seq));
}

/**
 * Премества котвата на фирма, чийто ПОСЛЕДЕН ред е изтрит от ТОВА прочистване.
 *
 * Прочистването е единственият законен път, по който редове напускат
 * регистъра, и при неактивна фирма може да изтрие и последния. Без това
 * проверката би обявила „отрязана опашка" за нещо, което законът изисква.
 * Котва, чийто ред е изчезнал ПРЕДИ пуска, НЕ се пипа: там опашката е
 * отрязана от някой друг и сигналът трябва да остане.
 */
async function riallineaAncore(
  prima: { chiave: string; seq: bigint }[],
): Promise<void> {
  for (const a of prima) {
    const ancora = await prisma.auditLog.findFirst({
      where: { seq: a.seq },
      select: { id: true },
    });
    if (ancora) continue;
    const tenantId = a.chiave === "" ? null : a.chiave;
    await prisma.$transaction(async (tx) => {
      // Същата ключалка като при вписването: иначе ново вписване между
      // четенето и записа тук би върнало котвата назад.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${a.chiave}, 0))`;
      const attuale = await tx.auditAncora.findUnique({
        where: { chiave: a.chiave },
      });
      if (!attuale || attuale.seq !== a.seq) return; // вече преместена от вписване
      const ultimo = await tx.auditLog.findFirst({
        where: { tenantId },
        orderBy: { seq: "desc" },
        select: { seq: true, hmac: true },
      });
      if (!ultimo) {
        await tx.auditAncora.delete({ where: { chiave: a.chiave } });
        return;
      }
      await tx.auditAncora.update({
        where: { chiave: a.chiave },
        data: {
          seq: ultimo.seq,
          hmac: ultimo.hmac,
          firma: firmaAncora(a.chiave, ultimo.seq, ultimo.hmac, chiaveAudit()),
        },
      });
    });
  }
}

export async function applicaRetention(
  oggi = new Date(),
): Promise<EsitoRetention> {
  const s = soglie(oggi);
  const accesso = [...AZIONI_ACCESSO];

  // Котвите, чиито редове СЪЩЕСТВУВАТ преди прочистването. Само те могат да
  // бъдат преместени след него — и само ако редът им е изтрит В ТОЗИ пуск.
  const ancorePrima = await ancoreValide();

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

  await riallineaAncore(ancorePrima);

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
