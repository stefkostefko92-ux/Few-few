// Месечен трафик срещу квотата.
//
// Три неща тук се чупят тихо и струват пари: нулиращите се броячи (рестарт), двойното
// броене през виртуалните интерфейси, и прогноза, вдигната на 2-ро число.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  isBilledIface,
  monthKey,
  monthProgress,
  diffSample,
  TrafficStore,
  trafficChecks,
  fmtTB,
} from '../src/traffic.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'csd-traf-'));
const TB = 1024 ** 4;
const GB = 1024 ** 3;

// „/proc/net/dev" с точния формат: полета rx подред, tx от 9-о.
function netdev(rows) {
  const head = 'Inter-|   Receive                    |  Transmit\n face |bytes packets errs drop fifo frame compressed multicast|bytes packets errs drop fifo colls carrier compressed\n';
  return (
    head +
    rows
      .map(([iface, rx, tx]) => `${iface.padStart(7)}: ${rx} 10 0 0 0 0 0 0 ${tx} 10 0 0 0 0 0 0`)
      .join('\n')
  );
}

// ── Кои интерфейси се броят ──────────────────────────────────────────────────
test('трафик: виртуалните интерфейси НЕ се броят (иначе всеки байт е двоен)', () => {
  for (const good of ['eth0', 'ens3', 'eno1', 'enp0s3', 'wlan0', 'bond0']) {
    assert.equal(isBilledIface(good, {}), true, good);
  }
  // Трафикът на контейнер минава и през docker0/veth, И през eth0.
  for (const bad of ['docker0', 'br-1a2b3c', 'veth9f2', 'wg0', 'tun0', 'tailscale0', 'virbr0']) {
    assert.equal(isBilledIface(bad, {}), false, bad);
  }
});

test('трафик: изричен списък в конфига бие евристиката', () => {
  assert.equal(isBilledIface('wg0', { traffic: { ifaces: ['wg0'] } }), true);
  assert.equal(isBilledIface('eth0', { traffic: { ifaces: ['wg0'] } }), false);
});

// ── Нулиращите се броячи ─────────────────────────────────────────────────────
test('трафик: нормалната разлика е разлика', () => {
  const d = diffSample({ eth0: { rxBytes: 100, txBytes: 200 } }, [{ iface: 'eth0', rxBytes: 150, txBytes: 260 }]);
  assert.deepEqual({ rx: d.rx, tx: d.tx, resets: d.resets }, { rx: 50, tx: 60, resets: [] });
});

test('трафик: РЕСТАРТ (брояч назад) не дава отрицателна разлика', () => {
  // Класическият тих провал: /proc/net/dev се нулира при рестарт, наивното
  // изваждане дава минус и месечният сбор тръгва НАДОЛУ.
  const d = diffSample({ eth0: { rxBytes: 5_000_000, txBytes: 9_000_000 } }, [
    { iface: 'eth0', rxBytes: 1200, txBytes: 800 },
  ]);
  assert.equal(d.rx, 1200, 'след нулиране текущата стойност Е разликата');
  assert.equal(d.tx, 800);
  assert.deepEqual(d.resets, ['eth0'], 'нулирането е видимо, не мълчаливо');
});

test('трафик: първата проба само запомня — няма от какво да е разлика', () => {
  const d = diffSample(null, [{ iface: 'eth0', rxBytes: 999, txBytes: 999 }]);
  assert.deepEqual({ rx: d.rx, tx: d.tx }, { rx: 0, tx: 0 });
  const d2 = diffSample({}, [{ iface: 'eth0', rxBytes: 999, txBytes: 999 }]);
  assert.equal(d2.tx, 0, 'нов интерфейс също не носи история');
});

// ── Натрупване по месеци ─────────────────────────────────────────────────────
const CFG = (extra = {}) => ({ traffic: { enabled: true, quotaTB: 20, countDirection: 'tx', ...extra } });
const day = (d, h = 12) => Date.UTC(2026, 6, d, h, 0, 0);

test('трафик: сборът расте по проби и се пази по месец (UTC)', () => {
  const s = new TrafficStore(tmp());
  const cfg = CFG();
  s.sample(cfg, day(2), netdev([['eth0', 0, 0], ['docker0', 500, 500]]));
  s.sample(cfg, day(2, 13), netdev([['eth0', 1000, 2000], ['docker0', 9e9, 9e9]]));
  const st = s.status(cfg, day(2, 14));
  assert.equal(st.month, '2026-07');
  assert.equal(st.tx, 2000, 'docker0 не се брои');
  assert.equal(st.rx, 1000);
  assert.equal(st.used, 2000, 'по подразбиране се мери ИЗХОДЯЩИЯТ');
  assert.equal(st.samples, 2);
});

test('трафик: посоката е конфигурируема', () => {
  const s = new TrafficStore(tmp());
  s.sample(CFG(), day(2), netdev([['eth0', 0, 0]]));
  s.sample(CFG(), day(2, 13), netdev([['eth0', 700, 300]]));
  assert.equal(s.status(CFG({ countDirection: 'rx' }), day(2, 14)).used, 700);
  assert.equal(s.status(CFG({ countDirection: 'both' }), day(2, 14)).used, 1000);
});

