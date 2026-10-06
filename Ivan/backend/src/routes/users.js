"use strict";
// Потребители. ПИН-ът никога не излиза навън (пази се само bcrypt хешът).
// Само Супер Админ дава или взема ролята Супер Админ и пипа Супер Админ — иначе правото „Потребители“ би било
// стълба до пълен достъп. Никой не сменя собствената си роля и винаги остава поне един Супер Админ.
const express = require("express");
const v = require("../validate");
const { hashPin } = require("../security");
const { requirePerm, isSuper, addAudit } = require("../access");

const SELECT = { id: true, nome: true, email: true, ruolo: true, createdAt: true };

module.exports = function userRoutes({ prisma }) {
  const r = express.Router();
  r.use(requirePerm(prisma, "canManageUsers"));

  const roleExists = async (id) => Boolean(await prisma.role.findUnique({ where: { id } }));
  const supers = () => prisma.user.count({ where: { ruolo: "SUPER_ADMIN" } });

  r.get("/", async (_req, res, next) => {
    try {
      res.json(await prisma.user.findMany({ select: SELECT, orderBy: { createdAt: "asc" } }));
    } catch (err) {
      next(err);
    }
  });

  r.post("/", async (req, res, next) => {
    try {
      const body = v.parseBody(v.userCreate, req, res);
      if (!body) return;
      if (!(await roleExists(body.ruolo))) return res.status(400).json({ error: "Няма такава роля" });
      if (body.ruolo === "SUPER_ADMIN" && !isSuper(req)) {
        return res.status(403).json({ error: "Само Супер Админ дава тази роля" });
      }
      const u = await prisma.user.create({
        data: { nome: body.nome, email: body.email, ruolo: body.ruolo, pin: await hashPin(body.pin) },
        select: SELECT,
      });
      await addAudit(prisma, req.user, "USER_CREATED", `Създаден ${u.nome}`, `Роля:${u.ruolo}`);
      res.json(u);
    } catch (err) {
      if (err.code === "P2002") return res.status(400).json({ error: "Имейлът съществува" });
      next(err);
    }
  });

  r.put("/:id", async (req, res, next) => {
    try {
      const body = v.parseBody(v.userUpdate, req, res);
      if (!body) return;
      const target = await prisma.user.findUnique({ where: { id: req.params.id } });
      if (!target) return res.status(404).json({ error: "Не е намерен" });
      if (!(await roleExists(body.ruolo))) return res.status(400).json({ error: "Няма такава роля" });
      const touchesSuper = target.ruolo === "SUPER_ADMIN" || body.ruolo === "SUPER_ADMIN";
      if (touchesSuper && !isSuper(req)) return res.status(403).json({ error: "Само Супер Админ променя Супер Админ" });
      if (target.id === req.user.id && body.ruolo !== target.ruolo) {
        return res.status(400).json({ error: "Не можеш да смениш собствената си роля" });
      }
      if (target.ruolo === "SUPER_ADMIN" && body.ruolo !== "SUPER_ADMIN" && (await supers()) <= 1) {
        return res.status(400).json({ error: "Трябва да остане поне един Супер Админ" });
      }
      const data = { nome: body.nome, email: body.email, ruolo: body.ruolo };
      if (body.pin) data.pin = await hashPin(body.pin); // новият ПИН прекратява всички сесии на човека
      const u = await prisma.user.update({ where: { id: target.id }, data, select: SELECT });
      await addAudit(prisma, req.user, "USER_EDITED", `Ред. ${u.nome}`, `Роля:${u.ruolo}${body.pin ? "; нов ПИН" : ""}`);
      res.json(u);
    } catch (err) {
      if (err.code === "P2002") return res.status(400).json({ error: "Имейлът съществува" });
      next(err);
    }
  });

  r.delete("/:id", async (req, res, next) => {
    try {
      if (req.params.id === req.user.id) return res.status(400).json({ error: "Не можеш себе си" });
      const u = await prisma.user.findUnique({ where: { id: req.params.id } });
      if (!u) return res.status(404).json({ error: "Не е намерен" });
      if (u.ruolo === "SUPER_ADMIN" && !isSuper(req)) {
        return res.status(403).json({ error: "Само Супер Админ трие Супер Админ" });
      }
      await prisma.user.delete({ where: { id: u.id } });
      await addAudit(prisma, req.user, "USER_DELETED", `Изтрит ${u.nome}`, "");
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  return r;
};
