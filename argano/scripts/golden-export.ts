// Regenerates src/calc/__tests__/fixtures/golden-v12.json from this engine, on the same cases, after an INTENDED
// change of the results (a formula or a constant confirmed on the standard). Say in the commit why the results
// changed. Run: npx tsx scripts/golden-export.ts "<motivo>"
import { readFileSync, writeFileSync } from 'node:fs';
import { runCase, sha256 } from '../src/calc/__tests__/project';
import type { FormValues } from '../src/calc/index';

const file = new URL('../src/calc/__tests__/fixtures/golden-v12.json', import.meta.url);
const reason = process.argv[2];
if (!reason) throw new Error('indicare il motivo della rigenerazione');
const doc = JSON.parse(readFileSync(file, 'utf8')) as { cases: { name: string; V: FormValues; sizing?: unknown }[] };
const cases = doc.cases.map((c, idx) => {
  const out: Record<string, unknown> = runCase(c.V, c.sizing !== undefined);
  if (idx >= 3) for (const [key, v] of Object.entries(out)) out[key] = { sha256: sha256(v as never) };
  return { name: c.name, V: c.V, ...out };
});
writeFileSync(file, JSON.stringify({ source: `argano engine — ${reason}`, generated: new Date().toISOString().slice(0, 10), cases }));
process.stdout.write(`golden: ${cases.length} casi rigenerati\n`);
