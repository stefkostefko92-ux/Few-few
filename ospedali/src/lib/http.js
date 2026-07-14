// HTTP помощници: изтегляне с повторни опити, експоненциално изчакване и кеш на диска.
// Всички източници са официални open data портали — не изискват ключове.

import { mkdir, readFile, writeFile, stat, rename, unlink, open } from 'node:fs/promises';
import { dirname } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// ZIP magic bytes: локален файлов хедър (PK\x03\x04), празен архив / край на
// централната директория (PK\x05\x06), разделен архив (PK\x07\x08).
const ZIP_MAGICS = [
  Buffer.from([0x50, 0x4b, 0x03, 0x04]),
  Buffer.from([0x50, 0x4b, 0x05, 0x06]),
  Buffer.from([0x50, 0x4b, 0x07, 0x08]),
];

/**
 * Чете само първите 4 байта на файл и проверява дали са валиден ZIP подпис.
 * Защита срещу отровен кеш: прекъснато/повредено сваляне отпреди, HTML грешка
 * от WAF, или изтрит наполовина файл — да не трови следващите пускания.
 */
export async function eZipValido(filePath) {
  let fh;
  try {
    fh = await open(filePath, 'r');
    const buf = Buffer.alloc(4);
    const { bytesRead } = await fh.read(buf, 0, 4, 0);
    if (bytesRead < 4) return false;
    return ZIP_MAGICS.some((m) => buf.equals(m));
  } catch {
    return false;
  } finally {
    await fh?.close();
  }
}

const USER_AGENT =
  'ospedali-trasparenti/0.1 (open data ETL; https://carbonstealth.eu)';

/** Изтегля URL с до `retries` повторни опита при мрежова грешка или 5xx. */
export async function fetchWithRetry(url, { retries = 4, timeoutMs = 120_000, headers = {} } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, ...headers },
        signal: AbortSignal.timeout(timeoutMs),
        redirect: 'follow',
      });
      if (res.status >= 500) throw new Error(`HTTP ${res.status} за ${url}`);
      return res;
    } catch (err) {
      lastErr = err;
      if (attempt === retries) break;
      const waitMs = 2000 * 2 ** attempt;
      console.warn(`  повторен опит ${attempt + 1}/${retries} след ${waitMs}ms: ${err.message}`);
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
  throw lastErr;
}

/**
 * Изтегля URL във файл, ако файлът още не съществува (идемпотентно кеширане).
 * Пише първо във временен файл, за да не остават половинчати сваляния.
 * Връща true, ако е свалено сега; false, ако е взето от кеша.
 */
export async function downloadToFile(url, filePath, opts = {}) {
  try {
    const st = await stat(filePath);
    if (st.size > 0) return false;
  } catch {
    // няма файл — сваляме
  }
  await mkdir(dirname(filePath), { recursive: true });
  const res = await fetchWithRetry(url, opts);
  if (!res.ok) throw new Error(`HTTP ${res.status} за ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length === 0) throw new Error(`празен отговор за ${url}`);
  const tmp = `${filePath}.part`;
  await writeFile(tmp, buf);
  await rename(tmp, filePath);
  return true;
}

/**
 * GET през системния curl. WAF-ът на dati.salute.gov.it отхвърля Node fetch
 * по TLS фингърпринт (503), но пропуска curl — затова за този портал
 * минаваме през него. Връща tекста на отговора.
 */
export async function curlText(url, { retries = 4, timeoutSec = 90, headers = {} } = {}) {
  const args = ['-sS', '-L', '--fail', '--max-time', String(timeoutSec), '-A', 'Mozilla/5.0 (X11; Linux x86_64)'];
  for (const [k, v] of Object.entries(headers)) args.push('-H', `${k}: ${v}`);
  args.push(url);
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const { stdout } = await execFileAsync('curl', args, { maxBuffer: 512 * 1024 * 1024 });
      return stdout;
    } catch (err) {
      lastErr = err;
      if (attempt === retries) break;
      const waitMs = 2000 * 2 ** attempt;
      console.warn(`  повторен опит ${attempt + 1}/${retries} след ${waitMs}ms: curl ${url}`);
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
  throw lastErr;
}

/** Сваля URL във файл през системния curl (идемпотентно, байтово точно чрез -o). */
export async function curlDownloadToFile(url, filePath, { retries = 4, timeoutSec = 180, headers = {}, expectZip = false } = {}) {
  try {
    const st = await stat(filePath);
    if (st.size > 0) {
      // Кеширан ZIP може да е повреден (прекъснато сваляне, HTML от WAF, изтрит
      // наполовина) → провери magic bytes; ако е боклук, изтрий и пре-тегли,
      // вместо да отровиш unzip/парсването нататък. Без expectZip → старо поведение.
      if (expectZip && !(await eZipValido(filePath))) {
        console.warn(`  повреден ZIP кеш ${filePath} → изтривам и тегля наново`);
        await unlink(filePath).catch(() => {});
      } else {
        return false;
      }
    }
  } catch {
    // няма файл — сваляме
  }
  await mkdir(dirname(filePath), { recursive: true });
  const tmp = `${filePath}.part`;
  const args = ['-sS', '-L', '--fail', '--max-time', String(timeoutSec), '-A', 'Mozilla/5.0 (X11; Linux x86_64)', '-o', tmp];
  for (const [k, v] of Object.entries(headers)) args.push('-H', `${k}: ${v}`);
  args.push(url);
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      await execFileAsync('curl', args);
      const st = await stat(tmp);
      if (st.size === 0) throw new Error(`празен отговор за ${url}`);
      await rename(tmp, filePath);
      return true;
    } catch (err) {
      lastErr = err;
      if (attempt === retries) break;
      const waitMs = 2000 * 2 ** attempt;
      console.warn(`  повторен опит ${attempt + 1}/${retries} след ${waitMs}ms: curl ${url}`);
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
  throw lastErr;
}

/** GET, който връща JSON (с повторни опити). */
export async function fetchJson(url, opts = {}) {
  const res = await fetchWithRetry(url, opts);
  if (!res.ok) throw new Error(`HTTP ${res.status} за ${url}`);
  return res.json();
}

/** Чете JSON файл от диска. */
export async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

/** Записва JSON файл (с директориите по пътя). */
export async function writeJson(filePath, data) {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(data, null, 2) + '\n');
}

/** Изпълнява задачи с ограничен паралелизъм. */
export async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
