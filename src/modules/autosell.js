/**
 * Auto-sell module — clears junk from the inventory according to rarity and
 * type filters, while protecting potions, gear upgrades and high-rarity loot
 * the player asked to keep.
 */
(function () {
  'use strict';
  const TB = window.TanothBot;
  const { Api, State, Storage, Stats, Logger, I18n, Scheduler } = TB;

  const RARITY = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
  const rank = (r) => RARITY.indexOf(String(r || 'common').toLowerCase());
  function cfg() { return Storage.section('autosell') || {}; }

  function sellable(item, c) {
    const keep = rank(c.keepRarity);
    if (rank(item.rarity) >= keep) return false;            // too good to sell
    if (item.type === 'potion' && !c.sellPotions) return false;
    if (item.type === 'rune' && !c.sellRunes) return false;
    if (item.unique && !c.sellUnique) return false;
    if (!item.unique && item.rarity === 'common' && !c.sellCommon) return false;
    if (c.keepEquippableUpgrades && item.isUpgrade) return false;
    return true;
  }

  Scheduler.register({
    id: 'autosell',
    priority: 10,
    async tick() {
      const c = cfg();
      if (!c.enabled) return null;
      const st = State.get();
      if (!st.inventory.length) return null;

      const target = st.inventory.find((i) => sellable(i, c));
      if (!target) return null;

      return async () => {
        Logger.info(I18n.t('logSell', [target.name || String(target.id), String(target.value || 0)]));
        await Api.call('sellItem', { id: target.id, itemId: target.id });
        Stats.bump({ itemsSold: 1, goldEarned: target.value || 0 });
        State.patch({ inventory: st.inventory.filter((i) => i.id !== target.id) });
      };
    }
  });
})();
