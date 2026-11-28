// Черновата на първия имейл (фаза 4а, SPEC §8). Правната основа — прегледът на Правния Разбирач
// от 27.11.2026 (ЗЕТ чл. 5–6, ТЗ чл. 13, ОРЗД чл. 14 и 21, Codice чл. 130, d.lgs. 70/2003 чл. 8–9,
// EDPB 2/2023). Черновата се дава само при „Може“ за имейл; задължителните блокове се проверяват
// детерминистично и липсата на кой да е от тях спира писмото (fail-closed).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateContact, DEFAULT_POLICY } from '../src/compliance/verdict.js';
import type { ConsentRecord, ContactTarget, RegistryStatus } from '../src/compliance/types.js';
import {
  checkEmailBlocks,
  composeFirstEmail,
  type DraftConfig,
  type FirstEmailInput,
} from '../src/draft/first-email.js';
import { readUnsubToken } from '../src/draft/unsubscribe.js';
import { formatSlot, suggestSlots } from '../src/draft/slots.js';

const NOW = new Date('2026-11-27T10:00:00Z'); // петък
const PEPPER = ['t', 'pepper', 'x'.repeat(40)].join('-');
const CFG: DraftConfig = {
  publicUrl: 'https://lovets.example',
  noticeUrl: 'https://carbonstealth.eu/privacy/prospects',
  unsubKey: Buffer.alloc(32, 9).toString('base64'),
  pepper: PEPPER,
  retentionMonths: 6,
};
const clearKzp: RegistryStatus = {
  registry: 'KZP',
  listed: false,
  checkedAt: new Date('2026-11-20T10:00:00Z'),
};
const consent: ConsentRecord = {
  channel: 'email',
  givenAt: new Date('2026-10-01T10:00:00Z'),
  withdrawnAt: null,
};

function verdict(
  value: string,
  market: 'BG' | 'IT',
  o: {
    suppressed?: boolean;
    registry?: RegistryStatus | null;
    consents?: ConsentRecord[];
    channel?: ContactTarget['channel'];
    sourceUrl?: string | null;
  } = {},
) {
  return evaluateContact(
    {
      market,
      channel: o.channel ?? 'email',
      value,
      sourceUrl: o.sourceUrl === undefined ? 'https://firma.bg/kontakti' : o.sourceUrl,
    },
    {
      now: NOW,
      suppressed: o.suppressed ?? false,
      consents: o.consents ?? [],
      registry: o.registry === undefined ? clearKzp : o.registry,
      policy: DEFAULT_POLICY,
    },
  );
}

const slots = () => suggestSlots(NOW, 'BG');
const input = (
  v: ReturnType<typeof verdict>,
  extra: Partial<FirstEmailInput> = {},
): FirstEmailInput => ({
  verdict: v,
  sourceUrl: 'https://firma.bg/kontakti',
  seenAt: new Date('2026-11-25T09:00:00Z'),
  topic: 'дигитални листове за огледи на асансьори',
  offer:
    'Видяхме, че поддържате асансьори в Бобов дол. Rilievi прави листовете за интервенция на телефона, без хартия.',
  senderName: 'Екипът на Carbon Stealth',
  slots: slots(),
  ...extra,
});

test('BG, info@ с чиста свежа проверка в КЗП → чернова с всички задължителни блокове', () => {
  const v = verdict('info@firma.bg', 'BG');
  assert.equal(v.decision, 'allowed');
  const r = composeFirstEmail(input(v), CFG, NOW);
  assert.ok(r.ok, r.ok ? '' : r.code);
  const d = r.draft;
  assert.match(d.subject, /^Непоискано търговско съобщение: /);
  assert.match(d.text, /ЕИК 208725180/);
  assert.match(d.text, /ул\. „Самуил“ № 3, 2670 Бобов дол/);
  assert.match(d.text, /https:\/\/firma\.bg\/kontakti/, 'конкретният източник (чл. 14(2)(f))');
  assert.match(
    d.text,
    /https:\/\/carbonstealth\.eu\/privacy\/prospects/,
    'връзка към пълното известие',
  );
  assert.match(d.text, /законен интерес \(чл\. 6, пар\. 1, б\. „е“ ОРЗД\)/);
  assert.match(d.text, /до 6 месеца/);
  assert.deepEqual(checkEmailBlocks(d, CFG), []);
  assert.match(d.textHash, /^[0-9a-f]{64}$/);
});

