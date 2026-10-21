import { spawn } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { z } from 'zod';
import type { FormatoVideo } from './formati.js';
import { miniatura } from './foto.js';

/**
 * Клипът: до 1080p (дългата страна до 1920, късата до 1080 — портретът обратно; никога по-голям),
 * до 30 кадъра в секунда, H.264 (CRF 27, таван 4,5 Mbps — 10–20 MB на минута вместо 100–400) и AAC 96k,
 * `faststart` (пуска се, докато се тегли), без метаданни (мястото по GPS, телефонът) — гледа се на всеки
 * телефон и браузър. HDR от iPhone (HLG/PQ) става SDR (tonemap), ако ffmpeg има `zscale`; кадърът от
 * първата секунда е миниатюрата. Входът е само файл (`-protocol_whitelist file`) и само разпознатият
 * контейнер (`-f`) — вграден плейлист не може да накара ffmpeg да чете чужди файлове или адреси.
 */

export const LATO_LUNGO = 1920;
export const LATO_CORTO = 1080;

const DEMUXER: Record<FormatoVideo, string> = {
  mp4: 'mov',
  mov: 'mov',
  '3gp': 'mov',
  webm: 'matroska',
  avi: 'avi',
};

export class Interrotto extends Error {}

/** Кодът на грешката (ключ от речника `allegati.errore.<…>`). */
export class ErroreVideo extends Error {
  constructor(readonly codice: 'illeggibile' | 'senzaVideo' | 'troppoLungo' | 'tempo') {
    super(codice);
  }
}

const probeSchema = z.object({
  streams: z
    .array(
      z
        .object({
          codec_type: z.string().optional(),
          width: z.number().int().nonnegative().optional(),
          height: z.number().int().nonnegative().optional(),
          color_transfer: z.string().optional(),
        })
        .passthrough(),
    )
    .default([]),
  format: z.object({ duration: z.string().optional() }).passthrough().default({}),
});

export interface InfoVideo {
  larghezza: number;
  altezza: number;
  durataMs: number;
  audio: boolean;
  hdr: boolean;
}

/** Изходът на ffprobe (JSON) — външен вход: проверен, само нужното. null — няма видео в него. */
export function leggiProbe(raw: unknown): InfoVideo | null {
  const parsed = probeSchema.safeParse(raw);
  if (!parsed.success) return null;
  const video = parsed.data.streams.find((s) => s.codec_type === 'video' && s.width && s.height);
  if (!video?.width || !video.height) return null;
  const seconds = Number(parsed.data.format.duration);
  return {
    larghezza: video.width,
    altezza: video.height,
    durataMs: Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds * 1000) : 0,
    audio: parsed.data.streams.some((s) => s.codec_type === 'audio'),
    hdr: video.color_transfer === 'arib-std-b67' || video.color_transfer === 'smpte2084',
  };
}

export function argomentiProbe(file: string, formato: FormatoVideo | 'mp4-uscita'): string[] {
  const demuxer = formato === 'mp4-uscita' ? 'mov' : DEMUXER[formato];
  return [
    '-v',
    'error',
    '-protocol_whitelist',
    'file',
    '-f',
    demuxer,
    '-print_format',
    'json',
    '-show_format',
    '-show_streams',
    file,
  ];
}

export function argomentiVideo(
  info: InfoVideo,
  formato: FormatoVideo,
  sorgente: string,
  uscita: string,
  zscale: boolean,
  maxSecondi: number,
): string[] {
  const filtri = [
    `scale=w='if(gte(iw,ih),min(iw,${LATO_LUNGO}),min(iw,${LATO_CORTO}))'` +
      `:h='if(gte(iw,ih),min(ih,${LATO_CORTO}),min(ih,${LATO_LUNGO}))'` +
      ':force_original_aspect_ratio=decrease:force_divisible_by=2',
  ];
  if (info.hdr && zscale) {
    filtri.push(
      'zscale=t=linear:npl=100',
      'format=gbrpf32le',
      'zscale=p=bt709',
      'tonemap=tonemap=hable:desat=0',
      'zscale=t=bt709:m=bt709:r=tv',
    );
  }
  filtri.push('format=yuv420p');
  return [
    '-hide_banner',
    '-nostdin',
    '-v',
    'error',
    '-y',
    '-protocol_whitelist',
    'file',
    '-f',
    DEMUXER[formato],
    '-i',
    sorgente,
    '-map',
    '0:v:0',
    '-map',
    '0:a:0?',
    '-vf',
    filtri.join(','),
    '-fpsmax',
    '30',
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-crf',
    '27',
    '-maxrate',
    '4500k',
    '-bufsize',
    '9000k',
    '-profile:v',
    'high',
    '-c:a',
    'aac',
    '-b:a',
    '96k',
    '-ac',
    '2',
    '-map_metadata',
    '-1',
    '-map_chapters',
    '-1',
    '-sn',
    '-dn',
    '-movflags',
    '+faststart',
    '-threads',
    '2',
    // Таванът и за клип, чийто контейнер не казва дължината си (WebM от браузър, подправен файл).
    '-t',
    String(maxSecondi),
    '-f',
    'mp4',
    uscita,
  ];
}

