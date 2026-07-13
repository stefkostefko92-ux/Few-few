import { test } from "node:test";
import assert from "node:assert/strict";
import { ENTERPRISES } from "../../data/enterprises";
import { SECTORS } from "../../data/sectors";
import { PRINCIPALS } from "../../data/principals";
import { OBLAST_PATHS } from "../../data/oblasti-geo";
import { enterprisesByOblast, oblastForHq } from "../../data/geo";

const sectorKeys = new Set(SECTORS.map((s) => s.key));
const principalKeys = new Set(PRINCIPALS.map((p) => p.key));
const slugRe = /^[a-z0-9-]+$/;

test("slug-овете са уникални и валидни", () => {
  const seen = new Set<string>();
  for (const e of ENTERPRISES) {
    assert.match(e.slug, slugRe, `невалиден slug: ${e.slug}`);
    assert.ok(!seen.has(e.slug), `дублиран slug: ${e.slug}`);
    seen.add(e.slug);
  }
});

test("всяко предприятие сочи към съществуващ сектор и принципал", () => {
  for (const e of ENTERPRISES) {
    assert.ok(sectorKeys.has(e.sector), `${e.slug}: непознат сектор ${e.sector}`);
    assert.ok(
      principalKeys.has(e.principal),
      `${e.slug}: непознат принципал ${e.principal}`,
    );
  }
});

test("всяко предприятие има поне един входящ и изходящ поток и източник", () => {
  for (const e of ENTERPRISES) {
    assert.ok(e.moneyIn.length > 0, `${e.slug}: липсват входящи потоци`);
    assert.ok(e.moneyOut.length > 0, `${e.slug}: липсват изходящи потоци`);
    assert.ok(e.sources.length > 0, `${e.slug}: липсват източници`);
    assert.ok(e.oversight.length > 0, `${e.slug}: липсва надзор`);
  }
});

test("държавното участие е в диапазона 0–100", () => {
  for (const e of ENTERPRISES) {
    assert.ok(
      e.stateShare >= 0 && e.stateShare <= 100,
      `${e.slug}: невалиден дял ${e.stateShare}`,
    );
  }
});

test("всички източници са с валиден http(s) адрес", () => {
  for (const e of ENTERPRISES) {
    for (const s of e.sources) {
      assert.match(s.url, /^https?:\/\//, `${e.slug}: невалиден URL ${s.url}`);
    }
  }
});

test("geo: 28 области с уникални ISO кодове", () => {
  assert.equal(OBLAST_PATHS.length, 28, "очакват се точно 28 области");
  const codes = new Set(OBLAST_PATHS.map((o) => o.code));
  assert.equal(codes.size, 28, "ISO кодовете трябва да са уникални");
});

test("geo: седалището на всяко предприятие се съпоставя към област или национален обхват", () => {
  const oblastNames = new Set(OBLAST_PATHS.map((o) => o.name));
  for (const e of ENTERPRISES) {
    const name = oblastForHq(e.hq);
    if (name !== null) {
      assert.ok(oblastNames.has(name), `${e.slug}: „${name}“ не е валидна област`);
    }
  }
});

test("geo: агрегацията покрива всички предприятия без загуба", () => {
  const { ranked, national } = enterprisesByOblast();
  const mapped = ranked.reduce((s, o) => s + o.count, 0);
  assert.equal(mapped + national.length, ENTERPRISES.length, "сборът трябва да е точен");
});
