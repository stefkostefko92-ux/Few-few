import type { PrismaClient } from '@prisma/client';
import { assignMissions, type PlayerMissions } from '../missions.js';

/**
 * Публичното четене на мисиите (CONTRACT §16). `mission_progress` пише C# плъгинът; сайтът само чете. Трите мисии
 * за деня идват от детерминистичния избор (същият като в плъгина) — ред в базата дава само напредъка, затова и
 * играч, който днес още не е влизал, вижда своите три с 0.
 */
export async function loadMissions(
  db: PrismaClient,
  steamId: string,
  day: string,
): Promise<PlayerMissions> {
  const [rows, completed] = await Promise.all([
    db.missionProgress.findMany({
      where: { steamId, day: new Date(`${day}T00:00:00Z`) },
      select: { missionKey: true, progress: true, completedAt: true },
    }),
    db.missionProgress.count({ where: { steamId, completedAt: { not: null } } }),
  ]);
  const byKey = new Map(rows.map((row) => [row.missionKey, row]));
  const today = assignMissions(steamId, day).map((def) => {
    const row = byKey.get(def.key);
    const progress = Math.min(def.target, Math.max(0, row?.progress ?? 0));
    return { ...def, progress, done: row?.completedAt != null };
  });
  return { day, today, completed };
}
