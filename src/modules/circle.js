/**
 * Evocation Circle module ("arcane upgrades") — verified XML-RPC protocol.
 *
 * The circle is a tree of 16 nodes; node 16 is the centre whose level (0–10)
 * gates the others. Each node array is [level, …, base, increment, factor] and
 * the gold cost is floor((base + level*increment) * factor). The node-selection
 * order below is ported verbatim from the official client so purchases follow
 * the optimal path.
 *
 * Detail/visibility: logs the centre progress (Lv X/10) and the total of the
 * outer nodes each pass, plus the cost of every purchase. Honours currency
 * (gold/bloodstones), buy-multiple, a centre-level stop target and a reserve.
 */
(function () {
  'use strict';
  const TB = window.TanothBot;
  const { Api, State, Storage, Stats, Logger, I18n, Scheduler } = TB;

  let lastSummary = 0;
  let cooldownUntil = 0;
  const nodeFailUntil = {};   // nodeId -> epoch ms to skip after a failed buy
  function cfg() { return Storage.section('circle') || {}; }

  // Parse "8, 1, 16" -> [8,1,16] (node numbers 1-16).
  function manualList(c) {
    return String(c.manualNodes || '')
      .split(/[\s,;]+/).map((t) => parseInt(t, 10))
      .filter((n) => Number.isInteger(n) && n >= 1 && n <= 16);
  }

  function getBestCircleItem(ci) {
    const g = (i) => (ci[i] ? ci[i][0] : undefined);
    if (g(16) === 10) return null;
    if (g(8) < (g(16) + 1) * 100) return 8;
    if (g(1) < (g(16) + 1) * 100) return 1;
    if (g(15) < (g(16) + 1) * 10 && (g(15) + 1) * 10 <= g(9) && (g(15) + 1) * 10 <= g(10)) return 15;
    if (g(9) < (g(16) + 1) * 100) return 9;
    if (g(10) < (g(16) + 1) * 100) return 10;
    if (g(11) < (g(16) + 1) * 10 && (g(11) + 1) * 10 <= g(1) && (g(11) + 1) * 10 <= g(2)) return 11;
    if (g(2) < (g(16) + 1) * 100) return 2;
    if (g(12) < (g(16) + 1) * 10 && (g(12) + 1) * 10 <= g(3) && (g(12) + 1) * 10 <= g(4)) return 12;
    if (g(3) < (g(16) + 1) * 100) return 3;
    if (g(4) < (g(16) + 1) * 100) return 4;
    if (g(13) < (g(16) + 1) * 10 && (g(13) + 1) * 10 <= g(5) && (g(13) + 1) * 10 <= g(6)) return 13;
    if (g(5) < (g(16) + 1) * 100) return 5;
    if (g(6) < (g(16) + 1) * 100) return 6;
    if (g(14) < (g(16) + 1) * 10 && (g(14) + 1) * 10 <= g(7) && (g(14) + 1) * 10 <= g(8)) return 14;
    if (g(7) < (g(16) + 1) * 100) return 7;
    return 16;
  }

  function summarise(circle) {
    const centre = circle[16] ? circle[16][0] : 0;
    let outer = 0;
    for (let i = 1; i <= 15; i++) if (circle[i]) outer += circle[i][0];
    return { centre, outer };
  }

  Scheduler.register({
    id: 'circle',
    priority: 20,
    async tick() {
      const c = cfg();
      if (!c.enabled || !Api.ready()) return null;
      if (Date.now() < cooldownUntil) return null;

      return async () => {
        const circle = await Api.getCircle();
        if (!Object.keys(circle).length) { Logger.debug('circle: empty response'); return; }

        const { centre, outer } = summarise(circle);
        if (Date.now() - lastSummary > 120000) {
          lastSummary = Date.now();
          Logger.info(I18n.t('logCircleProgress', [String(centre), String(outer)]));
        }

        const stopAt = Math.min(10, Number(c.stopAtCenterLevel) || 10);

        // Choose the node: explicit list (manual) or the optimal path (auto).
        let best;
        if (c.mode === 'manual') {
          const list = manualList(c);
          if (!list.length) { Logger.info(I18n.t('logCircleNoManual')); cooldownUntil = Date.now() + 60000; return; }
          best = list.find((id) => {
            const n = circle[id];
            if (!n) return false;
            if (id === 16 && n[0] >= stopAt) return false;
            return Date.now() >= (nodeFailUntil[id] || 0);
          });
          if (best == null) { cooldownUntil = Date.now() + 60000; return; }
        } else {
          if (centre >= stopAt) { Logger.info(I18n.t('logCircleStopLevel', [String(stopAt)])); cooldownUntil = Date.now() + 10 * 60000; return; }
          best = getBestCircleItem(circle);
          if (best == null) { Logger.success(I18n.t('logCircleComplete')); cooldownUntil = Date.now() + 10 * 60000; return; }
        }

        const node = circle[best];
        const level = node[0];
        const base = node[5], increment = node[6], factor = node[7];
        const multiple = Number(c.multiple) === 10 ? 10 : 1;
        let cost = Math.floor((base + level * increment) * factor);
        if (multiple === 10) {
          // approximate cost of buying 10 successive levels
          cost = 0;
          for (let l = level; l < level + 10; l++) cost += Math.floor((base + l * increment) * factor);
        }
        if (!Number.isFinite(cost)) { Logger.debug('circle: bad cost', JSON.stringify(node)); return; }

        const currency = c.currency === 'bs' ? 'bs' : 'gold';
        try {
          if (currency === 'gold') {
            await Api.miniUpdate();
            const gold = Number(State.get().gold) || 0;
            if (gold - cost < (c.keepGoldReserve || 0)) {
              Logger.info(I18n.t('logCircleSkipGold', [String(cost), String(gold)]));
              cooldownUntil = Date.now() + 30000; // back off until gold recovers
              return;
            }
            Logger.info(I18n.t('logCircleBuy', [String(best), String(level + multiple), String(cost)]));
            await Api.buyCircleNode(best, 'gold', multiple);
            State.patch({ gold: gold - cost });
          } else {
            await Api.miniUpdate();
            if ((Number(State.get().bloodstones) || 0) <= 0) {
              cooldownUntil = Date.now() + 10 * 60000; // out of bloodstones
              return;
            }
            Logger.info(I18n.t('logCircleBuyBs', [String(best), String(level + multiple)]));
            await Api.buyCircleNode(best, 'bs', multiple);
          }
          Stats.bump({ circleNodes: multiple });
        } catch (e) {
          // Locked/maxed node (common in manual mode) — skip it for a while.
          nodeFailUntil[best] = Date.now() + 5 * 60000;
          Logger.warn(I18n.t('logCircleBuyFail', [String(best), e.message]));
        }
      };
    }
  });
})();
