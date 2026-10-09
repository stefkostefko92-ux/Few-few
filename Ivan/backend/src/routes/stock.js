"use strict";
// Артикули и поръчки. Цената се вижда и пипа само с право „Виж цена“; количеството не става отрицателно.
const express = require("express");
const v = require("../validate");
const { HttpError, getRole, requirePerm, addAudit } = require("../access");

module.exports = function stockRoutes({ prisma }) {
  const r = express.Router();

  r.get("/parts", async (req, res, next) => {
    try {
      const role = await getRole(prisma, req.user.ruolo);
      const parts = await prisma.part.findMany({ orderBy: { codice: "asc" } });
      if (!role.canSeePrice) parts.forEach((p) => (p.prezzo = 0));
      res.json(parts);
    } catch (err) {
      next(err);
    }
  });

  r.post("/parts", requirePerm(prisma, "canCreate"), async (req, res, next) => {
    try {
      const body = v.parseBody(v.part, req, res);
      if (!body) return;
      if (!req.role.canSeePrice) body.prezzo = 0;
      const part = await prisma.part.create({ data: body });
      await addAudit(prisma, req.user, "PART_ADDED", `Добавен ${part.codice} (${part.marchio})`, `К/Т:${part.riferimento} Кол:${part.quantita}`);
      res.json(part);
    } catch (err) {
      next(err);
    }
  });

  r.put("/parts/:id", requirePerm(prisma, "canEdit"), async (req, res, next) => {
    try {
      const body = v.parseBody(v.part, req, res);
      if (!body) return;
      const old = await prisma.part.findUnique({ where: { id: req.params.id } });
      if (!old) return res.status(404).json({ error: "Не е намерен" });
      // Без право за цена клиентът вижда 0 — без това правило запазването би занулило истинската цена.
      if (!req.role.canSeePrice) body.prezzo = old.prezzo;
      const part = await prisma.part.update({ where: { id: old.id }, data: body });
      const ch = [];
      if (old.codice !== part.codice) ch.push(`Код:${old.codice}→${part.codice}`);
      if (old.quantita !== part.quantita) ch.push(`Кол:${old.quantita}→${part.quantita}`);
      if (old.prezzo !== part.prezzo) ch.push(`Цена:${old.prezzo}→${part.prezzo}`);
      await addAudit(prisma, req.user, "PART_EDITED", `Редакт. ${part.codice}`, ch.join("; ") || "—");
      res.json(part);
    } catch (err) {
      next(err);
    }
  });

  r.delete("/parts/:id", requirePerm(prisma, "canDelete"), async (req, res, next) => {
    try {
      const p = await prisma.part.findUnique({ where: { id: req.params.id } });
      if (!p) return res.status(404).json({ error: "Не е намерен" });
      await prisma.part.delete({ where: { id: p.id } });
      await addAudit(prisma, req.user, "PART_DELETED", `Изтрит ${p.codice}`, p.marchio);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  r.get("/orders", async (req, res, next) => {
    try {
      const role = await getRole(prisma, req.user.ruolo);
      const orders = await prisma.order.findMany({ include: { items: true }, orderBy: { data: "desc" } });
      if (!role.canSeePrice) {
        orders.forEach((o) => {
          o.totale = 0;
          o.items.forEach((i) => (i.prezzo = 0));
        });
      }
      res.json(orders);
    } catch (err) {
      next(err);
    }
  });

  // Наличността се сваля с условие „остават поне толкова“ в същата транзакция: две едновременни поръчки
  // не могат да продадат повече, отколкото има, а еднакъв артикул на два реда се брои веднъж.
  r.post("/orders", requirePerm(prisma, "canOrder"), async (req, res, next) => {
    try {
      const body = v.parseBody(v.order, req, res);
      if (!body) return;
      const wanted = new Map();
      for (const it of body.items) wanted.set(it.partId, (wanted.get(it.partId) || 0) + it.qty);
      const orderId = "ORD-" + Date.now().toString(36).toUpperCase();
      const order = await prisma.$transaction(async (tx) => {
        let totale = 0;
        const items = [];
        for (const [partId, qty] of wanted) {
          const p = await tx.part.findUnique({ where: { id: partId } });
          if (!p) throw new HttpError(400, "Артикул не съществува");
          const taken = await tx.part.updateMany({
            where: { id: partId, quantita: { gte: qty } },
            data: { quantita: { decrement: qty } },
          });
          if (taken.count !== 1) throw new HttpError(409, `Недостатъчно: ${p.codice}`);
          totale += p.prezzo * qty;
          items.push({ partId: p.id, codice: p.codice, marchio: p.marchio, tipo: p.tipo || "", tipoValue: p.tipoValue || "", riferimento: p.riferimento, qty, prezzo: p.prezzo });
        }
        return tx.order.create({
          data: { orderId, operatore: req.user.nome, clientName: body.clientName, clientPhone: body.clientPhone, note: body.note, totale, items: { create: items } },
          include: { items: true },
        });
      });
      await addAudit(prisma, req.user, "ORDER_PLACED", `Поръчка ${orderId} за ${body.clientName}`, order.items.map((i) => `${i.codice}x${i.qty}`).join(", "));
      if (!req.role.canSeePrice) {
        order.totale = 0;
        order.items.forEach((i) => (i.prezzo = 0));
      }
      res.json(order);
    } catch (err) {
      next(err);
    }
  });

  return r;
};
