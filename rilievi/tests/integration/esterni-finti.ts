/**
 * Fake external services for the integration tests: VIES (the official "swagger_publicVAT.yaml" contract of the
 * European Commission — POST /check-vat-number; errors as `actionSucceed: false`, also with HTTP 200) and Discord
 * (the documented "Execute Webhook": POST /api/webhooks/{id}/{token}). One local server; start it (it sets
 * VIES_API_BASE and DISCORD_API_BASE) before the harness is imported.
 */
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export const WEBHOOK_DISCORD =
  'https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyzABCDEF_-0123';

/** What VIES answers for a number ("IT01234567897"); anything not listed is valid, with a consultation number. */
export const vies: {
  risposte: Map<string, 'nonValida' | 'MS_UNAVAILABLE' | 'TIMEOUT' | 'senzaDati'>;
  richieste: Array<Record<string, unknown>>;
} = { risposte: new Map(), richieste: [] };

export const discord: { messaggi: string[]; stato: number; percorsi: string[] } = {
  messaggi: [],
  stato: 204,
  percorsi: [],
};

let server: Server | null = null;

const corpo = (req: IncomingMessage) =>
  new Promise<string>((resolve) => {
    let s = '';
    req.on('data', (c: Buffer) => (s += c.toString('utf8')));
    req.on('end', () => resolve(s));
  });

export async function avviaEsterniFinti(): Promise<void> {
  if (server) return;
  server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    const json = (status: number, body: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(body === null ? '' : JSON.stringify(body));
    };
    if (url.pathname === '/check-vat-number' && req.method === 'POST') {
      const b = JSON.parse(await corpo(req)) as Record<string, string>;
      vies.richieste.push(b);
      const caso = vies.risposte.get(`${b.countryCode}${b.vatNumber}`);
      if (caso === 'MS_UNAVAILABLE' || caso === 'TIMEOUT')
        return json(200, { actionSucceed: false, errorWrappers: [{ error: caso }] });
      const valida = caso !== 'nonValida';
      const conDati = valida && caso !== 'senzaDati';
      return json(200, {
        countryCode: b.countryCode,
        vatNumber: b.vatNumber,
        requestDate: new Date().toISOString(),
        valid: valida,
        requestIdentifier:
          valida && b.requesterNumber ? `WAPIAAAAY${vies.richieste.length}xYz` : '',
        name: conDati ? 'ASCENSORI VERDI S.R.L.' : '---',
        address: conDati ? 'VIA DANTE 3 \n40100 BOLOGNA BO\n' : '---',
      });
    }
    if (url.pathname.startsWith('/api/webhooks/') && req.method === 'POST') {
      const b = JSON.parse(await corpo(req)) as { content?: string };
      discord.percorsi.push(url.pathname + url.search);
      if (discord.stato >= 200 && discord.stato < 300) discord.messaggi.push(String(b.content));
      return json(discord.stato, discord.stato === 200 ? { id: '1' } : null);
    }
    json(404, { code: 'not_found' });
  });
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', () => resolve()));
  const base = `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
  process.env.VIES_API_BASE = base;
  process.env.DISCORD_API_BASE = base;
}

export async function fermaEsterniFinti(): Promise<void> {
  const s = server;
  server = null;
  await new Promise<void>((resolve) => (s ? s.close(() => resolve()) : resolve()));
}

/** Waits for a Discord message that matches (the alarms leave after the answer). */
export async function attendiDiscord(test: (m: string) => boolean): Promise<boolean> {
  for (let i = 0; i < 40 && !discord.messaggi.some(test); i += 1)
    await new Promise((r) => setTimeout(r, 50));
  return discord.messaggi.some(test);
}
