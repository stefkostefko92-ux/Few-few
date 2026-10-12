// Отметки → спомени: чистите функции (без браузър). node test/bookmarks-unit.mjs
import { urlWords, bookmarkText, flattenTree, planSync } from '../src/lib/bookmarks.js';
import { makeChecker } from './lib.mjs';

const { check, finish } = makeChecker();
const urlKeyOf = (url) => {
  const u = new URL(url);
  u.hash = '';
  return u.href.replace(/\/$/, '');
};

// --- думите от адреса ---
check(
  'urlWords: домейн без www/TLD + думите от пътя',
  urlWords('https://www.seriouseats.com/recipes/vegan-lentil-soup.html') ===
    'seriouseats recipes vegan lentil soup',
);
check(
  'urlWords: числа, хешове и index отпадат',
  urlWords('https://example.org/2024/05/a1b2c3/index.php') === 'example',
);
check(
  'urlWords: кирилица в пътя се декодира',
  urlWords('https://bg.wikipedia.org/wiki/Натриево-йонна_батерия') ===
    'bg wikipedia wiki Натриево йонна батерия',
);
check('urlWords: невалиден адрес → празно', urlWords('не е адрес') === '');
check(
  'bookmarkText: заглавие. папка. думи',
  bookmarkText({ title: 'Леща', folder: 'Рецепти › Супи', url: 'https://x.com/lentil-soup' }) ===
    'Леща. Рецепти › Супи. x lentil soup',
);

// --- дървото ---
const tree = [
  {
    id: '0',
    title: '',
    children: [
      {
        id: '1',
        parentId: '0',
        title: 'Лента с отметки',
        children: [
          { id: '10', parentId: '1', title: 'Batteries', url: 'https://a.com/bat/', dateAdded: 5 },
          {
            id: '11',
            parentId: '1',
            title: 'Рецепти',
            children: [
              {
                id: '12',
                parentId: '11',
                title: 'Супи',
                children: [
                  {
                    id: '13',
                    parentId: '12',
                    title: 'Леща',
                    url: 'https://b.com/soup',
                    dateAdded: 7,
                  },
                ],
              },
              {
                id: '14',
                parentId: '11',
                title: 'Bank',
                url: 'https://mybank.com/x',
                dateAdded: 1,
              },
              { id: '15', parentId: '11', title: 'JS', url: 'javascript:alert(1)', dateAdded: 1 },
            ],
          },
        ],
      },
      {
        id: '2',
        parentId: '0',
        title: 'Други',
        children: [
          // същата страница втори път, по-нова → печели тази
          {
            id: '20',
            parentId: '2',
            title: 'Batteries 2',
            url: 'https://a.com/bat#top',
            dateAdded: 9,
          },
        ],
      },
    ],
  },
];
const flat = flattenTree(tree, { urlKeyOf, allowed: (u) => !u.includes('mybank') });
check('flattenTree: само http(s), без забранените', flat.size === 2);
check(
  'flattenTree: корените не влизат в пътя',
  flat.get('https://b.com/soup')?.folder === 'Рецепти › Супи',
);
check(
  'flattenTree: дубликат → един спомен, най-новият',
  flat.get('https://a.com/bat')?.title === 'Batteries 2' &&
    flat.get('https://a.com/bat')?.folder === '',
);

// --- планът ---
const pages = [
  { urlKey: 'https://a.com/bat', kind: 'bookmark', title: 'Batteries', bookmark: { folder: '' } }, // заглавието се смени → index
  { urlKey: 'https://b.com/soup', title: 'Lentil soup — full', bookmark: { folder: 'Стара' } }, // прочетена, папката се смени → mark
  { urlKey: 'https://gone.com', kind: 'bookmark', title: 'X', bookmark: { folder: '' } }, // отметката я няма → remove
  { urlKey: 'https://read.com', title: 'Read', bookmark: { folder: '' } }, // прочетена, вече не е отметка → unmark
  { urlKey: 'https://plain.com', title: 'Plain' }, // нищо общо с отметки
];
const plan = planSync(flat, pages);
check(
  'planSync: сменено заглавие → преучва',
  plan.index.map((b) => b.urlKey).join() === 'https://a.com/bat',
);
check(
  'planSync: прочетена страница → само знак (текстът остава)',
  plan.mark[0]?.urlKey === 'https://b.com/soup',
);
check('planSync: изчезнала отметка → забравя', plan.remove.join() === 'https://gone.com');
check(
  'planSync: прочетена, вече не-отметка → маха знака',
  plan.unmark.join() === 'https://read.com',
);
const skipped = planSync(flat, [], new Set(['https://a.com/bat']));
check('planSync: забравените не се връщат', skipped.index.length === 1);
const stable = planSync(flat, [
  { urlKey: 'https://a.com/bat', kind: 'bookmark', title: 'Batteries 2', bookmark: { folder: '' } },
  { urlKey: 'https://b.com/soup', title: 'Full', bookmark: { folder: 'Рецепти › Супи' } },
]);
check(
  'planSync: без промени → нищо за правене (повторният синхрон е евтин)',
  !stable.index.length && !stable.mark.length && !stable.unmark.length && !stable.remove.length,
);

finish();
