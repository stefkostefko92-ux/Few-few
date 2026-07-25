// Качване на деплой архив направо от браузъра — стрийм към archiveDir, без multipart
// парсване (пращаме суровото тяло + име в query). Пише и <архив>.sha256, който
// autodeploy.sh проверява преди да разопакова (целост на доставката).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const NAME_RX = /^[\w][\w.-]{0,120}\.(zip|tar\.gz)$/;

export function assertArchiveName(name) {
  const base = String(name || '');
  if (base.includes('/') || base.includes('\\') || base.includes('\0') || !NAME_RX.test(base)) {
    throw Object.assign(new Error('Невалидно име на архив (позволени: .zip, .tar.gz)'), { status: 400 });
  }
  return base;
}

// Стриймва req към archiveDir/<name>.part, после rename. Връща размер + sha256.
export function receiveArchive(req, cfg, name) {
  const base = assertArchiveName(name);
  const dir = cfg.paths.archiveDir;
  const finalPath = path.join(dir, base);
  const tmpPath = `${finalPath}.part`;
  const maxBytes = Number(cfg.uploads?.maxBytes) || 3 * 1024 * 1024 * 1024;

  return new Promise((resolve, reject) => {
    fs.mkdirSync(dir, { recursive: true });
    const out = fs.createWriteStream(tmpPath, { mode: 0o600 });
    const hash = crypto.createHash('sha256');
    let size = 0;
    let aborted = false;

    const fail = (err) => {
      if (aborted) return;
      aborted = true;
      out.destroy();
      fs.rm(tmpPath, { force: true }, () => reject(err));
    };

    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        req.destroy();
        fail(Object.assign(new Error('Архивът е твърде голям'), { status: 413 }));
        return;
      }
      hash.update(chunk);
    });
    req.on('error', (err) => fail(err));
    out.on('error', (err) => fail(err));
    out.on('finish', () => {
      if (aborted) return;
      if (!size) {
        fail(Object.assign(new Error('Празен архив'), { status: 400 }));
        return;
      }
      const sha = hash.digest('hex');
      try {
        fs.renameSync(tmpPath, finalPath);
        // Форматът на sha256sum -c: "<хеш>  <име>" — точно две интервали.
        fs.writeFileSync(`${finalPath}.sha256`, `${sha}  ${base}\n`, { mode: 0o600 });
      } catch (err) {
        fail(err);
        return;
      }
      resolve({ name: base, path: finalPath, sizeBytes: size, sha256: sha });
    });

    req.pipe(out);
  });
}

export function deleteArchive(cfg, name) {
  const base = assertArchiveName(name);
  const full = path.join(cfg.paths.archiveDir, base);
  fs.rmSync(full, { force: true });
  fs.rmSync(`${full}.sha256`, { force: true });
  return { name: base, deleted: true };
}
