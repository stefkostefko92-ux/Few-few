// Критерий 7: опциите на SDK са точно описаните — нашите .claude/ настройки (куки, пазачи, агенти),
// режим default + canUseTool, без Bash/Write/Edit в allowedTools, задължителни тавани, ключът само в env на
// SDK заедно със scrub и без автоматичната памет; главната нишка е диспечерът, който пуска НАШИЯ агент.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildOptions, listAgents, toUiEvent, toUiEvents, DISPATCH } from '../src/agent.js';
import { startTestServer, post, fakeRunner, FAKE_KEY } from './helpers.js';

const repo = join(import.meta.dirname, '..', '..');
const can = async () => ({ behavior: 'deny' as const, message: 'x' });

test('диспечер → нашият агент; нашите настройки; режим default; тавани', () => {
  const o = buildOptions({
    agentId: 'ai-studio',
    agents: ['ai-studio', 'seo'],
    repoRoot: repo,
    key: FAKE_KEY,
    canUseTool: can,
  });
  assert.deepEqual(o.settingSources, ['project']);
  assert.equal(o.cwd, repo);
  assert.equal(o.permissionMode, 'default');
  assert.equal(o.allowDangerouslySkipPermissions, undefined);
  assert.equal(o.agent, DISPATCH);
  assert.deepEqual(o.agents?.[DISPATCH]?.tools, ['Agent(ai-studio)']);
  assert.equal(o.agents?.[DISPATCH]?.model, 'sonnet');
  assert.equal(o.canUseTool, can);
  assert.equal(o.maxBudgetUsd, 3);
  assert.equal(o.maxTurns, 80);
  for (const t of [
    'Bash',
    'PowerShell',
    'Write',
    'Edit',
    'MultiEdit',
    'NotebookEdit',
    'Agent',
    'Task',
  ]) {
    assert.equal(
      o.allowedTools?.some((x) => x === t || x.startsWith(`${t}(`)),
      false,
      t,
    );
  }
  // F1: голо име в allowedTools одобрява целия инструмент без canUseTool — четенето се решава в куката.
  assert.deepEqual(o.allowedTools, []);
});

test('ключът е само в env на SDK, със scrub и без автоматична памет', () => {
  const o = buildOptions({
    agentId: 'seo',
    agents: ['ai-studio', 'seo'],
    repoRoot: repo,
    key: FAKE_KEY,
    canUseTool: can,
  });
  assert.equal(o.env?.ANTHROPIC_API_KEY, FAKE_KEY);
  assert.equal(o.env?.CLAUDE_CODE_SUBPROCESS_ENV_SCRUB, '1');
  assert.equal(o.env?.CLAUDE_CODE_DISABLE_AUTO_MEMORY, '1');
  assert.equal(o.env?.PATH, process.env.PATH, 'env заменя средата — PATH трябва да остане');
});

test('агент извън белия списък, самият диспечер или празно → грешка', () => {
  for (const id of ['evil', DISPATCH, '', '../ai-studio', 'ai-studio)', 'general-purpose']) {
    assert.throws(
      () =>
        buildOptions({
          agentId: id,
          agents: ['ai-studio'],
          repoRoot: repo,
          key: FAKE_KEY,
          canUseTool: can,
        }),
      id,
    );
  }
});

test('белият списък са нашите 35 агента от .claude/agents (без _*)', () => {
  const a = listAgents(repo);
  assert.equal(a.length, 35);
  assert.ok(a.includes('ai-studio'));
  assert.ok(a.every((x) => /^[a-z0-9][a-z0-9-]*$/.test(x)));
});

test('съобщенията на SDK стават събития за страницата', () => {
  assert.deepEqual(
    toUiEvent({
      type: 'stream_event',
      parent_tool_use_id: null,
      session_id: 's',
      uuid: 'u',
      event: {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'Здравей' },
      },
    } as never),
    { type: 'text', text: 'Здравей', sub: false },
  );
  assert.deepEqual(
    toUiEvent({
      type: 'result',
      subtype: 'success',
      total_cost_usd: 0.42,
      session_id: 's9',
      result: 'готово',
      is_error: false,
    } as never),
    { type: 'result', cost: 0.42, sessionId: 's9', ok: true },
  );
  assert.equal(toUiEvent({ type: 'system', subtype: 'init' } as never), null);
});

const p = await startTestServer({
  runner: fakeRunner([
    {
      type: 'stream_event',
      parent_tool_use_id: 'x',
      session_id: 's1',
      uuid: 'u1',
      event: {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'Рендирам' },
      },
    },
    {
      type: 'result',
      subtype: 'success',
      total_cost_usd: 1.25,
      session_id: 's1',
      result: 'ok',
      is_error: false,
    },
  ]),
});
after(() => p.close());

