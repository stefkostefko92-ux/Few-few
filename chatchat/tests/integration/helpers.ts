import type {
  Message,
  MessageCreateParamsNonStreaming,
} from '@anthropic-ai/sdk/resources/messages/messages';
import { PrismaClient, type AccountKind, type Role, type User } from '@prisma/client';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { DiagnosisModel } from '../../src/ai/model.js';
import { diagnose } from '../../src/ai/orchestrator.js';
import { createApp, type Diagnoser } from '../../src/app.js';
import { hashPassword } from '../../src/auth/password.js';
import { mfaRequired } from '../../src/auth/rbac.js';
import { createSession, SESSION_COOKIE, type SessionDeps } from '../../src/auth/sessions.js';
import { totpCode } from '../../src/auth/totp.js';
import { encryptSecret } from '../../src/crypto.js';
import type { ModelDiagnosis } from '../../src/domain/response.js';
import { createLogger } from '../../src/logger.js';
import { PrismaKnowledgeStore } from '../../src/store/knowledge.js';
import { knowledgeSnapshotId } from '../../src/store/snapshot.js';

/**
 * Помощници за интеграционните тестове: жива PostgreSQL (само база с „test“ в името — TRUNCATE
 * е необратим), приложението на ефимерен порт, истинският `diagnose` с фалшив модел, HTTP клиент
 * със сесия + CSRF и фабрики за потребители. Данните на знанието се създават през API-то.
 */

export const ORIGIN = 'https://chatchat.test';
export const PEPPER = 'test-pepper-test-pepper-test-pepper-0123456789';
export const PASSWORD = 'correct horse battery staple';
/** Ключът за TOTP тайните в тестовете (32 байта) и общата тайна на фикстурите на персонала. */
export const MFA_KEY = Buffer.alloc(32, 7);
export const TOTP_SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';

/** Текущият TOTP код (или този след `steps` стъпки по 30 s — за втори код в същия прозорец). */
export function totpNow(secret = TOTP_SECRET, steps = 0): string {
  return totpCode(secret, Math.floor(Date.now() / 1000) + steps * 30);
}

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error(
    'Интеграционните тестове искат DATABASE_URL (напр. postgresql://chatchat:chatchat@127.0.0.1:5432/chatchat_test).',
  );
}
const dbName = decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
if (!/test/i.test(dbName)) {
  throw new Error(`Отказ: базата „${dbName}“ не е тестова (името трябва да съдържа „test“).`);
}

export const db = new PrismaClient({ datasources: { db: { url } } });

/** Празна база между тестовете. Само таблици от схемата; идентификаторите се нулират. */
export async function resetDb(): Promise<void> {
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "Tenant", "AuditEvent", "KnowledgeSnapshot" RESTART IDENTITY CASCADE',
  );
}

// ── Фалшив модел ─────────────────────────────────────────────────────────────────────────────

/** Запис от доказателствения пакет, както го вижда моделът (разчетен от съобщението на случая). */
export interface PackItem {
  ref: string;
  kind: string;
  applicable: boolean;
  safetyRelevant: boolean;
  documentId: string;
  documentCode: string;
  documentType: string;
  revision: string;
  errorCode: string | null;
  text: string;
}

export type Plan = (pack: PackItem[], call: { question: string }) => Partial<ModelDiagnosis>;

const ITEM = /<<<ITEM (\w+) (\{[^\n]*\})>>>\nTEXT:\n([\s\S]*?)\n<<<END \1>>>/g;

export function parsePack(text: string): PackItem[] {
  const items: PackItem[] = [];
  for (const m of text.matchAll(ITEM)) {
    const header = JSON.parse(m[2] ?? '{}') as Record<string, unknown>;
    const body = (m[3] ?? '').split('\nDOCUMENTED CHECKS')[0] ?? '';
    items.push({
      ref: String(header.ref),
      kind: String(header.kind),
      applicable: header.applicable === true,
      safetyRelevant: header.safetyRelevant === true,
      documentId: String(header.documentId),
      documentCode: String(header.documentCode),
      documentType: String(header.documentType),
      revision: String(header.revision),
      errorCode: typeof header.errorCode === 'string' ? header.errorCode : null,
      text: body,
    });
  }
  return items;
}

