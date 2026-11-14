// Carbon Stealth POS — лицензионен магазин и активационен сървър.
//
// Поток: /api/checkout → Stripe Checkout (hosted) → webhook
// checkout.session.completed създава лиценз + ключ (идемпотентно по session id)
// → success страницата poll-ва /api/session-status и показва ключ + download.
// Касите се активират през /api/activate (≤ seats) и получават Ed25519-подписан
// офлайн лиценз (blob) с гратис период — виж lib/license.js.
//
// Принципи: сумите/плановете се решават САМО сървърно (whitelist + lookup key);
// достъп се дава само след payment_status === 'paid'; webhook е raw body,
// fail-closed; всеки ефект е в една транзакция с идемпотентния маркер.

import express from "express";
import Stripe from "stripe";
import crypto from "node:crypto";
import fs from "node:fs";
import { db, claimEvent } from "./lib/db.js";
import { generateKey, normalizeKey, hashKey, signLicenseBlob } from "./lib/license.js";
import { PLANS, MAX_SEATS, GRACE_DAYS, isValidPlan } from "./lib/plans.js";
import { sendLicenseEmail } from "./lib/mail.js";

const {
  STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET,
  BASE_URL = "http://localhost:8790",
  LICENSE_PRIVATE_KEY_FILE = "./data/license-signing.key",
  DOWNLOAD_URL, // напр. подписан CDN/Release линк; или локален файл:
  DOWNLOAD_FILE, // напр. ./data/Carbon Stealth POS Setup 1.0.0.exe
  PORT = 8790,
  HOST = "127.0.0.1", // зад nginx; смени само ако проксито е на друга машина
  NODE_ENV,
} = process.env;

if (!STRIPE_SECRET_KEY) {
  console.error("[store] Липсва STRIPE_SECRET_KEY (.env) — виж README.md");
  process.exit(1);
}
const stripe = new Stripe(STRIPE_SECRET_KEY);
const signingKey = fs.readFileSync(LICENSE_PRIVATE_KEY_FILE, "utf8");
const GRACE_MS = GRACE_DAYS * 24 * 3600 * 1000;

const app = express();
app.disable("x-powered-by");

// ── Прост rate limit (в паметта; касата е един процес) ──────────────────────
function limiter(max, windowMs) {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const rec = hits.get(req.ip) ?? { n: 0, t: now };
    if (now - rec.t > windowMs) { rec.n = 0; rec.t = now; }
    if (++rec.n > max) return res.status(429).json({ error: "Твърде много заявки." });
    hits.set(req.ip, rec);
    next();
  };
}

// ── Stripe webhook — RAW body, ПРЕДИ express.json() ─────────────────────────
app.post("/api/webhook", express.raw({ type: "application/json" }), (req, res) => {
  if (!STRIPE_WEBHOOK_SECRET) {
    if (NODE_ENV === "production") {
      console.error("[webhook] STRIPE_WEBHOOK_SECRET липсва — отказ (fail closed)");
      return res.status(500).end();
    }
    console.warn("[webhook] без проверка на подписа (dev)");
  }
  let event;
  try {
    event = STRIPE_WEBHOOK_SECRET
      ? stripe.webhooks.constructEvent(req.body, req.headers["stripe-signature"], STRIPE_WEBHOOK_SECRET)
      : JSON.parse(req.body);
  } catch (err) {
    console.error("[webhook] невалиден подпис:", err.message);
    return res.status(400).end();
  }

  handleEvent(event)
    .then(() => res.json({ received: true }))
    .catch((err) => {
      console.error(`[webhook] ${event.type}:`, err.message);
      res.status(500).end(); // Stripe ще ретрайне; идемпотентността ни пази
    });
});

app.use(express.json({ limit: "64kb" }));
app.use(express.static("public"));