test('HTTP: чат с нашия агент минава през runner-а, разходът влиза в дневния таван', async () => {
  const r = await post(p, '/api/chat', {
    agent: 'ai-studio',
    text: 'Направи 4K60 от out/master.mov',
  });
  assert.equal(r.status, 202);
  for (let i = 0; i < 50 && p.deps.budget.status().spent === 0; i++)
    await new Promise((res) => setTimeout(res, 10));
  assert.equal(p.deps.budget.status().spent, 1.25);
  const call = (p.deps.runner as ReturnType<typeof fakeRunner>).calls[0]!;
  assert.equal(call.prompt, 'Направи 4K60 от out/master.mov');
  assert.equal((call.options as { agent: string }).agent, DISPATCH);
  assert.equal((await post(p, '/api/chat', { agent: 'general-purpose', text: 'x' })).status, 400);
  assert.equal((await post(p, '/api/chat', { agent: 'ai-studio', text: '' })).status, 400);
});

// Живата проба (28.11.2026): субагентът тръгна ФОНОВО и диспечерът отговори „още работи“, преди резултата;
// Stop куките на работната сесия искаха от диспечера commit и артефакт.
test('живата проба: субагентът е на преден план; пултът се представя на куките (STUDIOPULT=1)', async () => {
  const o = buildOptions({
    agentId: 'ai-studio',
    agents: ['ai-studio'],
    repoRoot: repo,
    key: FAKE_KEY,
    canUseTool: can,
  });
  assert.equal(o.env?.STUDIOPULT, '1');
  const m = o.hooks?.PreToolUse?.find((x) => x.matcher === 'Agent');
  assert.ok(m, 'PreToolUse кука за Agent');
  const out = (await m.hooks[0]!(
    {
      hook_event_name: 'PreToolUse',
      tool_name: 'Agent',
      tool_input: { subagent_type: 'ai-studio', prompt: 'x', run_in_background: true },
      tool_use_id: 't',
    } as never,
    't',
    { signal: new AbortController().signal },
  )) as { hookSpecificOutput?: { updatedInput?: Record<string, unknown> } };
  assert.equal(out.hookSpecificOutput?.updatedInput?.run_in_background, false);
  assert.equal(
    out.hookSpecificOutput?.updatedInput?.subagent_type,
    'ai-studio',
    'останалото е непокътнато',
  );
  const other = (await m.hooks[0]!(
    {
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'x' },
      tool_use_id: 'u',
    } as never,
    'u',
    { signal: new AbortController().signal },
  )) as Record<string, unknown>;
  assert.deepEqual(other, {}, 'друг инструмент — без намеса');
});

// Прегледът на #515 (AI-джията) и червеният екип (F1): голо име в allowedTools одобрява целия инструмент
// и canUseTool не се вика (code.claude.com/docs/en/agent-sdk/permissions) → Read на ключа + WebFetch навън
// без нито един клик. Сега allowedTools е празен; куката пуска четенето само в репото и в студиото, забранява
// папката на пулта (ключът) и /proc, всичко друго минава през клик.
const hookCall = (o: ReturnType<typeof buildOptions>, matcher: string) => {
  const h = o.hooks?.PreToolUse?.find((x) => x.matcher === matcher);
  assert.ok(h, `кука ${matcher}`);
  return async (tool: string, input: Record<string, unknown>) =>
    (
      (await h.hooks[0]!(
        {
          hook_event_name: 'PreToolUse',
          tool_name: tool,
          tool_input: input,
          tool_use_id: 't',
        } as never,
        't',
        { signal: new AbortController().signal },
      )) as {
        hookSpecificOutput?: {
          permissionDecision?: string;
          updatedInput?: Record<string, unknown>;
        };
      }
    ).hookSpecificOutput;
};

