// The alarms to Discord (the owner, 12 November 2026). Acceptance criteria:
//  - only a Discord webhook address is accepted (https, discord.com / discordapp.com, id and token) — never
//    another host, a path trick or a query;
//  - the message is the documented "Execute Webhook" body: `content` (cut under Discord's 2000) and
//    `allowed_mentions` with nothing to parse — the text cannot ping @everyone;
//  - sending never throws: the network, a timeout and a redirect are "rete";
//  - one kind of alarm is not repeated before its pause is over; the test message always leaves;
//  - no alarm text carries a placeholder for a name, an email or a company: only {n} and {link}.
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { readFileSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import {
  inviaDiscord,
  MAX_TESTO,
  PAUSA_MS,
  puoPartire,
  TIPI_ALLARME,
  urlDiscord,
  type TipoAllarme,
} from '../src/allarmi/discord.js';

const WEBHOOK =
  'https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyzABCDEF_-0123';

let server: Server;
let base = '';
const arrivi: Array<{ url: string; type: string | undefined; body: unknown }> = [];
let stato = 204;
let attesaMs = 0;

before(async () => {
  server = createServer((req, res) => {
    let s = '';
    req.on('data', (c: Buffer) => (s += c.toString('utf8')));
    req.on('end', () => {
      arrivi.push({ url: req.url ?? '', type: req.headers['content-type'], body: JSON.parse(s) });
      setTimeout(() => {
        if (stato === 302) res.writeHead(302, { location: 'http://127.0.0.1:1/altrove' });
        else res.writeHead(stato, { 'content-type': 'application/json' });
        res.end(stato === 200 ? '{"id":"1"}' : '');
      }, attesaMs);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe('the address of the Discord webhook', () => {
  it('accepts only Discord', () => {
    assert.equal(urlDiscord(`  ${WEBHOOK}\n`), WEBHOOK);
    assert.ok(urlDiscord(WEBHOOK.replace('discord.com', 'discordapp.com')));
    assert.ok(urlDiscord(WEBHOOK.replace('discord.com', 'canary.discord.com')));
    for (const no of [
      WEBHOOK.replace('https://', 'http://'),
      WEBHOOK.replace('discord.com', 'discord.com.evil.example'),
      WEBHOOK.replace('discord.com', 'evil.example/discord.com'),
      WEBHOOK.replace('discord.com', 'user@evil.example'),
      WEBHOOK.replace('discord.com', '127.0.0.1'),
      `${WEBHOOK}?wait=true`,
      `${WEBHOOK}/slack`,
      `${WEBHOOK}#x`,
      WEBHOOK.replace('/api/webhooks/', '/api/v10/channels/'),
      'https://discord.com/api/webhooks/123456789012345678/short',
      '',
      null,
      42,
      'x'.repeat(500),
    ])
      assert.equal(urlDiscord(no), null, String(no));
  });
});

describe('sending an alarm', () => {
  it('posts the documented body and cuts a long text', async () => {
    stato = 204;
    const esito = await inviaDiscord(WEBHOOK, 'Prova «uno» @everyone\n"due" \\ tre', { base });
    assert.equal(esito, 204);
    const a = arrivi.at(-1)!;
    assert.equal(a.url, '/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyzABCDEF_-0123');
    assert.equal(a.type, 'application/json');
    assert.deepEqual(a.body, {
      content: 'Prova «uno» @everyone\n"due" \\ tre',
      allowed_mentions: { parse: [] },
    });
    stato = 200;
    assert.equal(await inviaDiscord(WEBHOOK, 'x'.repeat(5000), { base, attendi: true }), 200);
    const lungo = arrivi.at(-1)!;
    assert.ok(lungo.url.endsWith('?wait=true'));
    assert.equal((lungo.body as { content: string }).content.length, MAX_TESTO);
    assert.ok(MAX_TESTO < 2000);
  });

  it('never throws and never follows a redirect', async () => {
    stato = 429;
    assert.equal(await inviaDiscord(WEBHOOK, 'x', { base }), 429);
    stato = 302;
    assert.equal(await inviaDiscord(WEBHOOK, 'x', { base }), 'rete');
    stato = 204;
    attesaMs = 300;
    assert.equal(await inviaDiscord(WEBHOOK, 'x', { base, timeoutMs: 40 }), 'rete');
    attesaMs = 0;
    assert.equal(await inviaDiscord(WEBHOOK, 'x', { base: 'http://127.0.0.1:1' }), 'rete');
    // An address that is not Discord's is never called, whatever the base.
    const prima = arrivi.length;
    assert.equal(
      await inviaDiscord('https://evil.example/api/webhooks/1/x', 'x', { base }),
      'rete',
    );
    assert.equal(arrivi.length, prima);
  });
});

describe('the pause between two alarms of a kind', () => {
  it('lets the first through, holds the next ones, never holds the test message', () => {
    const ultimi = new Map<TipoAllarme, number>();
    const t0 = 1_800_000_000_000;
    assert.equal(puoPartire(ultimi, 'posta', t0), true);
    assert.equal(puoPartire(ultimi, 'posta', t0 + 60_000), false);
    assert.equal(puoPartire(ultimi, 'contestazione', t0 + 60_000), true);
    assert.equal(puoPartire(ultimi, 'posta', t0 + PAUSA_MS.posta - 1), false);
    assert.equal(puoPartire(ultimi, 'posta', t0 + PAUSA_MS.posta), true);
    assert.equal(puoPartire(ultimi, 'prova', t0), true);
    assert.equal(puoPartire(ultimi, 'prova', t0 + 1), true);
  });
});

describe('the texts of the alarms', () => {
  it('exist for every kind and carry no personal data placeholder', () => {
    const testi = (
      JSON.parse(readFileSync(new URL('../locales/it/allarmi.json', import.meta.url), 'utf8')) as {
        allarmi: { testo: Record<string, string> };
      }
    ).allarmi.testo;
    assert.deepEqual(Object.keys(testi).sort(), [...TIPI_ALLARME].sort());
    for (const [tipo, testo] of Object.entries(testi)) {
      const segnaposto = [...testo.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
      for (const s of segnaposto) assert.ok(s === 'n' || s === 'link', `${tipo}: {${s}}`);
      assert.ok(testo.length < 400, tipo);
    }
  });
});
