import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { forgetMailTo, mailTo, prisma, startApp, stopApp } from './harness.js';
import { customer, sessionCsrf, staff } from './people.js';

before(startApp);
after(stopApp);

const { banAccount } = await import('../../src/services/admin-security.js');
const { translate } = await import('../../src/i18n.js');

const REASON = 'Споделен акаунт (раздел „Акаунт“): вход от две фирми в един ден.';
const PREMIUM_UNTIL = new Date('2027-01-10T21:59:59.999Z');
/** In the transition: the rule came on 10 October 2026 and reaches older orders on 9 November 2026. */
const IN_TRANSITION = new Date('2026-10-20T10:00:00Z');
/** Midnight of 9 November in Sofia (winter time, UTC+2): from here on the rule holds for older orders too. */
const RULE_REACHES_OLD = new Date('2026-11-08T22:00:00Z');

/**
 * A verified customer whose plan came from an activated order accepted with the terms of `termsVersion` —
 * the order, its line in the plan history and the plan itself, as changePlan leaves them.
 */
async function orderedPlan(
  email: string,
  termsVersion: string,
  plan: 'PREMIUM' | 'LIFETIME' = 'PREMIUM',
  locale = 'bg',
): Promise<string> {
  await customer(email);
  const until = plan === 'PREMIUM' ? PREMIUM_UNTIL : null;
  const user = await prisma.user.update({
    where: { email },
    data: { plan, planExpiresAt: until, locale },
  });
  const order = await prisma.upgradeRequest.create({
    data: {
      userId: user.id,
      option: plan === 'PREMIUM' ? 'm3' : 'lifetime',
      months: plan === 'PREMIUM' ? 3 : null,
      listPriceCents: plan === 'PREMIUM' ? 7125 : 75000,
      termsVersion,
      status: 'DONE',
      handledAt: new Date('2026-10-09T09:00:00Z'),
      createdAt: new Date('2026-10-05T09:00:00Z'),
    },
  });
  await prisma.planChange.create({
    data: {
      userId: user.id,
      actorLabel: 'test',
      fromPlan: 'TRIAL',
      toPlan: plan,
      toExpiresAt: until,
      months: plan === 'PREMIUM' ? 3 : null,
      requestId: order.id,
      createdAt: new Date('2026-10-09T09:00:00Z'),
    },
  });
  forgetMailTo(email);
  return user.id;
}

async function banDetail(id: string) {
  const entry = await prisma.auditLog.findFirstOrThrow({
    where: { action: 'admin.account.banned', targetId: id },
  });
  return entry.detail;
}

test('an order under the old terms, blocked before the rule reaches it: the mail promises the unused part back', async () => {
  const support = await staff('SUPPORT', 'old-orders-support@example.test');
  const email = 'old-order@example.test';
  const id = await orderedPlan(email, '2026-10-09');
  const result = await banAccount(support.actor, id, { reason: REASON }, IN_TRANSITION);
  assert.deepEqual(result, { ok: true, flash: 'flash.bannedRefund' }, 'the team is told it owes');

  const mail = await mailTo(email, /блокиран/);
  const paidOld = translate('bg', 'mail.banned.paidOld', {
    since: '10 октомври 2026 г.',
    from: '9 ноември 2026 г.',
  });
  assert.ok(mail.text.includes(paidOld), 'the transition with the dates of the terms');
  assert.ok(
    !mail.text.includes(translate('bg', 'mail.banned.paid')),
    'not the sentence that keeps the payment',
  );
  assert.match(
    mail.html ?? '',
    /затова ви връщаме неизползваната част от цената/,
    'the HTML variant too',
  );
  assert.match(mail.text, /https?:\/\/[^\s]+\/terms#blocking\n/, 'the link goes to the section');
  assert.deepEqual(await banDetail(id), { reason: REASON, refundOld: true });

  // Lifetime under the old terms, in its first months — the same, in the language of the account
  const lifeEmail = 'old-order-lifetime@example.test';
  const life = await orderedPlan(lifeEmail, '2026-10-09', 'LIFETIME', 'en');
  assert.deepEqual(await banAccount(support.actor, life, { reason: REASON }, IN_TRANSITION), {
    ok: true,
    flash: 'flash.bannedRefund',
  });
  const en = await mailTo(lifeEmail, /blocked/);
  assert.match(en.text, /in force before 10 October 2026, and for such orders/);
  assert.match(en.text, /applies from 9 November 2026 \(section “Blocking”\)/);
  assert.match(en.text, /\/en\/terms#blocking\n/);
  assert.ok(!en.text.includes(translate('en', 'mail.banned.paid')));
});

test('from 9 November an old order is not refunded; an order under the new terms never is', async () => {
  const support = await staff('SUPPORT', 'old-orders-support-after@example.test');
  const late = await orderedPlan('old-order-late@example.test', '2026-10-09');
  assert.deepEqual(await banAccount(support.actor, late, { reason: REASON }, RULE_REACHES_OLD), {
    ok: true,
  });
  const lateMail = await mailTo('old-order-late@example.test', /блокиран/);
  assert.ok(lateMail.text.includes(translate('bg', 'mail.banned.paid')));
  assert.doesNotMatch(lateMail.text, /връщаме неизползваната част/);
  assert.deepEqual(await banDetail(late), { reason: REASON });

  const fresh = await orderedPlan('new-order@example.test', '2026-10-10');
  assert.deepEqual(await banAccount(support.actor, fresh, { reason: REASON }, IN_TRANSITION), {
    ok: true,
  });
  const freshMail = await mailTo('new-order@example.test', /блокиран/);
  assert.ok(freshMail.text.includes(translate('bg', 'mail.banned.paid')));
  assert.doesNotMatch(freshMail.text, /връщаме неизползваната част/);
  assert.deepEqual(await banDetail(fresh), { reason: REASON });
});

test('the ban form reminds of the warning and its days before a block for a breach that can be put right', async () => {
  const support = await staff('SUPPORT', 'old-orders-support-form@example.test');
  await customer('ban-form@example.test');
  const { id } = await prisma.user.findUniqueOrThrow({ where: { email: 'ban-form@example.test' } });
  const page = await support.browser.get(`/admin/accounts/${id}`);
  assert.equal(page.status, 200);
  const hint = /<p class="hint" id="ban-hint">([\s\S]*?)<\/p>/.exec(page.body)?.[1] ?? '';
  assert.match(hint, /блокирайте едва след предупреждение по имейл и поне 7 дни за поправка/);
  assert.match(hint, /посочете датата на предупреждението в причината/);
  // the panel keeps its usual message for an ordinary ban
  const ban = await support.browser.post(`/admin/accounts/${id}/ban`, {
    _csrf: await sessionCsrf(support.browser, `/admin/accounts/${id}`),
    reason: REASON,
  });
  assert.equal(ban.status, 302);
  assert.equal(support.browser.flash(), 'flash.banned');
});
