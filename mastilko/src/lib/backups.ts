// Резервни копия на проекта, преди да бъде заменен от споделен линк.
//
// Защо до ТРИ, а не едно: с едно място вторият линк изтриваше копието на
// първия. Потребителят отваря линк А (копие = неговото CV), после линк Б
// (копие = А) — и CV-то изчезва завинаги. Три стигат за реалния случай
// „пратиха ми два линка“, без да трупат лични данни в браузъра без край.
//
// Чиста логика върху интерфейс Storage, за да се тества без браузър.

export interface Backup {
  /** Кога е направено копието (ISO). */
  at: string;
  /** Проектът като JSON низ — точно това, което useLocalState пази. */
  data: string;
}

export const MAX_BACKUPS = 3;

/** Събитие в `window`, когато се добави копие (detail = ключът на проекта). */
export const BACKUPS_EVENT = "mastilko-backups";

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function backupKey(key: string): string {
  return `${key}-preshare`;
}

/** Чете копията. Съвместимо със стария формат (един гол низ). */
export function readBackups(storage: Store, key: string): Backup[] {
  let raw: string | null = null;
  try {
    raw = storage.getItem(backupKey(key));
  } catch {
    return [];
  }
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed
        .filter(
          (b): b is Backup =>
            typeof b === "object" && b !== null && typeof (b as Backup).at === "string" && typeof (b as Backup).data === "string",
        )
        .slice(0, MAX_BACKUPS);
    }
    // Стар формат: самият проект като обект, записан директно.
    if (typeof parsed === "object" && parsed !== null) {
      return [{ at: "", data: raw }];
    }
  } catch {
    /* повреден запис → няма копия */
  }
  return [];
}

function write(storage: Store, key: string, list: Backup[]): void {
  if (list.length === 0) storage.removeItem(backupKey(key));
  else storage.setItem(backupKey(key), JSON.stringify(list.slice(0, MAX_BACKUPS)));
}

/** Добавя копие най-отпред. Същото като най-новото не се дублира. */
export function pushBackup(storage: Store, key: string, data: string, now: Date = new Date()): void {
  const list = readBackups(storage, key);
  if (list[0]?.data === data) return;
  write(storage, key, [{ at: now.toISOString(), data }, ...list]);
}

/** Маха копие по индекс и го връща (или null). */
export function takeBackup(storage: Store, key: string, index: number): Backup | null {
  const list = readBackups(storage, key);
  const [taken] = list.splice(index, 1);
  if (!taken) return null;
  write(storage, key, list);
  return taken;
}
