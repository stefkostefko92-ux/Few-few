// Листът „Важни телефони“ (/pechat) трябва да излезе на ЕДИН лист A4. На
// хартия редовете са в две колони; дългото име се пренася на 2–3 реда и
// заема повече място. Тук е сметката колко номера се събират и кога листът
// минава на по-сбит шрифт. Числата са измерени с page.pdf() и pdfinfo
// (виж коментарите при константите) — при промяна на листа се мерят пак.

/**
 * На колко реда се пренася името на хартия: пренасяне по думи при ~24 знака
 * на ред (измерено: при всички 26 номера в базата съвпада точно с реалните
 * височини; реално редът е ~26–28 знака, т.е. сметката е с резерв).
 */
export function nameLines(name: string, width = 24): number {
  let lines = 1;
  let cur = 0;
  for (const word of name.trim().split(/\s+/)) {
    if (!word) continue;
    if (cur === 0) cur = word.length;
    else if (cur + 1 + word.length <= width) cur += 1 + word.length;
    else {
      lines += 1;
      cur = word.length;
    }
  }
  return lines;
}

/**
 * Височината на реда в „единици“: едноредов номер = 1, всеки следващ ред от
 * името добавя ~0,65 (на хартия: 29 px, 47 px, 67 px).
 */
export function rowUnits(name: string): number {
  return 1 + 0.65 * (nameLines(name) - 1);
}

/** Заглавието на група („Ток и вода“) — с резерв (реално ~1 ед.; в сбития шрифт ~1,4). */
export const HEADING_UNITS = 1.5;
/**
 * До толкова единици листът е с обикновения шрифт (12 pt). Измерено с
 * page.pdf() (кратки, дълги имена, нова група): най-малкото, което вече дава
 * 2 листа, е 45,55 ед. Сегашните 26 номера в базата — 42,6.
 */
export const NORMAL_UNITS = 43.5;
/**
 * До толкова единици влизат в сбития шрифт (11 pt, без отстъп между
 * редовете). Измерено: най-малкото, което дава 2 листа, е 50,6 ед. Над
 * DENSE_UNITS следващият номер отпада (и всички след него).
 */
export const DENSE_UNITS = 49;

export type PhoneGroup<T> = { title: string; items: T[] };

/**
 * Взима номерата по реда на групите (спешните и здравето първи), докато се
 * събират на един лист. Отпадат последните („Други“ първо). `dense` — листът
 * е над обикновения капацитет и на хартия се печата по-сбито.
 */
export function fitPhoneSheet<T extends { name: string }>(groups: PhoneGroup<T>[]) {
  let units = 0;
  let count = 0;
  let full = false;
  const out: PhoneGroup<T>[] = [];
  for (const g of groups) {
    if (full) break;
    const items: T[] = [];
    for (const it of g.items) {
      // Първият номер на групата носи и заглавието ѝ.
      const u = rowUnits(it.name) + (items.length === 0 ? HEADING_UNITS : 0);
      if (units + u > DENSE_UNITS) {
        full = true;
        break;
      }
      items.push(it);
      units += u;
      count += 1;
    }
    if (items.length > 0) out.push({ title: g.title, items });
  }
  const total = groups.reduce((n, g) => n + g.items.length, 0);
  return { groups: out, shown: count, cut: total - count, dense: units > NORMAL_UNITS, units };
}
