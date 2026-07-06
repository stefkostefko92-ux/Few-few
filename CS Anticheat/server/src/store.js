// Съхранение на доклади. MVP: JSON файлове на диск.
// Абстракцията позволява по-късна смяна с PostgreSQL + Prisma (виж research/00).
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';

export class Store {
  /** @param {string} dir директория за докладите */
  constructor(dir) {
    this.dir = dir;
  }

  async init() {
    await mkdir(this.dir, { recursive: true });
  }

  #file(id) {
    // id идва от скенера (csac_<hex>); валидираме за да няма path traversal.
    if (!/^csac_[a-f0-9]{8,64}$/.test(id)) {
      throw new Error('невалиден report id');
    }
    return path.join(this.dir, `${id}.json`);
  }

  /** Записва доклад; връща id. */
  async save(report) {
    const id = report.reportId;
    await writeFile(this.#file(id), JSON.stringify(report, null, 2), 'utf8');
    return id;
  }

  /** Връща доклад по id или null. */
  async get(id) {
    try {
      const raw = await readFile(this.#file(id), 'utf8');
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  /** Връща последните N доклада (за списък в панела), сортирани по време. */
  async recent(limit = 50) {
    let files = [];
    try {
      files = await readdir(this.dir);
    } catch {
      return [];
    }
    const reports = [];
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      try {
        const r = JSON.parse(await readFile(path.join(this.dir, f), 'utf8'));
        reports.push({
          reportId: r.reportId,
          createdAt: r.createdAt,
          verdict: r.verdict,
          score: r.score,
          hostname: r.system?.hostname ?? '',
          hwid: r.hwid?.composite?.slice(0, 16) ?? '',
          detections: r.detections?.length ?? 0,
        });
      } catch {
        /* пропусни повреден файл */
      }
    }
    reports.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return reports.slice(0, limit);
  }
}