test('възражението е отделен абзац (чл. 21(4)) с работеща връзка за отписване, без имейла в адреса', () => {
  const r = composeFirstEmail(input(verdict('info@firma.bg', 'BG')), CFG, NOW);
  assert.ok(r.ok);
  const paras = r.draft.text.split(/\n\s*\n/);
  const objection = paras.find((p) => p.startsWith('Можете по всяко време да възразите'));
  assert.ok(objection, 'абзацът съществува и започва сам');
  const url = objection.match(/https:\/\/lovets\.example\/u\/([A-Za-z0-9_.-]+)/);
  assert.ok(url, 'връзката е в абзаца');
  assert.doesNotMatch(url[0], /firma|info|%40|@/, 'адресът не е в URL-а');
  const fps = readUnsubToken(url[1]!, CFG.unsubKey!);
  assert.ok(fps && fps.length >= 1, 'токенът се чете с ключа');
  assert.match(objection, /„Отказ“/, 'и отговор „Отказ“ стига');
});

test('блокирано, suppressed, личен адрес, изтекла КЗП, телефон → няма чернова', () => {
  const cases: [string, ReturnType<typeof verdict>, string][] = [
    ['suppressed', verdict('info@firma.bg', 'BG', { suppressed: true }), 'not_allowed'],
    ['личен', verdict('ivan@gmail.com', 'BG'), 'not_allowed'],
    [
      'изтекла КЗП',
      verdict('info@firma.bg', 'BG', {
        registry: { ...clearKzp, checkedAt: new Date('2026-09-01T10:00:00Z') },
      }),
      'not_allowed',
    ],
    [
      'вписан в КЗП',
      verdict('info@firma.bg', 'BG', { registry: { ...clearKzp, listed: true } }),
      'not_allowed',
    ],
    ['без проверка', verdict('info@firma.bg', 'BG', { registry: null }), 'not_allowed'],
    ['IT без съгласие', verdict('info@ditta.it', 'IT', { registry: null }), 'not_allowed'],
    ['телефон', verdict('0888123456', 'BG', { channel: 'phone', registry: null }), 'not_email'],
  ];
  for (const [name, v, code] of cases) {
    const r = composeFirstEmail(input(v), CFG, NOW);
    assert.equal(r.ok, false, name);
    assert.equal(!r.ok && r.code, code, name);
  }
});

test('IT със съгласие → „Comunicazione commerciale“, основание съгласие, отделен абзац за отказ', () => {
  const v = verdict('info@ditta.it', 'IT', { consents: [consent], registry: null });
  assert.equal(v.decision, 'allowed');
  const r = composeFirstEmail(
    input(v, { sourceUrl: 'https://firma.bg/kontakti', slots: suggestSlots(NOW, 'IT') }),
    CFG,
    NOW,
  );
  assert.ok(r.ok, r.ok ? '' : r.code);
  assert.match(r.draft.subject, /^Comunicazione commerciale – /);
  assert.match(r.draft.text, /art\. 6, par\. 1, lett\. a GDPR; art\. 130 Codice privacy/);
  assert.ok(r.draft.text.split(/\n\s*\n/).some((p) => p.startsWith('Può revocare il consenso')));
  assert.equal(
    r.draft.legalReview,
    'it_pending',
    'италианският текст чака Преводача и италиански юрист',
  );
  assert.deepEqual(checkEmailBlocks(r.draft, CFG), []);
});

test('BG със съгласие → „Търговско съобщение“ (ЗЕТ чл. 5, ал. 3, т. 1), основание съгласие', () => {
  const v = verdict('ivan@firma.bg', 'BG', { consents: [consent], registry: null });
  const r = composeFirstEmail(input(v), CFG, NOW);
  assert.ok(r.ok, r.ok ? '' : r.code);
  assert.match(r.draft.subject, /^Търговско съобщение: /);
  assert.match(r.draft.text, /съгласие \(чл\. 6, пар\. 1, б\. „а“ ОРЗД\)/);
});

test('източникът: различен от проверения, видян преди над 30 дни или в бъдещето → отказ', () => {
  const v = verdict('info@firma.bg', 'BG');
  const other = composeFirstEmail(input(v, { sourceUrl: 'https://drug.bg/' }), CFG, NOW);
  assert.equal(!other.ok && other.code, 'source_mismatch');
  const old = composeFirstEmail(input(v, { seenAt: new Date('2026-10-20T09:00:00Z') }), CFG, NOW);
  assert.equal(!old.ok && old.code, 'source_stale', 'чл. 14(3)(а): най-късно до месец');
  const future = composeFirstEmail(
    input(v, { seenAt: new Date('2026-11-28T09:00:00Z') }),
    CFG,
    NOW,
  );
  assert.equal(!future.ok && future.code, 'seen_in_future');
});