// ── Планове за витрината ─────────────────────────────────────────────────────
app.get("/api/plans", (_req, res) => {
  res.json({
    maxSeats: MAX_SEATS,
    plans: Object.fromEntries(
      Object.entries(PLANS).map(([id, p]) => [
        id,
        { label: p.label, unitAmount: p.unitAmount, interval: p.interval },
      ])
    ),
  });
});

// ── Checkout ─────────────────────────────────────────────────────────────────
app.post("/api/checkout", limiter(10, 15 * 60_000), async (req, res) => {
  try {
    const { plan, seats: rawSeats, waiver } = req.body ?? {};
    if (!isValidPlan(plan)) return res.status(400).json({ error: "Невалиден план." });
    const seats = Math.min(Math.max(parseInt(rawSeats, 10) || 1, 1), MAX_SEATS);
    // чл. 57, т. 13 ЗЗП: изрично съгласие за незабавно изпълнение (неотметнато по подразбиране)
    if (waiver !== true) {
      return res.status(400).json({ error: "Изисква се изрично съгласие за незабавна доставка." });
    }
    const cfg = PLANS[plan];
    const prices = await stripe.prices.list({ lookup_keys: [cfg.lookupKey], limit: 1 });
    const price = prices.data[0];
    if (!price) return res.status(500).json({ error: "Цената не е конфигурирана (setup:stripe)." });

    const isSub = cfg.mode === "subscription";
    const session = await stripe.checkout.sessions.create(
      {
        mode: cfg.mode,
        line_items: [
          {
            price: price.id,
            quantity: seats,
            adjustable_quantity: { enabled: true, minimum: 1, maximum: MAX_SEATS },
          },
        ],
        locale: "bg",
        automatic_tax: { enabled: true },
        tax_id_collection: { enabled: true }, // B2B ЗДДС № → reverse charge
        billing_address_collection: "required",
        // ЕИК на купувача — за списъка на клиентите на СУПТО към НАП (чл. 52и Н-18)
        custom_fields: [
          {
            key: "eik",
            label: { type: "custom", custom: "ЕИК / Булстат на фирмата (за НАП)" },
            type: "text",
            optional: true,
          },
        ],
        ...(isSub
          ? { subscription_data: { metadata: { plan } } }
          : { customer_creation: "always", invoice_creation: { enabled: true } }),
        consent_collection: { terms_of_service: "required" },
        custom_text: {
          terms_of_service_acceptance: {
            message:
              "Приемам Общите условия и изрично се съгласявам изпълнението (сваляне и активиране) да започне веднага, с което губя правото си на 14-дневен отказ (чл. 57, т. 13 ЗЗП).",
          },
        },
        metadata: { plan, seats: String(seats), waiverAt: String(Date.now()) },
        success_url: `${BASE_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${BASE_URL}/?cancelled=1`,
      },
      { idempotencyKey: `checkout:${crypto.randomUUID()}` }
    );
    res.json({ url: session.url });
  } catch (err) {
    console.error("[checkout]", err.message);
    res.status(500).json({ error: "Плащането не може да започне. Опитайте пак." });
  }
});

