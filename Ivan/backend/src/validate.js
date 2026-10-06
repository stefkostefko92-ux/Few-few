"use strict";
// Схемите на всеки вход отвън. Непознатите полета се изпускат (z.object ги маха), числата се проверяват.
const { z } = require("zod");

const email = z.string().trim().toLowerCase().pipe(z.email().max(254));
// Нов или сменен ПИН: 6–12 цифри. При вход се приема и по-кратък стар ПИН (4 цифри) — заключването го пази.
const newPin = z.string().regex(/^\d{6,12}$/, "ПИН-ът трябва да е от 6 до 12 цифри");
const anyPin = z.string().regex(/^\d{4,12}$/);
const flag = z.boolean().optional().default(false);

const login = z.object({ email, pin: anyPin });

const userCreate = z.object({
  nome: z.string().trim().min(1).max(100),
  email,
  ruolo: z.string().trim().min(1).max(32),
  pin: newPin,
});
const userUpdate = z.object({
  nome: z.string().trim().min(1).max(100),
  email,
  ruolo: z.string().trim().min(1).max(32),
  // празен низ = ПИН-ът не се сменя
  pin: z.union([z.literal(""), newPin]).optional(),
});

const PERMS = ["canEdit", "canDelete", "canCreate", "canOrder", "canSeePrice", "canManageUsers", "canAudit", "canSettings"];
const permFields = Object.fromEntries(PERMS.map((p) => [p, flag]));
const roleCreate = z.object({
  id: z.string().regex(/^[A-Z][A-Z0-9_]{1,31}$/, "ID на ролята: главни латински букви, цифри и _"),
  label: z.string().trim().min(1).max(60),
  ...permFields,
});
const roleUpdate = z.object({ label: z.string().trim().min(1).max(60), ...permFields });

const part = z.object({
  codice: z.string().trim().min(1).max(80),
  marchio: z.string().trim().min(1).max(80),
  tipo: z.enum(["", "DYUZA", "GNP"]).optional().default(""),
  tipoValue: z.string().trim().max(500).optional().default(""),
  riferimento: z.string().trim().max(120).optional().default(""),
  quantita: z.number().int().min(0).max(10_000_000),
  prezzo: z.number().min(0).max(10_000_000).optional().default(0),
  note: z.string().max(2000).nullish().transform((v) => v ?? ""),
});

const order = z.object({
  clientName: z.string().trim().min(1, "Въведи име на клиент").max(120),
  clientPhone: z.string().trim().max(40).optional().default(""),
  note: z.string().max(2000).nullish().transform((v) => v ?? ""),
  items: z
    .array(z.object({ partId: z.string().min(1).max(64), qty: z.number().int().min(1).max(1_000_000) }))
    .min(1, "Няма артикули")
    .max(500),
});

const settings = z.object({
  notifyEmail: z.union([z.literal(""), email]).optional().default(""),
  emailEnabled: flag,
  notifyOnPartChange: z.boolean().optional().default(true),
  notifyOnOrder: z.boolean().optional().default(true),
  notifyOnUserChange: z.boolean().optional().default(true),
  lowStockEnabled: z.boolean().optional().default(true),
  lowStockThreshold: z.number().int().min(0).max(1_000_000).optional().default(10),
});

/** Валидира тялото; при грешка връща 400 и undefined. Показва само нашите (български) съобщения. */
function parseBody(schema, req, res) {
  const r = schema.safeParse(req.body);
  if (r.success) return r.data;
  const own = r.error.issues.map((i) => i.message).find((m) => /[А-Яа-я]/.test(m));
  res.status(400).json({ error: own || "Невалидни данни" });
  return undefined;
}

module.exports = { PERMS, login, userCreate, userUpdate, roleCreate, roleUpdate, part, order, settings, parseBody };
