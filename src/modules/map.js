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

  // Map regions in canonical (in-game) order; index = region used for slot
  // attribution. The player sets their own PRIORITY order in settings.
  const REGIONS = [
    "Dragon's Claw Mountains", 'Oblivion Gorge', 'Gloomforest',
    'Blackwater Marshes', 'Bonelands', 'Island of Secrets'
  ];
  TB.MapRegions = REGIONS;

  let encounterCooldown = 0;
  let eventNextAt = 0;
  let eventTurn = 0;

  function cfg() { return Storage.section('map') || {}; }

  // Parse the priority list -> [{name, idx}] in priority order (enabled only).
  function priorityRegions(c) {
    const names = String(c.regions || '').split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);
    const out = [];
    names.forEach((nm) => {
      const idx = REGIONS.findIndex((r) => r.toLowerCase() === nm.toLowerCase());
      if (idx >= 0 && !out.some((o) => o.idx === idx)) out.push({ name: REGIONS[idx], idx });
    });
    return out.length ? out : REGIONS.map((name, idx) => ({ name, idx }));
  }

  // Best-effort attribution of a map slot to a region (slots grouped in order).
  function regionOfSlot(slot, maxSlot) {
    if (maxSlot < 0) return 0;
    return Math.min(REGIONS.length - 1, Math.floor((slot * REGIONS.length) / (maxSlot + 1)));
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

          const prio = priorityRegions(c);
          const rank = new Map(prio.map((r, i) => [r.idx, i])); // region idx -> priority position
          const maxSlot = map.monsters.reduce((mx, m) => Math.max(mx, m.location), -1);
          const avail = map.monsters
            .filter((m) => m.stars >= 1)
            .map((m) => Object.assign({}, m, { region: regionOfSlot(m.location, maxSlot) }))
            .filter((m) => rank.has(m.region))           // only enabled regions
            .sort((a, b) => rank.get(a.region) - rank.get(b.region)); // highest priority first

          if ((map.energy == null || map.energy > 0) && avail.length) {
            const m = avail[0];
            const label = REGIONS[m.region] || ('#' + m.location);
            Logger.info(I18n.t('logMapEncounter', [label, String(map.energy != null ? map.energy : '?')]));
            await Api.startLiberation(m.location);
            Stats.bump({ encounters: 1 });
            encounterCooldown = 0; // keep clearing; the scheduler paces (or spams)
            return;
          }
          if (map.energy != null && map.energy <= 0 && c.buyEnergy) {
            Logger.info(I18n.t('logMapBuyEnergy'));
            try { await Api.buyLiberationEnergy(); encounterCooldown = 0; }
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
