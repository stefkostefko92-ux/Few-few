// Map: liberation encounters in region-priority order, plus cave and dragon.
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
  // After map acts it steps aside for a few scheduler cycles so lower priority
  // modules (training, circle, autosell, ...) are not starved while map works
  // through a batch of encounters. The scheduler runs one action per cycle by
  // priority, so without this a module that re-arms every cycle wins forever.
  let stepAside = 0;
  const STEP_ASIDE = 4;

  function cfg() { return Storage.section('map') || {}; }

  function fmtDur(ms) {
    const s = Math.max(0, Math.round(ms / 1000));
    if (s >= 3600) return Math.floor(s / 3600) + 'h ' + Math.floor((s % 3600) / 60) + 'm';
    if (s >= 60) return Math.floor(s / 60) + 'm ' + (s % 60) + 's';
    return s + 's';
  }

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

  // Map slot -> region. The game client has 18 fixed slots, 3 per territory:
  // configData[Math.floor(i / 3)].zones[i % 3]. Scaling by the highest
  // VISIBLE slot (the old approach) put e.g. slot 3 into region 4 instead of 1.
  function regionOfSlot(slot) {
    return Math.max(0, Math.min(REGIONS.length - 1, Math.floor(slot / 3)));
  }

  Scheduler.register({
    id: 'map',
    priority: 68,
    async tick() {
      const c = cfg();
      if (!c.enabled || !Api.ready()) return null;

      // Yield to lower-priority modules for a few cycles after we act.
      if (stepAside > 0) {
        stepAside--;
        Scheduler.wakeAt(Date.now() + 1500); // come back soon even if all idle
        return null;
      }

      // 1) Liberation encounters (instant, interleave freely).
      if (c.encounters && Date.now() >= encounterCooldown) {
        return async () => {
          let doc = await Api.getMapDetails();
          let map = Api.parseMap(doc);
          if (!map.monsters.length) { doc = await Api.getLiberationDetails(); map = Api.parseMap(doc); }

          const prio = priorityRegions(c);
          const rank = new Map(prio.map((r, i) => [r.idx, i])); // region idx -> priority position
          const avail = map.monsters
            .filter((m) => m.stars >= 1)
            .map((m) => Object.assign({}, m, { region: regionOfSlot(m.location) }))
            .filter((m) => rank.has(m.region))           // only enabled regions
            .sort((a, b) => rank.get(a.region) - rank.get(b.region)); // highest priority first

          if ((map.energy == null || map.energy > 0) && avail.length) {
            const m = avail[0];
            const label = REGIONS[m.region] || ('#' + m.location);
            Logger.info(I18n.t('logMapEncounter', [label, String(map.energy != null ? map.energy : '?')]));
            try {
              await Api.startLiberation(m.location);
            } catch (e) {
              // A server fault (map not unlocked yet, encounter gone, ...) must
              // not be retried every cycle - three in a row would stop the engine.
              encounterCooldown = Date.now() + 5 * 60000;
              throw e;
            }
            Stats.bump({ encounters: 1 });
            encounterCooldown = 0;       // more encounters may remain to clear
            stepAside = STEP_ASIDE;      // but let other modules run in between
            return;
          }
          if (map.energy != null && map.energy <= 0 && c.buyEnergy) {
            // Energy is bought with BLOODSTONES (the game's top-up shows
            // energy_cost in bloodstones). Never try without any left.
            await Api.miniUpdate();
            if ((Number(TB.State.get().bloodstones) || 0) <= 0) {
              encounterCooldown = Date.now() + 30 * 60000;
              return;
            }
            Logger.info(I18n.t('logMapBuyEnergy'));
            try { await Api.buyLiberationEnergy(); encounterCooldown = 0; stepAside = STEP_ASIDE; }
            catch (e) { encounterCooldown = Date.now() + 30 * 60000; }
            return;
          }
          // Nothing to fight right now - wait the real regen cooldown the game
          // reports (next_attack is an epoch-second timestamp), so we don't poll.
          const nextMs = (map.nextAttack && map.nextAttack > 0) ? map.nextAttack * 1000 - Date.now() : 0;
          const waitMs = nextMs > 0 ? nextMs + 1000 : 20 * 60000;
          encounterCooldown = Date.now() + waitMs;
          Logger.info(I18n.t('logMapNext', [fmtDur(waitMs), String(map.energy != null ? map.energy : '?')]));
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
          stepAside = STEP_ASIDE;
          try {
            // Both details carry a top-level bloodstone_cost: the game charges
            // that many bloodstones to start. The bot only does free runs.
            const paid = (d) => (Api.directNum ? Api.directNum(d, 'bloodstone_cost') : null) || 0;
            if (pick === 'cave') {
              const d = await Api.getCaveDetails();
              if (paid(d) > 0) { Logger.info(I18n.t('logMapPaidSkip', [I18n.t('opt_map_illusionCave'), String(paid(d))])); return; }
              Logger.info(I18n.t('logCaveStart', [String(Api.findValue(d, 'reward_gold', 'i4') ?? '?')]));
              await Api.startIllusionCave(); Stats.bump({ caveRuns: 1 });
              // Cave/dragon run on a timer (illusion_duration): pick it up so
              // the other modules wait instead of firing into a busy hero.
              try { await Api.miniUpdate(); } catch (_) {}
            } else {
              const d = await Api.getDragonDetails();
              if (paid(d) > 0) { Logger.info(I18n.t('logMapPaidSkip', [I18n.t('opt_map_dragon'), String(paid(d))])); return; }
              Logger.info(I18n.t('logDragonStart', [String(Api.findValue(d, 'reward_gold', 'i4') ?? '?')]));
              await Api.startDragon(); Stats.bump({ dragonRuns: 1 });
              try { await Api.miniUpdate(); } catch (_) {}
            }
          } catch (e) {
            Logger.warn(I18n.t('logMapUnavailable', [pick, e.message]));
          }
        };
      }

      // Waiting on cooldowns - ask the scheduler to wake us exactly when the
      // earliest one ends, so encounters resend the moment regen completes.
      const waits = [];
      if (c.encounters && encounterCooldown > Date.now()) waits.push(encounterCooldown);
      if ((c.illusionCave || c.dragon) && eventNextAt > Date.now()) waits.push(eventNextAt);
      if (waits.length) Scheduler.wakeAt(Math.min.apply(null, waits));
      return null;
    }
  });
})();
