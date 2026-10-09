import { connect } from 'node:net';

/**
 * Антивирус ПРЕДИ всичко друго (§7.3 т. 1, §15): докато файлът не е CLEAN, не се показва, не се
 * сваля и не стига до AI. Клиентът говори с clamd по протокола INSTREAM през TCP — без външна
 * зависимост, само `node:net`. Всяка неяснота (таймаут, отказ, непознат отговор) е FAILED, не CLEAN.
 */

export type ScanVerdict =
  | { status: 'CLEAN' }
  | { status: 'INFECTED'; signature: string }
  | { status: 'FAILED'; reason: ScanFailure };

export type ScanFailure = 'connect' | 'timeout' | 'clamd_error' | 'bad_response';

export interface Scanner {
  scan(bytes: Uint8Array): Promise<ScanVerdict>;
}

export interface ClamdOptions {
  host: string;
  port: number;
  /** Общ краен срок за едно сканиране (връзка + поток + отговор). */
  timeoutMs: number;
  /** Размер на парче в потока (clamd приема до StreamMaxLength общо). */
  chunkBytes?: number;
}

/** Отговорът на clamd е кратък ред — по-дълъг е повреден или чужд. */
const MAX_REPLY_BYTES = 1024;

/** Разчита реда на clamd: „stream: OK“, „stream: <сигнатура> FOUND“, „… ERROR“. */
export function parseClamdReply(raw: string): ScanVerdict {
  const line = raw.replace(/\0+$/, '').trim();
  if (/^stream: OK$/.test(line)) return { status: 'CLEAN' };
  const found = /^stream: (.+) FOUND$/.exec(line);
  if (found?.[1]) return { status: 'INFECTED', signature: found[1].slice(0, 120) };
  if (/ERROR$/.test(line)) return { status: 'FAILED', reason: 'clamd_error' };
  return { status: 'FAILED', reason: 'bad_response' };
}

/** Рамката на INSTREAM: 4 байта дължина (big-endian) + данните; нулева дължина = край. */
function frame(chunk: Uint8Array): Buffer {
  const head = Buffer.alloc(4);
  head.writeUInt32BE(chunk.byteLength, 0);
  return Buffer.concat([head, chunk]);
}

export class ClamdScanner implements Scanner {
  constructor(private readonly opts: ClamdOptions) {}

  scan(bytes: Uint8Array): Promise<ScanVerdict> {
    const chunkBytes = Math.max(1024, this.opts.chunkBytes ?? 64 * 1024);
    return new Promise<ScanVerdict>((resolve) => {
      let settled = false;
      const replies: Buffer[] = [];
      let replyBytes = 0;

      const finish = (verdict: ScanVerdict) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        sock.destroy();
        resolve(verdict);
      };
      const timer = setTimeout(
        () => finish({ status: 'FAILED', reason: 'timeout' }),
        this.opts.timeoutMs,
      );

      const sock = connect({ host: this.opts.host, port: this.opts.port });
      let connected = false;

      const fromReply = (): ScanVerdict =>
        replyBytes > 0
          ? parseClamdReply(Buffer.concat(replies).toString('utf8'))
          : { status: 'FAILED', reason: 'bad_response' };

      sock.on('error', () =>
        finish({ status: 'FAILED', reason: connected ? 'bad_response' : 'connect' }),
      );
      sock.on('data', (data: Buffer) => {
        replies.push(data);
        replyBytes += data.length;
        if (replyBytes > MAX_REPLY_BYTES) {
          finish({ status: 'FAILED', reason: 'bad_response' });
          return;
        }
        // clamd завършва отговора с NUL (режим „z“).
        if (data.includes(0)) finish(fromReply());
      });
      sock.on('end', () => finish(fromReply()));
      sock.on('close', () => finish(fromReply()));
      sock.on('connect', () => {
        connected = true;
        void (async () => {
          // Уважава обратния натиск: при пълен буфер чака „drain“ (или затваряне).
          const write = (buf: Buffer) =>
            new Promise<void>((done) => {
              if (settled || sock.write(buf)) return done();
              const go = () => {
                sock.off('drain', go);
                sock.off('close', go);
                done();
              };
              sock.on('drain', go);
              sock.on('close', go);
            });
          await write(Buffer.from('zINSTREAM\0', 'latin1'));
          for (let i = 0; i < bytes.byteLength && !settled; i += chunkBytes) {
            await write(frame(bytes.subarray(i, i + chunkBytes)));
          }
          await write(Buffer.alloc(4));
        })();
      });
    });
  }
}
