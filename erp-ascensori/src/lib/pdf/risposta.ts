// HTTP отговор с PDF.
import { NextResponse } from "next/server";

/**
 * `inline` вместо `attachment`: документът се отваря в раздела, откъдето
 * потребителят решава дали да го запази или отпечата. Принудителното сваляне
 * при всеки преглед е излишна стъпка в ежедневна работа.
 */
export function rispostaPdf(buffer: Buffer, nomeFile: string): NextResponse {
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${nomeFile}"`,
      "Content-Length": String(buffer.length),
      // Документът може да се промени (чернова) — да не се кешира от прокси.
      "Cache-Control": "private, no-store",
    },
  });
}
