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

/**
 * Разгъва IPv6 до осем 16-битови групи; `null`, ако не е адрес.
 *
 * Нужно е, защото решението гледа и ВТОРАТА група (Teredo, документация), а тя
 * изчезва при съкратения запис.
 */
function gruppiIpv6(s: string): number[] | null {
  const parti = s.split("::");
  if (parti.length > 2) return null;
  // Вграденият IPv4 (`::ffff:1.2.3.4`) заема ДВЕ групи.
  const leggi = (t: string): number[] => {
    const p = t ? t.split(":").filter(Boolean) : [];
    const fine = p[p.length - 1];
    if (fine?.includes(".")) {
      const o = fine.split(".").map(Number);
      if (o.length !== 4 || o.some((n) => !Number.isInteger(n) || n > 255))
        return [NaN];
      return [
        ...p.slice(0, -1).map((g) => parseInt(g, 16)),
        (o[0] << 8) | o[1],
        (o[2] << 8) | o[3],
      ];
    }
    return p.map((g) => parseInt(g, 16));
  };
  const testa = leggi(parti[0]);
  const coda = parti.length === 2 ? leggi(parti[1]) : [];
  if (parti.length === 1) return testa.length === 8 ? testa : null;
  const mancanti = 8 - testa.length - coda.length;
  if (mancanti < 0) return null;
  const tutti = [...testa, ...new Array(mancanti).fill(0), ...coda];
  return tutti.some((g) => !Number.isInteger(g) || g < 0 || g > 0xffff)
    ? null
    : tutti;
}

/**
 * Вътрешен ли е IPv6 адрес — по ALLOWLIST, не по списък със забрани.
 *
 * ЗАЩО ОБЪРНАТО. Първата версия изброяваше лошите обхвати (`fc00::/7`,
 * `fe80::/10`, `ff00::/8`) и пускаше всичко останало. Това пропускаше ПЕТ
 * различни начина `169.254.169.254` да пътува в IPv6 дреха — NAT64
 * (`64:ff9b::/96`), 6to4 (`2002::/16`), IPv4-compatible (`::a9fe:a9fe`),
 * Teredo (`2001:0::/32`) и site-local (`fec0::/10`) — и нито един не прилича
 * на забранените. Списък със забрани върху пространство от 128 бита е обречен:
 * винаги има шести начин.
 *
 * Затова тук минава САМО глобалният unicast (`2000::/3`), от който се вадят
 * обхватите с вграден чужд IPv4 и тези, които не се рутират. Непознат запис е
 * вътрешен — fail-closed.
 */
