// Събиране на нарушенията на CSP.
//
// ЗАЩО ИЗОБЩО. Политика без събиране е политика, която никой не смее да
// затегне: не се знае дали „script-src" е спрял нападение или собствената ни
// графика, затова при първото оплакване се разхлабва завинаги. Броячът прави
// разликата видима.
//
// ЗАЩО Е БЕЗОПАСНО ДА Е БЕЗ СЕСИЯ. Браузърът праща доклада САМ, извън заявката,
// без бисквитки — маршрут зад вход просто не би получил нищо. Оттук нататък
// всичко е ограничение:
//
//   • тялото се чете с ТАВАН (по-голямо се отрязва, преди да стане низ);
//   • от него излизат само две стойности от ЗАТВОРЕНИ множества
//     (`csp-rapporto.ts`) — външен вход никога не става етикет на метрика;
//   • нищо не влиза в базата и нищо не влиза в одита;
//   • честотата е ограничена по IP: докладите са евтини за пращане и всеки
//     може да прати милион.
//
// Отговорът е винаги 204 и винаги еднакъв. Браузърът не чете тялото, а различни
// отговори биха казали на изпращача кое е минало и кое — не.

import { NextResponse } from "next/server";
import { leggiRapporto } from "@/lib/csp-rapporto";
import { incrementa } from "@/lib/metriche";
import { consenti } from "@/lib/rate-limit";
import { ipClient } from "@/lib/ip-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Един доклад е под килобайт; по-голямото не е доклад. */
const MAX_BYTE = 8 * 1024;
const LIMITE = Number(process.env.RATE_LIMIT_CSP ?? 120);

/** Нов обект всеки път: един споделен `Response` се раздава на паралелни
 *  заявки и Next би му пипал хедърите под краката. */
const vuoto = () => new NextResponse(null, { status: 204 });

export async function POST(req: Request): Promise<NextResponse> {
  if (!consenti(`csp:${ipClient(req.headers)}`, LIMITE, 60 * 60_000))
    return vuoto();

  const tipo = req.headers.get("content-type") ?? "";
  if (
    !tipo.includes("application/csp-report") &&
    !tipo.includes("application/reports+json") &&
    !tipo.includes("application/json")
  )
    return vuoto();

  const grezzo = await req.arrayBuffer().catch(() => null);
  if (!grezzo || grezzo.byteLength === 0 || grezzo.byteLength > MAX_BYTE)
    return vuoto();

  let corpo: unknown;
  try {
    corpo = JSON.parse(new TextDecoder().decode(grezzo));
  } catch {
    return vuoto();
  }

  for (const v of leggiRapporto(corpo))
    incrementa("erp_csp_violazioni_totale", {
      direttiva: v.direttiva,
      origine: v.origine,
    });

  return vuoto();
}
