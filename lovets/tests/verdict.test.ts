import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateContact, DEFAULT_POLICY } from '../src/compliance/verdict.js';
import type { EvaluationContext, ContactTarget } from '../src/compliance/types.js';

const NOW = new Date('2026-11-24T10:00:00Z');
const daysAgo = (d: number): Date => new Date(NOW.getTime() - d * 86_400_000);
const SRC = 'https://firma.example/kontakti';

function ctx(over: Partial<EvaluationContext> = {}): EvaluationContext {
  return {
    now: NOW,
    suppressed: false,
    consents: [],
    registry: null,
    policy: DEFAULT_POLICY,
    ...over,
  };
}

function target(over: Partial<ContactTarget> = {}): ContactTarget {
  return { market: 'BG', channel: 'email', value: 'info@firma.bg', sourceUrl: SRC, ...over };
}

const codes = (v: { reasons: { code: string }[] }): string[] => v.reasons.map((r) => r.code);

// ── общи инварианти ──────────────────────────────────────────────

test('„не ме търсете“ блокира всеки канал и пазар, дори със съгласие', () => {
  for (const market of ['BG', 'IT'] as const) {
    for (const channel of ['email', 'phone', 'form', 'linkedin'] as const) {
      const value =
        channel === 'email'
          ? 'info@firma.bg'
          : channel === 'phone'
            ? '+35929876543'
            : 'https://x.example/c';
      const v = evaluateContact(
        target({ market, channel, value }),
        ctx({
          suppressed: true,
          consents: [{ channel, givenAt: daysAgo(1), withdrawnAt: null }],
        }),
      );
      assert.equal(v.decision, 'blocked', `${market}/${channel}`);
      assert.ok(codes(v).includes('suppressed'));
    }
  }
});

test('без източник записът не се ползва', () => {
  const v = evaluateContact(target({ sourceUrl: null }), ctx());
  assert.equal(v.decision, 'blocked');
  assert.ok(codes(v).includes('source_missing'));
});

test('невалидна стойност → блок', () => {
  const v = evaluateContact(target({ value: 'не-е-имейл' }), ctx());
  assert.equal(v.decision, 'blocked');
  assert.ok(codes(v).includes('invalid_value'));
});

// ── Италия ───────────────────────────────────────────────────────

test('ИТ имейл без съгласие → блок, дори до info@', () => {
  const v = evaluateContact(target({ market: 'IT', value: 'info@ditta.it' }), ctx());
  assert.equal(v.decision, 'blocked');
  assert.ok(codes(v).includes('it_consent_required'));
});

test('ИТ имейл със съгласие за имейл → позволено с изискванията за първо съобщение', () => {
  const v = evaluateContact(
    target({ market: 'IT', value: 'mario.rossi@ditta.it' }),
    ctx({ consents: [{ channel: 'email', givenAt: daysAgo(2), withdrawnAt: null }] }),
  );
  assert.equal(v.decision, 'allowed');
  const req = v.requirements.map((r) => r.code);
  assert.ok(req.includes('art14_notice'));
  assert.ok(req.includes('art21_objection'));
  assert.ok(req.includes('sender_identity'));
  assert.ok(req.includes('unsubscribe_link'));
});

test('ИТ: оттеглено съгласие или съгласие за друг канал не важи', () => {
  const withdrawn = evaluateContact(
    target({ market: 'IT', value: 'info@ditta.it' }),
    ctx({ consents: [{ channel: 'email', givenAt: daysAgo(9), withdrawnAt: daysAgo(1) }] }),
  );
  assert.equal(withdrawn.decision, 'blocked');
  const otherChannel = evaluateContact(
    target({ market: 'IT', value: 'info@ditta.it' }),
    ctx({ consents: [{ channel: 'phone', givenAt: daysAgo(2), withdrawnAt: null }] }),
  );
  assert.equal(otherChannel.decision, 'blocked');
});

test('ИТ форма и LinkedIn без съгласие → блок', () => {
  for (const channel of ['form', 'linkedin'] as const) {
    const v = evaluateContact(
      target({ market: 'IT', channel, value: 'https://ditta.example/contatti' }),
      ctx(),
    );
    assert.equal(v.decision, 'blocked', channel);
    assert.ok(codes(v).includes('it_consent_required'));
  }
});

