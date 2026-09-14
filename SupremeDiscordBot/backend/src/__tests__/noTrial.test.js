// backend/src/__tests__/noTrial.test.js
// v3.3 — „Махни trial от всякъде“ (собственикът, 12.09.2026). Гейт срещу
// ВРЪЩАНЕ на пробния период по който и да е път — код, конфигурация, UI, i18n,
// правни текстове, prerender, llms.txt.
//
// Единственото позволено: четене на `trialEndsAt` в lib/premium.js и
// огледалата му (заварени пробни периоди изтичат сами; sunset ≤14 дни), плюс
// Stripe статусът `trialing` (легаси стойност на Stripe, не наша функция).
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf-8");

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist" || name === "__tests__" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(jsx?|mjs|json|txt|md)$/.test(name)) out.push(p);
  }
  return out;
}

describe("backend — няма път за стартиране на пробен период", () => {
  it("маршрутът /api/trial и файлът routes/trial.js ги няма", () => {
    expect(existsSync(join(ROOT, "backend/src/routes/trial.js"))).toBe(false);
    const index = read("backend/src/index.js");
    expect(index).not.toMatch(/api\/trial/);
    expect(index).not.toMatch(/routes\/trial\.js/);
  });

  it("Stripe checkout не подава trial_period_days и не чете STRIPE_TRIAL_DAYS", () => {
    const stripe = read("backend/src/routes/stripe.js");
    expect(stripe).not.toContain("trial_period_days");
    expect(stripe).not.toContain("STRIPE_TRIAL_DAYS");
    expect(read("backend/.env.example")).not.toContain("STRIPE_TRIAL_DAYS");
  });

  it("scheduler-ът няма trial задача", () => {
    const s = read("backend/src/services/scheduler.js");
    expect(s).not.toContain('"trial-expiry-dm"');
    expect(s).not.toContain("sendTrialDm");
  });

  it("никой не пише trialStartedAt/trialUsed (само четене до изтичане)", () => {
    for (const f of walk(join(ROOT, "backend/src"))) {
      const src = readFileSync(f, "utf-8");
      expect(src, f).not.toMatch(/trialStartedAt\s*:/);
      expect(src, f).not.toMatch(/trialUsed\s*:\s*true/);
    }
  });

  it("GET /api/servers/:id не излъчва trial полета", () => {
    const s = read("backend/src/routes/servers.js");
    expect(s).not.toMatch(/response\.(isTrial|trialDaysLeft|trialUsed|trialEndsAt)/);
  });
});

describe("frontend — нула trial в UI, i18n, правни текстове и prerender", () => {
  it("TrialBanner и trial API функциите ги няма", () => {
    expect(existsSync(join(ROOT, "frontend/src/components/TrialBanner.jsx"))).toBe(false);
    const api = read("frontend/src/api/index.js");
    expect(api).not.toMatch(/\/trial\//);
    expect(api).not.toMatch(/startTrial|cancelTrial|getTrialStatus/);
    expect(read("frontend/src/components/Layout.jsx")).not.toContain("TrialBanner");
    expect(read("frontend/src/hooks/usePremium.js")).not.toMatch(/isTrial|trialDaysLeft/);
  });

  it("i18n (табло + landing) няма trial ключове И няма trial текст на никой език", () => {
    // Мутацията „върнат CTA за пробен период в един локал“ минаваше през гейт,
    // който гледаше само ключовете — затова тук и ТЕКСТЪТ, на 8 езика.
    // Фрази, не голи думи: „prova“/„prueba“/„proef“ значат и „опитай“ („Prova di
    // nuovo“), а „14 dagen“ е и легитимен диапазон в аналитиката — първата
    // версия падаше на легитимен UI текст. Отричащите изречения („няма пробен
    // период“ в FAQ „Как се плаща“) се режат преди проверката.
    const NEGATION = /[^."]{0,160}(?:no free trial|no trial|няма безплатен пробен|няма пробен|keine kostenlose Testphase|ni prueba gratuita|ni essai gratuit|né prova gratuita|geen gratis proefperiode|ani darmowego okresu próbnego)[^."]{0,160}\./gi;
    const TRIAL_PHRASES = /\btrial\b|пробен период|пробния период|пробният период|\d+-дневн\w* пробен|Testphase|Testzeitraum|14-Tage-Test|\d+-tägig\w* Test|per[íi]odo de prueba|prueba gratuita|prueba de \d+ d[íi]as|essai gratuit|p[ée]riode d'essai|essai de \d+ jours|prova gratuita|periodo di prova|prova di \d+ giorni|proefperiode|gratis proef|\d+-daagse proef|proef van \d+ dagen|okres pr[óo]bny|pr[óo]bnego|\d+-dniowy okres/i;
    for (const f of walk(join(ROOT, "frontend/src/i18n"))) {
      const src = readFileSync(f, "utf-8").replace(NEGATION, "");
      expect(src, f).not.toMatch(/\btrial\s*:/);
      expect(src, f).not.toMatch(/freeTrial/);
      expect(src, f).not.toMatch(TRIAL_PHRASES);
    }
  });

  it("страници, правни текстове, prerender и llms.txt не обещават пробен период", () => {
    const files = [
      "frontend/src/pages/Login.jsx",
      "frontend/src/pages/LandingLocalized.jsx",
      "frontend/src/pages/PremiumPage.jsx",
      "frontend/src/pages/TermsPage.jsx",
      "frontend/src/pages/EulaPage.jsx",
      "frontend/src/pages/PrivacyPage.jsx",
      "frontend/scripts/prerender.mjs",
      "frontend/public/llms.txt",
    ];
    // Правните текстове ИМАТ право да кажат „няма пробен период“ — това е
    // отрицание, не обещание. Режем отричащите изречения и след това не
    // допускаме нито едно споменаване: остане ли „trial“, то е обещание.
    // Изреченията в JSX са пренесени на нов ред — затова [^.], не [^.\n].
    const NEGATION = /[^.]{0,200}(?:no free trial|not offer free trial|no trial|няма пробен|без пробен)[^.]{0,300}\./gi;
    for (const f of files) {
      const src = read(f).replace(NEGATION, "");
      expect(src, f).not.toMatch(/14[- ]day (?:free |premium )*trial/i);
      expect(src, f).not.toMatch(/free trial/i);
      expect(src, f).not.toMatch(/\btrial\b/i);
    }
  });
});
