// Отметки → спомени: чисти функции (без chrome.*), за да се тестват отделно.
// Déjà НЕ отваря страниците от отметките — учи само заглавие + папка + думите
// в адреса. Пълният текст идва чак когато потребителят наистина прочете страницата.

const MAX_TEXT = 320;

// Думите от адреса носят смисъл („/recipes/vegan-lentil-soup“) — домейнът без
// www/TLD + сегментите на пътя, разделени по -_/. Числа и хешове отпадат.
export function urlWords(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return '';
  }
  const host = u.hostname
    .replace(/^www\./, '')
    .split('.')
    .slice(0, -1)
    .join(' ');
  let path = u.pathname;
  try {
    path = decodeURIComponent(path);
  } catch {
    /* счупено кодиране — ползваме суровия път */
  }
  const words = path
    .split(/[/\-_.+]+/)
    .filter((w) => /^\p{L}{3,}$/u.test(w) && !/^(html?|php|aspx?|index)$/i.test(w));
  return [host, ...words].join(' ').trim();
}

// Текстът, който моделът вижда за една отметка.
export function bookmarkText({ title, folder, url }) {
  const parts = [title, folder, urlWords(url)].filter(Boolean);
  return parts.join('. ').slice(0, MAX_TEXT);
}

// Дървото на chrome.bookmarks → Map urlKey → { url, title, folder, time }.
// Пътят на папката пропуска корените („Лента с отметки“ и т.н. — шум, не смисъл).
// Дубликати (една страница в няколко папки) → един спомен с най-новата дата.
export function flattenTree(tree, { urlKeyOf, allowed }) {
  const out = new Map();
  const walk = (node, trail, depth) => {
    if (node.url) {
      if (!/^https?:\/\//.test(node.url) || !allowed(node.url)) return;
      let urlKey;
      try {
        urlKey = urlKeyOf(node.url);
      } catch {
        return;
      }
      const item = {
        url: node.url,
        urlKey,
        title: (node.title || '').trim() || urlKey,
        folder: trail.join(' › '),
        time: node.dateAdded || 0,
      };
      const prev = out.get(urlKey);
      if (!prev || item.time > prev.time) out.set(urlKey, item);
      return;
    }
    // коренът (дълбочина 0) и контейнерите под него (лента/други/мобилни — 1)
    // не влизат в пътя; по дълбочина, защото ID-тата им са различни в Chrome и Firefox
    const next = depth < 2 || !node.title ? trail : [...trail, node.title];
    for (const child of node.children || []) walk(child, next, depth + 1);
  };
  for (const root of tree) walk(root, [], 0);
  return out;
}

// Кое трябва да се направи, за да съвпаднат паметта и отметките.
//   index  — нови/променени отметки без прочетена страница → учим заглавието
//   mark   — прочетена страница, която е и отметка → само знак (текстът остава)
//   unmark — прочетена страница, вече не е отметка → махаме знака
//   remove — спомен само-от-отметка, чиято отметка изчезна → забравяме
export function planSync(bookmarks, pages, skip = new Set()) {
  const byKey = new Map(pages.map((p) => [p.urlKey, p]));
  const plan = { index: [], mark: [], unmark: [], remove: [] };
  for (const bm of bookmarks.values()) {
    if (skip.has(bm.urlKey)) continue;
    const page = byKey.get(bm.urlKey);
    if (!page) plan.index.push(bm);
    else if (page.kind === 'bookmark') {
      if (page.title !== bm.title || page.bookmark?.folder !== bm.folder) plan.index.push(bm);
    } else if (page.bookmark?.folder !== bm.folder) plan.mark.push(bm);
  }
  for (const page of pages) {
    if (!page.bookmark) continue;
    const alive = bookmarks.has(page.urlKey) && !skip.has(page.urlKey);
    if (alive) continue;
    if (page.kind === 'bookmark') plan.remove.push(page.urlKey);
    else plan.unmark.push(page.urlKey);
  }
  return plan;
}
