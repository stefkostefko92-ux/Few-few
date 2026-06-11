// Sells equipment (never runes/stones/potions), by rarity. Off by default.
(function () {
  'use strict';
  const TB = window.TanothBot;
  const { Api, Storage, Stats, Logger, Scheduler, I18n } = TB;

  const ID_KEYS = ['id', 'item_id'];
  const XPOS_KEYS = ['item_in_bag_x', 'screen_x', 'pos_x', 'x_pos', 'x'];
  const VALUE_KEYS = ['sellvalue', 'sell_price', 'price_gold', 'value', 'worth'];
  const EQUIP_FLAG_KEYS = ['is_equipped', 'equipped'];
  const UNIQUE_KEYS = ['is_unique', 'unique'];
  const TYPE_KEYS = ['type', 'item_type', 'slot'];
  const ITEMCODE_KEYS = ['itemcode', 'item_code'];
  const RUNE_ITEMCODES = new Set([18, 19, 20, 21, 22, 23]);

  let dumped = false;
  let lastScan = 0;
  let lastSummary = 0;

  function cfg() { return Storage.section('autosell') || {}; }

  // Type-agnostic member read: the server may tag a number i4/int/double or
  // even string; try the numeric path first, then any tagged text.
  function member(struct, names) {
    for (const n of names) {
      const num = Api.findNum(struct, n);
      if (num != null) return num;
      for (const t of ['boolean', 'string', 'i4']) {
        const v = Api.findValue(struct, n, t);
        if (v != null) return v;
      }
    }
    return null;
  }
  const truthy = (v) => v != null && /^(1|true)$/i.test(String(v));

  Scheduler.register({
    id: 'autosell',
    priority: 8,
    async tick() {
      const c = cfg();
      if (!c.enabled || !Api.ready()) return null;
      if (!c.sellCommon && !c.sellSpecial) return null;     // nothing to do
      if (Date.now() - lastScan < 60000) return null;

      return async () => {
        lastScan = Date.now();
        const doc = await Api.getEquipment();
        // An item struct is one whose subtree carries an id and a type (the
        // exact nesting differs between server revisions, so don't require
        // them as direct children). Then keep only the INNERMOST matches:
        // that drops the outer response struct, which would otherwise alias
        // its first item's fields and act as a phantom entry.
        const matching = Array.from(doc.querySelectorAll('struct'))
          .filter((s) => member(s, ID_KEYS) != null && member(s, TYPE_KEYS) != null);
        const structs = matching.filter((s) => !matching.some((o) => o !== s && s.contains(o)));
        if (!structs.length) { Logger.warn('autosell: no items parsed'); return; }

        if (!dumped && c.dumpSchema) {
          dumped = true;
          const names = Array.from(structs[0].querySelectorAll(':scope > member > name')).map((n) => n.textContent);
          Logger.info(I18n.t('logSellSchema', [String(structs.length), names.join(', ')]));
        }

        // Count every skip reason so a fruitless scan can explain itself in
        // the log instead of silently doing nothing.
        const skip = { notEquip: 0, equipped: 0, rarity: 0, noId: 0 };
        for (const s of structs) {
          const code = Number(member(s, ITEMCODE_KEYS));
          if (Number.isFinite(code) && RUNE_ITEMCODES.has(code)) { skip.notEquip++; continue; }  // rune/stone
          const type = Number(member(s, TYPE_KEYS));
          if (!Number.isFinite(type) || type < 1 || type > 8) { skip.notEquip++; continue; }     // not equipment (potions etc.)
          if (truthy(member(s, EQUIP_FLAG_KEYS))) { skip.equipped++; continue; }                 // never sell equipped

          const unique = truthy(member(s, UNIQUE_KEYS));                    // epic / T1+ if true
          if (unique && !c.sellSpecial) { skip.rarity++; continue; }       // protect epics unless allowed
          if (!unique && !c.sellCommon) { skip.rarity++; continue; }       // commons disabled

          const id = Number(member(s, ID_KEYS));
          if (!Number.isFinite(id)) { skip.noId++; continue; }
          const xpos = Number(member(s, XPOS_KEYS) || 0);
          const value = Number(member(s, VALUE_KEYS)) || 0;
          const rarity = unique ? I18n.t('rarityEpic') : I18n.t('rarityCommon');

          Logger.info(I18n.t('logSell', [rarity, String(id), String(value)]));
          await Api.sellItem(id, xpos);
          Stats.bump({ itemsSold: 1, goldEarned: value });
          return; // one sale per cycle, then re-scan
        }
        if (Date.now() - lastSummary > 300000) {
          lastSummary = Date.now();
          Logger.info(I18n.t('logSellScanSummary', [
            String(structs.length), String(skip.notEquip), String(skip.equipped), String(skip.rarity + skip.noId)
          ]));
        }
      };
    }
  });
})();
