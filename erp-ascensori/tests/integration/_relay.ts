// Фалшиво SMTP реле за интеграционните тестове — `node:net` + `node:tls`.
//
// Скриптирано: всеки тест казва кога релето да мълчи, какво да откаже, как да
// накъса отговорите. Записва какво е видяло ПРЕДИ и СЛЕД TLS — така се
// доказва, че паролата не тръгва по открита връзка, а не само че клиентът
// „не гърми". Ползва се от `smtp.int.test.ts` и `notifiche-coda.int.test.ts`.

import { createServer, type Server, type Socket } from "node:net";
import { TLSSocket, createServer as createTlsServer } from "node:tls";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface Certificato {
  chiave: string;
  certificato: string;
  elimina: () => void;
}

/**
 * Самоподписан сертификат за localhost, валиден един ден. SAN е задължителен:
 * Node не проверява CN, когато има SAN, а без SAN новите версии отказват.
 */
export function certificatoDiProva(): Certificato {
  const cartella = mkdtempSync(join(tmpdir(), "smtp-finto-"));
  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-days",
      "1",
      "-subj",
      "/CN=localhost",
      "-addext",
      "subjectAltName=DNS:localhost",
      "-keyout",
      join(cartella, "k.pem"),
      "-out",
      join(cartella, "c.pem"),
    ],
    { stdio: "ignore" },
  );
  return {
    chiave: readFileSync(join(cartella, "k.pem"), "utf8"),
    certificato: readFileSync(join(cartella, "c.pem"), "utf8"),
    elimina: () => rmSync(cartella, { recursive: true, force: true }),
  };
}

export interface Copione {
  /** Предлага ли STARTTLS в EHLO по открита връзка. */
  starttls?: boolean;
  /** Неявен TLS от първия байт (порт 465). */
  tlsDiretto?: boolean;
  /** Отговорът на RCPT TO (подразбиране „250 ok"). */
  rcpt?: string;
  /** След коя команда релето замлъква — мъртво реле. */
  silenzioDopo?: string;
  /** След коя команда релето затваря връзката. */
  chiudiDopo?: string;
  /** Забавяне в ms на отговора на дадена команда. */
  ritardi?: Record<string, number>;
  /** Накъсва отговорите на парчета насред реда. */
  spezza?: boolean;
}

export interface Visto {
  inChiaro: string[];
  cifrati: string[];
  utente?: string;
  password?: string;
  corpo: string;
}

