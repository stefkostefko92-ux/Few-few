// Regenerates src/lib/__tests__/fixtures/rt/golden.json — the golden of the relazione tecnica di modifica — from the RT
// engine, on the four fixtures (fixtures/rt/scenari.ts), after an INTENDED change of its results: bump RT_ENGINE_VERSION
// (src/lib/rt/version.ts) and pin it again in rt-version.test.ts, and say in the commit why the results changed.
// Run: npx tsx scripts/rt-golden-export.ts "<motivo>"
import { writeFileSync } from 'node:fs';
import { SCENARI } from '../src/lib/__tests__/fixtures/rt/scenari';
import { resultsSha, riassunto } from '../src/lib/__tests__/fixtures/rt/riassunto';
import { deriveRt } from '../src/lib/rt/derive';
import { RT_ENGINE_VERSION } from '../src/lib/rt/version';

const file = new URL('../src/lib/__tests__/fixtures/rt/golden.json', import.meta.url);
const reason = process.argv[2];
if (!reason) throw new Error('indicare il motivo della rigenerazione');
const cases = SCENARI.map((f) => {
  const s = f(), d = deriveRt(s.base, s.inputs, s.anagrafica, s.plant, s.allegati);
  return { nome: s.nome, resultsSha: resultsSha(d), riassunto: riassunto(d) };
});
// one case per line: a regeneration's diff shows which cases changed
const head = JSON.stringify({ source: `liftpilot RT ${RT_ENGINE_VERSION} — ${reason}`, generated: new Date().toISOString().slice(0, 10), engine: RT_ENGINE_VERSION }).slice(0, -1);
writeFileSync(file, `${head},"cases":[\n${cases.map((c) => JSON.stringify(c)).join(',\n')}\n]}\n`);
process.stdout.write(`golden RT: ${cases.length} casi rigenerati\n`);
