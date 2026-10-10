import assert from 'node:assert/strict';
import { createServer, type Server, type Socket } from 'node:net';
import type { AddressInfo } from 'node:net';
import { after, describe, test } from 'node:test';
import { ClamdScanner, parseClamdReply } from '../src/storage/antivirus.js';
import { EICAR } from './file-fixtures.js';

/**
 * Клиентът за clamd срещу фалшив TCP сървър в теста: проверява рамкирането на INSTREAM
 * („zINSTREAM\0“, 4 байта big-endian дължина + парче, нулева дължина = край) и че всяка
 * неяснота (отказ, таймаут, грешка, непознат отговор) е FAILED, никога CLEAN.
 */

type Reply = (received: Buffer) => string | null;

interface FakeClamd {
  port: number;
  /** Сглобеното съдържание от последната сесия и броят парчета. */
  last: { command: string; payload: Buffer; chunks: number } | null;
  server: Server;
}

const servers: Server[] = [];
after(() => {
  for (const s of servers) s.close();
});

/** Сървър, който разчита потока INSTREAM и отговаря с `reply(съдържание)` (null → мълчи). */
async function fakeClamd(reply: Reply): Promise<FakeClamd> {
  const state: FakeClamd = { port: 0, last: null, server: createServer() };
  state.server.on('connection', (socket: Socket) => {
    let buf = Buffer.alloc(0);
    let command: string | null = null;
    const payload: Buffer[] = [];
    let chunks = 0;
    socket.on('error', () => undefined);
    socket.on('data', (data: Buffer) => {
      buf = Buffer.concat([buf, data]);
      if (command === null) {
        const nul = buf.indexOf(0);
        if (nul === -1) return;
        command = buf.subarray(0, nul).toString('latin1');
        buf = buf.subarray(nul + 1);
      }
      while (buf.length >= 4) {
        const len = buf.readUInt32BE(0);
        if (len === 0) {
          const all = Buffer.concat(payload);
          state.last = { command, payload: all, chunks };
          const answer = reply(all);
          if (answer !== null) socket.end(`${answer}\0`);
          return;
        }
        if (buf.length < 4 + len) return;
        payload.push(buf.subarray(4, 4 + len));
        chunks += 1;
        buf = buf.subarray(4 + len);
      }
    });
  });
  await new Promise<void>((resolve) => state.server.listen(0, '127.0.0.1', resolve));
  state.port = (state.server.address() as AddressInfo).port;
  servers.push(state.server);
  return state;
}

const scanner = (port: number, timeoutMs = 2000, chunkBytes?: number) =>
  new ClamdScanner({ host: '127.0.0.1', port, timeoutMs, chunkBytes });

describe('clamd INSTREAM', () => {
  test('чист файл → CLEAN; рамките сглобяват точно байтовете', async () => {
    const clamd = await fakeClamd(() => 'stream: OK');
    const bytes = Buffer.alloc(200_000);
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = i % 251;
    const verdict = await scanner(clamd.port, 2000, 64 * 1024).scan(bytes);
    assert.deepEqual(verdict, { status: 'CLEAN' });
    assert.equal(clamd.last?.command, 'zINSTREAM');
    assert.equal(clamd.last?.chunks, 4, '200 000 байта на парчета по 64 KiB');
    assert.ok(clamd.last?.payload.equals(bytes));
  });

  test('EICAR → INFECTED със сигнатурата', async () => {
    const clamd = await fakeClamd((data) =>
      data.toString('latin1').includes(EICAR) ? 'stream: Eicar-Test-Signature FOUND' : 'stream: OK',
    );
    const verdict = await scanner(clamd.port).scan(Buffer.from(EICAR, 'latin1'));
    assert.deepEqual(verdict, { status: 'INFECTED', signature: 'Eicar-Test-Signature' });
  });

  test('грешка на clamd (над StreamMaxLength) → FAILED clamd_error', async () => {
    const clamd = await fakeClamd(() => 'INSTREAM size limit exceeded. ERROR');
    assert.deepEqual(await scanner(clamd.port).scan(Buffer.from('x')), {
      status: 'FAILED',
      reason: 'clamd_error',
    });
  });

  test('мълчащ сървър → FAILED timeout (в срока)', async () => {
    const clamd = await fakeClamd(() => null);
    const started = Date.now();
    assert.deepEqual(await scanner(clamd.port, 200).scan(Buffer.from('x')), {
      status: 'FAILED',
      reason: 'timeout',
    });
    assert.ok(Date.now() - started < 2000);
  });

  test('няма clamd на порта → FAILED connect', async () => {
    const clamd = await fakeClamd(() => 'stream: OK');
    const port = clamd.port;
    await new Promise<void>((resolve) => clamd.server.close(() => resolve()));
    assert.deepEqual(await scanner(port).scan(Buffer.from('x')), {
      status: 'FAILED',
      reason: 'connect',
    });
  });

  test('затваряне без отговор → FAILED, не CLEAN', async () => {
    const clamd = await fakeClamd(() => '');
    const verdict = await scanner(clamd.port).scan(Buffer.from('x'));
    assert.equal(verdict.status, 'FAILED');
  });

  test('разчитане на реда', () => {
    assert.deepEqual(parseClamdReply('stream: OK\0'), { status: 'CLEAN' });
    assert.deepEqual(parseClamdReply('stream: Win.Test.EICAR_HDB-1 FOUND\0'), {
      status: 'INFECTED',
      signature: 'Win.Test.EICAR_HDB-1',
    });
    assert.deepEqual(parseClamdReply('stream: OKAY'), { status: 'FAILED', reason: 'bad_response' });
    assert.deepEqual(parseClamdReply('UNKNOWN COMMAND'), {
      status: 'FAILED',
      reason: 'bad_response',
    });
  });
});
