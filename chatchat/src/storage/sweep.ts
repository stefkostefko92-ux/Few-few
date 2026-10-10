import type { FileAttachmentStore } from './file-store.js';
import { FileCryptoError } from './envelope.js';
import {
  digestObject,
  inspectObject,
  objectKeys,
  rekeyObject,
  sealLegacyObject,
} from './maintenance.js';

/**
 * Прогоните на CLI-то `files:*` върху цялото хранилище — един обект наведнъж (паметта е за един
 * файл), с отчет само в броеве и ключове на обекти (id-та, без имена и съдържание).
 */

export type SweepMode = 'status' | 'encrypt' | 'rekey' | 'verify';

export interface SweepReport {
  objects: number;
  /** Шифровани с текущия KEK. */
  current: number;
  /** Шифровани със стар KEK (от FILES_KEK_PREVIOUS) — чакат `files:rekey`. */
  previous: number;
  /** Нешифровани (отпреди шифроването) — чакат `files:encrypt`. */
  plain: number;
  /** Шифровани/преопаковани в този прогон. */
  converted: number;
  /** Пропуснати: изтрити или сменени по време на прогона (ретенцията) — не са грешка. */
  changed: number;
  /** Не се прочетоха (повредени, непознат KEK) — грешка. */
  failed: number;
  /** Само при проверка срещу базата: sha256 на открития текст ≠ `Attachment.sha256`. */
  mismatched: number;
  /** Само при проверка срещу базата: файл без ред (безвреден, но странен). */
  orphans: number;
  /** Само при проверка срещу базата: CLEAN ред без файл — загубен файл. */
  missing: number;
  /** До 20 ключа на проблемните обекти — за ръчен оглед. */
  samples: string[];
}

export interface ExpectedRow {
  objectKey: string;
  sha256: string;
  scanStatus: string;
}

const MAX_SAMPLES = 20;

function emptyReport(): SweepReport {
  return {
    objects: 0,
    current: 0,
    previous: 0,
    plain: 0,
    converted: 0,
    changed: 0,
    failed: 0,
    mismatched: 0,
    orphans: 0,
    missing: 0,
    samples: [],
  };
}

function note(r: SweepReport, key: string, why: string): void {
  if (r.samples.length < MAX_SAMPLES) r.samples.push(`${key} (${why})`);
}

export async function sweep(
  store: FileAttachmentStore,
  mode: SweepMode,
  expected: readonly ExpectedRow[] | null = null,
): Promise<SweepReport> {
  const r = emptyReport();
  const currentId = store.crypto.keyring?.currentId ?? null;
  const sealedWith = (kekId: string | null) => {
    if (kekId !== null && kekId === currentId) r.current += 1;
    else r.previous += 1;
  };
  const rows = new Map((expected ?? []).map((row) => [row.objectKey, row]));
  const seen = new Set<string>();

  for await (const key of objectKeys(store.root)) {
    r.objects += 1;
    try {
      if (mode === 'verify') {
        const d = await digestObject(key, store.pathOf(key), store.crypto);
        if (!d) {
          r.changed += 1;
          continue;
        }
        if (d.state === 'plain') r.plain += 1;
        else sealedWith(d.kekId);
        if (expected) {
          seen.add(key);
          const row = rows.get(key);
          if (!row) r.orphans += 1;
          else if (row.sha256 !== d.sha256) {
            r.mismatched += 1;
            note(r, key, 'sha256');
          }
        }
        continue;
      }
      if (mode === 'rekey') {
        const out = await rekeyObject(store, key);
        if (out === 'rekeyed') r.converted += 1;
        if (out === 'rekeyed' || out === 'current') r.current += 1;
        else if (out === 'plain') r.plain += 1;
        else r.changed += 1;
        continue;
      }
      const info = await inspectObject(store.pathOf(key));
      if (!info) r.changed += 1;
      else if (info.state === 'sealed') sealedWith(info.kekId);
      else if (mode === 'status') r.plain += 1;
      else {
        const out = await sealLegacyObject(store, key);
        if (out === 'sealed') r.converted += 1;
        if (out === 'sealed' || out === 'already') r.current += 1;
        else r.changed += 1;
      }
    } catch (err) {
      r.failed += 1;
      note(r, key, err instanceof FileCryptoError ? err.reason : 'io');
    }
  }

  if (expected) {
    for (const row of expected) {
      if (row.scanStatus !== 'CLEAN' || seen.has(row.objectKey)) continue;
      r.missing += 1;
      note(r, row.objectKey, 'missing');
    }
  }
  return r;
}

/** Има ли нещо, което иска човек (изходът на CLI-то ≠ 0). */
export function sweepProblems(
  r: SweepReport,
  mode: SweepMode,
  plaintext: 'allow' | 'deny',
): string[] {
  const out: string[] = [];
  if (r.failed > 0) out.push(`${r.failed} обекта не се прочетоха (повредени или с непознат KEK)`);
  if (r.mismatched > 0) out.push(`${r.mismatched} обекта не съвпадат по sha256 с базата`);
  if (r.missing > 0) out.push(`${r.missing} проверени (CLEAN) файла липсват в хранилището`);
  if (mode === 'rekey' && r.previous > 0) out.push(`${r.previous} обекта са още със стар KEK`);
  if ((mode === 'encrypt' || plaintext === 'deny') && mode !== 'status' && r.plain > 0) {
    out.push(`${r.plain} обекта са още нешифровани`);
  }
  return out;
}
