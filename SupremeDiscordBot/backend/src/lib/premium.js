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
  "integrations.restApi":      { label: "Public REST API",             category: "Integrations" },
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
// TIER SANITIZATION — гейт при ЧЕТЕНЕ, не само при запис
// ═══════════════════════════════════════════════════════════════════════════
// Premium полетата на панела се записваха гейтнати (validatePremiumFields), но
// ботът ги ИЗПЪЛНЯВА суров, ако са truthy — независимо от tier. Значи свален на
// free сървър (seat detach, отмяна, дунинг) продължаваше да праща DM при отваряне,
// да добавя observer роли, да авто-затваря по неактивност и т.н. от запазените
// стойности. Тук ги нулираме според ЕФЕКТИВНИЯ план, преди конфигът да стигне
// до бота. Всяко поле → своя feature ключ. (Одит 07.08.2026)
const PANEL_FEATURE_STRIP = {
  "panel.dmOnOpen":            (p) => { p.dmOnOpen = false; p.dmOnOpenMessage = null; },
  "panel.dmOnClose":           (p) => { p.dmOnClose = false; p.dmOnCloseMessage = null; },
  // Двустъпковото затваряне (closeAskEnabled) е базово; само CUSTOM текстът е premium.
  "panel.closeAskMessage":     (p) => { p.closeAskMessage = null; },
  "panel.feedbackEnabled":     (p) => { p.feedbackEnabled = false; },
  "panel.inactivityAutoClose": (p) => { p.inactivityCloseHours = null; },
  "panel.autoCloseOnLeave":    (p) => { p.autoCloseOnLeave = false; },
  "panel.observerRoles":       (p) => { p.observerRoleIds = []; },
  "panel.sla":                 (p) => { p.slaFirstResponseMinutes = null; p.slaResolutionMinutes = null; },
  "panel.multipleCategories":  (p) => { p.categoryClosedId = null; },
};

/** Нулира premium полетата на панел, които планът не покрива. Мутира и връща p. */
export function sanitizePanelForTier(panel, plan) {
  if (!panel) return panel;
  for (const [featureKey, strip] of Object.entries(PANEL_FEATURE_STRIP)) {
    if (!planHasFeature(plan, featureKey)) strip(panel);
  }
  return panel;
}

// ─── Форми ────────────────────────────────────────────────────────────────────
// ЗАЩО (червен екип, одит 07.08.2026): premium полетата на формите се гейтваха
// САМО при запис (`routes/forms.js`). Тоест клиент, който е конфигурирал
// cooldown, таван на подаванията, regex валидация и разклоняване, докато е
// плащал, продължаваше да ги ползва след свалянето на плана — `routes/bot.js`
// връщаше формите сурови, а `applicationSubmit.js` изпълняваше правилата, без
// изобщо да пита за тарифа. Панелите вече бяха покрити; формите — не.
//
// Това е дефектен клас Г: гейт на ЗАПИСА, не на ИЗПЪЛНЕНИЕТО. Записът е само
// една от вратите; изпълнението е единственото място, което наистина решава.
const FORM_FEATURE_STRIP = {
  "form.autoRoleOnReview": (f) => { f.acceptRoleIds = []; f.denyRoleIds = []; f.removeRoleIds = []; },
  "form.customDmMessages": (f) => { f.acceptMessage = null; f.denyMessage = null; },
  "form.cooldowns":        (f) => { f.cooldownSeconds = 0; f.maxSubmissions = null; },
};

const QUESTION_FEATURE_STRIP = {
  "form.validationRegex":      (q) => { q.validationRegex = null; q.validationMessage = null; },
  "form.conditionalBranching": (q) => { q.branches = null; },
};

/**
 * Нулира premium полетата на форма (и на въпросите ѝ), които планът не покрива.
 * Мутира и връща формата — същият договор като `sanitizePanelForTier`.
 */
