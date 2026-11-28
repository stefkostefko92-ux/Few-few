import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { errorMessage, logger } from '../logger.js';
import { MODULI_TUTTI } from '../ordini/moduli.js';
import { apriModulo, CHIAVE_MODULI, sigillaModulo } from '../ordini/moduli-sigillo.js';

/**
 * `MODULI_KEY=… npm run moduli:sigilla` — незашифрованите PDF-и в assets/moduli/ (само на машината на
 * собственика или на разработчика, не в git) → assets/moduli/sigillati/<файл>.enc. Всеки PDF се проверява по
 * SHA-256 на картата си ПРЕДИ шифроването и се отваря обратно след него. Пише само променените: модул, чийто
 * шифрован файл вече се отваря до същите байтове, не се пипа (иначе всеки пробег би сменил всички файлове —
 * нов nonce).
 */
const ASSETS = new URL('../../assets/moduli/', import.meta.url);

function main(): void {
  const chiave = process.env.MODULI_KEY?.trim() ?? '';
  if (!CHIAVE_MODULI.test(chiave))
    throw new Error('MODULI_KEY трябва да е 64 hex знака (32 байта)');
  mkdirSync(new URL('sigillati/', ASSETS), { recursive: true });
  let scritti = 0;
  for (const modulo of MODULI_TUTTI) {
    const pdf = readFileSync(new URL(modulo.file, ASSETS));
    const sha = createHash('sha256').update(pdf).digest('hex');
    if (sha !== modulo.sha256)
      throw new Error(`${modulo.file}: SHA-256 ${sha} не е този на картата`);
    const dest = new URL(`sigillati/${modulo.file}.enc`, ASSETS);
    try {
      if (apriModulo(readFileSync(dest), chiave, modulo.file).equals(pdf)) continue;
    } catch {
      // Няма го или е с друг ключ — шифрова се наново.
    }
    const sigillato = sigillaModulo(pdf, chiave, modulo.file);
    if (!apriModulo(sigillato, chiave, modulo.file).equals(pdf))
      throw new Error(`${modulo.file}: шифрованият файл не се отваря обратно`);
    writeFileSync(dest, sigillato);
    scritti += 1;
  }
  logger.info({ moduli: MODULI_TUTTI.length, scritti }, 'модулите са шифровани');
}

try {
  main();
} catch (error) {
  logger.error({ err: errorMessage(error) }, 'модулите не са шифровани');
  process.exitCode = 1;
}
