// A scripted plain-text SMTP server for the tests: it answers each command with the reply given for it (or the
// usual success), so a test can make the server refuse exactly one step — the login, the sender, the recipient,
// the message — and see what the portal reports. No TLS: the tests that use it switch STARTTLS off themselves.
import { createServer, type Server } from 'node:net';

export type Copione = Partial<
  Record<'saluto' | 'EHLO' | 'STARTTLS' | 'AUTH' | 'MAIL' | 'RCPT' | 'DATA' | 'corpo', string>
>;

const NORMALE: Required<Copione> = {
  saluto: '220 finto ESMTP',
  EHLO: '250-finto\r\n250 AUTH PLAIN LOGIN',
  STARTTLS: '502 5.5.1 STARTTLS non disponibile',
  AUTH: '235 2.0.0 Authentication succeeded',
  MAIL: '250 2.1.0 Ok',
  RCPT: '250 2.1.5 Ok',
  DATA: '354 End data with <CR><LF>.<CR><LF>',
  corpo: '250 2.0.0 Ok: queued',
};

export interface SmtpFinto {
  port: number;
  /** The commands received, in order (first word only — never the credentials). */
  comandi: string[];
  close: () => Promise<void>;
}

/** `porta`: 0 — any free port; a fixed one (2525) when the portal only accepts its own list of ports. */
export async function smtpFinto(copione: Copione = {}, porta = 0): Promise<SmtpFinto> {
  const risposte = { ...NORMALE, ...copione };
  const comandi: string[] = [];
  const server: Server = createServer((socket) => {
    let buffer = '';
    let inDati = false;
    socket.on('error', () => undefined);
    socket.write(`${risposte.saluto}\r\n`);
    if (!risposte.saluto.startsWith('2')) return void socket.end();
    socket.on('data', (chunk) => {
      buffer += chunk.toString('latin1');
      for (;;) {
        if (inDati) {
          const fine = buffer.indexOf('\r\n.\r\n');
          if (fine === -1 && buffer !== '.\r\n') return;
          buffer = fine === -1 ? '' : buffer.slice(fine + 5);
          inDati = false;
          socket.write(`${risposte.corpo}\r\n`);
          continue;
        }
        const a = buffer.indexOf('\r\n');
        if (a === -1) return;
        const riga = buffer.slice(0, a);
        buffer = buffer.slice(a + 2);
        const verbo = (riga.split(/[ :]/)[0] ?? '').toUpperCase();
        comandi.push(verbo);
        if (verbo === 'QUIT') return void socket.end('221 2.0.0 Bye\r\n');
        if (verbo === 'RSET' || verbo === 'NOOP') socket.write('250 2.0.0 Ok\r\n');
        else if (verbo === 'EHLO' || verbo === 'HELO') socket.write(`${risposte.EHLO}\r\n`);
        else if (verbo in risposte) {
          const risposta = risposte[verbo as keyof Copione]!;
          socket.write(`${risposta}\r\n`);
          if (verbo === 'DATA' && risposta.startsWith('354')) inDati = true;
        } else socket.write('500 5.5.2 Comando sconosciuto\r\n');
      }
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(porta, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('smtp finto: nessuna porta');
  return {
    port: address.port,
    comandi,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

/** A port of this machine on which nothing listens (taken and released at once). */
export async function portaChiusa(): Promise<number> {
  const s = await smtpFinto();
  await s.close();
  return s.port;
}
