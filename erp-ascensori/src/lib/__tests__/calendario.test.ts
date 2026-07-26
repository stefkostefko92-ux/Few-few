import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  chiaveGiorno,
  lunediDi,
  grigliaMese,
  distribuisci,
  caricoDelGiorno,
  ordinaImpegni,
  GIORNI_IT,
  MESI_IT,
  type Impegno,
} from "../calendario";

const imp = (over: Partial<Impegno> = {}): Impegno => ({
  id: "i1",
  data: new Date(2026, 6, 15),
  titolo: "Manutenzione",
  tecnicoId: "t1",
  tecnico: "Marco Rossi",
  tipo: "ordine",
  ...over,
});

describe("седмицата започва в понеделник", () => {
  test("понеделник си е сам на себе си начало", () => {
    // 2026-07-13 е понеделник.
    assert.equal(chiaveGiorno(lunediDi(new Date(2026, 6, 13))), "2026-07-13");
  });

  test("НЕДЕЛЯ принадлежи на предходната седмица", () => {
    // Класическата грешка: `getDay()` дава 0 за неделя и наивната сметка я
    // праща в следващата седмица, разцепвайки работната на две.
    assert.equal(chiaveGiorno(lunediDi(new Date(2026, 6, 19))), "2026-07-13");
  });

  test("останалите дни от седмицата дават същия понеделник", () => {
    for (let g = 13; g <= 19; g++)
      assert.equal(
        chiaveGiorno(lunediDi(new Date(2026, 6, g))),
        "2026-07-13",
        `ден ${g}`,
      );
  });

  test("имената на дните са от понеделник", () => {
    assert.equal(GIORNI_IT[0], "Lun");
    assert.equal(GIORNI_IT[6], "Dom");
  });
});

describe("мрежата на месеца", () => {
  test("винаги ЦЕЛИ седмици — дупка в първия ред се чете като свободен ден", () => {
    for (const [anno, mese] of [
      [2026, 1],
      [2026, 2],
      [2026, 7],
      [2027, 3],
      [2024, 2], // високосна
    ] as const) {
      const g = grigliaMese(anno, mese);
      assert.equal(g.length % 7, 0, `${anno}-${mese}: ${g.length} дни`);
      assert.equal(g[0].getDay(), 1, "започва в понеделник");
      assert.equal(g[g.length - 1].getDay(), 0, "свършва в неделя");
    }
  });

  test("покрива целия месец", () => {
    const g = grigliaMese(2026, 7);
    const chiavi = new Set(g.map(chiaveGiorno));
    for (let d = 1; d <= 31; d++)
      assert.ok(
        chiavi.has(`2026-07-${String(d).padStart(2, "0")}`),
        `липсва ден ${d}`,
      );
  });

  test("февруари в невисокосна година също излиза цял", () => {
    const chiavi = new Set(grigliaMese(2026, 2).map(chiaveGiorno));
    assert.ok(chiavi.has("2026-02-28"));
    assert.equal(chiavi.has("2026-02-29"), false);
  });
});

describe("разпределението", () => {
  const giorni = grigliaMese(2026, 7);

  test("празният ден НЕ изчезва — това е информацията, която се търси", () => {
    const g = distribuisci(giorni, [], 7);
    assert.equal(g.length, giorni.length);
    assert.ok(g.every((x) => x.impegni.length === 0));
  });

  test("ангажиментът пада в своя ден", () => {
    const g = distribuisci(giorni, [imp({ data: new Date(2026, 6, 15) })], 7);
    const quindici = g.find((x) => x.chiave === "2026-07-15");
    assert.equal(quindici?.impegni.length, 1);
  });

  test("дните извън месеца се маркират, не се махат", () => {
    const g = distribuisci(giorni, [], 7);
    const fuori = g.filter((x) => x.fuoriPeriodo);
    assert.ok(fuori.length > 0);
    assert.ok(fuori.every((x) => x.data.getMonth() + 1 !== 7));
  });

  test("ангажиментите на един ден се събират в неговата клетка", () => {
    const g = distribuisci(giorni, [imp({ id: "a" }), imp({ id: "b" })], 7);
    assert.equal(g.find((x) => x.chiave === "2026-07-15")?.impegni.length, 2);
  });
});

describe("подредбата вътре в деня", () => {
  test("спешното е първо — гледа се какво гори, не какво е азбучно", () => {
    const righe = [
      imp({ id: "a", titolo: "Aaa", priorita: "ORDINARIA" }),
      imp({ id: "b", titolo: "Zzz", priorita: "EMERGENZA" }),
      imp({ id: "c", titolo: "Mmm", priorita: "URGENTE" }),
    ].sort(ordinaImpegni);
    assert.deepEqual(
      righe.map((r) => r.id),
      ["b", "c", "a"],
    );
  });

  test("неразпределеното изпреварва разпределеното при равна спешност", () => {
    // То иска решение ДНЕС; останалото вече има кой да го свърши.
    const righe = [
      imp({ id: "assegnato", titolo: "Aaa", tecnicoId: "t1" }),
      imp({ id: "libero", titolo: "Zzz", tecnicoId: null, tecnico: null }),
    ].sort(ordinaImpegni);
    assert.deepEqual(
      righe.map((r) => r.id),
      ["libero", "assegnato"],
    );
  });

  test("липсващият приоритет се държи като обикновен, не гърми", () => {
    const righe = [
      imp({ id: "a", priorita: null }),
      imp({ id: "b", priorita: "EMERGENZA" }),
    ].sort(ordinaImpegni);
    assert.equal(righe[0].id, "b");
  });
});