export function avviaRelay(
  c: Copione,
  cert: Certificato,
): Promise<{ porta: number; visto: Visto; chiudi: () => void }> {
  const { chiave, certificato } = cert;
  const visto: Visto = { inChiaro: [], cifrati: [], corpo: "" };

  function servi(sock: Socket | TLSSocket, sicuro: boolean, saluta = true) {
    let buffer = "";
    let fase: "comandi" | "utente" | "password" | "dati" = "comandi";
    const manda = async (testo: string, comando: string) => {
      const attesa = c.ritardi?.[comando];
      if (attesa) await new Promise((r) => setTimeout(r, attesa));
      if (sock.destroyed) return;
      if (c.spezza && testo.length > 4) {
        // Отговорът пристига на две TCP парчета, срязан НАСРЕД реда.
        const meta = Math.floor(testo.length / 2);
        sock.write(testo.slice(0, meta));
        await new Promise((r) => setTimeout(r, 15));
        if (!sock.destroyed) sock.write(testo.slice(meta));
      } else sock.write(testo);
    };

    const suRiga = async (riga: string) => {
      (sicuro ? visto.cifrati : visto.inChiaro).push(riga);
      if (fase === "dati") {
        if (riga === ".") {
          fase = "comandi";
          return manda("250 accodato\r\n", "DATA-FINE");
        }
        visto.corpo += riga + "\n";
        return;
      }
      if (fase === "utente") {
        visto.utente = Buffer.from(riga, "base64").toString("utf8");
        fase = "password";
        return manda("334 UGFzc3dvcmQ6\r\n", "AUTH-UTENTE");
      }
      if (fase === "password") {
        visto.password = Buffer.from(riga, "base64").toString("utf8");
        fase = "comandi";
        return manda("235 ok\r\n", "AUTH-PASSWORD");
      }
      const comando = riga.split(/[ :]/)[0].toUpperCase();
      if (c.chiudiDopo === comando) {
        sock.destroy();
        return;
      }
      if (c.silenzioDopo === comando) return;
      switch (comando) {
        case "EHLO": {
          const righe = ["250-finto.local"];
          if (!sicuro && c.starttls) righe.push("250-STARTTLS");
          righe.push("250-PIPELINING", "250 AUTH LOGIN");
          return manda(righe.join("\r\n") + "\r\n", "EHLO");
        }
        case "STARTTLS": {
          await manda("220 pronto\r\n", "STARTTLS");
          sock.removeAllListeners("data");
          const t = new TLSSocket(sock, {
            isServer: true,
            key: chiave,
            cert: certificato,
          });
          t.on("error", () => {});
          // БЕЗ нов поздрав: след STARTTLS релето чака EHLO (RFC 3207, 4.2).
          servi(t, true, false);
          return;
        }
        case "AUTH":
          fase = "utente";
          return manda("334 VXNlcm5hbWU6\r\n", "AUTH");
        case "MAIL":
          return manda("250 ok\r\n", "MAIL");
        case "RCPT":
          return manda((c.rcpt ?? "250 ok") + "\r\n", "RCPT");
        case "DATA":
          fase = "dati";
          return manda("354 avanti\r\n", "DATA");
        case "QUIT":
          await manda("221 ciao\r\n", "QUIT");
          sock.end();
          return;
        default:
          return manda("502 sconosciuto\r\n", comando);
      }
    };

    sock.setEncoding("utf8");
    sock.on("data", (chunk: string) => {
      buffer += chunk;
      let i: number;
      while ((i = buffer.indexOf("\r\n")) >= 0) {
        const riga = buffer.slice(0, i);
        buffer = buffer.slice(i + 2);
        void suRiga(riga);
      }
    });
    sock.on("error", () => {});
    if (saluta) void manda("220 finto.local ESMTP\r\n", "SALUTO");
  }

  // Отворените връзки се пазят, за да ги затворим ПРИНУДИТЕЛНО: `server.close()`
  // чака живите връзки, а висяща връзка е точно това, което тестваме.
  const connessi = new Set<Socket>();
  const server: Server = c.tlsDiretto
    ? createTlsServer({ key: chiave, cert: certificato }, (s) => {
        connessi.add(s);
        servi(s, true);
      })
    : createServer((s) => {
        connessi.add(s);
        servi(s, false);
      });

  return new Promise((res) => {
    server.listen(0, "127.0.0.1", () => {
      const indirizzo = server.address();
      const porta =
        typeof indirizzo === "object" && indirizzo ? indirizzo.port : 0;
      res({
        porta,
        visto,
        chiudi: () => {
          for (const s of connessi) s.destroy();
          server.close();
        },
      });
    });
  });
}

/**
 * `invia` с таван от страна на теста.
 *
 * Регресия в таймерите се проявява като УВИСВАНЕ: обещанието никога не се
 * урежда, а таванът на `node:test` отбелязва провал, но не прекъсва висящия
 * `await` — и `finally` със затварянето на стенда не се изпълнява. Тук
 * провалът е чиста грешка с име, в секунди.
 */
export function entro<T>(p: Promise<T>, ms: number): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    p,
    new Promise<never>((_, rej) => {
      t = setTimeout(
        () =>
          rej(new Error(`invia non ha risposto entro ${ms} ms: si è bloccata`)),
        ms,
      );
    }),
  ]).finally(() => clearTimeout(t));
}
