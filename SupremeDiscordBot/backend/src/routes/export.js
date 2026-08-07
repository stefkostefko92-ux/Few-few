// backend/src/routes/export.js
// Premium export endpoints: CSV for tickets/applications, PDF for individual tickets.

import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth, loadUser, requireServerAdmin } from "../middleware/auth.js";
import PDFDocument from "pdfkit";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ─── Шрифтове с кирилица ─────────────────────────────────────────────────────
// PDFKit носи само 14-те стандартни PDF шрифта (Helvetica/Times/Courier) — те
// са Latin-1 и физически нямат кирилски глифи. Български транскрипт излизаше
// празен. DejaVu Sans покрива кирилица (и гръцки), лицензът е свободен
// (Bitstream Vera + Public Domain — виж assets/fonts/LICENSE-DejaVu.txt) и
// шрифтът е ВГРАДЕН в репото: контейнерът е node:alpine и няма системни
// шрифтове, на които да разчитаме.
const FONTS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "assets", "fonts");
const FONT = "Body";
const FONT_BOLD = "BodyBold";

function registerFonts(doc) {
  doc.registerFont(FONT, join(FONTS_DIR, "DejaVuSans.ttf"));
  doc.registerFont(FONT_BOLD, join(FONTS_DIR, "DejaVuSans-Bold.ttf"));
  doc.font(FONT);
}
import { getServerTier } from "../lib/premium.js";

const router = Router();
router.use(requireAuth, loadUser);

// ─── Helper: require Premium (active trials count as premium) ────────────────
async function requirePremium(req, res) {
  const { isPremium } = await getServerTier(req.params.serverId);
  if (!isPremium) {
    res.status(403).json({ error: "This export feature requires Premium" });
    return false;
  }
  return true;
}

// ─── Helper: CSV ред от обект ────────────────────────────────────────────────
function csvRow(row, columns) {
  return columns
    .map((c) => {
      const val = typeof c.value === "function" ? c.value(row) : row[c.key] ?? "";
      let s = String(val);
      // CSV formula-injection guard: a cell that a spreadsheet would treat as
      // a formula (starts with = + - @ tab or CR) is user-controlled here
      // (usernames, close reasons, answers), so prefix a single quote to neutralize it.
      if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
      return `"${s.replace(/"/g, '""')}"`;
    })
    .join(",");
}

// ─── СТРИЙМ, не един голям низ ───────────────────────────────────────────────
// Старата версия дърпаше ЦЯЛАТА таблица с `findMany` без `take`, после
// сглобяваше един низ и го подаваше на `res.send`. Три копия на всичко в
// паметта наведнъж (редове → масив низове → съединен низ). Сървър с 100k тикета
// (с join-натите съобщения) поваля процеса — и то през напълно легитимна,
// платена функция. Нищо не сочеше проблема: нито лимит, нито предупреждение.
//
// Сега вадим на партиди по курсор и пишем всяка партида веднага. Паметта е
// ограничена от партидата, а изтеглянето започва мигновено.
const CSV_BATCH = 1000;
// Таван — иначе една заявка може да държи връзка към базата с часове. Достигне
// ли се, казваме го В ФАЙЛА и в лога: тихо отрязан експорт изглежда като пълен.
const CSV_MAX_ROWS = 200_000;

/**
 * @param {object} o
 * @param {import("express").Response} o.res
 * @param {string} o.filename
 * @param {Array} o.columns
 * @param {(cursorId: string|null) => Promise<Array>} o.page  партида по курсор
 */
