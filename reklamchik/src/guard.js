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

  // 2) DSA чл. 28(2): непълнолетни не се таргетират с профилиране. Advantage+/PMax/Demand Gen
  // профилират ПО ПОДРАЗБИРАНЕ, затова блокадата е БЕЗУСЛОВНА — под 18 не се таргетира изобщо.
  const ageMin = Number(spec.age_min ?? 18);
  if (ageMin < 18)
    v.push(
      'DSA чл. 28(2): таргетиране под 18 г. е забранено — тези кампанийни типове профилират по подразбиране; вдигни age_min на 18'
    );

  // 3) Специални категории (Meta) — трябва да са декларирани съзнателно, не гадаем.
  const cats = JSON.parse(campaign.special_ad_categories || '[]');
  for (const c of cats)
    if (!META_SPECIAL_CATEGORIES.has(c)) v.push(`непозната специална категория: ${c}`);

  // 3а) DSA чл. 26(3): забранено е таргетиране по чл. 9 GDPR данни (здраве, религия, секс.
  // ориентация, етнос, политика). Различно от Meta special_ad_categories (анти-дискриминация)!
  const sensitiveHit = (spec.interests || []).find((i) => SENSITIVE_INTEREST_RE.test(String(i)));
  if (sensitiveHit)
    v.push(
      `DSA чл. 26(3): интересът „${sensitiveHit}“ попада в чувствителните категории по чл. 9 GDPR (здраве/религия/секс. ориентация/етнос/политика) — таргетиране по него е забранено`
    );

  // 3б) Custom Audiences/Lookalike от клиентски данни изискват записано правно основание
  // (GDPR чл. 6/7: разкриване към трето лице; хеширане ≠ анонимизация).
  if ((spec.custom_audiences?.length || spec.lookalikes?.length) && !spec.audience_legal_basis)
    v.push(
      'Custom Audiences/Lookalike изискват декларирано правно основание (spec.audience_legal_basis) — съгласие за споделяне с платформата, записано и доказуемо'
    );

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
  // Общият таван важи и за автоматизирания път — иначе N печеливши кампании го заобикалят.
  const totalOther = db
    .prepare(
      `SELECT COALESCE(SUM(daily_budget),0) s FROM campaigns WHERE status IN ('active','published') AND id != ?`
    )
    .get(campaign.id || -1).s;
  if (totalOther + newBudget > config.guards.maxTotalDailyBudget)
    v.push(
      `общият дневен бюджет би станал ${(totalOther + newBudget).toFixed(2)} > таван ${config.guards.maxTotalDailyBudget}`
    );
  return v;
}

// Чувствителни интереси по чл. 9 GDPR (DSA чл. 26(3)) — bg/en семантика, консервативен списък.
const SENSITIVE_INTEREST_RE = new RegExp(
  [
    // здраве
    'health|disease|illness|diabet|диабет|cancer|рак|болест|здравослов|диагноз|бременност|pregnan|mental|псих|инвалид|disabilit|hiv|спин',
    // религия
    'religio|christian|muslim|islam|jewish|будиз|религи|христиан|мюсюлман|евре|църк|church|mosque',
    // сексуална ориентация
    'lgbt|гей|лесбийк|gay|lesbian|bisex|transgender|транс|секс',
    // етнос/раса
    'ethnic|race|етнос|раса|ром(а|ски)|african|asian',
    // политика/синдикати
    'politic|полити|партия|party|синдикат|trade union',
  ].join('|'),
  'i'
);

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