// ── Създаване на лиценз (идемпотентно по session id) ────────────────────────
function upsertLicenseFromSession(session, sub) {
  const existing = db.prepare("SELECT * FROM licenses WHERE stripeSessionId = ?").get(session.id);
  if (existing) return existing;

  const plan = session.metadata?.plan ?? sub?.metadata?.plan;
  if (!isValidPlan(plan)) throw new Error(`неизвестен план за сесия ${session.id}`);
  // истинският брой места — от Stripe обекта, не от клиента
  const seats =
    sub?.items?.data?.[0]?.quantity ??
    parseInt(session.metadata?.seats, 10) ??
    1;
  const periodEndSec = sub?.items?.data?.[0]?.current_period_end ?? sub?.current_period_end ?? null;

  const key = generateKey();
  const lic = {
    id: `lic_${crypto.randomBytes(10).toString("hex")}`,
    keyHash: hashKey(key),
    keyPlain: key,
    plan,
    seats,
    status: "active",
    email: session.customer_details?.email ?? null,
    buyerEik: session.custom_fields?.find((f) => f.key === "eik")?.text?.value ?? null,
    stripeCustomerId: typeof session.customer === "string" ? session.customer : session.customer?.id ?? null,
    stripeSubscriptionId: typeof session.subscription === "string" ? session.subscription : session.subscription?.id ?? null,
    stripePaymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null,
    periodEnd: periodEndSec ? periodEndSec * 1000 : null,
    createdAt: Date.now(),
  };
  db.prepare(
    `INSERT INTO licenses (id, keyHash, keyPlain, plan, seats, status, email, buyerEik,
       stripeCustomerId, stripeSubscriptionId, stripeSessionId, stripePaymentIntentId, periodEnd, createdAt)
     VALUES (@id, @keyHash, @keyPlain, @plan, @seats, @status, @email, @buyerEik,
       @stripeCustomerId, @stripeSubscriptionId, @sessionId, @stripePaymentIntentId, @periodEnd, @createdAt)
     ON CONFLICT(stripeSessionId) DO NOTHING`
  ).run({ ...lic, sessionId: session.id });
  return db.prepare("SELECT * FROM licenses WHERE stripeSessionId = ?").get(session.id);
}

async function handleEvent(event) {
  // идемпотентният маркер и ефектът вървят заедно (marker-first)
  if (!claimEvent(event.id, event.type)) return;

  const obj = event.data.object;
  switch (event.type) {
    case "checkout.session.completed": {
      if (obj.payment_status !== "paid") return; // async методи → изчакай paid събитието
      const sub = obj.subscription
        ? await stripe.subscriptions.retrieve(
            typeof obj.subscription === "string" ? obj.subscription : obj.subscription.id
          )
        : null;
      const lic = upsertLicenseFromSession(obj, sub);
      if (lic) void sendLicenseEmail(lic, BASE_URL);
      break;
    }
    case "invoice.paid": {
      const subId = obj.subscription ?? obj.parent?.subscription_details?.subscription;
      if (!subId) return;
      const sub = await stripe.subscriptions.retrieve(typeof subId === "string" ? subId : subId.id);
      const periodEnd = (sub.items?.data?.[0]?.current_period_end ?? sub.current_period_end) * 1000;
      db.prepare(
        "UPDATE licenses SET status='active', periodEnd=? WHERE stripeSubscriptionId=? AND status!='revoked'"
      ).run(periodEnd, sub.id);
      break;
    }
    case "invoice.payment_failed": {
      const subId = obj.subscription ?? obj.parent?.subscription_details?.subscription;
      if (!subId) return;
      db.prepare(
        "UPDATE licenses SET status='past_due' WHERE stripeSubscriptionId=? AND status='active'"
      ).run(typeof subId === "string" ? subId : subId.id);
      break;
    }
    case "customer.subscription.updated": {
      const seats = obj.items?.data?.[0]?.quantity;
      const periodEnd = (obj.items?.data?.[0]?.current_period_end ?? obj.current_period_end) ?? null;
      const status =
        obj.status === "active" || obj.status === "trialing"
          ? "active"
          : obj.status === "past_due" || obj.status === "unpaid"
            ? "past_due"
            : obj.status === "canceled"
              ? "canceled"
              : null;
      db.prepare(
        `UPDATE licenses SET
           seats = COALESCE(?, seats),
           periodEnd = COALESCE(?, periodEnd),
           status = CASE WHEN status='revoked' THEN status ELSE COALESCE(?, status) END
         WHERE stripeSubscriptionId = ?`
      ).run(seats ?? null, periodEnd ? periodEnd * 1000 : null, status, obj.id);
      break;
    }
    case "customer.subscription.deleted": {
      db.prepare(
        "UPDATE licenses SET status='canceled' WHERE stripeSubscriptionId=? AND status!='revoked'"
      ).run(obj.id);
      break;
    }
    case "charge.refunded":
    case "charge.dispute.created": {
      // пълен refund/чарджбек → незабавно отнемане
      const pi = typeof obj.payment_intent === "string" ? obj.payment_intent : obj.payment_intent?.id;
      if (!pi) return;
      if (event.type === "charge.refunded" && !obj.refunded) return; // частичен — не отнемаме
      db.prepare(
        "UPDATE licenses SET status='revoked', revokedAt=? WHERE stripePaymentIntentId=?"
      ).run(Date.now(), pi);
      break;
    }
    default:
      break;
  }
}