export const quoteOf = (item: PackItem): string => item.text.trim().slice(0, 200);

/** Дословен откъс от пакета (за evidenceUsed). */
export const cite = (item: PackItem) => ({ ref: item.ref, quote: quoteOf(item) });

export function baseDiagnosis(over: Partial<ModelDiagnosis> = {}): ModelDiagnosis {
  return {
    status: 'identified',
    confidence: 'high',
    confidenceReason: 'Documentato.',
    summary: 'Diagnosi di prova.',
    causes: [],
    checks: [],
    decisionPoints: [],
    evidenceUsed: [],
    conflicts: [],
    safetyNotes: [],
    missingData: [],
    escalation: { recommended: false, reason: '' },
    ...over,
  };
}

/** По подразбиране: прекалено уверен модел, който цитира първия съвместим източник. */
const citeFirst: Plan = (pack) => {
  const first = pack.find((p) => p.applicable);
  return first
    ? {
        causes: [{ text: 'Causa documentata', evidenceRefs: [first.ref] }],
        evidenceUsed: [cite(first)],
      }
    : {};
};

export class ScriptedModel implements DiagnosisModel {
  plan: Plan = citeFirst;
  readonly packs: PackItem[][] = [];
  readonly questions: string[] = [];
  /** Суровото съобщение на случая, както го получава моделът. */
  readonly texts: string[] = [];

  get calls(): number {
    return this.packs.length;
  }

  reset(): void {
    this.plan = citeFirst;
    this.packs.length = 0;
    this.questions.length = 0;
    this.texts.length = 0;
  }

  async create(params: MessageCreateParamsNonStreaming): Promise<Message> {
    const last = params.messages[params.messages.length - 1];
    const blocks = Array.isArray(last?.content) ? last.content : [];
    const text = blocks.map((b) => ('text' in b ? b.text : '')).join('\n');
    const pack = parsePack(text);
    const question = /"kind":"question"\}>>>\n([\s\S]*?)\n<<<END/.exec(text)?.[1] ?? '';
    this.packs.push(pack);
    this.questions.push(question);
    this.texts.push(text);
    const input = baseDiagnosis(this.plan(pack, { question }));
    return {
      id: `msg_${this.packs.length}`,
      type: 'message',
      role: 'assistant',
      model: params.model,
      content: [
        { type: 'tool_use', id: `toolu_${this.packs.length}`, name: 'submit_diagnosis', input },
      ],
      stop_reason: 'tool_use',
      stop_sequence: null,
      usage: {
        input_tokens: 10,
        output_tokens: 5,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
    } as unknown as Message;
  }
}

// ── Приложението ─────────────────────────────────────────────────────────────────────────────

export interface Harness {
  base: string;
  model: ScriptedModel;
  sessions: SessionDeps;
  close(): Promise<void>;
}

