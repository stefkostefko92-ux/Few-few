/**
 * Auto-sell module (verified call: SellItem(id, char_id|0, itemXpos)).
 *
 * The game client stores items as dynamic objects (fields copied via
 * reflection), so the value/quality field name isn't guaranteed across servers.
 * To stay safe this module:
 *   1. On first scan, logs the actual item field names + a sample item, so the
 *      mapping can be verified ("autosell: item fields = …").
 *   2. Sells ONLY unequipped items whose detected sell value is at or below the
 *      configured `maxValue` gold. With maxValue = 0 (default) it inspects only
 *      and sells nothing — you opt in by raising the threshold.
 * Disabled by default.
 */
(function () {
  'use strict';
  const TB = window.TanothBot;
  const { Api, Storage, Stats, Logger, Scheduler, I18n } = TB;

  const ID_KEYS = ['id', 'item_id', 'itemId'];
  const XPOS_KEYS = ['pos_x', 'x_pos', 'x', 'itemXpos', 'item_x'];
  const VALUE_KEYS = ['sell_price', 'sell_value', 'value', 'worth', 'price', 'gold', 'market_value'];
  const EQUIP_KEYS = ['is_equipped', 'equipped', 'in_use'];

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

        if (!structs.length) { Logger.debug('autosell: no items parsed from GetEquipment'); return; }

        if ((c.dumpSchema || !dumped) && !dumped) {
          dumped = true;
          const names = Array.from(structs[0].querySelectorAll(':scope > member > name')).map((n) => n.textContent);
          Logger.info(I18n.t('logSellSchema', [String(structs.length), names.join(', ')]));
        }

        const maxValue = Number(c.maxValue) || 0;
        if (maxValue <= 0) return; // inspect-only / safe default

        for (const s of structs) {
          const eq = member(s, EQUIP_KEYS);
          if (eq != null && /1|true/i.test(String(eq))) continue; // never sell equipped
          const valueRaw = member(s, VALUE_KEYS);
          const value = Number(valueRaw);
          if (!Number.isFinite(value)) continue;                 // unknown value → skip
          if (value > maxValue) continue;                        // too valuable
          const id = Number(member(s, ID_KEYS));
          const xpos = Number(member(s, XPOS_KEYS) || 0);
          if (!Number.isFinite(id)) continue;

          Logger.info(I18n.t('logSell', [String(id), String(value)]));
          await Api.sellItem(id, xpos);
          Stats.bump({ itemsSold: 1, goldEarned: value });
          return; // one sale per cycle, then re-scan next cycle
        }
      };
    }
  });
})();
