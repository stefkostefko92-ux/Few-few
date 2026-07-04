/**
 * Scheduler / activity presets (shared ES module, also unit-tested).
 *
 * A preset is a function that mutates a (cloned) settings object to a sensible
 * configuration, so users can one-click a play style instead of toggling a
 * dozen options. Presets only change fields they care about.
 */

export const PRESET_IDS = ['daily', 'grind', 'overnight', 'safe'];

export const PRESETS = {
  // Just the daily chores: adventures, dungeon, map encounters, circle. Calm pace.
  daily(s) {
    s.general.enabled = true; s.general.humanize = true;
    s.adventures.enabled = true; s.adventures.useBloodstones = false;
    s.dungeon.enabled = true;
    s.map.enabled = true; s.map.encounters = true; s.map.buyEnergy = false;
    s.circle.enabled = true;
    s.training.enabled = false; s.work.enabled = false; s.pvp.enabled = false; s.autosell.enabled = false;
  },
  // Everything on, fast, spend gold on circle + training.
  grind(s) {
    s.general.enabled = true; s.general.humanize = false;
    s.adventures.enabled = true;
    s.dungeon.enabled = true;
    s.map.enabled = true; s.map.encounters = true;
    s.pvp.enabled = true;
    s.circle.enabled = true; s.training.enabled = true;
    s.autosell.enabled = true; s.autosell.sellCommon = true; s.autosell.sellSpecial = false;
    s.work.enabled = false;
  },
  // Long unattended sessions: work shifts fill the gaps, humanized, breaks on.
  overnight(s) {
    s.general.enabled = true; s.general.humanize = true;
    s.adventures.enabled = true;
    s.work.enabled = true; s.work.durationHours = 8; s.work.stopWhenAdventureReady = true;
    s.dungeon.enabled = true; s.map.enabled = true; s.circle.enabled = true;
    s.pvp.enabled = false;
    s.scheduler.enabled = true; s.scheduler.randomBreaks = true;
  },
  // Conservative: only safe, free activities; never spends bloodstones; slow.
  safe(s) {
    s.general.enabled = true; s.general.humanize = true;
    s.general.minActionDelayMs = 3000; s.general.maxActionDelayMs = 8000;
    s.adventures.enabled = true; s.adventures.useBloodstones = false;
    s.circle.enabled = true; s.circle.currency = 'gold';
    s.dungeon.enabled = true;
    s.map.enabled = true; s.map.encounters = true; s.map.buyEnergy = false;
    s.pvp.enabled = false; s.pvp.useBloodstones = false;
    s.work.enabled = false; s.training.enabled = false; s.autosell.enabled = false;
    s.scheduler.randomBreaks = false;
  }
};

export function applyPreset(settings, id) {
  const out = structuredClone(settings);
  const fn = PRESETS[id];
  if (fn) fn(out);
  return out;
}
