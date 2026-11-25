// Правилата за известия и единственият ред с настройки.
import type { AlertRule, PrismaClient, Settings } from '@prisma/client';
import type { RuleInput, SettingsInput } from '../domain/validation.js';
import { syncNotifications } from './sync.js';

export async function listRules(db: PrismaClient): Promise<AlertRule[]> {
  return db.alertRule.findMany({
    orderBy: [{ kind: 'asc' }, { threshold: 'desc' }, { id: 'asc' }],
  });
}

export async function getRule(db: PrismaClient, id: number): Promise<AlertRule | null> {
  return db.alertRule.findUnique({ where: { id } });
}

// Ново правило не пингва със задна дата: партидите, които вече са под прага, се отбелязват тихо.
export async function createRule(
  db: PrismaClient,
  input: RuleInput,
  now: Date,
): Promise<AlertRule> {
  return db.$transaction(async (tx) => {
    const rule = await tx.alertRule.create({ data: input });
    await syncNotifications(tx, { ruleIds: [rule.id] }, now);
    return rule;
  });
}

export async function updateRule(
  db: PrismaClient,
  id: number,
  input: RuleInput,
  now: Date,
): Promise<boolean> {
  return db.$transaction(async (tx) => {
    const updated = await tx.alertRule.updateMany({ where: { id }, data: input });
    if (updated.count === 0) return false;
    await syncNotifications(tx, { ruleIds: [id] }, now);
    return true;
  });
}

export async function deleteRule(db: PrismaClient, id: number): Promise<boolean> {
  const { count } = await db.alertRule.deleteMany({ where: { id } });
  return count > 0;
}

export async function getSettings(db: PrismaClient): Promise<Settings> {
  return db.settings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
}

export async function updateSettings(db: PrismaClient, input: SettingsInput): Promise<Settings> {
  return db.settings.upsert({ where: { id: 1 }, create: { id: 1, ...input }, update: input });
}
