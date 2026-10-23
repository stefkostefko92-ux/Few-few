import 'server-only';
// The font files of the SVG drawings: DejaVu Sans, regular and bold, from the font directory of the reports
// (REPORT_FONT_DIR, the same files as report/fonts.py and rilievi/pdf.ts, checked at the server's start:
// instrumentation-node.ts), read once and kept (about 1,4 MB); a failed read is not kept, the next download tries again.
// Only this variable is read here, as the start check does.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { DejaVu } from '@/lib/cad/svg-files';
import { envSchema } from '@/lib/env-schema';

let loading: Promise<DejaVu> | null = null;

export function dejaVu(): Promise<DejaVu> {
  if (!loading) {
    const dir = envSchema.shape.REPORT_FONT_DIR.parse(process.env.REPORT_FONT_DIR);
    loading = Promise.all([readFile(join(dir, 'DejaVuSans.ttf')), readFile(join(dir, 'DejaVuSans-Bold.ttf'))])
      .then(([regular, bold]) => ({ regular: new Uint8Array(regular), bold: new Uint8Array(bold) }));
    loading.catch(() => { loading = null; });
  }
  return loading;
}
