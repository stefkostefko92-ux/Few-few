import { Prisma, type PrismaClient } from '@prisma/client';

/**
 * Суровите агрегати за KPI (§16.1) — само в SQL, само по `tenantId`, с параметри (никакъв низ от
 * заявката не влиза в текста на SQL). Тук няма идентификатори на хора: COUNT/percentile по
 * случаи, отговори и оценки; k-анонимността се прилага в `kpi.ts`.
 *
 * Кохорти (писаните дефиниции — същите в README и в обясненията на UI):
 * - метриките на СЛУЧАИТЕ — случаите, СЪЗДАДЕНИ в [from, to);
 * - метриките на AI ОТГОВОРИТЕ и оценките им — AI отговорите, СЪЗДАДЕНИ в [from, to);
 * - филтърът по модел е `Case.context.productModel` (моделът, който техникът е посочил).
 * Времената в базата са UTC (`timestamp` без зона) — границите се подават като UTC.
 */

export interface Scope {
  tenantId: string;
  from: Date;
  to: Date;
  model: string | null;
}

/** UTC момент като `timestamp` без зона — независимо от TimeZone на сесията в Postgres. */
const ts = (d: Date): Prisma.Sql =>
  Prisma.sql`(${d.toISOString()}::timestamptz AT TIME ZONE 'UTC')`;

/** Случаите на клиента в периода (+ модел) — общото WHERE за кохортата на случаите. */
function caseWhere(s: Scope, alias: string): Prisma.Sql {
  const a = Prisma.raw(alias);
  return Prisma.sql`${a}."tenantId" = ${s.tenantId}
    AND ${a}."createdAt" >= ${ts(s.from)} AND ${a}."createdAt" < ${ts(s.to)}
    AND (${s.model}::text IS NULL OR ${a}.context->>'productModel' = ${s.model}::text)`;
}

/**
 * Признаците на всеки случай от кохортата:
 * - escalated — има тикет (FR-09; тикетът не се трие, само заедно със случая);
 * - taken — поет от оператор (FR-19): `assignedToId` или събитие `case.assigned` в хронологията;
 * - aiRecommended — преди тикета (≤ момента му) поне един AI отговор е препоръчал ескалация.
 */
function casesCte(s: Scope): Prisma.Sql {
  return Prisma.sql`WITH c AS (
    SELECT k.id, k."createdAt", k."closedAt", k.status::text AS status, k.outcome::text AS outcome,
      t."createdAt" AS "ticketAt",
      (k."assignedToId" IS NOT NULL OR EXISTS (
        SELECT 1 FROM "CaseTimelineEvent" e WHERE e."caseId" = k.id AND e.type = 'case.assigned'
      )) AS taken,
      (t.id IS NOT NULL AND EXISTS (
        SELECT 1 FROM "CaseMessage" m
        WHERE m."caseId" = k.id AND m.kind = 'AI' AND m."createdAt" <= t."createdAt"
          AND m.payload->'escalation'->>'recommended' = 'true'
      )) AS "aiRecommended"
    FROM "Case" k
    LEFT JOIN "Ticket" t ON t."caseId" = k.id
    WHERE ${caseWhere(s, 'k')}
  )`;
}

export interface CaseRow {
  total: number;
  resolved: number;
  withOutcome: number;
  escalated: number;
  escalatedAi: number;
  taken: number;
  fcr: number;
  ttrN: number;
  ttrP50: number | null;
  ttrP90: number | null;
}

export async function caseAggregates(db: PrismaClient, s: Scope): Promise<CaseRow> {
  const resolved = Prisma.sql`status = 'RESOLVED' AND "closedAt" IS NOT NULL`;
  const secs = Prisma.sql`EXTRACT(EPOCH FROM ("closedAt" - "createdAt"))`;
  const rows = await db.$queryRaw<CaseRow[]>`${casesCte(s)}
    SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE ${resolved})::int AS resolved,
      count(*) FILTER (WHERE outcome IS NOT NULL)::int AS "withOutcome",
      count(*) FILTER (WHERE "ticketAt" IS NOT NULL)::int AS escalated,
      count(*) FILTER (WHERE "aiRecommended")::int AS "escalatedAi",
      count(*) FILTER (WHERE taken)::int AS taken,
      count(*) FILTER (WHERE ${resolved} AND "ticketAt" IS NULL AND NOT taken)::int AS fcr,
      count(*) FILTER (WHERE ${resolved})::int AS "ttrN",
      (percentile_cont(0.5) WITHIN GROUP (ORDER BY ${secs}) FILTER (WHERE ${resolved}))::float8 AS "ttrP50",
      (percentile_cont(0.9) WITHIN GROUP (ORDER BY ${secs}) FILTER (WHERE ${resolved}))::float8 AS "ttrP90"
    FROM c`;
  const r = rows[0];
  if (!r) throw new Error('KPI: празен резултат от агрегата');
  return r;
}

