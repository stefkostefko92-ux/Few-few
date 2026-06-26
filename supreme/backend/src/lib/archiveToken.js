// backend/src/lib/archiveToken.js
// Public archive pages are reachable without auth, so every link must carry
// an unguessable token (cuids are not secrets; transcripts contain PII).

import { randomBytes } from "crypto";
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
  return Boolean(ticket?.archiveToken && providedToken && ticket.archiveToken === String(providedToken));
}