export async function startApp(
  opts: { diagnose?: 'real' | 'none' | Diagnoser } = {},
): Promise<Harness> {
  const model = new ScriptedModel();
  const sessions: SessionDeps = { db, pepper: PEPPER, ttlHours: 12, secureCookies: false };
  const store = new PrismaKnowledgeStore(db);
  const real: Diagnoser = (input, signal) =>
    diagnose(
      {
        store,
        model,
        snapshotId: () => knowledgeSnapshotId(db, input.scope.tenantId),
        config: {
          AI_MODEL: 'claude-test',
          AI_EFFORT: 'medium',
          AI_MAX_OUTPUT_TOKENS: 4000,
          AI_MAX_TOOL_ROUNDS: 2,
          AI_TIMEOUT_MS: 20000,
        },
      },
      input,
      signal,
    );
  const choice = opts.diagnose ?? 'real';
  const app = createApp({
    db,
    logger: createLogger(process.env.TEST_LOG_LEVEL ?? 'silent'),
    publicOrigin: ORIGIN,
    privacyPolicyUrl: 'https://chatchat.test/privacy',
    trustProxy: 0,
    sessions,
    mfaKey: MFA_KEY,
    diagnose: choice === 'real' ? real : choice === 'none' ? null : choice,
  });
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const { port } = server.address() as AddressInfo;
  return {
    base: `http://127.0.0.1:${port}`,
    model,
    sessions,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

// ── HTTP клиент ──────────────────────────────────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface Res<T = any> {
  status: number;
  body: T;
  headers: Headers;
}

export interface ReqOpts {
  /** undefined → верният токен на сесията; null → без хедър; низ → този токен. */
  csrf?: string | null;
  /** undefined → без Origin (като curl); низ → този Origin. */
  origin?: string;
  /** false → без бисквитка на сесията. */
  cookie?: boolean;
}

export class Client {
  constructor(
    readonly base: string,
    readonly cookie: string | null = null,
    readonly csrfToken: string | null = null,
  ) {}

  async req<T = any>(
    method: string,
    path: string,
    body?: unknown,
    opts: ReqOpts = {},
  ): Promise<Res<T>> {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (this.cookie && opts.cookie !== false) {
      headers.cookie = SESSION_COOKIE + '=' + this.cookie;
    }
    const csrf = opts.csrf === undefined ? this.csrfToken : opts.csrf;
    if (csrf) headers['x-csrf-token'] = csrf;
    if (opts.origin) headers.origin = opts.origin;
    const res = await fetch(this.base + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const raw = await res.text();
    const json =
      raw && res.headers.get('content-type')?.includes('json') ? JSON.parse(raw) : raw || null;
    return { status: res.status, body: json as T, headers: res.headers };
  }

  get<T = any>(path: string, opts?: ReqOpts) {
    return this.req<T>('GET', path, undefined, opts);
  }
  post<T = any>(path: string, body?: unknown, opts?: ReqOpts) {
    return this.req<T>('POST', path, body ?? {}, opts);
  }
  patch<T = any>(path: string, body?: unknown, opts?: ReqOpts) {
    return this.req<T>('PATCH', path, body ?? {}, opts);
  }
  del<T = any>(path: string, opts?: ReqOpts) {
    return this.req<T>('DELETE', path, undefined, opts);
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ── Фабрики ──────────────────────────────────────────────────────────────────────────────────

let passwordHash: Promise<string> | null = null;
let seq = 0;

export interface UserSpec {
  tenantId: string;
  role: Role;
  kind?: AccountKind;
  companyId?: string | null;
  name?: string;
  email?: string;
  active?: boolean;
  expiresAt?: Date | null;
  locale?: string;
  /** Включен TOTP (с TOTP_SECRET). По подразбиране — за ролите, които са задължени (персонала). */
  mfa?: boolean;
}

export async function makeUser(spec: UserSpec): Promise<User> {
  passwordHash ??= hashPassword(PASSWORD);
  seq += 1;
  return db.user.create({
    data: {
      tenantId: spec.tenantId,
      companyId: spec.companyId ?? null,
      role: spec.role,
      kind: spec.kind ?? 'INTERNAL',
      name: spec.name ?? `Utente ${seq}`,
      email: spec.email ?? `utente${seq}@example.test`,
      passwordHash: await passwordHash,
      active: spec.active ?? true,
      expiresAt: spec.expiresAt ?? null,
      locale: spec.locale ?? 'it',
      ...((spec.mfa ?? mfaRequired(spec.role))
        ? { totpSecretEnc: encryptSecret(TOTP_SECRET, MFA_KEY), totpEnabledAt: new Date() }
        : {}),
    },
  });
}

/**
 * Вписан клиент без да минава през /login (лимитът на входа е по IP — не го хабим). С включен
 * TOTP сесията е минала втория фактор (както след /auth/mfa/verify), освен ако `mfaPassed: false`.
 * Самият поток на MFA се проверява в admin-mfa.test.ts.
 */
export async function signIn(
  h: Harness,
  user: User,
  opts: { mfaPassed?: boolean } = {},
): Promise<Client> {
  const s = await createSession(h.sessions, user.id);
  if (user.totpEnabledAt && opts.mfaPassed !== false) {
    await db.session.update({ where: { id: s.id }, data: { mfaPassed: true } });
  }
  return new Client(h.base, s.token, s.csrfToken);
}
