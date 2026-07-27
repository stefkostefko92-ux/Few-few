// Опашката от известия: какво чака, какво е тръгнало, какво се е провалило.
//
// САМО ЧЕТЕНЕ. Маршрут за ръчно изпращане няма нарочно: изпращането е
// автоматизъм и минава през `automatismi_run`, тоест dead-man проверката знае
// кога е било последно. Бутон „прати сега" в интерфейса би заобиколил тази
// следа и алармата за спрели известия би мълчала, докато някой натиска.

import { prisma } from "@/lib/prisma";
import { ok, gestito } from "@/lib/api";
import { richiedeRuolo } from "@/lib/auth";
import { filtroTenant } from "@/lib/tenant";
import { configSmtp } from "@/lib/posta/messaggio";
import { paginazione } from "@/lib/query";

export const GET = gestito(async (req) => {
  // ADMIN, не OPERATORE: опашката носи адресите за поща на фирмата.
  const s = await richiedeRuolo("ADMIN");
  const { take } = paginazione(new URL(req.url));
  const where = filtroTenant(s);

  const [righe, inAttesa, fallite] = await Promise.all([
    prisma.notifica.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take,
      select: {
        id: true,
        tipo: true,
        destinatario: true,
        oggetto: true,
        stato: true,
        tentativi: true,
        prossimoTentativo: true,
        inviataAt: true,
        ultimoErrore: true,
        createdAt: true,
      },
    }),
    prisma.notifica.count({ where: { ...where, stato: "IN_ATTESA" } }),
    prisma.notifica.count({ where: { ...where, stato: "FALLITA" } }),
  ]);

  return ok({
    righe,
    inAttesa,
    fallite,
    // Без това числата лъжат: пълна опашка при изключен SMTP изглежда като
    // задръстване, а всъщност функцията просто не е конфигурирана.
    smtpConfigurato: configSmtp() !== null,
  });
});
