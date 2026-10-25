import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FLAG_FLOORS,
  FLAG_LIST_MAX,
  FLAG_MIN_KILLS,
  FLAG_MIN_MINUTES,
  FLAG_MIN_POPULATION,
  FLAG_PERCENTILE,
  FLAG_SPIKE_RATIO,
  LONG_NOSCOPE_METERS,
  metricValue,
  percentileRank,
  scoreFlags,
  type FlagCounts,
  type FlagInput,
} from '../src/admin/flags.js';

const ZERO: FlagCounts = {
  kills: 0,
  headshots: 0,
  wallbangs: 0,
  smokes: 0,
  blinds: 0,
  longNoscopes: 0,
  minutes: 0,
};

function player(
  n: number,
  now: Partial<FlagCounts> = {},
  base: Partial<FlagCounts> = {},
): FlagInput {
  return {
    steamId: `7656119000098${String(n).padStart(4, '0')}`,
    name: `P${n}`,
    hidden: false,
    ...ZERO,
    kills: 60,
    headshots: 18,
    minutes: 60,
    ...now,
    base: { ...ZERO, ...base },
  };
}

/** Сървър с 11 обикновени играчи: 30 % в главата, 1 убийство в минута, нищо особено. */
const crowd = () => Array.from({ length: 11 }, (_, i) => player(i + 1));

test('праговете са заковани (промяна = преглед на страницата и на CONTRACT §10)', () => {
  assert.equal(FLAG_MIN_KILLS, 50);
  assert.equal(FLAG_MIN_MINUTES, 30);
  assert.equal(FLAG_MIN_POPULATION, 10);
  assert.equal(FLAG_PERCENTILE, 0.95);
  assert.equal(FLAG_SPIKE_RATIO, 1.5);
  assert.equal(LONG_NOSCOPE_METERS, 20);
  assert.deepEqual(FLAG_FLOORS, {
    hs: 0.6,
    wallbang: 0.1,
    smoke: 0.08,
    blind: 0.05,
    longNoscope: 0.03,
    kpm: 3,
  });
});

test('стойностите: делове само от 50 убийства, убийства в минута — от 30 минути', () => {
  const counts = { ...ZERO, kills: 50, headshots: 30, wallbangs: 5, minutes: 25 };
  assert.equal(metricValue('hs', counts), 0.6);
  assert.equal(metricValue('wallbang', counts), 0.1);
  assert.equal(metricValue('kpm', counts), null);
  assert.equal(metricValue('kpm', { ...counts, minutes: 30 }), 50 / 30);
  assert.equal(metricValue('hs', { ...counts, kills: 49 }), null);
});

test('перцентилът: делът на стойностите до тази, самият играч се брои', () => {
  assert.equal(percentileRank([1, 2, 3, 4], 4), 1);
  assert.equal(percentileRank([1, 2, 3, 4], 2), 0.5);
  assert.equal(percentileRank([2, 2, 2], 2), 1);
  assert.equal(percentileRank([], 5), 0);
});

test('извън обичайното: първият на сървъра над прага; под прага — нищо', () => {
  const rows = [
    ...crowd(),
    player(50, { kills: 80, headshots: 76, wallbangs: 24 }), // 95 % в главата, 30 % през стена
    player(51, { blinds: 2 }), // 3,3 % заслепен — най-високият, но под прага от 5 %
  ];
  const report = scoreFlags(rows);
  assert.equal(report.population, 13);
  assert.deepEqual(
    report.flagged.map((p) => [p.name, p.reasons]),
    [['P50', 2]],
  );
  const hs = report.flagged[0]!.metrics.find((m) => m.id === 'hs')!;
  assert.equal(hs.outlier, true);
  assert.equal(hs.percentile, 1);
  assert.equal(hs.spike, false, 'без база няма скок');
});

test('малко играчи → без перцентил и без „извън обичайното“, но скокът се вижда', () => {
  const rows = [
    player(1),
    player(2, { headshots: 57 }, { kills: 60, headshots: 18 }), // 95 % срещу 30 % в базата
    player(3, { kills: 49, headshots: 49 }), // под 50 убийства — не се оценява
  ];
  const report = scoreFlags(rows);
  assert.equal(report.population, 2);
  assert.equal(report.flagged.length, 1);
  const hs = report.flagged[0]!.metrics.find((m) => m.id === 'hs')!;
  assert.equal(hs.percentile, null);
  assert.equal(hs.outlier, false);
  assert.equal(hs.spike, true);
  assert.equal(hs.baseline, 0.3);
});

test('скок: иска база с 50 убийства и стойност над прага', () => {
  const thinBase = scoreFlags([player(1, { headshots: 57 }, { kills: 40, headshots: 4 })]);
  assert.equal(thinBase.flagged.length, 0, 'базата е под 50 убийства');
  const belowFloor = scoreFlags([player(1, { headshots: 33 }, { kills: 60, headshots: 6 })]);
  assert.equal(belowFloor.flagged.length, 0, '55 % е 5× базата, но под прага от 60 %');
  const kpm = scoreFlags([player(1, { kills: 240, minutes: 60 }, { kills: 60, minutes: 60 })]);
  const rate = kpm.flagged[0]?.metrics.find((m) => m.id === 'kpm');
  assert.equal(rate?.value, 4);
  assert.equal(rate?.baseline, 1);
  assert.equal(rate?.spike, true);
});

test('редът: повече причини първо, после по-висок перцентил; таван на списъка', () => {
  const rows = [
    ...crowd(),
    player(60, { smokes: 10 }), // 1 причина: 17 % през дим
    player(61, { headshots: 58, wallbangs: 20 }), // 2 причини
  ];
  assert.deepEqual(
    scoreFlags(rows).flagged.map((p) => p.name),
    ['P61', 'P60'],
  );
  const many = Array.from({ length: FLAG_LIST_MAX + 5 }, (_, i) =>
    player(100 + i, { headshots: 50 }, { kills: 60, headshots: 6 }),
  );
  assert.equal(scoreFlags(many).flagged.length, FLAG_LIST_MAX);
});
