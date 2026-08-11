// backend/src/routes/archive.js
// Public ticket archive viewer — renders the stored HTML transcript.
// If the ticket exists but archiveHtml is missing (e.g. closed before the
// auto-transcript feature was deployed), regenerate it on-the-fly.

import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { generateHtmlTranscript } from "../utils/archive.js";
import { archiveTokenMatches, tokenizedArchiveUrl } from "../lib/archiveToken.js";
import { check, recordFailure, recordSuccess } from "../lib/bruteForce.js";

const router = Router();

// ─── CSP за транскрипта ──────────────────────────────────────────────────────
// Глобалният helmet изключва CSP („API-то не сервира HTML“) — но ТОЗИ маршрут
// сервира HTML, и то с чуждо съдържание (съобщения на потребители) в него. Без
// политика единственото, което стои между съхранен XSS и изпълнен скрипт, е
// екранирането в generateHtmlTranscript. Тук слагаме втори, независим слой:
// нула скриптове, нула кадри, нула изходящи връзки; вградените стилове са
// разрешени, защото транскриптът носи собствен <style> блок.
const ARCHIVE_CSP = [
  "default-src 'none'",
  "style-src 'unsafe-inline'",
  // Аватарите и прикачените файлове идват от CDN-а на Discord.
  "img-src 'self' https://cdn.discordapp.com https://media.discordapp.net data:",
  "font-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join("; ");

function secureHtml(res) {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Content-Security-Policy", ARCHIVE_CSP);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  // Страницата съдържа лични данни — никакво индексиране.
  res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
}

router.get("/ticket/:ticketId", async (req, res, next) => {
  try {
    // Блокираните не стигат до базата — налучкването на токени не бива да
    // струва нищо на нашата инфраструктура (виж lib/bruteForce.js).
    const blocked = await check("archive", req.ip);
    if (blocked.blocked) {
      secureHtml(res);
      res.setHeader("Retry-After", String(blocked.retryAfterSec));
      return res.status(429).send(notFoundPage("Too many attempts. Please try again later."));
    }

    let ticket = await prisma.ticket.findUnique({
      where: { id: req.params.ticketId },
      select: { archiveHtml: true, status: true, number: true, serverId: true, archiveToken: true },
    });

    // Transcripts contain PII — require the unguessable ?t= token and answer
    // 404 (not 403) so existence of a ticket ID can't be probed.
    if (!ticket || !archiveTokenMatches(ticket, req.query.t)) {
      // Всеки грешен токен се брои: това е ЕДИНСТВЕНИЯТ напълно публичен
      // маршрут, който сервира лични данни срещу тайна в URL-а.
      await recordFailure("archive", req.ip);
      secureHtml(res);
      return res.status(404).send(notFoundPage("This ticket doesn't exist or has been permanently deleted."));
    }
    await recordSuccess("archive", req.ip);

    // Lazy-generate transcript if missing (for tickets closed before this feature)
    if (!ticket.archiveHtml) {
      const full = await prisma.ticket.findUnique({
        where: { id: req.params.ticketId },
        include: {
          messages: { orderBy: { createdAt: "asc" } },
          creator: true,
          assignee: true,
          // Виж tickets.js — транскриптът се брандира според white-label бота.
          server: { select: { name: true, customBotName: true } },
        },
      });

      if (!full) {
        secureHtml(res);
        return res.status(404).send(notFoundPage("Ticket data incomplete."));
      }

      const html = generateHtmlTranscript(full);

      // Cache it for next time (fire-and-forget)
      prisma.ticket.update({
        where: { id: full.id },
        data: { archiveHtml: html, archiveUrl: tokenizedArchiveUrl(full.id, ticket.archiveToken) },
      }).catch((e) => console.warn("[archive] cache update failed:", e.message));

      ticket = { archiveHtml: html };
    }

    secureHtml(res);
    res.setHeader("Cache-Control", "private, max-age=300");
    res.send(ticket.archiveHtml);
  } catch (err) {
    console.error("[archive]", err.message);
    next(err);
  }
});

function notFoundPage(message) {
  return `
    <!DOCTYPE html>
    <html><head><title>Archive not found</title>
    <style>
      body{background:#0a0a0a;color:#e5e5e5;font-family:system-ui,sans-serif;padding:40px;text-align:center;min-height:100vh;margin:0}
      h1{color:#00e5ff;font-size:2em;margin-bottom:12px}
      p{color:#888;margin-bottom:24px}
      a{color:#00e5ff;text-decoration:none;padding:8px 16px;border:1px solid #00e5ff33;border-radius:8px}
      a:hover{background:#00e5ff11}
    </style></head>
    <body>
      <h1>📭 Archive not found</h1>
      <p>${message}</p>
      <a href="/">← Back to Supreme Bot</a>
    </body></html>
  `;
}

export default router;
