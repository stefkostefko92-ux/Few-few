// Втори фактор: подготовка, включване и изключване.
//
// Включването е в ДВЕ стъпки нарочно: GET дава тайната и QR-а, POST я
// потвърждава с код от приложението. Иначе потребител, който е сканирал
// грешно, се заключва навън от собствения си акаунт.

import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { ok, corpoValidato, gestito } from "@/lib/api";
import { richiedeSessione, ErroreHttp } from "@/lib/auth";
import { scriviAudit } from "@/lib/audit";
import {
  generaSegreto,
  uriOtpauth,
  verifica,
  generaCodiciRecupero,
} from "@/lib/totp";
import { hashCodiciRecupero } from "@/lib/mfa";
import { mfaObbligatorio } from "@/lib/password-policy";
import { revocaTutte } from "@/lib/sessioni";

/** Подготовка: нова тайна + URI за QR. Още НЕ включва втория фактор. */
export const GET = gestito(async () => {
  const s = await richiedeSessione();
  const u = await prisma.user.findUniqueOrThrow({
    where: { id: s.sub },
    select: { email: true, totpAttivo: true, totpSegreto: true },
  });
  if (u.totpAttivo) return ok({ attivo: true });

  // Тайната се записва веднага, но БЕЗ `totpAttivo` — така кодът, който
  // потребителят въвежда след малко, се проверява срещу същата тайна дори
  // след презареждане на страницата.
  const segreto = u.totpSegreto ?? generaSegreto();
  if (!u.totpSegreto)
    await prisma.user.update({
      where: { id: s.sub },
      data: { totpSegreto: segreto },
    });

  return ok({ attivo: false, segreto, uri: uriOtpauth(segreto, u.email) });
});

const schemaAttiva = z.object({ codice: z.string().trim().min(6).max(10) });

/** Включване след потвърждение с код. Връща резервните кодове ВЕДНЪЖ. */
export const POST = gestito(async (req) => {
  const s = await richiedeSessione();
  const { codice } = await corpoValidato(req, schemaAttiva);

  const u = await prisma.user.findUniqueOrThrow({
    where: { id: s.sub },
    select: { totpSegreto: true, totpAttivo: true },
  });
  if (u.totpAttivo)
    throw new ErroreHttp(409, "Verifica in due passaggi già attiva");
  if (!u.totpSegreto)
    throw new ErroreHttp(409, "Avviare prima la configurazione");
  if (!verifica(u.totpSegreto, codice))
    throw new ErroreHttp(
      400,
      "Codice non valido: verificare l'orario del dispositivo",
    );

  const codici = generaCodiciRecupero();
  await prisma.user.update({
    where: { id: s.sub },
    data: {
      totpAttivo: true,
      codiciRecupero: await hashCodiciRecupero(codici),
    },
  });
  await scriviAudit({
    azione: "STATE_CHANGE",
    entita: "users",
    entitaId: s.sub,
    dettagli: { valori: { mfa: { a: "attivo" } } },
    utenteId: s.sub,
    tenantId: s.tenantId,
  });

  // Единственият момент, в който резервните кодове се виждат в чист вид.
  return ok({ attivo: true, codiciRecupero: codici });
});

const schemaDisattiva = z.object({ password: z.string().min(1).max(200) });

/** Изключване — иска паролата отново. */
export const DELETE = gestito(async (req) => {
  const s = await richiedeSessione();
  const { password } = await corpoValidato(req, schemaDisattiva);

  const u = await prisma.user.findUniqueOrThrow({
    where: { id: s.sub },
    select: { password: true, ruolo: true },
  });
  // Задължителният за ролята втори фактор не се маха от самия потребител —
  // иначе мярката е доброволна за тези, за които е задължителна.
  if (mfaObbligatorio(u.ruolo))
    throw new ErroreHttp(
      403,
      "La verifica in due passaggi è obbligatoria per questo livello di accesso",
    );
  if (!(await bcrypt.compare(password, u.password)))
    throw new ErroreHttp(401, "Password non corretta");

  await prisma.user.update({
    where: { id: s.sub },
    data: { totpAttivo: false, totpSegreto: null, codiciRecupero: [] },
  });
  // Изключването на втория фактор е промяна в сигурността: всички други
  // устройства падат.
  await revocaTutte(s.sub);
  await scriviAudit({
    azione: "STATE_CHANGE",
    entita: "users",
    entitaId: s.sub,
    dettagli: { valori: { mfa: { a: "disattivato" } } },
    utenteId: s.sub,
    tenantId: s.tenantId,
  });
  return ok({ attivo: false });
});