export interface Strumenti {
  ffmpeg: string;
  ffprobe: string;
  /** ffmpeg с `zscale` (libzimg) — може HDR → SDR. */
  zscale: boolean;
}

/**
 * Пуска инструмента без shell (аргументите никога не са низ за shell), с таван на времето и на
 * изхода. Спиране на процеса (`signal`) → Interrotto; изтекло време → ErroreVideo('tempo').
 */
export function esegui(
  cmd: string,
  args: readonly string[],
  opts: { timeoutMs: number; signal: AbortSignal; maxStdout?: number },
): Promise<Buffer> {
  const max = opts.maxStdout ?? 4 * 1024 * 1024;
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      signal: opts.signal,
      timeout: opts.timeoutMs,
      killSignal: 'SIGKILL',
    });
    const chunks: Buffer[] = [];
    let size = 0;
    child.stdout.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size <= max) chunks.push(chunk);
      else child.kill('SIGKILL');
    });
    child.stderr.resume();
    child.on('error', (error) => {
      reject(opts.signal.aborted ? new Interrotto('спиране') : error);
    });
    child.on('close', (code, signal) => {
      if (opts.signal.aborted) reject(new Interrotto('спиране'));
      else if (code === 0 && size <= max) resolve(Buffer.concat(chunks));
      else if (signal === 'SIGKILL' && size <= max) reject(new ErroreVideo('tempo'));
      else reject(new ErroreVideo('illeggibile'));
    });
  });
}

async function probe(
  strumenti: Strumenti,
  file: string,
  formato: FormatoVideo | 'mp4-uscita',
  signal: AbortSignal,
): Promise<InfoVideo> {
  const out = await esegui(strumenti.ffprobe, argomentiProbe(file, formato), {
    timeoutMs: 60_000,
    signal,
  });
  let json: unknown;
  try {
    json = JSON.parse(out.toString('utf8'));
  } catch {
    throw new ErroreVideo('illeggibile');
  }
  const info = leggiProbe(json);
  if (!info) throw new ErroreVideo('senzaVideo');
  return info;
}

export interface EsitoVideo {
  byte: number;
  larghezza: number;
  altezza: number;
  durataMs: number;
}

export async function comprimiVideo(
  strumenti: Strumenti,
  sorgente: string,
  formato: FormatoVideo,
  file: string,
  mini: string,
  opts: { maxMinuti: number; signal: AbortSignal },
): Promise<EsitoVideo> {
  const info = await probe(strumenti, sorgente, formato, opts.signal);
  const maxMs = opts.maxMinuti * 60_000;
  if (info.durataMs > maxMs) throw new ErroreVideo('troppoLungo');
  // На едно ядро 1080p „medium“ върви около половин реално време: времето е с голям запас. Без
  // дължина в контейнера — колкото за най-дългия позволен клип (ffmpeg спира там, `-t`).
  const timeoutMs = 10 * 60_000 + (info.durataMs || maxMs) * 8;
  await esegui(
    strumenti.ffmpeg,
    argomentiVideo(info, formato, sorgente, file, strumenti.zscale, maxMs / 1000),
    { timeoutMs, signal: opts.signal },
  );
  const out = await probe(strumenti, file, 'mp4-uscita', opts.signal);
  const at = Math.min(1, out.durataMs / 3000).toFixed(2);
  const frame = await esegui(
    strumenti.ffmpeg,
    [
      '-hide_banner',
      '-nostdin',
      '-v',
      'error',
      '-protocol_whitelist',
      'file,pipe',
      '-ss',
      at,
      '-f',
      'mov',
      '-i',
      file,
      '-frames:v',
      '1',
      '-f',
      'image2pipe',
      '-c:v',
      'png',
      'pipe:1',
    ],
    { timeoutMs: 120_000, signal: opts.signal, maxStdout: 64 * 1024 * 1024 },
  );
  await miniatura(frame, mini);
  const { size } = await stat(file);
  return { byte: size, larghezza: out.larghezza, altezza: out.altezza, durataMs: out.durataMs };
}
