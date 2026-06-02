/**
 * Auto-sell module (verified call: SellItem(id, char_id|0, itemXpos)).
 *
 * Sells ONLY actual equipment — never runes/stones, never potions. Equipment is
 * identified positively from the verified client classification:
 *   - equipment slot types are item_type 1–8 (amulet, armor, boots, gloves,
 *     helmet, ring, shield, weapon);
 *   - runes/stones have itemcode 18–23 (is_rune) and are excluded;
 *   - anything without an equipment slot type (e.g. potions) is excluded.
 * It also never sells an equipped item and only sells at/below the configured
 * gold value (maxValue; 0 = inspect-only). On first scan it logs the real item
 * field names so the mapping can be verified. Disabled by default.
 */
(function () {
  'use strict';
  const TB = window.TanothBot;
  const { Api, Storage, Stats, Logger, Scheduler, I18n } = TB;

  const ID_KEYS = ['id', 'item_id', 'itemId'];
  const XPOS_KEYS = ['pos_x', 'x_pos', 'x', 'itemXpos', 'item_x'];
  const VALUE_KEYS = ['sell_price', 'sell_value', 'value', 'worth', 'price', 'gold', 'market_value'];
  const EQUIP_FLAG_KEYS = ['is_equipped', 'equipped', 'in_use'];
  const TYPE_KEYS = ['item_type', 'itemtype', 'type', 'slot'];
  const ITEMCODE_KEYS = ['itemcode', 'item_code'];
  const RUNE_FLAG_KEYS = ['is_rune'];
  const RUNE_ITEMCODES = new Set([18, 19, 20, 21, 22, 23]);

  let dumped = false;
  let lastScan = 0;

  function cfg() { return Storage.section('autosell') || {}; }

  function member(struct, names) {
    for (const n of names) {
      let v = Api.findValue(struct, n, 'i4');
      if (v != null) return v;
      v = Api.findValue(struct, n, 'string');
      if (v != null) return v;
      v = Api.findValue(struct, n, 'boolean');
      if (v != null) return v;
    }
    return null;
  }

  // Positive equipment test: must have an equipment slot type 1-8 and not be a rune.
  function isSellableEquipment(struct) {
    const runeFlag = member(struct, RUNE_FLAG_KEYS);
    if (runeFlag != null && /1|true/i.test(String(runeFlag))) return false;
    const code = Number(member(struct, ITEMCODE_KEYS));
    if (Number.isFinite(code) && RUNE_ITEMCODES.has(code)) return false;
    const type = Number(member(struct, TYPE_KEYS));
    if (!Number.isFinite(type) || type < 1 || type > 8) return false; // not an equipment slot
    return true;
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
          .filter((s) => member(s, ID_KEYS) != null);
        if (!structs.length) { Logger.debug('autosell: no items parsed'); return; }

        if (!dumped) {
          dumped = true;
          const names = Array.from(structs[0].querySelectorAll(':scope > member > name')).map((n) => n.textContent);
          Logger.info(I18n.t('logSellSchema', [String(structs.length), names.join(', ')]));
        }

        const maxValue = Number(c.maxValue) || 0;
        if (maxValue <= 0) return; // inspect-only / safe default

        for (const s of structs) {
          if (!isSellableEquipment(s)) continue;            // equipment only
          const eq = member(s, EQUIP_FLAG_KEYS);
          if (eq != null && /1|true/i.test(String(eq))) continue; // never sell equipped
          const value = Number(member(s, VALUE_KEYS));
          if (!Number.isFinite(value) || value > maxValue) continue;
          const id = Number(member(s, ID_KEYS));
          const xpos = Number(member(s, XPOS_KEYS) || 0);
          if (!Number.isFinite(id)) continue;

          Logger.info(I18n.t('logSell', [String(id), String(value)]));
          await Api.sellItem(id, xpos);
          Stats.bump({ itemsSold: 1, goldEarned: value });
          return; // one sale per cycle
        }
      };
    }
  });
})();
