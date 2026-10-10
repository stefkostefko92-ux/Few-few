// Run by cad-files.test.ts in a child process under another time zone (TZ): for each instant on the command line (ISO),
// the SHA-256 of a DXF and of a DWG dated there, and the DXF's local and universal creation dates, as JSON on stdout.
import { createHash } from 'node:crypto';
import { defaultInputs, layout, planEntities } from '@/shaft';
import { toDwg, toDxf, type CadView } from '../cad/export';

const L = layout(defaultInputs(1600, 1750)), views: CadView[] = [{ title: 'Vano', scale: 20, entities: planEntities(L, 'main', 0) }];
const sha = (b: string | Uint8Array): string => createHash('sha256').update(b).digest('hex');
/** The value of a DXF header variable (the line after its group code). */
const header = (dxf: string, name: string): string => {
  const lines = dxf.split('\n').map((s) => s.trim());
  return lines[lines.indexOf(name) + 2] ?? '';
};
const out = process.argv.slice(2).map((iso) => {
  const at = new Date(iso), dxf = toDxf(views, 'Prova', at);
  return { at: iso, dxf: sha(dxf), dwg: sha(toDwg(views, 'Prova', at)), local: header(dxf, '$TDCREATE'), universal: header(dxf, '$TDUCREATE') };
});
process.stdout.write(JSON.stringify(out));
