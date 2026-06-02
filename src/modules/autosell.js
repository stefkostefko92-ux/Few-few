/**
 * Auto-sell module (verified call: SellItem(id, char_id|0, itemXpos)).
 *
 * Sells ONLY equipment, and by rarity:
 *   - Common (normal) items  -> sold when `sellCommon` is on (default).
 *   - Unique / epic (T1+)    -> protected; sold ONLY when `sellSpecial` is on.
 * Runes/stones (itemcode 18-23) and non-equipment (e.g. potions, type not 1-8)
 * are never sold, and equipped items are never sold.
 *
 * Item fields are the real ones from the game client's GetEquipment payload:
 *   id, is_equipped, is_unique, type (1-8 = equipment slot), itemcode,
 *   sellvalue, screen_x (bag x position). On first scan it logs the field names
 *   for verification. Disabled by default.
 */
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

  function cfg() { return Storage.section('autosell') || {}; }

  function member(struct, names) {
    for (const n of names) {
      let v = Api.findValue(struct, n, 'i4');
      if (v != null) return v;
      v = Api.findValue(struct, n, 'boolean');
      if (v != null) return v;
      v = Api.findValue(struct, n, 'string');
      if (v != null) return v;
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
        const structs = Array.from(doc.querySelectorAll('struct'))
          .filter((s) => member(s, ID_KEYS) != null && member(s, TYPE_KEYS) != null);
        if (!structs.length) { Logger.debug('autosell: no items parsed'); return; }

        if (!dumped) {
          dumped = true;
          const names = Array.from(structs[0].querySelectorAll(':scope > member > name')).map((n) => n.textContent);
          Logger.info(I18n.t('logSellSchema', [String(structs.length), names.join(', ')]));
        }

        for (const s of structs) {
          const code = Number(member(s, ITEMCODE_KEYS));
          if (Number.isFinite(code) && RUNE_ITEMCODES.has(code)) continue;  // rune/stone
          const type = Number(member(s, TYPE_KEYS));
          if (!Number.isFinite(type) || type < 1 || type > 8) continue;     // not equipment (potions etc.)
          if (truthy(member(s, EQUIP_FLAG_KEYS))) continue;                 // never sell equipped

          const unique = truthy(member(s, UNIQUE_KEYS));                    // epic / T1+ if true
          if (unique && !c.sellSpecial) continue;                          // protect epics unless allowed
          if (!unique && !c.sellCommon) continue;                          // commons disabled

          const id = Number(member(s, ID_KEYS));
          if (!Number.isFinite(id)) continue;
          const xpos = Number(member(s, XPOS_KEYS) || 0);
          const value = Number(member(s, VALUE_KEYS)) || 0;
          const rarity = unique ? I18n.t('rarityEpic') : I18n.t('rarityCommon');

          Logger.info(I18n.t('logSell', [rarity, String(id), String(value)]));
          await Api.sellItem(id, xpos);
          Stats.bump({ itemsSold: 1, goldEarned: value });
          return; // one sale per cycle, then re-scan
        }
      };
    }
  });
})();
