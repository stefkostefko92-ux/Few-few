// Изтегля годишните CE (отчет за приходите и разходите) и SP (баланс) CSV файлове
// за структурите от SSN от BDAP Open Data, според каталога и config.json.
// Файловете се кешират идемпотентно в data/raw/bdap/.

import { join } from 'node:path';
import { downloadToFile, readJson } from './lib/http.js';
import { RAW_DIR, CATALOG_FILE, ROOT } from './lib/paths.js';

async function main() {
  const config = await readJson(join(ROOT, 'config.json'));
  const { datasets } = await readJson(CATALOG_FILE).catch(() => {
    throw new Error('няма каталог — пусни първо `npm run fetch:catalogo`');
  });

  const wanted = datasets.filter(
    (d) =>
      ['CE', 'SP'].includes(d.kind) &&
      d.anno >= config.anni.da &&
      d.anno <= config.anni.a &&
      (config.includiTrimestrali || !d.trimestre)
  );
  console.log(`${wanted.length} датасета за изтегляне (CE/SP, ${config.anni.da}–${config.anni.a})`);

  for (const d of wanted) {
    const suffix = d.trimestre ? `-${d.trimestre}` : '';
    const path = join(RAW_DIR, 'bdap', `${d.kind.toLowerCase()}-${d.anno}${suffix}.csv`);
    const fresh = await downloadToFile(d.csvUrl, path, { timeoutMs: 600_000 });
    console.log(`  ${fresh ? 'свалено' : 'от кеша'}: ${d.title}`);
  }
  console.log('Готово.');
}

main().catch((err) => {
  console.error('Грешка:', err);
  process.exitCode = 1;
});
