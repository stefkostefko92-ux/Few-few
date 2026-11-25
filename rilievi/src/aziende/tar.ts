/**
 * Архив tar (ustar, POSIX 1003.1-1988) — без зависимост: износът на фирмата (esportazione.ts) е един файл,
 * който се отваря навсякъде (tar, 7-Zip, Архив на Windows и Mac). Имената са само от id-та и латиница
 * (`/`, букви, цифри, `-`, `.`), до 255 знака: над 100 — частта преди последната `/` отива в `prefix`.
 */

const BLOCK = 512;

function octal(value: number, width: number): string {
  return value.toString(8).padStart(width - 1, '0') + '\0';
}

function split(path: string): { name: string; prefix: string } {
  if (!/^[A-Za-z0-9._/-]+$/.test(path)) throw new Error(`име в архива: ${path}`);
  if (path.length <= 100) return { name: path, prefix: '' };
  const cut = path.lastIndexOf('/', 155);
  if (cut <= 0 || path.length - cut - 1 > 100) throw new Error(`твърде дълго име: ${path}`);
  return { name: path.slice(cut + 1), prefix: path.slice(0, cut) };
}

/** Главата (512 байта) на обикновен файл с размер `size`. */
export function intestazioneTar(path: string, size: number, mtime: Date): Buffer {
  const { name, prefix } = split(path);
  const head = Buffer.alloc(BLOCK, 0);
  head.write(name, 0, 100, 'utf8');
  head.write(octal(0o644, 8), 100, 8, 'ascii');
  head.write(octal(0, 8), 108, 8, 'ascii');
  head.write(octal(0, 8), 116, 8, 'ascii');
  head.write(octal(size, 12), 124, 12, 'ascii');
  head.write(octal(Math.floor(mtime.getTime() / 1000), 12), 136, 12, 'ascii');
  head.fill(0x20, 148, 156);
  head.write('0', 156, 1, 'ascii');
  head.write('ustar\0', 257, 6, 'ascii');
  head.write('00', 263, 2, 'ascii');
  head.write(prefix, 345, 155, 'utf8');
  let sum = 0;
  for (const byte of head) sum += byte;
  head.write(octal(sum, 7) + ' ', 148, 8, 'ascii');
  return head;
}

/** Нулите след съдържанието до цял блок. */
export const riempimentoTar = (size: number): Buffer =>
  Buffer.alloc((BLOCK - (size % BLOCK)) % BLOCK);

/** Краят на архива — два празни блока. */
export const fineTar = (): Buffer => Buffer.alloc(BLOCK * 2);
