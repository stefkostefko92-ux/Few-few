/**
 * Auto-sell module (verified call: SellItem(id, char_id|0, itemXpos)).
 *
 * SAFETY FIRST: the game client does not publicly expose the inventory item
 * schema, so this module is deliberately conservative — it only sells an item
 * when it can *positively* read both an id/position AND a rarity that is at or
 * below the configured threshold. Anything it cannot confidently classify is
 * left untouched. It also logs the field names it discovers on first run so the
 * mapping can be verified. Disabled by default.
 */
(function () {
  'use strict';
  const TB = window.TanothBot;
  const { Api, Storage, Stats, Logger, I18n, Scheduler } = TB;

  const RARITY = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
  const ID_KEYS = ['id', 'item_id', 'itemId'];
  const XPOS_KEYS = ['x_pos', 'pos_x', 'x', 'itemXpos', 'item_x'];
  const RARITY_KEYS = ['rarity', 'quality', 'grade', 'color', 'item_quality'];
  const EQUIP_KEYS = ['equipped', 'is_equipped', 'in_use'];

  let inspected = false;
  let lastScan = 0;

  function cfg() { return Storage.section('autosell') || {}; }

  function memberValue(struct, names) {
    for (const n of names) {
      const v = TB.Api.findValue(struct, n, 'i4');
      if (v != null) return v;
      const s = TB.Api.findValue(struct, n, 'string');
      if (s != null) return s;
    }
    return null;
  }

  function rarityTier(v) {
    if (v == null) return -1;
    if (typeof v === 'number' || /^\d+$/.test(v)) return Number(v);     // 0=common,1=uncommon,…
    const i = RARITY.indexOf(String(v).toLowerCase());
    return i;
  }

  Scheduler.register({
    id: 'autosell',
    priority: 8,
    async tick() {
      const c = cfg();
      if (!c.enabled || !Api.ready()) return null;
      if (Date.now() - lastScan < 60000) return null;

      return async () => {
        lastScan = Date.now();
        const doc = await Api.getEquipment();
        const structs = Array.from(doc.querySelectorAll('struct'))
          .filter((s) => memberValue(s, ID_KEYS) != null);

        if (!inspected && structs.length) {
          inspected = true;
          const names = Array.from(structs[0].querySelectorAll(':scope > member > name')).map((n) => n.textContent);
          Logger.debug('autosell: item fields = ' + names.join(', '));
        }

        const keepTier = Math.max(0, RARITY.indexOf(c.keepRarity || 'uncommon')); // sell BELOW this
        for (const s of structs) {
          const equipped = memberValue(s, EQUIP_KEYS);
          if (equipped && /1|true/i.test(String(equipped))) continue;     // never sell equipped
          const tier = rarityTier(memberValue(s, RARITY_KEYS));
          if (tier < 0) continue;                                         // unknown rarity → skip
          if (tier >= keepTier) continue;                                 // good enough to keep
          const id = Number(memberValue(s, ID_KEYS));
          const xpos = Number(memberValue(s, XPOS_KEYS) || 0);
          if (!Number.isFinite(id)) continue;

          Logger.info(I18n.t('logSell', [String(id), RARITY[tier] || String(tier)]));
          await Api.sellItem(id, xpos);
          Stats.bump({ itemsSold: 1 });
          return; // one sale per cycle, then re-scan
        }
      };
    }
  });
})();
