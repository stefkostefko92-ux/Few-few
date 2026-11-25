import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyDraft, decodeDraft, encodeDraft, DRAFT_MAX } from '../preview-draft';

// Живият преглед: черновата идва от браузъра → сървърът я валидира като при
// запис и я прилага само върху копие за показване. Нищо не се записва.

const profile = {
  id: 'p1',
  defaultLocale: 'bg',
  theme: 'aurora',
  accent: '#112233',
  style: { bgStyle: 'theme' },
  translations: [
    { id: 't1', profileId: 'p1', locale: 'bg', displayName: 'Мария', bio: 'Био' },
    { id: 't2', profileId: 'p1', locale: 'en', displayName: 'Maria', bio: null },
  ],
  links: [
    {
      id: 'l1',
      translations: [
        { id: 'x1', linkId: 'l1', locale: 'bg', title: 'Магазин' },
        { id: 'x2', linkId: 'l1', locale: 'en', title: 'Shop' },
      ],
    },
  ],
};

test('encode/decode: обратими, вкл. кирилица; празна чернова → празен низ', () => {
  const draft = { theme: 'mono', tr: { bg: { n: 'Ива ✨', b: 'здравей' } } };
  assert.deepEqual(decodeDraft(encodeDraft(draft)), { theme: 'mono', tr: { bg: { n: 'Ива ✨', b: 'здравей' } } });
  assert.equal(encodeDraft({}), '');
});

test('decode: боклук, чужди знаци и прекалено дълъг вход → null', () => {
  assert.equal(decodeDraft(undefined), null);
  assert.equal(decodeDraft('не+е/base64'), null);
  assert.equal(decodeDraft('eyJhIjox'), null); // счупен JSON
  assert.equal(decodeDraft(encodeDraft({ theme: 'x' }) + 'A'.repeat(DRAFT_MAX)), null);
  // Масив вместо обект
  assert.equal(decodeDraft(Buffer.from('[1,2]').toString('base64url')), null);
});

test('decode: реже дълги стойности и пропуска невалидни езици', () => {
  const draft = decodeDraft(
    encodeDraft({ tr: { bg: { n: 'я'.repeat(300) }, '../x': { n: 'зло' } } }),
  );
  assert.equal(draft?.tr?.bg?.n?.length, 100);
  assert.equal(draft?.tr?.['../x'], undefined);
});

test('apply: тема само от списъка, акцент само hex, празен акцент = без', () => {
  assert.equal(applyDraft(profile, { theme: 'mono' }, { canHideBadge: false }).theme, 'mono');
  assert.equal(applyDraft(profile, { theme: 'хакер' }, { canHideBadge: false }).theme, 'aurora');
  assert.equal(applyDraft(profile, { accent: '#abcdef' }, { canHideBadge: false }).accent, '#abcdef');
  assert.equal(applyDraft(profile, { accent: 'red;x' }, { canHideBadge: false }).accent, '#112233');
  assert.equal(applyDraft(profile, { accent: '' }, { canHideBadge: false }).accent, null);
});

test('apply: стилът минава през схемата; скрит бадж само при план, който позволява', () => {
  const draft = { style: { bgStyle: 'solid', bgColor1: '#000000', font: 'serif', hideBadge: 'on' } };
  const free = applyDraft(profile, draft, { canHideBadge: false }).style as Record<string, unknown>;
  assert.equal(free.bgStyle, 'solid');
  assert.equal(free.font, 'serif');
  assert.equal(free.hideBadge, false);
  const pro = applyDraft(profile, draft, { canHideBadge: true }).style as Record<string, unknown>;
  assert.equal(pro.hideBadge, true);
  // Невалидно поле пада към подразбирането, останалите остават.
  const bad = applyDraft(profile, { style: { font: 'comic', layout: 'grid' } }, { canHideBadge: false })
    .style as Record<string, unknown>;
  assert.equal(bad.font, 'sans');
  assert.equal(bad.layout, 'grid');
});

test('apply: име/био по език; празно име = остава записаното', () => {
  const next = applyDraft(profile, { tr: { bg: { n: '', b: '' }, en: { n: 'Mary' } } }, { canHideBadge: false });
  assert.equal(next.translations[0].displayName, 'Мария');
  assert.equal(next.translations[0].bio, null);
  assert.equal(next.translations[1].displayName, 'Mary');
  assert.equal(profile.translations[1].displayName, 'Maria'); // оригиналът не е пипнат
});

test('apply: заглавия на блокове — нов превод, махнат превод, основният език не се трие', () => {
  const next = applyDraft(
    profile,
    { lt: { l1: { bg: '', en: '', de: 'Laden' }, чужд: { bg: 'x' } } },
    { canHideBadge: false },
  );
  const titles = Object.fromEntries(next.links[0].translations.map((t) => [t.locale, t.title]));
  assert.deepEqual(titles, { bg: 'Магазин', de: 'Laden' });
  assert.equal(next.links.length, 1);
});
