"use strict";
// Вход с имейл и ПИН. Един и същ отговор за непознат имейл и грешен ПИН; списък с потребители няма.
const express = require("express");
const v = require("../validate");
const { verifyPin, issueSession, clearSession, requireUser } = require("../security");
const { addAudit } = require("../access");

const publicUser = (u) => ({ id: u.id, nome: u.nome, email: u.email, ruolo: u.ruolo });

module.exports = function authRoutes({ prisma, config, limiter }) {
  const r = express.Router();

  r.post("/login", async (req, res, next) => {
    try {
      const body = v.parseBody(v.login, req, res);
      if (!body) return;
      const gate = limiter.check(body.email, req.ip);
      if (!gate.ok) {
        res.set("Retry-After", String(gate.retryAfterSec));
        const minutes = Math.ceil(gate.retryAfterSec / 60);
        return res.status(429).json({ error: `Твърде много опити. Опитай пак след ${minutes} мин.` });
      }
      const user = await prisma.user.findFirst({ where: { email: { equals: body.email, mode: "insensitive" } } });
      const ok = await verifyPin(body.pin, user ? user.pin : null);
      if (!user || !ok) {
        limiter.fail(body.email, req.ip);
        return res.status(401).json({ error: "Грешен имейл или ПИН" });
      }
      limiter.succeed(body.email);
      issueSession(res, user, config);
      await addAudit(prisma, user, "LOGIN", `${user.nome} влезе`, user.ruolo);
      res.json({ user: publicUser(user) });
    } catch (err) {
      next(err);
    }
  });

  r.post("/logout", (_req, res) => {
    clearSession(res, config);
    res.json({ ok: true });
  });

  r.get("/me", requireUser({ prisma, config }), (req, res) => res.json(req.user));

  return r;
};
