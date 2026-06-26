// backend/src/lib/premium.js
// Central source of truth for which features are Premium-gated.
// Routes and middleware reference this to keep enforcement consistent.

import { prisma } from "./prisma.js";

// ═══════════════════════════════════════════════════════════════════════════
// FEATURE MATRIX
// ═══════════════════════════════════════════════════════════════════════════
// Each entry: { label, category, reason }
// Keeping this centralized ensures dashboard, bot, and API all agree.

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
  "integrations.whiteLabel":   { label: "White-Label Bot",             category: "Integrations" },

  // ─── Data ──────────────────────────────────────────────────────────────
  "data.csvExport":            { label: "CSV Export",                  category: "Data" },
  "data.longRetention":        { label: "Unlimited Transcript Retention", category: "Data" },
  "data.panelDuplicate":       { label: "Duplicate Panels",            category: "Data" },
};

// ═══════════════════════════════════════════════════════════════════════════
// BASE TIER LIMITS (enforced everywhere)
// ═══════════════════════════════════════════════════════════════════════════
export const BASE_LIMITS = {
  panels:             1,
  forms:              2,
  questionsPerForm:   5,
  verificationPanels: 1,
  webhooks:           0,     // No webhooks on base tier
  stickiesPerServer:  0,     // No sticky on base
  scheduledPerServer: 0,     // No scheduled on base
  recurringScheduled: false, // No recurrence even if premium adds scheduled
  transcriptRetentionDays: 30,
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
};

// ═══════════════════════════════════════════════════════════════════════════
// ENFORCEMENT HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Load a server's premium status. Returns { isPremium, limits, isTrial, trialDaysLeft }.
 * A server counts as premium if `isPremium=true` OR has an active trial (`trialEndsAt > now`).
 */
export async function getServerTier(serverId) {
  const server = await prisma.server.findUnique({
    where: { id: serverId },
    select: { isPremium: true, trialEndsAt: true, trialStartedAt: true },
  });
  const now = new Date();
  const isTrial = !!(server?.trialEndsAt && server.trialEndsAt > now);
  const isPremium = !!server?.isPremium || isTrial;
  const trialDaysLeft = isTrial
    ? Math.ceil((server.trialEndsAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
    : 0;
  return {
    isPremium,
    isTrial,
    trialDaysLeft,
    limits: isPremium ? PREMIUM_LIMITS : BASE_LIMITS,
  };
}

/**
 * Express middleware — blocks non-premium servers from reaching a route.
 * Uses `req.params.serverId` to look up the server.
 *
 *   router.post("/foo", requirePremium("automation.sticky"), handler);
 */
export function requirePremium(featureKey) {
  return async function premiumGate(req, res, next) {
    const serverId = req.params.serverId;
    if (!serverId) return res.status(400).json({ error: "serverId required" });

    const { isPremium } = await getServerTier(serverId);
    if (!isPremium) {
      const feature = PREMIUM_FEATURES[featureKey];
      return res.status(403).json({
        error: `This feature requires Premium.`,
        code: "PREMIUM_REQUIRED",
        feature: featureKey,
        featureLabel: feature?.label || featureKey,
        category: feature?.category,
      });
    }
    next();
  };
}

/**
 * Strip Premium-only fields from a request body for non-premium servers.
 * Returns the sanitized object. Logs the stripped fields in development.
 */
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
 * For routes that accept both base and premium fields — applies premium
 * guards per-field and returns a 403 with specific details if any premium
 * field is set without an active subscription.
 *
 * Returns null on success, or a { status, body } error response object.
 */
export async function validatePremiumFields(serverId, body, fieldMap) {
  const { isPremium } = await getServerTier(serverId);
  if (isPremium) return null;

  const violations = [];
  for (const [field, featureKey] of Object.entries(fieldMap)) {
    if (body[field] != null && body[field] !== "" && body[field] !== false &&
        !(Array.isArray(body[field]) && body[field].length === 0)) {
      const feat = PREMIUM_FEATURES[featureKey];
      violations.push({ field, feature: featureKey, label: feat?.label });
    }
  }
  if (!violations.length) return null;
  return {
    status: 403,
    body: {
      error: `Premium required for: ${violations.map((v) => v.label || v.field).join(", ")}`,
      code: "PREMIUM_REQUIRED",
      violations,
    },
  };
}
