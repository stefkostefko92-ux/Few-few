// A drawing set for the tests of the SVG files (svg.test.ts, svg-files.test.ts, svg-tz-child.ts): the new lift of the
// form, a project whose name and company need escaping, the company's logo. Not a test itself.
import { readFileSync } from 'node:fs';
import { deriveLift, newLift } from '../lift';
import { valueMarks } from '../lift/marks';
import { storedInput } from '../tavole/compose';
import type { TavoleInput } from '../tavole/input';

export const SAMPLE_AT = new Date('2026-10-08T10:00:00Z');

export function svgSample(at = SAMPLE_AT): TavoleInput {
  const L = newLift(), d = deriveLift(L);
  const project = { name: 'Rossi & C. <prova> "A"', address: 'Via Roma 1', city: 'Monza', province: 'MB', plantNumber: 'MB 1', client: 'Condominio Àèìòù & Figli' };
  const logo = { mime: 'image/png' as const, data: new Uint8Array(readFileSync('public/img/liftpilot-logo-480.png')) };
  const x = storedInput(d.values, d.layout, { number: '26-037', createdAt: at, authorInitials: 'M.R.', companyName: 'Ascensori <Rossi> & C.', projectData: project, plant: {}, revisions: [] }, logo, valueMarks(L.auto, d, d.bottom, d.collaudo));
  if (!x) throw new Error('the sample set has no input');
  return x;
}