function ipv6Interno(s: string): boolean {
  // IPv4 в IPv6: `::ffff:1.2.3.4` и `::ffff:0102:0304` са ЕДИН И СЪЩ адрес и
  // се съдят като IPv4 — иначе публичен получател по този запис би бил отказан.
  const mappato = /^::ffff:(?:0{1,4}:)?(.+)$/.exec(s);
  if (mappato) {
    const v = mappato[1];
    if (v.includes(".")) return ipv4Interno(v);
    const esa = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(v);
    if (!esa) return true;
    const n = (parseInt(esa[1], 16) << 16) | parseInt(esa[2], 16);
    return ipv4Interno(
      [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join("."),
    );
  }

  const g = gruppiIpv6(s);
  if (!g) return true;
  // Извън глобалния unicast няма какво да се търси навън: `::`, `::1`,
  // `64:ff9b::/96`, `fc00::/7`, `fe80::/10`, `fec0::/10`, `ff00::/8` — всички.
  if (g[0] < 0x2000 || g[0] > 0x3fff) return true;
  // Вътре в него — обхватите, които носят чужд IPv4 или не се рутират.
  if (g[0] === 0x2002) return true; // 6to4: следващите 32 бита СА IPv4
  if (g[0] === 0x2001 && g[1] === 0x0000) return true; // Teredo
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true; // документация
  if (g[0] === 0x3ffe) return true; // 6bone (отпаднал)
  return false;
}

/**
 * Изглежда ли името вътрешно — БЕЗ да пита DNS.
 *
 * ИМЕТО КАЗВА ТОЧНО КОЛКОТО ФУНКЦИЯТА ЗНАЕ. Предишното (`hostInterno`) звучеше
 * като присъда „този хост е вътрешен"; тук се гледа само НИЗЪТ, а публично
 * име, което сочи 127.0.0.1, минава спокойно. Затова е бърза проверка при
 * ЗАПИС на адрес — спестява на човека грешка чак при първата доставка — и
 * НИКОГА не е защитата. Защитата е `lookupSicuro`, която съди резолвния адрес
 * в мига на свързването.
 */
export function nomeHostSospetto(hostname: string): boolean {
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
/**
 * Резолверът е ПАРАМЕТЪР — единственият шев в този модул.
 *
 * Не за гъвкавост: без него успешният път (адресът е публичен, сокетът тръгва)
 * не може да бъде изпълнен в тест, който не излиза в интернет — а точно там
 * живее договорът с `net.connect`. Подразбирането е истинският резолвер, тоест
 * продукционното поведение е непроменено.
 */
export type Risolutore = typeof lookupDns;

export function lookupSicuro(
  hostname: string,
  opzioni: unknown,
  callback: Richiamo,
  risolvi: Risolutore = lookupDns,
): void {
  const o =
    typeof opzioni === "number"
      ? { family: opzioni }
      : ((opzioni ?? {}) as Record<string, unknown>);
  risolvi(hostname, { ...o, all: true }, (err, indirizzi) => {
    if (err) return callback(err, "");
    const rifiuto = valutaIndirizzi(hostname, indirizzi);
    if (rifiuto) return callback(rifiuto, "");
    if (o.all) return callback(null, indirizzi);
    callback(null, indirizzi[0].address, indirizzi[0].family);
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
    /** Само за тест — виж `Risolutore`. Подразбирането е системният DNS. */
    risolutore?: Risolutore;
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
    if (nomeHostSospetto(u.hostname))
      return rifiuta(new ErroreIndirizzoInterno(u.hostname));

    const req = requestHttps(
      u,
      {
        method: "POST",
        headers: {
          ...opzioni.intestazioni,
          "Content-Length": Buffer.byteLength(opzioni.corpo),
        },
        lookup: (h, o, cb) =>
          lookupSicuro(h, o, cb as Richiamo, opzioni.risolutore),
        timeout: opzioni.timeoutMs,
      },
      /* c8 ignore start -- успешен отговор иска ВАЛИДЕН TLS сертификат:
         `postEsterno` не приема самоподписан и няма опция за собствен CA
         (нарочно — това би било копче за отслабване на защитата). Пътят на
         ГРЕШКАТА е тестван (`rete.test.ts`, прекъсната връзка). */
      (res) => {
        // Изчерпваме потока: без това сокетът остава зает до таймаут.
        res.resume();
        res.on("error", rifiuta);
        res.on("end", () => risolvi({ stato: res.statusCode ?? 0 }));
      },
      /* c8 ignore stop */
    );
    // ОБЩ СРОК, НЕ САМО БЕЗДЕЙСТВИЕ. `timeout` на `https.request` е idle
    // таймаут: получател, който капе по байт, го нулира вечно. `fetch` имаше
    // `AbortSignal.timeout`, който покриваше и това — при смяната се загуби.
    const scadenza = setTimeout(
      () => req.destroy(new Error("timeout")),
      opzioni.timeoutMs,
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", rifiuta);
    // ЗАТВАРЯНЕ БЕЗ УРЕДЕН ПРОМИС Е НЕУСПЕХ, НЕ ТИШИНА. Прекъсване НАСРЕД
    // тялото не поражда задължително `error`; `end` не идва. Промис, който
    // чака само тях, увисва — а доставката е последователен `for … await`,
    // тоест един зъл получател спираше целия пакет. `rifiuta` след `risolvi`
    // е без ефект, затова закачането е безусловно.
    req.on("close", () => {
      clearTimeout(scadenza);
      rifiuta(new Error("connessione chiusa senza risposta"));
    });
    req.end(opzioni.corpo);
  });
}
