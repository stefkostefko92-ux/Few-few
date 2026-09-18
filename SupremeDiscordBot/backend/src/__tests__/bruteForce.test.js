// backend/src/__tests__/bruteForce.test.js
// Гейт на защитата срещу налучкване на тайни.
//
// ЗАЩО (заявка на собственика: „нищо да не може да се брутфорсва“): рейт
// лимитерите броят ВСИЧКИ заявки еднакво и затова пазят ресурса, но не тайната.
// Стандартът (NIST SP 800-63B §5.2.2, OWASP ASVS V2.2.1) иска дроселиране на
// НЕУСПЕШНИТЕ опити с растящо наказание.
//
// Тестът пази свойствата, които правят защитата истинска, а не украса:
//   1. блокира след праг и наказанието РАСТЕ
//   2. успехът чисти историята (човешката грешка не се трупа вечно)
//   3. източниците и обхватите са НЕЗАВИСИМИ (един нападател не заключва света)
//   4. ПОДМРЕЖАТА хваща въртенето на IP-та — реалното заобикаляне на per-IP
//   5. при масирана атака праговете се СВИВАТ, без да се блокират всички
//   6. Redis дава трайност, а падналият Redis НИКОГА не отключва блокиран
//   7. паметта е ОГРАНИЧЕНА (иначе самата защита е DoS вектор)
import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import request from "supertest";
import {
  check, checkSync, recordFailure, recordSuccess, bruteForceGuard, subnetOf, wideNetOf,
  _resetBruteForceState, _stateSize,
  BRUTE_FORCE_STEPS, BRUTE_FORCE_SUBNET_STEPS, BRUTE_FORCE_WIDE_STEPS, BRUTE_FORCE_MAX_ENTRIES,
  BRUTE_FORCE_GLOBAL_THRESHOLD, BRUTE_FORCE_TIGHTENED_STEP,
} from "../lib/bruteForce.js";
import { _setRedisForTests } from "../lib/redisClient.js";

const auditCreate = vi.fn().mockResolvedValue({});
vi.mock("../lib/prisma.js", () => ({ prisma: { auditLog: { create: (...a) => auditCreate(...a) } } }));

const IP_STEP = [...BRUTE_FORCE_STEPS].sort((a, b) => a.failures - b.failures)[0];
const NET_STEP = [...BRUTE_FORCE_SUBNET_STEPS].sort((a, b) => a.failures - b.failures)[0];

/**
 * Redis двойник, който УВАЖАВА TTL и `NX`.
 *
 * ЗАЩО ТОЛКОВА ПОДРОБЕН (червен екип, 12.08.2026): първата версия правеше
 * `expire()` НУЛЕВА операция. Заради това цял клас дефекти беше НЕВИДИМ за
 * гейта — а точно там се оказа реален блокер: `EXPIRE` без `NX` подновява
 * срока при ВСЯКО увеличение, значи броячът никога не изтича и от прозоречен
 * става КУМУЛАТИВЕН. Двойник, който игнорира срока, не може да види разлика
 * между двете. Часовникът е подаваем, за да се симулира изтичане без чакане.
 */
function fakeRedis(clock = { now: 0 }) {
  const store = new Map();          // key → { value, expiresAt|null }
  const live = (k) => {
    const e = store.get(k);
    if (!e) return null;
    if (e.expiresAt !== null && e.expiresAt <= clock.now) { store.delete(k); return null; }
    return e;
  };
  const api = {
    store, clock,
    async mget(keys) { return keys.map((k) => live(k)?.value ?? null); },
    async set(k, v, _mode, ttlSec) {
      store.set(k, { value: v, expiresAt: ttlSec ? clock.now + ttlSec * 1000 : null });
      return "OK";
    },
    async del(...keys) { for (const k of keys) store.delete(k); return keys.length; },
    pipeline() {
      const ops = [];
      const p = {
        incr(k) { ops.push(["incr", k]); return p; },
        expire(k, sec, mode) { ops.push(["expire", k, sec, mode]); return p; },
        async exec() {
          return ops.map(([op, k, sec, mode]) => {
            if (op === "incr") {
              const cur = live(k);
              const next = (Number(cur?.value) || 0) + 1;
              store.set(k, { value: String(next), expiresAt: cur?.expiresAt ?? null });
              return [null, next];
            }
            // EXPIRE: с `NX` слага срок САМО ако още няма такъв — точно
            // разликата между прозоречен и кумулативен брояч.
            const e = live(k);
            if (e) {
              if (mode === "NX" && e.expiresAt !== null) return [null, 0];
              e.expiresAt = clock.now + sec * 1000;
            }
            return [null, 1];
          });
        },
      };
      return p;
    },
  };
  return api;
}

