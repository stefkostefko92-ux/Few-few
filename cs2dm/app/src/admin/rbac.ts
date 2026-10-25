import type { PunishmentType, Role } from '@prisma/client';

/**
 * Правата в панела — CONTRACT.md §1. Числата на нивата са същите като в C# (`Roles.cs`).
 *
 * Тълкуване на таблицата: колоната „В играта“ важи и за действията от панела (kick, mute, бан…
 * от уеб са същите действия), а колоната „В панела“ добавя възможностите, които ги има само в
 * панела (доклади, обжалвания, режими, VIP, админи, рестарт). Immunity важи навсякъде: действие
 * върху цел с ниво ≥ своето е отказано — значи и върху себе си.
 */
export const ROLE_LEVEL: Record<Role, number> = {
  PLAYER: 1,
  VIP: 2,
  HELPER: 3,
  MODERATOR: 4,
  ADMIN: 5,
  HEADADMIN: 6,
  OWNER: 7,
};

export const ROLES = Object.keys(ROLE_LEVEL) as Role[];

/** Достъп до панела: роля ≥ HELPER (§10). */
export const PANEL_MIN_ROLE: Role = 'HELPER';

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && Object.hasOwn(ROLE_LEVEL, value);
}

export function atLeast(role: Role, minimum: Role): boolean {
  return ROLE_LEVEL[role] >= ROLE_LEVEL[minimum];
}

export function canEnterPanel(role: Role): boolean {
  return atLeast(role, PANEL_MIN_ROLE);
}

/** Immunity: само върху цел с по-ниско ниво. Собственикът не се пипа (никой не е над него). */
export function outranks(actor: Role, target: Role): boolean {
  return ROLE_LEVEL[actor] > ROLE_LEVEL[target];
}

/** Възможностите на панела и минималната роля за всяка. */
export const CAPABILITIES = {
  /** Табло, статус, онлайн играчи, вътрешният списък с наказания, играчи, доклади (четене). */
  panel: 'HELPER',
  /** Решаване на доклади (§1: MODERATOR — „доклади“). */
  reportsHandle: 'MODERATOR',
  /** Обжалвания — преглед и решение. */
  appeals: 'MODERATOR',
  /** Съобщение до всички (`say`). */
  say: 'MODERATOR',
  /** Смяна на DM режима (`mode`). */
  mode: 'ADMIN',
  /** Събития по график (CONTRACT §12) — като смяната на режим: ADMIN+. */
  events: 'ADMIN',
  /** VIP: ръчно даване/отнемане и нивата (цени). */
  vip: 'ADMIN',
  /** Лични данни: IP адресите на сесиите и скриването от класациите (чл. 21 GDPR). */
  privacy: 'ADMIN',
  /** Статус и логове на сървъра през агента (§9). */
  serverRead: 'ADMIN',
  /** „Подозрителни играчи“ — само за човешки преглед, без автоматично решение (чл. 22 GDPR). */
  flags: 'ADMIN',
  /** Рестарт и ъпдейт на сървъра. */
  serverControl: 'HEADADMIN',
  /** Плъгините от каталога (CONTRACT §14): списък, инсталиране/премахване, пускане/спиране, конфиг. */
  plugins: 'HEADADMIN',
  /** Роли до ниво 5 (само под своята) и нулиране на TOTP на по-нисък админ. */
  roles: 'HEADADMIN',
  /** Банерите в картата — като `!banner` в играта. */
  banners: 'HEADADMIN',
  /** Одит-веригата. */
  audit: 'HEADADMIN',
  /** Живите настройки на сървъра (CONTRACT §11): реклами, патрони, ботове, XP множител, поздрав. */
  settings: 'HEADADMIN',
  /** Всичко пазено за играч (четене) и ръчна редакция/нулиране на статистиките му (§3, епоха). */
  playerData: 'HEADADMIN',
} as const satisfies Record<string, Role>;

export type Capability = keyof typeof CAPABILITIES;

export function can(role: Role, capability: Capability): boolean {
  return atLeast(role, CAPABILITIES[capability]);
}

/** Действията върху играч от панела. */
export const PUNISH_TYPES = ['KICK', 'WARN', 'MUTE', 'GAG', 'SILENCE', 'BAN'] as const;
export type PanelPunishType = (typeof PUNISH_TYPES)[number];

const DAY_MS = 24 * 60 * 60 * 1000;
/** Модераторът бани до 7 дни включително; над това и „завинаги“ — ADMIN (като `Roles.BanAction`). */
export const MODERATOR_MAX_BAN_MS = 7 * DAY_MS;
/** Таван на срока — 10 години, като в C# (`Durations.TryParse`). */
export const MAX_DURATION_MS = 3650 * DAY_MS;

/**
 * Минималната роля за наказание. `durationMs` е null за „завинаги“; KICK и WARN нямат срок.
 */
export function minRoleToPunish(type: PanelPunishType, durationMs: number | null): Role {
  switch (type) {
    case 'KICK':
    case 'WARN':
    case 'MUTE':
    case 'GAG':
      return 'HELPER';
    case 'SILENCE':
      return 'MODERATOR';
    case 'BAN':
      return durationMs !== null && durationMs <= MODERATOR_MAX_BAN_MS ? 'MODERATOR' : 'ADMIN';
  }
}

/** Отмяна: бан — само ADMIN+ („unban“); останалото — колкото и налагането (без срока). */
export function minRoleToRevoke(type: PunishmentType): Role {
  switch (type) {
    case 'BAN':
      return 'ADMIN';
    case 'SILENCE':
      return 'MODERATOR';
    default:
      return 'HELPER';
  }
}

/** `slay` — ADMIN+ (§1). */
export const SLAY_MIN_ROLE: Role = 'ADMIN';

export type Denial = 'role' | 'immunity';

/** Една проверка за всяко действие върху цел: първо правото, после immunity. */
export function checkTargetAction(actor: Role, minimum: Role, target: Role): Denial | null {
  if (!atLeast(actor, minimum)) return 'role';
  if (!outranks(actor, target)) return 'immunity';
  return null;
}

/**
 * Ролите, които `actor` може да дава: само под своята, без VIP (VIP идва от `vip_grants`, не от
 * ролята — §1) и без OWNER. Изисква и възможността `roles`.
 */
export function assignableRoles(actor: Role): Role[] {
  if (!can(actor, 'roles')) return [];
  return ROLES.filter((role) => role !== 'VIP' && role !== 'OWNER' && outranks(actor, role));
}

export function canChangeRole(actor: Role, target: Role, next: Role): Denial | null {
  if (!can(actor, 'roles')) return 'role';
  if (!outranks(actor, target)) return 'immunity';
  if (!assignableRoles(actor).includes(next)) return 'role';
  return null;
}
