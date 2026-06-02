/**
 * Evocation Circle module ("arcane upgrades") — verified XML-RPC protocol.
 *
 * The circle is a tree of nodes; node 16 is the centre whose level (0–10) gates
 * the others. The node-selection order below is ported verbatim from the
 * open-source reference so purchases follow the optimal, game-correct path.
 * Each node array is [level, …, base, increment, factor] and the gold cost is
 * floor((base + level*increment) * factor).
 */
(function () {
  'use strict';
  const TB = window.TanothBot;
  const { Api, State, Storage, Stats, Logger, I18n, Scheduler } = TB;

  function cfg() { return Storage.section('circle') || {}; }

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

  Scheduler.register({
    id: 'circle',
    priority: 20,
    async tick() {
      const c = cfg();
      if (!c.enabled || !Api.ready()) return null;

      return async () => {
        const circle = await Api.getCircle();
        if (!Object.keys(circle).length) return;

        const best = getBestCircleItem(circle);
        if (best == null) {
          Logger.info(I18n.t('logCircleComplete'));
          return;
        }

        const node = circle[best];
        const level = node[0];
        const base = node[5], increment = node[6], factor = node[7];
        const cost = Math.floor((base + level * increment) * factor);
        if (!Number.isFinite(cost)) { Logger.debug('circle: bad cost', JSON.stringify(node)); return; }

        await Api.miniUpdate();
        const gold = Number(State.get().gold) || 0;
        if (gold - cost < (c.keepGoldReserve || 0)) {
          Logger.debug(I18n.t('logCircleSkipGold', [String(cost)]));
          return; // not enough gold while keeping the reserve
        }

        Logger.info(I18n.t('logCircleBuy', [String(best), String(cost)]));
        await Api.buyCircleNode(best);
        Stats.bump({ circleNodes: 1, goldEarned: 0 });
        State.patch({ gold: gold - cost });
      };
    }
  });
})();