beforeEach(() => {
  _resetBruteForceState();
  _setRedisForTests(false);   // по подразбиране: без Redis (само памет)
  auditCreate.mockClear();
});

describe("прагове и растящо наказание", () => {
  it("под прага НЕ блокира — нормалната човешка грешка минава", async () => {
    for (let i = 0; i < IP_STEP.failures - 1; i++) await recordFailure("apikey", "1.2.3.4");
    expect((await check("apikey", "1.2.3.4")).blocked).toBe(false);
  });

  it("на прага блокира и връща време за изчакване", async () => {
    let last;
    for (let i = 0; i < IP_STEP.failures; i++) last = await recordFailure("apikey", "1.2.3.4");
    expect(last.blocked).toBe(true);
    expect(last.retryAfterSec).toBeGreaterThan(0);
  });

  it("наказанието РАСТЕ с упорството — не е плоско", async () => {
    const steps = [...BRUTE_FORCE_STEPS].sort((a, b) => a.failures - b.failures);
    const seen = [];
    let n = 0;
    for (const s of steps) {
      while (n < s.failures) { await recordFailure("botsecret", "9.9.9.9"); n++; }
      seen.push((await check("botsecret", "9.9.9.9")).retryAfterSec);
    }
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThan(seen[i - 1]);
  });
});

describe("успех и изолация", () => {
  it("успехът чисти историята по източник", async () => {
    for (let i = 0; i < IP_STEP.failures - 1; i++) await recordFailure("apikey", "1.2.3.4");
    await recordSuccess("apikey", "1.2.3.4");
    for (let i = 0; i < IP_STEP.failures - 1; i++) await recordFailure("apikey", "1.2.3.4");
    expect((await check("apikey", "1.2.3.4")).blocked).toBe(false);
  });

  it("обхватите са НЕЗАВИСИМИ — блокиран за архив не значи блокиран за API", async () => {
    for (let i = 0; i < IP_STEP.failures; i++) await recordFailure("archive", "8.8.8.8");
    expect((await check("archive", "8.8.8.8")).blocked).toBe(true);
    expect((await check("apikey", "8.8.8.8")).blocked).toBe(false);
  });

  it("одитът е ВЕДНЪЖ на блокировка и НЕ съдържа пълния адрес (GDPR)", async () => {
    for (let i = 0; i < IP_STEP.failures + 8; i++) await recordFailure("apikey", "3.3.3.3");
    await new Promise((r) => setTimeout(r, 10));
    const ipBlocks = auditCreate.mock.calls.filter((c) => c[0].data.metadata.kind === "ip");
    expect(ipBlocks).toHaveLength(1);
    expect(JSON.stringify(ipBlocks[0][0].data.metadata)).not.toContain("3.3.3.3");
  });
});

describe("слой 2 — подмрежата хваща въртенето на IP-та", () => {
  it("subnetOf свежда IPv4 до /24, IPv6 до /64 и нормализира mapped адрес", () => {
    expect(subnetOf("1.2.3.4")).toBe("1.2.3.0/24");
    expect(subnetOf("::ffff:1.2.3.4")).toBe("1.2.3.0/24");   // един бюджет, не два
    expect(subnetOf("2a04:4e42:8e:1:2:3:4:5")).toBe("2a04:4e42:8e:1::/64");
  });

  it("нападател, сменящ IP в една мрежа, пак бива спрян", async () => {
    // Всеки адрес поотделно остава ПОД прага по източник…
    const perIp = IP_STEP.failures - 1;
    let sent = 0;
    for (let host = 1; sent < NET_STEP.failures; host++) {
      for (let i = 0; i < perIp && sent < NET_STEP.failures; i++, sent++) {
        await recordFailure("apikey", `77.0.0.${host}`);
      }
    }
    // …но подмрежата вижда сбора и блокира целия /24.
    const res = await check("apikey", "77.0.0.250");
    expect(res.blocked, "подмрежовият слой трябваше да спре въртенето на адреси").toBe(true);
  });

  it("успех по един адрес НЕ изтрива следата на подмрежата", async () => {
    for (let i = 0; i < NET_STEP.failures; i++) await recordFailure("apikey", `78.0.0.${(i % 200) + 1}`);
    await recordSuccess("apikey", "78.0.0.5");
    expect((await check("apikey", "78.0.0.5")).blocked).toBe(true);
  });
});

