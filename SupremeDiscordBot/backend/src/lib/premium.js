// backend/src/lib/premium.js
// Central source of truth for tiers, feature-gating and limits.
// Routes, middleware, the bot and the public API all reference this so
// enforcement stays consistent.
//
// v3.0 tier ladder (see docs/PRICING.md):
//   free       — base limits, no premium features
//   premium    — €4.99/mo · €49/yr — all premium features EXCEPT white-label
//   whitelabel — €9.99/mo · €99/yr — premium + white-label custom bot
//   agency5    — €19.99/mo · €199/yr — white-label tier for up to 5 servers
//   agency10   — €39.99/mo · €399/yr — white-label tier for up to 10 servers
//
// `Server.isPremium` (boolean) is retained and kept in sync (true ⇔ plan≠free)
// for backward-compat; the authoritative value is the resolved plan.

import { prisma } from "./prisma.js";

// ═══════════════════════════════════════════════════════════════════════════
// FEATURE MATRIX
// ═══════════════════════════════════════════════════════════════════════════
// Each entry: { label, category }. `minPlan` (optional) raises the tier a
// feature needs; default is "premium". Only white-label lives higher.

export const PREMIUM_FEATURES = {
  // ─── Ticket panel features ─────────────────────────────────────────────
  "panel.observerRoles":       { label: "Observer Roles",              category: "Tickets" },
  "panel.dmOnOpen":            { label: "DM on Ticket Open",           category: "Tickets" },
  "panel.dmOnClose":           { label: "DM on Ticket Close",          category: "Tickets" },
  "panel.closeAskMessage":     { label: "Custom Close Confirmation",   category: "Tickets" },
  "panel.feedbackEnabled":     { label: "Feedback Ratings",            category: "Tickets" },
  "panel.inactivityAutoClose": { label: "Inactivity Auto-Close",       category: "Tickets" },
  "panel.autoCloseOnLeave":    { label: "Auto-Close on User Leave",    category: "Tickets" },
  "panel.multipleCategories":  { label: "Separate Open/Closed Categories", category: "Tickets" },
  "panel.unlimitedCount":      { label: "Unlimited Panels",            category: "Tickets" },
  "panel.sla":                 { label: "SLA Tracking",                category: "Tickets" },

  // ─── Ticket actions ────────────────────────────────────────────────────
  "ticket.claim":              { label: "Ticket Claiming",             category: "Tickets" },
  "ticket.escalate":           { label: "Panel Escalation",            category: "Tickets" },
  "ticket.rename":             { label: "Rename Tickets",              category: "Tickets" },

  // ─── Forms / Applications ──────────────────────────────────────────────
  "form.conditionalBranching": { label: "Conditional Form Branching",  category: "Forms" },
  "form.validationRegex":      { label: "Regex Validation",            category: "Forms" },
  "form.cooldowns":            { label: "Submission Cooldowns",        category: "Forms" },
  "form.autoRoleOnReview":     { label: "Auto Role on Accept/Deny",    category: "Forms" },
  "form.customDmMessages":     { label: "Custom DM Messages",          category: "Forms" },
  "form.maxQuestions50":       { label: "50 Questions per Form",       category: "Forms" },
  "form.unlimited":            { label: "Unlimited Forms",             category: "Forms" },

  // ─── Verification ──────────────────────────────────────────────────────
  "verification.mathCaptcha":  { label: "Math Captcha Verification",   category: "Verification" },
  "verification.accountAge":   { label: "Account Age Requirement",     category: "Verification" },

  // ─── Automation ────────────────────────────────────────────────────────
  "automation.sticky":         { label: "Sticky Messages",             category: "Automation" },
  "automation.scheduled":      { label: "Scheduled Messages",          category: "Automation" },
  "automation.recurring":      { label: "Recurring Messages",          category: "Automation" },

  // ─── Integrations ──────────────────────────────────────────────────────
  "integrations.webhooks":     { label: "Webhook Integrations",        category: "Integrations" },
  "integrations.roundRobin":   { label: "Round-Robin Assignment",      category: "Integrations" },
  "integrations.aiReplies":    { label: "AI Auto-Replies",             category: "Integrations" },
  // White-label lives one tier above the rest.
  "integrations.whiteLabel":   { label: "White-Label Bot",             category: "Integrations", minPlan: "whitelabel" },

  // ─── Data ──────────────────────────────────────────────────────────────
  "data.csvExport":            { label: "CSV Export",                  category: "Data" },
  "data.longRetention":        { label: "Unlimited Transcript Retention", category: "Data" },
  "data.panelDuplicate":       { label: "Duplicate Panels",            category: "Data" },
};

