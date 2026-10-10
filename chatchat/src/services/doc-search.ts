import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { audiencesFor } from '../auth/rbac.js';
import type { Principal } from '../auth/sessions.js';
import { normalizeQuery } from '../domain/normalize.js';
import { applicabilityOf, optionsMatch } from '../retrieval/applicability.js';
import type { BoardOptions, CaseVersion, SearchScope } from '../retrieval/types.js';
import { toOrTsQuery } from '../store/knowledge.js';
import {
  rulesOf,
  searchableDocumentSql,
  searchRulesWhere,
  type DocumentSearchFilter,
} from '../store/scope.js';
import { fail, ok, type Result } from './collab/result.js';
import { deviceOptions, deviceVisible } from './devices.js';

/**
 * Самостоятелното търсене на документи от техника (FR-03, §12.1) — извън чата, със СЪЩИТЕ филтри
 * като AI (`store/scope.ts`: клиент, аудиторията на ролята, PUBLISHED, табло) + валидност към
 * момента; по продукт (модел), табло (сериен номер — видимо за човека), тип, език и текст
 * (пълнотекстово в парчетата + код/заглавие). С табло: документ, чиито правила искат други опции
 * (FR-01), не се връща; HW/FW несъвместимостта се показва (`applicable: false`), не се крие.
 * Резултатът сочи страница — отваря се във визуализатора (`services/document-access.ts`).
 */

export const DOC_TYPES = [
  'MANUAL',
  'SCHEMATIC',
  'ERROR_LIST',
  'FAQ',
  'BULLETIN',
  'PROCEDURE',
  'SOLVED_CASE',
] as const;

export const DocSearchQuery = z.object({
  q: z.string().trim().max(200).default(''),
  model: z.string().trim().min(1).max(80).optional(),
  serial: z.string().trim().min(1).max(80).optional(),
  type: z.enum(DOC_TYPES).optional(),
  language: z
    .string()
    .regex(/^[a-z]{2}$/)
    .optional(),
  hw: z.string().trim().min(1).max(20).optional(),
  fw: z.string().trim().min(1).max(20).optional(),
});
export type DocSearchInput = z.infer<typeof DocSearchQuery>;

const MAX_RESULTS = 50;
const SNIPPET = 240;

/** „%“ и „_“ от човека са буквални в ILIKE. */
export const likePattern = (q: string): string => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export interface DocSearchHit {
  documentId: string;
  code: string;
  title: string;
  type: string;
  language: string;
  revision: string;
  safetyRelevant: boolean;
  /** Страницата за визуализатора: най-добре съвпадналата или първата. */
  page: number;
  /** Откъс от съвпадналото парче (текстът на документа — човекът го вижда и във визуализатора). */
  snippet: string | null;
  models: string[];
  /** Документът е вързан за избраното табло (уникалната му схема). */
  boardSpecific: boolean;
  /** Ограниченията по опции на правилата (FR-01), ако има. */
  options: BoardOptions[];
  /** Приложим за версията (табло или модел+HW/FW); null — версията не е известна. */
  applicable: boolean | null;
}

