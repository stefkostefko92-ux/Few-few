import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  LINKTREE_MAX_LINKS,
  linktreeUsername,
  parseLinktreeHtml,
} from '../linktree-import';

const fixture = readFileSync(
  path.join(import.meta.dirname, 'fixtures', 'linktree-page.html'),
  'utf8',
);

test('linktreeUsername: приема име, @име и linktr.ee адрес', () => {
  assert.equal(linktreeUsername('maria'), 'maria');
  assert.equal(linktreeUsername('@maria'), 'maria');
  assert.equal(linktreeUsername('linktr.ee/maria'), 'maria');
  assert.equal(linktreeUsername('https://linktr.ee/maria.p_1?utm=x'), 'maria.p_1');
  assert.equal(linktreeUsername('https://www.linktr.ee/maria/'), 'maria');
});

test('linktreeUsername: чужд хост / път / празно → null (без SSRF)', () => {
  assert.equal(linktreeUsername('https://evil.example/maria'), null);
  assert.equal(linktreeUsername('linktr.ee.evil.com/maria'), null);
  assert.equal(linktreeUsername('https://linktr.ee/maria/admin'), null);
  assert.equal(linktreeUsername('http://169.254.169.254/'), null);
  assert.equal(linktreeUsername(''), null);
  assert.equal(linktreeUsername('мария'), null);
});

test('parseLinktreeHtml: профил, ред по position, без дубликати/заключени/опасни', () => {
  const parsed = parseLinktreeHtml(fixture, 'maria');
  assert.ok(parsed);
  assert.equal(parsed.displayName, 'Мария Петрова');
  assert.equal(parsed.bio, 'Фотограф · сватби и портрети');
  assert.equal(parsed.avatarUrl, 'https://ugc.production.linktr.ee/abc/avatar.jpeg');
  assert.deepEqual(parsed.blocks, [
    { kind: 'HEADER', title: 'Работи' },
    { kind: 'LINK', title: 'Портфолио', url: 'https://maria.example.com/' },
    { kind: 'LINK', title: 'shop.example.com', url: 'https://shop.example.com/x' },
    { kind: 'LINK', title: 'Instagram', url: 'https://instagram.com/maria' },
    { kind: 'LINK', title: 'X Twitter', url: 'https://x.com/maria' },
  ]);
});

test('parseLinktreeHtml: аватар извън CDN-а на Linktree се игнорира', () => {
  const html = fixture.replace(
    'https://ugc.production.linktr.ee/abc/avatar.jpeg',
    'https://evil.example/a.jpg',
  );
  assert.equal(parseLinktreeHtml(html, 'maria')?.avatarUrl, null);
});

test('parseLinktreeHtml: без __NEXT_DATA__ или с счупен JSON → null', () => {
  assert.equal(parseLinktreeHtml('<html></html>', 'maria'), null);
  assert.equal(
    parseLinktreeHtml('<script id="__NEXT_DATA__">{oops</script>', 'maria'),
    null,
  );
});

test('parseLinktreeHtml: таван на блоковете', () => {
  const links = Array.from({ length: 200 }, (_, i) => ({
    title: `L${i}`,
    url: `https://e.example/${i}`,
    position: i,
  }));
  const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
    props: { pageProps: { account: { pageTitle: 'X' }, links } },
  })}</script>`;
  assert.equal(parseLinktreeHtml(html, 'x')?.blocks.length, LINKTREE_MAX_LINKS);
});
