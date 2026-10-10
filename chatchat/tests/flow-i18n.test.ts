import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { TICKET_EVENT_TYPES } from '../src/services/tickets/events.js';

/**
 * Работният поток (FR-09, FR-19, §11.2): всеки код, който сървърът му връща, всяко събитие в
 * хронологията и всяко известие има превод на трите езика — под префиксите на потока
 * (`step.*`, `ticket.*`, `handoff.*`) или в общите `err.*`/`tl.*`/`notif.*`.
 */

const ROOT = join(import.meta.dirname, '..');
const load = (l: string) =>
  JSON.parse(readFileSync(join(ROOT, 'public', 'i18n', `${l}.json`), 'utf8')) as Record<
    string,
    string
  >;
const dicts = ['bg', 'it', 'en'].map(load);
const translated = (key: string) => dicts.every((d) => typeof d[key] === 'string' && d[key] !== '');

function sources(): string[] {
  const dirs = ['src/services/steps', 'src/services/tickets'];
  const files = dirs.flatMap((d) => readdirSync(join(ROOT, d)).map((f) => join(ROOT, d, f)));
  for (const r of ['case-steps', 'case-flow', 'ticket-flow', 'ticket-queue', 'step-policy']) {
    files.push(join(ROOT, 'src', 'routes', `${r}.ts`));
  }
  return files.map((f) => readFileSync(f, 'utf8'));
}

/** `ticket.claimed` → `ticket.tl.claimed` (същата схема като public/app/flow/labels.js). */
const flowKey = (type: string, kind: string) => type.replace(/^(\w+)\./, `$1.${kind}.`);

describe('преводите на работния поток', () => {
  test('всеки код за грешка от услугите и маршрутите на потока е преведен', () => {
    const codes = new Set<string>();
    for (const s of sources()) {
      for (const m of s.matchAll(
        /(?:fail(?:<[^>]*>)?\(\d{3}, |apiError\(res, \d{3}, )'([a-z_]+)'/g,
      )) {
        codes.add(m[1] ?? '');
      }
    }
    assert.ok(codes.size >= 15, `кодове: ${[...codes].join(', ')}`);
    const missing = [...codes].filter(
      (c) =>
        !translated(`err.${c}`) && !translated(`step.err.${c}`) && !translated(`ticket.err.${c}`),
    );
    assert.deepEqual(missing, []);
  });

  test('всяко събитие на тикета и на стъпките има етикет в хронологията', () => {
    const steps = [
      'step.executed',
      'step.approval_requested',
      'step.approval_granted',
      'step.approval_denied',
      'step.approval_cancelled',
    ];
    const missing = [...TICKET_EVENT_TYPES, ...steps].filter(
      (t) => !translated(`tl.${t}`) && !translated(flowKey(t, 'tl')),
    );
    assert.deepEqual(missing, []);
  });

  test('всяко известие на потока има текст', () => {
    const events = [
      'ticket.changed',
      'ticket.assigned',
      'ticket.info_requested',
      'ticket.info_provided',
      'ticket.escalated',
      'handoff.requested',
      'handoff.message',
      'handoff.to_ai',
      'step.approval_requested',
      'step.approval_granted',
      'step.approval_denied',
    ];
    const missing = events.filter(
      (e) => !translated(`notif.${e}`) && !translated(flowKey(e, 'notif')),
    );
    assert.deepEqual(missing, []);
  });

  test('нивата, резултатите и опашките — на трите езика', () => {
    const keys = [
      ...['NONE', 'SELF', 'SUPPORT', 'ENGINEERING'].map((l) => `step.level.${l}`),
      ...['OK', 'KO', 'NOT_POSSIBLE'].map((r) => `step.result.${r}`),
      ...['SUPPORT', 'ENGINEERING'].map((q) => `queue.name.${q}`),
    ];
    assert.deepEqual(
      keys.filter((k) => !translated(k)),
      [],
    );
  });
});
