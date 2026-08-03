// Синтетични проби — по фази, с проверка на съдържанието и TLS веригата.
//
// Защо не стига „HTTP 200": страница с надпис „Application error" също връща 200.
// Защо по фази: „бавно" може да е DNS, TCP, TLS или самото приложение — без
// разбивка гадаеш. Защо TLS веригата: изтекъл междинен сертификат чупи браузърите,
// а `openssl x509 -enddate` на листа мълчи.
//
// ВАЖНО: с keep-alive агент събитията lookup/connect/secureConnect НЕ се излъчват
// при преизползвана връзка → фазите излизат 0 и лъжат. Затова agent:false.
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import dns from 'node:dns';

const MAX_BODY = 256 * 1024;

export async function probe(target, { timeoutMs = 10000 } = {}) {
  const started = Date.now();
  let url;
  try {
    url = new URL(target.url);
  } catch {
    return { name: target.name, url: target.url, up: false, error: 'невалиден URL' };
  }

  const t = { start: started, dns: null, connect: null, tls: null, ttfb: null, done: null };
  const reqFn = url.protocol === 'https:' ? httpsRequest : httpRequest;

  return new Promise((resolve) => {
    let settled = false;
    const finish = (extra) => {
      if (settled) return;
      settled = true;
      const phase = (a, b) => (a != null && b != null ? Math.max(0, a - b) : null);
      resolve({
        name: target.name,
        url: target.url,
        totalMs: Date.now() - started,
        phases: {
          dnsMs: phase(t.dns, t.start),
          connectMs: phase(t.connect, t.dns ?? t.start),
          tlsMs: phase(t.tls, t.connect),
          ttfbMs: phase(t.ttfb, t.tls ?? t.connect ?? t.start),
          downloadMs: phase(t.done, t.ttfb),
        },
        ...extra,
      });
    };

    const req = reqFn(
      url,
      {
        method: target.method || 'GET',
        timeout: timeoutMs,
        agent: false, // нова връзка → фазовите тайминги са истински
        headers: { 'user-agent': 'carbon-stealth-vps-dashboard/probe' },
      },
      (res) => {
        t.ttfb = Date.now();
        let body = '';
        let size = 0;
        res.on('data', (c) => {
          size += c.length;
          if (body.length < MAX_BODY) body += c.toString('utf8');
          if (size > MAX_BODY * 4) res.destroy(); // не тегли безкрайно
        });
        res.on('end', () => {
          t.done = Date.now();
          const statusOk = target.expectStatus
            ? res.statusCode === Number(target.expectStatus)
            : res.statusCode >= 200 && res.statusCode < 400;
          // HTTP 200 с „Application error" вътре е DOWN за потребителя.
          const contentOk = target.expectText ? body.includes(target.expectText) : true;
          finish({
            up: statusOk && contentOk,
            status: res.statusCode,
            bytes: size,
            contentOk,
            contentError: target.expectText && !contentOk ? `липсва текстът „${target.expectText}"` : null,
            tls: tlsInfo,
          });
        });
        res.on('error', () => finish({ up: false, error: 'прекъснат отговор', tls: tlsInfo }));
      }
    );

    let tlsInfo = null;
    req.on('socket', (socket) => {
      socket.on('lookup', () => (t.dns = Date.now()));
      socket.on('connect', () => (t.connect = Date.now()));
      socket.on('secureConnect', () => {
        t.tls = Date.now();
        try {
          const cert = socket.getPeerCertificate(true);
          const chain = [];
          let c = cert;
          const seen = new Set();
          while (c && c.fingerprint256 && !seen.has(c.fingerprint256)) {
            seen.add(c.fingerprint256);
            chain.push({
              subject: c.subject?.CN || '',
              issuer: c.issuer?.CN || '',
              validTo: c.valid_to,
              daysLeft: c.valid_to ? Math.round((new Date(c.valid_to).getTime() - Date.now()) / 86400000) : null,
            });
            c = c.issuerCertificate;
          }
          tlsInfo = {
            authorized: socket.authorized,
            error: socket.authorizationError ? String(socket.authorizationError) : null,
            protocol: socket.getProtocol ? socket.getProtocol() : null,
            chain,
            // Най-слабото звено във веригата решава кога сайтът ще се счупи.
            minDaysLeft: chain.length ? Math.min(...chain.map((x) => x.daysLeft ?? 9999)) : null,
          };
        } catch {
          tlsInfo = null;
        }
      });
    });
    req.on('timeout', () => {
      req.destroy();
      finish({ up: false, error: `няма отговор за ${timeoutMs} ms`, tls: tlsInfo });
    });
    req.on('error', (err) => finish({ up: false, error: err.message, tls: tlsInfo }));
    req.end();
  });
}

// DNS проверка — промяна в A/AAAA записа може да значи отвлечен домейн или
// изтекла регистрация. Пазим предишния набор, за да видим промяната.
export async function resolveHost(hostname) {
  const started = Date.now();
  const resolver = new dns.promises.Resolver();
  resolver.setServers(resolver.getServers());
  const out = { hostname, ms: null, a: [], aaaa: [], error: null };
  try {
    const [a, aaaa] = await Promise.all([
      resolver.resolve4(hostname).catch(() => []),
      resolver.resolve6(hostname).catch(() => []),
    ]);
    out.a = a;
    out.aaaa = aaaa;
    out.ms = Date.now() - started;
    if (!a.length && !aaaa.length) out.error = 'няма A/AAAA запис';
  } catch (err) {
    out.error = err.message;
    out.ms = Date.now() - started;
  }
  return out;
}

export function diffDns(prev, curr) {
  if (!prev) return null;
  const before = [...(prev.a || []), ...(prev.aaaa || [])].sort().join(',');
  const after = [...(curr.a || []), ...(curr.aaaa || [])].sort().join(',');
  return before === after ? null : { before, after };
}