// ═══════════════════════════════════════════════════════════════════════════
// LIMITS
// ═══════════════════════════════════════════════════════════════════════════
export const BASE_LIMITS = {
  panels:             1,
  forms:              2,
  questionsPerForm:   5,
  verificationPanels: 1,
  webhooks:           0,
  stickiesPerServer:  0,
  scheduledPerServer: 0,
  recurringScheduled: false,
  transcriptRetentionDays: 30,
  kbArticles:         3, // v32 — Knowledge Base
  reactionRoleMessages: 2, // v33 — Reaction Roles
};

export const PREMIUM_LIMITS = {
  panels:             50,
  forms:              50,
  questionsPerForm:   50,
  verificationPanels: 10,
  webhooks:           20,
  stickiesPerServer:  100,
  scheduledPerServer: 100,
  recurringScheduled: true,
  transcriptRetentionDays: null, // null = forever
  kbArticles:         50, // v32 — Knowledge Base
  reactionRoleMessages: 25, // v33 — Reaction Roles
};

// ═══════════════════════════════════════════════════════════════════════════
// PLANS
// ═══════════════════════════════════════════════════════════════════════════
// rank is used for "does plan X satisfy feature/limit Y" comparisons.
export const PLANS = {
  free:       { rank: 0, id: "free",       label: "Free",        whiteLabel: false, maxServers: 1,  limits: BASE_LIMITS },
  premium:    { rank: 1, id: "premium",    label: "Premium",     whiteLabel: false, maxServers: 1,  limits: PREMIUM_LIMITS },
  whitelabel: { rank: 2, id: "whitelabel", label: "White-label", whiteLabel: true,  maxServers: 1,  limits: PREMIUM_LIMITS },
  agency5:    { rank: 3, id: "agency5",    label: "Agency 5",    whiteLabel: true,  maxServers: 5,  limits: PREMIUM_LIMITS },
  agency10:   { rank: 4, id: "agency10",   label: "Agency 10",   whiteLabel: true,  maxServers: 10, limits: PREMIUM_LIMITS },
};

export const AGENCY_PLANS = ["agency5", "agency10"];

/** Normalize an arbitrary plan string to a known plan config (defaults to free). */
export function planConfig(plan) {
  return PLANS[plan] || PLANS.free;
}

/** Minimum plan rank a feature requires. */
function featureMinRank(featureKey) {
  const min = PREMIUM_FEATURES[featureKey]?.minPlan;
  return min ? planConfig(min).rank : PLANS.premium.rank;
}

/** Does a resolved plan satisfy a feature? */
export function planHasFeature(plan, featureKey) {
  return planConfig(plan).rank >= featureMinRank(featureKey);
}

// ═══════════════════════════════════════════════════════════════════════════
// STRIPE PRICE ↔ PLAN and DISCORD SKU ↔ PLAN mapping (env-driven)
// ═══════════════════════════════════════════════════════════════════════════
// Populate these envs from scripts/stripe-setup.sh output / Discord Dev Portal.

function stripePriceMap() {
  const e = process.env;
  const m = new Map();
  // Всеки env може да носи СПИСЪК от price id-та (запетая-разделен): при
  // ценова промяна Stripe цените са неизменими → новата е ПЪРВА (checkout),
  // старите остават в списъка, за да се разпознават при подновяване на
  // grandfather-нати абонати (иначе webhook-ът би ги „свалил" на грешен план).
  const add = (ids, plan, interval) => {
    for (const id of String(ids || "").split(",").map((s) => s.trim()).filter(Boolean)) {
      m.set(id, { plan, interval });
    }
  };
  add(e.STRIPE_PRICE_PREMIUM_MONTH,    "premium",    "month");
  add(e.STRIPE_PRICE_PREMIUM_YEAR,     "premium",    "year");
  add(e.STRIPE_PRICE_WHITELABEL_MONTH, "whitelabel", "month");
  add(e.STRIPE_PRICE_WHITELABEL_YEAR,  "whitelabel", "year");
  add(e.STRIPE_PRICE_AGENCY5_MONTH,    "agency5",    "month");
  add(e.STRIPE_PRICE_AGENCY5_YEAR,     "agency5",    "year");
  add(e.STRIPE_PRICE_AGENCY10_MONTH,   "agency10",   "month");
  add(e.STRIPE_PRICE_AGENCY10_YEAR,    "agency10",   "year");
  // Legacy single price (€9.99 which historically INCLUDED white-label) →
  // grandfather those subscribers into the white-label tier.
  add(e.STRIPE_PRICE_ID, "whitelabel", "month");
  return m;
}