const itPhone = (over: Partial<ContactTarget> = {}): ContactTarget =>
  target({
    market: 'IT',
    channel: 'phone',
    value: '+390212345678',
    phoneSource: 'public_directory',
    ...over,
  });

test('ИТ телефон: публичен указател + свежа проверка в RPO, не е вписан → позволено', () => {
  const v = evaluateContact(
    itPhone(),
    ctx({ registry: { registry: 'RPO', listed: false, checkedAt: daysAgo(3) } }),
  );
  assert.equal(v.decision, 'allowed');
  assert.equal(v.registryNeeded, 'RPO');
});

test('ИТ телефон без проверка в RPO → блок', () => {
  const v = evaluateContact(itPhone(), ctx());
  assert.equal(v.decision, 'blocked');
  assert.ok(codes(v).includes('rpo_check_missing'));
});

test('ИТ телефон с остаряла проверка в RPO → блок', () => {
  const v = evaluateContact(
    itPhone(),
    ctx({
      registry: {
        registry: 'RPO',
        listed: false,
        checkedAt: daysAgo(DEFAULT_POLICY.rpoMaxAgeDays + 1),
      },
    }),
  );
  assert.equal(v.decision, 'blocked');
  assert.ok(codes(v).includes('rpo_check_stale'));
});

test('ИТ телефон, вписан в RPO → блок, и съгласие не го отключва', () => {
  const v = evaluateContact(
    itPhone(),
    ctx({
      registry: { registry: 'RPO', listed: true, checkedAt: daysAgo(1) },
      consents: [{ channel: 'phone', givenAt: daysAgo(5), withdrawnAt: null }],
    }),
  );
  assert.equal(v.decision, 'blocked');
  assert.ok(codes(v).includes('rpo_listed'));
});

test('ИТ телефон от сайта на фирмата (не от указател) без съгласие → блок', () => {
  const v = evaluateContact(
    itPhone({ phoneSource: 'company_site' }),
    ctx({ registry: { registry: 'RPO', listed: false, checkedAt: daysAgo(1) } }),
  );
  assert.equal(v.decision, 'blocked');
  assert.ok(codes(v).includes('it_phone_not_public_directory'));
});

test('ИТ телефон от сайта, но със съгласие и свежа проверка → позволено', () => {
  const v = evaluateContact(
    itPhone({ phoneSource: 'company_site' }),
    ctx({
      registry: { registry: 'RPO', listed: false, checkedAt: daysAgo(1) },
      consents: [{ channel: 'phone', givenAt: daysAgo(4), withdrawnAt: null }],
    }),
  );
  assert.equal(v.decision, 'allowed');
});

test('ИТ: проверка от грешен регистър не се брои', () => {
  const v = evaluateContact(
    itPhone(),
    ctx({ registry: { registry: 'KZP', listed: false, checkedAt: daysAgo(1) } }),
  );
  assert.equal(v.decision, 'blocked');
  assert.ok(codes(v).includes('rpo_check_missing'));
});

// ── България ─────────────────────────────────────────────────────

test('БГ имейл до info@: свежа проверка в КЗП, не е вписан → позволено с маркировка в темата', () => {
  const v = evaluateContact(
    target(),
    ctx({ registry: { registry: 'KZP', listed: false, checkedAt: daysAgo(2) } }),
  );
  assert.equal(v.decision, 'allowed');
  assert.equal(v.registryNeeded, 'KZP');
  assert.ok(v.requirements.some((r) => r.code === 'unsolicited_subject_marker'));
});

test('БГ имейл без проверка в КЗП → блок', () => {
  const v = evaluateContact(target(), ctx());
  assert.equal(v.decision, 'blocked');
  assert.ok(codes(v).includes('kzp_check_missing'));
});

test('БГ имейл с остаряла проверка в КЗП → блок', () => {
  const v = evaluateContact(
    target(),
    ctx({
      registry: {
        registry: 'KZP',
        listed: false,
        checkedAt: daysAgo(DEFAULT_POLICY.kzpMaxAgeDays + 1),
      },
    }),
  );
  assert.equal(v.decision, 'blocked');
  assert.ok(codes(v).includes('kzp_check_stale'));
});

