// Предпазители — изпълняват се ПРЕДИ каквото и да е повикване към платформа.
// Философия: бюджетът е свещен; несъответствието (DSA/GDPR/AI Act) спира публикуване.
import { db } from './db.js';
import { config } from './config.js';

export class GuardError extends Error {
  constructor(violations) {
    super(`Предпазителите спряха действието: ${violations.join(' · ')}`);
    this.violations = violations;
  }
}

// 7-те валидни стойности по Meta docs (v25.0): reference/ad-campaign-group
const META_SPECIAL_CATEGORIES = new Set([
  'NONE',
  'HOUSING',
  'EMPLOYMENT',
  'CREDIT',
  'ISSUES_ELECTIONS_POLITICS',
  'ONLINE_GAMBLING_AND_GAMING',
  'FINANCIAL_PRODUCTS_SERVICES',
]);

// Проверка при създаване/публикуване на кампания. Връща списък нарушения (празен = чисто).
export function checkCampaign(campaign) {
  const v = [];
  const spec =
    typeof campaign.spec_json === 'string'
      ? JSON.parse(campaign.spec_json || '{}')
      : campaign.spec_json || {};

  // 1) Бюджетни тавани (твърди, от средата)
  if (!(campaign.daily_budget > 0)) v.push('дневният бюджет трябва да е > 0');
  if (campaign.daily_budget > config.guards.maxDailyBudget)
    v.push(
      `дневен бюджет ${campaign.daily_budget} > таван ${config.guards.maxDailyBudget} (GUARD_MAX_DAILY_BUDGET)`
    );

  const totalActive = db
    .prepare(
      `SELECT COALESCE(SUM(daily_budget),0) s FROM campaigns WHERE status IN ('active','published') AND id != ?`
    )
    .get(campaign.id || -1).s;
  if (totalActive + campaign.daily_budget > config.guards.maxTotalDailyBudget)
    v.push(
      `общият дневен бюджет би станал ${(totalActive + campaign.daily_budget).toFixed(2)} > таван ${config.guards.maxTotalDailyBudget}`
    );

  // 2) DSA: непълнолетни не се таргетират с профилиране; спираме всичко под 18 с detailed targeting.
  const ageMin = Number(spec.age_min ?? 18);
  if (
    ageMin < 18 &&
    (spec.interests?.length || spec.custom_audiences?.length || spec.lookalikes?.length)
  )
    v.push(
      'DSA: таргетиране на под-18 с профилиране (интереси/аудитории) е забранено — вдигни age_min на 18 или махни таргетирането'
    );

  // 3) Специални категории (Meta) — трябва да са декларирани съзнателно, не гадаем.
  const cats = JSON.parse(campaign.special_ad_categories || '[]');
  for (const c of cats)
    if (!META_SPECIAL_CATEGORIES.has(c)) v.push(`непозната специална категория: ${c}`);

  // 4) AI Act чл. 50 (в сила 02.08.2026): AI-генериран фотореалистичен креатив изисква разкриване.
  if (campaign.ai_generated_creative && !spec.ai_disclosure_confirmed)
    v.push(
      'AI Act: маркирал си креатива като AI-генериран, но не си потвърдил разкриването (ai_disclosure_confirmed)'
    );

  // 5) Consent: за EEA кампании изискваме потвърдено consent-съответствие на сайта (Consent Mode v2 / CMP).
  const geos = (spec.geo || []).map((g) => String(g).toUpperCase());
  const targetsEEA = geos.length === 0 || geos.some((g) => EEA.has(g));
  if (targetsEEA && !spec.consent_confirmed)
    v.push(
      'EEA таргетиране изисква потвърдено съгласие-съответствие на сайта (Consent Mode v2 / CMP) — spec.consent_confirmed'
    );

  // 6) Целеви URL — https, без очевидно счупени стойности.
  if (spec.final_url && !/^https:\/\/.+/.test(spec.final_url))
    v.push('final_url трябва да е https://');

  return v;
}

// Проверка при промяна на бюджет от правило (автоматизация) — консервативна.
export function checkBudgetChange(campaign, newBudget) {
  const v = [];
  if (newBudget > config.guards.maxDailyBudget)
    v.push(`новият бюджет ${newBudget.toFixed(2)} > таван ${config.guards.maxDailyBudget}`);
  // Автоматично скалиране: максимум +20% на стъпка (пази learning phase и джоба).
  if (newBudget > campaign.daily_budget * 1.2 + 0.01)
    v.push(
      `автоматично увеличение над +20% на стъпка е забранено (${campaign.daily_budget} → ${newBudget.toFixed(2)})`
    );
  return v;
}

const EEA = new Set([
  'AT',
  'BE',
  'BG',
  'HR',
  'CY',
  'CZ',
  'DK',
  'EE',
  'FI',
  'FR',
  'DE',
  'GR',
  'HU',
  'IE',
  'IT',
  'LV',
  'LT',
  'LU',
  'MT',
  'NL',
  'PL',
  'PT',
  'RO',
  'SK',
  'SI',
  'ES',
  'SE',
  'IS',
  'LI',
  'NO',
]);