export interface SeriesRow {
  bucket: Date;
  created: number;
  resolved: number;
  escalated: number;
}

/** Кофи по ден/седмица (UTC; седмицата е от понеделник) — празните кофи са с 0, не липсват. */
export async function caseSeries(
  db: PrismaClient,
  s: Scope,
  unit: 'day' | 'week',
): Promise<SeriesRow[]> {
  return db.$queryRaw<SeriesRow[]>`${casesCte(s)},
    b AS (
      SELECT generate_series(
        date_trunc(${unit}, ${ts(s.from)}),
        ${ts(s.to)} - interval '1 millisecond',
        (${`1 ${unit}`})::interval
      ) AS bucket
    )
    SELECT b.bucket,
      count(c.id)::int AS created,
      count(c.id) FILTER (WHERE c.status = 'RESOLVED' AND c."closedAt" IS NOT NULL)::int AS resolved,
      count(c.id) FILTER (WHERE c."ticketAt" IS NOT NULL)::int AS escalated
    FROM b LEFT JOIN c ON date_trunc(${unit}, c."createdAt") = b.bucket
    GROUP BY b.bucket ORDER BY b.bucket`;
}

/** AI отговорите в периода (кохортата на отговорите): условието след FROM … JOIN "Case" k. */
function answersWhere(s: Scope): Prisma.Sql {
  return Prisma.sql`m.kind = 'AI' AND k."tenantId" = ${s.tenantId}
    AND m."createdAt" >= ${ts(s.from)} AND m."createdAt" < ${ts(s.to)}
    AND (${s.model}::text IS NULL OR k.context->>'productModel' = ${s.model}::text)`;
}

function answersFrom(s: Scope): Prisma.Sql {
  return Prisma.sql`FROM "CaseMessage" m JOIN "Case" k ON k.id = m."caseId" WHERE ${answersWhere(s)}`;
}

export interface AnswerRow {
  total: number;
  strong: number;
  high: number;
  weak: number;
  conflict: number;
  none: number;
  stepsRemoved: number;
  blocked: number;
  recommendedEscalation: number;
  withFeedback: number;
}

export async function answerAggregates(db: PrismaClient, s: Scope): Promise<AnswerRow> {
  const level = (l: string) =>
    Prisma.sql`count(*) FILTER (WHERE m.payload->'gate'->>'evidenceLevel' = ${l})::int`;
  const rows = await db.$queryRaw<AnswerRow[]>`SELECT
      count(*)::int AS total,
      ${level('strong')} AS strong,
      ${level('high')} AS high,
      ${level('weak')} AS weak,
      ${level('conflict')} AS conflict,
      ${level('none')} AS none,
      count(*) FILTER (WHERE jsonb_typeof(m.payload->'gate'->'removedSteps') = 'array'
        AND jsonb_array_length(m.payload->'gate'->'removedSteps') > 0)::int AS "stepsRemoved",
      count(*) FILTER (WHERE m.payload->'safety'->>'level' = 'blocked')::int AS blocked,
      count(*) FILTER (WHERE m.payload->'escalation'->>'recommended' = 'true')::int
        AS "recommendedEscalation",
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM "Feedback" f WHERE f."messageId" = m.id))::int
        AS "withFeedback"
    ${answersFrom(s)}`;
  const r = rows[0];
  if (!r) throw new Error('KPI: празен резултат от отговорите');
  return r;
}

/** Колко отговора имат махната стъпка по всяка причина на Gate (един отговор — веднъж на причина). */
export async function removalReasons(
  db: PrismaClient,
  s: Scope,
): Promise<Array<{ reason: string; answers: number }>> {
  return db.$queryRaw<Array<{ reason: string; answers: number }>>`SELECT
      r->>'reason' AS reason, count(DISTINCT m.id)::int AS answers
    FROM "CaseMessage" m JOIN "Case" k ON k.id = m."caseId"
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(m.payload->'gate'->'removedSteps') = 'array'
        THEN m.payload->'gate'->'removedSteps' ELSE '[]'::jsonb END
    ) AS r
    WHERE ${answersWhere(s)}
    GROUP BY 1`;
}

/** Оценките (FR-10) върху AI отговорите от периода — по вид. */
export async function feedbackCounts(
  db: PrismaClient,
  s: Scope,
): Promise<Array<{ rating: string; n: number }>> {
  return db.$queryRaw<Array<{ rating: string; n: number }>>`SELECT
      f.rating::text AS rating, count(*)::int AS n
    FROM "Feedback" f JOIN "CaseMessage" m ON m.id = f."messageId" JOIN "Case" k ON k.id = m."caseId"
    WHERE ${answersWhere(s)}
    GROUP BY 1`;
}
