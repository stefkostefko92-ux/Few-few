// Shared by the integration tests of photos and videos: a sheet, an upload as the browser sends it, the
// worker run in the test process until the queue is empty.
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { Browser, type UploadFile } from './harness.js';

// After the harness: the queue reads the media settings it puts in place.
const { elabora, prendiProssimo, verificaStrumenti } = await import('../../src/allegati/coda.js');
export { verificaStrumenti };

export const XP = { 'x-partial': '1' };
export const media = () => process.env.MEDIA_DIR!;
export const folder = (id: string) => join(media(), 'schede', id);

export const photo = async (
  name = 'quadro.jpg',
  width = 640,
  height = 480,
): Promise<UploadFile> => ({
  field: 'file',
  name,
  type: 'image/jpeg',
  bytes: await sharp({ create: { width, height, channels: 3, background: '#3060a0' } })
    .withExif({ IFD0: { Make: 'TestPhone', Model: 'Model 9' } })
    .jpeg()
    .toBuffer(),
});

export async function newScheda(browser: Browser): Promise<string> {
  const reply = await browser.submit('/schede/nuova', '/schede', {
    data: '2026-10-21',
    indirizzo: 'Via Roma 1, Milano',
    matricola: '0012345',
  });
  assert.equal(reply.status, 303, `create failed with ${reply.status}`);
  return /^\/schede\/([a-z0-9]+)$/.exec(reply.location)![1]!;
}

export function upload(
  browser: Browser,
  id: string,
  sezione: string,
  files: UploadFile | UploadFile[],
  headers: Record<string, string> = XP,
) {
  return browser.upload(
    `/schede/${id}`,
    `/schede/${id}/allegati`,
    { sezione, ritorno: 'scheda' },
    files,
    headers,
  );
}

export interface Answer {
  html: string;
  avvisi: string[];
  ok: string | null;
}
export const answer = (body: string) => JSON.parse(body) as Answer;

/** What a refused upload left in `arrivi/` goes when the response closes — a moment later. */
export async function arriviEmpty(): Promise<void> {
  let left: string[] = [];
  for (let i = 0; i < 40; i += 1) {
    left = await readdir(join(media(), 'arrivi'));
    if (left.length === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.deepEqual(left, [], 'nothing left behind in arrivi/');
}

/** The worker, until the queue is empty (photos need no ffmpeg). */
export async function processAll(
  strumenti = { ffmpeg: 'ffmpeg', ffprobe: 'ffprobe', zscale: false },
): Promise<string[]> {
  const done: string[] = [];
  for (let lavoro = await prendiProssimo(); lavoro; lavoro = await prendiProssimo()) {
    done.push(await elabora(lavoro, strumenti, new AbortController().signal));
  }
  return done;
}
