// The updates of the portal (the owner, 10 November 2026: "Fai una pagina sul nostro sito web con tutte
// queste cose. Al primo accesso di ogni utente dopo ogni aggiornamento fai uscire messaggio popup con
// descrizione degli aggiornamenti fatti dal suo ultimo accesso"): one list of entries, its words in the
// dictionary; an entry is published when a portal that knows it first runs (a new installation: on the
// entry's own day); a person sees in the popup what was published after their last reading; the public
// page /novita with its feed, sitemap, robots, llms.txt and structured data.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

process.env.PUBLIC_BASE_URL ??= 'https://rilievi.example.test';
process.env.DATABASE_URL ??= 'postgresql://unused@127.0.0.1:1/unused';
process.env.JWT_SECRET ??= 'a'.repeat(64);
process.env.INTERVENTI_SEAL_KEY ??= 'b'.repeat(64);

const { VOCI, ULTIMO_AGGIORNAMENTO, MAX_POPUP, daRegistrare, inizioGiorno, nonLette, perGiorno } =
  await import('../src/novita/voci.js');
const { vociAttive } = await import('../src/novita/attive.js');
// What this portal announces: an entry about something that must be switched on (the sign-in with Microsoft or
// Google) is left out where it is not (the audit of 12 November 2026).
const ATTIVE = vociAttive();
const { llmsTxt, robotsTxt, sitemapXml } = await import('../src/seo/files.js');
const { novitaRss } = await import('../src/seo/feed.js');
const { FEED_NOVITA_PATH, NOVITA_PATH, PUBLIC_PATHS } = await import('../src/seo/paths.js');
const { novitaStructuredData } = await import('../src/seo/structured-data.js');
const { translatorFor } = await import('../src/i18n.js');

const BASE = 'https://rilievi.example.test';
const t = translatorFor('it');
const CYRILLIC = /[Ѐ-ӿ]/;

describe('the entries', () => {
  it('have a unique id that starts with their day, newest first, the latest day is the update day', () => {
    const ids = VOCI.map((v) => v.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const voce of VOCI) {
      assert.match(voce.id, /^\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/, voce.id);
      assert.ok(voce.id.startsWith(`${voce.data}-`), voce.id);
      assert.equal(inizioGiorno(voce.data).toISOString().slice(0, 10), voce.data, voce.id);
    }
    for (let i = 1; i < VOCI.length; i += 1)
      assert.ok(VOCI[i - 1]!.data >= VOCI[i]!.data, VOCI[i]!.id);
    assert.equal(ULTIMO_AGGIORNAMENTO, VOCI[0]!.data);
  });

  it('carry their area, title and text in the dictionary, and the dictionary has no other entry', () => {
    for (const voce of VOCI) {
      for (const part of ['area', 'titolo', 'testo']) {
        const key = `novita.voci.${voce.id}.${part}`;
        const text = t(key);
        assert.notEqual(text, key, key);
        assert.ok(text.trim().length > 2, key);
        assert.doesNotMatch(text, CYRILLIC, key);
        assert.doesNotMatch(text, /\{\w+\}/, key);
      }
      assert.ok(t(`novita.voci.${voce.id}.titolo`).length <= 70, voce.id);
    }
    const file = JSON.parse(
      readFileSync(join(import.meta.dirname, '..', 'locales', 'it', 'novita.json'), 'utf8'),
    ) as { novita: { voci: Record<string, unknown> } };
    assert.deepEqual(Object.keys(file.novita.voci).sort(), VOCI.map((v) => v.id).sort());
  });

  it('are grouped by day for the page, newest day first, in the order of the list', () => {
    const giorni = perGiorno(VOCI);
    assert.deepEqual(
      giorni.flatMap((g) => g.voci.map((v) => v.id)),
      VOCI.map((v) => v.id),
    );
    assert.equal(new Set(giorni.map((g) => g.data)).size, giorni.length);
  });
});

describe('the publication of an entry', () => {
  const ora = new Date('2026-11-20T09:30:00Z');

  it('on a new installation is the day of each entry: there is no update to announce', () => {
    const nuove = daRegistrare(new Set(), ora);
    assert.deepEqual(
      nuove.map((n) => [n.id, n.pubblicataAt.toISOString()]),
      VOCI.map((v) => [v.id, `${v.data}T00:00:00.000Z`]),
    );
  });

  it('after an update is the moment the portal first runs with it; the known ones stay', () => {
    const [nuova, ...note] = VOCI;
    assert.deepEqual(daRegistrare(new Set(note.map((v) => v.id)), ora), [
      { id: nuova!.id, pubblicataAt: ora },
    ]);
    assert.deepEqual(daRegistrare(new Set(VOCI.map((v) => v.id)), ora), []);
  });
});

