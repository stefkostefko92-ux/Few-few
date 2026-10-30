import 'server-only';
// A HEIC/HEIF upload (round 50: an iPhone's photo of a hand-drawn sketch, any picture kind) turned into the JPEG the
// product keeps: recognised and measured from its boxes before anything decodes it (src/lib/allegati/heic.ts: at most
// 40 megapixels and 12 000 px a side, at most four top-level images), its primary image converted by heif-convert in a
// child process (src/lib/report/image-tool.ts), then handed back to the upload, which strips the JPEG's metadata
// (prepareFile) like any other — libheif has already turned it upright, so it is stored without an orientation. The
// tool's own reason goes to the log with the ids only, never the file's name or content.
import { log } from '@/lib/log';
import { sniffHeic } from '@/lib/allegati/heic';
import { MAX_FILE_BYTES } from '@/lib/allegati/limits';
import { heicToJpeg } from '@/lib/report/image-tool';
import { RendererBusy } from '@/lib/report/render';

export type HeicUpload =
  | { heic: false }
  | { heic: true; ok: true; data: Uint8Array<ArrayBuffer> }
  | { heic: true; ok: false; error: 'fileInvalid' | 'fileTooLarge' | 'rendererBusy' };

/** Not a HEIF file: { heic: false }, the bytes go on as they are. A HEIF file: its primary image as a JPEG, or why not. */
export async function fromHeic(bytes: Uint8Array, ctx: { companyId: string; projectId: string }): Promise<HeicUpload> {
  const info = sniffHeic(bytes);
  if (!info) return { heic: false };
  if (!info.ok) {
    log.info({ companyId: ctx.companyId, projectId: ctx.projectId, reason: info.reason }, 'heic refused by its boxes');
    return { heic: true, ok: false, error: 'fileInvalid' };
  }
  let jpeg: Buffer;
  try {
    jpeg = await heicToJpeg(bytes, info);
  } catch (e) {
    if (e instanceof RendererBusy) return { heic: true, ok: false, error: 'rendererBusy' };
    log.info({ companyId: ctx.companyId, projectId: ctx.projectId, detail: e instanceof Error ? e.message.slice(0, 200) : 'heif-convert failed' }, 'heic conversion failed');
    return { heic: true, ok: false, error: 'fileInvalid' };
  }
  if (jpeg.length > MAX_FILE_BYTES) return { heic: true, ok: false, error: 'fileTooLarge' };
  return { heic: true, ok: true, data: new Uint8Array(jpeg) };
}