// ── Success: poll-ва се от страницата, докато webhook-ът достави ─────────────
app.get("/api/session-status", limiter(60, 60_000), async (req, res) => {
  try {
    const id = String(req.query.session_id ?? "");
    if (!/^cs_/.test(id)) return res.status(400).json({ error: "Невалидна сесия." });
    const session = await stripe.checkout.sessions.retrieve(id);
    if (session.payment_status !== "paid") return res.json({ status: "pending" });

    let lic = db.prepare("SELECT * FROM licenses WHERE stripeSessionId = ?").get(id);
    if (!lic) {
      // fallback при закъснял webhook — същата идемпотентна функция, никога 2 ключа
      const sub = session.subscription
        ? await stripe.subscriptions.retrieve(
            typeof session.subscription === "string" ? session.subscription : session.subscription.id
          )
        : null;
      lic = upsertLicenseFromSession(session, sub);
    }
    if (lic) void sendLicenseEmail(lic, BASE_URL);
    res.json({
      status: "ready",
      key: lic.keyPlain,
      plan: lic.plan,
      seats: lic.seats,
      download: `${BASE_URL}/download?key=${encodeURIComponent(lic.keyPlain)}`,
    });
  } catch (err) {
    console.error("[session-status]", err.message);
    res.status(500).json({ error: "Грешка при проверка на плащането." });
  }
});

app.get("/success", (_req, res) => res.sendFile("success.html", { root: "public" }));

// ── Активен ли е лицензът в момента (вкл. гратис) ────────────────────────────
function licenseUsable(lic) {
  if (!lic || lic.status === "revoked") return false;
  if (lic.plan === "lifetime") return lic.status !== "revoked";
  if (!lic.periodEnd) return lic.status === "active";
  return Date.now() < lic.periodEnd + GRACE_MS && lic.status !== "canceled"
    ? true
    : Date.now() < lic.periodEnd; // canceled: важи до края на платения период
}

function findLicenseByKey(rawKey) {
  const key = normalizeKey(rawKey);
  if (!key) return null;
  return db.prepare("SELECT * FROM licenses WHERE keyHash = ?").get(hashKey(key));
}

// ── Download (валиден ключ → файл/линк) ─────────────────────────────────────
app.get("/download", limiter(30, 60_000), (req, res) => {
  const lic = findLicenseByKey(req.query.key);
  if (!lic || !licenseUsable(lic)) {
    return res.status(403).send("Невалиден или изтекъл лицензен ключ.");
  }
  if (DOWNLOAD_FILE && fs.existsSync(DOWNLOAD_FILE)) return res.download(DOWNLOAD_FILE);
  if (DOWNLOAD_URL) return res.redirect(DOWNLOAD_URL);
  res.status(503).send("Инсталаторът още не е качен (DOWNLOAD_FILE/DOWNLOAD_URL).");
});

