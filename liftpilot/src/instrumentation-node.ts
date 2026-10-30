// The start checks of the Node server (src/instrumentation.ts), not of the build: the survey sheets' PDFs need DejaVu
// Sans in REPORT_FONT_DIR, and the suppliers' blank modules in assets/moduli must be exactly the versions their maps are
// pinned to (SHA-256). rilievi checked both before listening (its src/index.ts); a missing font or another version of a
// module stops the start here instead of turning the first download into a 500.
import { envSchema } from './lib/env-schema';
import { assertModuli } from './server/rilievi/moduli-pdf';
import { assertPdfFonts } from './server/rilievi/pdf';

export function startChecks(): void {
  if (process.env.NEXT_PHASE === 'phase-production-build') return;
  // only this variable is read here (the rest of the configuration is validated where it is used)
  assertPdfFonts(envSchema.shape.REPORT_FONT_DIR.parse(process.env.REPORT_FONT_DIR));
  assertModuli();
}
