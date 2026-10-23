/**
 * Версии на фърмуера и правилата за съвместимост (§8.2: „по-новият източник не е автоматично
 * по-добър — важи съвместимостта с продукта“). Сравнението е числово по сегменти:
 * 4.10.0 > 4.9.3, 4.2 == 4.2.0. Нечислов сегмент прави версията невалидна — тогава НЕ гадаем.
 */

const VERSION = /^\d+(\.\d+){0,3}$/;

export function isVersion(value: string): boolean {
  return VERSION.test(value.trim());
}

/** -1 / 0 / 1. Хвърля при невалидна версия — викащият решава какво значи „непозната“. */
export function compareVersions(a: string, b: string): number {
  if (!isVersion(a) || !isVersion(b)) throw new Error(`Невалидна версия: „${a}“ / „${b}“`);
  const pa = a.trim().split('.').map(Number);
  const pb = b.trim().split('.').map(Number);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

/** Правило за приложимост: всяко поле null = без ограничение по него. */
export interface ApplicabilityRule {
  hwRevision: string | null;
  fwMin: string | null;
  fwMax: string | null;
}

export interface ProductVersion {
  hwRevision: string | null;
  firmware: string | null;
}

/**
 * Приложим ли е източникът за конкретното табло. Непознат HW/FW при правило, което го иска,
 * значи „не е доказано приложим“ → false (fail-closed): по-добре да поискаме данните, отколкото
 * да цитираме ръководство за друга ревизия като основен източник (AC-02).
 */
export function isApplicable(rule: ApplicabilityRule, version: ProductVersion): boolean {
  if (rule.hwRevision !== null) {
    if (version.hwRevision === null) return false;
    if (normalizeRevision(rule.hwRevision) !== normalizeRevision(version.hwRevision)) return false;
  }
  if (rule.fwMin === null && rule.fwMax === null) return true;
  if (version.firmware === null || !isVersion(version.firmware)) return false;
  if (rule.fwMin !== null && compareVersions(version.firmware, rule.fwMin) < 0) return false;
  if (rule.fwMax !== null && compareVersions(version.firmware, rule.fwMax) > 0) return false;
  return true;
}

/** „Rev.B“, „rev b“, „B“ → „B“. */
export function normalizeRevision(value: string): string {
  return value
    .trim()
    .replace(/^rev\.?\s*/i, '')
    .toUpperCase();
}
