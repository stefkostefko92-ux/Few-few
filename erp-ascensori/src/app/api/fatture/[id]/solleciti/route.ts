// Поканите за плащане по една фактура.
//
// Записът е ДОКАЗАТЕЛСТВОТО, че поканата е тръгнала: при спор се пита кога и
// какво е поискано, а „мисля, че писах имейл" не е отговор. Затова маршрути за
// промяна и изтриване НЯМА — само добавяне и четене, точно както при одита.
//
// ЛИХВАТА СЕ ЗАМРАЗЯВА. Тя се смята веднъж, в момента на изпращането, и се
// записва. Пресмятане наново по-късно би дало друго число от това, което
// клиентът е получил на хартия — а различаващи се числа в спор за пари са
// по-лоши от липсващи.

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { ok, corpoValidato, gestito } from "@/lib/api";
import { richiedeRuolo, ErroreHttp } from "@/lib/auth";
import { filtroTenant, tenantDiCreazione } from "@/lib/tenant";
import { scriviAudit } from "@/lib/audit";
import { fromCents } from "@/lib/totals";
import { dataIt, plurale } from "@/lib/format";
import { residuoFattura } from "@/lib/fiscale/pagamenti";
import { calcolaInteressi, regimePerDebitore } from "@/lib/fiscale/interessi";
import {
  giorniTra,
  livelloSuggerito,
  LIVELLI_SOLLECITO,
} from "@/lib/fiscale/scadenzario";

const schema = z.object({
  livello: z.number().int().min(1).max(3),
  canale: z.string().trim().max(40).nullish(),
  note: z.string().trim().max(1000).nullish(),
});

/**
 * Полетата, които и двата маршрута четат.
 *
 * ТИПЪТ Е ИЗРИЧЕН И ТОВА НЕ Е УКРАСА. Изнесен `select` без анотация губи
 * проверката за излишно поле: TypeScript го приема, а Prisma го отхвърля чак
 * по време на работа — целият маршрут връщаше 500 при всяко извикване заради
 * едно несъществуващо поле. `satisfies Prisma.FatturaSelect` премества същата
 * грешка в компилацията.
 */
const CON_FATTURA = {
  id: true,
  numero: true,
  data: true,
  dataScadenza: true,
  totaleNetto: true,
  totaleIva: true,
  ritenutaImporto: true,
  splitPayment: true,
  stato: true,
  tipo: true,
  // КОНДОМИНИУМЪТ НЯМА ДАНЪЧЕН НОМЕР В СХЕМАТА — има данъчен код. Заявката
  // искаше несъществуващо поле и Prisma отхвърляше ЦЕЛИЯ маршрут: и GET, и
  // POST връщаха 500 при всяко извикване, тоест поканите за плащане не са
  // работили нито веднъж. Нищо в модулните тестове не може да види това —
  // затова маршрутът вече носи интеграционни (`nuovi-moduli.int.test.ts`).
  condominio: { select: { nome: true, codiceFiscale: true } },
  amministratore: { select: { ragioneSociale: true, partitaIva: true } },
  pagamenti: { select: { importo: true } },
  solleciti: { orderBy: { createdAt: "desc" as const } },
} satisfies Prisma.FatturaSelect;

export const GET = gestito(async (_req, ctx) => {
  const s = await richiedeRuolo("DIREZIONE");
  const { id } = await ctx.params;
  const f = await prisma.fattura.findFirst({
    where: { id, ...filtroTenant(s) },
    select: CON_FATTURA,
  });
  if (!f) throw new ErroreHttp(404, "Fattura non trovata");

  const res = residuoFattura(f);
  const giorni = giorniTra(f.dataScadenza ?? f.data, new Date());
  const inviati = f.solleciti.length;

  return ok({
    solleciti: f.solleciti,
    residuo: fromCents(res),
    giorniRitardo: giorni,
    prossimo: res > 0 ? livelloSuggerito(giorni, inviati) : null,
    livelli: LIVELLI_SOLLECITO,
  });
});

