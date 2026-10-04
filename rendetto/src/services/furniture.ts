import { engine, type Spec, type TypeParam } from './engine.js';

/**
 * Видовете мебели за екраните. Двигателят пази имената на групите на български; тук те стават ключове
 * за превода (`furniture.group.<ключ>`), а името на всеки вид е `furniture.<id>`. Размерите идват от
 * формата на двигателя, за да не се разминават с това, което редакторът позволява.
 */
export type FurnitureGroup = 'kitchen' | 'bedroom' | 'living' | 'other';

const GROUP_KEY: Record<string, FurnitureGroup> = {
  'Кухня и шкафове': 'kitchen',
  Спалня: 'bedroom',
  'Хол и кабинет': 'living',
};

function furnitureGroup(type: string): FurnitureGroup {
  return GROUP_KEY[engine().typeGroups[type] ?? ''] ?? 'other';
}

export type FurnitureRange =
  | { kind: 'width'; min: number; max: number }
  | { kind: 'modules'; min: number; max: number; widthMin: number; widthMax: number }
  | { kind: 'mattress'; min: number; max: number };

function range(params: readonly TypeParam[], key: string): { min: number; max: number } | null {
  const param = params.find((p) => p.key === key);
  if (!param) return null;
  if (typeof param.min === 'number' && typeof param.max === 'number')
    return { min: param.min, max: param.max };
  const values = (param.options ?? [])
    .map(([value]) => value)
    .filter((value): value is number => typeof value === 'number');
  return values.length ? { min: Math.min(...values), max: Math.max(...values) } : null;
}

function furnitureRange(type: string): FurnitureRange | null {
  const params = engine().typeParams[type] ?? [];
  const modules = range(params, 'modules');
  const moduleWidth = range(params, 'moduleWidth');
  if (modules && moduleWidth) {
    return {
      kind: 'modules',
      min: modules.min,
      max: modules.max,
      widthMin: moduleWidth.min,
      widthMax: moduleWidth.max,
    };
  }
  const mattress = range(params, 'mattressW');
  if (mattress) return { kind: 'mattress', min: mattress.min / 10, max: mattress.max / 10 };
  const width = range(params, 'width');
  return width ? { kind: 'width', ...width } : null;
}

export interface FurnitureKind {
  id: string;
  group: FurnitureGroup;
  range: FurnitureRange | null;
}

/** Всички видове в реда на двигателя, с групата и диапазона на размера. */
export function furnitureKinds(): FurnitureKind[] {
  return engine().typeOrder.map((id) => ({
    id,
    group: furnitureGroup(id),
    range: furnitureRange(id),
  }));
}

/** Видовете, подредени по групи — за витрината и за избора на вид при нов проект. */
export function furnitureByGroup(): Array<{ group: FurnitureGroup; kinds: FurnitureKind[] }> {
  const groups: Array<{ group: FurnitureGroup; kinds: FurnitureKind[] }> = [];
  for (const kind of furnitureKinds()) {
    const last = groups.at(-1);
    if (last && last.group === kind.group) last.kinds.push(kind);
    else groups.push({ group: kind.group, kinds: [kind] });
  }
  return groups;
}

/**
 * Габаритът като текст без думи, за да се чете еднакво на всеки език. Числата са същите като в заглавната
 * лента на редактора и в рамката на чертежа (горен шкаф — собствената му височина, не ръбът над пода).
 */
export function dimensionsText(type: string, spec: Spec): string {
  const d = engine().typeDims(type, spec);
  const round = (value: number) => Math.round(value * 10) / 10;
  return type === 'bed'
    ? `${round(d.W)} × ${round(d.D)} mm`
    : `${round(d.W)} × ${round(d.H)} × ${round(d.D)} mm`;
}
