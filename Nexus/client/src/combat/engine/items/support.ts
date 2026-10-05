// Решава КАК изглежда предметът във въртящия се преглед (ItemViewer3DHost) — решетката
// (инвентар/пазар/сетове) вече е изцяло на старата рисувана икона за всеки слот (виж Sprite.tsx),
// смесването на два стила в една решетка изглеждаше разнородно. 3D живее само тук, в прегледа:
//
//   'standalone' — самостоятелен предмет (шлем/ръкавица/щит/оръжие), както преди.
//   'mannequin'  — облечен на рицарски манекен (нагръдник+наплечници/наколенник+сабатон/наметало
//                  сами по себе си четяха се като „делва"/двусмислено извън тяло — виж историята
//                  в git log-а на този файл).
//   'icon'       — boy няма геометрия ЗА ТОЗИ КОНКРЕТЕН предмет → голяма стара икона в прегледа,
//                  честно, без 3D.
//
// Пазено в синхрон само тук (един файл, четен от buildItem.ts/mannequin.ts/ItemViewer3DHost.tsx).
import type { CatalogEntry } from './theme';

export type PreviewMode = 'standalone' | 'mannequin' | 'icon';

const STANDALONE_WEAPON_ICONS = new Set(['sword', 'dagger', 'staff', 'bow', 'mace']);
/** Тонки боздугани/жезли (`staff`/`bow`) също се диагонализират в прегледа — вижте
 *  ItemViewer3DHost.tsx tiltDeg. */
export const DIAGONAL_WEAPON_ICONS = STANDALONE_WEAPON_ICONS;

// boy моделира само ДВА затворени стоманени шлема (great helm / hounskull bascinet) — качулка,
// маска, диадема, качулка-качулка, корона, шапка нямат представяне там. Имената в каталога
// разграничават: „Cloth Hood“, „Nightveil Cowl“, „Trial Crown“, „Cutpurse Mask“ и т.н. не са
// затворени бойни шлемове — слагането им на greatHelm/hounskull геометрия е подвеждащо (вижте
// прегледа: „cloth_hood“ излизаше като метален рицарски шлем).
const NOT_A_CLOSED_HELM = /\b(hood|cowl|circlet|crown|cap|veil|mask|diadem|coif)\b/i;

export function previewMode(entry: Pick<CatalogEntry, 'category' | 'icon' | 'sub_type' | 'name'>): PreviewMode {
  switch (entry.category) {
    case 'ring':
    case 'amulet':
      return 'icon';
    case 'weapon':
      return STANDALONE_WEAPON_ICONS.has(entry.icon || entry.sub_type || 'sword') ? 'standalone' : 'icon';
    case 'helm':
      return NOT_A_CLOSED_HELM.test(entry.name) ? 'icon' : 'standalone';
    case 'gloves':
    case 'shield':
      return 'standalone';
    case 'armor':
    case 'boots':
    case 'cloak':
      return 'mannequin';
    default:
      return 'icon';
  }
}

/** Обратно съвместим булев гейт (bake скриптове/тестове преди искаха само да/не) — сега значи
 *  „има ли изобщо 3D тук, независимо дали standalone или mannequin". */
export function supports3DIcon(entry: Pick<CatalogEntry, 'category' | 'icon' | 'sub_type' | 'name'>): boolean {
  return previewMode(entry) !== 'icon';
}
