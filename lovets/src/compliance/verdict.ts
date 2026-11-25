import {
  classifyEmail,
  marketOfPhone,
  normalizeEmail,
  normalizePhone,
  normalizeUrl,
  phoneKind,
} from './normalize.js';
import type {
  ContactTarget,
  Decision,
  EvaluationContext,
  Policy,
  Reason,
  ReasonCode,
  RegistryName,
  Requirement,
  RequirementCode,
  Verdict,
  Effect,
} from './types.js';

/**
 * Сроковете на валидност на проверките. RPO: 15 дни — консервативна стойност до потвърждение на
 * срока по DPR 26/2022 (по-кратко е по-безопасно). КЗП: 30 дни — наша политика.
 */
export const DEFAULT_POLICY: Policy = { rpoMaxAgeDays: 15, kzpMaxAgeDays: 30 };

const DAY_MS = 86_400_000;

const REASON_TEXT: Record<ReasonCode, string> = {
  suppressed: 'Контактът е в списъка „не ме търсете“ — никакъв контакт по никой канал.',
  source_missing: 'Няма източник (URL) на контакта — без източник не може да се ползва.',
  invalid_value: 'Стойността не е валиден имейл, телефон (БГ/ИТ) или адрес на страница.',
  it_consent_required:
    'Италия: имейл, форма и LinkedIn съобщение искат предварително съгласие (Codice privacy чл. 130), включително до фирмени адреси.',
  it_phone_not_public_directory:
    'Италия: без съгласие може да се звъни само на номер от публичен телефонен указател (чл. 130, ал. 3-bis).',
  rpo_listed: 'Номерът е вписан в Registro pubblico delle opposizioni — обаждане не е позволено.',
  rpo_check_missing: 'Няма проверка на номера в Registro pubblico delle opposizioni.',
  rpo_check_stale: 'Проверката в Registro pubblico delle opposizioni е изтекла — нужна е нова.',
  kzp_listed:
    'Адресът е вписан в регистъра на КЗП за отказ от непоискани търговски съобщения (ЗЕТ чл. 6, ал. 3).',
  kzp_check_missing: 'Няма проверка на адреса в регистъра на КЗП (ЗЕТ чл. 6, ал. 2).',
  kzp_check_stale: 'Проверката в регистъра на КЗП е изтекла — нужна е нова.',
  personal_email_domain:
    'Адресът е на лична пощенска услуга (gmail, abv…) — непоискано съобщение до физическо лице не е позволено (ЗЕТ чл. 6, ал. 4).',
  bg_mobile_needs_business_confirmation:
    'Мобилният номер може да е личен — потвърди, че е публикуван като фирмена линия, преди да звъниш.',
  consent_present: 'Има записано и неоттеглено съгласие за този канал.',
  registry_clear: 'Проверката в регистъра за отказ е свежа и стойността не е вписана.',
  legal_uncertain:
    'Правното третиране на този канал не е изяснено напълно — пиши кратко, лично и само ръчно.',
};

const REQUIREMENT_TEXT: Record<RequirementCode, string> = {
  art14_notice:
    'Кратко известие по чл. 14 ОРЗД: кои сме, откъде са данните, за какво, колко време ги пазим — плюс връзка към пълното известие.',
  art21_objection:
    'Отделно и ясно изречение за правото на възражение срещу директен маркетинг (чл. 21(4) ОРЗД).',
  sender_identity:
    'Идентификация на подателя: Carbon Stealth VCC, ЕИК, седалище и адрес за контакт.',
  unsubscribe_link: 'Работещ начин за отказ (линк за отписване), който записва „не ме търсете“.',
  unsolicited_subject_marker:
    'В темата: „Непоискано търговско съобщение“ — да се разпознава още при получаване (ЗЕТ чл. 6, ал. 1).',
  call_identity:
    'В началото на разговора: кой се обажда, от коя фирма, защо, откъде е номерът и че може да откаже.',
  manual_only: 'Само ръчно изпращане — без автоматизация (условията на LinkedIn §8.2).',
};

const reason = (code: ReasonCode, effect: Effect): Reason => ({
  code,
  effect,
  text: REASON_TEXT[code],
});
const requirement = (code: RequirementCode): Requirement => ({
  code,
  text: REQUIREMENT_TEXT[code],
});

type RegistryOutcome = 'clear' | 'listed' | 'missing' | 'stale';

function registryOutcome(name: RegistryName, ctx: EvaluationContext): RegistryOutcome {
  const r = ctx.registry;
  if (!r || r.registry !== name) return 'missing';
  const age = ctx.now.getTime() - r.checkedAt.getTime();
  if (age < 0) return 'missing';
  const maxDays = name === 'RPO' ? ctx.policy.rpoMaxAgeDays : ctx.policy.kzpMaxAgeDays;
  if (age > maxDays * DAY_MS) return 'stale';
  return r.listed ? 'listed' : 'clear';
}

