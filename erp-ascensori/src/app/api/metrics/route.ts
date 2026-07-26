// Метрики за Prometheus.
//
// Зад `x-health-token`, не публично: броят фактури, просрочията и възрастта на
// автоматизмите са бизнес разузнаване за конкурента, а списъкът маршрути е карта
// на приложението за нападателя. Без токен — 404, не 401: съществуването на
// маршрута също не му дължим.
//
// Освен техническите броячи излизат и ЧЕТИРИ показателя, които се четат от
// базата. Те са тук, защото алармата трябва да е по СИМПТОМ: „одитът е счупен"
// и „автоматизмът не е минал от 30 часа" са симптоми, а „процесът е жив" — не.

import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { esporta, type MetricaExtra } from "@/lib/metriche";
import { rlsAttiva } from "@/lib/rls";
import { log, descriviErrore } from "@/lib/log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function autorizzato(req: Request): boolean {
  const atteso = process.env.HEALTH_TOKEN;
  if (!atteso) return false;
  const a = Buffer.from(atteso);
  const b = Buffer.from(req.headers.get("x-health-token") ?? "");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Показателите от базата. Провалът им НЕ сваля маршрута — метрика без част от
 *  стойностите е по-добра от липсваща метрика по време на инцидент. */
async function daBaseDati(): Promise<MetricaExtra[]> {
  const ora = new Date();
  const fra30 = new Date(ora.getTime() + 30 * 86_400_000);
  const [ordiniAperti, fattureScadute, scadenzeVicine, ultimoRun, rls] =
    await Promise.all([
      prisma.ordineLavoro.count({
        where: { stato: { in: ["EMESSO", "CONFERMATO", "IN_LAVORO"] } },
      }),
      prisma.fattura.count({ where: { stato: "SCADUTA" } }),
      // Приключените не са срок: те стоят в базата завинаги и иначе гейджът расте
      // монотонно, докато алармата не почне да звъни постоянно и не я заглушат.
      prisma.scadenzaImpianto.count({
        where: { dataScadenza: { lte: fra30 }, completata: false },
      }),
      // ПО ИМЕ, НЕ ОБЩО. Само УСПЕШНО завършил пуск: „започнал и умрял" не е
      // доказателство, че автоматизмът работи. И задължително отделно за всеки:
      // общият „най-нов успешен пуск" се държеше свеж от `contratti` (всяка
      // сутрин) и МАСКИРАШЕ провал на `scadenze` — а именно `scadenze` носи
      // законовата функция на продукта (просрочена проверка спира уредба).
      prisma.automatismoRun.groupBy({
        by: ["nome"],
        where: { esito: "OK" },
        _max: { terminatoAt: true },
      }),
      rlsAttiva(),
    ]);

  return [
    {
      nome: "erp_ordini_aperti",
      aiuto: "Ordini di lavoro non chiusi",
      tipo: "gauge",
      valore: ordiniAperti,
    },
    {
      nome: "erp_fatture_scadute",
      aiuto: "Fatture emesse oltre la scadenza di pagamento",
      tipo: "gauge",
      valore: fattureScadute,
    },
    {
      nome: "erp_scadenze_entro_30_giorni",
      aiuto: "Verifiche e scadenze impianto in arrivo entro 30 giorni",
      tipo: "gauge",
      valore: scadenzeVicine,
    },
    // Възрастта, не времевата отметка: алармата се пише на едно място
    // („> 26 часа"), а не с аритметика в правилото. Праговете са РАЗЛИЧНИ по
    // име, защото каданси са различни — седмичното прочистване под праг от 26
    // часа би звъняло всеки ден, а под общ праг не звъни изобщо.
    ...AUTOMATISMI.map((nome) => {
      const r = ultimoRun.find((x) => x.nome === nome);
      return {
        nome: "erp_automatismo_eta_secondi",
        aiuto:
          "Secondi dall'ultima esecuzione riuscita dell'automatismo (dead-man)",
        tipo: "gauge" as const,
        etichette: { nome },
        valore: r?._max.terminatoAt
          ? Math.floor((ora.getTime() - r._max.terminatoAt.getTime()) / 1000)
          : -1,
      };
    }),
    {
      // Общият остава за съвместимост с вече написаните правила, но алармата
      // трябва да седи на разбивката отгоре.
      nome: "erp_automatismi_eta_secondi",
      aiuto: "Secondi dall'ultima esecuzione di un automatismo (dead-man)",
      tipo: "gauge",
      valore: ultimoRun.reduce((min, r) => {
        const t = r._max.terminatoAt;
        if (!t) return min;
        const eta = Math.floor((ora.getTime() - t.getTime()) / 1000);
        return min === -1 ? eta : Math.min(min, eta);
      }, -1),
    },
    {
      nome: "erp_rls_attiva",
      aiuto:
        "1 se le policy di isolamento per azienda sono realmente in vigore",
      tipo: "gauge",
      valore: rls.attiva ? 1 : 0,
    },
  ];
}

/**
 * Автоматизмите, за които се очаква dead-man.
 *
 * Изричен списък: автоматизъм, който никога не е минавал, трябва да се вижда
 * като `-1`, а не да липсва от изхода — липсваща редица не вдига аларма.
 */
const AUTOMATISMI = ["scadenze", "contratti", "retention", "webhook"] as const;

export async function GET(req: Request) {
  if (!autorizzato(req)) return new NextResponse("Not Found", { status: 404 });

  let extra: MetricaExtra[] = [];
  try {
    extra = await daBaseDati();
  } catch (e) {
    log.warn("metrics: lettura indicatori fallita", descriviErrore(e));
  }

  return new NextResponse(esporta(extra), {
    headers: {
      "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
