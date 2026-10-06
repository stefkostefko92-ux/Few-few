// The documents of the landing page, as the software makes them: the drawing set and the relazione di calcolo of the
// sample installation of the landing's floors (a new lift in the shaft of 1600 × 1750 mm of the landing's drawings,
// with the machine the software proposes; src/components/landing/example.ts), drawn by the renderers of report/ and
// turned into WebP pictures of a few pages for public/img/lp-doc-*.webp, with their sizes in
// src/components/landing/docs.ts. The data are the software's sample, not a customer's. Needs python3 with ReportLab,
// PyMuPDF and Pillow, and the DejaVu fonts (REPORT_FONT_DIR).
// Run after a change of the documents: npx tsx --conditions=react-server scripts/landing-docs.ts [<folder for the PDFs>]
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ENGINE_VERSION, snapshotOf } from '../src/calc/snapshot';
import { snapshotHash } from '../src/lib/snapshot-hash';
import { shaftHash } from '../src/lib/shaft-hash';
import { PROFILO } from '../src/calc/norme';
import { SHAFT_ENGINE_VERSION, shaftSnapshot } from '../src/shaft';
import { buildTavole } from '../src/lib/tavole/build';
import { buildReport } from '../src/lib/report/build';
import { deriveLift, newLift, valueMarks } from '../src/lib/lift';

const root = path.resolve(new URL('..', import.meta.url).pathname), out = process.argv[2] ?? mkdtempSync(path.join(tmpdir(), 'lp-docs-'));
const fonts = process.env.REPORT_FONT_DIR ?? '/usr/share/fonts/truetype/dejavu';
const when = new Date('2026-10-06T09:00:00Z');
const inputs = newLift(), d = deriveLift(inputs), values = d.values, L = d.layout, shaft = shaftSnapshot(d.shaft);
// the fingerprints the records of these data would have, as the server computes them (src/server/save.ts)
const calcSha = snapshotHash(snapshotOf(values)), shaftSha = shaftHash(shaft.snapshot);
const project = { name: 'Impianto di esempio', address: 'Via Roma 12', city: 'Milano', province: 'MI', plantNumber: 'MI 1/98', client: 'Condominio di esempio' };

const set = buildTavole({
  values, layout: L, plant: { governorLoad: 300, safetyGear: 'progressive' }, marks: valueMarks(inputs.auto, d, d.bottom, d.collaudo), project,
  company: { name: 'Ditta di esempio', logo: null }, set: { number: '26-001', issuedAt: when, author: 'LP', revisions: [] },
});
const report = buildReport({
  calc: { id: 'esempio', label: 'impianto di esempio', createdAt: when, sha256: calcSha, engineVersion: ENGINE_VERSION, profileId: PROFILO.id, author: null },
  project, company: 'Ditta di esempio', reviews: [], values, generatedAt: when,
  design: { id: 'esempio', label: null, createdAt: when, sha256: shaftSha, engineVersion: SHAFT_ENGINE_VERSION, profileId: PROFILO.id, author: null,
    layout: shaft.layout, source: null },
});

const render = (script: string, doc: unknown, pdf: string): void => {
  const r = spawnSync('python3', [path.join(root, 'report', script)], { input: JSON.stringify(doc), env: { ...process.env, REPORT_FONT_DIR: fonts }, maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error(`${script}: ${r.stderr.toString().slice(0, 400)}`);
  writeFileSync(pdf, r.stdout);
};
const tavole = path.join(out, 'tavole.pdf'), relazione = path.join(out, 'relazione.pdf');
render('tavole.py', set.doc, tavole);
render('relazione.py', report, relazione);

// the pages shown: sheet 1 (the data of the installation, the loads, the notes and the title block) and the machine
// room's plan of the set; the first page of the relazione and the one with the checks of the shaft
const sheet = (title: string): number => set.sheets.findIndex((x) => x.title === title);
const PAGES: readonly (readonly [string, string, number])[] = [
  ['lp-doc-tavola', tavole, sheet('DATI DELL’IMPIANTO')],
  ['lp-doc-locale', tavole, sheet('VISTA IN PIANTA DEL LOCALE MACCHINA')],
  ['lp-doc-relazione', relazione, 0],
  ['lp-doc-verifiche', relazione, 3],
];
if (PAGES.some(([, , i]) => i < 0)) throw new Error('a sheet of the landing is missing from the set');
const WIDTH = 820;
const py = `
import json, sys, pymupdf
from PIL import Image
for name, pdf, index in json.loads(sys.argv[1]):
    doc = pymupdf.open(pdf)
    page = doc[index]
    z = ${WIDTH} / page.rect.width
    pix = page.get_pixmap(matrix=pymupdf.Matrix(z, z), alpha=False)
    img = Image.frombytes('RGB', (pix.width, pix.height), pix.samples)
    img.save(sys.argv[2] + '/' + name + '.webp', 'WEBP', quality=80, method=6)
    print(name, img.width, img.height, len(doc))
`;
const r = spawnSync('python3', ['-I', '-c', py, JSON.stringify(PAGES), path.join(root, 'public', 'img')], { encoding: 'utf8' });
if (r.status !== 0) throw new Error(r.stderr.slice(0, 400));
// each picture's size and where its page stands: number, of how many, and the sheet's scale for the drawing set
const sizes = r.stdout.trim().split('\n').map((l) => l.split(' ')).map(([name, w, h, of]) => {
  const index = PAGES.find(([n]) => n === name)?.[2] ?? 0, scale = PAGES.find(([n]) => n === name)?.[1] === tavole ? set.sheets[index]?.scale ?? null : null;
  return `  '${name}': { w: ${w}, h: ${h}, args: { n: ${index + 1}, of: ${of}${scale ? `, scale: ${scale}` : ''} } },`;
});
writeFileSync(path.join(root, 'src', 'components', 'landing', 'docs.ts'), [
  '// Generated by scripts/landing-docs.ts: the size [px] of each page of the sample documents on the landing page, its',
  '// number among the pages of its document and, for a sheet of the drawing set, its scale.',
  'export const LANDING_DOCS = {', ...sizes, '} as const;', '',
].join('\n'));
console.log(r.stdout.trim());
