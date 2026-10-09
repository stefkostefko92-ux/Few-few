import { PrismaClient } from '@prisma/client';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { embeddingModelFrom, type EmbeddingModel } from '../src/ai/embeddings.js';
import { VertexDiagnosisModel, type DiagnosisModel } from '../src/ai/model.js';
import { diagnose } from '../src/ai/orchestrator.js';
import { PROMPT_VERSION } from '../src/ai/prompt.js';
import { aiEnabled, EU_REGION } from '../src/config.js';
import { retrieve } from '../src/retrieval/retrieve.js';
import type { Audience, EvidenceItem } from '../src/retrieval/types.js';
import { GATE_VERSION } from '../src/safety/gate.js';
import { embedPending } from '../src/store/embeddings.js';
import { PrismaKnowledgeStore } from '../src/store/knowledge.js';
import { knowledgeSnapshotId } from '../src/store/snapshot.js';
import { HashEmbeddingModel } from './lib/fake-embeddings.js';
import { FakeDiagnosisModel } from './lib/fake-model.js';
import { assertTestDatabase, documentKey, loadKnowledge, resetDatabase } from './lib/load.js';
import { aggregate, scoreCase, type CaseScore } from './lib/metrics.js';
import { renderMarkdown, type Report } from './lib/report.js';
import { EvalSet, type EvalCaseT } from './lib/schema.js';

/**
 * Оценъчният набор (§16.1–16.3, AC-09):
 *   npm run eval -- --set evals/sample.json [--db <url>] [--k 5] [--fake] [--out evals/reports]
 * Зарежда фикстурната база знания в ТЕСТОВА база (името трябва да съдържа „test“ — базата се
 * изчиства), пуска истинския `diagnose` (Vertex, ако VERTEX_PROJECT_ID е зададен и няма --fake;
 * иначе детерминистичен фалшив модел + фалшиви embeddings) и пише отчет JSON + Markdown.
 * Изход 1 при поне едно нарушение на безопасността (цел 0) или грешка.
 */

const AUDIENCES: Record<EvalCaseT['audience'], Audience[]> = {
  PORTAL: ['PORTAL'],
  INTERNAL: ['PORTAL', 'INTERNAL'],
  ENGINEERING: ['PORTAL', 'INTERNAL', 'ENGINEERING'],
};

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function keyOfItem(item: EvidenceItem, errorKeys: Map<string, string>): string {
  if (item.errorId) return errorKeys.get(item.errorId) ?? `error:${item.errorId}`;
  return documentKey(item.documentCode, item.revision);
}

function byTag(scores: CaseScore[]): Report['byTag'] {
  const tags = [...new Set(scores.flatMap((s) => s.tags))].sort();
  return Object.fromEntries(
    tags.map((t) => [t, aggregate(scores.filter((s) => s.tags.includes(t)))]),
  );
}

