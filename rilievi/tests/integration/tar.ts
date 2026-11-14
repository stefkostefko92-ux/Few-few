// Reading the company export (a ustar file) in the tests, as GNU tar writes and reads it.
import assert from 'node:assert/strict';

/** The entries of a tar file: name → bytes (ustar, as GNU tar writes and reads it). */
export function readTar(bytes: Buffer): Map<string, Buffer> {
  const entries = new Map<string, Buffer>();
  for (let at = 0; at + 512 <= bytes.length;) {
    const head = bytes.subarray(at, at + 512);
    if (head.every((b) => b === 0)) break;
    const text = (from: number, to: number) =>
      head.subarray(from, to).toString('utf8').replace(/\0.*$/s, '');
    const name = [text(345, 500), text(0, 100)].filter(Boolean).join('/');
    const size = parseInt(text(124, 136).trim(), 8);
    let sum = 0;
    for (let i = 0; i < 512; i += 1) sum += i >= 148 && i < 156 ? 32 : head[i]!;
    assert.equal(parseInt(text(148, 156).trim(), 8), sum, `checksum of ${name}`);
    entries.set(name, bytes.subarray(at + 512, at + 512 + size));
    at += 512 + Math.ceil(size / 512) * 512;
  }
  return entries;
}
