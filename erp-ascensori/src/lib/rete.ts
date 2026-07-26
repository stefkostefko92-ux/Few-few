// Изходящите връзки: единствената врата навън.
//
// ЗАЩО СЪЩЕСТВУВА. Две места в продукта карат НАШИЯ сървър да отиде на адрес,
// зададен от КЛИЕНТА: webhook абонаментът (`/api/webhooks`) и посредникът за
// SDI (`sdi/trasmissione.ts`). Това е класическият SSRF: щом чужд текст решава
// къде отиваме, вътрешната мрежа и метаданните на облака
// (`169.254.169.254`) стават достъпни през нас — включително от клиент, който
// няма никакъв друг достъп до инфраструктурата.
//
// ЗАЩО ПРОВЕРКА НА ИМЕТО НЕ СТИГА (и защо този файл замени по-ранната).
// Проверката на `hostname` като НИЗ пропуска три неща наведнъж:
//
//   1. ИМЕ, СОЧЕЩО НАВЪТРЕ. `https://qualcosa.example/` с A-запис
//      `169.254.169.254` минава всяка проверка на низа — там няма нищо за
//      разпознаване. Резолвирането е единственият начин да се види къде води.
//   2. IPv4 В IPv6 ДРЕХА. `https://[::ffff:169.254.169.254]/` дава hostname
//      `[::ffff:a9fe:a9fe]` — не съвпада с никакъв IPv4 шаблон, а на двойния
//      стек рутира точно към link-local адреса.
//   3. ПРОМЯНА МЕЖДУ ПРОВЕРКАТА И ВРЪЗКАТА (DNS rebinding). Проверка при
//      ЗАПИСА на абонамента говори за миналото: доставката става часове по-късно
//      и тогава записът може вече да сочи другаде.
//
// Затова тук проверката е на РЕЗОЛВНИЯ адрес, В МОМЕНТА НА СВЪРЗВАНЕТО:
// `lookupSicuro` се подава на самия сокет, тоест няма прозорец между „провери"
// и „свържи се" — сокетът отива точно там, където проверката е одобрила.
//
// И ЗАЩО НЕ `fetch`. `fetch` следва пренасочвания сам: публичен хост връща
// `302` към `http://169.254.169.254/` и цялата проверка е заобиколена, без
// изобщо да сме я нарушили. `https.request` НЕ следва пренасочване — отговорът
// `3xx` се брои като неуспешна доставка и това е правилният изход.

import { lookup as lookupDns } from "node:dns";
import { request as requestHttps } from "node:https";
import type { LookupAddress } from "node:dns";

/** Имена, които никога не сочат навън, независимо от DNS. */
const SUFFISSI_INTERNI = [".localhost", ".internal", ".local", ".home.arpa"];

/**
 * Вътрешен ли е ЛИТЕРАЛЕН адрес (IPv4 или IPv6).
 *
 * Работи върху адрес, не върху име: това е проверката, която се прилага СЛЕД
 * резолвирането. Обхватът е нарочно широк — всичко, което не е глобален
 * публичен адрес, е отказано (fail-closed): по-добре отказан легитимен
 * получател, който после се обявява изрично, отколкото тих път навътре.
 */
export function ipInterno(indirizzo: string): boolean {
  const s = indirizzo
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "");
  if (!s) return true;
  // Зоната на link-local IPv6 (`fe80::1%eth0`) не участва в преценката.
  const senzaZona = s.split("%")[0];
  return senzaZona.includes(":")
    ? ipv6Interno(senzaZona)
    : ipv4Interno(senzaZona);
}

function ipv4Interno(s: string): boolean {
  const p = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s);
  if (!p) return true; // не е адрес → не го пускаме като адрес
  const [a, b] = [Number(p[1]), Number(p[2])];
  if (p.slice(1).some((n) => Number(n) > 255)) return true;
  if (a === 0 || a === 10 || a === 127) return true; // текущ/частен/loopback
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT (RFC 6598)
  if (a === 169 && b === 254) return true; // link-local + метаданни на облака
  if (a === 172 && b >= 16 && b <= 31) return true; // частен
  if (a === 192 && b === 0) return true; // IETF протоколни (вкл. 192.0.0.0/24)
  if (a === 192 && b === 168) return true; // частен
  if (a === 198 && (b === 18 || b === 19)) return true; // бенчмарк (RFC 2544)
  if (a >= 224) return true; // multicast + резервирано + broadcast
  return false;
}

