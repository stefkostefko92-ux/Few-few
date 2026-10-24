import type { PrismaClient } from '@prisma/client';
import type { DeleteBatch } from '../retention.js';

/**
 * SQL-ът на чистенето: една партида по първичен ключ на заявка. Условията са точно сроковете от
 * CONTRACT.md §7; обжалванията и докладите се трият само след решение (статус ≠ OPEN).
 */
export function prismaDeleteBatch(db: PrismaClient): DeleteBatch {
  return async (target, cutoff, limit) => {
    switch (target) {
      case 'sessions':
        return db.$executeRaw`
          DELETE FROM sessions WHERE id IN (
            SELECT id FROM sessions WHERE connected_at < ${cutoff} LIMIT ${limit})`;
      case 'kills':
        return db.$executeRaw`
          DELETE FROM kills WHERE id IN (
            SELECT id FROM kills WHERE at < ${cutoff} LIMIT ${limit})`;
      case 'appeals':
        return db.$executeRaw`
          DELETE FROM appeals WHERE id IN (
            SELECT id FROM appeals
            WHERE status <> 'OPEN' AND handled_at IS NOT NULL AND handled_at < ${cutoff}
            LIMIT ${limit})`;
      case 'matches':
        // match_players се трият каскадно (FK ON DELETE CASCADE).
        return db.$executeRaw`
          DELETE FROM matches WHERE id IN (
            SELECT id FROM matches WHERE ended_at < ${cutoff} LIMIT ${limit})`;
      case 'reports':
        return db.$executeRaw`
          DELETE FROM reports WHERE id IN (
            SELECT id FROM reports
            WHERE status <> 'OPEN' AND handled_at IS NOT NULL AND handled_at < ${cutoff}
            LIMIT ${limit})`;
    }
  };
}
