import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  calcolaSla,
  durataIt,
  sogliaSiApplica,
  SOGLIE_PREDEFINITE,
  ETICHETTA_SLA,
  PRIORITA_CON_SLA,
} from "../sla";

const T0 = new Date("2026-07-26T08:00:00Z");
const dopo = (min: number) => new Date(T0.getTime() + min * 60_000);

const SOGLIE = { interventoMin: 60, ripristinoOre: 24 };

describe("часовникът за пристигане", () => {
  test("тече и е в срок", () => {
    const r = calcolaSla({ segnalatoAt: T0 }, SOGLIE, dopo(20));
    assert.equal(r.intervento.stato, "in_corso");
    assert.equal(r.intervento.trascorsiMin, 20);
    assert.equal(r.intervento.rimanentiMin, 40);
    assert.equal(r.violato, false);
  });

  test("на 80 % става „a rischio“ — още може да се спаси", () => {
    // Разликата между предупреждение и констатация: диспечерът има 12 минути
    // да прати друг човек.
    assert.equal(
      calcolaSla({ segnalatoAt: T0 }, SOGLIE, dopo(48)).intervento.stato,
      "a_rischio",
    );
    assert.equal(
      calcolaSla({ segnalatoAt: T0 }, SOGLIE, dopo(47)).intervento.stato,
      "in_corso",
    );
  });

  test("ТОЧНО на прага още НЕ е нарушение", () => {
    // Границата решава дали клиентът получава неустойка — затова е тествана
    // от двете страни, а не „някъде около час".
    assert.equal(
      calcolaSla({ segnalatoAt: T0 }, SOGLIE, dopo(60)).intervento.stato,
      "a_rischio",
    );
    assert.equal(
      calcolaSla({ segnalatoAt: T0 }, SOGLIE, dopo(61)).intervento.stato,
      "violato",
    );
  });

  test("секундите НЕ вдигат минута нагоре", () => {
    // 59 мин и 59 сек не са изтекъл час. Закръгляне нагоре би обявявало
    // нарушение секунда преди то да е настъпило.
    const quasi = new Date(T0.getTime() + 60 * 60_000 - 1_000);
    assert.equal(
      calcolaSla({ segnalatoAt: T0 }, SOGLIE, quasi).intervento.trascorsiMin,
      59,
    );
  });

  test("приключено в срок е „rispettato“, не „in corso“", () => {
    const r = calcolaSla(
      { segnalatoAt: T0, arrivoAt: dopo(35) },
      SOGLIE,
      dopo(600), // много по-късно: приключилият часовник НЕ продължава да тече
    );
    assert.equal(r.intervento.stato, "rispettato");
    assert.equal(r.intervento.trascorsiMin, 35);
    assert.equal(r.intervento.concluso, true);
  });

  test("приключено късно си остава нарушение завинаги", () => {
    const r = calcolaSla(
      { segnalatoAt: T0, arrivoAt: dopo(90) },
      SOGLIE,
      dopo(91),
    );
    assert.equal(r.intervento.stato, "violato");
    assert.equal(r.intervento.rimanentiMin, -30);
  });
});

describe("двата часовника са РАЗЛИЧНИ обещания", () => {
  test("пристигнал навреме, но уредбата стои три дни", () => {
    // Точно случаят, който един-единствен показател би скрил: техникът е бил
    // на място за половин час и после е чакал резервна част.
    const r = calcolaSla(
      { segnalatoAt: T0, arrivoAt: dopo(30) },
      SOGLIE,
      dopo(3 * 24 * 60),
    );
    assert.equal(r.intervento.stato, "rispettato");
    assert.equal(r.ripristino.stato, "violato");
    assert.equal(r.violato, true);
  });

  test("възстановяването се мери от СИГНАЛА, не от пристигането", () => {
    // Иначе закъснялото пристигане изчезва от сметката: клиентът е чакал от
    // момента, в който се е обадил.
    const r = calcolaSla(
      { segnalatoAt: T0, arrivoAt: dopo(600), ripristinoAt: dopo(660) },
      SOGLIE,
      dopo(700),
    );
    assert.equal(r.ripristino.trascorsiMin, 660);
  });
});

describe("когато часовник НЕ тече", () => {
  test("без сигнал няма измерване — и това не е грешка", () => {
    const r = calcolaSla({}, SOGLIE, dopo(1000));
    assert.equal(r.intervento.stato, "non_applicabile");
    assert.equal(r.intervento.trascorsiMin, null);
    assert.equal(r.violato, false);
  });

  test("недоговорен праг не се измисля", () => {
    // Липсващият праг НЕ пада на подразбирането тук: подразбирането е
    // ПРЕДЛОЖЕНИЕ при съставяне на договора, а не мълчаливо задължение,
    // наложено на фирма, която не го е поела.
    const r = calcolaSla(
      { segnalatoAt: T0 },
      { interventoMin: null },
      dopo(9999),
    );
    assert.equal(r.intervento.stato, "non_applicabile");
    assert.equal(r.violato, false);
  });

  test("нула и отрицателен праг се пренебрегват, не гърмят", () => {
    for (const v of [0, -5])
      assert.equal(
        calcolaSla({ segnalatoAt: T0 }, { interventoMin: v }, dopo(10))
          .intervento.stato,
        "non_applicabile",
      );
  });

  test("невалидна дата не се брои за начало", () => {
    assert.equal(
      calcolaSla({ segnalatoAt: "не-е-дата" }, SOGLIE, dopo(10)).intervento
        .stato,
      "non_applicabile",
    );
  });

  test("датите се приемат и като ISO низ (така идват от базата)", () => {
    const r = calcolaSla(
      { segnalatoAt: T0.toISOString(), arrivoAt: dopo(10).toISOString() },
      SOGLIE,
      dopo(20),
    );
    assert.equal(r.intervento.trascorsiMin, 10);
    assert.equal(r.intervento.stato, "rispettato");
  });
});

describe("подразбирането е търговско, не нормативно", () => {
  test("съществува и е разумно", () => {
    assert.equal(SOGLIE_PREDEFINITE.interventoMin, 60);
    assert.equal(SOGLIE_PREDEFINITE.ripristinoOre, 24);
  });

  test("часовникът важи само за спешните приоритети", () => {
    assert.equal(sogliaSiApplica("EMERGENZA"), true);
    assert.equal(sogliaSiApplica("URGENTE"), true);
    // Планова поддръжка с часовник за отзив е безсмислица, която би оцветила
    // таблото в червено без причина.
    assert.equal(sogliaSiApplica("ORDINARIA"), false);
  });
});

describe("четимост на числото", () => {
  test("минути, часове, дни", () => {
    assert.equal(durataIt(45), "45m");
    assert.equal(durataIt(60), "1h");
    assert.equal(durataIt(93), "1h 33m");
    assert.equal(durataIt(24 * 60), "1g");
    assert.equal(durataIt(50 * 60), "2g 2h");
  });

  test("просрочието се вижда като отрицателно, не като липса", () => {
    assert.equal(durataIt(-30), "-30m");
    assert.equal(durataIt(null), "—");
  });

  test("всяко състояние има италиански етикет", () => {
    for (const s of [
      "non_applicabile",
      "in_corso",
      "a_rischio",
      "rispettato",
      "violato",
    ] as const)
      assert.ok(ETICHETTA_SLA[s].length > 0, s);
  });
});

test("часовникът важи само за спешните приоритети — затворен списък", () => {
  assert.deepEqual([...PRIORITA_CON_SLA], ["EMERGENZA", "URGENTE"]);
});
