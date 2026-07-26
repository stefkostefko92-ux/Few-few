import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  componiScadenzario,
  totaliPerFascia,
  perDebitore,
  fasciaPerRitardo,
  giorniTra,
  livelloSuggerito,
  type Credito,
  FASCE,
  LIVELLI_SOLLECITO,
} from "../fiscale/scadenzario";

const OGGI = new Date("2026-07-26T09:00:00Z");
const giorniFa = (n: number) => new Date(OGGI.getTime() - n * 86_400_000);

const credito = (over: Partial<Credito> = {}): Credito => ({
  fatturaId: "f1",
  numero: "2026/0001",
  data: giorniFa(120),
  dataScadenza: giorniFa(45),
  residuoCentesimi: 36600,
  debitoreId: "d1",
  debitore: "Condominio Via Verdi",
  ...over,
});

describe("кофите по възраст", () => {
  test("границите се хващат от двете страни", () => {
    assert.equal(fasciaPerRitardo(-1), "corrente");
    assert.equal(fasciaPerRitardo(0), "g0_30");
    assert.equal(fasciaPerRitardo(30), "g0_30");
    assert.equal(fasciaPerRitardo(31), "g31_60");
    assert.equal(fasciaPerRitardo(60), "g31_60");
    assert.equal(fasciaPerRitardo(61), "g61_90");
    assert.equal(fasciaPerRitardo(90), "g61_90");
    assert.equal(fasciaPerRitardo(91), "oltre90");
    assert.equal(fasciaPerRitardo(9999), "oltre90");
  });

  test("още ненастъпил падеж НЕ е просрочие", () => {
    const [r] = componiScadenzario(
      [credito({ dataScadenza: new Date("2026-08-30T00:00:00Z") })],
      OGGI,
    );
    assert.equal(r.fascia, "corrente");
    assert.ok(r.giorniRitardo < 0);
  });

  test("часовете не правят ден закъснение", () => {
    // Фактура с падеж ДНЕС не е просрочена в 09:00 сутринта. Разлика в
    // милисекунди би я обявила за „1 ден".
    const [r] = componiScadenzario(
      [credito({ dataScadenza: new Date("2026-07-26T23:00:00Z") })],
      OGGI,
    );
    assert.equal(r.giorniRitardo, 0);
    assert.equal(r.fascia, "g0_30");
  });

  test("дните се броят по КАЛЕНДАР, не по 24 часа", () => {
    assert.equal(
      giorniTra(
        new Date("2026-07-25T23:59:00Z"),
        new Date("2026-07-26T00:01:00Z"),
      ),
      1,
    );
  });
});

describe("кое влиза в списъка", () => {
  test("платените изчезват — нула не е същото като липса", () => {
    // Иначе екранът се пълни с редове, които не искат действие, и точно затова
    // никой не го гледа.
    assert.equal(
      componiScadenzario([credito({ residuoCentesimi: 0 })], OGGI).length,
      0,
    );
  });

  test("отрицателен остатък също не влиза", () => {
    assert.equal(
      componiScadenzario([credito({ residuoCentesimi: -100 })], OGGI).length,
      0,
    );
  });

  test("липсващият падеж НЕ изхвърля реда", () => {
    // Фактура без падеж е дължима при издаване. По-важно: тя не бива да
    // изчезва тихо от списъка на вземанията.
    const [r] = componiScadenzario(
      [credito({ dataScadenza: null, data: giorniFa(200) })],
      OGGI,
    );
    assert.equal(r.giorniRitardo, 200);
    assert.equal(r.fascia, "oltre90");
  });

  test("най-старото просрочие е най-горе — това е редът, по който се звъни", () => {
    const righe = componiScadenzario(
      [
        credito({ fatturaId: "a", dataScadenza: giorniFa(10) }),
        credito({ fatturaId: "b", dataScadenza: giorniFa(200) }),
        credito({ fatturaId: "c", dataScadenza: giorniFa(70) }),
      ],
      OGGI,
    );
    assert.deepEqual(
      righe.map((r) => r.fatturaId),
      ["b", "c", "a"],
    );
  });
});

