// backend/src/routes/admin.js
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { guildIconUrl } from "../lib/discordCdn.js";
import { planConfig, effectivePremiumWhere } from "../lib/premium.js";
import { requireAuth, loadUser, requireSuperUser, requireMainOwner } from "../middleware/auth.js";

// Активен ПЛАТЕН абонамент (Stripe, Discord или покриваща агенция). Ръчните
// админски действия не бива да го презаписват: клиентът продължава да плаща, а
// planSource="manual" го изважда от MRR и разкачва Stripe синхрона.
//
// Логиката живееше САМО в /plan. Близнакът /premium я нямаше — класически
// „поправено на единия близнак". (Кодаджията, 07.08.2026)
function activePaidSubscription(server) {
  const LIVE = ["active", "trialing", "past_due"];
  const paidAgency = server.agency &&
    ((server.agency.planSource === "stripe" && LIVE.includes(server.agency.stripeStatus)) ||
     server.agency.planSource === "discord");
  const own =
    (server.planSource === "stripe" && LIVE.includes(server.stripeStatus)) ||
    server.planSource === "discord";
  if (!own && !paidAgency) return null;
  return paidAgency ? server.agency.planSource : server.planSource;
}

const router = Router();

router.use(requireAuth, loadUser, requireSuperUser);

// ─── GET /api/admin/analytics ─────────────────────────────────────────────────

router.get("/analytics", async (req, res, next) => {
  try {
    const [
      totalServers,
      premiumServers,
      totalTickets,
      totalUsers,
      openTickets,
      totalForms,
      totalApplications,
      totalPanels,
      recentTicketsRaw,
    ] = await Promise.all([
      prisma.server.count(),
      // ЕФЕКТИВНО premium: собствен план ИЛИ trial ИЛИ гратис ИЛИ активна
      // агенция. Суровият `isPremium: true` изпускаше trial и agency-покрити
      // сървъри → админ статистиката за платени под-отчиташе. (Одит 07.08.2026)
      prisma.server.count({ where: effectivePremiumWhere() }),
      prisma.ticket.count(),
      prisma.user.count(),
      prisma.ticket.count({ where: { status: "OPEN" } }),
      prisma.form.count(),
      prisma.application.count(),
      prisma.panel.count(),
      // Tickets per day for last 30 days
      // NOTE: column is "createdAt" (double-quoted camelCase), NOT created_at
      // ::int cast avoids BigInt serialization errors
      prisma.$queryRaw`
        SELECT DATE("createdAt") AS date, COUNT(*)::int AS count
        FROM tickets
        WHERE "createdAt" >= NOW() - INTERVAL '30 days'
        GROUP BY DATE("createdAt")
        ORDER BY date ASC
      `,
    ]);

    // JS Date objects don't serialize to proper ISO in raw results reliably across Node.js versions
    const recentTickets = (recentTicketsRaw || []).map((r) => ({
      date: r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date),
      count: Number(r.count) || 0,
    }));

    // MRR НЕ се връща тук — единственият източник на приходни числа е
    // GET /api/admin/revenue (виж секция REVENUE по-долу). Две „MRR“ числа на
    // две места = гарантирано разминаване.
    res.json({
      totalServers,
      premiumServers,
      baseServers: totalServers - premiumServers,
      premiumPercentage: totalServers > 0 ? Number(((premiumServers / totalServers) * 100).toFixed(1)) : 0,
      totalTickets,
      openTickets,
      totalUsers,
      totalForms,
      totalApplications,
      totalPanels,
      recentTickets,
    });
  } catch (err) {
    console.error("[analytics] error:", err);
    next(err);
  }
});

// ─── GET /api/admin/users ─────────────────────────────────────────────────────

