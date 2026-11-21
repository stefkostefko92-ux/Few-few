import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blockFormValues, parseBlockInput, type BlockMeta } from '../blocks';

// Редакция на блок: формата се попълва от записа. Ако собственикът натисне
// „Запази“ без промяна, блокът трябва да остане същият (url + meta).

const cases: { kind: string; url: string; extra1?: string; extra2?: string; options?: string }[] = [
  { kind: 'LINK', url: 'https://example.com/a?b=1' },
  { kind: 'TIP', url: 'https://ko-fi.com/maria' },
  { kind: 'VIDEO', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
  { kind: 'PHONE', url: '+359 88 123 4567' },
  { kind: 'MAP', url: 'ул. Самуил 3, Бобов дол' },
  { kind: 'APP', url: 'https://example.com', extra1: 'https://apps.apple.com/app/x', extra2: 'https://play.google.com/store/apps/details?id=x' },
  { kind: 'VCARD', url: '+39 02 1234', extra1: 'a@example.com', extra2: 'Studio' },
  { kind: 'MUSIC', url: 'https://open.spotify.com/artist/1', extra1: 'https://music.apple.com/x' },
  { kind: 'POLL', url: '', options: 'Да\nНе\nМоже би' },
  { kind: 'HEADER', url: '' },
  { kind: 'EMAIL', url: '' },
];

for (const input of cases) {
  test(`blockFormValues: пълен кръг без промяна — ${input.kind}`, () => {
    const first = parseBlockInput({
      kind: input.kind,
      url: input.url,
      extra1: input.extra1 ?? '',
      extra2: input.extra2 ?? '',
      options: input.options ?? '',
      color: '#ff2d95',
      featured: true,
    });
    assert.ok(first, 'началният вход е валиден');
    const form = blockFormValues({ kind: input.kind, url: first.url, meta: first.meta });
    const again = parseBlockInput({ kind: input.kind, ...form });
    assert.ok(again);
    assert.equal(again.url, first.url);
    assert.deepEqual(again.meta, first.meta);
    assert.equal((form as { color: string }).color, '#ff2d95');
    assert.equal(form.featured, true);
  });
}

test('blockFormValues: без meta и с повреден url не гърми', () => {
  assert.equal(blockFormValues({ kind: 'MAP', url: 'не е url', meta: null }).url, '');
  assert.equal(blockFormValues({ kind: 'APP', url: null, meta: 'x' as unknown as BlockMeta }).extra1, '');
});
