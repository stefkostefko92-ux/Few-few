import type { AuditLog } from '@prisma/client';
import { prisma } from '../db.js';
import { DEFAULT_LOCALE, hasKey, type Translator } from '../i18n.js';
import type { ViewHelpers } from '../http/view.js';
import { auditActionId, auditDetail } from './audit-detail.js';

/**
 * Одитът, както го чете екипът: действието с думи (кодът остава до него — по него се филтрира), подробностите
 * като текст, а вместо id — имейлът на акаунта (с връзка към него). Записите не се променят: тук само се
 * показват. Имейлът се взима при показ и само за акаунти, които още съществуват; за изтрит остава началото
 * на id-то.
 */

export type AuditRow = Pick<
  AuditLog,
  | 'id'
  | 'at'
  | 'actorType'
  | 'actorId'
  | 'actorLabel'
  | 'action'
  | 'targetType'
  | 'targetId'
  | 'detail'
  | 'ip'
>;

/** Към кого или какво сочи записът — готово за показ. */
export interface AuditRef {
  /** „поръчка“, „проект „Кухня““ — по-дребно, над стойността */
  kind?: string;
  text: string;
  href?: string;
  /** пълният id, когато се вижда само началото му */
  title?: string;
  mono?: boolean;
}

export interface AuditLine {
  id: number;
  at: Date;
  code: string;
  label: string;
  details: string[];
  actor: AuditRef;
  target: AuditRef | null;
  ip: string | null;
}

export interface AuditPeople {
  emails: ReadonlyMap<string, string>;
  /** поръчка → акаунтът ѝ */
  requests: ReadonlyMap<string, string | null>;
  projects: ReadonlyMap<string, { name: string; userId: string }>;
}

const NAME_MAX = 60;

function idsOf(rows: readonly AuditRow[], type: string): string[] {
  return [
    ...new Set(rows.flatMap((r) => (r.targetType === type && r.targetId ? [r.targetId] : []))),
  ];
}

/** „копие на …“ сочи друг проект: и неговото име се търси с останалите. */
function copiedFrom(row: AuditRow): string[] {
  const detail = row.detail;
  if (row.action !== 'project.duplicated' || !detail || typeof detail !== 'object') return [];
  const from = Array.isArray(detail) ? undefined : detail.from;
  return typeof from === 'string' ? [from] : [];
}

/** Акаунтите, поръчките и проектите, към които сочат записите — с три заявки, не по една на ред. */
export async function loadAuditPeople(rows: readonly AuditRow[]): Promise<AuditPeople> {
  const requestIds = idsOf(rows, 'request');
  const projectIds = [...new Set([...idsOf(rows, 'project'), ...rows.flatMap(copiedFrom)])];
  const [requests, projects] = await Promise.all([
    requestIds.length
      ? prisma.upgradeRequest.findMany({
          where: { id: { in: requestIds } },
          select: { id: true, userId: true },
        })
      : Promise.resolve([]),
    projectIds.length
      ? prisma.project.findMany({
          where: { id: { in: projectIds } },
          select: { id: true, name: true, userId: true },
        })
      : Promise.resolve([]),
  ]);
  const userIds = new Set<string>();
  for (const row of rows) {
    if (row.actorId) userIds.add(row.actorId);
    if (row.targetType === 'user' && row.targetId) userIds.add(row.targetId);
  }
  for (const request of requests) if (request.userId) userIds.add(request.userId);
  for (const project of projects) userIds.add(project.userId);
  const users = userIds.size
    ? await prisma.user.findMany({
        where: { id: { in: [...userIds] } },
        select: { id: true, email: true },
      })
    : [];
  return {
    emails: new Map(users.map((u) => [u.id, u.email])),
    requests: new Map(requests.map((r) => [r.id, r.userId ?? null])),
    projects: new Map(projects.map((p) => [p.id, { name: p.name, userId: p.userId }])),
  };
}

function shortId(id: string): AuditRef {
  return { text: `${id.slice(0, 8)}…`, title: id, mono: true };
}

function clipName(name: string): string {
  return name.length > NAME_MAX ? `${name.slice(0, NAME_MAX - 1)}…` : name;
}

/** Акаунт по id: имейлът с връзка; изтрит — „изтрит акаунт“ и началото на id-то. */
function account(id: string | null, people: AuditPeople, t: Translator): AuditRef {
  if (!id) return { text: t('admin.audit.gone') };
  const email = people.emails.get(id);
  return email
    ? { text: email, href: `/admin/accounts/${id}` }
    : { kind: t('admin.audit.gone'), ...shortId(id) };
}

function actorOf(row: AuditRow, people: AuditPeople, t: Translator, fmt: ViewHelpers): AuditRef {
  if (row.actorType === 'SYSTEM') return { text: fmt.label(row.actorLabel) };
  // клиентът е записан със знак (@customer:<id>), служителят — с името си
  if (row.actorLabel.startsWith('@')) return account(row.actorId, people, t);
  const email = row.actorId ? people.emails.get(row.actorId) : undefined;
  return email && row.actorId
    ? { text: row.actorLabel, href: `/admin/accounts/${row.actorId}` }
    : { text: row.actorLabel };
}

function targetOf(row: AuditRow, people: AuditPeople, t: Translator): AuditRef | null {
  const id = row.targetId;
  if (!row.targetType && !id) return null;
  if (!id) return { text: row.targetType ?? '' };
  switch (row.targetType) {
    case 'user':
      return id === row.actorId ? { text: t('admin.audit.self') } : account(id, people, t);
    case 'request': {
      const kind = t('admin.audit.kind.request');
      if (!people.requests.has(id)) return { kind, ...shortId(id) };
      return { kind, ...account(people.requests.get(id) ?? null, people, t) };
    }
    case 'project': {
      const project = people.projects.get(id);
      if (!project) return { kind: t('admin.audit.kind.projectGone'), ...shortId(id) };
      return {
        kind: t('admin.audit.kind.project', { name: clipName(project.name) }),
        ...account(project.userId, people, t),
      };
    }
    default:
      return { kind: row.targetType ?? '', ...shortId(id) };
  }
}

/** Един запис за показ. Непознат код (ново действие без превод) се показва както е записан. */
export function auditLine(
  row: AuditRow,
  people: AuditPeople,
  t: Translator,
  fmt: ViewHelpers,
): AuditLine {
  const key = `admin.audit.act.${auditActionId(row.action)}`;
  return {
    id: row.id,
    at: row.at,
    code: row.action,
    label: hasKey(DEFAULT_LOCALE, key) ? t(key) : row.action,
    details: auditDetail(row.action, row.detail, {
      t,
      date: (value) => fmt.date(value),
      projectName: (projectId) => {
        const project = people.projects.get(projectId);
        return project ? clipName(project.name) : null;
      },
    }),
    actor: actorOf(row, people, t, fmt),
    target: targetOf(row, people, t),
    ip: row.ip,
  };
}

/** Записите за показ — с една обща справка за имейлите и имената. */
export async function auditLines(
  rows: readonly AuditRow[],
  t: Translator,
  fmt: ViewHelpers,
): Promise<AuditLine[]> {
  const people = await loadAuditPeople(rows);
  return rows.map((row) => auditLine(row, people, t, fmt));
}
