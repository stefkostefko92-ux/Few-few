// Езиковият слой — паритет и коректност на речника (skill i18n-parity).
//
// Трите режима на халюцинация при превод: добавено, ИЗПУСНАТО (най-опасно —
// обръща смисъл) и пренаписан смисъл. Машинно хващаме първите две за числата и
// маркерите; третото е ръчен преглед. Плюс: шаблонният механизъм се тества с
// истинските низове, които панелът произвежда.
import test from 'node:test';
import assert from 'node:assert/strict';

import { ENTRIES } from '../public/i18n-dict.js';

const MARK_RX = /⟦(\d+)⟧/g;
const marks = (s) => [...String(s).matchAll(MARK_RX)].map((m) => m[1]).sort();

test('i18n: всяка тройка е пълна — нито един език без стойност', () => {
  for (const [i, e] of ENTRIES.entries()) {
    assert.ok(Array.isArray(e) && e.length === 3, `запис ${i} не е тройка`);
    const [bg, en, it] = e;
    for (const [lang, v] of [['bg', bg], ['en', en], ['it', it]]) {
      assert.ok(typeof v === 'string' && v.trim().length > 0, `запис ${i} (${JSON.stringify(bg.slice(0, 40))}): празен ${lang}`);
    }
  }
});

test('i18n: няма дублирани български ключове (вторият тихо би победил)', () => {
  const seen = new Map();
  for (const [bg] of ENTRIES) {
    assert.ok(!seen.has(bg), `дублиран ключ: ${JSON.stringify(bg.slice(0, 60))}`);
    seen.set(bg, true);
  }
});

test('i18n: маркерите ⟦n⟧ съвпадат по брой и номера в трите езика', () => {
  for (const [bg, en, it] of ENTRIES) {
    const b = marks(bg);
    assert.deepEqual(marks(en), b, `EN маркери се разминават за: ${bg.slice(0, 60)}`);
    assert.deepEqual(marks(it), b, `IT маркери се разминават за: ${bg.slice(0, 60)}`);
  }
});

test('i18n: %s маркерите (tf) също са в паритет', () => {
  for (const [bg, en, it] of ENTRIES) {
    const n = (s) => (String(s).match(/%s/g) || []).length;
    assert.equal(n(en), n(bg), `EN %s за: ${bg.slice(0, 60)}`);
    assert.equal(n(it), n(bg), `IT %s за: ${bg.slice(0, 60)}`);
  }
});

test('i18n: числата в статичните низове НЕ се губят в превода', () => {
  // Число, изпуснато от превода, е обърнат смисъл („5 минути" → „минути").
  // Проверяваме числата в BG срещу EN/IT — за не-шаблонните записи.
  for (const [bg, en, it] of ENTRIES) {
    if (bg.includes('⟦')) continue;
    const nums = (s) => (String(s).match(/\d+(?:[.,]\d+)?/g) || []).map((x) => x.replace(',', '.')).sort();
    const b = nums(bg);
    // Изключение: подредни числителни/формати могат да се изписват различно —
    // затова искаме EN/IT да СЪДЪРЖАТ числата на BG, не точно равенство.
    for (const [lang, v] of [['EN', en], ['IT', it]]) {
      const have = nums(v);
      for (const num of b) {
        assert.ok(have.includes(num), `${lang} изпуска числото ${num} в: ${bg.slice(0, 70)}`);
      }
    }
  }
});

test('i18n: преводът не оставя кирилица в EN (без нарочните имена)', () => {
  // Българските кавички/имена на файлове са позволени (напр. „.преди-смяна-на-порт"
  // е буквално име на файл на диска). Всичко друго кирилско в EN е пропуск.
  // Етикетът на самия език в превключвателя остава на кирилица нарочно.
  const allowed = /преди-смяна-на-порт|Български|Език|^БГ$/;
  for (const [bg, en] of ENTRIES) {
    if (allowed.test(en)) continue;
    assert.ok(!/[а-яА-Я]/.test(en), `кирилица в EN превода на: ${bg.slice(0, 60)} → ${en.slice(0, 60)}`);
  }
});

