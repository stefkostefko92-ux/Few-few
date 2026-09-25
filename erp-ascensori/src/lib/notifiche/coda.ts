// Опашката от известия: записване (бързо) и изпращане (бавно).
//
// Разделението е същото като при webhook-ите и е взето след същия урок:
// изпращане вътре в транзакцията на автоматизма значи, че паднало пощенско реле
// проваля вдигането на сроковете. Тоест чужд сървър решава дали срокът по
// чл. 13 D.P.R. 162/1999 ще бъде забелязан.

import { prisma } from "@/lib/prisma";
import { eseguiTracciato } from "@/lib/automatismi";
import type { Prisma, Notifica } from "@prisma/client";
import { log, descriviErrore } from "@/lib/log";
import { invia } from "@/lib/posta/smtp";
import {
  configSmtp,
  ErrorePosta,
  type ConfigSmtp,
} from "@/lib/posta/messaggio";
import {
  destinatari,
  prossimoTentativo,
  MAX_TENTATIVI,
  type Modello,
} from "@/lib/notifiche/modelli";

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * Настройките на една фирма: включено ли е и кой получава.
 *
 * Кеширано ЗА ЕДИН ПУСК (`Map`, подава се отвън), защото автоматизмът минава
 * през стотици записа на шепа фирми — без това всеки ред щеше да е заявка.
 */
export interface ImpostazioniAvvisi {
  attivi: boolean;
  destinatari: string[];
}

export async function impostazioniAvvisi(
  tenantId: string | null,
  cache: Map<string, ImpostazioniAvvisi>,
  db: Db = prisma,
): Promise<ImpostazioniAvvisi> {
  const chiave = tenantId ?? "-";
  const gia = cache.get(chiave);
  if (gia) return gia;
  const d = await db.datiAzienda.findFirst({
    where: { tenantId },
    select: { avvisiAttivi: true, emailAvvisi: true },
  });
  const v: ImpostazioniAvvisi = {
    attivi: Boolean(d?.avvisiAttivi),
    destinatari: destinatari(d?.emailAvvisi),
  };
  cache.set(chiave, v);
  return v;
}

/**
 * Записва известията за една фирма. Връща колко реда са се появили НАИСТИНА.
 *
 * `skipDuplicates` върху уникалния ключ (tenant, chiave, destinatario) е това,
 * което прави автоматизма безопасен за повторно пускане: cron в полунощ и ръчно
 * натискане в осем сутринта дават едно известие, не две.
 */
export async function accoda(
  modelli: Modello[],
  tenantId: string | null,
  imp: ImpostazioniAvvisi,
  db: Db = prisma,
): Promise<number> {
  if (!imp.attivi || !imp.destinatari.length || !modelli.length) return 0;
  const dati = modelli.flatMap((m) =>
    imp.destinatari.map((a) => ({
      tipo: m.tipo,
      chiave: m.chiave,
      destinatario: a,
      oggetto: m.oggetto,
      corpo: m.corpo,
      tenantId,
    })),
  );
  const { count } = await db.notifica.createMany({
    data: dati,
    skipDuplicates: true,
  });
  return count;
}

export interface EsitoInvii {
  tentate: number;
  riuscite: number;
  fallite: number;
  /** Изчерпали опитите си — те няма да бъдат пратени никога. */
  abbandonate: number;
  /** Няма конфигуриран SMTP: опашката расте и това трябва да се ВИДИ. */
  smtpAssente: boolean;
}

/**
 * Колко дълго едно заето известие е невидимо за друг пуск.
 *
 * Трябва да е ПОВЕЧЕ от най-лошото време на едно пращане: свързване + ~10
 * стъпки по 20 s ≈ 220 s. Ако процесът умре насред пращането, наемът изтича
 * и известието се опитва пак — „поне веднъж", не „точно веднъж", и това е
 * честното обещание, когато получателят е чужд сървър.
 */
const NOLEGGIO_MS = 10 * 60_000;

/** Зависимостите на изпращача — подменими само в интеграционния тест. */
export interface DipendenzeInvio {
  config?: ConfigSmtp | null;
  invia?: typeof invia;
}

