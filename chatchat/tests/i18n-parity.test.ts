import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';

/** Паритет на преводите: един и същ набор ключове и параметри в bg/it/en; всеки статичен ключ в UI е преведен. */

const PUBLIC = join(import.meta.dirname, '..', 'public');
const load = (l: string) =>
  JSON.parse(readFileSync(join(PUBLIC, 'i18n', `${l}.json`), 'utf8')) as Record<string, string>;
const dict = { bg: load('bg'), it: load('it'), en: load('en') };

const params = (s: string) =>
  [...s.matchAll(/\{(\w+)\}/g)]
    .map((m) => m[1])
    .sort()
    .join(',');

function sources(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) sources(p, out);
    else if (p.endsWith('.js') || p.endsWith('.html')) out.push(p);
  }
  return out;
}

describe('i18n паритет', () => {
  test('същите ключове във всички три езика', () => {
    const base = Object.keys(dict.bg).sort();
    assert.deepEqual(Object.keys(dict.it).sort(), base);
    assert.deepEqual(Object.keys(dict.en).sort(), base);
  });

  test('същите {параметри} във всеки превод и няма празни низове', () => {
    for (const [key, bg] of Object.entries(dict.bg)) {
      assert.notEqual(bg.trim(), '', `bg ${key} е празен`);
      assert.notEqual(dict.it[key]?.trim(), '', `it ${key} е празен`);
      assert.notEqual(dict.en[key]?.trim(), '', `en ${key} е празен`);
      assert.equal(params(dict.it[key] ?? ''), params(bg), `параметри it ${key}`);
      assert.equal(params(dict.en[key] ?? ''), params(bg), `параметри en ${key}`);
    }
  });

  test('всеки статичен ключ, ползван в public/, има превод', () => {
    const used = new Set<string>();
    for (const file of sources(PUBLIC)) {
      const s = readFileSync(file, 'utf8');
      for (const m of s.matchAll(/(?<![\w.$])(?:t|tx|has)\(\s*'([^']+)'/g)) used.add(m[1] ?? '');
      for (const m of s.matchAll(/data-i18n="([^"]+)"/g)) used.add(m[1] ?? '');
      for (const m of s.matchAll(/data-i18n-attr="([^"]+)"/g)) {
        for (const pair of (m[1] ?? '').split(';')) used.add(pair.split(':')[1]?.trim() ?? '');
      }
    }
    used.delete('');
    const missing = [...used].filter((k) => !(k in dict.bg));
    assert.deepEqual(missing, []);
  });

  test('кодовете на сървъра за потоците на F2 имат превод', () => {
    const codes = [
      'attachment_infected',
      'attachments_unavailable',
      'av_scan_failed',
      'av_unavailable',
      'unsupported_type',
      'payload_too_large',
      'invalid_attachment',
      'link_expired',
      'case_closed',
      'invalid_code',
      'invalid_password',
      'invalid_token',
      'weak_password',
      'mfa_already_enabled',
      'mfa_not_enabled',
      'mfa_required',
      'mfa_setup_required',
      'mfa_required_for_role',
      'mfa_setup_missing',
      'too_many_attempts',
      'too_many_requests',
      'edit_window_expired',
      'message_deleted',
      'member_not_allowed',
      'not_allowed_for_type',
      'unknown_user',
      'invalid_cursor',
      'forbidden',
      'not_found',
      'duplicate',
      'invalid_credentials',
    ];
    const extra = [
      'code.ctx.firmwareOutsideRevision',
      'code.ingest.pageWithoutText',
      'code.collect.betterPhoto',
      'code.collect.photoFormat',
      ...[
        'message.created',
        'message.mention',
        'case.assigned',
        'case.ai_answer',
        'ticket.changed',
      ].map((e) => `notif.${e}`),
      ...['like', 'dislike', 'done', 'seen', 'warning', 'question', 'thanks'].map(
        (r) => `react.${r}`,
      ),
      ...[
        'internal.discussion_opened',
        'internal.message',
        'internal.message_edited',
        'internal.message_deleted',
        'case.created',
        'case.outcome',
        'ai.answer',
        'feedback',
      ].map((e) => `tl.${e}`),
    ];
    const missing = [...codes.map((c) => `err.${c}`), ...extra].filter((k) => !(k in dict.bg));
    assert.deepEqual(missing, []);
  });
});
