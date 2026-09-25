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

interface Risposta {
  codice: number;
  testo: string;
}

interface Conversazione {
  scrivi: (v: string) => void;
  leggi: () => Promise<Risposta>;
  chiudi: () => void;
  /** След STARTTLS: разговорът продължава по шифрования сокет. */
  aggiornaSocket: (s: Socket | TLSSocket) => void;
}

/** Таймаут за всяка стъпка. Мъртво реле не бива да държи автоматизма. */
const TIMEOUT_MS = 20_000;

/**
 * Чакане с таймер, който се ЧИСТИ.
 *
 * Първата версия оставяше таймера на всяка стъпка да тече и след успешния
 * отговор. Двайсет секунди по-късно той проверяваше СПОДЕЛЕНОТО „чакащо“ —
 * което вече принадлежеше на следващата стъпка — и го нулираше: следващият
 * отговор пристигаше и нямаше на кого да се даде. `invia` висеше завинаги, а
 * цикълът на автоматизмите е последователен, тоест спираха и сроковете в 06:00.
 */
function conTimeout<T>(
  p: Promise<T>,
  ms: number,
  messaggio: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const scadenza = new Promise<never>((_, rej) => {
    timer = setTimeout(() => rej(new Error(messaggio)), ms);
    timer.unref?.();
  });
  return Promise.race([p, scadenza]).finally(() => clearTimeout(timer));
}

function conversazione(
  iniziale: Socket | TLSSocket,
  timeoutMs: number,
): Conversazione {
  let socket = iniziale;
  let buffer = "";
  /** Пълни отговори, пристигнали преди някой да ги е поискал. */
  const pronte: Risposta[] = [];
  /** Кой чака СЕГА. Една стъпка чака наведнъж — SMTP без pipelining. */
  let attesa: { res: (r: Risposta) => void; rej: (e: Error) => void } | null =
    null;
  /** Връзката е паднала: всяко следващо четене отказва веднага. */
  let rotta: Error | null = null;

  const suDati = (chunk: string) => {
    buffer += chunk;
    // Отговорът е ЦЯЛ, когато последният му ред е завършен (CRLF) и има
    // интервал след кода: „250 OK". Междинните редове имат тире —
    // „250-PIPELINING". Без проверката за CRLF парче „250 O“ минаваше за
    // пълен отговор, а остатъкът „K“ се лепеше към следващия.
    if (!buffer.endsWith("\r\n")) return;
    const righe = buffer.split("\r\n").filter(Boolean);
    const ultima = righe[righe.length - 1];
    if (!ultima || !/^\d{3} /.test(ultima)) return;
    const r = { codice: Number(ultima.slice(0, 3)), testo: buffer };
    buffer = "";
    if (attesa) {
      const a = attesa;
      attesa = null;
      a.res(r);
    } else pronte.push(r);
  };
  const suRottura = (e: Error) => {
    rotta ??= e;
    if (attesa) {
      const a = attesa;
      attesa = null;
      a.rej(rotta);
    }
  };
  // Затворената връзка отказва ВЕДНАГА, не след двайсет секунди таймаут.
  const suChiusura = () =>
    suRottura(new Error("connessione interrotta dal server"));

  function collega(s: Socket | TLSSocket) {
    s.setEncoding("utf8");
    s.on("data", suDati);
    s.on("error", suRottura);
    s.on("close", suChiusura);
  }
  function scollega(s: Socket | TLSSocket) {
    // След STARTTLS суровият сокет носи ШИФРОВАНИ байтове. Оставен закачен,
    // слушателят им би ги лепил в буфера като „отговор“ на сървъра.
    s.off("data", suDati);
    s.off("error", suRottura);
    s.off("close", suChiusura);
  }

  collega(socket);

  return {
    scrivi: (v) => {
      socket.write(v + "\r\n");
    },
    leggi: () => {
      const gia = pronte.shift();
      if (gia) return Promise.resolve(gia);
      if (rotta) return Promise.reject(rotta);
      const p = new Promise<Risposta>((res, rej) => {
        attesa = { res, rej };
      });
      return conTimeout(p, timeoutMs, "timeout SMTP").catch((e: Error) => {
        // Таймаутът освобождава мястото — иначе закъснял отговор би се дал на
        // следващо четене, което чака нещо съвсем друго.
        attesa = null;
        throw e;
      });
    },
    chiudi: () => socket.destroy(),
    aggiornaSocket: (s) => {
      scollega(socket);
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
    ? tlsConnect({ host: c.host, port: c.porta, servername: c.host, ca: c.ca })
    : createConnection({ host: c.host, port: c.porta });

  const attesaMax = c.timeoutMs ?? TIMEOUT_MS;
  const conv = conversazione(socket, attesaMax);
  try {
    await conTimeout(
      new Promise<void>((res, rej) => {
        socket.once(c.tlsDiretto ? "secureConnect" : "connect", () => res());
        socket.once("error", rej);
      }),
      attesaMax,
      "timeout di connessione",
    );

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
      const sicuro = tlsConnect({
        socket: socket as Socket,
        servername: c.host,
        ca: c.ca,
      });
      // Ръкостискането също има таван: реле, което приема STARTTLS и после
      // замлъква, иначе държи процеса без край.
      await conTimeout(
        new Promise<void>((res, rej) => {
          sicuro.once("secureConnect", () => res());
          sicuro.once("error", rej);
        }),
        attesaMax,
        "timeout nella negoziazione TLS",
      );
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

    // Чакаме „221" преди да затворим. Унищожен веднага след `write`, сокетът
    // изхвърля буферираната команда и QUIT никога не стига до релето —
    // писмото вече е прието, но разговорът се води прекъснат. Грешка тук не
    // проваля пращането: „250" по-горе е това, което има значение.
    conv.scrivi("QUIT");
    await conv.leggi().catch(() => undefined);
  } finally {
    conv.chiudi();
  }
}