/** Resolve { plan, interval } for a Stripe price id, or null if unknown. */
export function planFromStripePrice(priceId) {
  if (!priceId) return null;
  return stripePriceMap().get(priceId) || null;
}

/** Look up the configured Stripe price id for a (plan, interval) pair.
 *  При списък (ценова промяна) checkout-ът ползва ПЪРВИЯ — текущата цена. */
export function stripePriceId(plan, interval) {
  const key = `STRIPE_PRICE_${plan.toUpperCase()}_${interval === "year" ? "YEAR" : "MONTH"}`;
  const raw = process.env[key] || "";
  return raw.split(",").map((s) => s.trim()).filter(Boolean)[0] || null;
}

function discordSkuMap() {
  const e = process.env;
  const m = new Map();
  const add = (id, plan) => { if (id) m.set(id, plan); };
  add(e.DISCORD_SKU_PREMIUM,    "premium");
  add(e.DISCORD_SKU_WHITELABEL, "whitelabel");
  add(e.DISCORD_SKU_AGENCY5,    "agency5");
  add(e.DISCORD_SKU_AGENCY10,   "agency10");
  return m;
}

/** Resolve a plan for a Discord SKU id, or null if unknown. */
export function planFromDiscordSku(skuId) {
  if (!skuId) return null;
  return discordSkuMap().get(String(skuId)) || null;
}

// ═══════════════════════════════════════════════════════════════════════════
// TIER RESOLUTION
// ═══════════════════════════════════════════════════════════════════════════

function higherPlan(a, b) {
  return planConfig(a).rank >= planConfig(b).rank ? a : b;
}

/**
 * Resolve a server's effective tier, combining its own subscription, an active
 * trial (which grants the Premium tier — never white-label), and any Agency
 * seat that covers it.
 *
 * Returns { plan, planRank, planLabel, isPremium, hasWhiteLabel, isTrial,
 *           trialDaysLeft, limits, maxServers }.
 * `isPremium`/`isTrial`/`trialDaysLeft`/`limits` are kept for backward-compat.
 */
