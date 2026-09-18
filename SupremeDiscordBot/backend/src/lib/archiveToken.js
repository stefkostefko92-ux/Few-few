// backend/src/lib/archiveToken.js
// Public archive pages are reachable without auth, so every link must carry
// an unguessable token (cuids are not secrets; transcripts contain PII).

import { randomBytes, timingSafeEqual } from "crypto";
import { prisma } from "./prisma.js";

export function newArchiveToken() {
  return randomBytes(16).toString("hex");
}

export function tokenizedArchiveUrl(ticketId, token) {
  return token ? `/archive/ticket/${ticketId}?t=${token}` : null;
}

/**
 * Return the ticket's archive token, generating and persisting one if missing.
 */
export async function ensureArchiveToken(ticketId, existingToken = undefined) {
  if (existingToken) return existingToken;
  if (existingToken === undefined) {
    const t = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { archiveToken: true },
    });
    if (t?.archiveToken) return t.archiveToken;
  }
  const token = newArchiveToken();
  await prisma.ticket.update({ where: { id: ticketId }, data: { archiveToken: token } });
  return token;
}

/**
 * Constant-shape check used by the public viewer routes.
 */
export function archiveTokenMatches(ticket, providedToken) {
  const stored = ticket?.archiveToken;
  if (!stored || providedToken == null) return false;
  const a = Buffer.from(String(stored));
  const b = Buffer.from(String(providedToken));
  // timingSafeEqual хвърля при различна дължина — дължината на токена е
  // публична (32 hex знака), затова сравнението ѝ първо не изтича тайна.
  // Константно-времево като останалия таен-сравнителен код (topgg/bot secret).
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