describe("слой 2б — широката мрежа затваря въртенето в цял блок", () => {
  it("wideNetOf свежда IPv4 до /16, IPv6 до /48, нормализира mapped адрес", () => {
    expect(wideNetOf("1.2.3.4")).toBe("1.2.0.0/16");
    expect(wideNetOf("::ffff:1.2.3.4")).toBe("1.2.0.0/16");
    expect(wideNetOf("2a04:4e42:8e:1:2:3:4:5")).toBe("2a04:4e42:8e::/48");
  });

  it("IPv6 нападател със СВОЙ /48 не се измъква, сменяйки /64 мрежи", async () => {
    // Всяка /64 остава ПОД подмрежовия праг — точно поведението, което прави
    // слой 2 безсилен при IPv6 (един /48 съдържа 65 536 различни /64).
    const perNet = NET_STEP.failures - 1;
    const wideStep = [...BRUTE_FORCE_WIDE_STEPS].sort((a, b) => a.failures - b.failures)[0];
    let sent = 0;
    for (let net = 0; sent < wideStep.failures; net++) {
      for (let i = 0; i < perNet && sent < wideStep.failures; i++, sent++) {
        await recordFailure("apikey", `2a04:4e42:8e:${net.toString(16)}::${i}`);
      }
    }
    const res = await check("apikey", "2a04:4e42:8e:ffff::1");
    expect(res.blocked, "широкият слой трябваше да хване въртенето в /48").toBe(true);
  });

  it("широкият слой НЕ пипа съседна мрежа извън блока", async () => {
    const wideStep = [...BRUTE_FORCE_WIDE_STEPS].sort((a, b) => a.failures - b.failures)[0];
    for (let i = 0; i < wideStep.failures; i++) {
      await recordFailure("apikey", `2a04:4e42:8e:${(i % 300).toString(16)}::1`);
    }
    expect((await check("apikey", "2a04:4e42:8e:1::9")).blocked).toBe(true);
    // Друг /48 на същия доставчик си остава свободен.
    expect((await check("apikey", "2a04:4e42:99:1::9")).blocked).toBe(false);
  });
});

describe("не-IP ключове (напр. потребител при верификация)", () => {
  it("нямат мрежови слоеве — null, вместо фалшива група", () => {
    expect(subnetOf("panel1:222222222222222222")).toBeNull();
    expect(wideNetOf("panel1:222222222222222222")).toBeNull();
  });

  it("раждат ТОЧНО един запис, не три", async () => {
    _resetBruteForceState();
    await recordFailure("verify", "panel1:222222222222222222");
    expect(_stateSize()).toBe(1);
  });

  it("ескалират нормално и се чистят при успех", async () => {
    const key = "panel1:333333333333333333";
    for (let i = 0; i < IP_STEP.failures; i++) await recordFailure("verify", key);
    expect((await check("verify", key)).blocked).toBe(true);
    await recordSuccess("verify", key);
    expect((await check("verify", key)).blocked).toBe(false);
  });

  it("двама различни потребители не си пречат", async () => {
    for (let i = 0; i < IP_STEP.failures; i++) await recordFailure("verify", "p:aaa");
    expect((await check("verify", "p:aaa")).blocked).toBe(true);
    expect((await check("verify", "p:bbb")).blocked).toBe(false);
  });
});

