// QR стикерът на един импиант.
import { gestito, errore } from "@/lib/api";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { richiedeRuolo } from "@/lib/auth";
import { filtroTenant } from "@/lib/tenant";
import { qrSvg, urlImpianto, basePubblica } from "@/lib/qr";

export const GET = gestito(async (_req, ctx) => {
  const s = await richiedeRuolo("TECNICO");
  const { id } = await ctx.params;
  const i = await prisma.impianto.findFirst({
    where: { id, ...filtroTenant(s) },
    select: { matricola: true },
  });
  if (!i) return errore(404, "Impianto non trovato");

  const base = basePubblica();
  if (!base)
    return errore(
      503,
      "APP_URL non configurato: senza indirizzo pubblico l'etichetta porterebbe a un link non valido",
    );

  return new NextResponse(qrSvg(urlImpianto(base, i.matricola), { modulo: 4 }), {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Content-Disposition": `inline; filename="qr-${i.matricola}.svg"`,
      // Кодът зависи само от матриколата — може да се кешира от браузъра, но
      // не от общо прокси: адресът издава наличието на импианта.
      "Cache-Control": "private, max-age=3600",
    },
  });
});
