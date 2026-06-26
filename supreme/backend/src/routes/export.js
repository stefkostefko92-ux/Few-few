// backend/src/routes/export.js
// Premium export endpoints: CSV for tickets/applications, PDF for individual tickets.

import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth, loadUser, requireServerAdmin } from "../middleware/auth.js";
import PDFDocument from "pdfkit";
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

// ─── Helper: build CSV string from array of objects ──────────────────────────
function toCSV(rows, columns) {
  const header = columns.map((c) => `"${c.label}"`).join(",");
  const lines = rows.map((row) =>
    columns
      .map((c) => {
        const val = typeof c.value === "function" ? c.value(row) : row[c.key] ?? "";
        return `"${String(val).replace(/"/g, '""')}"`;
      })
      .join(",")
  );
  return [header, ...lines].join("\r\n");
}

// ─── GET /api/export/:serverId/tickets ────────────────────────────────────────

router.get("/:serverId/tickets", requireServerAdmin, async (req, res, next) => {
  try {
    if (!(await requirePremium(req, res))) return;

    const tickets = await prisma.ticket.findMany({
      where: { serverId: req.params.serverId },
      include: {
        creator: { select: { username: true } },
        assignee: { select: { username: true } },
        panel: { select: { name: true } },
        _count: { select: { messages: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const csv = toCSV(tickets, [
      { label: "Ticket ID",    key: "id" },
      { label: "Status",       key: "status" },
      { label: "Creator",      value: (r) => r.creator?.username ?? "" },
      { label: "Assigned To",  value: (r) => r.assignee?.username ?? "Unassigned" },
      { label: "Panel",        value: (r) => r.panel?.name ?? "" },
      { label: "Messages",     value: (r) => r._count.messages },
      { label: "Close Reason", key: "closeReason" },
      { label: "Opened At",    value: (r) => new Date(r.createdAt).toISOString() },
      { label: "Closed At",    value: (r) => r.closedAt ? new Date(r.closedAt).toISOString() : "" },
    ]);

    const filename = `tickets-${req.params.serverId}-${Date.now()}.csv`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send("\uFEFF" + csv); // BOM for Excel UTF-8 compatibility
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/export/:serverId/applications ───────────────────────────────────

router.get("/:serverId/applications", requireServerAdmin, async (req, res, next) => {
  try {
    if (!(await requirePremium(req, res))) return;

    const applications = await prisma.application.findMany({
      where: { serverId: req.params.serverId },
      include: {
        form: { select: { name: true } },
        user: { select: { username: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const csv = toCSV(applications, [
      { label: "Application ID", key: "id" },
      { label: "Status",         key: "status" },
      { label: "Applicant",      value: (r) => r.user?.username ?? "" },
      { label: "Form",           value: (r) => r.form?.name ?? "" },
      { label: "Review Note",    key: "reviewNote" },
      { label: "Submitted At",   value: (r) => new Date(r.createdAt).toISOString() },
      { label: "Updated At",     value: (r) => new Date(r.updatedAt).toISOString() },
      // Flatten answers as a JSON column — cleaner than trying to map dynamic questions
      { label: "Answers (JSON)", value: (r) => JSON.stringify(r.answers) },
    ]);

    const filename = `applications-${req.params.serverId}-${Date.now()}.csv`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send("\uFEFF" + csv);
  } catch (err) {
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
    const filename = `ticket-${ticket.id}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    doc.pipe(res);

    const BLUE = "#5865f2";
    const GRAY = "#6b7280";
    const DARK = "#1f2937";

    // Header
    doc.rect(0, 0, doc.page.width, 80).fill(BLUE);
    doc.fill("white").fontSize(20).font("Helvetica-Bold")
      .text("🎫 Ticket Archive", 40, 25);
    doc.fontSize(10).font("Helvetica")
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

    doc.font("Helvetica-Bold").fontSize(12).fill(DARK).text("Ticket Details");
    doc.moveDown(0.3);

    meta.forEach(([label, value]) => {
      doc.font("Helvetica-Bold").fontSize(9).fill(GRAY).text(label.toUpperCase(), { continued: false });
      doc.font("Helvetica").fontSize(10).fill(DARK).text(String(value));
      doc.moveDown(0.2);
    });

    // Application transcript (if applicable)
    if (ticket.application) {
      doc.moveDown(0.5);
      doc.font("Helvetica-Bold").fontSize(12).fill(DARK).text("Application Transcript");
      doc.moveDown(0.3);

      const answers = ticket.application.answers || {};
      (ticket.application.form?.questions || []).forEach((q) => {
        doc.font("Helvetica-Bold").fontSize(9).fill(GRAY).text(q.label.toUpperCase());
        doc.font("Helvetica").fontSize(10).fill(DARK)
          .text(String(answers[q.id] || "—"), { width: 500 });
        doc.moveDown(0.3);
      });
    }

    // Messages
    doc.moveDown(0.5);
    doc.font("Helvetica-Bold").fontSize(12).fill(DARK)
      .text(`Messages (${ticket.messages.length})`);
    doc.moveDown(0.3);

    if (ticket.messages.length === 0) {
      doc.font("Helvetica").fontSize(10).fill(GRAY).text("No messages recorded.");
    } else {
      ticket.messages.forEach((msg) => {
        const time = new Date(msg.createdAt).toLocaleString("en-US");
        doc.font("Helvetica-Bold").fontSize(9).fill(BLUE).text(msg.authorTag, { continued: true });
        doc.font("Helvetica").fill(GRAY).text(`   ${time}`);
        doc.font("Helvetica").fontSize(10).fill(DARK)
          .text(msg.content || "[attachment]", { width: 510 });
        if (msg.attachments?.length) {
          msg.attachments.forEach((url) => {
            doc.font("Helvetica").fontSize(8).fill(BLUE).text(url, { link: url });
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
