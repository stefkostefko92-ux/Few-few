import type { Prisma, Project } from '@prisma/client';
import { z } from 'zod';
import { audit } from '../audit.js';
import { sha256Hex } from '../crypto.js';
import { prisma } from '../db.js';
import type { RequestMeta } from '../http/meta.js';
import { planView } from '../plans/plan.js';
import type { SessionUser } from '../types.js';
import { customerActor } from './auth-common.js';
import { engine, isFurnitureType, type Spec } from './engine.js';
import { dimensionsText } from './furniture.js';

export const MAX_PROJECTS = 500;
const MAX_SPEC_BYTES = 32 * 1024;

export type ProjectResult<T = Project> =
  { ok: true; project: T } | { ok: false; key: string; status: number };

const nameSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[^<>\n\r]+$/);

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
  if (JSON.stringify(raw ?? null).length > MAX_SPEC_BYTES) return null;
  const parsed = specSchema.safeParse(raw);
  if (!parsed.success) return null;
  return engine().normalizeSpec(parsed.data);
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
      specHash: true,
      updatedAt: true,
      createdAt: true,
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
  const fallbackName = engine().typeLabel(rawType);
  const name = nameSchema.safeParse(
    typeof rawName === 'string' && rawName.trim() ? rawName : fallbackName,
  );
  if (!name.success) return { ok: false, key: 'app.errors.name', status: 400 };
  if ((await prisma.project.count({ where: { userId: user.id } })) >= MAX_PROJECTS) {
    return { ok: false, key: 'app.errors.tooMany', status: 409 };
  }
  const spec = engine().normalizeSpec({ type: rawType });
  const project = await prisma.project.create({
    data: {
      userId: user.id,
      name: name.data,
      type: rawType,
      spec: spec as Prisma.InputJsonValue,
      specHash: hashOf(spec),
    },
  });
  await audit(customerActor(user, meta), {
    action: 'project.created',
    targetType: 'project',
    targetId: project.id,
  });
  return { ok: true, project };
}

export async function saveProject(
  user: SessionUser,
  id: string,
  rawSpec: unknown,
  rawName: unknown,
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
  const type = typeof spec.type === 'string' ? spec.type : project.type;
  const saved = await prisma.project.update({
    where: { id: project.id },
    data: { spec: spec as Prisma.InputJsonValue, specHash: hashOf(spec), name: name.data, type },
  });
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
  if ((await prisma.project.count({ where: { userId: user.id } })) >= MAX_PROJECTS) {
    return { ok: false, key: 'app.errors.tooMany', status: 409 };
  }
  const copy = await prisma.project.create({
    data: {
      userId: user.id,
      name: `${project.name} (2)`.slice(0, 80),
      type: project.type,
      spec: project.spec as Prisma.InputJsonValue,
      specHash: project.specHash,
    },
  });
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
  const spec = (
    project.spec && typeof project.spec === 'object' && !Array.isArray(project.spec)
      ? project.spec
      : {}
  ) as Spec;
  try {
    return { type: project.type, dims: dimensionsText(project.type, api.normalizeSpec(spec)) };
  } catch {
    return { type: project.type, dims: '' };
  }
}
