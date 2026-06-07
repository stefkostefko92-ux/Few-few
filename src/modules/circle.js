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

  // Arcane Circle node map (names/stats from the Tanoth wiki). Node ids match the
  // RPC layout: 1-10 outer stones, 11-15 inner runes, 16 the Demon Skull.
  const NODES = {
    1:  { name: 'Jade',        ring: 'stone', stat: 'exp',     aliases: ['jade', 'exp', 'experience'] },
    2:  { name: 'Aquamarine',  ring: 'stone', stat: 'potdur',  aliases: ['aquamarine', 'potion duration', 'potionduration'] },
    3:  { name: 'Sapphire',    ring: 'stone', stat: 'fame',    aliases: ['sapphire', 'fame'] },
    4:  { name: 'Emerald',     ring: 'stone', stat: 'sell',    aliases: ['emerald', 'sell', 'sellprice', 'selling'] },
    5:  { name: 'Ruby',        ring: 'stone', stat: 'potpow',  aliases: ['ruby', 'potion power', 'potioneffect', 'poteff'] },
    6:  { name: 'Topaz',       ring: 'stone', stat: 'invslot', aliases: ['topaz', 'inventory', 'slots', 'invslot'] },
    7:  { name: 'Amber',       ring: 'stone', stat: 'salary',  aliases: ['amber', 'salary', 'work', 'wage'] },
    8:  { name: 'Amethyst',    ring: 'stone', stat: 'advgold', aliases: ['amethyst', 'advgold', 'adventuregold'] },
    9:  { name: 'Diamond',     ring: 'stone', stat: 'discount',aliases: ['diamond', 'discount', 'cheaper'] },
    10: { name: "Tiger's Eye", ring: 'stone', stat: 'speed',   aliases: ["tiger's eye", 'tigers eye', 'tigerseye', 'tiger', 'speed', 'travel'] },
    11: { name: 'Negotiation', ring: 'rune',  stat: 'int',     aliases: ['negotiation', 'int', 'intelligence', 'преговор'] },
    12: { name: 'Wisdom',      ring: 'rune',  stat: 'con',     aliases: ['wisdom', 'con', 'constitution'] },
    13: { name: 'Diligence',   ring: 'rune',  stat: 'dex',     aliases: ['diligence', 'dex', 'dexterity'] },
    14: { name: 'Courage',     ring: 'rune',  stat: 'str',     aliases: ['courage', 'str', 'strength'] },
    15: { name: 'Glory',       ring: 'rune',  stat: 'drop',    aliases: ['glory', 'drop', 'droprate', 'loot'] },
    16: { name: 'Demon Skull', ring: 'skull', stat: 'skull',   aliases: ['demon skull', 'skull', 'demon', 'череп'] }
  };

  function nodeName(id) { return NODES[id] ? NODES[id].name : ('#' + id); }

  // Resolve a free-text list ("8, negotiation, skull") to node numbers (1-16).
  function resolveNodes(text) {
    const out = [];
    String(text || '').split(/[\n,;]+/).forEach((tokRaw) => {
      const tok = tokRaw.trim().toLowerCase();
      if (!tok) return;
      const num = parseInt(tok, 10);
      if (Number.isInteger(num) && num >= 1 && num <= 16) { if (!out.includes(num)) out.push(num); return; }
      for (const id of Object.keys(NODES)) {
        const n = NODES[id];
        if (n.name.toLowerCase() === tok || n.aliases.some((a) => a === tok || tok.includes(a))) {
          const idn = Number(id);
          if (!out.includes(idn)) out.push(idn);
          break;
        }
      }
    });
    return out;
  }

  function manualList(c) { return resolveNodes(c.manualNodes); }

  TB.Circle = { NODES, nodeName, resolveNodes };

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
        if (!Number.isFinite(cost)) { Logger.debug('circle: bad cost', JSON.stringify(node)); cooldownUntil = Date.now() + 5 * 60000; return; }

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
            Logger.info(I18n.t('logCircleBuy', [nodeName(best), String(level + multiple), String(cost)]));
            await Api.buyCircleNode(best, 'gold', multiple);
            State.patch({ gold: gold - cost });
          } else {
            await Api.miniUpdate();
            if ((Number(State.get().bloodstones) || 0) <= 0) {
              cooldownUntil = Date.now() + 10 * 60000; // out of bloodstones
              return;
            }
            Logger.info(I18n.t('logCircleBuyBs', [nodeName(best), String(level + multiple)]));
            await Api.buyCircleNode(best, 'bs', multiple);
          }
          Stats.bump({ circleNodes: multiple });
        } catch (e) {
          // Locked/maxed node (common in manual mode) — skip it for a while.
          nodeFailUntil[best] = Date.now() + 5 * 60000;
          Logger.warn(I18n.t('logCircleBuyFail', [nodeName(best), e.message]));
        }
      };
    }
  });
})();
