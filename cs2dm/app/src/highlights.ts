/**
 * Хайлайтите на мача (CONTRACT §13) — чиста логика върху убийствата между хора от таблицата `kills`
 * в прозореца на мача. Нищо тук не чете базата; тестовите стойности са в `tests/highlights.test.ts`.
 */

/** Серия: следващото убийство е най-много толкова след предишното и стрелецът не е умирал междувременно. */
export const MULTI_KILL_GAP_MS = 10_000;
/** От колко убийства в серия нататък е хайлайт (3K, 4K, 5K+). */
export const MULTI_KILL_MIN = 3;
/** Единица в играта = 1 инч (Source) → метри. */
export const METERS_PER_UNIT = 0.0254;

export interface KillEvent {
  at: Date;
  attackerId: string | null;
  victimId: string;
  weapon: string;
  headshot: boolean;
  wallbang: boolean;
  noscope: boolean;
  throughSmoke: boolean;
  attackerBlind: boolean;
  ax: number;
  ay: number;
  az: number;
  vx: number;
  vy: number;
  vz: number;
}

export interface MultiKill {
  steamId: string;
  kills: number;
  /** От началото на мача до първото убийство в серията. */
  offsetMs: number;
  /** Оръжията в серията, без повторения, в реда на употреба. */
  weapons: string[];
}

export const MOMENT_KINDS = ['noscope', 'wallbang', 'smoke', 'blind'] as const;
export type MomentKind = (typeof MOMENT_KINDS)[number];

export interface Collection {
  kind: MomentKind;
  count: number;
  /** Кой го е правил най-често (равенство → по-ранният); при count = 0 няма такъв ред. */
  leader: string;
  leaderCount: number;
}

export interface LongestKill {
  steamId: string;
  weapon: string;
  meters: number;
  offsetMs: number;
}

/** Разстоянието стрелец → жертва в метри (от позициите — полето `distance` на събитието не ползваме). */
export function killMeters(kill: Pick<KillEvent, 'ax' | 'ay' | 'az' | 'vx' | 'vy' | 'vz'>): number {
  const dx = kill.ax - kill.vx;
  const dy = kill.ay - kill.vy;
  const dz = kill.az - kill.vz;
  const units = Math.sqrt(dx * dx + dy * dy + dz * dz);
  return Number.isFinite(units) ? units * METERS_PER_UNIT : 0;
}

const byTime = (a: KillEvent, b: KillEvent) => a.at.getTime() - b.at.getTime();

interface Run {
  kills: number;
  first: number;
  last: number;
  weapons: string[];
}

/**
 * Сериите от поне 3 убийства: всяко следващо до 10 s след предишното, без смърт на стрелеца между тях
 * (смъртта и голямата пауза затварят серията). Най-дългите първи, после по време.
 */
export function multiKills(events: ReadonlyArray<KillEvent>, startedAt: Date): MultiKill[] {
  const out: MultiKill[] = [];
  const runs = new Map<string, Run>();
  const close = (steamId: string) => {
    const run = runs.get(steamId);
    runs.delete(steamId);
    if (run && run.kills >= MULTI_KILL_MIN) {
      out.push({
        steamId,
        kills: run.kills,
        offsetMs: Math.max(0, run.first - startedAt.getTime()),
        weapons: run.weapons,
      });
    }
  };
  for (const event of [...events].sort(byTime)) {
    const at = event.at.getTime();
    const attacker = event.attackerId;
    if (attacker && attacker !== event.victimId) {
      const run = runs.get(attacker);
      if (run && at - run.last <= MULTI_KILL_GAP_MS) {
        run.kills += 1;
        run.last = at;
        if (!run.weapons.includes(event.weapon)) run.weapons.push(event.weapon);
      } else {
        close(attacker);
        runs.set(attacker, { kills: 1, first: at, last: at, weapons: [event.weapon] });
      }
    }
    close(event.victimId);
  }
  for (const steamId of [...runs.keys()]) close(steamId);
  return out.sort((a, b) => b.kills - a.kills || a.offsetMs - b.offsetMs);
}

function isKind(event: KillEvent, kind: MomentKind): boolean {
  switch (kind) {
    case 'noscope':
      return event.noscope;
    case 'wallbang':
      return event.wallbang;
    case 'smoke':
      return event.throughSmoke;
    case 'blind':
      return event.attackerBlind;
  }
}

/** „Колекцията“: колко noscope/през стена/през дим/заслепен убийства и кой ги е правил най-често. */
export function collections(events: ReadonlyArray<KillEvent>): Collection[] {
  const sorted = [...events].sort(byTime);
  const out: Collection[] = [];
  for (const kind of MOMENT_KINDS) {
    const counts = new Map<string, number>();
    let count = 0;
    for (const event of sorted) {
      if (!event.attackerId || !isKind(event, kind)) continue;
      count += 1;
      counts.set(event.attackerId, (counts.get(event.attackerId) ?? 0) + 1);
    }
    if (count === 0) continue;
    // Map пази реда на първото появяване → при равенство печели по-ранният.
    let leader = '';
    let leaderCount = 0;
    for (const [steamId, n] of counts) {
      if (n > leaderCount) {
        leader = steamId;
        leaderCount = n;
      }
    }
    out.push({ kind, count, leader, leaderCount });
  }
  return out;
}

/** Най-далечното убийство в мача (равенство → по-ранното). */
export function longestKill(events: ReadonlyArray<KillEvent>, startedAt: Date): LongestKill | null {
  let best: LongestKill | null = null;
  for (const event of [...events].sort(byTime)) {
    if (!event.attackerId) continue;
    const meters = killMeters(event);
    if (best === null || meters > best.meters) {
      best = {
        steamId: event.attackerId,
        weapon: event.weapon,
        meters,
        offsetMs: Math.max(0, event.at.getTime() - startedAt.getTime()),
      };
    }
  }
  return best;
}

/** Отместване от началото на мача: „7:05“, а над час — „1:02:03“. */
export function formatOffset(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}
