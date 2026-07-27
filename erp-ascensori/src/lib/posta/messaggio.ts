// Съобщението и адресите — ЧИСТО, без сокет.
//
// Разделено от `smtp.ts` нарочно и по същата причина, по която `webhook/firma.ts`
// е отделен от `webhook/emetti.ts`: тук е всичко, което може да се сгреши тихо
// (адрес с нов ред в него, изядена ударена буква, отрязан текст на реда с точка),
// и точно затова всичко тук има тест. Разговорът със сървъра е другаде — той се
// мери на своя слой, срещу истинско реле.

export interface ConfigSmtp {
  host: string;
  porta: number;
  /** Неявен TLS (порт 465). Иначе се вдига STARTTLS на 587. */
  tlsDiretto: boolean;
  utente: string;
  password: string;
  /** Подателят: адресът, който получателят вижда. */
  mittente: string;
  nomeMittente: string;
}

export class ErrorePosta extends Error {
  constructor(
    readonly codice: number,
    messaggio: string,
    /** Дали има смисъл да се опита пак. 4xx — да; 5xx — не. */
    readonly transitorio: boolean,
  ) {
    super(messaggio);
  }
}

/**
 * Дали низът може да е адрес.
 *
 * НАРОЧНО СТРОГА и нарочно НЕ пълната граматика на RFC 5322: тя допуска
 * кавички и коментари, които после трябва да се екранират на всяко ниво.
 * Отхвърленият екзотичен адрес е неудобство; приетият адрес с нов ред в него е
 * чужда поща, изпратена от наше име.
 */
export function indirizzoValido(v: string): boolean {
  if (v.length > 254) return false;
  if (/[\r\n\0<>,;\s]/.test(v)) return false;
  return /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(v);
}

/** Маха всичко, с което може да се пренесе ред в SMTP или в заглавие. */
export function sanifica(v: string): string {
  return v.replace(/[\r\n]+/g, " ").trim();
}

/**
 * Кодира заглавен ред по RFC 2047, ако не е чист ASCII.
 *
 * Без това „Scadenza verifica periodica — impianto n. 3" излиза при получателя
 * като „Scadenza verifica periodica ?? impianto". Тирето е част от смисъла.
 */
export function codificaIntestazione(v: string): string {
  const pulito = sanifica(v);
  if (/^[\x20-\x7e]*$/.test(pulito)) return pulito;
  return `=?UTF-8?B?${Buffer.from(pulito, "utf8").toString("base64")}?=`;
}

/**
 * Точка в началото на ред затваря DATA — затова се удвоява (RFC 5321, 4.5.2).
 *
 * Пропуснато, текстът се реже точно на реда, който започва с точка. Рядко —
 * и точно затова се открива чак когато клиент не е получил известието си.
 */
export function proteggiPunti(corpo: string): string {
  return corpo.replace(/\r\n\./g, "\r\n..").replace(/^\./, "..");
}

export interface Messaggio {
  a: string;
  oggetto: string;
  /** Чист текст. HTML нарочно няма: известието е три реда и една връзка. */
  testo: string;
}

export function dominioMittente(indirizzo: string): string {
  return indirizzo.split("@")[1] ?? "localhost";
}

/**
 * Съобщението по RFC 5322.
 *
 * Тялото е base64, не quoted-printable: италианският текст е пълен с ударени
 * букви и qp-редакцията на всяка от тях е и по-дълга, и по-лесна за сгрешаване.
 */
export function componi(c: ConfigSmtp, m: Messaggio): string {
  const intestazioni = [
    `From: ${codificaIntestazione(c.nomeMittente)} <${c.mittente}>`,
    `To: <${m.a}>`,
    `Subject: ${codificaIntestazione(m.oggetto)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    // Известието е служебно. Без този ред то влиза в автоматичните отговори на
    // получателя и в цикъл „вън от офиса" с нашата собствена кутия.
    "Auto-Submitted: auto-generated",
  ];
  const corpo = Buffer.from(m.testo, "utf8")
    .toString("base64")
    .replace(/(.{76})/g, "$1\r\n");
  return `${intestazioni.join("\r\n")}\r\n\r\n${corpo}`;
}

/** Чете конфигурацията от обкръжението. Липсваща = функцията е изключена. */
export function configSmtp(
  env: Record<string, string | undefined> = process.env as Record<
    string,
    string | undefined
  >,
): ConfigSmtp | null {
  const host = (env.SMTP_HOST ?? "").trim();
  const mittente = (env.SMTP_MITTENTE ?? "").trim();
  if (!host || !mittente) return null;
  if (!indirizzoValido(mittente)) return null;
  const porta = Number(env.SMTP_PORTA ?? 587) || 587;
  return {
    host,
    porta,
    // 465 е неявен TLS по конвенция; 587 иска STARTTLS. Изричната промяна
    // остава възможна, но подразбирането следва порта.
    tlsDiretto: (env.SMTP_TLS ?? "").trim()
      ? (env.SMTP_TLS ?? "").trim() === "diretto"
      : porta === 465,
    utente: (env.SMTP_UTENTE ?? "").trim(),
    password: env.SMTP_PASSWORD ?? "",
    mittente,
    nomeMittente: (env.SMTP_NOME ?? "").trim() || "ERP Ascensori",
  };
}