test('трафик: месечният сбор преживява рестарт (mode 600)', () => {
  const dir = tmp();
  const a = new TrafficStore(dir);
  a.sample(CFG(), day(2), netdev([['eth0', 0, 0]]));
  a.sample(CFG(), day(2, 13), netdev([['eth0', 10, 5 * GB]]));
  const b = new TrafficStore(dir);
  assert.equal(b.status(CFG(), day(2, 14)).tx, 5 * GB);
  assert.equal(fs.statSync(path.join(dir, 'traffic.json')).mode & 0o777, 0o600);
});

test('трафик: нов месец започва от нула, старият остава в историята', () => {
  const s = new TrafficStore(tmp());
  s.sample(CFG(), Date.UTC(2026, 5, 20), netdev([['eth0', 0, 0]]));
  s.sample(CFG(), Date.UTC(2026, 5, 21), netdev([['eth0', 0, 3 * GB]]));
  s.sample(CFG(), Date.UTC(2026, 6, 2), netdev([['eth0', 0, 4 * GB]]));
  assert.equal(s.status(CFG(), Date.UTC(2026, 6, 3)).tx, 1 * GB, 'юли носи само разликата в юли');
  const hist = s.status(CFG(), Date.UTC(2026, 6, 3)).history;
  assert.equal(hist.find((h) => h.month === '2026-06').tx, 3 * GB);
});

// ── Прогнозата ───────────────────────────────────────────────────────────────
test('трафик: прогнозата е проста пропорция спрямо изминалия месец', () => {
  const p = monthProgress(day(16));  // юли има 31 дни → 16-о 12:00 ≈ 50%
  assert.ok(p.fraction > 0.48 && p.fraction < 0.52, String(p.fraction));
  assert.equal(Math.round(p.daysTotal), 31);
  assert.equal(monthKey(day(16)), '2026-07');
});

function withUsed(txBytes, atDay) {
  const s = new TrafficStore(tmp());
  s.state.months[monthKey(day(atDay))] = { rx: 0, tx: txBytes, samples: 100 };
  s.state.last = { eth0: { rxBytes: 0, txBytes: txBytes } };
  return s;
}

test('трафик: прогнозата МЪЛЧИ през първите 10% от месеца', () => {
  // 2 TB на 2-ро число се проектират до ~31 TB от 20 TB — но един ден с деплой и
  // синхронизация на бекъпи не е месечно темпо.
  const s = withUsed(2 * TB, 2);
  const st = s.status(CFG(), day(2, 13));
  assert.equal(st.warmedUp, false);
  assert.ok(st.projected > 20 * TB, 'прогнозата се СМЯТА…');
  assert.deepEqual(trafficChecks(CFG(), s, day(2, 13)), [], '…но не алармира');
});

test('трафик: след загряване прогнозата за преминаване вдига аларма с ДЕНЯ', () => {
  const s = withUsed(12 * TB, 16); // ~50% от месеца, 60% от квотата → прогноза ~24 TB
  const c = trafficChecks(CFG(), s, day(16));
  assert.equal(c.length, 1);
  assert.equal(c[0].key, 'traffic:quota');
  assert.equal(c[0].severity, 'warning');
  assert.match(c[0].title, /пада на \d+-о число/);
  const st = s.status(CFG(), day(16));
  assert.ok(st.quotaAtDay > 16 && st.quotaAtDay <= 31, `денят е ${st.quotaAtDay}`);
});

test('трафик: минатата квота е КРИТИЧНА и не се маскира като прогноза', () => {
  const s = withUsed(21 * TB, 20);
  const c = trafficChecks(CFG(), s, day(20));
  assert.equal(c[0].severity, 'critical');
  assert.match(c[0].title, /МИНАТА/);
  assert.equal(c.length, 1, 'един проблем = една аларма');
});

test('трафик: 80% без прогноза за преминаване е предупреждение', () => {
  // 17 TB на 28-о число: 85% от квотата, но темпото няма да я мине до края.
  const s = withUsed(17 * TB, 28);
  const c = trafficChecks(CFG(), s, day(28));
  assert.equal(c.length, 1);
  assert.equal(c[0].severity, 'warning');
  assert.match(c[0].title, /85%|84\.|85\./);
});

test('трафик: спокоен месец → нула аларми', () => {
  const s = withUsed(3 * TB, 20);
  assert.deepEqual(trafficChecks(CFG(), s, day(20)), []);
});

test('трафик: без квота панелът само ПОКАЗВА — нула аларми', () => {
  const s = withUsed(500 * TB, 20);
  assert.deepEqual(trafficChecks(CFG({ quotaTB: null }), s, day(20)), []);
  const st = s.status(CFG({ quotaTB: null }), day(20));
  assert.equal(st.quotaBytes, null);
  assert.equal(st.usedPct, null, 'процент без квота е безсмислен, не 0');
});

test('трафик: изключено значи изключено', () => {
  const s = withUsed(30 * TB, 20);
  assert.deepEqual(trafficChecks(CFG({ enabled: false }), s, day(20)), []);
});

test('трафик: форматът е четим и в TB, и в GB', () => {
  assert.equal(fmtTB(2 * TB), '2.00 TB');
  assert.equal(fmtTB(1.5 * GB), '1.5 GB');
  assert.equal(fmtTB(5 * 1024 ** 2), '5 MB');
  assert.equal(fmtTB(0), '0 MB');
});
