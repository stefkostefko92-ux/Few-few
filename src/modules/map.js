/**
 * Map module (verified: GetMapDetails / StartLiberation, plus
 * StartIllusionCave / StartDragon).
 *
 * The world map's "encounters" (срещи) are Liberation battles: GetMapDetails
 * returns `energy` (the X/X encounters left) and a list of `monsters`, each at
 * a map `location` slot with `stars` (>=1 = available to fight). This module
 * auto-clears the available encounters one per cycle (optionally buying energy),
 * limited to a chosen set of location slots, and also runs the Cave (Dungeon of
 * Illusions) and Dragon events on a slower timer.
 */
(function () {
  'use strict';
  const TB = window.TanothBot;
  const { Api, Storage, Stats, Logger, I18n, Scheduler } = TB;

  // Named map fields (from the Tanoth wiki), in map-slot order. Used so the
  // settings page can offer location names; index = location slot.
  const LOCATIONS = [
    'Forest of the Hanged Men', 'Forest of the Hanged Men — Rat',
    'Swamp of the Forgotten', 'Swamp of the Forgotten — Old Ruins', 'Swamp of the Forgotten — Goblin',
    'Sea of Dunes', 'Sea of Dunes — Large Forge', 'Sea of Dunes — Ocr', 'Sea of Dunes — Giant Rat',
    'Old Shore', 'Old Shore — Hell Wolf', 'Old Shore — Scorpion', "Old Shore — Sanctum of Shal'ah",
    'Lowlands of Thun', 'Frozen Peaks', 'Dragon Lair', 'Forgotten Crypt'
  ];
  TB.MapLocations = LOCATIONS;

  let encounterCooldown = 0;
  let eventNextAt = 0;
  let eventTurn = 0;

  function cfg() { return Storage.section('map') || {}; }

  // Allowed location slots: empty list = all. Accepts numbers or names.
  function allowedSlots(c) {
    const raw = String(c.locations || '').split(/[\n,;]+/).map((t) => t.trim()).filter(Boolean);
    if (!raw.length) return null; // null = allow all
    const set = new Set();
    raw.forEach((t) => {
      const n = parseInt(t, 10);
      if (Number.isInteger(n)) { set.add(n); return; }
      const idx = LOCATIONS.findIndex((name) => name.toLowerCase().includes(t.toLowerCase()));
      if (idx >= 0) set.add(idx);
    });
    return set;
  }

  Scheduler.register({
    id: 'map',
    priority: 68,
    async tick() {
      const c = cfg();
      if (!c.enabled || !Api.ready()) return null;

      // 1) Liberation encounters (instant, interleave freely).
      if (c.encounters && Date.now() >= encounterCooldown) {
        return async () => {
          let doc = await Api.getMapDetails();
          let map = Api.parseMap(doc);
          if (!map.monsters.length) { doc = await Api.getLiberationDetails(); map = Api.parseMap(doc); }

          const allow = allowedSlots(c);
          const avail = map.monsters.filter((m) => m.stars >= 1 && (!allow || allow.has(m.location)));

          if ((map.energy == null || map.energy > 0) && avail.length) {
            const m = avail[0];
            const label = LOCATIONS[m.location] || ('#' + m.location);
            Logger.info(I18n.t('logMapEncounter', [label, String(map.energy != null ? map.energy : '?')]));
            await Api.startLiberation(m.location);
            Stats.bump({ encounters: 1 });
            encounterCooldown = Date.now() + 4000; // keep clearing
            return;
          }
          if (map.energy != null && map.energy <= 0 && c.buyEnergy) {
            Logger.info(I18n.t('logMapBuyEnergy'));
            try { await Api.buyLiberationEnergy(); encounterCooldown = Date.now() + 3000; }
            catch (e) { encounterCooldown = Date.now() + 30 * 60000; }
            return;
          }
          // Nothing available right now — re-check later.
          encounterCooldown = Date.now() + 20 * 60000;
          Logger.debug('map: no encounters available' + (map.energy != null ? ` (energy ${map.energy})` : ''));
        };
      }

      // 2) Cave / Dragon events on a slower timer.
      if (Date.now() >= eventNextAt) {
        const acts = [];
        if (c.illusionCave) acts.push('cave');
        if (c.dragon) acts.push('dragon');
        if (!acts.length) return null;
        const pick = acts[eventTurn % acts.length];
        eventTurn++;
        return async () => {
          eventNextAt = Date.now() + Math.max(2, Number(c.cooldownMinutes) || 10) * 60000;
          try {
            if (pick === 'cave') {
              const d = await Api.getCaveDetails();
              Logger.info(I18n.t('logCaveStart', [String(Api.findValue(d, 'reward_gold', 'i4') ?? '?')]));
              await Api.startIllusionCave(); Stats.bump({ caveRuns: 1 });
            } else {
              const d = await Api.getDragonDetails();
              Logger.info(I18n.t('logDragonStart', [String(Api.findValue(d, 'reward_gold', 'i4') ?? '?')]));
              await Api.startDragon(); Stats.bump({ dragonRuns: 1 });
            }
          } catch (e) {
            Logger.warn(I18n.t('logMapUnavailable', [pick, e.message]));
          }
        };
      }
      return null;
    }
  });
})();
