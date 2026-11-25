"use strict";
// Роли. Право, което нямаш, не можеш да дадеш на никоя роля (иначе „Настройки“ става „всичко“);
// Супер Админ не се пипа, а връщането на вградените роли по подразбиране е само за Супер Админ.
const express = require("express");
const v = require("../validate");
const { requirePerm, isSuper, addAudit } = require("../access");

const BUILTIN = [
  { id: "SUPER_ADMIN", label: "Супер Админ", canEdit: true, canDelete: true, canCreate: true, canOrder: true, canSeePrice: true, canManageUsers: true, canAudit: true, canSettings: true, isBuiltin: true },
  { id: "ADMIN", label: "Админ", canEdit: true, canDelete: true, canCreate: true, canOrder: true, canSeePrice: true, canManageUsers: false, canAudit: false, canSettings: false, isBuiltin: true },
  { id: "VIEWER_PRICE", label: "Преглед (с цена)", canEdit: false, canDelete: false, canCreate: false, canOrder: false, canSeePrice: true, canManageUsers: false, canAudit: false, canSettings: false, isBuiltin: true },
  { id: "VIEWER", label: "Преглед", canEdit: false, canDelete: false, canCreate: false, canOrder: false, canSeePrice: false, canManageUsers: false, canAudit: false, canSettings: false, isBuiltin: true },
];

/** Правата, които заявката дава, а ролята на действащия няма. Празно = наред. */
const beyondOwn = (req, body) => (isSuper(req) ? [] : v.PERMS.filter((p) => body[p] && !req.role[p]));

module.exports = function roleRoutes({ prisma }) {
  const r = express.Router();
  const settingsOnly = requirePerm(prisma, "canSettings");

  r.get("/", async (_req, res, next) => {
    try {
      const list = await prisma.role.findMany({ orderBy: { id: "asc" } });
      const out = {};
      for (const { id, ...role } of list) out[id] = role;
      res.json(out);
    } catch (err) {
      next(err);
    }
  });

  r.post("/", settingsOnly, async (req, res, next) => {
    try {
      const body = v.parseBody(v.roleCreate, req, res);
      if (!body) return;
      if (beyondOwn(req, body).length) return res.status(403).json({ error: "Не можеш да дадеш право, което нямаш" });
      const role = await prisma.role.create({ data: { ...body, isBuiltin: false } });
      await addAudit(prisma, req.user, "ROLE_CREATED", `Роля ${role.label}`, role.id);
      res.json(role);
    } catch (err) {
      if (err.code === "P2002") return res.status(400).json({ error: "Ролята вече съществува" });
      next(err);
    }
  });

  r.put("/:id", settingsOnly, async (req, res, next) => {
    try {
      if (req.params.id === "SUPER_ADMIN") return res.status(400).json({ error: "Супер Админ не се променя" });
      const body = v.parseBody(v.roleUpdate, req, res);
      if (!body) return;
      if (beyondOwn(req, body).length) return res.status(403).json({ error: "Не можеш да дадеш право, което нямаш" });
      if (!(await prisma.role.findUnique({ where: { id: req.params.id } }))) {
        return res.status(404).json({ error: "Не е намерена" });
      }
      const role = await prisma.role.update({ where: { id: req.params.id }, data: body });
      await addAudit(prisma, req.user, "ROLE_EDITED", `Роля ${role.label}`, role.id);
      res.json(role);
    } catch (err) {
      next(err);
    }
  });

  r.delete("/:id", settingsOnly, async (req, res, next) => {
    try {
      const role = await prisma.role.findUnique({ where: { id: req.params.id } });
      if (!role) return res.status(404).json({ error: "Не е намерена" });
      if (role.isBuiltin) return res.status(400).json({ error: "Вградена роля" });
      const cnt = await prisma.user.count({ where: { ruolo: role.id } });
      if (cnt > 0) return res.status(400).json({ error: `Използва се от ${cnt} потребител(и)` });
      await prisma.role.delete({ where: { id: role.id } });
      await addAudit(prisma, req.user, "ROLE_DELETED", `Изтрита ${role.label}`, role.id);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  r.post("/reset", settingsOnly, async (req, res, next) => {
    try {
      if (!isSuper(req)) return res.status(403).json({ error: "Само Супер Админ връща ролите по подразбиране" });
      const customs = await prisma.role.findMany({ where: { isBuiltin: false } });
      for (const c of customs) {
        if ((await prisma.user.count({ where: { ruolo: c.id } })) === 0) await prisma.role.delete({ where: { id: c.id } });
      }
      for (const d of BUILTIN) await prisma.role.upsert({ where: { id: d.id }, update: d, create: d });
      await addAudit(prisma, req.user, "ROLES_RESET", "Ролите по подразбиране", "");
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  return r;
};

module.exports.BUILTIN = BUILTIN;
