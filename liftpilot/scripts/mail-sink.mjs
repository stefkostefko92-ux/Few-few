// A tiny SMTP receiver for the local smoke test: the application, started with SMTP_HOST=127.0.0.1 and
// SMTP_PORT=<port> (no login, no TLS), sends its e-mails here and the test reads the links from them. Local only:
// it never runs in production and keeps the messages in memory.
import { createServer } from 'node:net';
import { Buffer } from 'node:buffer';
import { setTimeout as sleep } from 'node:timers/promises';

/** The readable bodies of a MIME message (base64 and quoted-printable parts decoded), joined. */
export function mailBodies(raw) {
  const boundary = /boundary="?([^";\r\n]+)"?/i.exec(raw)?.[1];
  const parts = boundary ? raw.split(`--${boundary}`) : [raw];
  return parts.map((p) => {
    const i = p.indexOf('\r\n\r\n');
    if (i < 0) return '';
    const head = p.slice(0, i), body = p.slice(i + 4);
    const enc = /content-transfer-encoding:\s*([\w-]+)/i.exec(head)?.[1]?.toLowerCase();
    if (enc === 'base64') return Buffer.from(body.replace(/\s+/g, ''), 'base64').toString('utf8');
    if (enc === 'quoted-printable') {
      const bytes = body.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
      return Buffer.from(bytes, 'latin1').toString('utf8');
    }
    return body;
  }).join('\n');
}

export function startMailSink(port) {
  const messages = [];
  const server = createServer((sock) => {
    let buf = '', data = false, lines = [], to = [];
    sock.write('220 smoke-sink ESMTP\r\n');
    sock.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      for (let i = buf.indexOf('\r\n'); i >= 0; i = buf.indexOf('\r\n')) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 2);
        if (data) {
          if (line === '.') {
            data = false;
            messages.push({ to, raw: lines.join('\r\n'), at: Date.now() });
            lines = [];
            to = [];
            sock.write('250 OK\r\n');
          } else lines.push(line.startsWith('..') ? line.slice(1) : line);
          continue;
        }
        const cmd = line.slice(0, 4).toUpperCase();
        if (cmd === 'EHLO') sock.write('250-smoke-sink\r\n250 8BITMIME\r\n');
        else if (cmd === 'RCPT') { to.push((/<([^>]*)>/.exec(line)?.[1] ?? '').toLowerCase()); sock.write('250 OK\r\n'); }
        else if (cmd === 'DATA') { data = true; sock.write('354 go ahead\r\n'); }
        else if (cmd === 'QUIT') sock.end('221 bye\r\n');
        else sock.write('250 OK\r\n'); // HELO, MAIL, RSET, NOOP
      }
    });
    sock.on('error', () => undefined);
  });
  const ready = new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  /** The next message to `address` that arrived after `since` (ms), within `timeout` ms; null when none came. */
  async function next(address, since, timeout = 15000) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      const m = messages.find((x) => x.at >= since && x.to.includes(address.toLowerCase()));
      if (m) return { ...m, text: mailBodies(m.raw) };
      await sleep(100);
    }
    return null;
  }
  return { ready, next, close: () => new Promise((resolve) => server.close(resolve)) };
}
