// SMTP клиент без зависимости (RFC 5321) — колкото трябва, за да изпратиш поща.
//
// ЗАЩО СВОЙ, А НЕ БИБЛИОТЕКА. Продуктът стои на дванайсет зависимости и всяка
// нова е повърхност за атака по веригата на доставка в софтуер, който върви на
// машината на клиента и държи фискални данни. Това, което ни трябва, е точно
// четири глагола (EHLO, AUTH, MAIL/RCPT/DATA, QUIT) върху TLS — измеримо
// по-малко код от одита на един пакет с трийсет транзитивни деца.
//
// ЗАЩО ПАК Е БЕЗОПАСНО. Клиентът НЕ приема съдържание отвън: адресът и текстът
// се строят от нашия шаблон, а адресът минава през `indirizzoValido`, преди да
// види сокет. Инжекцията в SMTP се прави с нов ред в командата — затова CR и LF
// НЕ могат да влязат нито в адрес, нито в заглавен ред (`sanifica`).
//
// ТУК Е САМО РАЗГОВОРЪТ. Адресите, заглавията и тялото живеят в `messaggio.ts`,
// защото те са чисти и се проверяват без сокет — същото разделение като
// `webhook/firma.ts` срещу `webhook/emetti.ts`. Този файл се мери на своя слой,
// срещу истинско реле, не в пакета за чиста логика.
//
// КАКВО НЕ ПРАВИ, нарочно: няма пул от връзки (един пуск праща пакет и затваря),
// няма DKIM (подписва релето на доставчика), няма OAuth (парола на приложение —
// това искат и Aruba, и Register, и повечето италиански PEC доставчици).

import { createConnection, type Socket } from "node:net";
import { connect as tlsConnect, type TLSSocket } from "node:tls";
import {
  ErrorePosta,
  indirizzoValido,
  proteggiPunti,
  componi,
  dominioMittente,
  type ConfigSmtp,
  type Messaggio,
} from "@/lib/posta/messaggio";

export * from "@/lib/posta/messaggio";

interface Conversazione {
  scrivi: (v: string) => void;
  leggi: () => Promise<{ codice: number; testo: string }>;
  chiudi: () => void;
  aggiornaSocket: (s: Socket | TLSSocket) => void;
}

/** Таймаут за всяка стъпка. Мъртво реле не бива да държи автоматизма. */
const TIMEOUT_MS = 20_000;

function conversazione(iniziale: Socket | TLSSocket): Conversazione {
  let socket = iniziale;
  let buffer = "";
  let attesa: ((v: { codice: number; testo: string }) => void) | null = null;
  let rifiuta: ((e: Error) => void) | null = null;

  function collega(s: Socket | TLSSocket) {
    s.setEncoding("utf8");
    s.on("data", (chunk: string) => {
      buffer += chunk;
      // Последният ред на отговора има интервал след кода: „250 OK".
      // Междинните имат тире: „250-PIPELINING". Без това разграничение
      // клиентът приема първия ред на EHLO за целия отговор.
      const righe = buffer.split("\r\n").filter(Boolean);
      const ultima = righe[righe.length - 1];
      if (!ultima || !/^\d{3} /.test(ultima)) return;
      const testo = buffer;
      buffer = "";
      const codice = Number(ultima.slice(0, 3));
      attesa?.({ codice, testo });
      attesa = null;
      rifiuta = null;
    });
    s.on("error", (e: Error) => {
      rifiuta?.(e);
      attesa = null;
      rifiuta = null;
    });
  }

  collega(socket);

  return {
    scrivi: (v) => socket.write(v + "\r\n"),
    leggi: () =>
      new Promise((res, rej) => {
        attesa = res;
        rifiuta = rej;
        setTimeout(() => {
          if (attesa) {
            attesa = null;
            rifiuta = null;
            rej(new Error("timeout SMTP"));
          }
        }, TIMEOUT_MS).unref?.();
      }),
    chiudi: () => socket.destroy(),
    aggiornaSocket: (s) => {
      socket = s;
      buffer = "";
      collega(s);
    },
  };
}