describe("броячът в Redis е ПРОЗОРЕЧЕН, не кумулативен", () => {
  // ЧЕРВЕН ЕКИП (12.08.2026, блокер): `EXPIRE` без `NX` подновява срока при
  // всяко увеличение. Бавен нападател (по един провал точно преди изтичане)
  // трупа брояча ВЕЧНО, а решението е „по-лошото от памет и Redis" — значи
  // раздутата стойност от Redis печели и блокира невинни от същата мрежа.
  // Същата поправка вече беше приложена в rateLimitStore.js — но не и тук.
  it("бавните провали НЕ се трупат безкрайно — срокът не се подновява", async () => {
    const clock = { now: Date.now() };
    const redis = fakeRedis(clock);
    _setRedisForTests(redis);

    // По един провал на всеки „14 минути" (под 15-минутния прозорец), 20 пъти.
    for (let i = 0; i < 20; i++) {
      _resetBruteForceState();                 // паметта забравя (различен процес)
      await recordFailure("apikey", "60.60.60.60");
      clock.now += 14 * 60 * 1000;
    }

    const counter = redis.store.get("bf:ip:apikey:60.60.60.60");
    const value = Number(counter?.value ?? 0);
    expect(value, "броячът трябва да се нулира с прозореца, а не да расте вечно")
      .toBeLessThanOrEqual(2);
  });

  it("срокът се слага веднъж и ключът реално изтича", async () => {
    const clock = { now: Date.now() };
    const redis = fakeRedis(clock);
    _setRedisForTests(redis);

    await recordFailure("apikey", "61.61.61.61");
    await recordFailure("apikey", "61.61.61.61");
    clock.now += 16 * 60 * 1000;               // след прозореца
    _resetBruteForceState();
    await recordFailure("apikey", "61.61.61.61");

    expect(Number(redis.store.get("bf:ip:apikey:61.61.61.61")?.value))
      .toBe(1);                                 // започва отначало
  });
});

describe("слой 3 — адаптивно затягане при масирана атака", () => {
  it("под атака прагът пада, но НЕ блокира всички без вина", async () => {
    // Пълним глобалния брояч от много различни мрежи (без да палим подмрежов праг).
    for (let i = 0; i < BRUTE_FORCE_GLOBAL_THRESHOLD; i++) {
      await recordFailure("apikey", `10.${(i >> 8) & 255}.${i & 255}.1`);
    }
    // Нов източник: под нормалния праг (5), но над свития (2).
    const ip = "199.199.199.199";
    for (let i = 0; i < BRUTE_FORCE_TIGHTENED_STEP.failures; i++) await recordFailure("apikey", ip);
    expect((await check("apikey", ip)).blocked).toBe(true);

    // Който НЕ е бъркал, си остава свободен — затягането не е глобален отказ.
    expect((await check("apikey", "203.0.113.7")).blocked).toBe(false);
  });
});

describe("слой 4 — Redis трайност и поведение при отказ", () => {
  it("блокировката се записва в Redis, за да преживее рестарт", async () => {
    const redis = fakeRedis();
    _setRedisForTests(redis);
    for (let i = 0; i < IP_STEP.failures; i++) await recordFailure("apikey", "4.4.4.4");
    const keys = [...redis.store.keys()];
    expect(keys.some((k) => k.startsWith("bf:blk:apikey:4.4.4.4"))).toBe(true);
  });

  it("след „рестарт“ (празна памет) блокировката от Redis важи", async () => {
    const redis = fakeRedis();
    _setRedisForTests(redis);
    for (let i = 0; i < IP_STEP.failures; i++) await recordFailure("apikey", "4.4.4.5");
    _resetBruteForceState();                       // симулира рестарт на процеса
    expect((await check("apikey", "4.4.4.5")).blocked).toBe(true);
  });

  it("паднал Redis НЕ отключва блокиран — паметта решава", async () => {
    for (let i = 0; i < IP_STEP.failures; i++) await recordFailure("apikey", "4.4.4.6");
    _setRedisForTests({                             // всяка команда гърми
      async mget() { throw new Error("redis down"); },
      async set() { throw new Error("redis down"); },
      async del() { throw new Error("redis down"); },
      pipeline() { return { incr() { return this; }, expire() { return this; }, async exec() { throw new Error("redis down"); } }; },
    });
    expect((await check("apikey", "4.4.4.6")).blocked).toBe(true);
  });

  it("паднал Redis не хвърля при запис на провал", async () => {
    _setRedisForTests({
      async mget() { throw new Error("down"); },
      async set() { throw new Error("down"); },
      async del() { throw new Error("down"); },
      pipeline() { return { incr() { return this; }, expire() { return this; }, async exec() { throw new Error("down"); } }; },
    });
    await expect(recordFailure("apikey", "4.4.4.7")).resolves.toBeTruthy();
  });
});

