// Изгражда каталог на релевантните датасети от BDAP Open Data (CKAN API на RGS/MEF):
// годишните и тримесечните модели CE (Conto Economico), SP (Stato Patrimoniale)
// и LA (Livelli di Assistenza) на структурите от SSN — по отделна структура (ente).
//
// CKAN каталогът няма работещо търсене (package_search връща 0), затова се
// изтеглят метаданните на всички датасети. Те се кешират в data/raw/bdap-pkgs/,
// така че следващите пускания са инкрементални (само новите датасети).

// @ts-check
import { join } from 'node:path';
import { readFile, readdir, mkdir } from 'node:fs/promises';
import { fetchJson, writeJson, mapLimit } from './lib/http.js';
import { RAW_DIR, CATALOG_FILE } from './lib/paths.js';

const CKAN = 'https://bdap-opendata.rgs.mef.gov.it/SpodCkanApi/api/3/action';
const PKG_DIR = join(RAW_DIR, 'bdap-pkgs');

const TITLE_RE =
  /^(\d{4})(?:\/(I{1,3}|IV) Trim\.)? - Modello di rilevazione (del Conto Economico|dello Stato Patrimoniale|dei Livelli di Assistenza) degli enti del SSN( a livello \w+\.?)?$/;

/** @type {Record<string, string>} */
const KIND = {
  'del Conto Economico': 'CE',
  'dello Stato Patrimoniale': 'SP',
  'dei Livelli di Assistenza': 'LA',
};

async function main() {
  await mkdir(PKG_DIR, { recursive: true });

  console.log('Тегля списъка с датасети от CKAN…');
  const list = await fetchJson(`${CKAN}/package_list`);
  if (!list.success) throw new Error('package_list не успя');
  const ids = list.result;
  console.log(`  ${ids.length} датасета в каталога`);

  const cached = new Set(await readdir(PKG_DIR));
  const missing = ids.filter((/** @type {string} */ id) => !cached.has(`${id}.json`));
  console.log(`  ${missing.length} липсват в кеша — тегля метаданните им…`);

  let done = 0;
  await mapLimit(missing, 12, async (id) => {
    try {
      const pkg = await fetchJson(`${CKAN}/package_show?id=${id}`);
      if (pkg.success) await writeJson(join(PKG_DIR, `${id}.json`), pkg.result);
    } catch (err) {
      console.warn(`  пропускам ${id}: ${err instanceof Error ? err.message : String(err)}`);
    }
    done++;
    if (done % 200 === 0) console.log(`  …${done}/${missing.length}`);
  });

  // Филтриране: само моделите по отделна структура (без „a livello Nazionale/Regionale“).
  /** @type {Array<{ kind: string, anno: number, trimestre: string|null, title: string, csvUrl: string }>} */
  const datasets = [];
  for (const file of await readdir(PKG_DIR)) {
    if (!file.endsWith('.json')) continue;
    let pkg;
    try {
      pkg = JSON.parse(await readFile(join(PKG_DIR, file), 'utf8'));
    } catch {
      continue; // повреден кеш файл — ще се допълни при следващо пускане
    }
    if (pkg && pkg.result) pkg = pkg.result; // толерираме и суров API отговор в кеша
    const title = (pkg.title || '').trim();
    const m = title.match(TITLE_RE);
    if (!m || m[4]) continue; // не е модел по ente или е агрегат по регион/държава
    const csv = (pkg.resources || []).find(
      (/** @type {any} */ r) => (r.format || '').toLowerCase() === 'csv' && /\/datastore\/dump\//.test(r.url || '')
    );
    if (!csv) continue;
    datasets.push({
      kind: KIND[m[3]],
      anno: Number(m[1]),
      trimestre: m[2] || null,
      title,
      csvUrl: csv.url.replace(/^http:/, 'https:'),
    });
  }
  datasets.sort((a, b) => a.kind.localeCompare(b.kind) || a.anno - b.anno || String(a.trimestre).localeCompare(String(b.trimestre)));

  await writeJson(CATALOG_FILE, { generatoIl: new Date().toISOString(), datasets });
  const annual = datasets.filter((d) => !d.trimestre);
  console.log(
    `Готово: ${datasets.length} датасета (${annual.length} годишни) → ${CATALOG_FILE}`
  );
  for (const kind of ['CE', 'SP', 'LA']) {
    const years = annual.filter((d) => d.kind === kind).map((d) => d.anno);
    console.log(`  ${kind}: годишни ${Math.min(...years)}–${Math.max(...years)} (${years.length} г.)`);
  }
}

main().catch((err) => {
  console.error('Грешка:', err);
  process.exitCode = 1;
});
