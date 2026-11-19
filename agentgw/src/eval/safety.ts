/**
 * Живата оценка на безопасността на публичния чатбот — САМО по изрична команда на собственика
 * на сървъра (вика Vertex AI и струва пари). `npm test` никога не стига дотук.
 *
 *   node dist/eval/safety.js run --max-usd 5 [--repeats 7] [--out файл.jsonl]
 *   node dist/eval/safety.js kappa <отчет.jsonl> <човешка-разметка.jsonl>
 *
 * Изход: 0 = pass, 1 = fail, 2 = invalid/грешка в употребата. Записите са синтетични
 * разговори (симулиран потребител), не разговори на посетители.
 */
import { createHash } from 'node:crypto';
import { appendFileSync, chmodSync, readFileSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AnthropicVertex } from '@anthropic-ai/vertex-sdk';
import { createApp } from '../app.js';
import { buildParams, VertexChatModel } from '../claude.js';
import { loadConfig, type Config } from '../config.js';
import { generateKey, hashKey, keyPrefix, monthKey, usdToMicro } from '../keys.js';
import { silenceLogs } from '../logger.js';
import { costMicroUsd, hasPrice, inputTokensUpperBound } from '../pricing.js';
import { loadProfiles } from '../profiles.js';
import { MemoryStore } from '../store/memory.js';
import { cohenKappa, summarize } from './metrics.js';
import {
  Budget,
  httpTarget,
  runEval,
  type CaseResult,
  type CostCeiling,
  type Llm,
  type LlmRequest,
  type Target,
} from './runner.js';
import { PREREGISTRATION, RUBRICS, SCENARIOS, type Scenario } from './scenarios.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function usage(msg: string): never {
  console.error(
    `${msg}\n\nУпотреба:\n  node dist/eval/safety.js run --max-usd N [--repeats N] [--out файл.jsonl]\n  node dist/eval/safety.js kappa <отчет.jsonl> <разметка.jsonl>`,
  );
  process.exit(2);
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
}

/** Помощен модел през същия Vertex (ЕС). Без temperature/top_p; никога Haiku. */
function vertexLlm(client: AnthropicVertex, model: string, cfg: Config): Llm {
  return async ({ system, messages, maxTokens }) => {
    const m = await client.messages.create({
      model,
      max_tokens: maxTokens,
      system,
      messages: messages.map((x) => ({ role: x.role, content: x.content })),
      thinking: { type: 'adaptive', display: 'omitted' },
      output_config: { effort: 'medium' },
    });
    const text = m.content
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('')
      .trim();
    const u = m.usage;
    const costMicro = costMicroUsd(
      model,
      {
        inputTokens: u.input_tokens,
        outputTokens: u.output_tokens,
        cacheReadTokens: u.cache_read_input_tokens ?? 0,
        cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
      },
      cfg.PRICE_MULTIPLIER,
    );
    return { text, stop: m.stop_reason, costMicro };
  };
}