// ── Шаблонният механизъм, поведенчески ───────────────────────────────────────
// t() зависи от localStorage/window → тестваме извлечената логика 1:1.
const NUM_RX = /\d+(?:[.,:]\d+)*(?:\s?(?:(?:[KMGTP]i?)?B\/s|(?:[KMGTP]i?)?B|ms)(?![\wа-я])|%)?/g;
const maps = new Map(ENTRIES.map(([bg, en]) => [bg, en]));
function translate(s) {
  const hit = maps.get(s);
  if (hit) return hit;
  const values = [];
  const pattern = s.replace(NUM_RX, (m) => {
    values.push(m);
    return `⟦${values.length - 1}⟧`;
  });
  const p = maps.get(pattern);
  if (p) return p.replace(/⟦(\d+)⟧/g, (_, i) => values[Number(i)] ?? '');
  return s;
}

test('i18n: шаблоните превеждат истинските динамични низове', () => {
  assert.equal(translate('преди 3 мин'), '3 min ago');
  assert.equal(translate('преди 11 ч'), '11 h ago');
  assert.equal(translate('история: 24h'), 'history: 24h');
  assert.equal(translate('112 точки (пазят се 7 дни на диска)'), '112 points (kept 7 days on disk)');
  assert.equal(translate('Активни аларми (23)'), 'Active alerts (23)');
  assert.equal(translate('изход 1'), 'exit 1');
  assert.equal(translate('± 15 мин'), '± 15 min');
  assert.equal(translate('4 ядра · load 0.05 0.07 0.07'), '4 cores · load 0.05 0.07 0.07');
  // Единицата пътува с числото — един шаблон покрива KB/MB/GB.
  assert.equal(translate('качване ▲ 9.4 KB/s'), 'upload ▲ 9.4 KB/s');
  assert.equal(translate('качване ▲ 2.1 MB/s'), 'upload ▲ 2.1 MB/s');
  assert.equal(translate('82 MB от 20 TB'), '82 MB of 20 TB');
  assert.equal(translate('Праг за аларма: 2 дни.'), 'Alert threshold: 2 days.');
  assert.equal(translate('60 лоши от 60 проби · допустими 0 · p95 100 ms'), '60 bad out of 60 probes · allowed 0 · p95 100 ms');
});

// ── Стъпало 3: сървърните низове (данни-маркери) ─────────────────────────────
const DATA_RX = /(?:[A-Za-z\/_](?:[A-Za-z0-9\/_.:@*+-]*[A-Za-z0-9\/_@*+-])?|\d+(?:[.,:]\d+)*)/g;
function translateServer(s) {
  const direct = translate(s);
  if (direct !== s) return direct;
  const values = [];
  const pattern = s.replace(DATA_RX, (m) => {
    values.push(m);
    return `⟦${values.length - 1}⟧`;
  });
  const p = maps.get(pattern);
  if (p) return p.replace(/⟦(\d+)⟧/g, (_, i) => values[Number(i)] ?? '');
  return s;
}

test('i18n: сървърните низове се превеждат по данни-маркери', () => {
  assert.equal(translateServer('Продукт не отговаря: zabobovdol'), 'Product not responding: zabobovdol');
  assert.equal(translateServer('medqr: харчи бюджета за грешки твърде бързо'), 'medqr: burning the error budget too fast');
  assert.equal(translateServer('Грешна парола.'), 'Wrong password.');
  assert.equal(translateServer('Невалидно име на услуга'), 'Invalid service name');
  assert.equal(translateServer('Слуша само на 127.0.0.1 — отвън е недостъпен по конструкция.'), 'Listens only on 127.0.0.1 — unreachable from outside by construction.');
  // Наклонената черта е данни — „Дрейф/консистентност" минава през същия маркер.
  assert.equal(translateServer('Дрейф/консистентност на ростера'), 'Roster drift/consistency');
  // Двоеточието НЕ влиза в токена (иначе „zabobovdol:" гълта разделителя).
  assert.equal(translateServer('Проба за възстановяване: poc.sqlite.gz'), 'Restore drill: poc.sqlite.gz');
});

test('i18n: съставните заглавия се превеждат по части', () => {
  // „Възстановено: <заглавие>" — префиксът се превежда, остатъкът рекурсивно.
  // Тук проверяваме, че двете части поотделно са в речника; сглобката е в t().
  assert.equal(translate('Възстановено:'), 'Resolved:');
  assert.equal(translateServer('Няма нито един бекъп'), 'There is not a single backup');
  assert.equal(translate('Провалена задача:'), 'Failed job:');
});

test('i18n: непознат низ остава непокътнат (деградация към български)', () => {
  const raw = 'key=slo:medqr severity=critical title=medqr: харчи бюджета за грешки твърде бързо';
  assert.equal(translate(raw), raw, 'сървърните данни не се пипат');
  assert.equal(translate('произволен текст 123'), 'произволен текст 123');
});