router.get("/users", async (req, res, next) => {
  // Таван на limit: без него `?limit=1000000` изтегля цялата таблица в паметта.
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const { query, role } = req.query;

  try {
    const where = {
      ...(query && {
        OR: [
          { username: { contains: query, mode: "insensitive" } },
          { id: { contains: query } },
        ],
      }),
      ...(role && { globalRole: role }),
    };

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        // Изричен select: досега `include` връщаше ЦЕЛИЯ ред, тоест имейлите на
        // всички потребители влизаха в отговора, без някой да ги е поискал.
        // Минимизация на данните — админският списък има нужда от профил и
        // броячи, не от контактите.
        select: {
          id: true, username: true, discriminator: true, avatar: true,
          globalRole: true, isBlacklisted: true, language: true, createdAt: true,
          _count: { select: { tickets: true, applications: true, serverMembers: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.user.count({ where }),
    ]);

    res.json({ users, total });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/admin/users/:userId ─────────────────────────────────────────────

router.get("/users/:userId", async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.userId },
      include: {
        serverMembers: {
          include: { server: { select: { id: true, name: true, isPremium: true } } },
        },
        tickets: { take: 5, orderBy: { createdAt: "desc" } },
        sessions: { select: { createdAt: true, expiresAt: true }, take: 5 },
      },
    });

    if (!user) return res.status(404).json({ error: "User not found" });

    // Get stripe payments for servers this user owns
    const ownedServerIds = user.serverMembers
      .filter((m) => m.serverRole === "ADMIN")
      .map((m) => m.serverId);

    const payments = await prisma.paymentLog.findMany({
      where: { serverId: { in: ownedServerIds } },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    res.json({ ...user, payments });
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /api/admin/users/:userId/role ──────────────────────────────────────

router.patch("/users/:userId/role", requireMainOwner, async (req, res, next) => {
  const { role } = req.body;
  const validRoles = ["SUPER_USER", "SUPPORT_STAFF", "USER"];

  if (!validRoles.includes(role)) {
    return res.status(400).json({ error: `role must be one of: ${validRoles.join(", ")}` });
  }

  if (req.query.confirm !== "true") {
    return res.status(400).json({
      error: "Destructive action requires confirmation",
      hint: "Add ?confirm=true to confirm",
      action: "role_change",
      newRole: role,
      targetId: req.params.userId,
    });
  }

  try {
    const target = await prisma.user.findUnique({ where: { id: req.params.userId } });
    if (!target) return res.status(404).json({ error: "User not found" });

    // Cannot modify Main Owner
    if (target.globalRole === "MAIN_OWNER") {
      return res.status(403).json({ error: "Cannot modify the Main Owner" });
    }

    const updated = await prisma.user.update({
      where: { id: req.params.userId },
      data: { globalRole: role },
    });

    await prisma.auditLog.create({
      data: {
        actorId: req.user.id,
        action: "USER_ROLE_CHANGED",
        targetId: req.params.userId,
        metadata: { oldRole: target.globalRole, newRole: role },
      },
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /api/admin/users/:userId/blacklist ─────────────────────────────────

router.patch("/users/:userId/blacklist", requireMainOwner, async (req, res, next) => {
  const { blacklisted } = req.body;

  if (req.query.confirm !== "true") {
    return res.status(400).json({
      error: "Destructive action requires confirmation",
      hint: "Add ?confirm=true to confirm",
      action: blacklisted ? "blacklist" : "unblacklist",
      targetId: req.params.userId,
    });
  }

  try {
    const target = await prisma.user.findUnique({ where: { id: req.params.userId } });
    if (!target) return res.status(404).json({ error: "User not found" });

    if (target.globalRole === "MAIN_OWNER") {
      return res.status(403).json({ error: "Cannot blacklist the Main Owner" });
    }

    const updated = await prisma.user.update({
      where: { id: req.params.userId },
      data: { isBlacklisted: !!blacklisted },
    });

    await prisma.auditLog.create({
      data: {
        actorId: req.user.id,
        action: blacklisted ? "USER_BLACKLISTED" : "USER_UNBLACKLISTED",
        targetId: req.params.userId,
      },
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// Админският изглед на сървър: без тайни, с адрес за иконката.
// Едно определение — ползва се и от списъка, и от детайла.
function adminServerView(server) {
  if (!server) return server;
  const {
    customBotToken: _token,
    stripeCustomerId: _cus,
    stripeSubscriptionId: _sub,
    ...safe
  } = server;
  safe.icon = guildIconUrl(safe.id, safe.icon);
  return safe;
}

// ─── GET /api/admin/servers ───────────────────────────────────────────────────

router.get("/servers", async (req, res, next) => {
  const { page = 1, limit = 50, premium } = req.query;

  try {
    const where = {
      ...(premium !== undefined && { isPremium: premium === "true" }),
    };

    const [servers, total] = await Promise.all([
      prisma.server.findMany({
        where,
        include: { _count: { select: { tickets: true, panels: true, forms: true, members: true } } },
        orderBy: { createdAt: "desc" },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      prisma.server.count({ where }),
    ]);

    // Списъкът връщаше ЦЕЛИЯ запис — включително `customBotToken` (криптиран, но
    // пак таен) и Stripe идентификаторите. Детайлният маршрут по-долу ги маха, а
    // списъкът не: същият клас „едно правило, две определения". И `icon` излиза
    // като АДРЕС, за да не строи всеки клиент URL сам. (07.08.2026)
    res.json({ servers: servers.map(adminServerView), total });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/admin/payments ──────────────────────────────────────────────────

router.get("/payments", async (req, res, next) => {
  const { page = 1, limit = 50, status } = req.query;

  try {
    const where = { ...(status && { status }) };

    const [payments, total, collectedThisMonth] = await Promise.all([
      prisma.paymentLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      prisma.paymentLog.count({ where }),
      cashCollectedThisMonth(),
    ]);

    // `collectedThisMonth` е КАСА (реално платени фактури този календарен месец),
    // НЕ MRR. Преди се връщаше под името `mrr` — грешно: сумата подскача при
    // годишни фактури, нулира се на 1-во число и не вижда agency плащания.
    res.json({ payments, total, collectedThisMonth });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/admin/audit-logs ────────────────────────────────────────────────

router.get("/audit-logs", async (req, res, next) => {
  const { page = 1, limit = 100, action, actorId } = req.query;

  try {
    const where = {
      ...(action && { action: { contains: action, mode: "insensitive" } }),
      ...(actorId && { actorId }),
    };

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: { actor: { select: { id: true, username: true, avatar: true } } },
        // actorTag is on the log itself (for SYSTEM entries where actor is null)
        orderBy: { createdAt: "desc" },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      prisma.auditLog.count({ where }),
    ]);

    res.json({ logs, total });
  } catch (err) {
    next(err);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// REVENUE — единственият източник на приходни числа
// ═══════════════════════════════════════════════════════════════════════════
// Старият `calculateMRR()` сумираше paymentLog за текущия календарен месец и
// го наричаше „MRR“. Това е грешно на четири нива и е премахнато:
//   1) КАСА ≠ RUN-RATE. Годишна фактура €99 влизаше в „MRR“-а на месеца си
//      цялата (трябва €8.25/мес), а следващите 11 месеца — €0.
//   2) Нулира се на 1-во число — на 1-ви „MRR“ винаги е ~0.
//   3) Не вижда agency абонаментите (paymentLog е вързан за serverId, agency
//      фактурите не се логват там) → приходът беше системно занижен.
//   4) Смяташе се в „долари“ при тарифи в EUR (виж docs/PRICING.md).
// Сега MRR се извежда от състоянието на абонаментите (Server/Agency), както
// го прави и самият Stripe Billing.

/**
 * Каталожни цени в EUR с ВКЛЮЧЕН ДДС (tax_behavior=inclusive — виж
 * scripts/stripe-setup.sh и docs/PRICING.md). Това са КАТАЛОЖНИ цени, не
 * реално фактурирани суми: купон, proration или различна ДДС ставка по OSS
 * правят реалната фактура различна. За точни фактурирани суми — Stripe
 * Dashboard / paymentLog.
 */
export const PLAN_PRICES_EUR = {
  premium:    { month: 4.99,  year: 49 },
  whitelabel: { month: 9.99,  year: 99 },
  agency5:    { month: 19.99, year: 199 },
  agency10:   { month: 39.99, year: 399 },
};
// Ценова промяна 2026-08: grandfather-нати абонати остават на старите (по-
// високи) цени в Stripe — за тях каталожният MRR по-долу е ЗАНИЖЕН. Точните
// суми са в Stripe Dashboard; това тук е run-rate приблизител по каталог.

/**
 * ДДС ставка за нето-приблизителя. BG стандартна ставка 20%.
 * ВНИМАНИЕ: при OSS ДДС се дължи по ставката на държавата на потребителя, тоест
 * нетото е ПРИБЛИЗИТЕЛНО. Точното разделяне нето/ДДС е в Stripe Tax отчета.
 */
export const VAT_RATE = 0.2;

const round2 = (n) => Math.round(n * 100) / 100;

/** Месечна стойност на един абонамент: месечен = пълна цена, годишен = /12. */
function monthlyValue(plan, interval) {
  const price = PLAN_PRICES_EUR[plan];
  if (!price) return 0;
  return interval === "year" ? price.year / 12 : price.month;
}

/**
 * Нормализира плана на един сървър. Огледало на getServerTier() (lib/premium.js):
 * заварените редове без `plan`, но с isPremium=true, са grandfather-нати към
 * white-label. Agency-покритите сървъри стоят на plan="free" и НЕ носят собствен
 * приход — приходът им е в реда на самата агенция (без това броим двойно).
 */
function normalizeServerPlan(s) {
  if (s.plan && s.plan !== "free") return { plan: s.plan, grandfathered: false };
  if (s.isPremium) return { plan: "whitelabel", grandfathered: true };
  return { plan: null, grandfathered: false };
}

/**
 * ЧИСТА функция (без DB) — цялата приходна аритметика на едно място, за да е
 * тестваема. Вход: вече извлечените редове; изход: числата за таблото.
 *
 * МЕТОДИКА
 * - MRR = Σ месечна стойност на абонаментите, които РЕАЛНО се таксуват сега:
 *   stripeStatus === "active". Годишните влизат като цена/12.
 * - `trialing` НЕ е приход (пробен период може да свърши без платежен метод) —
 *   брои се отделно като „потенциален“ MRR.
 * - `planSource === "manual"` (подарени) НЕ е приход — отделен ред „gifted“ с
 *   каталожна стойност, за да се вижда колко подаряваме.
 * - `planSource === "discord"` (Discord Premium Apps) е приход, но НЕ минава
 *   през Stripe и Discord удържа комисиона → отделен ред, извън Stripe MRR.
 * - `past_due` НЕ се брои в MRR (плащането е пропаднало; dunning тече) —
 *   показва се като „приход в риск“.
 * - Churn 30d = отпаднали (stripeStatus="canceled" с updatedAt в прозореца) /
 *   (активни сега + отпаднали в прозореца) ≈ активни в началото на прозореца.
 *   ПРИБЛИЖЕНИЕ: `updatedAt` е „последна промяна“, не „момент на отказ“ — всяка
 *   по-късна промяна по реда го мести в/извън прозореца; изтритите сървъри
 *   изобщо не се броят. За точен churn — Stripe Billing отчетите.
 */
export function calculateMrr({ servers = [], agencies = [], now = new Date(), churnWindowDays = 30 } = {}) {
  const cutoff = new Date(now.getTime() - churnWindowDays * 24 * 60 * 60 * 1000);

  const tiers = new Map();
  const tierRow = (plan) => {
    if (!tiers.has(plan)) {
      tiers.set(plan, {
        plan,
        label: planConfig(plan).label,
        count: 0, mrr: 0,
        monthlyCount: 0, monthlyMrr: 0,
        yearlyCount: 0, yearlyMrr: 0,
      });
    }
    return tiers.get(plan);
  };

  const excluded = {
    trialing: { count: 0, potentialMrr: 0 },
    gifted:   { count: 0, listValue: 0 },
    discord:  { count: 0, listValue: 0 },
    pastDue:  { count: 0, atRiskMrr: 0 },
    other:    { count: 0 },
  };
  const diagnostics = { unknownInterval: 0, grandfathered: 0, unknownPlan: 0 };

  let mrr = 0;
  let paidServers = 0;
  let paidAgencies = 0;
  let canceled30d = 0;

  /** Разпределя един абонамент (сървърен или agency) в кофа. */
  function bucket({ plan, interval, planSource, stripeStatus, isServer }) {
    if (!PLAN_PRICES_EUR[plan]) { diagnostics.unknownPlan++; return; }
    const value = monthlyValue(plan, interval);

    if (planSource === "manual") { excluded.gifted.count++; excluded.gifted.listValue += value; return; }
    if (planSource === "discord") { excluded.discord.count++; excluded.discord.listValue += value; return; }
    if (stripeStatus === "trialing") { excluded.trialing.count++; excluded.trialing.potentialMrr += value; return; }
    if (stripeStatus === "past_due") { excluded.pastDue.count++; excluded.pastDue.atRiskMrr += value; return; }
    if (stripeStatus !== "active") { excluded.other.count++; return; }

    // Липсващ billingInterval при активен абонамент е ДУПКА В ДАННИТЕ: броим го
    // като месечен (документираният default), но го отчитаме — ако е реално
    // годишен, MRR е завишен с ~21% за този ред.
    if (!interval) diagnostics.unknownInterval++;

    const row = tierRow(plan);
    row.count++;
    row.mrr += value;
    if (interval === "year") { row.yearlyCount++; row.yearlyMrr += value; }
    else { row.monthlyCount++; row.monthlyMrr += value; }
    mrr += value;
    if (isServer) paidServers++; else paidAgencies++;
  }

  for (const s of servers) {
    if (s.stripeStatus === "canceled" && s.updatedAt && new Date(s.updatedAt) >= cutoff) canceled30d++;
    const { plan, grandfathered } = normalizeServerPlan(s);
    if (!plan) continue;
    if (grandfathered) diagnostics.grandfathered++;
    // Ръчният grant се разпознава по planSource="manual" ИЛИ по заварения
    // маркер stripeStatus="manual" (виж PATCH /servers/:id/premium) — иначе
    // подаръкът би могъл да мине за платен абонамент.
    const isGift = s.planSource === "manual" || s.stripeStatus === "manual";
    bucket({
      plan,
      interval: s.billingInterval,
      planSource: isGift ? "manual" : s.planSource,
      stripeStatus: s.stripeStatus,
      isServer: true,
    });
  }

  for (const a of agencies) {
    if (a.stripeStatus === "canceled" && a.updatedAt && new Date(a.updatedAt) >= cutoff) canceled30d++;
    // Неактивна агенция не покрива нито един сървър → не е приход.
    if (!a.active) continue;
    bucket({
      plan: a.plan,
      interval: a.billingInterval,
      planSource: a.planSource,
      stripeStatus: a.stripeStatus,
      isServer: false,
    });
  }

  const paidSubscriptions = paidServers + paidAgencies;
  const activeNow = paidSubscriptions;
  const churnBase = activeNow + canceled30d;

  // Trial фуния. ПРИБЛИЖЕНИЕ (исторически, не кохортен): `trialUsed` няма дата,
  // затова конверсията е „колко от всякога пробвалите са премиум СЕГА“ — който
  // е конвертирал и после отпаднал, се брои като неконвертирал, а ръчен grant
  // или agency място вдигат числителя. Точна кохортна конверсия иска
  // trialStartedAt + история на абонамента.
  const trialActive = servers.filter((s) => s.trialEndsAt && new Date(s.trialEndsAt) > now).length;
  const trialUsed = servers.filter((s) => s.trialUsed).length;
  const trialConverted = servers.filter((s) => s.trialUsed && s.isPremium).length;

  const byTier = [...tiers.values()]
    .sort((a, b) => planConfig(b.plan).rank - planConfig(a.plan).rank)
    .map((t) => ({
      ...t,
      mrr: round2(t.mrr),
      monthlyMrr: round2(t.monthlyMrr),
      yearlyMrr: round2(t.yearlyMrr),
    }));

  const monthlyCount = byTier.reduce((n, t) => n + t.monthlyCount, 0);
  const yearlyCount = byTier.reduce((n, t) => n + t.yearlyCount, 0);

  return {
    currency: "EUR",
    vatRate: VAT_RATE,
    // Бруто = с ДДС (цените са inclusive). Нето ≈ бруто / 1.20 (BG 20%).
    mrrGross: round2(mrr),
    mrrNet: round2(mrr / (1 + VAT_RATE)),
    arrGross: round2(mrr * 12),
    arrNet: round2((mrr * 12) / (1 + VAT_RATE)),
    paidSubscriptions,
    paidServers,
    paidAgencies,
    // ARPU на ПЛАТЕН АБОНАМЕНТ (сървърен или agency), не на сървър — една агенция
    // покрива до 10 сървъра, деленето на сървъри би дало друго число.
    arpuGross: paidSubscriptions ? round2(mrr / paidSubscriptions) : 0,
    arpuNet: paidSubscriptions ? round2(mrr / (1 + VAT_RATE) / paidSubscriptions) : 0,
    byTier,
    interval: {
      monthlyCount,
      yearlyCount,
      monthlyMrr: round2(byTier.reduce((n, t) => n + t.monthlyMrr, 0)),
      yearlyMrr: round2(byTier.reduce((n, t) => n + t.yearlyMrr, 0)),
    },
    excluded: {
      trialing: { count: excluded.trialing.count, potentialMrr: round2(excluded.trialing.potentialMrr) },
      gifted:   { count: excluded.gifted.count,   listValue: round2(excluded.gifted.listValue) },
      discord:  { count: excluded.discord.count,  listValue: round2(excluded.discord.listValue) },
      pastDue:  { count: excluded.pastDue.count,  atRiskMrr: round2(excluded.pastDue.atRiskMrr) },
      other:    { count: excluded.other.count },
    },
    churn: {
      windowDays: churnWindowDays,
      canceled: canceled30d,
      activeNow,
      rate: churnBase ? round2((canceled30d / churnBase) * 100) : 0,
    },
    trials: {
      active: trialActive,
      used: trialUsed,
      converted: trialConverted,
      conversionRate: trialUsed ? round2((trialConverted / trialUsed) * 100) : 0,
    },
    diagnostics,
  };
}

/** КАСА за текущия календарен месец (реално платени фактури), в EUR. НЕ е MRR. */
async function cashCollectedThisMonth() {
  const start = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const result = await prisma.paymentLog.aggregate({
    _sum: { amount: true },
    where: { status: "paid", createdAt: { gte: start } },
  });
  return round2((result._sum.amount || 0) / 100); // amount е в центове (EUR)
}

// ─── GET /api/admin/revenue ───────────────────────────────────────────────────
// Приходно табло за собственика. Числата се извеждат от състоянието на
// абонаментите, НЕ от клиентски вход и НЕ от касата на месеца.

router.get("/revenue", async (req, res, next) => {
  try {
    const now = new Date();
    const [servers, agencies, cash] = await Promise.all([
      // Изтегляме само редовете, релевантни за приход/фуния/churn — не целия
      // сървърен списък. Агрегацията е в паметта (десетки/стотици реда).
      prisma.server.findMany({
        where: {
          OR: [
            { plan: { not: "free" } },
            { isPremium: true },
            { trialUsed: true },
            { trialEndsAt: { gt: now } },
            { stripeStatus: { in: ["canceled", "past_due", "unpaid", "trialing"] } },
          ],
        },
        select: {
          plan: true, billingInterval: true, planSource: true, stripeStatus: true,
          isPremium: true, trialUsed: true, trialEndsAt: true, updatedAt: true,
        },
      }),
      prisma.agency.findMany({
        select: {
          plan: true, billingInterval: true, planSource: true, stripeStatus: true,
          active: true, updatedAt: true,
        },
      }),
      cashCollectedThisMonth(),
    ]);

    const metrics = calculateMrr({ servers, agencies, now });
    res.json({ ...metrics, cashCollectedThisMonth: cash, generatedAt: now.toISOString() });
  } catch (err) {
    console.error("[revenue] error:", err);
    next(err);
  }
});

// ─── PATCH /api/admin/servers/:serverId/premium ──────────────────────────────
// Manually grant or revoke Premium on a server. Bypasses Stripe entirely.
// Used by Main Owner / Super User to give Premium as a gift, for trials,
// for partners, or for testing.
// When revoking, if the server had an active Stripe subscription, we DON'T
// cancel it — we just flip the flag. To cancel Stripe subscriptions, use the
// Stripe Dashboard directly.

router.patch("/servers/:serverId/premium", requireSuperUser, async (req, res, next) => {
  const { enabled, reason } = req.body;

  if (typeof enabled !== "boolean") {
    return res.status(400).json({ error: "enabled must be true or false" });
  }
  // Tier за ръчния grant (default premium). getServerTier е plan-first — само
  // isPremium=true без plan би дал whitelabel през grandfather fallback-а.
  const MANUAL_PLANS = new Set(["premium", "whitelabel"]);
  const plan = MANUAL_PLANS.has(req.body?.plan) ? req.body.plan : "premium";

  try {
    const server = await prisma.server.findUnique({
      where: { id: req.params.serverId },
      include: { agency: true },
    });
    if (!server) return res.status(404).json({ error: "Server not found" });

    // Същият гейт като в близнака /plan — липсваше тук.
    const paidSrc = activePaidSubscription(server);
    if (enabled && paidSrc) {
      return res.status(409).json({
        error: `Server is covered by an active ${paidSrc} subscription. Cancel it in ${paidSrc === "stripe" ? "the Stripe Dashboard" : "Discord"} first.`,
        code: "ACTIVE_PAID_SUBSCRIPTION",
      });
    }

    const updated = await prisma.server.update({
      where: { id: req.params.serverId },
      data: {
        isPremium: enabled,
        ...(enabled && {
          plan,
          planSource: "manual",
          premiumSince: server.premiumSince || new Date(),
          stripeStatus: server.stripeStatus || "manual",
          archiveRetentionDays: null, // forever
          // Нов ръчен план замества стар гратис — иначе higherPlan(plan, gracePlan)
          // би вдигнал ефективния tier над зададения. (Одит 07.08.2026)
          accessUntil: null,
          gracePlan: null,
        }),
        // Revoke: getServerTier е plan-first — само isPremium=false НЕ отнема
        // достъпа; plan трябва да падне на free (както при всички webhook
        // revoker-и), иначе „revoked“ сървърът запазва пълния tier.
        ...(!enabled && {
          plan: "free",
          planSource: null,
          billingInterval: null,
          archiveRetentionDays: 30,
          // Без това getServerTier връща активен ПРОБЕН tier след ръчен revoke —
          // достъпът си остава. /plan вече го чисти; тук липсваше.
          trialEndsAt: null,
          trialStartedAt: null,
          pastDueSince: null,
          // И гратисът пада: ръчният revoke е окончателен, не оставя достъп до
          // край на период. Без това „revoked“ сървър пазеше gracePlan tier.
          accessUntil: null,
          gracePlan: null,
        }),
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: req.user.id,
        serverId: req.params.serverId,
        action: enabled ? "PREMIUM_GRANTED_MANUAL" : "PREMIUM_REVOKED_MANUAL",
        targetId: req.params.serverId,
        metadata: { reason: reason || null, grantedBy: req.user.username },
      },
    });

    // Log as a paymentLog entry marked manual for the financial ledger
    if (enabled) {
      await prisma.paymentLog.create({
        data: {
          serverId: req.params.serverId,
          amount: 0,
          currency: "usd",
          status: "manual_grant",
          description: `Manually granted by ${req.user.username}${reason ? ` — ${reason}` : ""}`,
        },
      });
    }

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /api/admin/servers/:serverId/plan ──────────────────────────────────
// Ръчна смяна на ЦЕЛИЯ tier (free | premium | whitelabel | agency5 | agency10).
// Надгражда /premium (само premium/whitelabel): позволява и Agency планове —
// създава/преизползва manual Agency, притежавана от собственика на сървъра,
// и закача сървъра като първо seat. Останалите seats собственикът закача сам
// от Agency UI-то. planSource="manual" → изключен от MRR (виж /revenue).
// Активен Stripe/Discord абонамент НЕ се отменя оттук — само Stripe Dashboard.

router.patch("/servers/:serverId/plan", requireSuperUser, async (req, res, next) => {
  const { plan, reason } = req.body;
  const VALID_PLANS = ["free", "premium", "whitelabel", "agency5", "agency10"];
  if (!VALID_PLANS.includes(plan)) {
    return res.status(400).json({ error: `plan must be one of: ${VALID_PLANS.join(", ")}` });
  }

  try {
    const server = await prisma.server.findUnique({
      where: { id: req.params.serverId },
      include: { agency: true },
    });
    if (!server) return res.status(404).json({ error: "Server not found" });

    // Предпазител: не пипаме тихо платен абонамент — админът първо да го
    // отмени в Stripe/Discord, иначе клиентът плаща за tier, който сме сменили.
    // ВАЖНО: гейтваме БЕЗ `plan !== server.plan` — иначе задаване на СЪЩИЯ plan
    // пропуска гейта, но по-долу пише planSource="manual" върху платения абонат
    // → изключва го от MRR и разкача Stripe синхрона (находка на Разбивача).
    // Агенция-покритите сървъри също се пазят (агенцията може да е платена).
    const src = activePaidSubscription(server);
    if (src) {
      return res.status(409).json({
        error: `Server is covered by an active ${src} subscription. Cancel it in ${src === "stripe" ? "the Stripe Dashboard" : "Discord"} first, then set the manual plan.`,
        code: "ACTIVE_PAID_SUBSCRIPTION",
      });
    }

    let updated;

    if (plan === "agency5" || plan === "agency10") {
      const seatLimit = plan === "agency5" ? 5 : 10;
      updated = await prisma.$transaction(async (tx) => {
        // Преизползвай съществуваща manual агенция на същия собственик (идемпотентно).
        let agency = await tx.agency.findFirst({
          where: { ownerUserId: server.ownerId, planSource: "manual" },
        });
        if (agency) {
          agency = await tx.agency.update({
            where: { id: agency.id },
            data: { plan, seatLimit, active: true },
          });
        } else {
          agency = await tx.agency.create({
            data: { ownerUserId: server.ownerId, plan, seatLimit, planSource: "manual", active: true },
          });
        }
        // Закачи server → agency seat. Server.plan остава "free" по архитектура:
        // agency-покритите сървъри резолвват tier-а си от агенцията (premium.js).
        return tx.server.update({
          where: { id: server.id },
          data: {
            agencyId: agency.id,
            plan: "free",
            planSource: null,
            isPremium: true, // backward-compat флаг
            premiumSince: server.premiumSince || new Date(),
            archiveRetentionDays: null,
          },
        });
      });
    } else if (plan === "premium" || plan === "whitelabel") {
      updated = await prisma.server.update({
        where: { id: server.id },
        data: {
          plan,
          planSource: "manual",
          isPremium: true,
          premiumSince: server.premiumSince || new Date(),
          stripeStatus: server.stripeStatus || "manual",
          archiveRetentionDays: null,
          // Нов ръчен план замества стар гратис (over-grant guard).
          accessUntil: null,
          gracePlan: null,
          // Смъкване от manual agency seat, ако е имало
          ...(server.agency?.planSource === "manual" && { agencyId: null }),
        },
      });
    } else {
      // plan === "free" → пълен revoke (plan-first: само isPremium=false не стига)
      updated = await prisma.$transaction(async (tx) => {
        const data = {
          plan: "free",
          planSource: null,
          isPremium: false,
          billingInterval: null,
          archiveRetentionDays: 30,
          // Чистим trial следите — иначе getServerTier може да върне активен
          // пробен tier след ръчен revoke (Кодаджията).
          trialEndsAt: null,
          trialStartedAt: null,
          pastDueSince: null,
          // И гратисът пада: ръчният revoke е окончателен.
          accessUntil: null,
          gracePlan: null,
        };
        // Ако seat-ът идва от агенция — откачи. (manual: може да деактивираме
        // агенцията; платена вече е блокирана горе от hasPaidSub гейта.)
        if (server.agencyId) {
          data.agencyId = null;
          const remaining = await tx.server.count({
            where: { agencyId: server.agencyId, id: { not: server.id } },
          });
          if (remaining === 0) {
            await tx.agency.update({ where: { id: server.agencyId }, data: { active: false } });
          }
        }
        return tx.server.update({ where: { id: server.id }, data });
      });
    }

    await prisma.auditLog.create({
      data: {
        actorId: req.user.id,
        serverId: req.params.serverId,
        action: "PLAN_CHANGED_MANUAL",
        targetId: req.params.serverId,
        metadata: {
          from: server.plan,
          fromAgency: server.agencyId || null,
          to: plan,
          reason: reason || null,
          changedBy: req.user.username,
        },
      },
    });

    if (plan !== "free") {
      await prisma.paymentLog.create({
        data: {
          serverId: req.params.serverId,
          amount: 0,
          currency: "usd",
          status: "manual_grant",
          description: `Plan "${plan}" manually set by ${req.user.username}${reason ? ` — ${reason}` : ""}`,
        },
      });
    }

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/admin/servers/:serverId ─────────────────────────────────────────
// Full server detail with related counts — admin view of any server

router.get("/servers/:serverId", async (req, res, next) => {
  try {
    const server = await prisma.server.findUnique({
      where: { id: req.params.serverId },
      include: {
        _count: { select: { tickets: true, panels: true, forms: true, applications: true, members: true, paymentLogs: true } },
        paymentLogs: { orderBy: { createdAt: "desc" }, take: 20 },
      },
    });
    if (!server) return res.status(404).json({ error: "Server not found" });
    res.json(adminServerView(server));
  } catch (err) { next(err); }
});

// ─── PATCH /api/admin/servers/:serverId ───────────────────────────────────────
// Admin edit of server settings (log channels, retention, custom bot name/avatar)

router.patch("/servers/:serverId", async (req, res, next) => {
  const {
    name, logChannelId, archiveChannelId, archiveRetentionDays,
    customBotName, customBotAvatar,
    aiRepliesEnabled, aiRepliesPrompt,
    roundRobinEnabled, roundRobinRoleId,
  } = req.body;

  try {
    const updated = await prisma.server.update({
      where: { id: req.params.serverId },
      data: {
        ...(name !== undefined && { name }),
        ...(logChannelId !== undefined && { logChannelId: logChannelId || null }),
        ...(archiveChannelId !== undefined && { archiveChannelId: archiveChannelId || null }),
        ...(archiveRetentionDays !== undefined && { archiveRetentionDays }),
        ...(customBotName !== undefined && { customBotName: customBotName || null }),
        ...(customBotAvatar !== undefined && { customBotAvatar: customBotAvatar || null }),
        ...(aiRepliesEnabled !== undefined && { aiRepliesEnabled: Boolean(aiRepliesEnabled) }),
        ...(aiRepliesPrompt !== undefined && { aiRepliesPrompt: aiRepliesPrompt || null }),
        ...(roundRobinEnabled !== undefined && { roundRobinEnabled: Boolean(roundRobinEnabled) }),
        ...(roundRobinRoleId !== undefined && { roundRobinRoleId: roundRobinRoleId || null }),
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: req.user.id,
        serverId: req.params.serverId,
        action: "SERVER_EDITED_ADMIN",
        targetId: req.params.serverId,
        metadata: { changedBy: req.user.username, fields: Object.keys(req.body) },
      },
    });

    const { customBotToken: _t, ...safe } = updated;
    res.json(safe);
  } catch (err) { next(err); }
});

// ─── DELETE /api/admin/servers/:serverId ──────────────────────────────────────
// Hard-delete a server from the platform DB (also cascades tickets, panels, forms, etc.
// due to Prisma onDelete: CASCADE). Requires ?confirm=true.
// The bot will still be in the Discord guild — use the bot to leave manually if needed.

router.delete("/servers/:serverId", requireMainOwner, async (req, res, next) => {
  if (req.query.confirm !== "true") {
    return res.status(400).json({
      error: "Destructive action requires confirmation",
      hint: "Add ?confirm=true to confirm",
      action: "server_delete",
      targetId: req.params.serverId,
    });
  }

  try {
    const server = await prisma.server.findUnique({ where: { id: req.params.serverId } });
    if (!server) return res.status(404).json({ error: "Server not found" });

    // Log BEFORE delete — cascade removes audit logs linked to the server
    await prisma.auditLog.create({
      data: {
        actorId: req.user.id,
        serverId: null, // set to null so the log persists after cascade
        action: "SERVER_DELETED",
        targetId: req.params.serverId,
        metadata: {
          serverName: server.name,
          wasPremium: server.isPremium,
          deletedBy: req.user.username,
        },
      },
    });

    await prisma.server.delete({ where: { id: req.params.serverId } });

    res.json({ ok: true, deleted: req.params.serverId });
  } catch (err) { next(err); }
});

// ─── DELETE /api/admin/users/:userId ──────────────────────────────────────────
// Hard-delete a user account. Requires MAIN_OWNER + ?confirm=true.
// Tickets/applications created by this user are NOT deleted (onDelete: RESTRICT) —
// they remain anonymized with the old userId referenced.

router.delete("/users/:userId", requireMainOwner, async (req, res, next) => {
  if (req.query.confirm !== "true") {
    return res.status(400).json({
      error: "Destructive action requires confirmation",
      hint: "Add ?confirm=true to confirm",
      action: "user_delete",
      targetId: req.params.userId,
    });
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.userId } });
    if (!user) return res.status(404).json({ error: "User not found" });
    if (user.globalRole === "MAIN_OWNER") {
      return res.status(403).json({ error: "Cannot delete the Main Owner" });
    }

    // Check for created tickets/applications — if any, refuse (RESTRICT would fail anyway)
    const [ticketCount, appCount] = await Promise.all([
      prisma.ticket.count({ where: { creatorId: req.params.userId } }),
      prisma.application.count({ where: { userId: req.params.userId } }),
    ]);

    if (ticketCount > 0 || appCount > 0) {
      return res.status(400).json({
        error: "User has associated tickets/applications and cannot be deleted",
        hint: "Use blacklist instead — it's less destructive and preserves history",
        ticketCount,
        applicationCount: appCount,
      });
    }

    // Одитният запис се пише СЛЕД като всички откази са минали. Досега стоеше
    // ПРЕДИ проверката: отказано изтриване пак оставяше „USER_DELETED" в
    // дневника, тоест одитът твърдеше, че потребител е изтрит, а той съществува.
    // (Кодаджията, 07.08.2026)
    await prisma.auditLog.create({
      data: {
        actorId: req.user.id,
        actorTag: req.user.username,
        action: "USER_DELETED",
        targetId: req.params.userId,
        metadata: { username: user.username, deletedBy: req.user.username },
      },
    });

    await prisma.user.delete({ where: { id: req.params.userId } });
    res.json({ ok: true, deleted: req.params.userId });
  } catch (err) { next(err); }
});

// ─── DELETE /api/admin/payments/:paymentId ────────────────────────────────────
// Remove an erroneous manual payment log entry. Stripe-logged entries should
// NOT be deleted — they're part of the financial audit trail.

router.delete("/payments/:paymentId", requireMainOwner, async (req, res, next) => {
  if (req.query.confirm !== "true") {
    return res.status(400).json({
      error: "Destructive action requires confirmation",
      hint: "Add ?confirm=true to confirm",
    });
  }
  try {
    const p = await prisma.paymentLog.findUnique({ where: { id: req.params.paymentId } });
    if (!p) return res.status(404).json({ error: "Payment not found" });
    if (p.stripeInvoiceId) {
      return res.status(400).json({
        error: "Cannot delete Stripe-linked payment logs (financial audit trail)",
        hint: "Only manual grant entries may be removed",
      });
    }
    await prisma.paymentLog.delete({ where: { id: req.params.paymentId } });
    await prisma.auditLog.create({
      data: {
        actorId: req.user.id,
        action: "PAYMENT_LOG_DELETED",
        targetId: req.params.paymentId,
        metadata: { amount: p.amount, status: p.status, deletedBy: req.user.username },
      },
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ─── POST /api/admin/audit-logs/purge ─────────────────────────────────────────
// Bulk-purge audit logs older than N days. MAIN_OWNER only.

router.post("/audit-logs/purge", requireMainOwner, async (req, res, next) => {
  const { olderThanDays } = req.body;
  if (!Number.isInteger(olderThanDays) || olderThanDays < 30) {
    return res.status(400).json({
      error: "olderThanDays must be an integer >= 30",
      hint: "Audit logs younger than 30 days cannot be purged (legal retention)",
    });
  }
  try {
    const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
    const result = await prisma.auditLog.deleteMany({
      where: {
        createdAt: { lt: cutoff },
        // Never purge destructive actions — they must be preserved forever
        action: { notIn: [
          "USER_BLACKLISTED", "USER_UNBLACKLISTED", "USER_DELETED",
          "USER_ROLE_CHANGED", "SERVER_DELETED",
          "PREMIUM_GRANTED_MANUAL", "PREMIUM_REVOKED_MANUAL",
        ]},
      },
    });
    await prisma.auditLog.create({
      data: {
        actorId: req.user.id,
        action: "AUDIT_LOG_PURGE",
        metadata: { deleted: result.count, olderThanDays, purgedBy: req.user.username },
      },
    });
    res.json({ ok: true, deleted: result.count });
  } catch (err) { next(err); }
});

// ─── POST /api/admin/servers/:serverId/reset ──────────────────────────────────
// Wipe all panels/forms/tickets/applications for a server but keep the server record.
// Useful for "start fresh" without deleting the server itself or Stripe subscription.

router.post("/servers/:serverId/reset", requireMainOwner, async (req, res, next) => {
  if (req.query.confirm !== "true") {
    return res.status(400).json({
      error: "Destructive action requires confirmation",
      hint: "Add ?confirm=true to confirm — this deletes ALL panels, forms, tickets, applications for this server",
    });
  }

  try {
    const server = await prisma.server.findUnique({ where: { id: req.params.serverId } });
    if (!server) return res.status(404).json({ error: "Server not found" });

    const [tickets, applications, panels, forms] = await prisma.$transaction([
      prisma.ticket.deleteMany({ where: { serverId: req.params.serverId } }),
      prisma.application.deleteMany({ where: { serverId: req.params.serverId } }),
      prisma.panel.deleteMany({ where: { serverId: req.params.serverId } }),
      prisma.form.deleteMany({ where: { serverId: req.params.serverId } }),
    ]);

    await prisma.auditLog.create({
      data: {
        actorId: req.user.id,
        serverId: req.params.serverId,
        action: "SERVER_RESET",
        targetId: req.params.serverId,
        metadata: {
          tickets: tickets.count,
          applications: applications.count,
          panels: panels.count,
          forms: forms.count,
          resetBy: req.user.username,
        },
      },
    });

    res.json({
      ok: true,
      deleted: {
        tickets: tickets.count,
        applications: applications.count,
        panels: panels.count,
        forms: forms.count,
      },
    });
  } catch (err) { next(err); }
});

// ─── POST /api/admin/servers/:serverId/audit-message ──────────────────────────
// Post a system message to a specific server channel (admin broadcast).
// Sends via the bot internal API.

router.post("/servers/:serverId/broadcast", async (req, res, next) => {
  const { channelId, title, message } = req.body;
  if (!channelId || !message) return res.status(400).json({ error: "channelId and message required" });

  try {
    // Dynamically import to avoid circular dep
    const { notifyBot } = await import("../services/botNotifier.js");
    const result = await notifyBot("ADMIN_BROADCAST", {
      serverId: req.params.serverId,
      channelId,
      title: title || "Platform Notice",
      message,
      senderTag: req.user.username,
    });

    await prisma.auditLog.create({
      data: {
        actorId: req.user.id,
        serverId: req.params.serverId,
        action: "ADMIN_BROADCAST",
        targetId: channelId,
        metadata: { title, message: message.slice(0, 200), sentBy: req.user.username },
      },
    });

    res.json({ ok: true, result });
  } catch (err) { next(err); }
});

export default router;