async function run(): Promise<number> {
  const maxUsd = Number(arg('--max-usd'));
  if (!Number.isFinite(maxUsd) || maxUsd <= 0) {
    usage('Липсва --max-usd: таванът на разхода е задължителен (няма подразбиране).');
  }
  const repeats = Number(arg('--repeats') ?? PREREGISTRATION.defaultRepeats);
  if (!Number.isInteger(repeats) || repeats < 1 || repeats > 50) usage('--repeats: 1–50');
  const out = arg('--out') ?? `agentgw-safety-${new Date().toISOString().slice(0, 10)}.jsonl`;

  const cfg = loadConfig();
  if (!cfg.VERTEX_PROJECT_ID) usage('Липсва VERTEX_PROJECT_ID — оценката вика истинския Vertex.');
  const userModel = process.env.EVAL_USER_MODEL || cfg.MODEL_SONNET;
  const graderModel = process.env.EVAL_GRADER_MODEL || cfg.MODEL_OPUS;
  for (const m of [userModel, graderModel]) {
    if (!hasPrice(m)) usage(`Няма цена за ${m} в src/pricing.ts — бюджетът не може да се следи.`);
    if (/haiku/i.test(m)) usage('Haiku е изключен по решение на собственика.');
  }

  silenceLogs();
  const store = new MemoryStore();
  const profiles = loadProfiles(join(root, 'agents'));
  const app = createApp({
    cfg,
    store,
    model: new VertexChatModel(cfg),
    profiles,
    widgetJs: '',
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((r) => server.once('listening', () => r()));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const client = new AnthropicVertex({
    projectId: cfg.VERTEX_PROJECT_ID,
    region: cfg.VERTEX_REGION,
    timeout: cfg.UPSTREAM_TIMEOUT_MS,
    maxRetries: 2,
  });
  const budget = new Budget(usdToMicro(maxUsd));
  const simUser = vertexLlm(client, userModel, cfg);
  const grader = vertexLlm(client, graderModel, cfg);
  // Горна граница на повикване: вход по UTF-8 байтове + целия max_tokens изход (мисленето е вътре).
  const worst = (model: string, input: number, output: number) =>
    costMicroUsd(
      model,
      { inputTokens: input, outputTokens: output, cacheReadTokens: 0, cacheWriteTokens: 0 },
      cfg.PRICE_MULTIPLIER,
    );
  const llmCeiling = (model: string) => (req: LlmRequest) =>
    worst(model, inputTokensUpperBound(req), req.maxTokens);
  const ceiling: CostCeiling = {
    simUser: llmCeiling(userModel),
    grader: llmCeiling(graderModel),
    target: (agent, messages) => {
      const profile = profiles.get(agent);
      if (!profile) throw new Error(`няма публичен профил ${agent}`);
      const params = buildParams(profile, messages, cfg);
      return worst(params.model, inputTokensUpperBound(params), cfg.MAX_OUTPUT_TOKENS);
    },
  };

  // Нов ключ за всеки случай: собствена кофа за откази и точен разход от хранилището.
  let current = { plain: '', id: '' };
  const beforeCase = async (sc: Scenario) => {
    const plain = generateKey('SECRET');
    const rec = await store.createKey({
      kind: 'SECRET',
      site: 'оценка на безопасността',
      agents: [sc.agent],
      origins: [],
      capMicroUsd: usdToMicro(maxUsd),
      ratePerMin: 1000,
      hash: hashKey(plain, cfg.KEY_PEPPER),
      prefix: keyPrefix(plain),
    });
    current = { plain, id: rec.id };
  };
  const target: Target = (agent, messages) => {
    const { plain, id } = current;
    const costOf = async () => (await store.monthUsage(id, monthKey())).costMicroUsd;
    return httpTarget(baseUrl, plain, costOf)(agent, messages);
  };

  const hash = createHash('sha256')
    .update(JSON.stringify({ PREREGISTRATION, SCENARIOS, RUBRICS }))
    .digest('hex')
    .slice(0, 16);
  writeFileSync(out, '', { mode: 0o600 });
  // mode важи само при създаване — съществуващ файл запазва старите права.
  chmodSync(out, 0o600);
  let results: CaseResult[] = [];
  try {
    results = await runEval(
      SCENARIOS,
      repeats,
      { target, simUser, grader, budget, ceiling, beforeCase },
      (row) => {
        appendFileSync(out, `${JSON.stringify(row)}\n`);
        console.error(`${row.id}\t${row.status}\t${row.appropriate ?? ''}\t${row.note ?? ''}`);
      },
    );
  } finally {
    server.close();
  }

  const summary = summarize(results, PREREGISTRATION);
  console.log(
    JSON.stringify(
      {
        preregistration: { version: PREREGISTRATION.version, hash },
        config: {
          region: cfg.VERTEX_REGION,
          modelOpus: cfg.MODEL_OPUS,
          modelSonnet: cfg.MODEL_SONNET,
          effort: cfg.CHAT_EFFORT,
          maxOutputTokens: cfg.MAX_OUTPUT_TOKENS,
          simUser: userModel,
          grader: graderModel,
        },
        spentUsd: Number(budget.spent) / 1e6,
        calls: budget.calls,
        failedCalls: budget.failed,
        maxUsd,
        out,
        ...summary,
      },
      null,
      2,
    ),
  );
  return summary.verdict === 'pass' ? 0 : summary.verdict === 'fail' ? 1 : 2;
}

function kappa(reportPath?: string, labelsPath?: string): number {
  if (!reportPath || !labelsPath) usage('kappa иска два файла.');
  const read = (p: string) =>
    readFileSync(p, 'utf8')
      .split('\n')
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l) as { id: string; status?: string; appropriate?: boolean });
  const graded = new Map(
    read(reportPath)
      .filter((r) => r.status === 'graded' && typeof r.appropriate === 'boolean')
      .map((r) => [r.id, r.appropriate!]),
  );
  const a: boolean[] = [];
  const b: boolean[] = [];
  for (const l of read(labelsPath)) {
    if (typeof l.appropriate !== 'boolean' || !graded.has(l.id)) continue;
    a.push(graded.get(l.id)!);
    b.push(l.appropriate);
  }
  if (a.length === 0) usage('Няма общи оценени случаи между отчета и разметката.');
  const agree = a.filter((x, i) => x === b[i]).length / a.length;
  console.log(JSON.stringify({ n: a.length, agreement: agree, kappa: cohenKappa(a, b) }, null, 2));
  return 0;
}

const cmd = process.argv[2];
const code =
  cmd === 'run'
    ? await run()
    : cmd === 'kappa'
      ? kappa(process.argv[3], process.argv[4])
      : usage('Непозната команда.');
process.exit(code);
