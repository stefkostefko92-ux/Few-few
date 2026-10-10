import type { Tool } from '@anthropic-ai/sdk/resources/messages/messages';
import { z } from 'zod';
import { canonicalIdentifier, normalizeQuery } from '../domain/normalize.js';
import { ModelDiagnosisSchema } from '../domain/response.js';
import type { KnowledgeStore, SearchScope } from '../retrieval/types.js';
import type { EvidencePack } from './evidence.js';
import { renderItems } from './prompt.js';

/**
 * Инструментите на модела (§14.2) — само за ЧЕТЕНЕ (least privilege). Тикет/изход остават REST
 * действия на човека. Обхватът (tenant, аудитории) и продуктовият модел идват от сесията и
 * контекста, НИКОГА от входа на модела: схемите са строги (`additionalProperties: false` + zod
 * strictObject), така че опит да се подаде tenant/модел е грешка, не тихо игнориране.
 */

export const SUBMIT_TOOL = 'submit_diagnosis';
const SEARCH_LIMIT = 5;

const LookupErrorInput = z.strictObject({ code: z.string().trim().min(1).max(20) });
const SearchDocumentsInput = z.strictObject({ query: z.string().trim().min(2).max(300) });
const GetPageInput = z.strictObject({
  document_id: z.string().trim().min(1).max(64),
  page: z.number().int().min(1).max(10000),
});

/** JSON схемата на submit_diagnosis — изведена от същата zod схема, с която се валидира. */
function submitSchema(): Tool.InputSchema {
  const { $schema: _schema, ...schema } = z.toJSONSchema(ModelDiagnosisSchema, {
    io: 'input',
  }) as Record<string, unknown>;
  return schema as Tool.InputSchema;
}

/**
 * Редът и съдържанието са постоянни (кешът): промяна тук = нов PROMPT_VERSION.
 * cache_control на последния инструмент кешира всички дефиниции.
 */
export const TOOLS: Tool[] = [
  {
    name: 'lookup_error',
    description:
      'Looks up one fault/error code in the structured error database for the board model of this case (the model and customer are fixed by the case and cannot be changed). Returns every record for that exact code across hardware and firmware versions as new evidence items, each with its reference, its applicability to this board and its documented checks. Matching is exact: E37 is not E38. Use it when the technician mentions a code that is not in the evidence pack yet. Returns a message when no record exists.',
    input_schema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'The error code as displayed, e.g. "E37".' },
      },
      required: ['code'],
      additionalProperties: false,
    },
  },
  {
    name: 'search_documents',
    description:
      'Full-text search in the published documentation (manuals, bulletins, procedures) for the board model of this case. Returns up to 5 passages as new evidence items with references, applicability and page. Use precise technical terms (component, terminal, symptom, phase). Do not use it for error codes; use lookup_error instead. Only reads; it cannot reach other customers or other products.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search terms, 2-300 characters.' },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_document_page',
    description:
      'Returns the passages of one page of a document that is ALREADY in the evidence pack (take document_id from an item header), for example to read the steps before or after a cited passage. Documents that are not in the evidence pack are refused. Passages come back as evidence items with references.',
    input_schema: {
      type: 'object',
      properties: {
        document_id: { type: 'string', description: 'documentId from an evidence item header.' },
        page: { type: 'integer', description: 'Page number (1-based).' },
      },
      required: ['document_id', 'page'],
      additionalProperties: false,
    },
  },
  {
    name: SUBMIT_TOOL,
    description:
      'Submits the final structured diagnosis. Call it exactly once, alone in its message, as the last step. Reference only evidence items (E1, E2, ...) in causes, checks and evidenceUsed; photos (P1, ...) appear only in photoObservations, one entry per photo. Every free-text field in the requested answer language. The input is validated; if invalid you get the errors back once to fix them.',
    input_schema: submitSchema(),
    cache_control: { type: 'ephemeral' },
  },
];

export interface ToolContext {
  store: KnowledgeStore;
  scope: SearchScope;
  productModel: string;
  pack: EvidencePack;
  token: string;
}

export interface ToolOutcome {
  content: string;
  isError: boolean;
  /** Колко записа е върнал инструментът (нови + вече в пакета) — за одита (FR-12). */
  results: number;
}

function zodMessage(error: z.ZodError): string {
  return error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
}

function describeAdd(
  ctx: ToolContext,
  result: ReturnType<EvidencePack['add']>,
  empty: string,
): ToolOutcome {
  const results = result.added.length + result.existing.length;
  if (results === 0) return { content: empty, isError: false, results: 0 };
  const parts: string[] = [];
  if (result.added.length > 0) {
    parts.push(`New evidence items:\n${renderItems(result.added, ctx.token)}`);
  }
  if (result.existing.length > 0) {
    parts.push(`Already in the pack: ${result.existing.map((i) => i.ref).join(', ')}`);
  }
  if (result.truncated > 0) {
    parts.push(`${result.truncated} more result(s) omitted (evidence pack limit).`);
  }
  return { content: parts.join('\n\n'), isError: false, results };
}

/** Грешка към модела (невалиден вход, отказ) — без резултати. */
const refused = (content: string): ToolOutcome => ({ content, isError: true, results: 0 });

/** Изпълнява един инструмент за четене. Грешка в входа → is_error към модела, не изключение. */
export async function runReadTool(
  name: string,
  input: unknown,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  switch (name) {
    case 'lookup_error': {
      const parsed = LookupErrorInput.safeParse(input);
      if (!parsed.success) return refused(zodMessage(parsed.error));
      const code = canonicalIdentifier(parsed.data.code);
      if (!/^[A-Z0-9]{1,20}$/.test(code)) {
        return refused(`Invalid code "${code}".`);
      }
      const raws = await ctx.store.findErrors(ctx.scope, ctx.productModel, [code]);
      return describeAdd(
        ctx,
        ctx.pack.add(raws),
        `No record for code ${code} for this board model. Do not guess its meaning; list it in missingData.`,
      );
    }
    case 'search_documents': {
      const parsed = SearchDocumentsInput.safeParse(input);
      if (!parsed.success) return refused(zodMessage(parsed.error));
      const text = normalizeQuery(parsed.data.query).text;
      const raws = await ctx.store.searchChunks(ctx.scope, ctx.productModel, text, SEARCH_LIMIT);
      return describeAdd(ctx, ctx.pack.add(raws), 'No passages found for this query.');
    }
    case 'get_document_page': {
      const parsed = GetPageInput.safeParse(input);
      if (!parsed.success) return refused(zodMessage(parsed.error));
      const { document_id: documentId, page } = parsed.data;
      if (!ctx.pack.hasDocument(documentId)) {
        return refused('Refused: only documents already in the evidence pack can be opened.');
      }
      // productModel ВИНАГИ — иначе съвместимостта би се смятала по правила за друг модел.
      const raws = await ctx.store.getPage(ctx.scope, documentId, page, ctx.productModel);
      const own = raws.filter((r) => r.documentId === documentId && r.page === page);
      return describeAdd(ctx, ctx.pack.add(own), `Page ${page} has no passages.`);
    }
    default:
      return refused(`Unknown tool "${name}".`);
  }
}

export function validateSubmission(
  input: unknown,
): { ok: true; data: z.infer<typeof ModelDiagnosisSchema> } | { ok: false; error: string } {
  const parsed = ModelDiagnosisSchema.safeParse(input);
  return parsed.success
    ? { ok: true, data: parsed.data }
    : { ok: false, error: zodMessage(parsed.error) };
}
