// Пораждане и доставка на известия.
//
// Разделено на две: `emettiEvento` само ЗАПИСВА доставките (бързо, в
// транзакцията на операцията), а `consegnaInAttesa` ги праща (бавно, в
// автоматизъм). Изпращането по време на HTTP заявката би значело, че бавен или
// паднал получател бави или проваля смяната на статуса — тоест чужд сървър
// решава дали фактурата ни ще се издаде.

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { log, descriviErrore } from "@/lib/log";
import { postEsterno } from "@/lib/rete";
import {
  firmaCorpo,
  prossimoTentativo,
  vaRiprovato,
  consegnaRiuscita,
  HEADER_FIRMA,
  HEADER_TIMESTAMP,
  HEADER_EVENTO,
  HEADER_CONSEGNA,
  MAX_FALLIMENTI_WEBHOOK,
  type Evento,
} from "@/lib/webhook/firma";

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * Записва доставките за всички абонирани за това събитие.
 *
 * Тялото се ЗАМРАЗЯВА тук: препращане на „текущото състояние" при доставката би
 * пратило по-късна стойност и получателят би видял събитие, което не се е
 * случило така.
 */
export async function emettiEvento(
  evento: Evento,
  corpo: Prisma.InputJsonObject,
  tenantId: string | null,
  db: Db = prisma,
): Promise<number> {
  const webhooks = await db.webhook.findMany({
    where: { tenantId, attivo: true, eventi: { has: evento } },
    select: { id: true },
  });
  if (!webhooks.length) return 0;

  await db.webhookConsegna.createMany({
    data: webhooks.map((w) => ({
      webhookId: w.id,
      evento,
      corpo: {
        evento,
        dati: corpo,
        emessoIl: new Date().toISOString(),
      } satisfies Prisma.InputJsonObject,
      tenantId,
    })),
  });
  return webhooks.length;
}

/** Колко секунди чакаме получателя, преди да броим опита за неуспешен. */
const TIMEOUT_MS = 10_000;

export interface EsitoConsegne {
  tentate: number;
  riuscite: number;
  fallite: number;
  webhookDisattivati: number;
}

/**
 * Праща чакащите доставки, чието време е дошло.
 *
 * Пуска се от автоматизъм. Взима ограничен пакет: една заседнала опашка не бива
 * да задържи процеса за минути.
 */
export async function consegnaInAttesa(limite = 100): Promise<EsitoConsegne> {
  const ora = new Date();
  const daFare = await prisma.webhookConsegna.findMany({
    where: { stato: "IN_ATTESA", prossimoTentativo: { lte: ora } },
    orderBy: { prossimoTentativo: "asc" },
    take: limite,
    include: {
      webhook: {
        select: { id: true, url: true, segreto: true, fallimenti: true },
      },
    },
  });

  const esito: EsitoConsegne = {
    tentate: 0,
    riuscite: 0,
    fallite: 0,
    webhookDisattivati: 0,
  };

  for (const c of daFare) {
    esito.tentate += 1;
    const corpo = JSON.stringify(c.corpo);
    const timestamp = Math.floor(Date.now() / 1000);
    const tentativi = c.tentativi + 1;

    let stato: number | null = null;
    let errore: string | null = null;
    try {
      // НЕ `fetch`: той следва пренасочвания, тоест публичен получател може да
      // отговори `302` към `http://169.254.169.254/` и цялата проверка за
      // вътрешен адрес да бъде заобиколена. `postEsterno` проверява РЕЗОЛВНИЯ
      // адрес в мига на свързването и не следва пренасочване (`lib/rete.ts`).
      const res = await postEsterno(c.webhook.url, {
        intestazioni: {
          "Content-Type": "application/json",
          [HEADER_EVENTO]: c.evento,
          [HEADER_CONSEGNA]: c.id,
          [HEADER_TIMESTAMP]: String(timestamp),
          [HEADER_FIRMA]: firmaCorpo(corpo, c.webhook.segreto, timestamp),
        },
        corpo,
        // Без таймаут един увиснал получател държи процеса до безкрай.
        timeoutMs: TIMEOUT_MS,
      });
      stato = res.stato;
    } catch (e) {
      // Само тип и код — тялото на грешката може да носи адреси и заглавия.
      errore = descriviErrore(e).err_tipo || "errore di rete";
    }

    if (stato !== null && consegnaRiuscita(stato)) {
      esito.riuscite += 1;
      await prisma.$transaction([
        prisma.webhookConsegna.update({
          where: { id: c.id },
          data: {
            stato: "CONSEGNATO",
            tentativi,
            rispostaStato: stato,
            consegnatoAt: new Date(),
          },
        }),
        // Успехът НУЛИРА брояча: получател, паднал веднъж миналия месец, не бива
        // да бъде спрян заради стара история.
        prisma.webhook.update({
          where: { id: c.webhook.id },
          data: { fallimenti: 0 },
        }),
      ]);
      continue;
    }

    esito.fallite += 1;
    const riprova = vaRiprovato(stato, tentativi);
    await prisma.webhookConsegna.update({
      where: { id: c.id },
      data: {
        stato: riprova ? "IN_ATTESA" : "FALLITO",
        tentativi,
        rispostaStato: stato,
        ultimoErrore: errore ?? (stato ? `HTTP ${stato}` : null),
        prossimoTentativo: riprova
          ? prossimoTentativo(tentativi)
          : c.prossimoTentativo,
      },
    });

    if (!riprova) {
      const fallimenti = c.webhook.fallimenti + 1;
      // Мъртъв получател не се чука вечно: това е DoS срещу самите нас и
      // безсмислен трафик към чужд сървър.
      const spegni = fallimenti >= MAX_FALLIMENTI_WEBHOOK;
      if (spegni) esito.webhookDisattivati += 1;
      await prisma.webhook.update({
        where: { id: c.webhook.id },
        data: { fallimenti, ...(spegni ? { attivo: false } : {}) },
      });
      if (spegni)
        log.warn(`webhook disattivato dopo ${fallimenti} consegne fallite`, {
          conteggio: fallimenti,
        });
    }
  }

  return esito;
}