async function streamCsv({ res, filename, columns, page }) {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  // BOM за Excel + заглавен ред. След първия write вече НЕ можем да върнем
  // JSON грешка — затова цялата авторизация е приключила преди този ред.
  res.write("﻿" + columns.map((c) => `"${c.label}"`).join(",") + "\r\n");

  let cursor = null;
  let total = 0;
  for (;;) {
    const rows = await page(cursor);
    if (!rows.length) break;
    res.write(rows.map((r) => csvRow(r, columns)).join("\r\n") + "\r\n");
    total += rows.length;
    cursor = rows.at(-1).id;
    if (rows.length < CSV_BATCH) break;
    if (total >= CSV_MAX_ROWS) {
      // Видим ред във файла — не тих отказ.
      res.write(`"[TRUNCATED at ${CSV_MAX_ROWS} rows — contact support for a full export]"\r\n`);
      console.warn(`[export] ${filename}: отрязан на ${CSV_MAX_ROWS} реда`);
      break;
    }
    // Даваме въздух на event loop-а между партидите — при 200 партиди без това
    // маршрутът държи цикъла зает и всички други заявки чакат.
    await new Promise((r) => setImmediate(r));
  }
  res.end();
}

// ─── GET /api/export/:serverId/tickets ────────────────────────────────────────