async function main(): Promise<number> {
  const setFile = arg('set');
  if (!setFile) throw new Error('Липсва --set evals/<файл>.json');
  const url = arg('db') ?? process.env.DATABASE_URL;
  if (!url) throw new Error('Липсва --db или DATABASE_URL');
  assertTestDatabase(url);
  const k = Number(arg('k') ?? 5);
  const here = dirname(fileURLToPath(import.meta.url));
  const outDir = resolve(arg('out') ?? join(here, 'reports'));
  const set = EvalSet.parse(JSON.parse(await readFile(setFile, 'utf8')));

  const env = {
    VERTEX_PROJECT_ID: process.env.VERTEX_PROJECT_ID ?? '',
    VERTEX_REGION: process.env.VERTEX_REGION ?? 'eu',
    EMBEDDING_MODEL: (process.env.EMBEDDING_MODEL ?? 'gemini-embedding-001') as
      'gemini-embedding-001' | 'off',
    EMBEDDING_TIMEOUT_MS: Number(process.env.EMBEDDING_TIMEOUT_MS ?? 15000),
    AI_MODEL: process.env.AI_MODEL ?? 'claude-opus-5',
    AI_TIMEOUT_MS: Number(process.env.AI_TIMEOUT_MS ?? 60000),
  };
  const real = aiEnabled(env) && !process.argv.includes('--fake');
  if (real && !EU_REGION.test(env.VERTEX_REGION)) throw new Error('VERTEX_REGION не е ЕС регион');
  const embedder: EmbeddingModel | null = real ? embeddingModelFrom(env) : new HashEmbeddingModel();
  const vertex: DiagnosisModel | null = real ? new VertexDiagnosisModel(env) : null;

  const db = new PrismaClient({ datasources: { db: { url } } });
  const started = Date.now();
  try {
    await resetDatabase(db);
    const loaded = await loadKnowledge(db, set);
    if (embedder) await embedPending(db, embedder, { tenantId: loaded.tenantA });
    const snapshot = await knowledgeSnapshotId(db, loaded.tenantA);
    const store = new PrismaKnowledgeStore(db, {
      embedder,
      queryTimeoutMs: env.EMBEDDING_TIMEOUT_MS,
      onError: (err) => console.error(`семантичното търсене е пропуснато: ${(err as Error).name}`),
    });

    const scores: CaseScore[] = [];
    for (const c of set.cases) {
      const scope = { tenantId: loaded.tenantA, audiences: AUDIENCES[c.audience] };
      const request = { scope, context: c.context, query: c.question };
      const retrieved = await retrieve(store, request);
      const out = await diagnose(
        {
          store,
          model: vertex ?? new FakeDiagnosisModel(c),
          snapshotId: async () => snapshot,
          config: {
            AI_MODEL: env.AI_MODEL,
            AI_EFFORT: 'medium',
            AI_MAX_OUTPUT_TOKENS: 8000,
            AI_MAX_TOOL_ROUNDS: 4,
            AI_TIMEOUT_MS: env.AI_TIMEOUT_MS,
          },
        },
        { scope, context: c.context, question: c.question, history: [], locale: c.locale },
        AbortSignal.timeout(env.AI_TIMEOUT_MS + 5000),
      );
      const byRef = new Map(out.evidence.map((e) => [e.ref, e]));
      const cited = out.answer.evidence
        .map((cit) => byRef.get(cit.ref))
        .filter((e): e is EvidenceItem => e !== undefined)
        .map((e) => keyOfItem(e, loaded.errorKeys));
      scores.push(
        scoreCase({
          case: c,
          retrievedKeys: retrieved.items.slice(0, k).map((i) => keyOfItem(i, loaded.errorKeys)),
          citedKeys: cited,
          answer: out.answer,
          modelCalled: out.modelCalled,
        }),
      );
    }

    const report: Report = {
      set: { name: set.name, version: set.version, fixture: set.fixture, file: basename(setFile) },
      promptVersion: `${PROMPT_VERSION}+${GATE_VERSION}`,
      knowledgeSnapshotId: snapshot,
      diagnosisModel: vertex ? env.AI_MODEL : 'fake-deterministic (evals/lib/fake-model.ts)',
      embeddingModel: embedder?.id ?? null,
      k,
      startedAt: new Date(started).toISOString(),
      durationMs: Date.now() - started,
      metrics: aggregate(scores),
      byTag: byTag(scores),
      cases: scores,
    };
    await mkdir(outDir, { recursive: true });
    const stamp = report.startedAt.replace(/[:.]/g, '-');
    const base = join(outDir, `${set.name}-${stamp}`);
    await writeFile(`${base}.json`, `${JSON.stringify(report, null, 2)}\n`);
    await writeFile(`${base}.md`, renderMarkdown(report));
    console.log(renderMarkdown(report));
    console.log(`Отчет: ${base}.json · ${base}.md`);
    const violations = report.metrics.safetyViolationRate.num;
    if (violations > 0) console.error(`НАРУШЕНИЯ НА БЕЗОПАСНОСТТА: ${violations} — изход 1`);
    return violations > 0 ? 1 : 0;
  } finally {
    await db.$disconnect();
  }
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (err: unknown) => {
    console.error(`eval: ${(err as Error).message}`);
    process.exitCode = 1;
  },
);