test('БГ имейл, вписан в регистъра на КЗП → блок', () => {
  const v = evaluateContact(
    target(),
    ctx({ registry: { registry: 'KZP', listed: true, checkedAt: daysAgo(1) } }),
  );
  assert.equal(v.decision, 'blocked');
  assert.ok(codes(v).includes('kzp_listed'));
});

test('БГ имейл на личен домейн (abv, gmail) → блок', () => {
  const v = evaluateContact(
    target({ value: 'firmata@abv.bg' }),
    ctx({ registry: { registry: 'KZP', listed: false, checkedAt: daysAgo(1) } }),
  );
  assert.equal(v.decision, 'blocked');
  assert.ok(codes(v).includes('personal_email_domain'));
});

test('БГ имейл със съгласие → позволено без маркировка „непоискано“', () => {
  const v = evaluateContact(
    target({ value: 'ivan.petrov@firma.bg' }),
    ctx({ consents: [{ channel: 'email', givenAt: daysAgo(1), withdrawnAt: null }] }),
  );
  assert.equal(v.decision, 'allowed');
  assert.ok(!v.requirements.some((r) => r.code === 'unsolicited_subject_marker'));
});

test('БГ форма за контакт се третира като имейл: без проверка в КЗП → блок', () => {
  const v = evaluateContact(target({ channel: 'form', value: 'https://firma.bg/kontakti' }), ctx());
  assert.equal(v.decision, 'blocked');
  assert.ok(codes(v).includes('kzp_check_missing'));
});

test('БГ стационарен телефон → позволено с представяне и право на възражение', () => {
  const v = evaluateContact(target({ channel: 'phone', value: '+35929876543' }), ctx());
  assert.equal(v.decision, 'allowed');
  assert.ok(v.requirements.some((r) => r.code === 'call_identity'));
  assert.ok(v.requirements.some((r) => r.code === 'art21_objection'));
});

test('БГ мобилен без потвърждение, че е фирмен → чака действие', () => {
  const v = evaluateContact(target({ channel: 'phone', value: '+359888123456' }), ctx());
  assert.equal(v.decision, 'needs_action');
  assert.ok(codes(v).includes('bg_mobile_needs_business_confirmation'));
});

test('БГ мобилен, потвърден като фирмен → позволено', () => {
  const v = evaluateContact(
    target({ channel: 'phone', value: '+359888123456', businessLineConfirmed: true }),
    ctx(),
  );
  assert.equal(v.decision, 'allowed');
});

test('БГ LinkedIn → позволено само ръчно, с бележка за правната несигурност', () => {
  const v = evaluateContact(
    target({ channel: 'linkedin', value: 'https://www.linkedin.com/in/x' }),
    ctx(),
  );
  assert.equal(v.decision, 'allowed');
  assert.ok(v.requirements.some((r) => r.code === 'manual_only'));
  assert.ok(codes(v).includes('legal_uncertain'));
});

test('пазарът на телефона се взима от номера, не от записа', () => {
  // италиански номер, записан под БГ пазар → прилагат се италианските правила
  const v = evaluateContact(
    target({ market: 'BG', channel: 'phone', value: '+390212345678' }),
    ctx(),
  );
  assert.equal(v.market, 'IT');
  assert.equal(v.decision, 'blocked');
});

test('всяка причина има български текст', () => {
  const v = evaluateContact(target({ market: 'IT' }), ctx());
  for (const r of [...v.reasons, ...v.requirements]) assert.ok(r.text.length > 10, r.code);
});

test('Италия, имейл със съгласие: изискване за „Comunicazione commerciale“ (d.lgs. 70/2003 чл. 8)', () => {
  const v = evaluateContact(
    {
      market: 'IT',
      channel: 'email',
      value: 'info@ditta.it',
      sourceUrl: 'https://ditta.it/contatti',
    },
    {
      now: new Date('2026-11-27T10:00:00Z'),
      suppressed: false,
      consents: [
        { channel: 'email', givenAt: new Date('2026-10-01T10:00:00Z'), withdrawnAt: null },
      ],
      registry: null,
      policy: DEFAULT_POLICY,
    },
  );
  assert.equal(v.decision, 'allowed');
  assert.ok(v.requirements.some((r) => r.code === 'it_commercial_marker'));
  assert.equal(v.sourceUrl, 'https://ditta.it/contatti', 'източникът стига до черновата');
});