function ipv6Interno(s: string): boolean {
  if (s === "::" || s === "::1") return true; // неопределен + loopback
  // IPv4 в IPv6: `::ffff:1.2.3.4` и `::ffff:0102:0304` са ЕДИН И СЪЩ адрес.
  // Точката 2 от коментара отгоре — преценява се вложеният IPv4.
  const mappato = /^::ffff:(?:0{1,4}:)?(.+)$/.exec(s);
  if (mappato) {
    const v = mappato[1];
    if (v.includes(".")) return ipv4Interno(v);
    const esa = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(v);
    if (esa) {
      const n = (parseInt(esa[1], 16) << 16) | parseInt(esa[2], 16);
      return ipv4Interno(
        [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(
          ".",
        ),
      );
    }
    return true;
  }
  const primo = parseInt(s.split(":")[0] || "0", 16);
  if ((primo & 0xfe00) === 0xfc00) return true; // fc00::/7 — unique local
  if ((primo & 0xffc0) === 0xfe80) return true; // fe80::/10 — link-local
  if (primo === 0x100) return true; // 100::/64 — discard-only
  if ((primo & 0xff00) === 0xff00) return true; // ff00::/8 — multicast
  return false;
}

/**
 * Вътрешен ли е ХОСТЪТ по самото си име.
 *
 * Бърза проверка при ЗАПИС на адрес — тя не замества резолвирането, а спестява
 * на потребителя грешка чак при първата доставка. Истинската защита е
 * `lookupSicuro`.
 */
export function hostInterno(hostname: string): boolean {
  const h = hostname.trim().toLowerCase().replace(/\.$/, "");
  if (!h) return true;
  if (h === "localhost") return true;
  if (SUFFISSI_INTERNI.some((s) => h.endsWith(s))) return true;
  // Име без точка (`db`, `postgres`) се резолвира от вътрешния DNS/hosts.
  if (!h.includes(".") && !h.includes(":")) return true;
  const letterale = /^[\d.]+$/.test(h) || h.includes(":");
  return letterale ? ipInterno(h) : false;
}

/** Отказът е СОБСТВЕН тип: така доставката различава „вътрешен" от „няма мрежа". */
export class ErroreIndirizzoInterno extends Error {
  constructor(hostname: string) {
    super(`indirizzo interno non ammesso: ${hostname}`);
    this.name = "ErroreIndirizzoInterno";
  }
}

type Richiamo = (
  err: NodeJS.ErrnoException | null,
  indirizzo: string | LookupAddress[],
  famiglia?: number,
) => void;

/**
 * РЕШЕНИЕТО, отделено от резолвирането.
 *
 * Изнесено като чиста функция нарочно: „кои адреси допускаме" е правилото,
 * което трябва да носи тестове, а `dns.lookup` е вход-изход, който в тест
 * може само да бъде имитиран. Така проверимата част е цялата, а обвивката
 * отдолу е три реда, които не решават нищо.
 *
 * Отказ при „ПОНЕ ЕДИН вътрешен", не филтриране на лошите: име, което връща и
 * публичен, и вътрешен адрес, е точно подписът на rebinding. Тук не се търси
 * работещият път, а честният отговор — а той е отказ.
 */
export function valutaIndirizzi(
  hostname: string,
  indirizzi: LookupAddress[],
): NodeJS.ErrnoException | null {
  if (!indirizzi.length)
    return Object.assign(new Error(`nessun indirizzo per ${hostname}`), {
      code: "ENOTFOUND",
    });
  if (indirizzi.some((i) => ipInterno(i.address)))
    return Object.assign(new ErroreIndirizzoInterno(hostname), {
      code: "EACCES",
    });
  return null;
}

/**
 * `lookup` за сокета: резолвира и предава решението на `valutaIndirizzi`.
 *
 * Подписът следва `dns.lookup`, защото Node го подава на `net.connect` както
 * си е (включително `all: true`, което Node ≥ 20 ползва за happy eyeballs).
 */
export function lookupSicuro(
  hostname: string,
  opzioni: unknown,
  callback: Richiamo,
): void {
  const o =
    typeof opzioni === "number"
      ? { family: opzioni }
      : ((opzioni ?? {}) as Record<string, unknown>);
  lookupDns(hostname, { ...o, all: true }, (err, indirizzi) => {
    if (err) return callback(err, "");
    const rifiuto = valutaIndirizzi(hostname, indirizzi);
    if (rifiuto) return callback(rifiuto, "");
    /* c8 ignore start -- успешният път иска име, което се резолвира до
       ПУБЛИЧЕН адрес, тоест реален DNS: тест, който излиза навън, пада,
       когато мрежата кихне. Решението е в `valutaIndirizzi` и е тествано. */
    if (o.all) return callback(null, indirizzi);
    callback(null, indirizzi[0].address, indirizzi[0].family);
    /* c8 ignore stop */
  });
}

export interface EsitoPost {
  stato: number;
}

/**
 * POST към ВЪНШЕН адрес — единственият начин, по който продуктът излиза навън.
 *
 * Тялото на отговора се изхвърля нарочно: то е чуждо съдържание, никой не го
 * чете и задържането му би направило от сляпо SSRF — виждащо.
 */
export function postEsterno(
  url: string,
  opzioni: {
    intestazioni: Record<string, string>;
    corpo: string;
    timeoutMs: number;
  },
): Promise<EsitoPost> {
  return new Promise((risolvi, rifiuta) => {
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      return rifiuta(new Error("URL non valido"));
    }
    if (u.protocol !== "https:")
      return rifiuta(new Error("solo HTTPS è ammesso"));
    if (hostInterno(u.hostname))
      return rifiuta(new ErroreIndirizzoInterno(u.hostname));

    /* c8 ignore start -- От тук нататък се иска РЕАЛЕН външен хост: всичко
       локално (127.0.0.1, localhost) е отказано преди това от самата защита,
       а тест, който излиза в интернет, е тест, който пада, когато мрежата
       кихне. Проверимите решения — схема, вътрешен адрес, резолвиране — са
       над този ред и всички носят тестове (`__tests__/rete.test.ts`). */
    const req = requestHttps(
      u,
      {
        method: "POST",
        headers: {
          ...opzioni.intestazioni,
          "Content-Length": Buffer.byteLength(opzioni.corpo),
        },
        lookup: lookupSicuro,
        timeout: opzioni.timeoutMs,
      },
      (res) => {
        // Изчерпваме потока: без това сокетът остава зает до таймаут.
        res.resume();
        res.on("end", () => risolvi({ stato: res.statusCode ?? 0 }));
      },
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", rifiuta);
    req.end(opzioni.corpo);
    /* c8 ignore stop */
  });
}