function esigi(
  r: { codice: number; testo: string },
  attesi: number[],
  passo: string,
): void {
  if (attesi.includes(r.codice)) return;
  throw new ErrorePosta(
    r.codice,
    // Текстът на сървъра НЕ се предава нататък непроменен: той е на английски
    // и понякога носи адреса на получателя. В дневника влиза само стъпката.
    `SMTP ${passo}: risposta ${r.codice}`,
    r.codice >= 400 && r.codice < 500,
  );
}

/**
 * Праща едно съобщение и затваря връзката.
 *
 * Един пакет = една връзка на съобщение. За десетина известия на ден
 * преизползването на връзка не купува нищо, а носи цял клас състояния —
 * реле, което е забравило автентикацията по средата на пакета.
 */
export async function invia(c: ConfigSmtp, m: Messaggio): Promise<void> {
  if (!indirizzoValido(m.a))
    throw new ErrorePosta(0, "Indirizzo del destinatario non valido", false);
  if (!indirizzoValido(c.mittente))
    throw new ErrorePosta(0, "Indirizzo del mittente non valido", false);

  const socket: Socket | TLSSocket = c.tlsDiretto
    ? tlsConnect({ host: c.host, port: c.porta, servername: c.host })
    : createConnection({ host: c.host, port: c.porta });

  const conv = conversazione(socket);
  try {
    await new Promise<void>((res, rej) => {
      socket.once(c.tlsDiretto ? "secureConnect" : "connect", () => res());
      socket.once("error", rej);
      setTimeout(() => rej(new Error("timeout di connessione")), TIMEOUT_MS)
        .unref?.();
    });

    esigi(await conv.leggi(), [220], "saluto");

    conv.scrivi(`EHLO ${dominioMittente(c.mittente)}`);
    const ehlo = await conv.leggi();
    esigi(ehlo, [250], "EHLO");

    if (!c.tlsDiretto) {
      // ЗАДЪЛЖИТЕЛЕН, не „ако сървърът иска". Парола по открита връзка е
      // паролата на пощенската кутия на фирмата, четена от всеки по пътя.
      if (!/STARTTLS/i.test(ehlo.testo))
        throw new ErrorePosta(
          0,
          "Il server SMTP non offre STARTTLS: connessione rifiutata",
          false,
        );
      conv.scrivi("STARTTLS");
      esigi(await conv.leggi(), [220], "STARTTLS");
      const sicuro = tlsConnect({ socket: socket as Socket, servername: c.host });
      await new Promise<void>((res, rej) => {
        sicuro.once("secureConnect", () => res());
        sicuro.once("error", rej);
      });
      conv.aggiornaSocket(sicuro);
      conv.scrivi(`EHLO ${dominioMittente(c.mittente)}`);
      esigi(await conv.leggi(), [250], "EHLO dopo STARTTLS");
    }

    if (c.utente) {
      conv.scrivi("AUTH LOGIN");
      esigi(await conv.leggi(), [334], "AUTH");
      conv.scrivi(Buffer.from(c.utente, "utf8").toString("base64"));
      esigi(await conv.leggi(), [334], "utente");
      conv.scrivi(Buffer.from(c.password, "utf8").toString("base64"));
      esigi(await conv.leggi(), [235], "password");
    }

    conv.scrivi(`MAIL FROM:<${c.mittente}>`);
    esigi(await conv.leggi(), [250], "MAIL FROM");
    conv.scrivi(`RCPT TO:<${m.a}>`);
    esigi(await conv.leggi(), [250, 251], "RCPT TO");
    conv.scrivi("DATA");
    esigi(await conv.leggi(), [354], "DATA");
    conv.scrivi(proteggiPunti(componi(c, m)) + "\r\n.");
    esigi(await conv.leggi(), [250], "invio");

    conv.scrivi("QUIT");
  } finally {
    conv.chiudi();
  }
}

