import * as FileSystem from 'expo-file-system/legacy';

import type { MediaAsset, QueuedReport } from '@/types';

/**
 * Локално съхранение на опашката. Сигналите се пазят като JSON, а медийните
 * файлове се копират в постоянна директория на приложението, за да оцелеят
 * след като системният кеш на камерата/галерията се изчисти.
 */

const ROOT = `${FileSystem.documentDirectory ?? ''}pomagam/`;
const MEDIA_DIR = `${ROOT}media/`;
const QUEUE_FILE = `${ROOT}queue.json`;

async function ensureDirs(): Promise<void> {
  for (const dir of [ROOT, MEDIA_DIR]) {
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    }
  }
}

/** Копира медиен файл в постоянната директория и връща новия запис. */
export async function persistMedia(
  reportId: string,
  asset: MediaAsset,
  index: number,
): Promise<MediaAsset> {
  await ensureDirs();
  const target = `${MEDIA_DIR}${reportId}-${index}-${asset.fileName}`;
  await FileSystem.copyAsync({ from: asset.uri, to: target });
  return { ...asset, uri: target };
}

export async function loadQueue(): Promise<QueuedReport[]> {
  await ensureDirs();
  const info = await FileSystem.getInfoAsync(QUEUE_FILE);
  if (!info.exists) {
    return [];
  }
  try {
    const raw = await FileSystem.readAsStringAsync(QUEUE_FILE);
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as QueuedReport[]) : [];
  } catch {
    return [];
  }
}

export async function saveQueue(queue: QueuedReport[]): Promise<void> {
  await ensureDirs();
  await FileSystem.writeAsStringAsync(QUEUE_FILE, JSON.stringify(queue));
}

/** Изтрива медийните файлове на изпратен сигнал. */
export async function removeMedia(report: QueuedReport): Promise<void> {
  await Promise.all(
    report.media.map((m) =>
      FileSystem.deleteAsync(m.uri, { idempotent: true }).catch(() => undefined),
    ),
  );
}
