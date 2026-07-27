// Сваляне и изтриване на прикачен файл.
//
// Раздаването е най-опасната част от целия механизъм. Качен файл, върнат
// небрежно, е съхранен XSS: браузърът го изпълнява В НАШИЯ домейн, тоест със
// сесията на потребителя. Затова отговорът носи четири предпазителя наведнъж и
// нито един не е излишен:
//
//   • `Content-Disposition: attachment` — файлът се сваля, не се рендерира;
//   • `X-Content-Type-Options: nosniff` — браузърът не гадае типа;
//   • `Content-Security-Policy: sandbox` — дори при отваряне няма скриптове,
//     няма форми и няма достъп към нашия произход;
//   • типът идва от базата (подушен при качването), не от заявката.

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { ok, gestito } from "@/lib/api";
import { richiedeRuolo, ErroreHttp } from "@/lib/auth";
import { filtroTenant } from "@/lib/tenant";
import { scriviAudit } from "@/lib/audit";
import { leggi, elimina } from "@/lib/allegati/archivio";

/**
 * Името за `Content-Disposition`.
 *
 * Кавичките и обратните наклонени черти се махат, а нелатинските знаци минават
 * през `filename*` (RFC 5987). Без това италианско име с ударение стига до
 * потребителя счупено, а кавичка в името чупи самия хедър — и оттам се
 * инжектират чужди хедъри.
 */
/**
 * Кога файлът може да се ПОКАЖЕ, вместо да се свали.
 *
 * САМО СНИМКИ, И САМО ПО ИЗРИЧНО ПОИСКВАНЕ (`?anteprima=1`). Разчитането, че
 * браузърът ще пренебрегне `Content-Disposition: attachment` при `<img>`, е
 * разчитане на поведение, а не на решение. Тук решението е наше и е тясно:
 * типовете са ЗАТВОРЕН списък, подушен по съдържание при качването, а SVG —
 * единственият „образ", който носи скриптове — е забранен още на входа
 * (`lib/allegati/tipi.ts`). PDF НЕ влиза: той се отваря от вграден четец и
 * носи собствена повърхност.
 *
 * Предпазителите остават и в двата случая: `nosniff`, sandbox CSP, тип от
 * базата.
 */
function puoEssereMostrato(mimeType: string): boolean {
  return ["image/jpeg", "image/png", "image/webp"].includes(mimeType);
}

function disposizione(nome: string): string {
  const semplice = nome.replace(/["\\]/g, "_").replace(/[^\x20-\x7e]/g, "_");
  return `attachment; filename="${semplice}"; filename*=UTF-8''${encodeURIComponent(nome)}`;
}

export const GET = gestito(async (req, ctx) => {
  const s = await richiedeRuolo("OPERATORE");
  const { id } = await ctx.params;
  // Филтърът по фирма е ЗАДЪЛЖИТЕЛЕН: без него познат UUID сваля чужд документ.
  const a = await prisma.allegato.findFirst({
    where: { id, ...filtroTenant(s) },
  });
  if (!a) throw new ErroreHttp(404, "Allegato non trovato");

  let dati: Buffer;
  try {
    dati = await leggi(a.percorso);
  } catch {
    // Ред без файл значи повреден бекъп или ръчно чистене. По-честно е да се
    // каже, отколкото да се върне празен файл, който минава за документа.
    throw new ErroreHttp(410, "File non più disponibile nell'archivio");
  }

  const anteprima =
    new URL(req.url).searchParams.get("anteprima") === "1" &&
    puoEssereMostrato(a.mimeType);

  return new NextResponse(new Uint8Array(dati), {
    headers: {
      "Content-Type": a.mimeType,
      "Content-Length": String(a.dimensione),
      "Content-Disposition": anteprima
        ? `inline; filename="${a.id}"`
        : disposizione(a.nome),
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'",
      // Чужд сайт не бива да вгражда снимките от обекта.
      "Cross-Origin-Resource-Policy": "same-origin",
      // Документите съдържат лични данни: не се кешират по пътя дотук.
      "Cache-Control": "private, no-store",
    },
  });
});

export const DELETE = gestito(async (_req, ctx) => {
  // Изтриването на доказателство не е работа на техника.
  const s = await richiedeRuolo("RESPONSABILE");
  const { id } = await ctx.params;
  const a = await prisma.allegato.findFirst({
    where: { id, ...filtroTenant(s) },
  });
  if (!a) throw new ErroreHttp(404, "Allegato non trovato");

  // Редът пада ПРЪВ: ако файлът не се изтрие, остава сирак — заема място, но е
  // невидим. Обратният ред би оставил ред, сочещ към нищо.
  await prisma.allegato.delete({ where: { id } });
  await elimina(a.percorso);

  await scriviAudit({
    azione: "DELETE",
    entita: "allegati",
    entitaId: id,
    dettagli: {
      valori: {
        nome: { da: a.nome },
        allegatoA: { da: `${a.entita}/${a.entitaId}` },
        sha256: { da: a.sha256 },
      },
    },
    utenteId: s.sub,
    tenantId: s.tenantId,
  });
  return ok({ ok: true });
});