function registryReasons(name: RegistryName, ctx: EvaluationContext): Reason[] {
  const outcome = registryOutcome(name, ctx);
  if (outcome === 'clear') return [reason('registry_clear', 'info')];
  return [reason(REGISTRY_BLOCK[name][outcome], 'block')];
}

const REGISTRY_BLOCK: Record<
  RegistryName,
  Record<Exclude<RegistryOutcome, 'clear'>, ReasonCode>
> = {
  RPO: { listed: 'rpo_listed', missing: 'rpo_check_missing', stale: 'rpo_check_stale' },
  KZP: { listed: 'kzp_listed', missing: 'kzp_check_missing', stale: 'kzp_check_stale' },
};

function decide(reasons: Reason[]): Decision {
  if (reasons.some((r) => r.effect === 'block')) return 'blocked';
  if (reasons.some((r) => r.effect === 'action')) return 'needs_action';
  return 'allowed';
}

/**
 * Може ли да пишем или да звъним на този контакт по този канал — и при какви условия. Чиста функция.
 * Fail-closed: липсваща или изтекла проверка блокира; неясното се третира по по-строгото правило.
 */
export function evaluateContact(t: ContactTarget, ctx: EvaluationContext): Verdict {
  const reasons: Reason[] = [];
  const requirements: Requirement[] = [];
  let market = t.market;
  let registryNeeded: RegistryName | null = null;
  let normalizedValue: string | null;
  const extra: Pick<Verdict, 'emailKind' | 'phoneKind'> = {};

  if (t.channel === 'email') {
    normalizedValue = normalizeEmail(t.value);
    if (normalizedValue) extra.emailKind = classifyEmail(normalizedValue);
  } else if (t.channel === 'phone') {
    normalizedValue = normalizePhone(t.value, t.market);
    const phoneMarket = normalizedValue ? marketOfPhone(normalizedValue) : null;
    if (normalizedValue && phoneMarket) {
      market = phoneMarket;
      extra.phoneKind = phoneKind(normalizedValue);
    } else {
      normalizedValue = null;
    }
  } else {
    normalizedValue = normalizeUrl(t.value);
  }

  if (ctx.suppressed) reasons.push(reason('suppressed', 'block'));
  if (!t.sourceUrl) reasons.push(reason('source_missing', 'block'));
  if (!normalizedValue) {
    reasons.push(reason('invalid_value', 'block'));
    return {
      market,
      channel: t.channel,
      normalizedValue,
      decision: 'blocked',
      reasons,
      requirements,
      registryNeeded,
    };
  }

  const hasConsent = ctx.consents.some(
    (c) =>
      c.channel === t.channel && c.withdrawnAt === null && c.givenAt.getTime() <= ctx.now.getTime(),
  );
  if (hasConsent) reasons.push(reason('consent_present', 'info'));

  if (market === 'IT') {
    if (t.channel === 'phone') {
      registryNeeded = 'RPO';
      if (!hasConsent && t.phoneSource !== 'public_directory') {
        reasons.push(reason('it_phone_not_public_directory', 'block'));
      }
      reasons.push(...registryReasons('RPO', ctx));
    } else if (!hasConsent) {
      reasons.push(reason('it_consent_required', 'block'));
    }
  } else {
    switch (t.channel) {
      case 'email':
        registryNeeded = 'KZP';
        if (!hasConsent) {
          if (extra.emailKind === 'personal')
            reasons.push(reason('personal_email_domain', 'block'));
          reasons.push(...registryReasons('KZP', ctx));
        }
        break;
      case 'form':
        registryNeeded = 'KZP';
        reasons.push(reason('legal_uncertain', 'info'));
        if (!hasConsent) reasons.push(...registryReasons('KZP', ctx));
        break;
      case 'phone':
        if (extra.phoneKind !== 'landline' && !t.businessLineConfirmed && !hasConsent) {
          reasons.push(reason('bg_mobile_needs_business_confirmation', 'action'));
        }
        break;
      case 'linkedin':
        reasons.push(reason('legal_uncertain', 'info'));
        break;
    }
  }

  requirements.push(
    requirement('art14_notice'),
    requirement('art21_objection'),
    requirement('sender_identity'),
  );
  if (t.channel === 'phone') requirements.push(requirement('call_identity'));
  else requirements.push(requirement('unsubscribe_link'));
  if (market === 'BG' && t.channel === 'email' && !hasConsent) {
    requirements.push(requirement('unsolicited_subject_marker'));
  }
  if (t.channel === 'linkedin') requirements.push(requirement('manual_only'));

  return {
    market,
    channel: t.channel,
    normalizedValue,
    decision: decide(reasons),
    reasons,
    requirements,
    registryNeeded,
    ...extra,
  };
}
