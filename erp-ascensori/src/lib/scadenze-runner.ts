// Автоматизъм „Controllo scadenze" (на 24 часа): прагове 90/60/30 за impianti,
// цветен статус на automezzi, изтичане на preventivi и fatture.
// Вика се от /api/scadenze/check и от scripts/check-scadenze.ts (cron).

import { prisma } from "@/lib/prisma";
import { eseguiTracciato } from "@/lib/automatismi";
import type { Prisma } from "@prisma/client";
import { sogliePendenti, statoAutomezzo } from "@/lib/scadenze-logic";
import { basePubblica } from "@/lib/qr";
import { TIPO_SCADENZA } from "@/lib/enum-labels";
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
  return eseguiTracciato("scadenze", () => controllaScadenze(oggi), {
    logSuccesso: "breve",
  });
}

/** Какво изтича на автомобила — етикетът върви в писмото, не суровият ключ. */
const VOCE_AUTOMEZZO = {
  revisione: "Revisione",
  assicurazione: "Assicurazione",
  tagliando: "Tagliando",
} as const;

export async function controllaScadenze(
  oggi = new Date(),
): Promise<EsitoControllo> {
  let notificheScadenze = 0;
  let avvisiAccodati = 0;
  const app = basePubblica();
  // Настройките („включено ли е, кой получава") са една заявка на фирма;
  // автоматизмът минава през стотици записа на шепа фирми.
  const cache = new Map<string, ImpostazioniAvvisi>();

  /**
   * Смяната на състоянието и известието за нея — ЗАЕДНО или никак.
   *
   * Първата версия вдигаше флага, а известията записваше накрая, наведнъж и
   * извън транзакция. Паднал процес между двете оставяше флаг „известено" без
   * известие — тоест срокът по чл. 13 D.P.R. 162/1999 минаваше мълчаливо, а
   * следващият пуск нямаше вече какво да вдигне.
   */
  async function insieme(
    tenantId: string | null,
    modelli: Modello[],
    cambio: (tx: Prisma.TransactionClient) => Promise<unknown>,
  ): Promise<void> {
    const imp = await impostazioniAvvisi(tenantId, cache);
    avvisiAccodati += await prisma.$transaction(async (tx) => {
      await cambio(tx);
      return accoda(modelli, tenantId, imp, tx);
    });
  }

  // 1) Законови срокове на импиантите — флаговете се вдигат еднократно
  const scadenze = await prisma.scadenzaImpianto.findMany({
    where: { completata: false },
    include: { impianto: { select: { matricola: true } } },
  });
  for (const s of scadenze) {
    const soglie = sogliePendenti(s, oggi);
    if (soglie.length === 0) continue;
    notificheScadenze += soglie.length;
    // Един праг = едно известие. При първи пуск върху стара база могат да
    // паднат и трите наведнъж — това е вярно: срокът наистина е на 30 дни.
    const modelli = soglie.map((soglia) =>
      modelloScadenzaImpianto({
        scadenzaId: s.id,
        matricola: s.impianto.matricola,
        tipo: TIPO_SCADENZA[s.tipo] ?? s.tipo,
        scadenza: s.dataScadenza,
        soglia,
        impiantoId: s.impiantoId,
        appUrl: app,
      }),
    );
    await insieme(s.tenantId, modelli, (tx) =>
      tx.scadenzaImpianto.update({
        where: { id: s.id },
        data: {
          notificato90: s.notificato90 || soglie.includes(90),
          notificato60: s.notificato60 || soglie.includes(60),
          notificato30: s.notificato30 || soglie.includes(30),
        },
      }),
    );
  }

  // 2) Цветен статус на автопарка
  let automezziAggiornati = 0;
  const automezzi = await prisma.automezzo.findMany({
    where: { attivo: true },
  });
  for (const a of automezzi) {
    const stato = statoAutomezzo(
      [a.scadenzaRevisione, a.scadenzaAssicurazione, a.scadenzaTagliando],
      oggi,
    );
    if (stato === a.stato) continue;
    automezziAggiornati++;
    // Известие САМО при влизане в червено. „Giallo" е планиране и се вижда
    // на таблото; писмо на всяка смяна на цвета учи човека да ги трие.
    const voci = (
      [
        ["revisione", a.scadenzaRevisione],
        ["assicurazione", a.scadenzaAssicurazione],
        ["tagliando", a.scadenzaTagliando],
      ] as const
    ).filter(
      (v): v is readonly [keyof typeof VOCE_AUTOMEZZO, Date] => v[1] !== null,
    );
    const prima = voci.reduce<(typeof voci)[number] | null>(
      (min, v) => (!min || v[1] < min[1] ? v : min),
      null,
    );
    const modelli =
      stato === "rosso" && prima
        ? [
            modelloScadenzaAutomezzo({
              automezzoId: a.id,
              targa: a.targa,
              voce: VOCE_AUTOMEZZO[prima[0]],
              scadenza: prima[1],
              appUrl: app,
            }),
          ]
        : [];
    await insieme(a.tenantId, modelli, (tx) =>
      tx.automezzo.update({ where: { id: a.id }, data: { stato } }),
    );
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
    if (limite >= oggi) continue;
    preventiviScaduti++;
    await insieme(
      p.tenantId,
      [
        modelloPreventivoScaduto({
          preventivoId: p.id,
          numero: p.numero,
          appUrl: app,
        }),
      ],
      // Условието е и в `where`: оферта, приета между четенето и записа, не
      // бива да стане „изтекла" и да тръгне писмо за нея.
      (tx) =>
        tx.preventivo.updateMany({
          where: { id: p.id, stato: "INVIATO" },
          data: { stato: "SCADUTO" },
        }),
    );
  }

  // 4) Fatture: просрочен падеж → SCADUTA
  //
  // Една по една, всяка със своето известие в своята транзакция — и с
  // условието в `where`: фактура, платена между четенето и записа, не бива да
  // получи писмо „просрочена".
  const scadute = await prisma.fattura.findMany({
    where: {
      stato: { in: ["EMESSA", "INVIATA"] },
      dataScadenza: { lt: oggi },
    },
    select: { id: true, numero: true, dataScadenza: true, tenantId: true },
  });
  let fattureScadute = 0;
  for (const f of scadute) {
    let cambiata = 0;
    await insieme(
      f.tenantId,
      f.dataScadenza
        ? [
            modelloFatturaScaduta({
              fatturaId: f.id,
              numero: f.numero,
              scadenza: f.dataScadenza,
              appUrl: app,
            }),
          ]
        : [],
      async (tx) => {
        const r = await tx.fattura.updateMany({
          where: { id: f.id, stato: { in: ["EMESSA", "INVIATA"] } },
          data: { stato: "SCADUTA" },
        });
        cambiata = r.count;
        // Нищо не се е сменило → и известие няма: хвърлянето връща
        // транзакцията, включително `accoda`.
        if (!cambiata) throw new NienteDaFare();
      },
    ).catch((e) => {
      if (!(e instanceof NienteDaFare)) throw e;
    });
    fattureScadute += cambiata;
  }

  return {
    notificheScadenze,
    automezziAggiornati,
    preventiviScaduti,
    fattureScadute,
    avvisiAccodati,
  };
}

/** Сигнал „вече не е за смяна" — връща транзакцията без грешка навън. */
class NienteDaFare extends Error {}
