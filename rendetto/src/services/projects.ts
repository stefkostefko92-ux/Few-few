import type { Prisma, Project } from '@prisma/client';
import { z } from 'zod';
import { audit } from '../audit.js';
import { sha256Hex } from '../crypto.js';
import { prisma } from '../db.js';
import type { RequestMeta } from '../http/meta.js';
import { planView } from '../plans/plan.js';
import type { SessionUser } from '../types.js';
import { customerActor } from './auth-common.js';
import { engine, isFurnitureType, specOf, type Spec } from './engine.js';
import { dimensionsText } from './furniture.js';
import { copyName, hasUnsafeChars } from './names.js';

const MAX_PROJECTS = 500;
const MAX_SPEC_BYTES = 32 * 1024;
const NAME_MAX = 80;

export type ProjectResult<T = Project> =
  { ok: true; project: T } | { ok: false; key: string; status: number };

const nameSchema = z
  .string()
  .trim()
  .min(1)
  .max(NAME_MAX)
  .regex(/^[^<>\n\r]+$/)
  .refine((value) => !hasUnsafeChars(value));

/**
 * Спецификацията от редактора е плосък обект от прости стойности. Всичко друго се отхвърля още тук;
 * после двигателят я нормализира (граници на размерите, познати стойности) — запазва се нормализираната.
 */
const specSchema = z
  .record(
    z.string().max(40),
    z.union([z.string().max(200), z.number().finite(), z.boolean(), z.null()]),
  )
  .refine((value) => Object.keys(value).length <= 80, 'твърде много полета')
  .refine((value) => isFurnitureType(value.type), 'непознат тип мебел');

function canCreate(user: SessionUser): ProjectResult<never> | null {
  const view = planView(user);
  if (view.canCreate) return null;
  return view.blockedBy === 'unverified'
    ? { ok: false, key: 'app.errors.unverified', status: 403 }
    : { ok: false, key: 'app.errors.planExpired', status: 402 };
}

function hashOf(spec: Spec): string {
  return sha256Hex(engine().canonicalJson(spec));
}

export function normalizedSpec(raw: unknown): Spec | null {
  // Първо схемата: плоският обект отхвърля вложеното без рекурсия. JSON.stringify върху дълбоко вложен
  // вход хвърля RangeError — това би било 500 вместо 400.
  const parsed = specSchema.safeParse(raw);
  if (!parsed.success) return null;
  if (JSON.stringify(parsed.data).length > MAX_SPEC_BYTES) return null;
  return engine().normalizeSpec(parsed.data);
}

/**
 * Нов проект под тавана MAX_PROJECTS. Броенето и записът са в една транзакция под ключа на човека —
 * паралелни заявки не могат да прочетат един и същ брой и така да минат тавана.
 */
async function createUnderCap(
  userId: string,
  data: Omit<Prisma.ProjectUncheckedCreateInput, 'userId'>,
): Promise<Project | null> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT 1 FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    if ((await tx.project.count({ where: { userId } })) >= MAX_PROJECTS) return null;
    return tx.project.create({ data: { ...data, userId } });
  });
}

export async function listOwnProjects(userId: string) {
  return prisma.project.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      name: true,
      type: true,
      spec: true,
      updatedAt: true,
    },
  });
}

/** Собствен проект — чужд не съществува за този човек (404, не 403: не издаваме, че id-то е истинско). */
export async function ownProject(userId: string, id: string): Promise<Project | null> {
  if (!/^[a-z0-9]{20,40}$/.test(id)) return null;
  return prisma.project.findFirst({ where: { id, userId } });
}

export async function createProject(
  user: SessionUser,
  rawName: unknown,
  rawType: unknown,
  meta: RequestMeta,
): Promise<ProjectResult> {
  const blocked = canCreate(user);
  if (blocked) return blocked;
  if (!isFurnitureType(rawType)) return { ok: false, key: 'error.badInput', status: 400 };
  // Празно име не стига дотук: рутерът дава името на вида мебел на езика на човека.
  const name = nameSchema.safeParse(rawName);
  if (!name.success) return { ok: false, key: 'app.errors.name', status: 400 };
  const spec = engine().normalizeSpec({ type: rawType });
  const project = await createUnderCap(user.id, {
    name: name.data,
    type: rawType,
    spec: spec as Prisma.InputJsonValue,
    specHash: hashOf(spec),
  });
  if (!project) return { ok: false, key: 'app.errors.tooMany', status: 409 };
  await audit(customerActor(user, meta), {
    action: 'project.created',
    targetType: 'project',
    targetId: project.id,
  });
  return { ok: true, project };
}