describe("сумите", () => {
  const righe = componiScadenzario(
    [
      credito({
        fatturaId: "a",
        dataScadenza: giorniFa(5),
        residuoCentesimi: 10_000,
      }),
      credito({
        fatturaId: "b",
        dataScadenza: giorniFa(45),
        residuoCentesimi: 20_000,
      }),
      credito({
        fatturaId: "c",
        dataScadenza: giorniFa(200),
        residuoCentesimi: 30_000,
      }),
    ],
    OGGI,
  );

  test("всяка кофа излиза, включително празната", () => {
    const t = totaliPerFascia(righe);
    assert.equal(t.length, 5);
    // Празната кофа с нула е информация: „няма нищо на 61–90 дни" се чете.
    assert.equal(t.find((x) => x.chiave === "g61_90")?.centesimi, 0);
  });

  test("центесимите се сумират като цели числа", () => {
    const t = totaliPerFascia(righe);
    assert.equal(t.find((x) => x.chiave === "g0_30")?.centesimi, 10_000);
    assert.equal(t.find((x) => x.chiave === "g31_60")?.centesimi, 20_000);
    assert.equal(t.find((x) => x.chiave === "oltre90")?.centesimi, 30_000);
    assert.equal(
      t.reduce((s, x) => s + x.centesimi, 0),
      60_000,
    );
  });
});

describe("по длъжник", () => {
  test("подрежда по РИСК, не по сума", () => {
    // Голяма прясна фактура не е проблем; малка отпреди година е. Подредба по
    // сума би поставила първата отгоре и би скрила втората.
    const righe = componiScadenzario(
      [
        credito({
          debitoreId: "grande",
          debitore: "Grande",
          dataScadenza: giorniFa(3),
          residuoCentesimi: 500_000,
        }),
        credito({
          debitoreId: "vecchio",
          debitore: "Vecchio",
          dataScadenza: giorniFa(400),
          residuoCentesimi: 8_000,
        }),
      ],
      OGGI,
    );
    assert.deepEqual(
      perDebitore(righe).map((d) => d.debitoreId),
      ["vecchio", "grande"],
    );
  });

  test("събира документите на един длъжник", () => {
    const righe = componiScadenzario(
      [
        credito({ fatturaId: "a", residuoCentesimi: 10_000 }),
        credito({ fatturaId: "b", residuoCentesimi: 15_000 }),
      ],
      OGGI,
    );
    const [d] = perDebitore(righe);
    assert.equal(d.documenti, 2);
    assert.equal(d.centesimi, 25_000);
  });
});

describe("коя покана е редна", () => {
  test("без просрочие няма покана", () => {
    // Система, която предлага покана за всяка неплатена фактура, обучава хората
    // да натискат „изпрати" без да гледат.
    assert.equal(livelloSuggerito(-5, 0), null);
    assert.equal(livelloSuggerito(0, 0), null);
  });

  test("първата покана още на първия ден закъснение", () => {
    assert.equal(livelloSuggerito(1, 0), 1);
  });

  test("НЕ се прескача степен", () => {
    // Втора покана без първа е груба и процесуално по-слаба.
    assert.equal(livelloSuggerito(200, 0), 1);
    assert.equal(livelloSuggerito(200, 1), 2);
    assert.equal(livelloSuggerito(200, 2), 3);
  });

  test("степента не изпреварва закъснението", () => {
    // При 5 дни закъснение и една изпратена покана НЯМА какво да се направи:
    // втората започва от 30-ия ден. `null` значи „сега не прави нищо", а не
    // „изпрати първата пак".
    assert.equal(livelloSuggerito(5, 1), null);
    assert.equal(livelloSuggerito(35, 1), 2);
  });

  test("след третата няма четвърта", () => {
    assert.equal(livelloSuggerito(400, 3), null);
    assert.equal(livelloSuggerito(400, 9), null);
  });
});

test("кофите и степените са подредени и без дупки", () => {
  // Ако горната граница на една кофа не е точно под долната на следващата, ден
  // просрочие изчезва между тях и вземането не се вижда никъде.
  for (let i = 1; i < FASCE.length; i++)
    assert.equal(FASCE[i].da, FASCE[i - 1].a + 1, FASCE[i].chiave);
  assert.equal(FASCE[FASCE.length - 1].a, Infinity);

  // Степените растат и по номер, и по срок; лихва има чак от втората.
  for (let i = 1; i < LIVELLI_SOLLECITO.length; i++) {
    assert.ok(LIVELLI_SOLLECITO[i].livello > LIVELLI_SOLLECITO[i - 1].livello);
    assert.ok(
      LIVELLI_SOLLECITO[i].daGiorni > LIVELLI_SOLLECITO[i - 1].daGiorni,
    );
  }
  assert.equal(LIVELLI_SOLLECITO[0].conInteressi, false);
});
