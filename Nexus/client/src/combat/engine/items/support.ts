// Кои слотове реално се бият от новата 3D геометрия на boy (виж buildItem.ts). Всичко останало
// СЪЗНАТЕЛНО остава на старата HD снимка (client/public/assets/icons/) — boy не рисува пръстени/
// амулети изобщо, а брадвата/копието нямат боен силует в него (само меч/кама/жезъл/лък/боздуган).
// Пазено в синхрон РЪЧНО с bake-item-icons.mjs (Node скрипт, не може да internal import-не .ts) —
// buildItem.test.js гейтва двете чрез `всеки слот строи/скача коректно` тестовете.
import type { CatalogEntry } from './theme';

const SUPPORTED_WEAPON_ICONS = new Set(['sword', 'dagger', 'staff', 'bow', 'mace']);

export function supports3DIcon(entry: Pick<CatalogEntry, 'category' | 'icon' | 'sub_type'>): boolean {
  switch (entry.category) {
    case 'ring':
    case 'amulet':
      // boy не моделира бижута изобщо — старият процедурен генератор ги рисуваше като „кръг от
      // халки" (отхвърлено при преглед); няма по-добра 3D алтернатива, стария JPG остава.
      return false;
    case 'armor':
      // Нагръдник+наплечници (buildChest+buildPauldron) стои изолирано без тяло вътре и чете се
      // като „делва/урна", не като броня — виж бележката в ВРАТА ЗА КАЧЕСТВО (задачата).
      // Старата JPG икона остава по-четлива на малък размер; boy пак се използва за живата битка.
      return false;
    case 'boots':
      // Наколенник+сабатон (buildShin+buildFoot) изолирано чете се двусмислено (коляното прилича
      // на глава/уши, стъпалото се губи под камерата) — старата JPG икона е по-ясен ботуш.
      return false;
    case 'cloak':
      // Cape (cloth.js) settle-ната симулация ляга плоско/усукано — четлива като плат, но НЕ
      // недвусмислено като „наметало" на 256px; старата драпирана JPG икона печели.
      return false;
    case 'weapon':
      return SUPPORTED_WEAPON_ICONS.has(entry.icon || entry.sub_type || 'sword');
    default:
      return true; // shield, helm, gloves
  }
}