/** Версията, която редакторът е отворил: времето на последния запис, точно до милисекунда. */
const baseSchema = z.string().datetime();

/**
 * Записва само върху версията, която редакторът е отворил (`base` = `updatedAt` при отваряне или след
 * последния запис). Запис от друг прозорец или устройство междувременно не се презаписва тихо — 409.
 */
export async function saveProject(
  user: SessionUser,
  id: string,
  rawSpec: unknown,
  rawName: unknown,
  rawBase: unknown,
): Promise<ProjectResult> {
  const blocked = canCreate(user);
  if (blocked) return blocked;
  const project = await ownProject(user.id, id);
  if (!project) return { ok: false, key: 'error.notFoundText', status: 404 };
  const spec = normalizedSpec(rawSpec);
  if (!spec) return { ok: false, key: 'app.errors.spec', status: 400 };
  const name =
    rawName === undefined
      ? { success: true as const, data: project.name }
      : nameSchema.safeParse(rawName);
  if (!name.success) return { ok: false, key: 'app.errors.name', status: 400 };
  const base = baseSchema.safeParse(rawBase);
  if (!base.success) return { ok: false, key: 'app.errors.conflict', status: 409 };
  const type = typeof spec.type === 'string' ? spec.type : project.type;
  const written = await prisma.project.updateMany({
    where: { id: project.id, userId: user.id, updatedAt: new Date(base.data) },
    data: {
      spec: spec as Prisma.InputJsonValue,
      specHash: hashOf(spec),
      name: name.data,
      type,
      updatedAt: new Date(),
    },
  });
  if (written.count !== 1) return { ok: false, key: 'app.errors.conflict', status: 409 };
  const saved = await ownProject(user.id, project.id);
  if (!saved) return { ok: false, key: 'error.notFoundText', status: 404 };
  return { ok: true, project: saved };
}

export async function duplicateProject(
  user: SessionUser,
  id: string,
  meta: RequestMeta,
): Promise<ProjectResult> {
  const blocked = canCreate(user);
  if (blocked) return blocked;
  const project = await ownProject(user.id, id);
  if (!project) return { ok: false, key: 'error.notFoundText', status: 404 };
  const copy = await createUnderCap(user.id, {
    name: copyName(project.name, NAME_MAX),
    type: project.type,
    spec: project.spec as Prisma.InputJsonValue,
    specHash: project.specHash,
  });
  if (!copy) return { ok: false, key: 'app.errors.tooMany', status: 409 };
  await audit(customerActor(user, meta), {
    action: 'project.duplicated',
    targetType: 'project',
    targetId: copy.id,
    detail: { from: project.id },
  });
  return { ok: true, project: copy };
}

/** Изтриването на собствен проект е позволено винаги — и при изтекъл план (данните са на човека). */
export async function deleteProject(
  user: SessionUser,
  id: string,
  meta: RequestMeta,
): Promise<boolean> {
  const result = await prisma.project.deleteMany({ where: { id, userId: user.id } });
  if (result.count === 1) {
    await audit(customerActor(user, meta), {
      action: 'project.deleted',
      targetType: 'project',
      targetId: id,
    });
  }
  return result.count === 1;
}

/** Кратко описание за списъка: видът (ключ за превода) и габаритът, изчислен от двигателя. */
export function projectSummary(project: { type: string; spec: Prisma.JsonValue }): {
  type: string;
  dims: string;
} {
  const api = engine();
  const spec = specOf(project.spec);
  try {
    return { type: project.type, dims: dimensionsText(project.type, api.normalizeSpec(spec)) };
  } catch {
    return { type: project.type, dims: '' };
  }
}
