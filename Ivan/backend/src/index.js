const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const app = express();
const PORT = process.env.PORT || 4000;
const SECRET = process.env.JWT_SECRET || "dev-secret";

app.use(cors());
app.use(express.json());

async function getRolePerms(ruolo) {
  return (await prisma.role.findUnique({ where: { id: ruolo } })) || {};
}

function auth(req, res, next) {
  const h = req.headers.authorization;
  if (!h || !h.startsWith("Bearer ")) return res.status(401).json({ error: "Не си влязъл" });
  try { req.user = jwt.verify(h.slice(7), SECRET); next(); }
  catch { return res.status(401).json({ error: "Невалиден токен" }); }
}

async function requirePerm(req, res, perm) {
  const role = await getRolePerms(req.user.ruolo);
  if (!role[perm]) { res.status(403).json({ error: "Нямаш достъп" }); return false; }
  return true;
}

async function addAudit(user, action, description, details = "") {
  const d = { userId: user.id, userName: user.nome, userRole: user.ruolo, action, description, details };
  await prisma.auditLog.create({ data: d });
  if (user.ruolo !== "SUPER_ADMIN") await prisma.notification.create({ data: { ...d, read: false } });
}

// ═══ AUTH ═══
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, pin } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || user.pin !== pin) return res.status(401).json({ error: "Грешен ПИН" });
    const token = jwt.sign({ id: user.id, nome: user.nome, email: user.email, ruolo: user.ruolo }, SECRET, { expiresIn: "7d" });
    await addAudit(user, "LOGIN", `${user.nome} влезе`, user.ruolo);
    res.json({ token, user: { id: user.id, nome: user.nome, email: user.email, ruolo: user.ruolo } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/auth/me", auth, async (req, res) => {
  try {
    const u = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!u) return res.status(404).json({ error: "Не съществува" });
    res.json({ id: u.id, nome: u.nome, email: u.email, ruolo: u.ruolo });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/auth/users", async (_req, res) => {
  try { res.json(await prisma.user.findMany({ select: { id: true, nome: true, email: true, ruolo: true } })); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══ ROLES ═══
app.get("/api/roles", auth, async (_req, res) => {
  try {
    const list = await prisma.role.findMany({ orderBy: { id: "asc" } });
    const obj = {};
    for (const r of list) obj[r.id] = { label:r.label, canEdit:r.canEdit, canDelete:r.canDelete, canCreate:r.canCreate, canOrder:r.canOrder, canSeePrice:r.canSeePrice, canManageUsers:r.canManageUsers, canAudit:r.canAudit, canSettings:r.canSettings, isBuiltin:r.isBuiltin };
    res.json(obj);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/roles", auth, async (req, res) => {
  if (!(await requirePerm(req, res, "canSettings"))) return;
  try {
    const { id, label, canEdit, canDelete, canCreate, canOrder, canSeePrice, canManageUsers, canAudit, canSettings } = req.body;
    if (!id || !label) return res.status(400).json({ error: "Липсва ID или име" });
    const role = await prisma.role.create({ data: { id, label, canEdit:!!canEdit, canDelete:!!canDelete, canCreate:!!canCreate, canOrder:!!canOrder, canSeePrice:!!canSeePrice, canManageUsers:!!canManageUsers, canAudit:!!canAudit, canSettings:!!canSettings, isBuiltin:false } });
    await addAudit(req.user, "ROLE_CREATED", `Роля ${label}`, id);
    res.json(role);
  } catch (e) {
    if (e.code === "P2002") return res.status(400).json({ error: "Ролята вече съществува" });
    res.status(500).json({ error: e.message });
  }
});

app.put("/api/roles/:id", auth, async (req, res) => {
  if (!(await requirePerm(req, res, "canSettings"))) return;
  try {
    if (req.params.id === "SUPER_ADMIN") return res.status(400).json({ error: "Супер Админ не се променя" });
    const { label, canEdit, canDelete, canCreate, canOrder, canSeePrice, canManageUsers, canAudit, canSettings } = req.body;
    res.json(await prisma.role.update({ where: { id: req.params.id }, data: { label, canEdit:!!canEdit, canDelete:!!canDelete, canCreate:!!canCreate, canOrder:!!canOrder, canSeePrice:!!canSeePrice, canManageUsers:!!canManageUsers, canAudit:!!canAudit, canSettings:!!canSettings } }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete("/api/roles/:id", auth, async (req, res) => {
  if (!(await requirePerm(req, res, "canSettings"))) return;
  try {
    const role = await prisma.role.findUnique({ where: { id: req.params.id } });
    if (!role) return res.status(404).json({ error: "Не е намерена" });
    if (role.isBuiltin) return res.status(400).json({ error: "Вградена роля" });
    const cnt = await prisma.user.count({ where: { ruolo: req.params.id } });
    if (cnt > 0) return res.status(400).json({ error: `Използва се от ${cnt} потребител(и)` });
    await prisma.role.delete({ where: { id: req.params.id } });
    await addAudit(req.user, "ROLE_DELETED", `Изтрита ${role.label}`, req.params.id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/roles/reset", auth, async (req, res) => {
  if (!(await requirePerm(req, res, "canSettings"))) return;
  try {
    const customs = await prisma.role.findMany({ where: { isBuiltin: false } });
    for (const c of customs) { if ((await prisma.user.count({ where: { ruolo: c.id } })) === 0) await prisma.role.delete({ where: { id: c.id } }); }
    const defs = [
      { id:"SUPER_ADMIN", label:"Супер Админ", canEdit:true,canDelete:true,canCreate:true,canOrder:true,canSeePrice:true,canManageUsers:true,canAudit:true,canSettings:true,isBuiltin:true },
      { id:"ADMIN", label:"Админ", canEdit:true,canDelete:true,canCreate:true,canOrder:true,canSeePrice:true,canManageUsers:false,canAudit:false,canSettings:false,isBuiltin:true },
      { id:"VIEWER_PRICE", label:"Преглед (с цена)", canEdit:false,canDelete:false,canCreate:false,canOrder:false,canSeePrice:true,canManageUsers:false,canAudit:false,canSettings:false,isBuiltin:true },
      { id:"VIEWER", label:"Преглед", canEdit:false,canDelete:false,canCreate:false,canOrder:false,canSeePrice:false,canManageUsers:false,canAudit:false,canSettings:false,isBuiltin:true },
    ];
    for (const d of defs) await prisma.role.upsert({ where:{id:d.id}, update:d, create:d });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══ PARTS ═══
app.get("/api/parts", auth, async (req, res) => {
  try {
    const role = await getRolePerms(req.user.ruolo);
    const parts = await prisma.part.findMany({ orderBy: { codice: "asc" } });
    if (!role.canSeePrice) parts.forEach(p => { p.prezzo = 0; });
    res.json(parts);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/parts", auth, async (req, res) => {
  if (!(await requirePerm(req, res, "canCreate"))) return;
  try {
    const { codice, marchio, tipo, tipoValue, riferimento, quantita, prezzo, note } = req.body;
    const part = await prisma.part.create({ data: { codice, marchio, tipo:tipo||"", tipoValue:tipoValue||"", riferimento, quantita:quantita||0, prezzo:prezzo||0, note:note||"" } });
    await addAudit(req.user, "PART_ADDED", `Добавен ${codice} (${marchio})`, `К/Т:${riferimento} Кол:${quantita}`);
    res.json(part);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put("/api/parts/:id", auth, async (req, res) => {
  if (!(await requirePerm(req, res, "canEdit"))) return;
  try {
    const old = await prisma.part.findUnique({ where: { id: req.params.id } });
    if (!old) return res.status(404).json({ error: "Не е намерен" });
    const { codice, marchio, tipo, tipoValue, riferimento, quantita, prezzo, note } = req.body;
    const part = await prisma.part.update({ where:{id:req.params.id}, data:{ codice, marchio, tipo:tipo||"", tipoValue:tipoValue||"", riferimento, quantita, prezzo, note:note||"" } });
    const ch = [];
    if (old.codice!==codice) ch.push(`Код:${old.codice}→${codice}`);
    if (old.quantita!==quantita) ch.push(`Кол:${old.quantita}→${quantita}`);
    if (old.prezzo!==prezzo) ch.push(`Цена:${old.prezzo}→${prezzo}`);
    await addAudit(req.user, "PART_EDITED", `Редакт. ${codice}`, ch.join("; ")||"—");
    res.json(part);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete("/api/parts/:id", auth, async (req, res) => {
  if (!(await requirePerm(req, res, "canDelete"))) return;
  try {
    const p = await prisma.part.findUnique({ where: { id: req.params.id } });
    if (!p) return res.status(404).json({ error: "Не е намерен" });
    await prisma.part.delete({ where: { id: req.params.id } });
    await addAudit(req.user, "PART_DELETED", `Изтрит ${p.codice}`, p.marchio);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══ ORDERS ═══
app.get("/api/orders", auth, async (req, res) => {
  try {
    const role = await getRolePerms(req.user.ruolo);
    const orders = await prisma.order.findMany({ include:{items:true}, orderBy:{data:"desc"} });
    if (!role.canSeePrice) orders.forEach(o => { o.totale=0; o.items.forEach(i=>{i.prezzo=0}); });
    res.json(orders);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/orders", auth, async (req, res) => {
  if (!(await requirePerm(req, res, "canOrder"))) return;
  try {
    const { clientName, clientPhone, note, items } = req.body;
    if (!items?.length) return res.status(400).json({ error: "Няма артикули" });
    if (!clientName?.trim()) return res.status(400).json({ error: "Въведи име на клиент" });
    let totale = 0;
    const oi = [];
    for (const item of items) {
      const p = await prisma.part.findUnique({ where:{id:item.partId} });
      if (!p) return res.status(400).json({ error: `Артикул не съществува` });
      if (p.quantita < item.qty) return res.status(400).json({ error: `Недостатъчно: ${p.codice}` });
      totale += p.prezzo * item.qty;
      oi.push({ partId:p.id, codice:p.codice, marchio:p.marchio, tipo:p.tipo||"", tipoValue:p.tipoValue||"", riferimento:p.riferimento, qty:item.qty, prezzo:p.prezzo });
    }
    const orderId = "ORD-" + Date.now().toString(36).toUpperCase();
    const order = await prisma.$transaction(async tx => {
      const o = await tx.order.create({ data:{ orderId, operatore:req.user.nome, clientName:clientName.trim(), clientPhone:(clientPhone||"").trim(), note:note||"", totale, items:{create:oi} }, include:{items:true} });
      for (const it of items) await tx.part.update({ where:{id:it.partId}, data:{quantita:{decrement:it.qty}} });
      return o;
    });
    await addAudit(req.user, "ORDER_PLACED", `Поръчка ${orderId} за ${clientName}`, oi.map(i=>`${i.codice}x${i.qty}`).join(", "));
    res.json(order);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══ USERS ═══
app.get("/api/users", auth, async (req, res) => {
  if (!(await requirePerm(req, res, "canManageUsers"))) return;
  try { res.json(await prisma.user.findMany({ orderBy:{createdAt:"asc"} })); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/users", auth, async (req, res) => {
  if (!(await requirePerm(req, res, "canManageUsers"))) return;
  try {
    const { nome, email, ruolo, pin } = req.body;
    if (!nome||!email||!pin||pin.length!==4) return res.status(400).json({ error: "Невалидни данни" });
    const u = await prisma.user.create({ data:{nome,email,ruolo:ruolo||"VIEWER",pin} });
    await addAudit(req.user, "USER_CREATED", `Създаден ${nome}`, `Роля:${ruolo}`);
    res.json(u);
  } catch (e) {
    if (e.code==="P2002") return res.status(400).json({ error: "Имейлът съществува" });
    res.status(500).json({ error: e.message });
  }
});

app.put("/api/users/:id", auth, async (req, res) => {
  if (!(await requirePerm(req, res, "canManageUsers"))) return;
  try {
    const { nome, email, ruolo, pin } = req.body;
    const u = await prisma.user.update({ where:{id:req.params.id}, data:{nome,email,ruolo,pin} });
    await addAudit(req.user, "USER_EDITED", `Ред. ${nome}`, `Роля:${ruolo}`);
    res.json(u);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete("/api/users/:id", auth, async (req, res) => {
  if (!(await requirePerm(req, res, "canManageUsers"))) return;
  try {
    if (req.params.id===req.user.id) return res.status(400).json({ error: "Не можеш себе си" });
    const u = await prisma.user.findUnique({ where:{id:req.params.id} });
    if (!u) return res.status(404).json({ error: "Не е намерен" });
    await prisma.user.delete({ where:{id:req.params.id} });
    await addAudit(req.user, "USER_DELETED", `Изтрит ${u.nome}`, "");
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══ AUDIT ═══
app.get("/api/audit", auth, async (req, res) => {
  const role = await getRolePerms(req.user.ruolo);
  if (!role.canAudit) return res.json([]);
  try {
    const w = req.query.filter&&req.query.filter!=="ALL" ? {action:req.query.filter} : {};
    res.json(await prisma.auditLog.findMany({ where:w, orderBy:{timestamp:"desc"}, take:500 }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete("/api/audit", auth, async (req, res) => {
  if (!(await requirePerm(req, res, "canAudit"))) return;
  try { await prisma.auditLog.deleteMany({}); res.json({ok:true}); } catch(e){ res.status(500).json({error:e.message}); }
});

// ═══ NOTIFICATIONS ═══
app.get("/api/notifications", auth, async (req, res) => {
  const role = await getRolePerms(req.user.ruolo);
  if (!role.canAudit) return res.json([]);
  try { res.json(await prisma.notification.findMany({ orderBy:{timestamp:"desc"}, take:100 })); } catch(e){ res.status(500).json({error:e.message}); }
});

app.put("/api/notifications/read", auth, async (_req, res) => {
  try { await prisma.notification.updateMany({data:{read:true}}); res.json({ok:true}); } catch(e){ res.status(500).json({error:e.message}); }
});

app.delete("/api/notifications", auth, async (_req, res) => {
  try { await prisma.notification.deleteMany({}); res.json({ok:true}); } catch(e){ res.status(500).json({error:e.message}); }
});

// ═══ SETTINGS ═══
app.get("/api/settings", auth, async (req, res) => {
  const role = await getRolePerms(req.user.ruolo);
  if (!role.canSettings) return res.json({});
  try {
    let s = await prisma.settings.findUnique({ where:{id:"singleton"} });
    if (!s) s = await prisma.settings.create({ data:{id:"singleton"} });
    res.json(s);
  } catch(e){ res.status(500).json({error:e.message}); }
});

app.put("/api/settings", auth, async (req, res) => {
  if (!(await requirePerm(req, res, "canSettings"))) return;
  try {
    const { notifyEmail, emailEnabled, notifyOnPartChange, notifyOnOrder, notifyOnUserChange, lowStockEnabled, lowStockThreshold } = req.body;
    res.json(await prisma.settings.upsert({ where:{id:"singleton"}, update:{notifyEmail,emailEnabled,notifyOnPartChange,notifyOnOrder,notifyOnUserChange,lowStockEnabled:lowStockEnabled!==false,lowStockThreshold:lowStockThreshold||10}, create:{id:"singleton",notifyEmail,emailEnabled,notifyOnPartChange,notifyOnOrder,notifyOnUserChange,lowStockEnabled:lowStockEnabled!==false,lowStockThreshold:lowStockThreshold||10} }));
  } catch(e){ res.status(500).json({error:e.message}); }
});

app.get("/api/health", (_req, res) => res.json({ status:"ok", time:new Date().toISOString() }));

app.listen(PORT, () => console.log(`═══ Склад Backend :${PORT} ═══`));
