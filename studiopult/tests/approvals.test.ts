// Критерий 8: одобрението е вързано с requestId И сесията; чуждо → 404; таймаут или прекъсване → deny;
// „винаги разрешено“ (suggestions) НЕ се прилага — всяка команда минава с клик.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { Approvals, makeCanUseTool, describe } from '../src/approvals.js';
import { startTestServer, post } from './helpers.js';

test('решение на правилната сесия освобождава заявката', async () => {
  const a = new Approvals({ timeoutMs: 1000 });
  const { requestId, decision } = a.request('s1', { tool: 'Bash', detail: 'node -v' });
  assert.equal(a.decide('s2', requestId, true), 'not_found', 'друга сесия');
  assert.equal(a.decide('s1', 'измислено', true), 'not_found');
  assert.equal(a.decide('s1', requestId, true), 'ok');
  assert.equal(await decision, true);
  assert.equal(a.decide('s1', requestId, true), 'not_found', 'не два пъти');
});

test('таймаут → отказ', async () => {
  const a = new Approvals({ timeoutMs: 20 });
  assert.equal(await a.request('s1', { tool: 'Bash', detail: 'x' }).decision, false);
});

test('canUseTool: показва цялата команда; разрешено → allow без updatedPermissions; отказ → deny', async () => {
  const a = new Approvals({ timeoutMs: 1000 });
  const shown: { requestId: string; tool: string; detail: string }[] = [];
  const can = makeCanUseTool({ approvals: a, session: 's1', emit: (e) => shown.push(e as never) });
  const input = { command: 'node tools/video/presets.mjs master --in a.mov --out b.mov --run' };
  const suggestions = [
    { type: 'addRules', rules: [{ toolName: 'Bash' }], behavior: 'allow', destination: 'session' },
  ];
  const pending = can('Bash', input, {
    signal: new AbortController().signal,
    suggestions,
    toolUseID: 't1',
    requestId: 'r1',
  } as never);
  await new Promise((r) => setImmediate(r));
  assert.equal(shown.length, 1);
  assert.equal(shown[0]!.tool, 'Bash');
  assert.equal(shown[0]!.detail, input.command, 'дословно, без съкращаване');
  a.decide('s1', shown[0]!.requestId, true);
  const res = (await pending)!;
  assert.equal(res.behavior, 'allow');
  assert.equal('updatedPermissions' in res, false, '„винаги разрешено“ не се прилага');
  assert.deepEqual((res as { updatedInput?: unknown }).updatedInput, input);

  const pending2 = can('Write', { file_path: 'x.txt', content: 'y' }, {
    signal: new AbortController().signal,
    toolUseID: 't2',
    requestId: 'r2',
  } as never);
  await new Promise((r) => setImmediate(r));
  assert.equal(shown[1]!.detail.startsWith('x.txt'), true);
  a.decide('s1', shown[1]!.requestId, false);
  assert.equal((await pending2)!.behavior, 'deny');
});

test('прекъсване (затворена страница) → deny', async () => {
  const a = new Approvals({ timeoutMs: 5000 });
  const ac = new AbortController();
  const can = makeCanUseTool({ approvals: a, session: 's1', emit: () => {} });
  const pending = can('Bash', { command: 'x' }, {
    signal: ac.signal,
    toolUseID: 't',
    requestId: 'r',
  } as never);
  ac.abort();
  assert.equal((await pending)!.behavior, 'deny');
});

const p = await startTestServer();
after(() => p.close());

test('HTTP: непознато одобрение → 404; лошо тяло → 400', async () => {
  assert.equal((await post(p, '/api/approve', { requestId: 'nema', allow: true })).status, 404);
  assert.equal((await post(p, '/api/approve', { requestId: 5 })).status, 400);
});

test('картата носи името на агента (не вътрешното id); без agentID → диспечерът', async () => {
  const a = new Approvals({ timeoutMs: 1000 });
  const shown: { requestId: string; agent?: string }[] = [];
  const can = makeCanUseTool({
    approvals: a,
    session: 's1',
    agentName: 'ai-studio',
    emit: (e) => shown.push(e as never),
  });
  const p1 = can('Bash', { command: 'x' }, {
    signal: new AbortController().signal,
    toolUseID: 't',
    requestId: 'r',
    agentID: 'a113f47006ae0b579',
  } as never);
  const p2 = can('Bash', { command: 'y' }, {
    signal: new AbortController().signal,
    toolUseID: 'u',
    requestId: 'q',
  } as never);
  await new Promise((r) => setImmediate(r));
  assert.equal(shown[0]!.agent, 'ai-studio');
  assert.equal(shown[1]!.agent, 'диспечер');
  for (const s of shown) a.decide('s1', s.requestId, false);
  await Promise.all([p1, p2]);
});

test('#515: за Write и Edit картата показва съдържанието, не само пътя', () => {
  const w = describe('Write', { file_path: 'out/a.txt', content: 'ред 1\nред 2' });
  assert.match(w, /out\/a\.txt/);
  assert.match(w, /ред 1\nред 2/);
  const e = describe('Edit', { file_path: 'b.ts', old_string: 'стар', new_string: 'нов' });
  assert.match(e, /стар/);
  assert.match(e, /нов/);
  const big = describe('Write', { file_path: 'c.txt', content: 'x'.repeat(10000) });
  assert.ok(big.length < 7000);
  assert.match(big, /още \d+ знака/);
});

// Червеният екип на #515 (F4): U+202E стигаше до textContent и браузърът обръщаше видимия ред (Trojan Source).
test('#515: bidi, невидими и управляващи знаци в картата се виждат като ⟨U+…⟩', () => {
  const d = describe('Bash', { command: 'echo ok #\u202e;)rm -rf ~(\u200b\u2066x\u0007' });
  assert.doesNotMatch(d, /[\u202a-\u202e\u2066-\u2069\u200b-\u200f\u0000-\u0008]/);
  assert.match(d, /⟨U\+202E⟩/);
  assert.match(d, /⟨U\+200B⟩/);
  assert.match(d, /⟨U\+2066⟩/);
  assert.match(d, /⟨U\+0007⟩/);
  const multi = describe('Bash', { command: 'a\nb\nc' });
  assert.match(multi, /^a\nb\nc\n— 3 реда, 5 знака$/);
  assert.equal(
    describe('Bash', { command: 'node -v' }),
    'node -v',
    'един ред — дословно, без бележка',
  );
});
