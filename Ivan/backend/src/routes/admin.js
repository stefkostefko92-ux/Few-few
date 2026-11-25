"use strict";
// Одит, известия и настройки. Одитът се трие само от Супер Админ и самото триене остава в него.
const express = require("express");
const v = require("../validate");
const { getRole, requirePerm, isSuper, addAudit } = require("../access");

module.exports = function adminRoutes({ prisma }) {
  const r = express.Router();
  const auditOnly = requirePerm(prisma, "canAudit");

  r.get("/audit", async (req, res, next) => {
    try {
      const role = await getRole(prisma, req.user.ruolo);
      if (!role.canAudit) return res.json([]);
      const filter = typeof req.query.filter === "string" ? req.query.filter.slice(0, 40) : "ALL";
      const where = filter && filter !== "ALL" ? { action: filter } : {};
      res.json(await prisma.auditLog.findMany({ where, orderBy: { timestamp: "desc" }, take: 500 }));
    } catch (err) {
      next(err);
    }
  });

  r.delete("/audit", auditOnly, async (req, res, next) => {
    try {
      if (!isSuper(req)) return res.status(403).json({ error: "Само Супер Админ трие одита" });
      const { count } = await prisma.auditLog.deleteMany({});
      await addAudit(prisma, req.user, "AUDIT_CLEARED", "Одитът е изчистен", `Изтрити записи: ${count}`);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  r.get("/notifications", async (req, res, next) => {
    try {
      const role = await getRole(prisma, req.user.ruolo);
      if (!role.canAudit) return res.json([]);
      res.json(await prisma.notification.findMany({ orderBy: { timestamp: "desc" }, take: 100 }));
    } catch (err) {
      next(err);
    }
  });

  r.put("/notifications/read", auditOnly, async (_req, res, next) => {
    try {
      await prisma.notification.updateMany({ where: { read: false }, data: { read: true } });
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  r.delete("/notifications", auditOnly, async (_req, res, next) => {
    try {
      await prisma.notification.deleteMany({});
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  r.get("/settings", async (req, res, next) => {
    try {
      const role = await getRole(prisma, req.user.ruolo);
      if (!role.canSettings) return res.json({});
      const s = await prisma.settings.upsert({ where: { id: "singleton" }, update: {}, create: { id: "singleton" } });
      res.json(s);
    } catch (err) {
      next(err);
    }
  });

  r.put("/settings", requirePerm(prisma, "canSettings"), async (req, res, next) => {
    try {
      const body = v.parseBody(v.settings, req, res);
      if (!body) return;
      res.json(await prisma.settings.upsert({ where: { id: "singleton" }, update: body, create: { id: "singleton", ...body } }));
    } catch (err) {
      next(err);
    }
  });

  return r;
};