test('настройките: без публично известие или ключ за отписване → отказ, не писмо без блок', () => {
  const v = verdict('info@firma.bg', 'BG');
  assert.equal(
    ((r) => !r.ok && r.code)(composeFirstEmail(input(v), { ...CFG, noticeUrl: null }, NOW)),
    'notice_url_missing',
  );
  assert.equal(
    ((r) => !r.ok && r.code)(composeFirstEmail(input(v), { ...CFG, unsubKey: null }, NOW)),
    'unsub_key_missing',
  );
});

test('без проследяване: HTML, връзка с параметри или http:// в текста на собственика → отказ', () => {
  const v = verdict('info@firma.bg', 'BG');
  for (const offer of [
    'Вижте <img src="https://x.example/p.gif">',
    'Вижте https://carbonstealth.eu/?utm_source=lovets',
    'Вижте https://carbonstealth.eu/#id=5',
    'Вижте http://carbonstealth.eu/',
  ]) {
    const r = composeFirstEmail(input(v, { offer }), CFG, NOW);
    assert.equal(!r.ok && r.code, 'tracking_or_html', offer);
  }
  const lt = composeFirstEmail(
    input(v, { offer: 'Отговаряме за <5 мин, цена < 10 € и 3<4 — това е текст, не HTML.' }),
    CFG,
    NOW,
  );
  assert.ok(lt.ok, '„<“ в обикновен текст не е HTML');
  const comment = composeFirstEmail(
    input(v, { offer: 'Нещо <!-- скрито --> тук и още малко текст.' }),
    CFG,
    NOW,
  );
  assert.equal(!comment.ok && comment.code, 'tracking_or_html', 'HTML коментар');
  const plain = composeFirstEmail(
    input(v, { offer: 'Примери: https://carbonstealth.eu/rilievi' }),
    CFG,
    NOW,
  );
  assert.ok(plain.ok, 'чиста връзка без идентификатор е позволена');
});

test('гейтът на блоковете: махни кой да е блок → писмото пада с точния код', () => {
  const r = composeFirstEmail(input(verdict('info@firma.bg', 'BG')), CFG, NOW);
  assert.ok(r.ok);
  const d = r.draft;
  const cut = (re: RegExp) => ({ ...d, text: d.text.replace(re, '') });
  assert.ok(checkEmailBlocks(cut(/ЕИК 208725180/), CFG).includes('sender_identity'));
  assert.ok(
    checkEmailBlocks(cut(/https:\/\/carbonstealth\.eu\/privacy\/prospects/), CFG).includes(
      'art14_notice',
    ),
  );
  assert.ok(checkEmailBlocks(cut(/https:\/\/firma\.bg\/kontakti/g), CFG).includes('art14_notice'));
  assert.ok(
    checkEmailBlocks(cut(/https:\/\/lovets\.example\/u\/\S+/), CFG).includes('unsubscribe_link'),
  );
  assert.ok(
    checkEmailBlocks(
      { ...d, text: d.text.replace(/\n\s*\n(Можете по всяко време)/, ' $1') },
      CFG,
    ).includes('art21_objection'),
  );
  assert.ok(checkEmailBlocks({ ...d, subject: 'Предложение' }, CFG).includes('subject_marker'));
  assert.ok(
    checkEmailBlocks(
      { ...d, text: d.text + '\n<img src="https://x.example/p.gif">' },
      CFG,
    ).includes('tracking_or_html'),
  );
});

test('часовете за разговор: 3 работни дни поне ден напред, с часова зона на пазара', () => {
  const bg = suggestSlots(NOW, 'BG');
  assert.equal(bg.length, 3);
  for (const s of bg) {
    assert.ok(s.getTime() - NOW.getTime() >= 86_400_000, 'поне ден напред');
    const wd = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Sofia',
      weekday: 'short',
    }).format(s);
    assert.ok(!['Sat', 'Sun'].includes(wd), `без събота и неделя: ${wd}`);
  }
  assert.equal(new Set(bg.map((s) => s.toISOString().slice(0, 10))).size, 3, 'три различни дни');
  assert.match(formatSlot(bg[0]!, 'BG'), /10:00 ч\. българско време \(UTC\+2\)/);
  assert.match(formatSlot(suggestSlots(NOW, 'IT')[0]!, 'IT'), /ore 10:00, ora italiana \(UTC\+1\)/);
});

test('часовете: под 3, минали или по-рано от час напред → отказ (без измислена спешност)', () => {
  const v = verdict('info@firma.bg', 'BG');
  const two = composeFirstEmail(input(v, { slots: slots().slice(0, 2) }), CFG, NOW);
  assert.equal(!two.ok && two.code, 'slots_invalid');
  const past = composeFirstEmail(
    input(v, { slots: [new Date('2026-11-26T10:00:00Z'), ...slots().slice(1)] }),
    CFG,
    NOW,
  );
  assert.equal(!past.ok && past.code, 'slots_invalid');
});