export async function searchDocuments(
  db: PrismaClient,
  p: Principal,
  input: DocSearchInput,
): Promise<Result<{ results: DocSearchHit[]; board: { serial: string; model: string } | null }>> {
  const now = new Date();
  let board = null;
  if (input.serial) {
    const device = await db.device.findUnique({
      where: { tenantId_serial: { tenantId: p.user.tenantId, serial: input.serial } },
      include: { revision: { include: { product: true } } },
    });
    if (!device || !deviceVisible(p.user, device)) return fail(404, 'device_not_found');
    board = device;
  }
  const productModel = board ? board.revision.product.model : (input.model ?? null);
  const version: CaseVersion | null = board
    ? {
        hwRevision: board.revision.hwRevision,
        firmware: board.firmware,
        deviceId: board.id,
        options: deviceOptions(board),
      }
    : productModel && (input.hw || input.fw)
      ? { hwRevision: input.hw ?? null, firmware: input.fw ?? null, deviceId: null }
      : null;
  const scope: SearchScope = {
    tenantId: p.user.tenantId,
    audiences: audiencesFor(p.user.role),
    deviceId: board?.id ?? null,
  };
  const boardView = board ? { serial: board.serial, model: board.revision.product.model } : null;
  if (scope.audiences.length === 0) return ok({ results: [], board: boardView });

  const filter: DocumentSearchFilter = {
    scope,
    productModel,
    type: input.type ?? null,
    language: input.language ?? null,
    now,
  };
  const where = searchableDocumentSql(filter);
  const q = input.q;
  const tsQuery = q ? toOrTsQuery(normalizeQuery(q).text) : null;

  const [byMeta, byText] = await Promise.all([
    db.$queryRaw<Array<{ id: string }>>`
      SELECT d.id FROM "Document" d
      WHERE ${where}
        AND (${q === ''} OR d.code ILIKE ${likePattern(q)} OR d.title ILIKE ${likePattern(q)})
      ORDER BY d.code ASC, d.revision ASC
      LIMIT ${MAX_RESULTS}`,
    tsQuery === null
      ? Promise.resolve([])
      : db.$queryRaw<Array<{ id: string; page: number; snippet: string; rank: number }>>`
          SELECT c."documentId" AS id, c.page, left(c.text, ${SNIPPET}::int) AS snippet,
                 ts_rank_cd(c.tsv, tq)::float8 AS rank
          FROM "DocumentChunk" c
          JOIN "Document" d ON d.id = c."documentId",
               to_tsquery('simple', ${tsQuery}) tq
          WHERE c.tsv @@ tq AND ${where}
          ORDER BY rank DESC
          LIMIT 200`,
  ]);

  // Код/заглавие първо, после по най-добрия пълнотекстов ранг на документа.
  const best = new Map<string, { page: number; snippet: string }>();
  for (const r of byText) if (!best.has(r.id)) best.set(r.id, { page: r.page, snippet: r.snippet });
  const ids = [...new Set([...byMeta.map((r) => r.id), ...best.keys()])].slice(0, MAX_RESULTS);
  if (ids.length === 0) return ok({ results: [], board: boardView });

  const [docs, firstPages] = await Promise.all([
    db.document.findMany({
      where: { id: { in: ids }, tenantId: scope.tenantId },
      include: {
        applicability: {
          where: searchRulesWhere(filter),
          include: { product: { select: { model: true } } },
        },
      },
    }),
    db.documentChunk.groupBy({
      by: ['documentId'],
      where: { documentId: { in: ids } },
      _min: { page: true },
    }),
  ]);
  const first = new Map(firstPages.map((g) => [g.documentId, g._min.page ?? 1]));
  const byId = new Map(docs.map((d) => [d.id, d]));
  const results: DocSearchHit[] = [];
  for (const id of ids) {
    const d = byId.get(id);
    if (!d) continue;
    const rules = rulesOf(d);
    // С табло: само документите, чиито правила допускат опциите му (FR-01).
    if (version?.options && !rules.some((r) => optionsMatch(r.options, version.options))) continue;
    const hit = best.get(id);
    results.push({
      documentId: d.id,
      code: d.code,
      title: d.title,
      type: d.type,
      language: d.language,
      revision: d.revision,
      safetyRelevant: d.safetyRelevant,
      page: hit?.page ?? first.get(id) ?? 1,
      snippet: hit?.snippet ?? null,
      models: [...new Set(d.applicability.map((a) => a.product.model))].sort(),
      boardSpecific: d.applicability.some((a) => a.deviceId !== null),
      options: rules
        .map((r) => r.options)
        .filter(
          (o): o is BoardOptions => o !== null && o !== undefined && Object.keys(o).length > 0,
        ),
      applicable:
        version && productModel ? applicabilityOf({ ...d, rules }, version, now).applicable : null,
    });
  }
  return ok({ results, board: boardView });
}