export async function getServerTier(serverId) {
  const server = await prisma.server.findUnique({
    where: { id: serverId },
    select: {
      isPremium: true, plan: true, trialEndsAt: true, agencyId: true,
      agency: { select: { plan: true, active: true, seatLimit: true } },
    },
  });

  const now = new Date();
  const isTrial = !!(server?.trialEndsAt && server.trialEndsAt > now);
  const trialDaysLeft = isTrial
    ? Math.ceil((server.trialEndsAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
    : 0;

  // Own paid plan. Fall back to isPremium=true (legacy rows without `plan`) →
  // treat as white-label so grandfathered subscribers keep what they had.
  let paidPlan = server?.plan && server.plan !== "free"
    ? server.plan
    : (server?.isPremium ? "whitelabel" : "free");

  // Agency seat overrides when the agency is active and actually covers us.
  if (server?.agencyId && server.agency?.active) {
    paidPlan = higherPlan(paidPlan, server.agency.plan || "free");
  }

  const trialPlan = isTrial ? "premium" : "free";
  const plan = higherPlan(paidPlan, trialPlan);
  const cfg = planConfig(plan);

  return {
    plan,
    planRank: cfg.rank,
    planLabel: cfg.label,
    isPremium: cfg.rank >= PLANS.premium.rank,
    hasWhiteLabel: cfg.whiteLabel,
    isTrial,
    trialDaysLeft,
    limits: cfg.limits,
    maxServers: cfg.maxServers,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// PRISMA WHERE FRAGMENTS — „ефективно premium"
// ═══════════════════════════════════════════════════════════════════════════
// Agency seat НЕ сетва Server.isPremium/plan (покритието се резолвира в
// getServerTier през agency.active), а trial живее само в trialEndsAt. Затова
// batch заявки, които гейтват на суровия isPremium, изпускат agency-покрити и
// trial сървъри (напр. изтриване на транскрипти на платен agency клиент).
// Всички списъчни заявки трябва да минават през тези фрагменти.

/** Server е ефективно premium: собствен план ИЛИ активен trial ИЛИ активна агенция. */
export function effectivePremiumWhere(now = new Date()) {
  return {
    OR: [
      { isPremium: true },
      { trialEndsAt: { gt: now } },
      { agency: { is: { active: true } } },
    ],
  };
}

/** Отрицанието: server НЕ Е ефективно premium (за free-tier клийнъп заявки). */
export function effectiveFreeWhere(now = new Date()) {
  return {
    AND: [
      { isPremium: false },
      { OR: [{ trialEndsAt: null }, { trialEndsAt: { lte: now } }] },
      { OR: [{ agencyId: null }, { agency: { is: { active: false } } }] },
    ],
  };
}

/**
 * Синхронизира суровата `Server.isPremium` колона спрямо ПЛАТЕНОТО състояние:
 * собствен план (≠free) ИЛИ активен agency seat. Trial НЕ участва тук — той
 * живее в `trialEndsAt` и се OR-ва при четене (виж effectivePremiumWhere).
 *
 * Викай след ВСЕКИ agency преход (attach/detach seat, активация/деактивация на
 * агенция). Без това колоната остава false за agency-покрит сървър, а всички
 * четци на суровата колона (bot config, dashboard, panel функции) го третират
 * като безплатен — платената функция мълчи. Идемпотентно; тихо при липсващ ред.
 */
export async function syncServerPaidFlag(serverId, tx = prisma) {
  const server = await tx.server.findUnique({
    where: { id: serverId },
    select: { isPremium: true, plan: true, agencyId: true, agency: { select: { active: true } } },
  });
  if (!server) return false;
  const ownPaid = !!server.plan && server.plan !== "free";
  const agencyCovered = !!(server.agencyId && server.agency?.active);
  const shouldBe = ownPaid || agencyCovered;
  if (server.isPremium !== shouldBe) {
    await tx.server.update({ where: { id: serverId }, data: { isPremium: shouldBe } });
  }
  return shouldBe;
}

/** Синхронизира всички сървъри, покрити от дадена агенция (при активация/край). */
export async function syncAgencyServersPaidFlag(agencyId, tx = prisma) {
  const servers = await tx.server.findMany({ where: { agencyId }, select: { id: true } });
  for (const s of servers) await syncServerPaidFlag(s.id, tx);
  return servers.length;
}

// ═══════════════════════════════════════════════════════════════════════════
// ENFORCEMENT HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Express middleware — blocks servers whose tier doesn't include `featureKey`.
 *   router.post("/foo", requirePremium("automation.sticky"), handler);
 * White-label endpoints use requirePremium("integrations.whiteLabel") and now
 * correctly require the White-label (or Agency) tier.
 */
export function requirePremium(featureKey) {
  return async function premiumGate(req, res, next) {
    const serverId = req.params.serverId;
    if (!serverId) return res.status(400).json({ error: "serverId required" });

    const tier = await getServerTier(serverId);
    if (!planHasFeature(tier.plan, featureKey)) {
      const feature = PREMIUM_FEATURES[featureKey];
      const needed = feature?.minPlan || "premium";
      return res.status(403).json({
        error: `This feature requires the ${planConfig(needed).label} plan.`,
        code: "PREMIUM_REQUIRED",
        feature: featureKey,
        featureLabel: feature?.label || featureKey,
        category: feature?.category,
        requiredPlan: needed,
        currentPlan: tier.plan,
      });
    }
    next();
  };
}

/** Strip Premium-only fields from a request body for non-premium servers. */
export function stripPremiumFields(body, premiumFields) {
  const clean = { ...body };
  const stripped = [];
  for (const field of premiumFields) {
    if (field in clean) {
      stripped.push(field);
      delete clean[field];
    }
  }
  if (stripped.length && process.env.NODE_ENV !== "production") {
    console.log(`[premium] Stripped non-premium fields: ${stripped.join(", ")}`);
  }
  return { cleaned: clean, stripped };
}

/**
 * Per-field premium guard. `fieldMap` maps a body field → feature key; a set
 * field whose feature the current tier lacks yields a 403 with details.
 * Returns null on success, or { status, body }.
 */
export async function validatePremiumFields(serverId, body, fieldMap) {
  const tier = await getServerTier(serverId);

  const violations = [];
  for (const [field, featureKey] of Object.entries(fieldMap)) {
    const set = body[field] != null && body[field] !== "" && body[field] !== false &&
      !(Array.isArray(body[field]) && body[field].length === 0);
    if (set && !planHasFeature(tier.plan, featureKey)) {
      const feat = PREMIUM_FEATURES[featureKey];
      violations.push({ field, feature: featureKey, label: feat?.label, requiredPlan: feat?.minPlan || "premium" });
    }
  }
  if (!violations.length) return null;
  return {
    status: 403,
    body: {
      error: `Upgrade required for: ${violations.map((v) => v.label || v.field).join(", ")}`,
      code: "PREMIUM_REQUIRED",
      violations,
    },
  };
}