describe("самата защита не е DoS вектор", () => {
  // Стрес-тест: 23 000 последователни опита. Бавен е заради самите await-и,
  // не заради защитата — затова таванът е вдигнат съзнателно, вместо да се
  // свали броят и тестът да спре да доказва границата.
  it("паметта е ограничена при нападател, който върти източници", async () => {
    for (let i = 0; i < BRUTE_FORCE_MAX_ENTRIES + 3000; i++) {
      await recordFailure("apikey", `12.${(i >> 16) & 255}.${(i >> 8) & 255}.${i & 255}`);
    }
    expect(_stateSize()).toBeLessThanOrEqual(BRUTE_FORCE_MAX_ENTRIES + 2);
  }, 60_000);
});

describe("bruteForceGuard (Express)", () => {
  function app() {
    const a = express();
    a.use(bruteForceGuard("apikey"));
    a.get("/x", (_req, res) => res.json({ ok: true }));
    return a;
  }

  it("пуска, докато няма блокировка", async () => {
    expect((await request(app()).get("/x")).status).toBe(200);
  });

  it("блокираните получават 429 + Retry-After ПРЕДИ маршрута", async () => {
    for (let i = 0; i < IP_STEP.failures; i++) await recordFailure("apikey", "::ffff:127.0.0.1");
    for (let i = 0; i < IP_STEP.failures; i++) await recordFailure("apikey", "127.0.0.1");
    const res = await request(app()).get("/x");
    expect(res.status).toBe(429);
    expect(res.headers["retry-after"]).toBeTruthy();
    expect(res.body.code).toBe("TOO_MANY_FAILED_ATTEMPTS");
  });

  it("checkSync вижда същата блокировка без изчакване на Redis", async () => {
    for (let i = 0; i < IP_STEP.failures; i++) await recordFailure("apikey", "6.6.6.6");
    expect(checkSync("apikey", "6.6.6.6").blocked).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Видимост на атаката за седмичния преглед (одит етап 13, 12.08.2026).
//
// `legal/breach-procedure.md` изброява „Rate limiter hits on auth endpoints
// (weekly review)" като източник за ОТКРИВАНЕ на пробив. Източникът е
// одиторският ред `SECURITY_BRUTE_FORCE_BLOCK`. Флагът `entry.logged` пази
// ЕДИН ред на епизод (иначе всеки провал пише ред в базата — усилвател на
// DoS), но не се въоръжаваше пак: източник, който удря дни наред, оставяше
// ЕДИН ред за цялата кампания. Прегледът виждаше еднократна засечка вместо
// продължаваща атака — тоест процедурата обещаваше откриваемост, която кодът
// не даваше.
describe("одиторската следа отразява ПОВТОРНИТЕ епизоди, не само първия", () => {
  const flush = () => new Promise((r) => setTimeout(r, 10));

  it("нов епизод след изтекла блокировка пише нов ред", async () => {
    const real = Date.now;
    let clock = real();
    vi.spyOn(Date, "now").mockImplementation(() => clock);
    try {
      for (let i = 0; i < IP_STEP.failures; i++) await recordFailure("apikey", "77.77.77.77");
      await flush();
      expect(auditCreate).toHaveBeenCalledTimes(1);

      // Напред след блокировката, но ВЪТРЕ в прозореца: записът оцелява
      // прочистването, значи проверяваме точно повторното въоръжаване, а не
      // случайно изтрит запис.
      clock += IP_STEP.blockMs + 1000;
      expect(IP_STEP.blockMs + 1000).toBeLessThan(15 * 60 * 1000);

      await recordFailure("apikey", "77.77.77.77");
      await flush();
      expect(auditCreate, "втори епизод остана невидим за прегледа")
        .toHaveBeenCalledTimes(2);
    } finally {
      Date.now = real;
    }
  });

  it("но НЕ пише ред на всеки провал в рамките на един епизод", async () => {
    // Обратната опасност: ред на всяко удряне прави от защитата усилвател на
    // DoS срещу собствената ни база.
    for (let i = 0; i < IP_STEP.failures + 15; i++) await recordFailure("apikey", "78.78.78.78");
    await flush();
    expect(auditCreate).toHaveBeenCalledTimes(1);
  });
});
