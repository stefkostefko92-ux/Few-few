// The outside monitor of /health (deploy/monitor-health.sh, run by .github/workflows/rilievi-health.yml; the
// owner, 12 November 2026: "Direct external monitor for /health"). The real curl against a local server that
// answers 200, 500, a wrong body, or hangs up. It checks the attempts, the output (stato, dettaglio, also in
// $GITHUB_OUTPUT) and that one failure followed by a 200 is "su". No outside network.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const SCRIPT = join(import.meta.dirname, '..', 'deploy', 'monitor-health.sh');
const OK = '{"status":"ok","app":"rilievi"}';

type Reply = (req: IncomingMessage, res: ServerResponse) => void;
const json =
  (code: number, body: string): Reply =>
  (_req, res) => {
    res.statusCode = code;
    res.setHeader('Content-Type', 'application/json');
    res.end(body);
  };
const hangUp: Reply = (req) => req.socket.destroy();

// A server that answers the n-th request with replies[n] (the last one repeats); returns how many it got.
async function withServer<T>(
  replies: Reply[],
  run: (url: string, hits: () => number) => Promise<T>,
) {
  let n = 0;
  const server = createServer((req, res) => {
    replies[Math.min(n, replies.length - 1)]!(req, res);
    n += 1;
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  try {
    return await run(`http://127.0.0.1:${port}/health`, () => n);
  } finally {
    server.close();
  }
}

async function monitor(env: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), 'rilievi-monitor-'));
  const out = join(dir, 'github-output');
  // No proxy variables: the stand-in server is on 127.0.0.1.
  const child = spawn('bash', [SCRIPT], {
    env: {
      PATH: process.env.PATH ?? '',
      GITHUB_OUTPUT: out,
      RILIEVI_HEALTH_PAUSE: '0',
      RILIEVI_HEALTH_TIMEOUT: '3',
      ...env,
    },
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (c: Buffer) => (stdout += c.toString()));
  child.stderr.on('data', (c: Buffer) => (stderr += c.toString()));
  const status = await new Promise<number | null>((resolve) => child.on('close', resolve));
  let file = '';
  try {
    file = readFileSync(out, 'utf8');
  } catch {
    file = '';
  }
  return { status, stdout, stderr, file };
}

describe('monitor-health.sh', () => {
  it('200 with the right body: su, one request, same lines in stdout and $GITHUB_OUTPUT', async () => {
    await withServer([json(200, OK)], async (url, hits) => {
      const r = await monitor({ RILIEVI_HEALTH_URL: url });
      assert.equal(r.status, 0, r.stderr);
      assert.equal(r.stdout, 'stato=su\ndettaglio=200\n');
      assert.equal(r.file, r.stdout);
      assert.equal(hits(), 1);
    });
  });

  it('500 every time: giu after all the attempts, with the code', async () => {
    await withServer([json(500, '{}')], async (url, hits) => {
      const r = await monitor({ RILIEVI_HEALTH_URL: url, RILIEVI_HEALTH_ATTEMPTS: '3' });
      assert.equal(r.status, 0, 'giu is data, not a script error');
      assert.equal(r.stdout, 'stato=giu\ndettaglio=500\n');
      assert.equal(hits(), 3);
    });
  });

  it('one failure and then 200 is su (a lost packet is not an outage)', async () => {
    await withServer([json(500, '{}'), json(200, OK)], async (url, hits) => {
      const r = await monitor({ RILIEVI_HEALTH_URL: url });
      assert.equal(r.stdout, 'stato=su\ndettaglio=200\n');
      assert.equal(hits(), 2, 'stops at the first healthy answer');
    });
  });

  it('503 from the portal (database down) is giu with 503', async () => {
    await withServer([json(503, '{"status":"db","app":"rilievi"}')], async (url) => {
      const r = await monitor({ RILIEVI_HEALTH_URL: url, RILIEVI_HEALTH_ATTEMPTS: '2' });
      assert.equal(r.stdout, 'stato=giu\ndettaglio=503\n');
    });
  });

  it('200 from someone else (wrong body) is giu, and says so', async () => {
    await withServer([json(200, '<html>ok</html>')], async (url, hits) => {
      const r = await monitor({ RILIEVI_HEALTH_URL: url });
      assert.equal(r.stdout, 'stato=giu\ndettaglio=200, risposta inattesa\n');
      assert.equal(hits(), 3);
    });
  });

  it('no answer at all (hangs up): giu, errore di rete, all the attempts', async () => {
    await withServer([hangUp], async (url, hits) => {
      const r = await monitor({ RILIEVI_HEALTH_URL: url, RILIEVI_HEALTH_ATTEMPTS: '2' });
      assert.equal(r.status, 0);
      assert.equal(r.stdout, 'stato=giu\ndettaglio=errore di rete\n');
      assert.equal(hits(), 2);
    });
  });

  it('a closed port is giu too; the lines are not duplicated if run again', async () => {
    const url = await withServer([hangUp], async (u) => u); // the server is gone when this returns
    const env = { RILIEVI_HEALTH_URL: url, RILIEVI_HEALTH_ATTEMPTS: '1' };
    const a = await monitor(env);
    const b = await monitor(env);
    assert.equal(a.stdout, 'stato=giu\ndettaglio=errore di rete\n');
    assert.equal(b.stdout, a.stdout);
    assert.equal(a.file, a.stdout, 'a fresh $GITHUB_OUTPUT per run holds one pair');
  });

  it('without the address, or with a bad number, it stops with 2 and prints nothing to stdout', async () => {
    const noUrl = await monitor({});
    assert.equal(noUrl.status, 2);
    assert.equal(noUrl.stdout, '');
    const bad = await monitor({
      RILIEVI_HEALTH_URL: 'http://127.0.0.1:9/',
      RILIEVI_HEALTH_ATTEMPTS: 'x',
    });
    assert.equal(bad.status, 2);
    assert.equal(bad.stdout, '');
  });
});
