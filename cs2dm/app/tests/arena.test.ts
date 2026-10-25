/**
 * Режимите на арената (CONTRACT §15) — константите в TS и в C# са едни и същи: тестът чете `.cs`
 * файловете на логиката, вместо да вярва на копие. Плюс решетката на heatmap-а (§4) — горещата зона
 * кръщава резервната зона на сектора („C4“) от C#, а сайтът го показва със своята функция.
 */
import './env.js';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { CELL_PX, COLUMNS, DUST2_OVERVIEW, GRID, SECTORS, sectorLabel } from '../src/heatmap.js';
import { HOT_ZONE, MOST_WANTED } from '../src/levels.js';
import { decode, fakeRepo, sampleData, start } from './helpers.js';

const LOGIC = new URL('../../plugins/src/CarbonStealth.Logic/', import.meta.url);
const cs = (file: string) => readFileSync(new URL(file, LOGIC), 'utf8');

function constOf(source: string, name: string): string {
  const found = new RegExp(`const \\w+ ${name} = ([^;]+);`).exec(source);
  if (!found?.[1]) throw new Error(`няма константа ${name}`);
  return found[1].trim();
}

const num = (source: string, name: string) => Number(constOf(source, name).replace(/f$/, ''));

test('решетката на Dust2 е същата в C# (Dust2Grid) и в heatmap.ts', () => {
  const grid = cs('Dust2Grid.cs');
  assert.equal(num(grid, 'PosX'), DUST2_OVERVIEW.posX);
  assert.equal(num(grid, 'PosY'), DUST2_OVERVIEW.posY);
  assert.equal(num(grid, 'Scale'), DUST2_OVERVIEW.scale);
  assert.equal(num(grid, 'Size'), DUST2_OVERVIEW.size);
  assert.equal(num(grid, 'CellPx'), CELL_PX);
  assert.equal(num(grid, 'Sectors'), SECTORS);
  assert.equal(constOf(grid, 'Columns'), `"${COLUMNS}"`);
  assert.equal(GRID, 32);
});

test('секторът на точка — същите стойности като C# (HotZoneTests)', () => {
  assert.equal(sectorLabel(0, 0), 'E6');
  assert.equal(sectorLabel(1500, -500), 'H7');
  assert.equal(sectorLabel(-2400, 3200), 'A1');
  assert.equal(sectorLabel(-3000, 0), null);
  assert.equal(sectorLabel(0, 4000), null);
});

test('горещата зона: множителят, минутите и кралят са същите като в C#', () => {
  assert.equal(num(cs('Progression.cs'), 'HotZoneMultiplier'), HOT_ZONE.multiplier);
  const rules = cs('HotZone.cs');
  assert.equal(num(rules, 'ActiveSeconds'), HOT_ZONE.activeMinutes * 60);
  assert.equal(num(rules, 'KingMinKills'), HOT_ZONE.kingMinKills);
});

test('Most Wanted: прагът и бонусът са същите като в C#', () => {
  assert.equal(num(cs('Progression.cs'), 'MostWantedXp'), MOST_WANTED.xp);
  assert.equal(num(cs('MostWanted.cs'), 'MinKills'), MOST_WANTED.minKills);
});

test('класацията „Как се смята“: редовете на арената идват от константите', async () => {
  const app = await start({ repo: fakeRepo(sampleData()) });
  try {
    const bg = decode(await (await app.get('/bg/leaderboard')).text());
    assert.match(bg, /<th scope="row">Убийство от горещата зона<\/th><td class="c-num">×2<\/td>/);
    assert.match(bg, /светва за 3 минути\. Всяко убийство, докато си вътре, носи ×2 XP/);
    assert.match(bg, /\(поне 3\)/);
    assert.match(
      bg,
      /<th scope="row">Свален Most Wanted \(бонус\)<\/th><td class="c-num">\+25<\/td>/,
    );
    assert.match(bg, /поне 10 убийства/);
    const it = decode(await (await app.get('/it/leaderboard')).text());
    assert.match(it, /Uccisione dall'interno della zona calda/);
  } finally {
    await app.close();
  }
});