test('#515 F1: без голи имена в allowedTools; четене — само в репото и студиото; ключът и /proc — никога', async () => {
  const studio = mkdtempSync(join(tmpdir(), 'pult-studio-'));
  const data = join(tmpdir(), 'pult-data-x', 'studiopult');
  after(() => rmSync(studio, { recursive: true, force: true }));
  const o = buildOptions({
    agentId: 'ai-studio',
    agents: ['ai-studio'],
    repoRoot: repo,
    key: FAKE_KEY,
    canUseTool: can,
    dataDir: data,
    studioDir: studio,
  });
  assert.deepEqual(o.allowedTools ?? [], [], 'нито Read, нито WebFetch/WebSearch без контрол');
  const call = hookCall(o, 'Read|Grep|Glob');
  const dec = async (tool: string, input: Record<string, unknown>) =>
    (await call(tool, input))?.permissionDecision;
  // в репото и в студиото — без клик
  assert.equal(
    await dec('Read', { file_path: join(repo, 'tools', 'video', 'README.md') }),
    'allow',
  );
  assert.equal(
    await dec('Read', { file_path: 'tools/video/README.md' }),
    'allow',
    'относителен спрямо репото',
  );
  assert.equal(await dec('Grep', { pattern: 'ffmpeg' }), 'allow', 'без path — cwd = репото');
  assert.equal(await dec('Glob', { pattern: '**/*.mp4', path: studio }), 'allow');
  // папката на пулта: пряко, с .., с друг регистър/разделител на Windows, обхождане на родител
  for (const [tool, input] of [
    ['Read', { file_path: join(data, 'key.txt') }],
    ['Read', { file_path: join(data, '..', 'studiopult', 'key.txt') }],
    ['Grep', { pattern: 'sk-ant', path: data }],
    ['Grep', { pattern: 'sk-ant', path: join(data, '..') }],
    ['Glob', { pattern: '**/*', path: join(data, '..', '..') }],
    ['Glob', { pattern: join(data, '*') }],
    ['Read', { file_path: '/proc/self/environ' }],
  ] as const) {
    assert.equal(await dec(tool, input), 'deny', `${tool} ${JSON.stringify(input)}`);
  }
  // извън репото и студиото — без решение от куката → canUseTool (клик)
  assert.equal(await dec('Read', { file_path: '/etc/hostname' }), undefined);
  assert.equal(await dec('Glob', { pattern: '../../**/key.txt' }), undefined, '.. в шаблона');
  assert.equal(await dec('Grep', { pattern: 'x', glob: '../**' }), undefined);
  assert.equal(await dec('Read', { file_path: 42 as never }), undefined, 'странен вход — клик');
});

test('#515 F1 (Windows): регистърът и разделителите не отварят ключа', async () => {
  const { pathVerdict } = await import('../src/agent.js');
  const w = {
    platform: 'win32' as const,
    cwd: 'C:\\Users\\Owner\\Few-few',
    roots: ['C:\\Users\\Owner\\Few-few'],
    data: 'C:\\Users\\Owner\\AppData\\Local\\studiopult',
  };
  assert.equal(pathVerdict('c:/users/owner/appdata/local/STUDIOPULT/key.txt', w), 'deny');
  assert.equal(
    pathVerdict('C:\\Users\\Owner\\AppData\\Local', w, true),
    'deny',
    'родител при обхождане',
  );
  assert.equal(
    pathVerdict('\\\\?\\C:\\Users\\Owner\\AppData\\Local\\studiopult\\key.txt', w),
    'deny',
    '\\\\?\\ префикс',
  );
  assert.equal(pathVerdict('C:\\Users\\Owner\\few-few\\tools\\x.md', w), 'allow');
  assert.equal(pathVerdict('C:\\Users\\Owner\\Desktop\\x.md', w), 'ask');
  assert.equal(
    pathVerdict('C:\\Users\\OWNER~1\\AppData\\Local\\STUDIO~1\\key.txt', w),
    'ask',
    '8.3 име: лексикално не е в корена → клик (realpath го разгъва, когато съществува)',
  );
});

test('#515: диспечерът вика само избрания агент и не сменя модела, усилието или изолацията', async () => {
  const o = buildOptions({
    agentId: 'ai-studio',
    agents: ['ai-studio'],
    repoRoot: repo,
    key: FAKE_KEY,
    canUseTool: can,
  });
  const call = hookCall(o, 'Agent');
  assert.equal(
    (await call('Agent', { subagent_type: 'seo', prompt: 'x' }))?.permissionDecision,
    'deny',
  );
  const out = await call('Agent', {
    subagent_type: 'ai-studio',
    prompt: 'x',
    model: 'opus',
    effort: 'max',
    isolation: 'remote',
    mode: 'bypassPermissions',
    name: 'x',
    team_name: 't',
    run_in_background: true,
  });
  assert.equal(out?.permissionDecision, 'allow');
  assert.deepEqual(out?.updatedInput, {
    subagent_type: 'ai-studio',
    prompt: 'x',
    run_in_background: false,
  });
});

