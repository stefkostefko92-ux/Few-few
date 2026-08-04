import "server-only";

import { connect as netConnect } from "node:net";
import { connect as tlsConnect, type PeerCertificate } from "node:tls";

import { isGloballyRoutable, type ParsedIp } from "@/lib/ip";
import type { PortState, ProbeResult, TlsCertificate } from "@/lib/probe-types";

export type { PortState, ProbeResult, TlsCertificate };

/**
 * Активна проверка — единственото място, където продуктът СЕ СВЪРЗВА с
 * търсения адрес, вместо да пита регистри за него.
 *
 * Стойността е голяма: сертификатът на порт 443 обикновено изброява в полето
 * SAN всички домейни зад адреса — тоест отговаря на въпроса „кой стои тук“,
 * на който никой регистър не отговаря.
 *
 * Затова и предпазителите не са по избор:
 *
 * 1. **Само по изрично действие на потребителя.** Не тръгва при отваряне на
 *    страницата — иначе всяко обхождане от робот би пуснало сканиране.
 * 2. **Фиксиран, кратък списък портове.** Потребителят НЕ може да зададе порт.
 *    Това е разликата между справка и скенер за общо ползване.
 * 3. **Само публично маршрутизируеми адреси.** Вътрешните мрежи са извън
 *    обхвата — иначе инструментът разузнава нашата собствена мрежа.
 * 4. **Кратки таймаути, без повторни опити, без задържане.** Един опит на порт.
 * 5. **Ограничение на честотата** (в извикващия route) — без него сървърът е
 *    усилвател, с който трета страна може да бъде засипана от наше име.
 *
 * Няма изпращане на данни към целта освен минималното за ръкостискане и един
 * `HEAD` за банера. Нищо не се пробва, нищо не се експлоатира.
 */

/** Портовете са КОНСТАНТА. Списъкът се разширява само с решение, не от вход. */
const PORTS: readonly { port: number; service: string }[] = [
  { port: 21, service: "FTP" },
  { port: 22, service: "SSH" },
  { port: 25, service: "SMTP" },
  { port: 53, service: "DNS" },
  { port: 80, service: "HTTP" },
  { port: 443, service: "HTTPS" },
  { port: 3389, service: "RDP" },
  { port: 8080, service: "HTTP (алт.)" },
];

const CONNECT_TIMEOUT_MS = 2000;
const TLS_TIMEOUT_MS = 4000;
const BANNER_TIMEOUT_MS = 3000;

/** Едно свързване, един изход. Никога не хвърля. */
function probePort(host: string, port: number, service: string): Promise<PortState> {
  const started = Date.now();
  return new Promise((resolve) => {
    let settled = false;
    const finish = (state: PortState["state"]) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({ port, service, state, ms: Date.now() - started });
    };

    const socket = netConnect({ host, port });
    socket.setTimeout(CONNECT_TIMEOUT_MS);
    socket.once("connect", () => finish("open"));
    // Отказана връзка значи, че НЯКОЙ е отговорил — това е различно от мълчание.
    socket.once("error", () => finish("closed"));
    socket.once("timeout", () => finish("filtered"));
  });
}

/** Сертификатът на 443 — без SNI, за да видим какво дава самият адрес. */
function probeTls(host: string): Promise<TlsCertificate | undefined> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value?: TlsCertificate) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(value);
    };

    const socket = tlsConnect({
      host,
      port: 443,
      // Нарочно НЕ подаваме `servername`: искаме сертификата по подразбиране на
      // адреса, а не този за конкретен домейн.
      servername: undefined,
      // Проверката е предмет на изследването, не условие за него: изтекъл или
      // самоподписан сертификат е находка, която искаме да покажем, а не
      // причина да не научим нищо. Нищо не се изпраща по тази връзка.
      rejectUnauthorized: false,
      timeout: TLS_TIMEOUT_MS,
    });

    socket.once("secureConnect", () => {
      const certificate = socket.getPeerCertificate(false);
      finish(describeCertificate(certificate, socket.getProtocol() ?? undefined));
    });
    socket.once("error", () => finish(undefined));
    socket.once("timeout", () => finish(undefined));
  });
}

/**
 * Полетата на сертификата може да са низ ИЛИ списък от низове (един и същ
 * атрибут се среща по няколко пъти в реални сертификати). Вземаме първото.
 */
function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value || undefined;
}

function describeCertificate(
  certificate: PeerCertificate,
  protocol?: string,
): TlsCertificate | undefined {
  if (!certificate || Object.keys(certificate).length === 0) return undefined;

  // `subjectaltname` е низ вида `DNS:a.example, DNS:b.example, IP Address:1.2.3.4`.
  const names = String(certificate.subjectaltname ?? "")
    .split(",")
    .map((entry) => entry.trim().replace(/^(DNS|IP Address|URI|email):/, ""))
    .filter(Boolean);

  const commonName = first(certificate.subject?.CN);
  if (commonName && !names.includes(commonName)) names.unshift(commonName);

  const validTo = certificate.valid_to ? new Date(certificate.valid_to) : null;

  return {
    subject: commonName,
    issuer: first(certificate.issuer?.O) ?? first(certificate.issuer?.CN),
    validFrom: certificate.valid_from ?? undefined,
    validTo: certificate.valid_to ?? undefined,
    expired: validTo ? validTo.getTime() < Date.now() : false,
    // Дълъг списък SAN се отрязва — има сертификати със стотици имена.
    names: names.slice(0, 40),
    protocol,
  };
}

/** Заглавието `Server:` — един `HEAD`, нищо повече. */
function probeHttpBanner(host: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    let settled = false;
    let buffer = "";
    const finish = (value?: string) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(value);
    };

    const socket = netConnect({ host, port: 80 });
    socket.setTimeout(BANNER_TIMEOUT_MS);
    socket.once("connect", () => {
      const target = host.includes(":") ? `[${host}]` : host;
      socket.write(`HEAD / HTTP/1.0\r\nHost: ${target}\r\nConnection: close\r\n\r\n`);
    });
    socket.on("data", (chunk) => {
      buffer += chunk.toString("latin1");
      // Заглавията свършват на празен ред; повече от това не ни трябва.
      if (buffer.length > 4096 || buffer.includes("\r\n\r\n")) {
        const match = /^server:\s*(.+)$/im.exec(buffer);
        finish(match?.[1]?.trim().slice(0, 120));
      }
    });
    socket.once("error", () => finish(undefined));
    socket.once("timeout", () => finish(undefined));
    socket.once("close", () => {
      const match = /^server:\s*(.+)$/im.exec(buffer);
      finish(match?.[1]?.trim().slice(0, 120));
    });
  });
}

export async function probe(ip: ParsedIp): Promise<ProbeResult> {
  // Двойна проверка: извикващият вече е проверил, но това е функцията, която
  // отваря връзки — тя не бива да разчита на чужда дисциплина.
  if (!isGloballyRoutable(ip)) {
    return { ports: [], totalMs: 0 };
  }

  const started = Date.now();
  const host = ip.normalized;

  const [ports, tls, httpServer] = await Promise.all([
    Promise.all(PORTS.map(({ port, service }) => probePort(host, port, service))),
    probeTls(host),
    probeHttpBanner(host),
  ]);

  return { ports, tls, httpServer, totalMs: Date.now() - started };
}
