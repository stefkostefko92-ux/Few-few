import 'server-only';
// An uploaded file put through what the fascicolo will do with it (report/pdf-tool.mjs inspect, in a child process of
// the renderers' slots, src/lib/report/pdf-tool.ts): its pages, or why the product refuses it, in the words of the
// answers (errors.*). The tool's own reason goes to the log with the ids only, never the file's name or content.
import { log } from '@/lib/log';
import { inspectFile } from '@/lib/report/pdf-tool';
import type { AllegatoType } from '@/lib/allegati/limits';

export type InspectError = 'pdfProtected' | 'pdfForm' | 'fileInvalid';
export type Inspected = { ok: true; pages: number } | { ok: false; error: InspectError };

const ERROR = { encrypted: 'pdfProtected', xfa: 'pdfForm', form: 'pdfForm', pages: 'fileInvalid', pageSize: 'fileInvalid', invalid: 'fileInvalid' } as const;

/** The pages the file adds to a fascicolo (1 for a picture), or the refusal. RendererBusy is thrown (503). */
export async function inspectUpload(data: Uint8Array, type: AllegatoType, ctx: { companyId: string; projectId: string }): Promise<Inspected> {
  const r = await inspectFile(data, type);
  if (r.ok) return type === 'pdf' ? r : { ok: true, pages: 1 };
  log.info({ companyId: ctx.companyId, projectId: ctx.projectId, type, reason: r.reason, detail: r.detail }, 'attachment refused by the pdf tool');
  return { ok: false, error: ERROR[r.reason] };
}