router.get("/:serverId/tickets", requireServerAdmin, async (req, res, next) => {
  try {
    if (!(await requirePremium(req, res))) return;

    await streamCsv({
      res,
      filename: `tickets-${req.params.serverId}-${Date.now()}.csv`,
      columns: [
        { label: "Ticket ID",    key: "id" },
        { label: "Status",       key: "status" },
        { label: "Creator",      value: (r) => r.creator?.username ?? "" },
        { label: "Assigned To",  value: (r) => r.assignee?.username ?? "Unassigned" },
        { label: "Panel",        value: (r) => r.panel?.name ?? "" },
        { label: "Messages",     value: (r) => r._count.messages },
        { label: "Close Reason", key: "closeReason" },
        { label: "Opened At",    value: (r) => new Date(r.createdAt).toISOString() },
        { label: "Closed At",    value: (r) => r.closedAt ? new Date(r.closedAt).toISOString() : "" },
      ],
      // `id` \u0432\u044A\u0432 `orderBy` \u043D\u0435 \u0435 \u0443\u043A\u0440\u0430\u0441\u0430: `createdAt` \u043D\u0435 \u0435 \u0443\u043D\u0438\u043A\u0430\u043B\u0435\u043D \u0438 \u0431\u0435\u0437 \u043D\u0435\u0433\u043E
      // \u043A\u0443\u0440\u0441\u043E\u0440\u044A\u0442 \u043C\u043E\u0436\u0435 \u0434\u0430 \u043F\u0440\u0435\u0441\u043A\u043E\u0447\u0438 \u0438\u043B\u0438 \u043F\u043E\u0432\u0442\u043E\u0440\u0438 \u0440\u0435\u0434\u043E\u0432\u0435 \u043F\u0440\u0438 \u0435\u0434\u043D\u0430\u043A\u0432\u0438 \u0432\u0440\u0435\u043C\u0435\u043D\u0430.
      page: (cursor) => prisma.ticket.findMany({
        where: { serverId: req.params.serverId },
        include: {
          creator: { select: { username: true } },
          assignee: { select: { username: true } },
          panel: { select: { name: true } },
          _count: { select: { messages: true } },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: CSV_BATCH,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      }),
    });
  } catch (err) {
    // \u041F\u0440\u043E\u0432\u0430\u043B \u0421\u041B\u0415\u0414 \u043F\u044A\u0440\u0432\u0438\u044F write \u043D\u0435 \u043C\u043E\u0436\u0435 \u0434\u0430 \u0432\u044A\u0440\u043D\u0435 JSON \u2014 \u0437\u0430\u0433\u043B\u0430\u0432\u0438\u044F\u0442\u0430 \u0441\u0430 \u0442\u0440\u044A\u0433\u043D\u0430\u043B\u0438.
    // \u0421\u043A\u044A\u0441\u0432\u0430\u043C\u0435 \u0432\u0440\u044A\u0437\u043A\u0430\u0442\u0430, \u0437\u0430 \u0434\u0430 \u0432\u0438\u0434\u0438 \u043A\u043B\u0438\u0435\u043D\u0442\u044A\u0442 \u043D\u0435\u043F\u044A\u043B\u043D\u043E \u0438\u0437\u0442\u0435\u0433\u043B\u044F\u043D\u0435, \u0432\u043C\u0435\u0441\u0442\u043E \u0434\u0430
    // \u043F\u043E\u043B\u0443\u0447\u0438 \u043C\u044A\u043B\u0447\u0430\u043B\u0438\u0432\u043E \u043E\u0442\u0440\u044F\u0437\u0430\u043D \u0444\u0430\u0439\u043B, \u043A\u043E\u0439\u0442\u043E \u0438\u0437\u0433\u043B\u0435\u0436\u0434\u0430 \u043F\u044A\u043B\u0435\u043D.
    if (res.headersSent) {
      console.error("[export] \u043F\u0440\u043E\u0432\u0430\u043B \u043F\u043E \u0441\u0440\u0435\u0434\u0430\u0442\u0430 \u043D\u0430 \u0441\u0442\u0440\u0438\u0439\u043C\u0430:", err.message);
      return res.destroy(err);
    }
    next(err);
  }
});

// ─── GET /api/export/:serverId/applications ───────────────────────────────────

router.get("/:serverId/applications", requireServerAdmin, async (req, res, next) => {
  try {
    if (!(await requirePremium(req, res))) return;

    await streamCsv({
      res,
      filename: `applications-${req.params.serverId}-${Date.now()}.csv`,
      columns: [
        { label: "Application ID", key: "id" },
        { label: "Status",         key: "status" },
        { label: "Applicant",      value: (r) => r.user?.username ?? "" },
        { label: "Form",           value: (r) => r.form?.name ?? "" },
        { label: "Review Note",    key: "reviewNote" },
        { label: "Submitted At",   value: (r) => new Date(r.createdAt).toISOString() },
        { label: "Updated At",     value: (r) => new Date(r.updatedAt).toISOString() },
        // Flatten answers as a JSON column — cleaner than trying to map dynamic questions
        { label: "Answers (JSON)", value: (r) => JSON.stringify(r.answers) },
      ],
      page: (cursor) => prisma.application.findMany({
        where: { serverId: req.params.serverId },
        include: {
          form: { select: { name: true } },
          user: { select: { username: true } },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: CSV_BATCH,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      }),
    });
  } catch (err) {
    if (res.headersSent) {
      console.error("[export] провал по средата на стрийма:", err.message);
      return res.destroy(err);
    }
    next(err);
  }
});

// ─── GET /api/export/:serverId/ticket/:ticketId/pdf ──────────────────────────
// Generate a properly formatted PDF transcript for a single ticket.

router.get("/:serverId/ticket/:ticketId/pdf", requireServerAdmin, async (req, res, next) => {
  try {
    if (!(await requirePremium(req, res))) return;

    const ticket = await prisma.ticket.findFirst({
      where: { id: req.params.ticketId, serverId: req.params.serverId },
      include: {
        creator: { select: { username: true } },
        assignee: { select: { username: true } },
        messages: { orderBy: { createdAt: "asc" } },
        panel: { select: { name: true } },
        application: {
          include: { form: { include: { questions: { orderBy: { order: "asc" } } } } },
        },
      },
    });

    if (!ticket) return res.status(404).json({ error: "Ticket not found" });

    // ── Build PDF ─────────────────────────────────────────────────────────
    const doc = new PDFDocument({ margin: 40, size: "A4" });
    // Вградените в PDFKit шрифтове (Helvetica и др.) са AFM с WinAnsi кодиране —
    // те НЯМАТ кирилски глифи, затова българският текст излизаше празен/счупен.
    // Регистрираме TTF с кирилица; имената FONT/FONT_BOLD се ползват навсякъде
    // по-долу вместо литерала "Helvetica".
    registerFonts(doc);
    const filename = `ticket-${ticket.id}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    doc.pipe(res);

    const BLUE = "#5865f2";
    const GRAY = "#6b7280";
    const DARK = "#1f2937";

    // Header
    doc.rect(0, 0, doc.page.width, 80).fill(BLUE);
    doc.fill("white").fontSize(20).font(FONT_BOLD)
      .text("🎫 Ticket Archive", 40, 25);
    doc.fontSize(10).font(FONT)
      .text(`ID: ${ticket.id}`, 40, 52);

    doc.moveDown(3);

    // Meta grid
    const meta = [
      ["Opened",      new Date(ticket.createdAt).toLocaleString("en-US")],
      ["Closed",      ticket.closedAt ? new Date(ticket.closedAt).toLocaleString("en-US") : "—"],
      ["Creator",     ticket.creator?.username ?? "Unknown"],
      ["Assigned To", ticket.assignee?.username ?? "Unassigned"],
      ["Panel",       ticket.panel?.name ?? "—"],
      ["Status",      ticket.status],
    ];
    if (ticket.closeReason) meta.push(["Close Reason", ticket.closeReason]);

    doc.font(FONT_BOLD).fontSize(12).fill(DARK).text("Ticket Details");
    doc.moveDown(0.3);

    meta.forEach(([label, value]) => {
      doc.font(FONT_BOLD).fontSize(9).fill(GRAY).text(label.toUpperCase(), { continued: false });
      doc.font(FONT).fontSize(10).fill(DARK).text(String(value));
      doc.moveDown(0.2);
    });

    // Application transcript (if applicable)
    if (ticket.application) {
      doc.moveDown(0.5);
      doc.font(FONT_BOLD).fontSize(12).fill(DARK).text("Application Transcript");
      doc.moveDown(0.3);

      const answers = ticket.application.answers || {};
      (ticket.application.form?.questions || []).forEach((q) => {
        doc.font(FONT_BOLD).fontSize(9).fill(GRAY).text(q.label.toUpperCase());
        doc.font(FONT).fontSize(10).fill(DARK)
          .text(String(answers[q.id] || "—"), { width: 500 });
        doc.moveDown(0.3);
      });
    }

    // Messages
    doc.moveDown(0.5);
    doc.font(FONT_BOLD).fontSize(12).fill(DARK)
      .text(`Messages (${ticket.messages.length})`);
    doc.moveDown(0.3);

    if (ticket.messages.length === 0) {
      doc.font(FONT).fontSize(10).fill(GRAY).text("No messages recorded.");
    } else {
      ticket.messages.forEach((msg) => {
        const time = new Date(msg.createdAt).toLocaleString("en-US");
        // v36 — състоянието се пише до автора, а изтритото съобщение НЕ се
        // премълчава: одитният документ трябва да показва, че е било казано
        // и после махнато.
        const state = [msg.deletedAt ? "deleted" : null, msg.editedAt ? "edited" : null]
          .filter(Boolean).join(", ");
        doc.font(FONT_BOLD).fontSize(9).fill(BLUE).text(msg.authorTag, { continued: true });
        doc.font(FONT).fill(GRAY).text(`   ${time}${state ? `   [${state}]` : ""}`);
        doc.font(FONT).fontSize(10).fill(msg.deletedAt ? GRAY : DARK)
          .text(msg.content || "[attachment]", { width: 510, strike: Boolean(msg.deletedAt) });
        if (msg.editedAt && msg.originalContent) {
          doc.font(FONT).fontSize(9).fill(GRAY)
            .text(`Original: ${msg.originalContent}`, { width: 500, indent: 12 });
        }
        if (msg.attachments?.length) {
          msg.attachments.forEach((url) => {
            doc.font(FONT).fontSize(8).fill(BLUE).text(url, { link: url });
          });
        }
        doc.moveDown(0.4);
      });
    }

    // Footer
    doc.fontSize(8).fill(GRAY)
      .text(
        `Generated ${new Date().toLocaleString("en-US")} · Discord SaaS Bot Platform`,
        40,
        doc.page.height - 30,
        { align: "center" }
      );

    doc.end();
  } catch (err) {
    next(err);
  }
});

export default router;
