import { test } from "node:test";
import assert from "node:assert/strict";
import { ENTERPRISES } from "../../data/enterprises";
import { SECTORS } from "../../data/sectors";
import { PRINCIPALS } from "../../data/principals";
import { OBLAST_PATHS } from "../../data/oblasti-geo";
import { enterprisesByOblast, oblastForHq } from "../../data/geo";
import { FINANCIALS } from "../../data/financials";
import { CASES, STATUS } from "../../data/cases";

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

test("случаи: валиден статус, https източници и (ако е даден) съществуващ slug", () => {
  const slugs = new Set(ENTERPRISES.map((e) => e.slug));
  const statusKeys = new Set(Object.keys(STATUS));
  for (const c of CASES) {
    assert.ok(c.title.trim().length > 0, "случай без заглавие");
    assert.ok(c.enterprise.trim().length > 0, `${c.title}: без предприятие`);
    assert.ok(statusKeys.has(c.statusKey), `${c.title}: непознат статус ${c.statusKey}`);
    assert.ok(c.sources.length > 0, `${c.title}: без източник`);
    for (const s of c.sources) {
      assert.match(s.url, /^https?:\/\//, `${c.title}: невалиден URL ${s.url}`);
    }
    if (c.slug) {
      assert.ok(slugs.has(c.slug), `${c.title}: несъществуващ slug ${c.slug}`);
    }
  }
});

test("финанси: всеки запис сочи към съществуващо предприятие и има валидни редове", () => {
  const slugs = new Set(ENTERPRISES.map((e) => e.slug));
  const yearRe = /^\d{4}$/;
  for (const [slug, fin] of Object.entries(FINANCIALS)) {
    assert.ok(slugs.has(slug), `финанси за непознат slug: ${slug}`);
    assert.ok(fin.series.length > 0, `${slug}: празна финансова серия`);
    assert.match(fin.source.url, /^https?:\/\//, `${slug}: невалиден URL на източник`);
    const years = new Set<string>();
    for (const row of fin.series) {
      assert.match(row.year, yearRe, `${slug}: невалидна година ${row.year}`);
      assert.ok(!years.has(row.year), `${slug}: дублирана година ${row.year}`);
      years.add(row.year);
      assert.ok(
        row.revenueMln != null || row.resultMln != null,
        `${slug} (${row.year}): редът няма нито приход, нито резултат`,
      );
    }
  }
});