export const POST = gestito(async (req, ctx) => {
  const s = await richiedeRuolo("DIREZIONE");
  const { id } = await ctx.params;
  const dati = await corpoValidato(req, schema);

  const f = await prisma.fattura.findFirst({
    where: { id, ...filtroTenant(s) },
    select: CON_FATTURA,
  });
  if (!f) throw new ErroreHttp(404, "Fattura non trovata");
  if (f.tipo !== "EMESSA")
    throw new ErroreHttp(400, "Si possono sollecitare solo le fatture emesse.");
  if (f.stato === "BOZZA" || f.stato === "STORNATA")
    throw new ErroreHttp(
      409,
      "Fattura in bozza o stornata: non c'è nulla da sollecitare.",
    );

  const res = residuoFattura(f);
  // Покана за платена фактура е грешка, която струва отношения. По-добре 409
  // отколкото писмо до клиент, който не дължи нищо.
  if (res <= 0)
    throw new ErroreHttp(
      409,
      "Fattura già saldata: non c'è nulla da sollecitare.",
    );

  const scadenza = f.dataScadenza ?? f.data;
  const giorni = giorniTra(scadenza, new Date());
  if (giorni < 1) throw new ErroreHttp(409, "Fattura non ancora scaduta.");

  const inviati = f.solleciti.length;
  const atteso = livelloSuggerito(giorni, inviati);
  // Степен не се прескача и не се повтаря. Проверката е тук, а не само в
  // интерфейса: маршрутът е достъпен и без него.
  if (atteso === null || dati.livello !== atteso)
    throw new ErroreHttp(
      409,
      atteso === null
        ? "Nessun sollecito previsto in questo momento."
        : `Il prossimo passo previsto è: ${LIVELLI_SOLLECITO.find((l) => l.livello === atteso)!.etichetta}.`,
    );

  const def = LIVELLI_SOLLECITO.find((l) => l.livello === dati.livello)!;

  // Лихвата влиза чак от втората покана: искане на лихва при седмица закъснение
  // разваля отношения, които струват повече от лихвата.
  let interessi = 0;
  /** Резервата „salvo conguaglio", когато таблицата не покрива целия период. */
  let riserva: string | null = null;
  if (def.conInteressi) {
    // Кондоминиумът е краен потребител дори с данъчен номер: той не упражнява
    // стопанска дейност, тоест лихвата е законната по чл. 1284 c.c., не
    // търговската по D.Lgs. 231/2002. Разликата е няколко пъти.
    const regime = regimePerDebitore({
      condominio: !!f.condominio,
      // За кондоминиум режимът е решен от `condominio: true` (краен
      // потребител, чл. 1284 c.c.); данъчният номер тук е този на
      // администратора, когато фактурата е издадена на СТУДИОТО.
      partitaIva: f.amministratore?.partitaIva ?? null,
    });
    const calcolo = calcolaInteressi({
      capitale: res,
      scadenza,
      oggi: new Date(),
      regime,
    });
    // ЛИХВАТА СЕ ЗАМРАЗЯВА В РЕДА, но непокрит отрязък НЕ спира поканата.
    //
    // ЗАЩО НЕ ОТКАЗ (както беше). Таблиците се обнародват на 1 януари и 1 юли;
    // между падежа и обнародването всяко просрочие пада в непокрит отрязък.
    // Отказът значеше, че точно тогава НЕ МОЖЕ да се изпрати покана — а
    // поканата е това, което поставя длъжника в забава (чл. 1219 c.c.) и
    // прекъсва давността (чл. 2943 c.c.). Загубата от неизпратена покана е
    // по-голяма от лихвата за няколко дни.
    //
    // ЗАЩО НЕ И ТИХО ЗАНИЖАВАНЕ. Вписва се ПОКРИТАТА част, а разликата се
    // запазва изрично със „salvo conguaglio" — стандартната резерва: сумата в
    // поканата не изчерпва вземането и остатъкът се иска по-късно.
    interessi = calcolo.importo;
    if (calcolo.giorniNonCoperti > 0)
      riserva = `Interessi calcolati fino al ${dataIt(calcolo.tratti.at(-1)?.al ?? scadenza)}: per ${plurale(calcolo.giorniNonCoperti, "giorno", "giorni")} del periodo il tasso non è ancora pubblicato. Importo richiesto salvo conguaglio.`;
  }

  const riga = await prisma.sollecito.create({
    data: {
      fatturaId: id,
      livello: dati.livello,
      giorniRitardo: giorni,
      importoCentesimi: res,
      interessiCentesimi: interessi,
      canale: dati.canale ?? undefined,
      note: [dati.note, riserva].filter(Boolean).join(" ") || undefined,
      utenteId: s.sub,
      ...tenantDiCreazione(s),
    },
  });

  await scriviAudit({
    azione: "CREATE",
    entita: "solleciti",
    entitaId: riga.id,
    dettagli: {
      valori: {
        fattura: { a: f.numero },
        livello: { a: String(dati.livello) },
        giorniRitardo: { a: String(giorni) },
        importo: { a: fromCents(res) },
        interessi: { a: fromCents(interessi) },
        ...(riserva ? { riserva: { a: "salvo conguaglio" } } : {}),
      },
    },
    utenteId: s.sub,
    tenantId: s.tenantId,
  });

  return ok(
    {
      ...riga,
      importo: fromCents(res),
      interessi: fromCents(interessi),
      riserva,
      etichetta: def.etichetta,
    },
    201,
  );
});
