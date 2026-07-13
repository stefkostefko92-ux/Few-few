// COVID ретроспекция: годишни агрегати на здравните поръчки 2019–2024 —
// как пандемията промени пазара (senza gara, спешни възлагания, обеми).
// СЪЩИТЕ правила като fetch-appalti (HEALTH филтър, дедуп по CIG, catProc,
// валиден importo), но само национално ниво per година — за тренд страницата.
// НЕ пипа data/appalti.json (2023–24 прозорецът на сайта остава непроменен).
//
// Изход: data/storico.json.

import { join } from 'node:path';
import { readFile, rm, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parseCsv } from './lib/csv.js';
import { writeJson } from './lib/http.js';
import { DATA_DIR, RAW_DIR } from './lib/paths.js';
import { catProc } from './fetch-appalti.js';

const execFileAsync = promisify(execFile);
const ANAC_DIR = join(RAW_DIR, 'anac');
const ANNI = [2019, 2020, 2021, 2022, 2023, 2024];
const IMPORTO_MAX = 1_000_000_000;

// идентични с fetch-appalti (държим ги в синхрон при промяна там)
const HEALTH =
  /AZIENDA (OSPEDALIER|SANITARIA|SOCIO|UNITA|USL|ULSS|PROVINCIALE PER I SERVIZI SANITARI|REGIONALE DELLA SALUTE|LIGURE SANITARIA)|OSPEDALIER|OSPEDALI RIUN|A\.?O\.?U|\bA\.?S\.?L\b|\bA\.?S\.?S\.?T\b|\bA\.?U\.?L\.?S\.?S\b|\bASUR\b|\bASUGI\b|\bASUFC\b|\bAPSS\b|IRCCS|POLICLINICO|ISTITUTO (ONCOLOGICO|NAZIONALE|ORTOPEDICO|TUMORI|NEUROLOGICO)|FONDAZIONE\s+(IRCCS|POLICLINICO|OSPEDAL|ISTITUTO)|ESTAR|ESTAV|SORESA|AZIENDA ZERO|EGAS|ARNAS|ENTE OSPEDALIERO|AGENZIA (DI )?TUTELA DELLA SALUTE|AGENZIA REGIONALE STRATEGICA PER LA SALUTE|A\.?RE\.?S\.?S|\bUNITA'? SANITARIA LOCALE\b|SANITAETSBETRIEB|EMERGENZA SANITARIA|\bAREU\b|\bA\.?LI\.?SA\b|AZIENDA REGIONALE PER LA SALUTE/;
const NOT_HEALTH = /ACQUE|SPORT E SALUTE|ISTITUTO SUPERIORE DI SANIT|\bMINISTERO\b|CARABINIER|\bCOMUNE\b|\bUNIONE\b|BONIFICA|AZIENDA CASA|\bA\.?C\.?E\.?R\b|\bSTART\b|INFORMATICA|VIGILI DEL FUOCO|SOCIETA DELLE FONTI|INPS|INAIL|PREVIDENZA|ASSICURAZIONE CONTRO GLI INFORTUNI|ISTITUTO NAZIONALE PER LA GRAFICA|I\.N\.P\.G\.I/;

async function main() {
  const perAnno = {};
  for (const anno of ANNI) {
    const agg = { anno, n: 0, importo: 0, senzaGaraN: 0, urgenzaN: 0, diretto: 0, negoziataSenza: 0, competitiva: 0, quadro: 0 };
    const seen = new Set();
    for (let m = 1; m <= 12; m++) {
      const mm = String(m).padStart(2, '0');
      const zip = join(ANAC_DIR, `cig_csv_${anno}_${mm}.zip`);
      if (!(await stat(zip).catch(() => null))) continue;
      await execFileAsync('unzip', ['-o', zip, '-d', ANAC_DIR]);
      const csv = join(ANAC_DIR, `cig_csv_${anno}_${mm}.csv`);
      try {
        const rows = parseCsv(await readFile(csv, 'utf8'), { separator: ';' });
        for (const r of rows) {
          const denU = (r.denominazione_amministrazione_appaltante || '').toUpperCase();
          if (!HEALTH.test(denU) || NOT_HEALTH.test(denU)) continue;
          const cig = (r.cig || '').trim();
          if (cig) {
            if (seen.has(cig)) continue;
            seen.add(cig);
          }
          const unLotto = (r.n_lotti_componenti || '').trim() === '1';
          const importo = Number(r.importo_lotto || (unLotto ? r.importo_complessivo_gara : 0));
          if (!Number.isFinite(importo) || importo <= 0 || importo > IMPORTO_MAX) continue;
          const cat = catProc(r.tipo_scelta_contraente);
          agg.n++;
          agg.importo += importo;
          if (cat === 'diretto' || cat === 'negoziataSenza') agg.senzaGaraN++;
          if (agg[cat] != null) agg[cat]++;
          if ((r.FLAG_URGENZA || '').trim() === '1') agg.urgenzaN++;
        }
      } finally {
        await rm(csv, { force: true });
      }
    }
    agg.quotaSenzaGara = agg.n ? agg.senzaGaraN / agg.n : null;
    agg.quotaUrgenza = agg.n ? agg.urgenzaN / agg.n : null;
    // Прекъсване на серията от 01.2024: новият Codice (D.Lgs 36/2023) + задължителните
    // PCP платформи вкарват и микро-покупките (преди отделен smartCIG), вдигат прага за
    // affidamento diretto до 140k € и сменят семантиката на FLAG_URGENZA (~40% „1“ срещу
    // 0,3–2,7% преди) → 2024 НЕ е сравнима с 2019–2023 и се показва отделно.
    agg.comparabile = anno <= 2023;
    perAnno[anno] = agg;
    console.log(`${anno}: ${agg.n.toLocaleString('it-IT')} договора, senza gara ${(agg.quotaSenzaGara * 100).toFixed(1)}%, urgenza ${(agg.quotaUrgenza * 100).toFixed(1)}%`);
  }
  await writeJson(join(DATA_DIR, 'storico.json'), {
    generatoIl: new Date().toISOString(),
    fonte: 'ANAC — BDNCP, месечни CIG датасети (CC BY 4.0), здравни възложители',
    nota: 'Годишни национални агрегати със същите правила като appalti.json (HEALTH филтър, дедуп по CIG, валиден importo). Прозорецът на останалата част от сайта остава 2023–2024.',
    rotturaSerie: 'От 01.2024 (D.Lgs 36/2023 + PCP) серията е несравнима: включени микро-покупки, по-висок праг за affidamento diretto, друга семантика на FLAG_URGENZA. Годините с comparabile=false се показват отделно.',
    perAnno,
  });
  console.log('Готово → data/storico.json');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('Грешка:', err);
    process.exitCode = 1;
  });
}
