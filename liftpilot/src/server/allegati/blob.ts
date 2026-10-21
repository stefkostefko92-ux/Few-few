import 'server-only';
// The bytes of an uploaded file read a slice at a time (the company's export does the same, company-export.ts): the
// server holds one slice, never a whole file (20 MiB) nor the database driver's copies of it — for the download of a file
// and for the files a fascicolo appends. Every caller has checked the file is of the user's company.
import { prisma } from '@/lib/db';

/** The bytes read per query: 3 MiB. */
export const BLOB_SLICE = 3 * 1024 * 1024;

/** One slice of a file's bytes from `at` (0-based), empty past its end. */
async function slice(attachmentId: string, at: number): Promise<Buffer> {
  const rows = await prisma.$queryRaw<{ part: Uint8Array | null }[]>`
    SELECT substring(data FROM ${at + 1}::int FOR ${BLOB_SLICE}::int) AS part FROM "AttachmentBlob" WHERE "attachmentId" = ${attachmentId}`;
  const part = rows[0]?.part;
  return part ? Buffer.from(part.buffer, part.byteOffset, part.byteLength) : Buffer.alloc(0);
}

/** A file's `size` bytes, slice by slice; a file whose bytes end before `size` (gone meanwhile) throws. */
export async function* blobSlices(attachmentId: string, size: number): AsyncGenerator<Buffer> {
  for (let at = 0; at < size;) {
    const part = await slice(attachmentId, at);
    if (!part.length) throw new Error(`attachment ${attachmentId}: bytes gone`);
    at += part.length;
    yield part;
  }
}

/** The first `n` bytes of a file (a PNG's header and chunks before its image data). */
export async function blobHead(attachmentId: string, n: number): Promise<Buffer> {
  const rows = await prisma.$queryRaw<{ part: Uint8Array | null }[]>`
    SELECT substring(data FROM 1 FOR ${n}::int) AS part FROM "AttachmentBlob" WHERE "attachmentId" = ${attachmentId}`;
  const part = rows[0]?.part;
  return part ? Buffer.from(part.buffer, part.byteOffset, part.byteLength) : Buffer.alloc(0);
}

/** A file's bytes as a web stream for a response: one slice per pull; `done` runs once when it ends, fails or is
 *  cancelled (the download's in-flight count). */
export function blobStream(attachmentId: string, size: number, done: () => void): ReadableStream<Uint8Array> {
  const it = blobSlices(attachmentId, size);
  let ended = false;
  const end = (): void => { if (!ended) { ended = true; done(); } };
  return new ReadableStream<Uint8Array>({
    async pull(c) {
      try {
        const r = await it.next();
        if (r.done) { end(); c.close(); } else c.enqueue(new Uint8Array(r.value.buffer, r.value.byteOffset, r.value.byteLength));
      } catch (e) {
        end();
        c.error(e);
      }
    },
    async cancel() {
      end();
      await it.return(undefined);
    },
  });
}