export function sanitizeFormForTier(form, plan) {
  if (!form) return form;
  for (const [featureKey, strip] of Object.entries(FORM_FEATURE_STRIP)) {
    if (!planHasFeature(plan, featureKey)) strip(form);
  }
  for (const q of form.questions || []) {
    for (const [featureKey, strip] of Object.entries(QUESTION_FEATURE_STRIP)) {
      if (!planHasFeature(plan, featureKey)) strip(q);
    }
  }
  return form;
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
  // grandfather-нати абонати (иначе webhook-ът би ги „свалил“ на грешен план).
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

/**
 * Кои платени двойки (тарифа × период) НЯМАТ конфигурирана Stripe цена.
 *
 * ЗАЩО (VPS-аджията, одит 07.08.2026): `.env.example` носеше само наследения
 * `STRIPE_PRICE_ID`, а `stripePriceMap()` е тих — липсващ env просто не влиза в
 * картата. Деплой по образеца значи ЧАСТИЧНО конфигурирани цени, а частичното
 * е по-опасно от липсващото: checkout за конфигурираните тарифи работи, но
 * webhook-ът не може да върже платената цена към план и пада на резервния клон
 * (`routes/stripe.js`), който дава „premium“. Клиент плаща Agency 10 за €39.99
 * и получава Premium. Нищо не гърми, парите влизат, правата са грешни.
 *
 * Затова стартът изброява липсите на глас, вместо да ги преглътне.
 */
export function missingStripePrices() {
  const gaps = [];
  for (const plan of ["premium", "whitelabel", "agency5", "agency10"]) {
    for (const interval of ["month", "year"]) {
      if (!stripePriceId(plan, interval)) {
        gaps.push(`STRIPE_PRICE_${plan.toUpperCase()}_${interval.toUpperCase()}`);
      }
    }
  }
  return gaps;
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
      accessUntil: true, gracePlan: true, planSource: true, stripeStatus: true,
      agency: { select: { plan: true, active: true, seatLimit: true } },
    },
  });

  const now = new Date();
  const isTrial = !!(server?.trialEndsAt && server.trialEndsAt > now);
  const trialDaysLeft = isTrial
    ? Math.ceil((server.trialEndsAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
    : 0;

  // Собственият платен план. Колоната `plan` е ЕДИНСТВЕНИЯТ авторитет тук —
  // сурово `isPremium` НЕ се превежда в тарифа на това място (виж по-долу).
  let paidPlan = server?.plan && server.plan !== "free" ? server.plan : "free";

  // v40 — ОТМЕНЕН, но платен до края на периода. Клиентът е платил текущия
  // период и го ползва докрай; `plan` вече е паднал на "free", затова тук
  // връщаме тарифата, за която е платено (`gracePlan`). При refund/chargeback
  // и двете колони се зануляват, значи този клон не се задейства — точно
  // каквото искаме: върнати пари → отнет достъп веднага.
  //
  // `higherPlan`, а не присвояване: gracePlan никога не бива да СВАЛЯ жив план
  // (напр. клиент отмени, после веднага купи по-висок — accessUntil още стои).
  const graceActive = !!(server?.accessUntil && server.accessUntil > now);
  if (graceActive) {
    paidPlan = higherPlan(paidPlan, server.gracePlan || "premium");
  }

  // Agency seat overrides when the agency is active and actually covers us.
  if (server?.agencyId && server.agency?.active) {
    paidPlan = higherPlan(paidPlan, server.agency.plan || "free");
  }

  // ПОСЛЕДНА инстанция: платено е (сурово `isPremium`), но никой по-конкретен
  // източник не каза КОЯ тарифа.
  //
  // Дефектът (червен екип, 07.08.2026): този клон стоеше ПРЪВ и превеждаше
  // `isPremium` направо в „whitelabel“. Само че v40 нарочно пише точно това
  // състояние — при отмяна с гратис `stripe.js` записва `isPremium: true` +
  // `plan: "free"` (виж routes/stripe.js:839-840). Резултат: ВСЕКИ отменен
  // Premium клиент получаваше White-label — тарифа с +1 ранг, за която не е
  // плащал, и то тъкмо докато си тръгва. Същото при out-of-order webhook:
  // `syncServerPaidFlag` вдига `isPremium` по жив абонамент, преди `plan` да е
  // записан.
  //
  // „Наследени“ редове тук вече НЯМА: миграция v27 попълни
  // `plan='whitelabel'` за всеки `isPremium=true` ред
  // (`20260709000000_v27_tiers_agency_discord/migration.sql:15-16`), тоест
  // истински наследник не стига дотук с `plan='free'`. Затова падаме на
  // НАЙ-НИСКАТА платена тарифа: знаем, че е платено, не знаем за какво —
  // при съмнение даваме по-малкото, а не по-голямото.
  if (paidPlan === "free" && server?.isPremium) paidPlan = "premium";

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
// PRISMA WHERE FRAGMENTS — „ефективно premium“
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
      { accessUntil: { gt: now } },   // v40 — отменен, но платен до края
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
      { OR: [{ accessUntil: null }, { accessUntil: { lte: now } }] },  // v40
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
// Статуси на Stripe, при които СОБСТВЕН абонамент е ЖИВ и плаща. Allowlist, не
// denylist — това е урокът от червения екип (07.08.2026):
//
// Старата версия пазеше isPremium, ако статусът НЕ е в списък с „прекратени“.
// Това е fail-OPEN: всеки статус, който не сме предвидили (`paused`,
// `incomplete`, празен, бъдещ Stripe статус), минаваше за „още плаща“. В комбо
// с това, че закачането на agency seat вдига isPremium, се получаваше
// резурекция: закачи сървър с МЪРТЪВ абонамент на агенция → isPremium=true;
// откачи го → „не е в терминалния списък“ → остава платен ЗАВИНАГИ, без никой
// да плаща. Allowlist-ът е fail-CLOSED: пазим достъп само при ПОЛОЖИТЕЛНО
// доказателство за жив абонамент.
//
// `past_due` е тук нарочно: дунинг гратис (jobs/dunning.js сваля достъпа отделно
// след 14 дни, като пише `unpaid`). Всичко друго — прекратено, непълно,
// паузирано, непознато — НЕ пази достъп през тази клауза.
const LIVE_OWN_SUB_STATUSES = new Set(["active", "trialing", "past_due"]);

export async function syncServerPaidFlag(serverId, tx = prisma) {
  const server = await tx.server.findUnique({
    where: { id: serverId },
    select: {
      isPremium: true, plan: true, planSource: true, stripeSubscriptionId: true,
      stripeStatus: true, accessUntil: true, archiveRetentionDays: true,
      agencyId: true, agency: { select: { active: true } },
    },
  });
  if (!server) return false;

  const now = new Date();
  const ownPaid = !!server.plan && server.plan !== "free";
  const agencyCovered = !!(server.agencyId && server.agency?.active);

  // v40 — ОТМЕНЕН, но платен до края на периода. Живият гратис Е платено
  // състояние: суровата колона трябва да го отразява, иначе четците на
  // isPremium (bot config, dashboard, panel функции) мълчаливо го третират като
  // безплатен, докато `getServerTier` едновременно връща платения план — двете
  // се разминават. (Червен екип R2, 07.08.2026)
  const graceActive = !!(server.accessUntil && server.accessUntil > now);

  // Собствен абонамент, ЖИВ по статуса си, но с още незаписан `plan` (out-of-
  // order webhook: subscription.updated ПРЕДИ checkout.session.completed).
  // Изисква ПОЛОЖИТЕЛНО доказателство: жив статус + реален собствен абонамент.
  const status = String(server.stripeStatus || "").toLowerCase();
  const ownSubLive = !ownPaid
    && LIVE_OWN_SUB_STATUSES.has(status)
    && (!!server.stripeSubscriptionId || !!server.planSource);

  const shouldBe = ownPaid || agencyCovered || graceActive || ownSubLive;

  const data = {};
  if (server.isPremium !== shouldBe) data.isPremium = shouldBe;
  // Ретенцията на транскрипти е premium (null = безсрочно). При СВАЛЯНЕ я връщаме
  // на базовите 30 дни ТУК, синхронно — иначе сваленият сървър пазеше транскрипти
  // безсрочно до неделния клийнъп (до 7 дни прозорец). Пипаме само когато е била
  // „безсрочно“ (null) — не разваляме друга стойност. (Кодаджията одит 07.08.2026)
  if (!shouldBe && server.archiveRetentionDays === null) data.archiveRetentionDays = 30;

  if (Object.keys(data).length) {
    await tx.server.update({ where: { id: serverId }, data });
  }
  return shouldBe;
}

/** Синхронизира всички сървъри, покрити от дадена агенция (при активация/край). */
export async function syncAgencyServersPaidFlag(agencyId, tx = prisma) {
  const servers = await tx.server.findMany({ where: { agencyId }, select: { id: true } });

  // ВСЕКИ сървър се синхронизира НЕЗАВИСИМО. Първата версия беше гол
  // `for … await` без улавяне: един проблемен ред (изчезнал между findMany и
  // update → P2025, или мигновена DB грешка) прекъсваше цикъла и ОСТАНАЛИТЕ
  // сървъри на агенцията оставаха със стар `isPremium`. А всичките шест
  // повиквания са обвити в `.catch(() => {})`, значи провалът беше и ТИХ:
  // промяна по ЕДИН сървър оставяше ДРУГИ наематели в грешно състояние, без
  // следа. Точно класът „едно действие чупи чужд сървър“. (Одит 07.08.2026)
  const failed = [];
  for (const s of servers) {
    try {
      await syncServerPaidFlag(s.id, tx);
    } catch (err) {
      failed.push({ serverId: s.id, error: err?.message });
    }
  }

  if (failed.length) {
    // НЕ хвърляме: частичният синхрон не бива да отменя вече записания паричен
    // ефект на webhook-а. Но мълчанието е по-лошо от шума — казваме кои.
    console.error(
      `[premium] syncAgencyServersPaidFlag(${agencyId}): ${failed.length}/${servers.length} се провалиха —`,
      failed.map((f) => `${f.serverId}: ${f.error}`).join(" · "),
    );
  }
  return { total: servers.length, synced: servers.length - failed.length, failed };
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