describe('the popup', () => {
  const a = VOCI[0]!;
  const b = VOCI[1]!;
  const c = VOCI[2]!;

  it('shows what was published after the last reading, the latest first, and nothing else', () => {
    const pubblicate = new Map([
      [c.id, new Date('2026-11-04T00:00:00Z')],
      [b.id, new Date('2026-11-09T00:00:00Z')],
      [a.id, new Date('2026-11-12T08:00:00Z')],
      // published once, then taken out of the list: not shown
      ['2026-01-01-tolta', new Date('2026-11-12T08:00:00Z')],
    ]);
    assert.deepEqual(
      nonLette(pubblicate, new Date('2026-11-08T23:59:59Z')).map((v) => v.id),
      [a.id, b.id],
    );
    assert.deepEqual(nonLette(pubblicate, new Date('2026-11-12T08:00:00Z')), []);
    assert.deepEqual(
      nonLette(pubblicate, new Date('2026-11-01T00:00:00Z')).map((v) => v.id),
      [a.id, b.id, c.id],
    );
  });

  it('on the same moment keeps the order of the list', () => {
    const insieme = new Date('2026-11-12T08:00:00Z');
    const pubblicate = new Map(VOCI.map((v) => [v.id, insieme] as const));
    assert.deepEqual(
      nonLette(pubblicate, new Date('2026-11-01T00:00:00Z')).map((v) => v.id),
      VOCI.map((v) => v.id),
    );
    assert.ok(MAX_POPUP >= 3 && MAX_POPUP <= 8);
  });
});

describe('the page of the updates', () => {
  it('is public, crawled, in the sitemap with the day of the last update', () => {
    assert.equal(NOVITA_PATH, '/novita');
    assert.equal(FEED_NOVITA_PATH, '/novita.xml');
    assert.ok(PUBLIC_PATHS.includes(NOVITA_PATH));
    const robots = robotsTxt(BASE, 'abc123');
    assert.match(robots, /Allow: \/novita\$\n/);
    assert.match(robots, /Allow: \/novita\.xml\n/);
    const xml = sitemapXml(BASE);
    assert.match(
      xml,
      new RegExp(
        `<loc>${BASE}/novita</loc>\\n    <lastmod>${ULTIMO_AGGIORNAMENTO}</lastmod>\\n    <changefreq>weekly</changefreq>`,
      ),
    );
    const llms = llmsTxt(BASE, 'info@example.test');
    assert.ok(llms.includes(`](${BASE}/novita)`));
  });

  it('keeps title under 60 and description under 160 characters, with ≥5 keywords and the brand', () => {
    assert.ok(`${t('novita.meta.title')}`.length < 60);
    assert.ok(t('novita.meta.description').length < 160);
    const keywords = t('novita.meta.keywords')
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);
    assert.ok(keywords.length >= 5);
    assert.ok(keywords.includes('Carbon Stealth'));
  });

  it('does not announce what is not switched on on this portal', () => {
    const condizionate = VOCI.filter((v) => v.se !== undefined);
    assert.deepEqual(
      condizionate.map((v) => v.id),
      ['2026-11-12-accesso-microsoft-google'],
    );
    // No application registered with Microsoft or Google in the tests: the entry is not there, the rest is.
    assert.deepEqual(
      ATTIVE.map((v) => v.id),
      VOCI.filter((v) => v.se === undefined).map((v) => v.id),
    );
    assert.deepEqual(
      daRegistrare(new Set(), new Date(0), ATTIVE).map((r) => r.id),
      ATTIVE.map((v) => v.id),
    );
    const insieme = new Date('2026-11-12T12:00:00Z');
    const pubblicate = new Map(VOCI.map((v) => [v.id, insieme] as const));
    assert.ok(
      !nonLette(pubblicate, new Date(0), ATTIVE).some(
        (v) => v.id === '2026-11-12-accesso-microsoft-google',
      ),
    );
  });

  it('describes itself to the search engines: the page, the path to it and every entry', () => {
    const canonical = `${BASE}/novita`;
    const data = JSON.parse(novitaStructuredData(t, canonical)) as {
      '@graph': Array<Record<string, unknown>>;
    };
    const of = (type: string) =>
      data['@graph'].find((node) => [node['@type']].flat().includes(type))!;
    assert.equal(of('WebPage').dateModified, ULTIMO_AGGIORNAMENTO);
    assert.equal(of('WebPage').inLanguage, 'it-IT');
    const crumbs = of('BreadcrumbList').itemListElement as Array<{ name: string; item: string }>;
    assert.deepEqual(
      crumbs.map((c) => c.item),
      [`${BASE}/`, canonical],
    );
    const list = of('ItemList').itemListElement as Array<{
      position: number;
      name: string;
      url: string;
    }>;
    assert.deepEqual(
      list.map((item) => [item.position, item.name, item.url]),
      ATTIVE.map((v, i) => [i + 1, t(`novita.voci.${v.id}.titolo`), `${canonical}#${v.id}`]),
    );
    assert.doesNotMatch(JSON.stringify(data), CYRILLIC);
  });

  it('has a feed with one item for each entry, escaped, newest first', () => {
    const rss = novitaRss(BASE);
    assert.match(rss, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<rss version="2\.0"/);
    assert.match(rss, new RegExp(`<link>${BASE}/novita</link>`));
    assert.match(rss, new RegExp(`<atom:link href="${BASE}/novita\\.xml" rel="self"`));
    const items = [...rss.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]!);
    assert.equal(items.length, ATTIVE.length);
    items.forEach((item, i) => {
      const voce = ATTIVE[i]!;
      assert.match(item, new RegExp(`<guid isPermaLink="false">${voce.id}</guid>`));
      assert.match(item, new RegExp(`<link>${BASE}/novita#${voce.id}</link>`));
      assert.match(item, /<pubDate>\w{3}, \d{2} \w{3} \d{4} 00:00:00 GMT<\/pubDate>/);
    });
    assert.doesNotMatch(rss, /&(?!amp;|lt;|gt;|quot;|apos;|#\d+;)/);
    assert.doesNotMatch(rss, CYRILLIC);
  });
});
