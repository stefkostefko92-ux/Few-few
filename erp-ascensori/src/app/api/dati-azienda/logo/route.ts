// Логото на фирмата за печатните документи.
//
// GET  — всеки влязъл (логото е на документите, които и без това чете);
// PUT  — ADMIN+, multipart с поле `file`: PNG/JPEG до 512 KB, разпознат по
//        съдържанието и записан БЕЗ метаданни (`src/lib/pdf/logo.ts`);
// DELETE — ADMIN+.
// Одитът пази факта и отпечатъка, не картинката.

import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, errore, gestito } from "@/lib/api";
import { richiedeRuolo } from "@/lib/auth";
import { scriviAudit } from "@/lib/audit";
import {
  LOGO_MAX_BYTE,
  erroreLogo,
  pulisciLogo,
  riconosciLogo,
} from "@/lib/pdf/logo";

export const runtime = "nodejs";

export const GET = gestito(async () => {
  const s = await richiedeRuolo("OPERATORE");
  const d = await prisma.datiAzienda.findFirst({
    where: { tenantId: s.tenantId ?? null },
    select: { logo: true },
  });
  const info = d?.logo ? riconosciLogo(d.logo) : null;
  if (!d?.logo || !info) return errore(404, "Nessun logo caricato");
  return new NextResponse(new Uint8Array(d.logo), {
    headers: {
      // Видът идва от СЪДЪРЖАНИЕТО, не от записа; nosniff — браузърът не гадае.
      "Content-Type": info.tipo,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-cache",
      "Content-Disposition": "inline",
    },
  });
});

export const PUT = gestito(async (req) => {
  const s = await richiedeRuolo("ADMIN");
  const tenantId = s.tenantId ?? null;
  // Размерът се проверява ПРЕДИ четенето на тялото, където е обявен.
  const dichiarato = Number(req.headers.get("content-length") ?? 0);
  if (dichiarato > LOGO_MAX_BYTE + 64 * 1024)
    return errore(413, "Il logo supera 512 KB.");
  const riga = await prisma.datiAzienda.findFirst({
    where: { tenantId },
    select: { id: true },
  });
  if (!riga)
    return errore(
      409,
      "Compilare e salvare prima i dati aziendali, poi caricare il logo.",
    );
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return errore(400, "Nessun file caricato");
  const grezzo = new Uint8Array(await file.arrayBuffer());
  const problema = erroreLogo(grezzo);
  if (problema) return errore(422, problema);
  const pulito = pulisciLogo(grezzo);
  const info = riconosciLogo(pulito);
  if (!info) return errore(422, "Immagine non leggibile.");

  await prisma.datiAzienda.update({
    where: { id: riga.id },
    data: { logo: Buffer.from(pulito), logoTipo: info.tipo },
  });
  await scriviAudit({
    azione: "UPDATE",
    entita: "dati_azienda",
    entitaId: riga.id,
    dettagli: {
      valori: {
        logo: {
          a: createHash("sha256").update(pulito).digest("hex").slice(0, 16),
        },
      },
    },
    utenteId: s.sub,
    tenantId,
  });
  return ok({
    tipo: info.tipo,
    larghezza: info.larghezza,
    altezza: info.altezza,
    byte: pulito.length,
  });
});

export const DELETE = gestito(async () => {
  const s = await richiedeRuolo("ADMIN");
  const tenantId = s.tenantId ?? null;
  const riga = await prisma.datiAzienda.findFirst({
    where: { tenantId },
    select: { id: true, logo: true },
  });
  if (!riga?.logo) return ok({ ok: true });
  await prisma.datiAzienda.update({
    where: { id: riga.id },
    data: { logo: null, logoTipo: null },
  });
  await scriviAudit({
    azione: "UPDATE",
    entita: "dati_azienda",
    entitaId: riga.id,
    dettagli: { valori: { logo: { a: "rimosso" } } },
    utenteId: s.sub,
    tenantId,
  });
  return ok({ ok: true });
});
