"use strict";
// Вход с имейл и ПИН. Един и същ отговор за непознат имейл и грешен ПИН; списък с потребители няма.
// Имейлите са с малки букви (zod при вход и запис, seed.js за старите) и се търсят ТОЧНО: търсене без
// значение на регистъра в PostgreSQL е ILIKE, където `_` и `%` са заместители — `_dmin@…` намираше
// `admin@…` и всеки такъв вариант получаваше свои 5 опита. Заключването е по акаунта, не по низа.
const express = require("express");
const v = require("../validate");
const { verifyPin, hashPin, issueSession, clearSession, requireUser } = require("../security");
const { addAudit } = require("../access");

const publicUser = (u) => ({ id: u.id, nome: u.nome, email: u.email, ruolo: u.ruolo });
const STRONG_PIN = 6; // по-кратък ПИН (отпреди) пуска само до смяната му

module.exports = function authRoutes({ prisma, config, limiter }) {
  const r = express.Router();

  function locked(res, gate) {
    res.set("Retry-After", String(gate.retryAfterSec));
    const minutes = Math.ceil(gate.retryAfterSec / 60);
    return res.status(429).json({ error: `Твърде много опити. Опитай пак след ${minutes} мин.` });
  }

  r.post("/login", async (req, res, next) => {
    try {
      const body = v.parseBody(v.login, req, res);
      if (!body) return;
      const user = await prisma.user.findUnique({ where: { email: body.email } });
      const key = user ? `u:${user.id}` : `e:${body.email}`;
      const gate = limiter.check(key, req.ip);
      if (!gate.ok) return locked(res, gate);
      const ok = await verifyPin(body.pin, user ? user.pin : null);
      if (!user || !ok) {
        limiter.fail(key, req.ip);
        return res.status(401).json({ error: "Грешен имейл или ПИН" });
      }
      limiter.succeed(key);
      const weak = body.pin.length < STRONG_PIN;
      issueSession(res, user, config, { weak });
      await addAudit(prisma, user, "LOGIN", `${user.nome} влезе`, user.ruolo);
      res.json({ user: publicUser(user), pinChangeRequired: weak });
    } catch (err) {
      next(err);
    }
  });

  // Смяна на собствения ПИН (и задължителната след вход със стар 4-цифрен). Новият ПИН прекратява
  // всички стари сесии на човека; тази получава нова, вече без ограничението.
  r.post("/pin", requireUser({ prisma, config, allowWeak: true }), async (req, res, next) => {
    try {
      const body = v.parseBody(v.pinChange, req, res);
      if (!body) return;
      const key = `u:${req.user.id}`;
      const gate = limiter.check(key, req.ip);
      if (!gate.ok) return locked(res, gate);
      const user = await prisma.user.findUnique({ where: { id: req.user.id } });
      if (!user) return res.status(401).json({ error: "Сесията е прекратена" });
      if (!(await verifyPin(body.currentPin, user.pin))) {
        limiter.fail(key, req.ip);
        return res.status(401).json({ error: "Сегашният ПИН не е верен" });
      }
      limiter.succeed(key);
      if (body.newPin === body.currentPin) return res.status(400).json({ error: "Новият ПИН трябва да е различен" });
      const updated = await prisma.user.update({ where: { id: user.id }, data: { pin: await hashPin(body.newPin) } });
      issueSession(res, updated, config);
      await addAudit(prisma, updated, "PIN_CHANGED", `${updated.nome} смени ПИН-а си`, "");
      res.json({ user: publicUser(updated), pinChangeRequired: false });
    } catch (err) {
      next(err);
    }
  });

  r.post("/logout", (_req, res) => {
    clearSession(res, config);
    res.json({ ok: true });
  });

  r.get("/me", requireUser({ prisma, config, allowWeak: true }), (req, res) => res.json(req.user));

  return r;
};