describe("натоварването по техник", () => {
  const giorno = distribuisci(
    grigliaMese(2026, 7),
    [
      imp({ id: "a", tecnicoId: "t1", tecnico: "Marco" }),
      imp({ id: "b", tecnicoId: "t1", tecnico: "Marco" }),
      imp({ id: "c", tecnicoId: "t2", tecnico: "Luca" }),
    ],
    7,
  ).find((g) => g.chiave === "2026-07-15")!;

  test("брои намесите по техник, най-натовареният е първи", () => {
    const c = caricoDelGiorno(giorno, 6);
    assert.equal(c[0].tecnico, "Marco");
    assert.equal(c[0].interventi, 2);
    assert.equal(c[1].interventi, 1);
  });

  test("над капацитета се обявява", () => {
    assert.equal(caricoDelGiorno(giorno, 1)[0].sovraccarico, true);
    assert.equal(
      caricoDelGiorno(giorno, 1).find((x) => x.tecnico === "Luca")
        ?.sovraccarico,
      false,
    );
  });

  test("нулев капацитет ИЗКЛЮЧВА проверката, вместо да оцвети всичко в червено", () => {
    // Шест посещения са предположение, не закон: има фирми с дежурства и
    // такива с дълги планови обиколки.
    assert.ok(caricoDelGiorno(giorno, 0).every((x) => !x.sovraccarico));
  });

  test("неразпределеното се вижда като отделен ред, но не е претоварен ЧОВЕК", () => {
    const g = distribuisci(
      grigliaMese(2026, 7),
      [
        imp({ id: "x", tecnicoId: null, tecnico: null }),
        imp({ id: "y", tecnicoId: null, tecnico: null }),
      ],
      7,
    ).find((x) => x.chiave === "2026-07-15")!;
    const c = caricoDelGiorno(g, 1);
    assert.equal(c[0].tecnico, "Non assegnato");
    // Купчина за разпределяне не е претоварен техник: тя иска решение, не
    // тревога за нечие работно време.
    assert.equal(c[0].sovraccarico, false);
  });
});

test("имената на месеците са дванайсет, на италиански, по ред", () => {
  // Сгрешен ред тук значи заглавие „Marzo" над мрежата на април — грешка, която
  // никой тест за дати не хваща.
  assert.equal(MESI_IT.length, 12);
  assert.equal(MESI_IT[0], "Gennaio");
  assert.equal(MESI_IT[11], "Dicembre");
  assert.equal(new Set(MESI_IT).size, 12);
});

// РЕГРЕСИЯ: мрежата се строеше със стъпка от фиксирани 86 400 000 ms. Денят на
// връщането на часа в Италия (последната неделя на октомври) е 25 ЧАСА, тоест
// стъпката спираше на 23:00 от СЪЩИЯ ден: 25 октомври се появяваше два пъти, а
// всичко след него се изместваше с една колона — понеделник заставаше под
// „Domenica". Проверката е по КЛЮЧОВЕ, не по брой: дублиран ключ е и дублиран
// React ключ, и двойно броене на ангажиментите за този ден.
//
// ЗОНАТА СЕ ЗАДАВА ИЗРИЧНО. В UTC преход няма и тестът би бил празен точно в
// средата, където CI го пуска — а продуктът работи в Италия.
test("мрежата не дублира и не изяжда ден при смяна на часа", () => {
  const originale = process.env.TZ;
  process.env.TZ = "Europe/Rome";
  try {
    for (const [anno, mese] of [
      [2026, 10], // есенен преход — денят е 25 часа
      [2026, 3], // пролетен преход — денят е 23 часа
      [2027, 10],
      [2025, 10],
    ] as const) {
      const date = grigliaMese(anno, mese);
      const g = date.map(chiaveGiorno);
      assert.equal(new Set(g).size, g.length, `дублиран ден в ${anno}-${mese}`);
      assert.equal(g.length % 7, 0, `непълна седмица в ${anno}-${mese}`);
      assert.equal(date[0].getDay(), 1); // понеделник
      assert.equal(date[date.length - 1].getDay(), 0); // неделя
      const ultimo = new Date(anno, mese, 0).getDate();
      for (let d = 1; d <= ultimo; d++)
        assert.ok(
          g.includes(chiaveGiorno(new Date(anno, mese - 1, d))),
          `липсва ${anno}-${mese}-${d}`,
        );
    }
  } finally {
    if (originale === undefined) delete process.env.TZ;
    else process.env.TZ = originale;
  }
});
