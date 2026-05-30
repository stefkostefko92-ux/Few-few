/**
 * Runes module — upgrades runes and sells duplicates/low-rarity ones.
 */
(function () {
  'use strict';
  const TB = window.TanothBot;
  const { Api, State, Storage, Stats, Logger, I18n, Scheduler } = TB;

  const RARITY = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
  let lastCheck = 0;
  function cfg() { return Storage.section('runes') || {}; }
  const rank = (r) => RARITY.indexOf(String(r || 'common').toLowerCase());

  Scheduler.register({
    id: 'runes',
    priority: 15,
    async tick() {
      const c = cfg();
      if (!c.enabled) return null;
      const st = State.get();

      if (!st.runes.length || Date.now() - lastCheck > 180000) {
        return async () => { lastCheck = Date.now(); await Api.call('getRunes'); };
      }

      if (c.autoUpgrade) {
        const upgradable = st.runes.find((r) => r.canUpgrade || r.upgradeable);
        if (upgradable) {
          return async () => {
            Logger.info(I18n.t('logRuneUpgrade', [upgradable.name || String(upgradable.id)]));
            await Api.call('upgradeRune', { id: upgradable.id, runeId: upgradable.id });
            Stats.bump({ runesUpgraded: 1 });
            lastCheck = 0;
          };
        }
      }

      if (c.autoSellDuplicates) {
        const minKeep = rank(c.minRarityToKeep);
        const sellable = st.runes.find((r) => (r.duplicate || rank(r.rarity) < minKeep));
        if (sellable) {
          return async () => {
            Logger.info(I18n.t('logRuneSell', [sellable.name || String(sellable.id)]));
            await Api.call('sellRune', { id: sellable.id, runeId: sellable.id });
            Stats.bump({ itemsSold: 1 });
            State.patch({ runes: st.runes.filter((r) => r.id !== sellable.id) });
          };
        }
      }
      return null;
    }
  });
})();
