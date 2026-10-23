// Run by svg-files.test.ts in a child process under another time zone (TZ): the SHA-256 of a shaft plan's SVG and, for
// each instant on the command line (ISO), of a drawing set's pages in SVG dated there (the ZIP), as JSON on stdout.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PALETTE, concreteTile } from '@/drawing';
import { defaultInputs, layout } from '@/shaft';
import { shaftPlanView } from '../cad/export';
import { docSvgFile, viewSvgFile } from '../cad/svg-files';
import { buildTavole } from '../tavole/build';
import { svgSample } from './svg-fixture';

const dir = process.env.REPORT_FONT_DIR ?? '/usr/share/fonts/truetype/dejavu';
const fonts = { regular: new Uint8Array(readFileSync(`${dir}/DejaVuSans.ttf`)), bold: new Uint8Array(readFileSync(`${dir}/DejaVuSans-Bold.ttf`)) };
const sha = (b: Uint8Array): string => createHash('sha256').update(b).digest('hex');
const art = { palette: PALETTE, patterns: { concrete: concreteTile() }, images: {} };
const plan = await viewSvgFile(shaftPlanView(layout(defaultInputs(1600, 1750)), 'Vano'), art, { name: 'vano.svg', under: [], fonts });
const out = [sha(plan.body)];
for (const iso of process.argv.slice(2)) {
  const at = new Date(iso), set = await docSvgFile(buildTavole(svgSample(at)).doc, { base: 'tavole-26-037', desc: ['Prova'], date: at, fonts });
  out.push(sha(set.body));
}
process.stdout.write(JSON.stringify(out));
