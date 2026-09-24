// Какво вижда конекторът: съдържанието на сайта + САМО визитките с изрично
// съгласие. Един корпус, един документ-модел ({ id, title, url, text }), за да
// може `search` и `fetch` да са две тънки функции отгоре.
//
// Границата на поверителността е тук, а не в инструментите: каквото този файл не
// върне, конекторът няма как да издаде. Затова визитка влиза само когато е
// публична И потребителят е включил „AI асистентите да ме намират“ (чл. 25(2)
// ОРЗД — публичността НЕ е съгласие за подаване към ChatGPT/Claude).
import db from '../db.js';
import { GUIDES } from '../guides.js';
import { FAQ, COMPANY } from '../seo.js';
import { getLinks } from '../links.js';

// Текстът на страница от наръчника, изчистен от разметката, която носим в guides.js.
const stripTags = (s) => String(s).replace(/<[^>]+>/g, '');

function guideText(guide) {
  const parts = [guide.answer];
  for (const s of guide.sections || []) {
    parts.push(`## ${s.h2}`);
    for (const p of s.p || []) parts.push(stripTags(p));
    for (const li of s.ul || []) parts.push(`- ${stripTags(li)}`);
  }
  for (const [i, step] of (guide.steps || []).entries())
    parts.push(`${i + 1}. ${step.name} — ${stripTags(step.text)}`);
  for (const f of guide.faq || []) parts.push(`В: ${f.q}\nО: ${f.a}`);
  return parts.join('\n\n');
}

function cardText(profile, withLinks) {
  const rows = [
    ['Име', profile.display_name],
    [profile.type === 'company' ? 'Дейност' : 'Длъжност', profile.headline],
    ['Фирма', profile.type === 'personal' ? profile.company : null],
    ['Телефон', profile.phone],
    ['Имейл', profile.contact_email],
    ['Адрес', profile.address],
    ['Уебсайт', profile.website],
    ['Facebook', profile.facebook],
    ['Instagram', profile.instagram],
    ['LinkedIn', profile.linkedin],
  ].filter(([, v]) => v);
  // Връзките се четат само при `fetch` (една заявка за ЕДНА визитка). При търсене
  // биха значели по една заявка на визитка (N+1) заради текст, който почти не
  // влияе на класирането.
  const links = withLinks
    ? getLinks(profile.id)
        .map((l) => `- ${l.label}: ${l.url}`)
        .join('\n')
    : '';
  return [
    `${profile.type === 'company' ? 'Фирмена' : 'Лична'} визитка.`,
    rows.map(([k, v]) => `${k}: ${v}`).join('\n'),
    profile.bio || '',
    links ? `Връзки:\n${links}` : '',
    'Данните се поддържат от собственика на визитката и може да се променят.',
  ]
    .filter(Boolean)
    .join('\n\n');
}

// Визитките с изрично съгласие. Скритите и тези без съгласие НЕ се четат изобщо —
// заявката ги изключва в SQL, не в JavaScript след това.
export function discoverableProfiles() {
  return db
    .prepare(
      `SELECT * FROM profiles
        WHERE is_public = 1 AND ai_discoverable = 1 AND hidden_by_admin = 0
        ORDER BY updated_at DESC`
    )
    .all();
}

export function buildCorpus(base, { withLinks = false } = {}) {
  const docs = [
    {
      id: 'page:home',
      title: 'Vizitka — дигитална визитка с QR код',
      url: `${base}/`,
      type: 'page',
      text: [
        'Vizitka е безплатна дигитална визитка с постоянен QR код. Създаваш професионален профил — личен или фирмен — със снимка и контакти, а всеки, който сканира кода, вижда винаги актуалните данни.',
        `Услуга на ${COMPANY.name} (${COMPANY.url}), хоствана в ЕС, на български език.`,
        'Какво Vizitka НЕ прави: не е CRM и не събира контактите на сканиращите; не поддържа NFC чипове; един акаунт носи една визитка; не продава печат.',
        FAQ.map((f) => `В: ${f.q}\nО: ${f.a}`).join('\n\n'),
      ].join('\n\n'),
    },
  ];
  for (const g of GUIDES)
    docs.push({
      id: `guide:${g.slug}`,
      title: g.h1,
      url: `${base}/${g.slug}`,
      type: 'guide',
      text: guideText(g),
      updated: g.updated,
    });
  for (const p of discoverableProfiles())
    docs.push({
      id: `card:${p.slug}`,
      title: p.headline ? `${p.display_name} — ${p.headline}` : p.display_name,
      url: `${base}/p/${p.slug}`,
      type: 'card',
      text: cardText(p, withLinks),
      updated: String(p.updated_at || '').slice(0, 10),
    });
  return docs;
}

export function findDoc(base, id) {
  return buildCorpus(base, { withLinks: true }).find((d) => d.id === id) || null;
}