/**
 * Заема ЕДНО чакащо известие, чието време е дошло.
 *
 * ЗАЩО ПО ЕДНО И ЗАЩО С НАЕМ. Първата версия четеше пакета с обикновен
 * `findMany`: два едновременни пуска (cron + ръчен) виждаха едни и същи редове
 * и пращаха едно писмо ДВА пъти. `FOR UPDATE SKIP LOCKED` дава реда на един
 * пуск, а преместеното `prossimoTentativo` го скрива от всеки следващ, докато
 * този не приключи. По едно — защото наемът на цял пакет от 50 би трябвало да
 * покрие 50 бавни релета.
 */
async function prendiUna(): Promise<Notifica | null> {
  return prisma.$transaction(async (tx) => {
    const [r] = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM notifiche
      WHERE stato = 'IN_ATTESA' AND "prossimoTentativo" <= now()
      ORDER BY "prossimoTentativo" ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    `;
    if (!r) return null;
    return tx.notifica.update({
      where: { id: r.id },
      data: { prossimoTentativo: new Date(Date.now() + NOLEGGIO_MS) },
    });
  });
}

/**
 * Праща чакащите, чието време е дошло.
 *
 * Взима ограничен брой: една заседнала опашка не бива да държи процеса минути.
 */
export async function inviaInAttesa(
  limite = 50,
  dip: DipendenzeInvio = {},
): Promise<EsitoInvii> {
  const esito: EsitoInvii = {
    tentate: 0,
    riuscite: 0,
    fallite: 0,
    abbandonate: 0,
    smtpAssente: false,
  };

  const c = dip.config === undefined ? configSmtp() : dip.config;
  const manda = dip.invia ?? invia;
  if (!c) {
    // ФУНКЦИЯТА Е ИЗКЛЮЧЕНА, НЕ СЧУПЕНА. Не празним опашката и не бележим
    // редовете като неуспешни: щом утре SMTP се конфигурира, чакащите тръгват.
    // Флагът излиза в отчета и в дневника, за да не изглежда тишината като „ок".
    esito.smtpAssente = true;
    const inAttesa = await prisma.notifica.count({
      where: { stato: "IN_ATTESA" },
    });
    if (inAttesa)
      log.warn("notifiche in coda senza SMTP configurato", {
        conteggio: inAttesa,
      });
    return esito;
  }

  while (esito.tentate < limite) {
    const n = await prendiUna();
    if (!n) break;
    esito.tentate++;
    try {
      await manda(c, { a: n.destinatario, oggetto: n.oggetto, testo: n.corpo });
      await prisma.notifica.update({
        where: { id: n.id },
        data: {
          stato: "INVIATA",
          inviataAt: new Date(),
          tentativi: n.tentativi + 1,
          ultimoErrore: null,
        },
      });
      esito.riuscite++;
    } catch (e) {
      const tentativi = n.tentativi + 1;
      // Постоянният отказ (невалиден адрес, 5xx от релето) не се преповтаря:
      // пет опита към сгрешен адрес са пет пъти един и същ отговор.
      const permanente = e instanceof ErrorePosta && !e.transitorio;
      const esaurito = permanente || tentativi >= MAX_TENTATIVI;
      await prisma.notifica.update({
        where: { id: n.id },
        data: {
          tentativi,
          stato: esaurito ? "FALLITA" : "IN_ATTESA",
          prossimoTentativo: prossimoTentativo(tentativi, new Date()),
          // Само кодът и стъпката. Отговорът на релето е на английски и носи
          // адреса на получателя — в базата стои достатъчно, за да се разбере
          // какво е станало, без да е втори запис на лични данни.
          ultimoErrore:
            e instanceof ErrorePosta
              ? `${e.codice}: ${e.message}`
              : descriviErrore(e).err_tipo,
        },
      });
      if (esaurito) esito.abbandonate++;
      esito.fallite++;
    }
  }

  return esito;
}

/**
 * Същото, но със следа в `automatismi_run` — това чете dead-man проверката.
 *
 * Без записа спрян cron остава невидим: опашката расте, известията не тръгват,
 * а на таблото всичко изглежда наред. Точно същата причина, поради която и
 * доставката на webhook-ите е проследена.
 */
export async function inviaInAttesaTracciato(limite = 50): Promise<EsitoInvii> {
  return eseguiTracciato("notifiche", () => inviaInAttesa(limite));
}