test('#515: диспечерът не повтаря отговора (двойни изходни токени) — текстът на агента идва от субагента', () => {
  const o = buildOptions({
    agentId: 'ai-studio',
    agents: ['ai-studio'],
    repoRoot: repo,
    key: FAKE_KEY,
    canUseTool: can,
  });
  assert.match(o.agents![DISPATCH]!.prompt, /само „Готово\.“/);
  assert.doesNotMatch(o.agents![DISPATCH]!.prompt, /върни отговора му дословно/);
  const sub = toUiEvents({
    type: 'assistant',
    parent_tool_use_id: 'x',
    session_id: 's',
    uuid: 'u',
    message: {
      content: [
        { type: 'text', text: 'Отговор на агента' },
        { type: 'tool_use', name: 'Bash' },
      ],
    },
  } as never);
  assert.deepEqual(sub, [
    { type: 'text', text: 'Отговор на агента', sub: true },
    { type: 'tool', name: 'Bash', sub: true },
  ]);
  assert.deepEqual(
    toUiEvents({
      type: 'stream_event',
      parent_tool_use_id: 'x',
      session_id: 's',
      uuid: 'u',
      event: {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'дубъл' },
      },
    } as never),
    [],
    'частичните на субагента не се показват два пъти',
  );
  assert.deepEqual(
    toUiEvents({
      type: 'assistant',
      parent_tool_use_id: null,
      session_id: 's',
      uuid: 'u',
      message: { content: [{ type: 'text', text: 'вече показан чрез потока' }] },
    } as never),
    [],
    'текстът на диспечера идва от потока',
  );
});

// Втори преглед на #515 (AI-джията): вградените команди само за четене (cat, head…) минават без canUseTool
// (code.claude.com/docs/en/permissions: „Bash … Yes, except a built-in set of read-only commands“). Ask правило
// от настройките праща всяко извикване към canUseTool (agent-sdk/permissions, стъпка 3); Read deny правилата
// важат и за cat/head/tail/sed/tee в Bash и печелят дори над „allow“ от кука.
test('#515: всеки Bash/PowerShell/WebFetch/WebSearch — през клик; Read deny за папката на пулта и /proc', () => {
  const o = buildOptions({
    agentId: 'ai-studio',
    agents: ['ai-studio'],
    repoRoot: repo,
    key: FAKE_KEY,
    canUseTool: can,
    dataDir: '/home/u/.config/studiopult',
  });
  const st = o.settings as { permissions?: { ask?: string[] } };
  for (const t of ['Bash', 'PowerShell', 'WebFetch', 'WebSearch'])
    assert.ok(st.permissions?.ask?.includes(t), t);
  assert.ok(o.disallowedTools?.includes('Read(//home/u/.config/studiopult/**)'));
  assert.ok(
    o.disallowedTools?.includes('Read(//**/studiopult/key.txt)'),
    'по име — независимо от пътя',
  );
  if (process.platform !== 'win32') assert.ok(o.disallowedTools?.includes('Read(//proc/**)'));
});

test('#515: правилото за път на Windows е в POSIX форма (C:\\… → //c/…)', async () => {
  const { ruleFor } = await import('../src/agent.js');
  assert.equal(
    ruleFor('C:\\Users\\Owner\\AppData\\Local\\studiopult', 'win32'),
    '//c/Users/Owner/AppData/Local/studiopult',
  );
  assert.equal(ruleFor('/home/u/.config/studiopult', 'linux'), '//home/u/.config/studiopult');
});

// Втори преглед на #515 (AI-джията): субагентът тръгва на чисто (agent-sdk/subagents) — resume на диспечера не
// даваше контекст на агента. Продължението носи предишния ход в подканата; на SDK не се подава resume.
test('#515 HTTP: „продължи разговора“ — предишният ход е в подканата, без resume', async () => {
  const runner = fakeRunner([
    {
      type: 'assistant',
      parent_tool_use_id: 't',
      session_id: 's',
      uuid: 'a',
      message: { id: 'm', content: [{ type: 'text', text: 'Мастерът е готов: out/master.mov' }] },
    },
    {
      type: 'result',
      subtype: 'success',
      total_cost_usd: 0.1,
      session_id: 's',
      is_error: false,
      result: '',
    },
  ]);
  const s = await startTestServer({ runner });
  try {
    assert.equal(
      (await post(s, '/api/chat', { agent: 'ai-studio', text: 'Направи мастер' })).status,
      202,
    );
    let r: Response | undefined;
    for (let i = 0; i < 50; i++) {
      r = await post(s, '/api/chat', {
        agent: 'ai-studio',
        text: 'Съкрати го',
        keep: true,
        resume: 'aaaaaaaa-1111',
      });
      if (r.status === 202) break;
      await new Promise((res) => setTimeout(res, 10));
    }
    assert.equal(r?.status, 202);
    const second = runner.calls[1]!;
    assert.match(second.prompt, /Направи мастер/);
    assert.match(second.prompt, /Мастерът е готов: out\/master\.mov/);
    assert.match(second.prompt, /Съкрати го$/);
    assert.equal((second.options as { resume?: string }).resume, undefined);
    for (let i = 0; i < 50; i++) {
      r = await post(s, '/api/chat', { agent: 'seo', text: 'Друго', keep: true });
      if (r.status === 202) break;
      await new Promise((res) => setTimeout(res, 10));
    }
    assert.equal(runner.calls[2]!.prompt, 'Друго', 'друг агент — без чужд контекст');
  } finally {
    s.close();
  }
});