// ── Активация от касата ──────────────────────────────────────────────────────
const activateTx = db.transaction((lic, deviceId, deviceName) => {
  const existing = db
    .prepare("SELECT * FROM activations WHERE licenseId=? AND deviceId=? AND deactivatedAt IS NULL")
    .get(lic.id, deviceId);
  if (existing) return "ok"; // re-issue за вече активирано устройство
  const used = db
    .prepare("SELECT COUNT(*) n FROM activations WHERE licenseId=? AND deactivatedAt IS NULL")
    .get(lic.id).n;
  if (used >= lic.seats) return "full";
  db.prepare(
    `INSERT INTO activations (id, licenseId, deviceId, deviceName, activatedAt)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(licenseId, deviceId) DO UPDATE SET deactivatedAt=NULL, activatedAt=excluded.activatedAt`
  ).run(`act_${crypto.randomBytes(8).toString("hex")}`, lic.id, deviceId, deviceName ?? null, Date.now());
  return "ok";
});

function issueBlob(lic, deviceId) {
  return signLicenseBlob(
    {
      v: 1,
      licenseId: lic.id,
      plan: lic.plan,
      seats: lic.seats,
      deviceId,
      issuedAt: Date.now(),
      // lifetime: без срок; абонамент: край на периода + гратис (офлайн толеранс)
      expiresAt: lic.plan === "lifetime" ? null : (lic.periodEnd ?? Date.now()) + GRACE_MS,
    },
    signingKey
  );
}

app.post("/api/activate", limiter(30, 60_000), (req, res) => {
  const { key, deviceId, deviceName } = req.body ?? {};
  if (!deviceId || String(deviceId).length < 8) {
    return res.status(400).json({ error: "Невалидно устройство." });
  }
  const lic = findLicenseByKey(key);
  if (!lic) return res.status(404).json({ error: "Невалиден лицензен ключ." });
  if (!licenseUsable(lic)) return res.status(403).json({ error: "Лицензът е изтекъл или отнет." });

  const outcome = activateTx(lic, String(deviceId), deviceName);
  if (outcome === "full") {
    return res.status(409).json({
      error: `Достигнат е броят каси (${lic.seats}). Деактивирайте устройство или добавете каси.`,
    });
  }
  res.json({ blob: issueBlob(lic, String(deviceId)), plan: lic.plan, seats: lic.seats });
});

app.post("/api/deactivate", limiter(30, 60_000), (req, res) => {
  const lic = findLicenseByKey(req.body?.key);
  if (!lic) return res.status(404).json({ error: "Невалиден лицензен ключ." });
  db.prepare(
    "UPDATE activations SET deactivatedAt=? WHERE licenseId=? AND deviceId=? AND deactivatedAt IS NULL"
  ).run(Date.now(), lic.id, String(req.body?.deviceId ?? ""));
  res.json({ ok: true });
});

// периодично подновяване на офлайн лиценза (тихо, от касата)
app.post("/api/validate", limiter(60, 60_000), (req, res) => {
  const { key, deviceId } = req.body ?? {};
  const lic = findLicenseByKey(key);
  if (!lic) return res.status(404).json({ error: "Невалиден лицензен ключ." });
  const active = db
    .prepare("SELECT 1 FROM activations WHERE licenseId=? AND deviceId=? AND deactivatedAt IS NULL")
    .get(lic.id, String(deviceId ?? ""));
  if (!active) return res.status(403).json({ error: "Устройството не е активирано." });
  if (!licenseUsable(lic)) return res.status(403).json({ error: "Лицензът е изтекъл или отнет." });
  res.json({ blob: issueBlob(lic, String(deviceId)) });
});

// Customer Portal — управление на абонамента (карта, брой каси, отказ, фактури)
app.post("/api/portal", limiter(10, 60_000), async (req, res) => {
  const lic = findLicenseByKey(req.body?.key);
  if (!lic?.stripeCustomerId) return res.status(404).json({ error: "Няма абонамент за този ключ." });
  const portal = await stripe.billingPortal.sessions.create({
    customer: lic.stripeCustomerId,
    return_url: `${BASE_URL}/`,
  });
  res.json({ url: portal.url });
});

app.listen(PORT, HOST, () => console.log(`Carbon Stealth POS store на ${HOST}:${PORT}`));
